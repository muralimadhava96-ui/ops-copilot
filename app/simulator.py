"""Scripted event generator for a single FIFA World Cup match.

Six events simulate a full match timeline — from fan arrival through
final egress.  Event 4 is the **conflict scenario**: two zones spike
simultaneously with only limited spare staff, forcing the AI engine
to make a genuine trade-off that a simple rules engine cannot handle
cleanly.
"""

from __future__ import annotations

from app.schemas import CrowdEvent


def _events() -> list[CrowdEvent]:
    """Return the scripted 6-event match timeline."""
    return [
        # ------------------------------------------------------------------
        # Event 1 — PRE-MATCH ARRIVAL
        # Zone A gates congested as fans stream in
        # ------------------------------------------------------------------
        CrowdEvent(
            event_id="EVT-001",
            timestamp="2026-07-10T17:00:00Z",
            zone_id="A",
            event_type="gate_congestion",
            density_percent=75.0,
            trend="rising",
            details=(
                "Pre-match arrival surge at Zone A (North Stand). "
                "Gates G1 and G2 experiencing heavy inflow. "
                "Queue length at G1 exceeds 200 fans. "
                "Current density at 75% and rising."
            ),
            severity="high",
        ),
        # ------------------------------------------------------------------
        # Event 2 — EARLY MATCH (stable)
        # Tests the "don't over-react" case
        # ------------------------------------------------------------------
        CrowdEvent(
            event_id="EVT-002",
            timestamp="2026-07-10T17:15:00Z",
            zone_id="B",
            event_type="match_event",
            density_percent=60.0,
            trend="stable",
            details=(
                "Match underway. Zone B (East Stand) at normal capacity. "
                "All gates flowing smoothly. No issues reported. "
                "Fans are seated and engaged."
            ),
            severity="low",
        ),
        # ------------------------------------------------------------------
        # Event 3 — HALFTIME SURGE
        # Concourse congestion as fans move to concessions
        # ------------------------------------------------------------------
        CrowdEvent(
            event_id="EVT-003",
            timestamp="2026-07-10T17:45:00Z",
            zone_id="C",
            event_type="crowd_surge",
            density_percent=90.0,
            trend="rising",
            details=(
                "Halftime whistle — massive movement in Zone C (South Stand). "
                "Concourse density spiking to 90% as fans rush to concession "
                "areas and restrooms. Risk of bottleneck at corridor C-3. "
                "Adjacent Zone B also seeing increased flow."
            ),
            severity="high",
        ),
        # ------------------------------------------------------------------
        # Event 4 — THE CONFLICT  *** KEY DEMO MOMENT ***
        # Two zones spike simultaneously; limited staff available.
        # This is the event that proves "why not just rules?"
        # ------------------------------------------------------------------
        CrowdEvent(
            event_id="EVT-004",
            timestamp="2026-07-10T17:50:00Z",
            zone_id="A",
            event_type="crowd_surge",
            density_percent=88.0,
            trend="rising",
            details=(
                "SIMULTANEOUS PRESSURE: Zone A at 88% (rising) — late "
                "arrivals combining with halftime returns. Zone C still at "
                "85% (stable but high). Only 2 spare volunteer teams "
                "available across the entire stadium. Both zones are "
                "requesting additional staff. Zone A has lower total "
                "capacity (20,000) but a steeper rising trend. Zone C has "
                "higher capacity (22,000) but a stable trend. The engine "
                "must decide how to allocate the limited 2 volunteer teams."
            ),
            severity="critical",
        ),
        # ------------------------------------------------------------------
        # Event 5 — MEDICAL INCIDENT
        # Emergency requiring multi-system coordination
        # ------------------------------------------------------------------
        CrowdEvent(
            event_id="EVT-005",
            timestamp="2026-07-10T18:10:00Z",
            zone_id="D",
            event_type="medical_incident",
            density_percent=65.0,
            trend="stable",
            details=(
                "Medical emergency reported in Zone D (West Stand), "
                "Section 227, Row 14. Fan collapsed — suspected heat "
                "exhaustion. Nearest medical point is Medical Point 2. "
                "Area around Section 227 needs to be cleared for stretcher "
                "access. Adjacent fans should be temporarily rerouted. "
                "Multilingual PA announcement needed urgently."
            ),
            severity="critical",
        ),
        # ------------------------------------------------------------------
        # Event 6 — MATCH END EGRESS
        # Staged exit to prevent dangerous crowding
        # ------------------------------------------------------------------
        CrowdEvent(
            event_id="EVT-006",
            timestamp="2026-07-10T18:35:00Z",
            zone_id="A",
            event_type="crowd_surge",
            density_percent=95.0,
            trend="rising",
            details=(
                "Final whistle — all zones at high density. Zone A at 95%, "
                "Zone B at 80%, Zone C at 85%, Zone D at 70% (reduced due "
                "to earlier medical clearance). All 8 gates active. Need "
                "phased exit strategy: stagger zone releases to prevent "
                "dangerous crowding at transport hubs. Metro station "
                "capacity is 3,000/hr; parking lot exit rate is 1,200 "
                "vehicles/hr."
            ),
            severity="high",
        ),
    ]


# Cache the event list at module level
_EVENT_CACHE: list[CrowdEvent] = _events()


def get_all_events() -> list[CrowdEvent]:
    """Return all 6 scripted events."""
    return list(_EVENT_CACHE)


def get_event(index: int) -> CrowdEvent | None:
    """Return event at *index* (0-based), or *None* if out of range."""
    if 0 <= index < len(_EVENT_CACHE):
        return _EVENT_CACHE[index]
    return None


def get_event_count() -> int:
    """Return the total number of scripted events."""
    return len(_EVENT_CACHE)


def get_event_summaries() -> list[dict[str, str]]:
    """Return lightweight summaries for the frontend event buttons."""
    titles = [
        "Pre-Match Arrival Surge",
        "Early Match — Normal Ops",
        "Halftime Congestion Spike",
        "⚡ Dual-Zone Conflict",
        "🚑 Medical Emergency",
        "Match End — Staged Egress",
    ]
    return [
        {
            "index": i,
            "title": titles[i],
            "zone": e.zone_id,
            "severity": e.severity,
            "event_type": e.event_type,
        }
        for i, e in enumerate(_EVENT_CACHE)
    ]
