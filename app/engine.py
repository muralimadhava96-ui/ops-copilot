"""AI Decision Engine — the core reasoning component.

Takes a crowd event + stadium context + recent decision history and
produces a structured EngineDecision via a single Gemini API call.

Key design decisions:
- Uses Google Gemini API (strategically aligned for Google Prompt Wars)
- Structured JSON output via response_mime_type="application/json"
- Injects full stadium KB + recent history into prompt (memory across events)
- Explicit conflict-resolution instructions prevent double-allocation
- Fallback mode returns a safe default if the LLM call fails
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from google import genai
from google.genai import types

from app.config import settings
from app.context import get_full_context, LANGUAGE_POOL
from app.schemas import (
    CrowdEvent,
    DecisionHistory,
    EngineDecision,
    StaffAllocation,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are the AI Decision Engine for MetLife Stadium operations during \
FIFA World Cup 2026. You receive real-time crowd events and must produce \
a single, actionable decision for the venue operations team.

## Your Responsibilities
1. Assess the risk level of the incoming event.
2. Determine which zones are affected.
3. Recommend a specific, actionable response (not vague advice).
4. Explain your reasoning in 1-2 sentences — the ops team needs to \
   understand WHY, not just WHAT.
5. If staff need to be moved, specify exact movements (role, from, to, count).
6. Generate an English alert suitable for PA broadcast.
7. Translate that alert into: {languages}.

## Critical Rules
- NEVER double-allocate staff. Check the "Current Staff State" and \
  "Recent Decisions" sections before assigning anyone.
- If two or more zones need resources simultaneously and supply is \
  limited, you MUST make a trade-off. Prioritise based on: severity, \
  density trend (rising > stable > falling), remaining capacity \
  margin, and proximity to medical/emergency facilities.
- When making a trade-off, populate the "conflict_resolution" field \
  explaining your reasoning.
- If no action is needed (stable, low-risk), say so explicitly — do \
  NOT invent unnecessary actions.
- Keep alert text clear, calm, and suitable for a multilingual crowd.

## Priority Scale
1 = Critical (immediate danger, medical, evacuation)
2 = High (capacity risk, gate failure, severe congestion)
3 = Moderate (building congestion, pre-emptive staffing)
4 = Low (informational, minor adjustment)
5 = Routine (no action needed, acknowledgement only)
""".format(languages=", ".join(LANGUAGE_POOL))


# ---------------------------------------------------------------------------
# JSON schema for structured output
# ---------------------------------------------------------------------------

DECISION_SCHEMA = types.Schema(
    type=types.Type.OBJECT,
    required=[
        "event_id",
        "risk_level",
        "affected_zones",
        "recommended_action",
        "reasoning",
        "staff_allocation",
        "alert_text_en",
        "alert_translations",
        "conflict_resolution",
        "priority",
    ],
    properties={
        "event_id": types.Schema(type=types.Type.STRING),
        "risk_level": types.Schema(
            type=types.Type.STRING,
            enum=["low", "moderate", "high", "critical"],
        ),
        "affected_zones": types.Schema(
            type=types.Type.ARRAY,
            items=types.Schema(type=types.Type.STRING),
        ),
        "recommended_action": types.Schema(type=types.Type.STRING),
        "reasoning": types.Schema(type=types.Type.STRING),
        "staff_allocation": types.Schema(
            type=types.Type.ARRAY,
            items=types.Schema(
                type=types.Type.OBJECT,
                required=["role", "from_zone", "to_zone", "count"],
                properties={
                    "role": types.Schema(type=types.Type.STRING),
                    "from_zone": types.Schema(type=types.Type.STRING),
                    "to_zone": types.Schema(type=types.Type.STRING),
                    "count": types.Schema(type=types.Type.INTEGER),
                },
            ),
        ),
        "alert_text_en": types.Schema(type=types.Type.STRING),
        "alert_translations": types.Schema(
            type=types.Type.OBJECT,
            properties={
                lang: types.Schema(type=types.Type.STRING)
                for lang in LANGUAGE_POOL
                if lang != "en"
            },
        ),
        "conflict_resolution": types.Schema(
            type=types.Type.STRING, nullable=True
        ),
        "priority": types.Schema(type=types.Type.INTEGER),
    },
)


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


def _build_user_prompt(
    event: CrowdEvent,
    history: DecisionHistory,
) -> str:
    """Compose the user message with context, history, and the event."""
    stadium_context = get_full_context()
    recent_decisions = history.get_recent(5)
    staff_state = history.get_staff_state()

    return f"""\
## Stadium Context
{stadium_context}

## Current Staff State (cumulative changes from default allocation)
{json.dumps(staff_state, indent=2) if staff_state else "All staff at default positions."}

## Recent Decisions (for continuity — do NOT re-allocate already-moved staff)
{recent_decisions}

## Incoming Event
- Event ID: {event.event_id}
- Timestamp: {event.timestamp}
- Zone: {event.zone_id}
- Type: {event.event_type}
- Density: {event.density_percent}%
- Trend: {event.trend}
- Severity: {event.severity}
- Details: {event.details}

Analyze this event and produce your decision as structured JSON.
"""


async def process_event(
    event: CrowdEvent,
    history: DecisionHistory,
) -> EngineDecision:
    """Run the decision engine on a single event.

    Makes one Gemini API call with structured JSON output.
    Falls back to a safe default if the call fails.
    """
    if not settings.gemini_api_key:
        logger.warning("No GEMINI_API_KEY set — using fallback decision")
        return _fallback_decision(event)

    try:
        client = genai.Client(api_key=settings.gemini_api_key)

        user_prompt = _build_user_prompt(event, history)

        response = client.models.generate_content(
            model=settings.model_name,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_schema=DECISION_SCHEMA,
                temperature=0.3,
            ),
        )

        raw = response.text
        data = json.loads(raw)
        logger.info("Engine produced decision for event %s", event.event_id)

        # Map the LLM's staff_allocation format to our Pydantic model
        staff_allocs = []
        for sa in data.get("staff_allocation", []):
            staff_allocs.append(
                StaffAllocation(
                    role=sa.get("role", "volunteer"),
                    from_zone=sa.get("from_zone", "D"),
                    to_zone=sa.get("to_zone", event.zone_id),
                    count=sa.get("count", 1),
                )
            )

        decision = EngineDecision(
            event_id=data.get("event_id", event.event_id),
            timestamp=datetime.now(timezone.utc).isoformat(),
            risk_level=data.get("risk_level", "moderate"),
            affected_zones=data.get("affected_zones", [event.zone_id]),
            recommended_action=data.get(
                "recommended_action", "Monitor situation"
            ),
            reasoning=data.get("reasoning", "Automated assessment."),
            staff_allocation=staff_allocs,
            alert_text_en=data.get("alert_text_en", "No alert required."),
            alert_translations=data.get("alert_translations", {}),
            conflict_resolution=data.get("conflict_resolution"),
            priority=max(1, min(5, data.get("priority", 3))),
        )
        return decision

    except Exception:
        logger.exception(
            "Engine LLM call failed for event %s — using fallback",
            event.event_id,
        )
        return _fallback_decision(event)


# ---------------------------------------------------------------------------
# Fallback
# ---------------------------------------------------------------------------

_SEVERITY_TO_RISK = {
    "low": "low",
    "medium": "moderate",
    "high": "high",
    "critical": "critical",
}

_SEVERITY_TO_PRIORITY = {
    "low": 5,
    "medium": 4,
    "high": 2,
    "critical": 1,
}


def _fallback_decision(event: CrowdEvent) -> EngineDecision:
    """Return a reasonable default when the LLM is unavailable.

    This keeps the demo functional even without an API key or during
    rate-limit errors — critical for a live presentation.
    """
    risk = _SEVERITY_TO_RISK.get(event.severity, "moderate")
    priority = _SEVERITY_TO_PRIORITY.get(event.severity, 3)

    action = (
        f"Monitor Zone {event.zone_id} — density at "
        f"{event.density_percent}% and {event.trend}."
    )
    if event.density_percent >= 85:
        action = (
            f"Deploy additional staff to Zone {event.zone_id}. "
            f"Consider activating overflow gates. "
            f"Density at {event.density_percent}% ({event.trend})."
        )
    if event.event_type == "medical_incident":
        action = (
            f"Dispatch medical team to Zone {event.zone_id}. "
            f"Clear surrounding area for access. Issue PA alert."
        )

    alert = (
        f"Attention staff: {event.event_type.replace('_', ' ').title()} "
        f"reported in Zone {event.zone_id}. {action}"
    )

    return EngineDecision(
        event_id=event.event_id,
        timestamp=datetime.now(timezone.utc).isoformat(),
        risk_level=risk,
        affected_zones=[event.zone_id],
        recommended_action=action,
        reasoning=(
            f"Fallback decision — LLM unavailable. Based on severity "
            f"({event.severity}) and density ({event.density_percent}%)."
        ),
        staff_allocation=[],
        alert_text_en=alert,
        alert_translations={
            "es": f"[ES] {alert}",
            "fr": f"[FR] {alert}",
            "ar": f"[AR] {alert}",
            "pt": f"[PT] {alert}",
        },
        conflict_resolution=None,
        priority=priority,
    )
