"""
OmniFix — Planner Agent
Decomposes a natural language task into atomic, ordered workflow steps.
Uses LLM (real or mock) with structured output.
"""

from __future__ import annotations

import json
import random
import uuid
from typing import Any

from src.agents.base_agent import AgentResult, BaseAgent
from src.core.config import LLMProvider, settings
from src.core.logging_config import get_logger
from src.orchestration.state import StepStatus, WorkflowState, WorkflowStep

logger = get_logger("omnifix.planner")

# ---------------------------------------------------------------------------
# Mock LLM Responses for offline demo
# ---------------------------------------------------------------------------

MOCK_PLANS: dict[str, list[dict[str, Any]]] = {
    "invoice_processing": [
        {"name": "Email Inbox Monitor", "agent": "CommunicationAgent",
         "description": "Scan Gmail inbox for new invoice attachments", "order": 1},
        {"name": "OCR Extraction", "agent": "DocProcessorAgent",
         "description": "Extract structured data from invoice PDF using EasyOCR + LLM", "order": 2},
        {"name": "PO Validation", "agent": "DecisionAgent",
         "description": "Validate invoice against purchase order in database", "order": 3},
        {"name": "Accounting Entry", "agent": "DataEntryAgent",
         "description": "Auto-fill accounting software via Playwright browser automation", "order": 4},
        {"name": "Budget Update", "agent": "CommunicationAgent",
         "description": "Update project budget tracker in Notion via API", "order": 5},
        {"name": "Approval Request", "agent": "CommunicationAgent",
         "description": "Send approval request to manager via Slack", "order": 6},
        {"name": "Archive Document", "agent": "DataEntryAgent",
         "description": "Archive processed invoice to Google Drive with metadata", "order": 7},
        {"name": "Generate Report", "agent": "DocProcessorAgent",
         "description": "Compile weekly invoice processing summary report", "order": 8},
    ],
    "default": [
        {"name": "Task Analysis", "agent": "DecisionAgent",
         "description": "Analyze task requirements and identify dependencies", "order": 1},
        {"name": "Data Collection", "agent": "DataEntryAgent",
         "description": "Gather required input data from sources", "order": 2},
        {"name": "Processing", "agent": "DocProcessorAgent",
         "description": "Execute core transformation logic", "order": 3},
        {"name": "Validation", "agent": "DecisionAgent",
         "description": "Validate outputs against business rules", "order": 4},
        {"name": "Delivery", "agent": "CommunicationAgent",
         "description": "Deliver results and notify stakeholders", "order": 5},
    ],
}

PLANNING_PROMPT = """You are OmniFix Planner, an expert workflow architect.

Given the task: "{task}"

Decompose it into atomic, ordered steps. Each step must:
1. Have a clear name and responsible agent
2. Be independently executable
3. Have defined inputs from previous steps
4. Produce verifiable outputs

Agent pool: DataEntryAgent, DocProcessorAgent, DecisionAgent, CommunicationAgent

Output JSON array of steps with fields:
  name, agent, description, order, expected_input, expected_output

Task: {task}
"""


class PlannerAgent(BaseAgent):
    """
    Decomposes a high-level task description into an ordered list of
    atomic workflow steps, each assigned to a specialist agent.
    """

    def __init__(self) -> None:
        super().__init__(agent_type="PlannerAgent")

    async def _execute(
        self, state: WorkflowState, **kwargs: Any
    ) -> AgentResult:
        task = state.get("task", "")
        workflow_name = state.get("workflow_name", "default")

        logger.info("planning_task", task=task[:100], workflow_name=workflow_name)

        if settings.llm_provider == LLMProvider.MOCK or settings.demo_mode:
            steps_data = await self._mock_plan(workflow_name, task)
            tokens = random.randint(300, 600)
            confidence = random.uniform(0.88, 0.98)
        else:
            steps_data, tokens = await self._llm_plan(task)
            confidence = 0.92

        steps: list[WorkflowStep] = []
        for s in steps_data:
            step: WorkflowStep = {
                "step_id": str(uuid.uuid4()),
                "name": s["name"],
                "agent": s["agent"],
                "description": s["description"],
                "input_data": s.get("expected_input", {}),
                "output_data": {},
                "status": StepStatus.PENDING,
                "confidence": 0.0,
                "evidence": [],
                "retry_count": 0,
            }
            steps.append(step)

        return AgentResult.ok(
            output={"steps": steps, "step_count": len(steps)},
            confidence=confidence,
            tokens_used=tokens,
            evidence=[
                f"Decomposed '{task[:50]}' into {len(steps)} atomic steps",
                f"All steps assigned to appropriate specialist agents",
            ],
            tool_calls=["llm.plan_decomposition"],
        )

    async def _mock_plan(
        self, workflow_name: str, task: str
    ) -> list[dict[str, Any]]:
        """Return a curated mock plan based on workflow type."""
        import asyncio
        await asyncio.sleep(0.2)  # simulate LLM latency

        # Match workflow name to known plans
        for key in MOCK_PLANS:
            if key in workflow_name.lower() or key in task.lower():
                return MOCK_PLANS[key]

        return MOCK_PLANS["default"]

    async def _llm_plan(self, task: str) -> tuple[list[dict[str, Any]], int]:
        """Call real LLM to decompose the task."""
        from langchain_openai import ChatOpenAI
        from langchain_core.messages import HumanMessage

        llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.2)
        prompt = PLANNING_PROMPT.format(task=task)

        response = await llm.ainvoke([HumanMessage(content=prompt)])
        content = response.content

        # Extract JSON from response
        start = content.find("[")
        end = content.rfind("]") + 1
        steps_data = json.loads(content[start:end])

        tokens = response.usage_metadata.get("total_tokens", 0) if response.usage_metadata else 0
        return steps_data, tokens
