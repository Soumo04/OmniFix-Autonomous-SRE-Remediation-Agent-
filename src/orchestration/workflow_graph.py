"""
OmniFix — LangGraph Workflow Graph
Multi-agent StateGraph with conditional routing and self-healing loops.
"""

from __future__ import annotations

from typing import Any, Literal

from langgraph.graph import END, StateGraph

from src.agents.orchestrator_agents import (
    RecoveryAgent,
    ValidatorAgent,
    get_executor,
    get_recovery,
    get_validator,
)
from src.agents.planner_agent import PlannerAgent
from src.core.config import settings
from src.core.logging_config import get_logger
from src.orchestration.state import (
    WorkflowState,
    WorkflowStatus,
    create_initial_state,
)

logger = get_logger("omnifix.graph")

# ---------------------------------------------------------------------------
# Node Functions  (LangGraph calls these with the current state)
# ---------------------------------------------------------------------------

_planner = PlannerAgent()
_executor = get_executor()
_validator = get_validator()
_recovery = get_recovery()


async def planner_node(state: WorkflowState) -> WorkflowState:
    """Node 1: Decompose task into steps."""
    state["status"] = WorkflowStatus.PLANNING
    updated_state, result = await _planner.run(state)

    if result.success:
        updated_state["steps"] = result.output["steps"]
        updated_state["total_steps"] = result.output["step_count"]
        updated_state["current_step_index"] = 0
        logger.info(
            "planning_complete",
            step_count=result.output["step_count"],
            workflow_id=state.get("workflow_id"),
        )
    else:
        errors = list(updated_state.get("errors", []))
        errors.append({"phase": "planning", "error": result.error})
        updated_state["errors"] = errors
        updated_state["status"] = WorkflowStatus.FAILED

    return updated_state


async def executor_node(state: WorkflowState) -> WorkflowState:
    """Node 2: Execute the current step."""
    state["status"] = WorkflowStatus.EXECUTING
    updated_state, result = await _executor.run(state)

    if not result.success:
        errors = list(updated_state.get("errors", []))
        errors.append({
            "phase": "execution",
            "step_index": state.get("current_step_index", 0),
            "error": result.error,
        })
        updated_state["errors"] = errors

    return updated_state


async def validator_node(state: WorkflowState) -> WorkflowState:
    """Node 3: Validate all completed outputs."""
    state["status"] = WorkflowStatus.VALIDATING
    updated_state, result = await _validator.run(state)

    if result.success:
        updated_state["validation_passed"] = result.output.get("validation_passed", False)
        updated_state["overall_confidence"] = result.output.get("overall_quality_score", 0)
        
        # Determine final status
        if updated_state["validation_passed"]:
            updated_state["status"] = WorkflowStatus.COMPLETED
        elif updated_state.get("hitl_required"):
            updated_state["status"] = WorkflowStatus.AWAITING_HUMAN
        elif updated_state.get("recovery_attempts", 0) >= settings.max_retry_attempts:
            updated_state["status"] = WorkflowStatus.FAILED

    return updated_state


async def recovery_node(state: WorkflowState) -> WorkflowState:
    """Node 4: Diagnose and self-heal failures."""
    state["status"] = WorkflowStatus.RECOVERING
    updated_state, result = await _recovery.run(state)

    if result.output.get("healed"):
        # Clear errors and retry
        updated_state["errors"] = []
        updated_state["status"] = WorkflowStatus.EXECUTING
    else:
        # Could not heal — mark as awaiting human
        updated_state["status"] = WorkflowStatus.AWAITING_HUMAN

    return updated_state


# ---------------------------------------------------------------------------
# Routing Functions
# ---------------------------------------------------------------------------

def route_after_planner(state: WorkflowState) -> Literal["executor", "recovery", "__end__"]:
    """Route based on planning success."""
    if state.get("status") == WorkflowStatus.FAILED:
        return "recovery"
    if state.get("steps"):
        return "executor"
    return "__end__"


def route_after_executor(state: WorkflowState) -> Literal["executor", "validator", "recovery"]:
    """Route: execute next step OR validate when all done OR recover on error."""
    errors = state.get("errors", [])
    steps = state.get("steps", [])
    current_idx = state.get("current_step_index", 0)
    total_steps = state.get("total_steps", 0)
    recovery_attempts = state.get("recovery_attempts", 0)

    # Too many errors and can't recover more — validate what we have
    if len(errors) > 2 and recovery_attempts >= settings.max_retry_attempts:
        return "validator"

    # Recent execution error — try recovery
    recent_errors = [e for e in errors if e.get("phase") == "execution"]
    if recent_errors:
        return "recovery"

    # More steps remaining
    if current_idx < total_steps:
        return "executor"

    # All steps done — validate
    return "validator"


def route_after_validator(state: WorkflowState) -> Literal["executor", "__end__"]:
    """Route: if validation failed with retries left, re-execute; else done."""
    if (
        not state.get("validation_passed")
        and state.get("recovery_attempts", 0) < settings.max_retry_attempts
        and not state.get("hitl_required")
    ):
        # Re-run from failed steps
        return "executor"

    return "__end__"


def route_after_recovery(state: WorkflowState) -> Literal["executor", "__end__"]:
    """Route: if healed, retry execution; else terminate."""
    if state.get("healed") and state.get("recovery_attempts", 0) <= settings.max_retry_attempts:
        return "executor"

    return "__end__"


# ---------------------------------------------------------------------------
# Build the Graph
# ---------------------------------------------------------------------------

def build_workflow_graph() -> Any:
    """Construct and compile the LangGraph StateGraph."""
    builder = StateGraph(WorkflowState)  # type: ignore[type-var]

    # Add nodes
    builder.add_node("planner", planner_node)
    builder.add_node("executor", executor_node)
    builder.add_node("validator", validator_node)
    builder.add_node("recovery", recovery_node)

    # Set entry point
    builder.set_entry_point("planner")

    # Add conditional edges
    builder.add_conditional_edges(
        "planner",
        route_after_planner,
        {"executor": "executor", "recovery": "recovery", "__end__": END},
    )
    builder.add_conditional_edges(
        "executor",
        route_after_executor,
        {"executor": "executor", "validator": "validator", "recovery": "recovery"},
    )
    builder.add_conditional_edges(
        "validator",
        route_after_validator,
        {"executor": "executor", "__end__": END},
    )
    builder.add_conditional_edges(
        "recovery",
        route_after_recovery,
        {"executor": "executor", "__end__": END},
    )

    graph = builder.compile()
    logger.info("workflow_graph_compiled", nodes=["planner", "executor", "validator", "recovery"])
    return graph


# Global compiled graph
workflow_graph = build_workflow_graph()


async def run_workflow(
    task: str,
    workflow_name: str = "custom",
    task_metadata: dict[str, Any] | None = None,
) -> WorkflowState:
    """
    High-level entry point.  Run a complete workflow from task description.

    Args:
        task: Natural language task description
        workflow_name: Named workflow type (e.g. 'invoice_processing')
        task_metadata: Optional extra context for the workflow

    Returns:
        Final WorkflowState with all results and telemetry
    """
    initial_state = create_initial_state(task, workflow_name, task_metadata)

    logger.info(
        "workflow_start",
        workflow_id=initial_state["workflow_id"],
        workflow_name=workflow_name,
        task=task[:80],
    )

    final_state: WorkflowState = await workflow_graph.ainvoke(initial_state)  # type: ignore

    logger.info(
        "workflow_end",
        workflow_id=final_state.get("workflow_id"),
        status=str(final_state.get("status")),
        confidence=final_state.get("overall_confidence"),
        total_tokens=final_state.get("total_tokens_used"),
    )

    return final_state
