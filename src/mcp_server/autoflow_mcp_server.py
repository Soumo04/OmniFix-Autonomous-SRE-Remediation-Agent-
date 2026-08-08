"""
OmniFix — FastMCP Server
Exposes workflow execution as MCP tools, resources, and prompts.
External agents and LLMs connect to this server to automate workflows.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from mcp.server.fastmcp import FastMCP

from src.core.config import settings
from src.core.logging_config import get_logger

logger = get_logger("omnifix.mcp_server")

# ---------------------------------------------------------------------------
# FastMCP server instance
# ---------------------------------------------------------------------------

mcp = FastMCP(
    name="OmniFix Automation Server",
    version="1.0.0",
    description=(
        "Autonomous multi-agent workflow automation. "
        "Expose tools to execute, validate, and monitor workflows."
    ),
)

# In-memory store (replaced by Redis in production)
_workflow_states: dict[str, dict[str, Any]] = {}
_execution_history: list[dict[str, Any]] = []
_error_logs: list[dict[str, Any]] = []


# =============================================================================
# TOOLS
# =============================================================================

@mcp.tool()
async def execute_workflow(workflow_name: str, input_data: dict) -> dict:
    """
    Execute a predefined workflow with given input data.

    Args:
        workflow_name: Name of workflow to run (e.g. 'invoice_processing')
        input_data: Dictionary of input parameters for the workflow

    Returns:
        Workflow execution result with status, outputs, and telemetry
    """
    from src.orchestration.workflow_graph import run_workflow

    workflow_id = str(uuid.uuid4())
    started_at = datetime.now(timezone.utc).isoformat()

    logger.info("mcp_execute_workflow", workflow_name=workflow_name, workflow_id=workflow_id)

    # Build task description from input data
    task = input_data.get("task", f"Execute {workflow_name} workflow")
    task_metadata = {k: v for k, v in input_data.items() if k != "task"}

    try:
        final_state = await run_workflow(
            task=task,
            workflow_name=workflow_name,
            task_metadata=task_metadata,
        )

        result = {
            "workflow_id": final_state.get("workflow_id", workflow_id),
            "workflow_name": workflow_name,
            "status": str(final_state.get("status", "unknown")),
            "steps_completed": final_state.get("current_step_index", 0),
            "total_steps": final_state.get("total_steps", 0),
            "overall_confidence": final_state.get("overall_confidence", 0),
            "validation_passed": final_state.get("validation_passed", False),
            "hitl_required": final_state.get("hitl_required", False),
            "results_summary": {
                k: list(v.keys()) if isinstance(v, dict) else str(v)[:100]
                for k, v in (final_state.get("results") or {}).items()
            },
            "total_tokens_used": final_state.get("total_tokens_used", 0),
            "agent_count": len(set(
                t.get("agent_type", "") for t in (final_state.get("agent_telemetry") or [])
            )),
            "started_at": started_at,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }

        # Persist state
        _workflow_states[workflow_id] = dict(final_state)
        _execution_history.append({
            "workflow_id": workflow_id,
            "workflow_name": workflow_name,
            "status": result["status"],
            "confidence": result["overall_confidence"],
            "timestamp": started_at,
        })

        return result

    except Exception as exc:
        error_entry = {
            "workflow_id": workflow_id,
            "error": str(exc),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        _error_logs.append(error_entry)
        return {"workflow_id": workflow_id, "status": "error", "error": str(exc)}


@mcp.tool()
async def validate_output(workflow_id: str, expected_schema: dict) -> dict:
    """
    Validate the output of a completed workflow against an expected schema.

    Args:
        workflow_id: ID of the completed workflow
        expected_schema: JSON schema dict describing expected output structure

    Returns:
        Validation report with field-level compliance details
    """
    state = _workflow_states.get(workflow_id)
    if not state:
        return {"valid": False, "error": f"Workflow {workflow_id} not found"}

    results = state.get("results", {})
    intermediate = state.get("intermediate_outputs", {})

    # Validate each expected field
    validation_report: dict[str, Any] = {
        "workflow_id": workflow_id,
        "schema_fields": len(expected_schema),
        "field_results": {},
        "missing_fields": [],
        "type_mismatches": [],
    }

    for field, expected_type in expected_schema.items():
        value = intermediate.get(field) or results.get(field)
        if value is None:
            validation_report["missing_fields"].append(field)
            validation_report["field_results"][field] = {"present": False}
        else:
            type_match = isinstance(value, __builtins__[expected_type] if isinstance(expected_type, str) else expected_type)  # type: ignore
            validation_report["field_results"][field] = {
                "present": True,
                "value_preview": str(value)[:50],
            }

    missing_count = len(validation_report["missing_fields"])
    total = len(expected_schema)
    validation_report["valid"] = missing_count == 0
    validation_report["completeness"] = (total - missing_count) / total if total > 0 else 1.0
    validation_report["timestamp"] = datetime.now(timezone.utc).isoformat()

    return validation_report


@mcp.tool()
async def log_execution(
    workflow_id: str, step_name: str, status: str, message: str, metadata: dict | None = None
) -> dict:
    """
    Append a structured log entry to the workflow execution log.

    Args:
        workflow_id: Workflow to log for
        step_name: Name of the step being logged
        status: Status string (info|warning|error|success)
        message: Human-readable log message
        metadata: Optional structured metadata dict

    Returns:
        Confirmation with log entry ID
    """
    log_entry = {
        "log_id": str(uuid.uuid4()),
        "workflow_id": workflow_id,
        "step_name": step_name,
        "status": status,
        "message": message,
        "metadata": metadata or {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    # Append to workflow state
    if workflow_id in _workflow_states:
        exec_log = _workflow_states[workflow_id].get("execution_log", [])
        exec_log.append(log_entry)
        _workflow_states[workflow_id]["execution_log"] = exec_log

    # Persist errors separately
    if status == "error":
        _error_logs.append(log_entry)

    logger.info("mcp_log_entry", **{k: v for k, v in log_entry.items() if k != "metadata"})

    return {"success": True, "log_id": log_entry["log_id"]}


@mcp.tool()
async def get_workflow_metrics() -> dict:
    """Get overall system performance metrics."""
    total = len(_execution_history)
    if total == 0:
        return {"total_executions": 0, "message": "No executions yet"}

    statuses = [h.get("status", "") for h in _execution_history]
    confidences = [h.get("confidence", 0) for h in _execution_history if h.get("confidence")]

    return {
        "total_executions": total,
        "success_rate": statuses.count("WorkflowStatus.COMPLETED") / total,
        "average_confidence": sum(confidences) / len(confidences) if confidences else 0,
        "error_count": len(_error_logs),
        "workflows": list({h.get("workflow_name") for h in _execution_history}),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# =============================================================================
# RESOURCES
# =============================================================================

@mcp.resource("workflow://state/{workflow_id}")
async def get_workflow_state(workflow_id: str) -> str:
    """
    Retrieve current state of a workflow execution.
    Returns JSON-serialized WorkflowState.
    """
    state = _workflow_states.get(workflow_id)
    if not state:
        return json.dumps({"error": f"Workflow {workflow_id} not found"})

    # Return a safe subset (omit large nested objects)
    summary = {
        "workflow_id": state.get("workflow_id"),
        "workflow_name": state.get("workflow_name"),
        "status": str(state.get("status")),
        "current_step_index": state.get("current_step_index"),
        "total_steps": state.get("total_steps"),
        "overall_confidence": state.get("overall_confidence"),
        "validation_passed": state.get("validation_passed"),
        "hitl_required": state.get("hitl_required"),
        "error_count": len(state.get("errors", [])),
        "token_count": state.get("total_tokens_used"),
        "created_at": state.get("created_at"),
    }
    return json.dumps(summary, indent=2)


@mcp.resource("workflow://execution_history")
async def get_execution_history() -> str:
    """Retrieve the last 50 workflow executions with status and metrics."""
    recent = _execution_history[-50:]
    return json.dumps(recent, indent=2)


@mcp.resource("workflow://error_logs")
async def get_error_logs() -> str:
    """Retrieve error logs from all workflow executions."""
    return json.dumps(_error_logs[-100:], indent=2)


# =============================================================================
# PROMPTS
# =============================================================================

@mcp.prompt()
def decompose_task(task_description: str) -> str:
    """
    Generate a prompt to break a complex task into atomic workflow steps.
    """
    return f"""You are OmniFix Planner, an expert autonomous workflow architect.

TASK: {task_description}

Your job is to decompose this task into a precise, ordered sequence of atomic steps.

For each step, specify:
1. step_name: A clear, action-oriented name (verb + noun)
2. responsible_agent: One of [DataEntryAgent, DocProcessorAgent, DecisionAgent, CommunicationAgent]
3. description: Exactly what this step does (1-2 sentences)
4. inputs: What data/resources this step needs (from previous steps or external)
5. outputs: What this step produces (specific, measurable)
6. success_criteria: How to verify this step succeeded
7. failure_handling: What to do if this step fails

Rules:
- Each step must be independently executable
- Steps must be ordered by dependency (no forward references)
- Every step must have a clear success/failure criterion
- Prefer parallelizable steps where possible (mark with can_parallel: true)
- Maximum 12 steps; minimum 3 steps

Output format: JSON array of step objects.

TASK: {task_description}
"""


@mcp.prompt()
def error_recovery(
    error_type: str,
    failed_step: str,
    error_message: str,
    context: str,
) -> str:
    """
    Generate a prompt to diagnose and recover from a workflow failure.
    """
    return f"""You are OmniFix Recovery Agent, specializing in autonomous error remediation.

FAILURE REPORT:
- Error Type: {error_type}
- Failed Step: {failed_step}
- Error Message: {error_message}
- Context: {context}

Analyze this failure and provide:

1. ROOT CAUSE ANALYSIS:
   - Primary cause of failure
   - Contributing factors
   - Is this recoverable without human intervention?

2. RECOVERY STRATEGY (choose one):
   - retry_with_exponential_backoff: For transient failures
   - fallback_to_cached_data: For API/network failures
   - retry_with_simplified_prompt: For LLM parsing failures
   - partial_rollback: For data consistency issues
   - request_human_review: For confidence/ambiguity issues
   - skip_and_continue: For non-critical optional steps

3. CONCRETE RECOVERY STEPS:
   List exactly what actions to take, in order.

4. PREVENTION:
   How to prevent this failure class in future runs.

Be specific. Every recommendation must reference the actual error context above.
"""


@mcp.prompt()
def quality_check(
    workflow_results: str,
    expected_outputs: str,
) -> str:
    """
    Generate a quality validation prompt for workflow outputs.
    """
    return f"""You are OmniFix Quality Auditor.

WORKFLOW OUTPUTS:
{workflow_results}

EXPECTED OUTPUTS:
{expected_outputs}

Perform a rigorous quality audit:

1. COMPLETENESS CHECK:
   - Which expected outputs are present? (with evidence)
   - Which expected outputs are missing?
   - Completeness score: X/Y fields

2. ACCURACY VALIDATION:
   - Are numeric values mathematically consistent?
   - Are dates logically valid?
   - Are string fields properly formatted?

3. EVIDENCE BINDING:
   - Every extracted field must have a source reference
   - Flag any "guessed" values without evidence

4. CONFIDENCE SCORES:
   - Field-level confidence (0.0-1.0)
   - Overall workflow confidence
   - Fields requiring human review (confidence < 0.70)

5. FINAL VERDICT:
   - PASS: All critical fields present, confidence ≥ 0.70
   - PARTIAL: Some fields missing, flagged for review
   - FAIL: Critical fields missing or mathematically inconsistent

Output as structured JSON.
"""


def main() -> None:
    """Start the MCP server."""
    import asyncio

    logger.info(
        "mcp_server_start",
        host=settings.mcp_host,
        port=settings.mcp_port,
        provider=settings.llm_provider.value,
    )

    mcp.run(transport="streamable-http", host=settings.mcp_host, port=settings.mcp_port)


if __name__ == "__main__":
    main()
