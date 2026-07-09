"""Tests for the AI Decision Engine.

Validates schema correctness, fallback behaviour, conflict scenarios,
and translation output — without making real LLM calls.
"""

from __future__ import annotations

import pytest

from app.engine import _fallback_decision, process_event
from app.schemas import CrowdEvent, DecisionHistory, EngineDecision


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_event() -> CrowdEvent:
    """A representative high-severity crowd event."""
    return CrowdEvent(
        event_id="TEST-001",
        timestamp="2026-07-10T17:00:00Z",
        zone_id="A",
        event_type="crowd_surge",
        density_percent=85.0,
        trend="rising",
        details="Test crowd surge in Zone A — density at 85% and rising.",
        severity="high",
    )


@pytest.fixture
def low_event() -> CrowdEvent:
    """A low-severity, stable event."""
    return CrowdEvent(
        event_id="TEST-002",
        timestamp="2026-07-10T17:15:00Z",
        zone_id="B",
        event_type="match_event",
        density_percent=40.0,
        trend="stable",
        details="Normal operations in Zone B.",
        severity="low",
    )


@pytest.fixture
def medical_event() -> CrowdEvent:
    """A critical medical incident."""
    return CrowdEvent(
        event_id="TEST-003",
        timestamp="2026-07-10T18:10:00Z",
        zone_id="D",
        event_type="medical_incident",
        density_percent=65.0,
        trend="stable",
        details="Medical emergency in Zone D, Section 227.",
        severity="critical",
    )


@pytest.fixture
def history() -> DecisionHistory:
    """Empty decision history."""
    return DecisionHistory(max_history=10)


# ---------------------------------------------------------------------------
# Schema validation
# ---------------------------------------------------------------------------

class TestEngineDecisionSchema:
    """Verify that EngineDecision validates correctly."""

    def test_valid_decision(self) -> None:
        """A fully-populated decision should pass validation."""
        d = EngineDecision(
            event_id="EVT-001",
            risk_level="high",
            affected_zones=["A", "B"],
            recommended_action="Deploy 2 volunteers to Zone A.",
            reasoning="Zone A is at 85% density with a rising trend.",
            staff_allocation=[],
            alert_text_en="Attention: crowd surge in Zone A.",
            alert_translations={"es": "Atención: oleada en Zona A."},
            conflict_resolution=None,
            priority=2,
        )
        assert d.risk_level == "high"
        assert d.priority == 2
        assert len(d.affected_zones) == 2

    def test_priority_clamped(self) -> None:
        """Priority must be between 1 and 5."""
        with pytest.raises(Exception):
            EngineDecision(
                event_id="EVT-X",
                risk_level="low",
                affected_zones=["A"],
                recommended_action="Nothing",
                reasoning="Test",
                alert_text_en="Test",
                priority=0,  # Invalid — below minimum
            )

    def test_empty_affected_zones_allowed(self) -> None:
        """An event might not affect any specific zone (e.g. weather)."""
        d = EngineDecision(
            event_id="EVT-X",
            risk_level="low",
            affected_zones=[],
            recommended_action="Monitor",
            reasoning="General weather advisory.",
            alert_text_en="Weather notice.",
            priority=5,
        )
        assert d.affected_zones == []


# ---------------------------------------------------------------------------
# Fallback decision
# ---------------------------------------------------------------------------

class TestFallbackDecision:
    """Verify the fallback logic that activates when the LLM is unavailable."""

    def test_fallback_returns_valid_schema(self, sample_event: CrowdEvent) -> None:
        """Fallback should always produce a valid EngineDecision."""
        d = _fallback_decision(sample_event)
        assert isinstance(d, EngineDecision)
        assert d.event_id == sample_event.event_id

    def test_fallback_maps_severity_to_risk(self, sample_event: CrowdEvent) -> None:
        """Severity 'high' should map to risk_level 'high'."""
        d = _fallback_decision(sample_event)
        assert d.risk_level == "high"

    def test_fallback_low_severity(self, low_event: CrowdEvent) -> None:
        """Low-severity events should get low risk and priority 5."""
        d = _fallback_decision(low_event)
        assert d.risk_level == "low"
        assert d.priority == 5

    def test_fallback_medical_incident(self, medical_event: CrowdEvent) -> None:
        """Medical incidents should trigger specific dispatch language."""
        d = _fallback_decision(medical_event)
        assert d.risk_level == "critical"
        assert d.priority == 1
        assert "medical" in d.recommended_action.lower()

    def test_fallback_includes_translations(self, sample_event: CrowdEvent) -> None:
        """Fallback should provide placeholder translations for all languages."""
        d = _fallback_decision(sample_event)
        for lang in ["es", "fr", "ar", "pt"]:
            assert lang in d.alert_translations

    def test_fallback_no_staff_allocation(self, sample_event: CrowdEvent) -> None:
        """Fallback does not allocate staff (too risky without LLM reasoning)."""
        d = _fallback_decision(sample_event)
        assert d.staff_allocation == []


# ---------------------------------------------------------------------------
# Decision History
# ---------------------------------------------------------------------------

class TestDecisionHistory:
    """Verify memory/state tracking across events."""

    def test_add_and_retrieve(self, history: DecisionHistory, sample_event: CrowdEvent) -> None:
        """Adding a decision should make it retrievable."""
        d = _fallback_decision(sample_event)
        history.add(d)
        assert len(history.decisions) == 1
        assert history.decisions[0].event_id == sample_event.event_id

    def test_max_history_trimming(self, history: DecisionHistory, sample_event: CrowdEvent) -> None:
        """History should trim to max_history entries."""
        small_history = DecisionHistory(max_history=3)
        for i in range(5):
            event = CrowdEvent(
                event_id=f"EVT-{i}",
                zone_id="A",
                event_type="crowd_surge",
                density_percent=50.0,
                trend="stable",
                details="Test",
                severity="low",
            )
            small_history.add(_fallback_decision(event))
        assert len(small_history.decisions) == 3
        assert small_history.decisions[0].event_id == "EVT-2"

    def test_clear(self, history: DecisionHistory, sample_event: CrowdEvent) -> None:
        """Clear should remove all decisions."""
        history.add(_fallback_decision(sample_event))
        history.clear()
        assert len(history.decisions) == 0

    def test_get_recent_formatting(self, history: DecisionHistory, sample_event: CrowdEvent) -> None:
        """get_recent should return a formatted string, not raw data."""
        history.add(_fallback_decision(sample_event))
        recent = history.get_recent(1)
        assert isinstance(recent, str)
        assert "A" in recent  # Zone A should be mentioned

    def test_get_recent_empty(self, history: DecisionHistory) -> None:
        """Empty history should return a descriptive message."""
        recent = history.get_recent()
        assert "no previous" in recent.lower()


# ---------------------------------------------------------------------------
# Engine with no API key (should use fallback)
# ---------------------------------------------------------------------------

class TestEngineWithoutApiKey:
    """When GEMINI_API_KEY is unset, the engine should fall back gracefully."""

    @pytest.mark.asyncio
    async def test_process_event_fallback(
        self, sample_event: CrowdEvent, history: DecisionHistory
    ) -> None:
        """process_event should return a fallback decision without crashing."""
        decision = await process_event(sample_event, history)
        assert isinstance(decision, EngineDecision)
        assert decision.event_id == sample_event.event_id
        assert "fallback" in decision.reasoning.lower() or decision.reasoning != ""
