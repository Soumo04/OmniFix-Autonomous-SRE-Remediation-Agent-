"""
OmniFix — Base Agent
Abstract foundation for all agents with retry, telemetry, and confidence scoring.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Optional

from tenacity import (
    AsyncRetrying,
    RetryError,
    stop_after_attempt,
    wait_exponential,
)

from src.core.config import settings
from src.core.logging_config import get_logger
from src.orchestration.state import AgentTelemetry, WorkflowState


class AgentExecutionError(Exception):
    """Raised when an agent fails after all retries."""

    def __init__(self, agent_id: str, reason: str, original: Optional[Exception] = None):
        self.agent_id = agent_id
        self.reason = reason
        self.original = original
        super().__init__(f"[{agent_id}] {reason}")


class AgentResult:
    """Structured result from any agent execution."""

    def __init__(
        self,
        success: bool,
        output: dict[str, Any],
        confidence: float = 1.0,
        evidence: Optional[list[str]] = None,
        tool_calls: Optional[list[str]] = None,
        tokens_used: int = 0,
        error: Optional[str] = None,
    ):
        self.success = success
        self.output = output
        self.confidence = max(0.0, min(1.0, confidence))
        self.evidence = evidence or []
        self.tool_calls = tool_calls or []
        self.tokens_used = tokens_used
        self.error = error
        self.timestamp = datetime.now(timezone.utc).isoformat()

    @classmethod
    def ok(cls, output: dict[str, Any], **kwargs: Any) -> "AgentResult":
        return cls(success=True, output=output, **kwargs)

    @classmethod
    def fail(cls, error: str, output: Optional[dict[str, Any]] = None) -> "AgentResult":
        return cls(success=False, output=output or {}, confidence=0.0, error=error)


class BaseAgent(ABC):
    """
    Abstract base for all OmniFix agents.

    Provides:
    - Unique agent ID + type tagging
    - Async execution with configurable retries + exponential backoff
    - Telemetry emission to workflow state
    - Confidence scoring with HITL escalation gate
    - Structured JSON logging
    """

    def __init__(
        self,
        agent_type: str,
        max_retries: int = settings.max_retry_attempts,
        timeout: int = settings.agent_timeout,
    ):
        self.agent_id = f"{agent_type}-{str(uuid.uuid4())[:8]}"
        self.agent_type = agent_type
        self.max_retries = max_retries
        self.timeout = timeout
        self.logger = get_logger(f"omnifix.agent.{agent_type}")
        self._call_count = 0

    @abstractmethod
    async def _execute(
        self, state: WorkflowState, **kwargs: Any
    ) -> AgentResult:
        """Core agent logic — implement in subclasses."""
        ...

    async def run(
        self, state: WorkflowState, **kwargs: Any
    ) -> tuple[WorkflowState, AgentResult]:
        """
        Public entry point. Wraps _execute with:
        - Retry logic (exponential backoff)
        - Timeout enforcement
        - Telemetry collection
        - HITL escalation check
        """
        self._call_count += 1
        start_time = time.perf_counter()

        self.logger.info(
            "agent_start",
            agent_id=self.agent_id,
            agent_type=self.agent_type,
            workflow_id=state.get("workflow_id"),
            attempt=self._call_count,
        )

        result = await self._run_with_retry(state, **kwargs)

        elapsed_ms = (time.perf_counter() - start_time) * 1000

        # Emit telemetry into state
        telemetry: AgentTelemetry = {
            "agent_id": self.agent_id,
            "agent_type": self.agent_type,
            "tokens_used": result.tokens_used,
            "latency_ms": round(elapsed_ms, 2),
            "confidence": result.confidence,
            "tool_calls": result.tool_calls,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        telemetry_list = list(state.get("agent_telemetry", []))
        telemetry_list.append(telemetry)
        state["agent_telemetry"] = telemetry_list
        state["total_tokens_used"] = state.get("total_tokens_used", 0) + result.tokens_used

        # HITL gate: escalate if confidence too low
        if result.success and result.confidence < settings.hitl_confidence_threshold:
            self.logger.warning(
                "hitl_escalation",
                agent_id=self.agent_id,
                confidence=result.confidence,
                threshold=settings.hitl_confidence_threshold,
            )
            state["hitl_required"] = True
            state["hitl_reason"] = (
                f"{self.agent_type} confidence {result.confidence:.0%} "
                f"below threshold {settings.hitl_confidence_threshold:.0%}"
            )

        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "agent_id": self.agent_id,
            "agent_type": self.agent_type,
            "success": result.success,
            "confidence": result.confidence,
            "latency_ms": round(elapsed_ms, 2),
            "error": result.error,
        }
        exec_log = list(state.get("execution_log", []))
        exec_log.append(log_entry)
        state["execution_log"] = exec_log

        self.logger.info(
            "agent_complete",
            agent_id=self.agent_id,
            success=result.success,
            confidence=result.confidence,
            latency_ms=round(elapsed_ms, 2),
        )

        return state, result

    async def _run_with_retry(
        self, state: WorkflowState, **kwargs: Any
    ) -> AgentResult:
        """Execute with exponential backoff retry."""
        last_error: Optional[Exception] = None

        try:
            async for attempt in AsyncRetrying(
                stop=stop_after_attempt(self.max_retries),
                wait=wait_exponential(
                    multiplier=settings.retry_base_delay, min=1, max=30
                ),
                reraise=False,
            ):
                with attempt:
                    try:
                        result = await asyncio.wait_for(
                            self._execute(state, **kwargs),
                            timeout=self.timeout,
                        )
                        return result
                    except asyncio.TimeoutError:
                        last_error = asyncio.TimeoutError(
                            f"Agent {self.agent_id} timed out after {self.timeout}s"
                        )
                        self.logger.warning(
                            "agent_timeout",
                            agent_id=self.agent_id,
                            timeout=self.timeout,
                            attempt_number=attempt.retry_state.attempt_number,
                        )
                        raise last_error
                    except Exception as exc:
                        last_error = exc
                        self.logger.warning(
                            "agent_retry",
                            agent_id=self.agent_id,
                            error=str(exc),
                            attempt_number=attempt.retry_state.attempt_number,
                        )
                        raise
        except RetryError:
            pass

        return AgentResult.fail(
            error=f"Failed after {self.max_retries} attempts: {last_error}"
        )
