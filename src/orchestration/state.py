"""
OmniFix — Workflow State Definition for LangGraph
Typed state shared across all agent nodes.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Annotated, Any, Optional
from typing_extensions import TypedDict

from langgraph.graph import add_messages


class WorkflowStatus(str, Enum):
    PENDING = "pending"
    PLANNING = "planning"
    EXECUTING = "executing"
    VALIDATING = "validating"
    RECOVERING = "recovering"
    COMPLETED = "completed"
    FAILED = "failed"
    AWAITING_HUMAN = "awaiting_human"


class StepStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"
    ESCALATED = "escalated"


class WorkflowStep(TypedDict, total=False):
    step_id: str
    name: str
    agent: str
    description: str
    input_data: dict[str, Any]
    output_data: dict[str, Any]
    status: StepStatus
    confidence: float
    evidence: list[str]
    started_at: Optional[str]
    completed_at: Optional[str]
    duration_ms: Optional[float]
    error: Optional[str]
    retry_count: int


class AgentTelemetry(TypedDict, total=False):
    agent_id: str
    agent_type: str
    tokens_used: int
    latency_ms: float
    confidence: float
    tool_calls: list[str]
    timestamp: str


class WorkflowState(TypedDict, total=False):
    # Identity
    workflow_id: str
    workflow_name: str
    created_at: str

    # Task description
    task: str
    task_metadata: dict[str, Any]

    # Planning output
    steps: list[WorkflowStep]
    current_step_index: int
    total_steps: int

    # Execution state
    status: WorkflowStatus
    results: dict[str, Any]
    intermediate_outputs: dict[str, Any]

    # Error tracking
    errors: list[dict[str, Any]]
    retry_count: int
    max_retries: int

    # Quality & confidence
    overall_confidence: float
    validation_passed: bool
    hitl_required: bool
    hitl_reason: Optional[str]

    # Telemetry
    agent_telemetry: list[AgentTelemetry]
    execution_log: list[dict[str, Any]]
    total_tokens_used: int

    # Self-healing
    recovery_attempts: int
    recovery_strategy: Optional[str]
    healed: bool


def create_initial_state(
    task: str,
    workflow_name: str = "custom",
    task_metadata: Optional[dict[str, Any]] = None,
) -> WorkflowState:
    """Create a fresh workflow state."""
    return WorkflowState(
        workflow_id=str(uuid.uuid4()),
        workflow_name=workflow_name,
        created_at=datetime.now(timezone.utc).isoformat(),
        task=task,
        task_metadata=task_metadata or {},
        steps=[],
        current_step_index=0,
        total_steps=0,
        status=WorkflowStatus.PENDING,
        results={},
        intermediate_outputs={},
        errors=[],
        retry_count=0,
        max_retries=3,
        overall_confidence=0.0,
        validation_passed=False,
        hitl_required=False,
        hitl_reason=None,
        agent_telemetry=[],
        execution_log=[],
        total_tokens_used=0,
        recovery_attempts=0,
        recovery_strategy=None,
        healed=False,
    )
