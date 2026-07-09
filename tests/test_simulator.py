"""Tests for the scripted event simulator."""

from __future__ import annotations

import pytest

from app.schemas import CrowdEvent
from app.simulator import get_all_events, get_event, get_event_count, get_event_summaries


class TestSimulatorEvents:
    """Verify the 6-event scripted match timeline."""

    def test_event_count(self) -> None:
        """There should be exactly 6 scripted events."""
        assert get_event_count() == 6

    def test_all_events_load(self) -> None:
        """All events should be valid CrowdEvent instances."""
        events = get_all_events()
        assert len(events) == 6
        for e in events:
            assert isinstance(e, CrowdEvent)

    def test_get_event_valid_index(self) -> None:
        """get_event(0) should return the first event."""
        event = get_event(0)
        assert event is not None
        assert event.event_id == "EVT-001"

    def test_get_event_last_index(self) -> None:
        """get_event(5) should return the last event."""
        event = get_event(5)
        assert event is not None
        assert event.event_id == "EVT-006"

    def test_get_event_out_of_range(self) -> None:
        """Out-of-range index should return None, not raise."""
        assert get_event(-1) is None
        assert get_event(6) is None
        assert get_event(100) is None

    def test_event_schema_validation(self) -> None:
        """All events should have required fields with valid values."""
        for e in get_all_events():
            assert 0 <= e.density_percent <= 100
            assert e.trend in ("rising", "stable", "falling")
            assert e.severity in ("low", "medium", "high", "critical")
            assert e.zone_id in ("A", "B", "C", "D")
            assert len(e.event_id) > 0
            assert len(e.details) > 0

    def test_conflict_event_is_critical(self) -> None:
        """Event 4 (index 3) — the conflict — must be critical severity."""
        conflict = get_event(3)
        assert conflict is not None
        assert conflict.severity == "critical"
        assert conflict.density_percent >= 85.0

    def test_conflict_event_mentions_two_zones(self) -> None:
        """The conflict event details should reference multiple zones."""
        conflict = get_event(3)
        assert conflict is not None
        # The details mention both Zone A and Zone C
        assert "Zone A" in conflict.details or "zone A" in conflict.details.lower()
        assert "Zone C" in conflict.details or "zone C" in conflict.details.lower()

    def test_medical_event_type(self) -> None:
        """Event 5 (index 4) should be a medical incident."""
        med = get_event(4)
        assert med is not None
        assert med.event_type == "medical_incident"
        assert med.severity == "critical"

    def test_event_ids_unique(self) -> None:
        """All event IDs must be unique."""
        ids = [e.event_id for e in get_all_events()]
        assert len(ids) == len(set(ids))

    def test_event_summaries(self) -> None:
        """Summaries should contain index, title, zone, and severity."""
        summaries = get_event_summaries()
        assert len(summaries) == 6
        for s in summaries:
            assert "index" in s
            assert "title" in s
            assert "zone" in s
            assert "severity" in s
