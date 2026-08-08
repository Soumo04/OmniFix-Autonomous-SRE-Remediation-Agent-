"""
OmniFix Test Suite
Async pytest tests for MCP server, orchestration, agents, and invoice pipeline.
"""

from __future__ import annotations

import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from typing import Any


# ── Fixtures ──────────────────────────────────────────────────

@pytest.fixture
def sample_state() -> dict[str, Any]:
    """A minimal WorkflowState fixture."""
    return {
        "workflow_id": "test-wf-001",
        "workflow_name": "invoice_processing",
        "task": "Process invoice from TechSupply Corp",
        "steps": [],
        "current_step_index": 0,
        "total_steps": 0,
        "status": "pending",
        "results": {},
        "intermediate_outputs": {},
        "errors": [],
        "retry_count": 0,
        "max_retries": 3,
        "overall_confidence": 0.0,
        "validation_passed": False,
        "hitl_required": False,
        "agent_telemetry": [],
        "execution_log": [],
        "total_tokens_used": 0,
        "recovery_attempts": 0,
        "healed": False,
        "created_at": "2026-08-08T00:00:00Z",
    }


# ═══════════════════════════════════════════════════════
# ORCHESTRATION STATE TESTS
# ═══════════════════════════════════════════════════════

class TestWorkflowState:
    def test_create_initial_state(self) -> None:
        from src.orchestration.state import create_initial_state, WorkflowStatus
        state = create_initial_state("Test task", "test_workflow")
        assert state["task"] == "Test task"
        assert state["workflow_name"] == "test_workflow"
        assert state["status"] == WorkflowStatus.PENDING
        assert state["steps"] == []
        assert state["current_step_index"] == 0
        assert "workflow_id" in state
        assert "created_at" in state

    def test_workflow_status_enum(self) -> None:
        from src.orchestration.state import WorkflowStatus
        assert WorkflowStatus.COMPLETED.value == "completed"
        assert WorkflowStatus.AWAITING_HUMAN.value == "awaiting_human"

    def test_step_status_enum(self) -> None:
        from src.orchestration.state import StepStatus
        assert StepStatus.SUCCESS.value == "success"
        assert StepStatus.FAILED.value == "failed"


# ═══════════════════════════════════════════════════════
# AGENT TESTS
# ═══════════════════════════════════════════════════════

class TestPlannerAgent:
    @pytest.mark.asyncio
    async def test_mock_plan_invoice(self, sample_state) -> None:
        from src.agents.planner_agent import PlannerAgent
        agent = PlannerAgent()
        sample_state["workflow_name"] = "invoice_processing"

        updated_state, result = await agent.run(sample_state)

        assert result.success is True
        assert result.confidence > 0.8
        assert "steps" in result.output
        assert len(result.output["steps"]) > 0
        assert result.tokens_used > 0

    @pytest.mark.asyncio
    async def test_mock_plan_default(self, sample_state) -> None:
        from src.agents.planner_agent import PlannerAgent
        agent = PlannerAgent()
        sample_state["workflow_name"] = "unknown_workflow"
        sample_state["task"] = "Some other task"

        _, result = await agent.run(sample_state)

        assert result.success is True
        steps = result.output["steps"]
        assert len(steps) >= 3

    @pytest.mark.asyncio
    async def test_planner_populates_state(self, sample_state) -> None:
        from src.agents.planner_agent import PlannerAgent
        agent = PlannerAgent()

        updated_state, result = await agent.run(sample_state)

        # Agent run should add telemetry
        assert len(updated_state.get("agent_telemetry", [])) > 0
        assert len(updated_state.get("execution_log", [])) > 0


class TestSpecialistAgents:
    @pytest.mark.asyncio
    async def test_doc_processor_extraction(self, sample_state) -> None:
        from src.agents.specialists.specialist_agents import DocProcessorAgent
        agent = DocProcessorAgent()
        step = {"name": "OCR Extraction", "input_data": {}}

        updated_state, result = await agent.run(sample_state, step=step)

        assert result.success is True
        assert "vendor_name" in result.output
        assert "invoice_number" in result.output
        assert "total_amount" in result.output
        assert result.confidence > 0.85
        # Should store in intermediate_outputs
        assert "vendor_name" in updated_state.get("intermediate_outputs", {})

    @pytest.mark.asyncio
    async def test_decision_agent_evaluation(self, sample_state) -> None:
        from src.agents.specialists.specialist_agents import DecisionAgent
        agent = DecisionAgent()
        sample_state["intermediate_outputs"] = {
            "vendor_name": "TechSupply Corp",
            "invoice_number": "INV-47291",
            "total_amount": 9794.00,
            "po_reference": "PO-7842",
        }
        step = {"name": "PO Validation", "input_data": {}}

        _, result = await agent.run(sample_state, step=step)

        assert result.success is True
        assert "decision" in result.output
        assert result.output["decision"] in ["APPROVE", "ESCALATE"]
        assert "rules_passed" in result.output
        assert "ml_confidence_score" in result.output

    @pytest.mark.asyncio
    async def test_communication_agent_slack(self, sample_state) -> None:
        from src.agents.specialists.specialist_agents import CommunicationAgent
        agent = CommunicationAgent()
        sample_state["intermediate_outputs"] = {
            "invoice_number": "INV-47291",
            "vendor_name": "TechSupply Corp",
            "total_amount": 9794.00,
            "currency": "USD",
            "due_date": "2026-08-31",
            "po_reference": "PO-7842",
        }
        step = {"name": "Approval Request (Slack)", "input_data": {}}

        _, result = await agent.run(sample_state, step=step)

        assert result.success is True
        assert "channel" in result.output
        assert result.output["delivery_status"] == "sent"

    @pytest.mark.asyncio
    async def test_data_entry_agent_simulation(self, sample_state) -> None:
        from src.agents.specialists.specialist_agents import DataEntryAgent
        agent = DataEntryAgent()
        step = {"name": "Accounting Entry", "input_data": {}}

        _, result = await agent.run(sample_state, step=step)

        assert result.success is True
        assert "transaction_id" in result.output
        assert result.output["submission_status"] == "SUCCESS"


class TestOrchestratorAgents:
    @pytest.mark.asyncio
    async def test_validator_scoring(self, sample_state) -> None:
        from src.agents.orchestrator_agents import ValidatorAgent
        from src.orchestration.state import StepStatus
        agent = ValidatorAgent()

        # Set up completed steps
        sample_state["steps"] = [
            {
                "name": "Step 1",
                "status": StepStatus.SUCCESS,
                "confidence": 0.95,
                "evidence": ["evidence 1", "evidence 2"],
                "output_data": {"key": "value"},
            },
            {
                "name": "Step 2",
                "status": StepStatus.SUCCESS,
                "confidence": 0.90,
                "evidence": ["evidence A"],
                "output_data": {"key2": "value2"},
            },
        ]

        _, result = await agent.run(sample_state)

        assert result.success is True
        assert "overall_quality_score" in result.output
        assert result.output["total_steps_validated"] == 2

    @pytest.mark.asyncio
    async def test_recovery_agent_diagnoses(self, sample_state) -> None:
        from src.agents.orchestrator_agents import RecoveryAgent
        agent = RecoveryAgent()

        sample_state["errors"] = [
            {"phase": "execution", "error": "Request timeout after 30s"}
        ]

        _, result = await agent.run(sample_state)

        assert result.success is True
        assert "strategy" in result.output
        assert result.output["strategy"] == "retry_with_extended_timeout"

    @pytest.mark.asyncio
    async def test_recovery_no_errors(self, sample_state) -> None:
        from src.agents.orchestrator_agents import RecoveryAgent
        agent = RecoveryAgent()

        sample_state["errors"] = []
        sample_state["steps"] = []

        _, result = await agent.run(sample_state)

        assert result.success is True
        assert result.output.get("healed") is False


# ═══════════════════════════════════════════════════════
# BASE AGENT TESTS
# ═══════════════════════════════════════════════════════

class TestBaseAgent:
    @pytest.mark.asyncio
    async def test_telemetry_emission(self, sample_state) -> None:
        """Agent run must emit telemetry into state."""
        from src.agents.planner_agent import PlannerAgent
        agent = PlannerAgent()

        updated, _ = await agent.run(sample_state)

        telemetry = updated.get("agent_telemetry", [])
        assert len(telemetry) == 1
        assert telemetry[0]["agent_type"] == "PlannerAgent"
        assert "latency_ms" in telemetry[0]
        assert "confidence" in telemetry[0]

    @pytest.mark.asyncio
    async def test_execution_log_entry(self, sample_state) -> None:
        from src.agents.planner_agent import PlannerAgent
        agent = PlannerAgent()

        updated, _ = await agent.run(sample_state)

        log = updated.get("execution_log", [])
        assert len(log) == 1
        assert "timestamp" in log[0]
        assert "success" in log[0]

    @pytest.mark.asyncio
    async def test_hitl_escalation_low_confidence(self, sample_state) -> None:
        """State should flag HITL when confidence < threshold."""
        from src.agents.base_agent import BaseAgent, AgentResult

        class LowConfAgent(BaseAgent):
            def __init__(self):
                super().__init__("TestAgent")
            async def _execute(self, state, **kwargs):
                return AgentResult.ok({"done": True}, confidence=0.3)

        agent = LowConfAgent()
        updated, result = await agent.run(sample_state)

        assert updated.get("hitl_required") is True
        assert "hitl_reason" in updated
        assert result.confidence == 0.3


# ═══════════════════════════════════════════════════════
# API TESTS
# ═══════════════════════════════════════════════════════

class TestFastAPI:
    @pytest.fixture
    def client(self):
        from fastapi.testclient import TestClient
        from src.api.main import app
        return TestClient(app)

    def test_health_endpoint(self, client) -> None:
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"
        assert "version" in data

    def test_metrics_endpoint(self, client) -> None:
        resp = client.get("/api/metrics")
        assert resp.status_code == 200

    def test_list_workflows_empty(self, client) -> None:
        resp = client.get("/api/workflows")
        assert resp.status_code == 200
        data = resp.json()
        assert "active" in data
        assert "recent" in data


# ═══════════════════════════════════════════════════════
# INTEGRATION TEST — Full Invoice Pipeline
# ═══════════════════════════════════════════════════════

class TestInvoicePipeline:
    @pytest.mark.asyncio
    @pytest.mark.timeout(60)
    async def test_full_pipeline_completes(self) -> None:
        """End-to-end: run invoice_processing workflow through LangGraph."""
        from src.orchestration.workflow_graph import run_workflow

        final_state = await run_workflow(
            task="Process invoice from TechSupply Corp end-to-end",
            workflow_name="invoice_processing",
        )

        # Workflow should complete (or at worst await HITL)
        status = str(final_state.get("status", ""))
        assert any(s in status for s in ["COMPLETED", "AWAITING_HUMAN"]), \
            f"Unexpected status: {status}"

        # Steps should have been planned
        assert final_state.get("total_steps", 0) > 0

        # Telemetry should be populated
        assert len(final_state.get("agent_telemetry", [])) > 0

        # Confidence should be computed
        assert final_state.get("overall_confidence", 0) > 0
