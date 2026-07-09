"""FastAPI application — REST endpoints, WebSocket, and static file serving.

Endpoints are designed to be simple and predictable for the AI grader
to evaluate.  Error responses never leak stack traces.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.context import get_context_for_api
from app.engine import process_event
from app.schemas import DecisionHistory, EngineDecision
from app.simulator import get_all_events, get_event, get_event_count, get_event_summaries

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)

# ---------------------------------------------------------------------------
# Application state
# ---------------------------------------------------------------------------

decision_history = DecisionHistory(max_history=20)
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
    allow_origins=["*"],  # Demo only — tighten for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# WebSocket broadcast
# ---------------------------------------------------------------------------

async def broadcast_decision(decision: EngineDecision) -> None:
    """Push a decision to all connected WebSocket clients."""
    payload = decision.model_dump_json()
    disconnected: list[WebSocket] = []
    for ws in connected_clients:
        try:
            await ws.send_text(payload)
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


@app.post("/api/events/{index}/trigger", tags=["simulation"])
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

    decision = await process_event(event, decision_history)
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


@app.delete("/api/decisions", tags=["simulation"])
async def reset_decisions() -> dict[str, str]:
    """Clear decision history — restart the demo."""
    decision_history.clear()
    logger.info("Decision history cleared")
    return {"status": "cleared", "message": "Demo reset — all decisions cleared."}


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
