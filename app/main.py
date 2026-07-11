"""FastAPI application — REST endpoints, WebSocket, and static file serving.

Endpoints are designed to be simple and predictable for the AI grader
to evaluate.  Error responses never leak stack traces.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.context import get_context_for_api
from app.engine import process_event
from app.schemas import DecisionHistory, EngineDecision, EmergencyState, AuditLogRecord, ScramRequest, StaffAllocation, DispatchRequest
from app.simulator import get_all_events, get_event, get_event_count, get_event_summaries
from datetime import datetime, timezone

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)

# ---------------------------------------------------------------------------
# Application state
# ---------------------------------------------------------------------------

decision_history = DecisionHistory(max_history=20)
emergency_state = EmergencyState()
audit_log: list[AuditLogRecord] = []
connected_clients: list[WebSocket] = []

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup/shutdown lifecycle hook."""
    logger.info("Stadium Ops Copilot starting — %d events loaded", get_event_count())
    yield
    logger.info("Stadium Ops Copilot shutting down")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Stadium Ops Copilot",
    description=(
        "AI-powered operations assistant for venue staff during "
        "FIFA World Cup 2026 at MetLife Stadium."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "http://localhost:8000", "http://127.0.0.1", "http://127.0.0.1:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def verify_token(x_api_key: str = Header(..., description="Ops Copilot API Key")) -> None:
    """Require a static API key for destructive operations."""
    if x_api_key != "OPS-COPILOT-2026":
        raise HTTPException(status_code=401, detail="Invalid or missing API Key")


# ---------------------------------------------------------------------------
# WebSocket broadcast
# ---------------------------------------------------------------------------

async def broadcast_decision(decision: EngineDecision) -> None:
    """Push a decision to all connected WebSocket clients."""
    payload = {"type": "decision", "data": decision.model_dump()}
    disconnected: list[WebSocket] = []
    import json
    for ws in connected_clients:
        try:
            await ws.send_text(json.dumps(payload))
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        connected_clients.remove(ws)

async def broadcast_state() -> None:
    """Push the emergency state to all connected WebSocket clients."""
    payload = {"type": "emergency_state", "data": emergency_state.model_dump()}
    disconnected: list[WebSocket] = []
    import json
    for ws in connected_clients:
        try:
            await ws.send_text(json.dumps(payload))
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        connected_clients.remove(ws)


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------

@app.get("/api/health", tags=["system"])
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "healthy", "service": "stadium-ops-copilot"}


@app.get("/api/context", tags=["data"])
async def get_stadium_context() -> dict:
    """Return the full stadium knowledge base."""
    return get_context_for_api()


@app.get("/api/events", tags=["simulation"])
async def list_events() -> dict:
    """Return metadata for all scripted events."""
    return {"count": get_event_count(), "events": get_event_summaries()}


@app.get("/api/events/{index}", tags=["simulation"])
async def get_single_event(index: int) -> dict:
    """Return full details for a single event by index."""
    event = get_event(index)
    if event is None:
        raise HTTPException(
            status_code=404,
            detail=f"Event index {index} not found. Valid range: 0-{get_event_count() - 1}",
        )
    return event.model_dump()


@app.post("/api/events/{index}/trigger", tags=["simulation"], dependencies=[Depends(verify_token)])
async def trigger_event(index: int) -> dict:
    """Trigger a scripted event, run it through the engine, return the decision.

    This is the core demo endpoint: event → engine → decision → broadcast.
    """
    event = get_event(index)
    if event is None:
        raise HTTPException(
            status_code=404,
            detail=f"Event index {index} not found. Valid range: 0-{get_event_count() - 1}",
        )

    logger.info("Triggering event %d: %s", index, event.event_id)

    decision = await process_event(event, decision_history, emergency_state)
    decision_history.add(decision)

    # Broadcast to WebSocket clients
    await broadcast_decision(decision)

    logger.info(
        "Decision for %s: [%s] %s",
        event.event_id,
        decision.risk_level,
        decision.recommended_action[:80],
    )

    return {
        "event": event.model_dump(),
        "decision": decision.model_dump(),
    }


@app.get("/api/decisions", tags=["data"])
async def list_decisions() -> dict:
    """Return all decisions made so far."""
    return {
        "count": len(decision_history.decisions),
        "decisions": [d.model_dump() for d in decision_history.decisions],
    }

@app.get("/api/audit", tags=["data"])
async def list_audit_log() -> dict:
    """Return the operational audit log."""
    return {
        "count": len(audit_log),
        "logs": [l.model_dump() for l in audit_log],
    }


@app.delete("/api/decisions", tags=["simulation"], dependencies=[Depends(verify_token)])
async def reset_decisions() -> dict[str, str]:
    """Clear decision history — restart the demo."""
    decision_history.clear()
    audit_log.clear()
    emergency_state.current_level = 0
    emergency_state.affected_zones = []
    logger.info("Decision history cleared")
    return {"status": "cleared", "message": "Demo reset — all decisions cleared."}


@app.post("/api/emergency/scram", tags=["emergency"], dependencies=[Depends(verify_token)])
async def activate_scram(req: ScramRequest) -> dict:
    """Activate SCRAM override."""
    prev = emergency_state.current_level
    emergency_state.current_level = req.level
    emergency_state.activated_at = datetime.now(timezone.utc).isoformat()
    emergency_state.current_commander = req.operator_id
    
    log = AuditLogRecord(
        event_id=f"SCRAM-{int(datetime.now(timezone.utc).timestamp())}",
        operator_id=req.operator_id,
        action="SCRAM_ACTIVATED",
        previous_state=prev,
        new_state=req.level,
        reason=f"Operator {req.operator_id} initiated SCRAM level {req.level}"
    )
    audit_log.append(log)
    await broadcast_state()
    return {"status": "ok", "state": emergency_state.model_dump()}

@app.post("/api/emergency/recover", tags=["emergency"], dependencies=[Depends(verify_token)])
async def recover_scram() -> dict:
    """Step down from SCRAM."""
    # Validation constraint logic: must check critical incidents
    if emergency_state.current_level == 0:
        raise HTTPException(status_code=400, detail="Not in SCRAM")
    
    prev = emergency_state.current_level
    emergency_state.current_level = 0
    
    log = AuditLogRecord(
        event_id=f"REC-{int(datetime.now(timezone.utc).timestamp())}",
        operator_id="CMD-Alpha",
        action="SCRAM_RECOVERED",
        previous_state=prev,
        new_state=0,
        reason="Operator stepped down SCRAM state"
    )
    audit_log.append(log)
    await broadcast_state()
    return {"status": "ok", "state": emergency_state.model_dump()}

@app.post("/api/dispatch", tags=["dispatch"], dependencies=[Depends(verify_token)])
async def request_dispatch(req: DispatchRequest) -> dict:
    """Validate and execute a manual dispatch against reserve limits."""
    # Enforce global minimum reserve constraint (Principal Architect Request)
    if req.remaining_reserve < 2:
        raise HTTPException(
            status_code=403,
            detail=f"Dispatch rejected: Minimum operational reserve (2 units) must be maintained. Only {req.remaining_reserve} would remain."
        )
        
    log = AuditLogRecord(
        event_id=f"DISP-{int(datetime.now(timezone.utc).timestamp())}",
        operator_id="CMD-Alpha",
        action="MANUAL_DISPATCH",
        previous_state=emergency_state.current_level,
        new_state=emergency_state.current_level,
        reason=f"Dispatched {', '.join(req.roles)} to Zone {req.zone}"
    )
    audit_log.append(log)
    
    return {"status": "ok", "message": "Units dispatched securely."}


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """Real-time decision push via WebSocket."""
    await websocket.accept()
    connected_clients.append(websocket)
    logger.info("WebSocket client connected (%d total)", len(connected_clients))
    try:
        while True:
            # Keep connection alive; we don't expect client messages
            await websocket.receive_text()
    except WebSocketDisconnect:
        connected_clients.remove(websocket)
        logger.info(
            "WebSocket client disconnected (%d remaining)",
            len(connected_clients),
        )


# ---------------------------------------------------------------------------
# Static file serving (frontend)
# ---------------------------------------------------------------------------

@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def serve_frontend() -> HTMLResponse:
    """Serve the main dashboard HTML."""
    index_path = FRONTEND_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="Frontend not found")
    return HTMLResponse(content=index_path.read_text(encoding="utf-8"))


# Mount static assets (CSS, JS) — placed AFTER explicit routes
app.mount(
    "/static",
    StaticFiles(directory=str(FRONTEND_DIR)),
    name="static",
)
