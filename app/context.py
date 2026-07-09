"""Static stadium knowledge base — MetLife Stadium, FIFA World Cup 2026.

This module acts as the "RAG" layer.  Because the KB is small and
static (a few dozen facts about zones, gates, medical points, and
staff), we inject it directly into the LLM prompt rather than using
a vector database.  This is an intentional design choice: at this
scale a vector DB adds latency and complexity with zero retrieval
benefit.
"""

from __future__ import annotations

from typing import Any


# ---------------------------------------------------------------------------
# Zone definitions
# ---------------------------------------------------------------------------

ZONES: dict[str, dict[str, Any]] = {
    "A": {
        "name": "North Stand",
        "capacity": 20_000,
        "gates": ["G1", "G2"],
        "gate_throughput": {"G1": 800, "G2": 750},  # persons/min
        "nearest_medical": "Medical Point 1",
        "adjacent_zones": ["B", "D"],
        "concession_areas": 4,
        "restrooms": 6,
        "emergency_exits": 3,
    },
    "B": {
        "name": "East Stand",
        "capacity": 18_000,
        "gates": ["G3", "G4"],
        "gate_throughput": {"G3": 700, "G4": 700},
        "nearest_medical": "Medical Point 2",
        "adjacent_zones": ["A", "C"],
        "concession_areas": 3,
        "restrooms": 5,
        "emergency_exits": 3,
    },
    "C": {
        "name": "South Stand",
        "capacity": 22_000,
        "gates": ["G5", "G6"],
        "gate_throughput": {"G5": 850, "G6": 800},
        "nearest_medical": "Medical Point 1",
        "adjacent_zones": ["B", "D"],
        "concession_areas": 5,
        "restrooms": 7,
        "emergency_exits": 4,
    },
    "D": {
        "name": "West Stand",
        "capacity": 22_500,
        "gates": ["G7", "G8"],
        "gate_throughput": {"G7": 900, "G8": 850},
        "nearest_medical": "Medical Point 2",
        "adjacent_zones": ["A", "C"],
        "concession_areas": 5,
        "restrooms": 7,
        "emergency_exits": 4,
    },
}


# ---------------------------------------------------------------------------
# Stadium-wide constants
# ---------------------------------------------------------------------------

STADIUM = {
    "name": "MetLife Stadium",
    "location": "East Rutherford, New Jersey, USA",
    "total_capacity": 82_500,
    "event": "FIFA World Cup 2026",
    "medical_points": {
        "Medical Point 1": {"location": "Between Zone A and Zone C", "teams": 1},
        "Medical Point 2": {"location": "Between Zone B and Zone D", "teams": 1},
    },
}


STAFF_ROSTER: dict[str, Any] = {
    "volunteers": {
        "total": 12,
        "default_allocation": {"A": 3, "B": 3, "C": 3, "D": 3},
    },
    "security": {
        "total": 4,
        "default_allocation": {"A": 1, "B": 1, "C": 1, "D": 1},
    },
    "medical_teams": {
        "total": 2,
        "default_allocation": {
            "Medical Point 1": 1,
            "Medical Point 2": 1,
        },
    },
}


LANGUAGE_POOL: list[str] = ["en", "es", "fr", "ar", "pt"]


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------


def get_zone_info(zone_id: str) -> dict[str, Any] | None:
    """Return full details for a single zone, or *None* if not found."""
    return ZONES.get(zone_id.upper())


def get_adjacent_zones(zone_id: str) -> list[str]:
    """Return IDs of zones adjacent to *zone_id*."""
    zone = ZONES.get(zone_id.upper())
    return zone["adjacent_zones"] if zone else []


def get_staff_roster() -> dict[str, Any]:
    """Return the full staff roster with default allocations."""
    return STAFF_ROSTER


def get_zone_ids() -> list[str]:
    """Return all zone IDs in order."""
    return list(ZONES.keys())


def get_full_context() -> str:
    """Format the entire KB as a human-readable string for prompt injection.

    This is the "retrieval" step — cheap and deterministic because the
    KB fits comfortably within context-window limits.
    """
    lines: list[str] = [
        f"## Stadium: {STADIUM['name']}",
        f"Location: {STADIUM['location']}",
        f"Total capacity: {STADIUM['total_capacity']:,}",
        f"Event: {STADIUM['event']}",
        "",
        "## Zones",
    ]

    for zid, z in ZONES.items():
        lines.append(
            f"- Zone {zid} ({z['name']}): capacity {z['capacity']:,}, "
            f"gates {', '.join(z['gates'])}, "
            f"nearest medical: {z['nearest_medical']}, "
            f"adjacent to zones {', '.join(z['adjacent_zones'])}, "
            f"emergency exits: {z['emergency_exits']}"
        )

    lines.append("")
    lines.append("## Gate Throughput (persons/min)")
    for zid, z in ZONES.items():
        for gate, tput in z["gate_throughput"].items():
            lines.append(f"- {gate} (Zone {zid}): {tput}/min")

    lines.append("")
    lines.append("## Medical Points")
    for name, mp in STADIUM["medical_points"].items():
        lines.append(f"- {name}: {mp['location']}, teams: {mp['teams']}")

    lines.append("")
    lines.append("## Staff Roster")
    for role, info in STAFF_ROSTER.items():
        lines.append(f"- {role}: {info['total']} total, default allocation: {info['default_allocation']}")

    lines.append("")
    lines.append(f"## Supported Languages: {', '.join(LANGUAGE_POOL)}")

    return "\n".join(lines)


def get_context_for_api() -> dict[str, Any]:
    """Return the KB as a JSON-serialisable dict for the REST API."""
    return {
        "stadium": STADIUM,
        "zones": ZONES,
        "staff_roster": STAFF_ROSTER,
        "language_pool": LANGUAGE_POOL,
    }
