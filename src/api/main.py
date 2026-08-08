"""
OmniFix — FastAPI Backend
REST API + WebSocket real-time event streaming for the dashboard.
"""

from __future__ import annotations

import asyncio
import json
import pathlib
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, AsyncGenerator

# ── Resolve dashboard directory relative to this file (works regardless of CWD)
BASE_DIR = pathlib.Path(__file__).resolve().parent.parent.parent
DASHBOARD_DIR = BASE_DIR / "dashboard"

from fastapi import FastAPI, HTTPException, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from src.core.config import settings
from src.core.logging_config import get_logger

logger = get_logger("omnifix.api")

# ---------------------------------------------------------------------------
# Event Bus — lightweight pub/sub for WebSocket broadcasting
# ---------------------------------------------------------------------------

class EventBus:
    """In-memory async event bus for real-time workflow updates."""

    def __init__(self) -> None:
        self._subscribers: list[asyncio.Queue] = []

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._subscribers.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subscribers.discard(q) if hasattr(self._subscribers, "discard") else None
        try:
            self._subscribers.remove(q)
        except ValueError:
            pass

    async def publish(self, event: dict[str, Any]) -> None:
        dead = []
        for q in self._subscribers:
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            self.unsubscribe(q)


event_bus = EventBus()

# ---------------------------------------------------------------------------
# In-memory workflow store
# ---------------------------------------------------------------------------

_active_workflows: dict[str, dict] = {}
_completed_workflows: list[dict] = []
_system_metrics = {
    "total_workflows": 0,
    "success_count": 0,
    "failure_count": 0,
    "total_tokens": 0,
    "started_at": datetime.now(timezone.utc).isoformat(),
}

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class WorkflowRequest(BaseModel):
    workflow_name: str = Field(default="invoice_processing", description="Named workflow type")
    task: str = Field(default="Process incoming invoices from email inbox end-to-end")
    input_data: dict[str, Any] = Field(default_factory=dict)
    demo_mode: bool = Field(default=True)


class WorkflowSummary(BaseModel):
    workflow_id: str
    workflow_name: str
    status: str
    progress: float
    confidence: float
    steps_completed: int
    total_steps: int
    started_at: str


# ---------------------------------------------------------------------------
# App lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    logger.info("omnifix_api_start", host=settings.api_host, port=settings.api_port)
    yield
    logger.info("omnifix_api_shutdown")


# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="OmniFix API",
    description="Autonomous Multi-Agent Workflow Automation System",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Serve dashboard static files using absolute paths ──────────────────────
try:
    app.mount("/css",    StaticFiles(directory=str(DASHBOARD_DIR / "css")), name="css")
    app.mount("/js",     StaticFiles(directory=str(DASHBOARD_DIR / "js")),  name="js")
    app.mount("/static", StaticFiles(directory=str(DASHBOARD_DIR)),         name="static")
except Exception as e:
    logger.warning("static_mount_failed", error=str(e))


# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------

@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve the OmniFix dashboard."""
    index_file = DASHBOARD_DIR / "index.html"
    try:
        html = index_file.read_text(encoding="utf-8")
        return HTMLResponse(
            content=html,
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>OmniFix API</h1><p><a href='/docs'>API Docs →</a></p>",
            status_code=200,
        )


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    """Suppress 404 for favicon."""
    return Response(content=b"", media_type="image/x-icon")



@app.get("/health")
async def health():
    """System health check."""
    return {
        "status": "healthy",
        "version": settings.app_version,
        "env": settings.app_env.value,
        "llm_provider": settings.llm_provider.value,
        "demo_mode": settings.demo_mode,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/metrics")
async def get_metrics():
    """Get real-time system metrics."""
    total = _system_metrics["total_workflows"]
    success_rate = (
        _system_metrics["success_count"] / total if total > 0 else 0
    )
    return {
        **_system_metrics,
        "active_workflows": len(_active_workflows),
        "success_rate": round(success_rate, 4),
        "workflows_per_minute": round(total / max(1, (time.time() - 1754612604) / 60), 2),
    }


@app.post("/api/workflows/execute")
async def execute_workflow(req: WorkflowRequest):
    """
    Trigger a new workflow execution.
    Returns immediately with workflow_id; monitor via WebSocket or /api/workflows/{id}.
    """
    workflow_id = str(uuid.uuid4())
    _system_metrics["total_workflows"] += 1

    _active_workflows[workflow_id] = {
        "workflow_id": workflow_id,
        "workflow_name": req.workflow_name,
        "status": "pending",
        "progress": 0.0,
        "confidence": 0.0,
        "steps_completed": 0,
        "total_steps": 0,
        "started_at": datetime.now(timezone.utc).isoformat(),
    }

    # Run workflow in background
    asyncio.create_task(_run_workflow_task(workflow_id, req))

    return {
        "workflow_id": workflow_id,
        "status": "started",
        "message": f"Workflow '{req.workflow_name}' started. Monitor via WebSocket.",
        "monitor_url": f"/ws/workflows/{workflow_id}",
        "status_url": f"/api/workflows/{workflow_id}",
    }


async def _run_workflow_task(workflow_id: str, req: WorkflowRequest) -> None:
    """Background task: run workflow and broadcast events."""
    try:
        from src.orchestration.workflow_graph import run_workflow

        # Publish start event
        await event_bus.publish({
            "type": "workflow_start",
            "workflow_id": workflow_id,
            "workflow_name": req.workflow_name,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        final_state = await run_workflow(
            task=req.task,
            workflow_name=req.workflow_name,
            task_metadata=req.input_data,
        )

        status = str(final_state.get("status", "completed"))
        confidence = final_state.get("overall_confidence", 0)

        _active_workflows[workflow_id].update({
            "status": status,
            "progress": 1.0,
            "confidence": confidence,
            "steps_completed": final_state.get("current_step_index", 0),
            "total_steps": final_state.get("total_steps", 0),
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "results": final_state.get("results", {}),
            "telemetry": final_state.get("agent_telemetry", []),
        })

        if "COMPLETED" in status:
            _system_metrics["success_count"] += 1
        else:
            _system_metrics["failure_count"] += 1

        _system_metrics["total_tokens"] += final_state.get("total_tokens_used", 0)

        # Move to completed
        completed = _active_workflows.pop(workflow_id, {})
        _completed_workflows.append(completed)

        await event_bus.publish({
            "type": "workflow_complete",
            "workflow_id": workflow_id,
            "status": status,
            "confidence": confidence,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    except Exception as exc:
        logger.error("workflow_task_error", workflow_id=workflow_id, error=str(exc))
        _system_metrics["failure_count"] += 1
        if workflow_id in _active_workflows:
            _active_workflows[workflow_id]["status"] = "error"
            _active_workflows[workflow_id]["error"] = str(exc)

        await event_bus.publish({
            "type": "workflow_error",
            "workflow_id": workflow_id,
            "error": str(exc),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })


@app.get("/api/workflows/{workflow_id}")
async def get_workflow(workflow_id: str):
    """Get status and results of a specific workflow."""
    wf = _active_workflows.get(workflow_id) or next(
        (w for w in _completed_workflows if w.get("workflow_id") == workflow_id), None
    )
    if not wf:
        raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found")
    return wf


@app.get("/api/workflows")
async def list_workflows():
    """List active and recent completed workflows."""
    return {
        "active": list(_active_workflows.values()),
        "recent": _completed_workflows[-20:],
        "total_active": len(_active_workflows),
        "total_completed": len(_completed_workflows),
    }


# ---------------------------------------------------------------------------
# WebSocket — Real-time event streaming
# ---------------------------------------------------------------------------

@app.websocket("/ws/events")
async def websocket_events(websocket: WebSocket):
    """WebSocket endpoint for real-time workflow events (dashboard)."""
    await websocket.accept()
    queue = event_bus.subscribe()
    logger.info("websocket_connected", client=str(websocket.client))

    try:
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=30.0)
                await websocket.send_text(json.dumps(event))
            except asyncio.TimeoutError:
                # Send keepalive ping
                await websocket.send_text(json.dumps({"type": "ping", "timestamp": datetime.now(timezone.utc).isoformat()}))
    except WebSocketDisconnect:
        logger.info("websocket_disconnected")
    finally:
        event_bus.unsubscribe(queue)


@app.get("/api/sse/events")
async def sse_events(request: Any = None):
    """SSE endpoint for browsers that prefer EventSource over WebSocket."""
    queue = event_bus.subscribe()

    async def generator():
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield {"data": json.dumps(event)}
                except asyncio.TimeoutError:
                    yield {"data": json.dumps({"type": "ping"})}
        finally:
            event_bus.unsubscribe(queue)

    return EventSourceResponse(generator())


# ---------------------------------------------------------------------------
# Demo endpoint — produces realistic simulated events for standalone dashboard
# ---------------------------------------------------------------------------

@app.post("/api/demo/invoice")
async def run_invoice_demo():
    """Trigger the full invoice processing demo pipeline."""
    req = WorkflowRequest(
        workflow_name="invoice_processing",
        task="Process new invoice from TechSupply Corp — extract, validate, enter, notify",
        input_data={"email_folder": "inbox/invoices", "demo": True},
        demo_mode=True,
    )
    return await execute_workflow(req)


def main() -> None:
    import uvicorn
    uvicorn.run(
        "src.api.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.debug,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()
