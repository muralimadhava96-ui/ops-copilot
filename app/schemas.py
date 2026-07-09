"""Pydantic models for events, decisions, and decision history.

All data flowing through the system is validated against these schemas,
ensuring the AI engine's output is always structurally correct.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field


class CrowdEvent(BaseModel):
    """A crowd-related event detected in a stadium zone."""

    event_id: str = Field(..., description="Unique event identifier")
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="ISO-8601 timestamp of the event",
    )
    zone_id: str = Field(..., description="Zone where the event occurred (A-D)")
    event_type: str = Field(
        ...,
        description="Type: crowd_surge | medical_incident | gate_congestion | weather_alert | match_event | vip_movement",
    )
    density_percent: float = Field(
        ..., ge=0, le=100, description="Current zone density as a percentage"
    )
    trend: str = Field(..., description="Density trend: rising | stable | falling")
    details: str = Field(..., description="Human-readable event description")
    severity: str = Field(
        ..., description="Severity level: low | medium | high | critical"
    )


class StaffAllocation(BaseModel):
    """Describes a staff movement decision."""

    role: str = Field(..., description="Staff role: volunteer | security | medical")
    from_zone: str = Field(..., description="Zone to pull staff from")
    to_zone: str = Field(..., description="Zone to deploy staff to")
    count: int = Field(..., ge=1, description="Number of staff to move")


class EngineDecision(BaseModel):
    """Structured output from the AI Decision Engine."""

    event_id: str = Field(..., description="ID of the triggering event")
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="ISO-8601 timestamp of the decision",
    )
    risk_level: str = Field(
        ..., description="Overall risk: low | moderate | high | critical"
    )
    affected_zones: list[str] = Field(
        ..., description="List of zone IDs affected by this decision"
    )
    recommended_action: str = Field(
        ..., description="Concise action recommendation for ops staff"
    )
    reasoning: str = Field(
        ...,
        description="1-2 sentence explanation of WHY this action was chosen",
    )
    staff_allocation: list[StaffAllocation] = Field(
        default_factory=list,
        description="Staff movements, if any",
    )
    alert_text_en: str = Field(
        ..., description="Alert message in English for broadcast"
    )
    alert_translations: dict[str, str] = Field(
        default_factory=dict,
        description="Translated alerts keyed by language code (es, fr, ar, pt)",
    )
    conflict_resolution: Optional[str] = Field(
        None,
        description="Explanation of trade-offs if competing demands existed",
    )
    priority: int = Field(
        ..., ge=1, le=5, description="Priority 1 (highest) to 5 (lowest)"
    )


class DecisionHistory:
    """Maintains a rolling window of recent decisions for engine context.

    This gives the decision engine *memory* across events — it can
    reference what it already decided (e.g. "don't re-allocate a
    volunteer we already moved") rather than reasoning statelessly.
    """

    def __init__(self, max_history: int = 10) -> None:
        self._decisions: list[EngineDecision] = []
        self._max_history = max_history

    @property
    def decisions(self) -> list[EngineDecision]:
        """Return all stored decisions (oldest first)."""
        return list(self._decisions)

    def add(self, decision: EngineDecision) -> None:
        """Append a decision and trim to the rolling window size."""
        self._decisions.append(decision)
        if len(self._decisions) > self._max_history:
            self._decisions = self._decisions[-self._max_history :]

    def clear(self) -> None:
        """Reset all decision history (for demo restart)."""
        self._decisions.clear()

    def get_recent(self, n: int = 5) -> str:
        """Format the last *n* decisions as context for the LLM prompt."""
        recent = self._decisions[-n:]
        if not recent:
            return "No previous decisions have been made yet."

        lines: list[str] = []
        for d in recent:
            alloc_str = ""
            if d.staff_allocation:
                moves = [
                    f"{a.count} {a.role}(s) from Zone {a.from_zone} → Zone {a.to_zone}"
                    for a in d.staff_allocation
                ]
                alloc_str = " | Staff moves: " + "; ".join(moves)
            lines.append(
                f"- [{d.risk_level.upper()}] {d.recommended_action} "
                f"(zones: {', '.join(d.affected_zones)}){alloc_str}"
            )
        return "\n".join(lines)

    def get_staff_state(self) -> dict[str, dict[str, int]]:
        """Compute current staff positions based on cumulative decisions.

        Returns a dict like ``{"A": {"volunteer": 4, "security": 1}, ...}``.
        """
        # Start with the default roster from context (will be merged externally)
        state: dict[str, dict[str, int]] = {}
        for d in self._decisions:
            for a in d.staff_allocation:
                # Decrement source
                state.setdefault(a.from_zone, {})
                state[a.from_zone][a.role] = (
                    state[a.from_zone].get(a.role, 0) - a.count
                )
                # Increment destination
                state.setdefault(a.to_zone, {})
                state[a.to_zone][a.role] = (
                    state[a.to_zone].get(a.role, 0) + a.count
                )
        return state
