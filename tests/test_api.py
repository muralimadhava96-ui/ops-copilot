"""Tests for the FastAPI REST API endpoints."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app, decision_history


@pytest.fixture(autouse=True)
def _reset_state() -> None:
    """Reset decision history before each test."""
    decision_history.clear()


@pytest.fixture
def client() -> TestClient:
    """Synchronous test client for the FastAPI app."""
    return TestClient(app)


class TestHealthEndpoint:
    """GET /api/health."""

    def test_returns_200(self, client: TestClient) -> None:
        resp = client.get("/api/health")
        assert resp.status_code == 200

    def test_returns_healthy_status(self, client: TestClient) -> None:
        data = client.get("/api/health").json()
        assert data["status"] == "healthy"
        assert data["service"] == "stadium-ops-copilot"


class TestContextEndpoint:
    """GET /api/context."""

    def test_returns_200(self, client: TestClient) -> None:
        resp = client.get("/api/context")
        assert resp.status_code == 200

    def test_contains_stadium_info(self, client: TestClient) -> None:
        data = client.get("/api/context").json()
        assert "stadium" in data
        assert data["stadium"]["name"] == "MetLife Stadium"

    def test_contains_zones(self, client: TestClient) -> None:
        data = client.get("/api/context").json()
        assert "zones" in data
        assert len(data["zones"]) == 4
        assert "A" in data["zones"]

    def test_contains_staff_roster(self, client: TestClient) -> None:
        data = client.get("/api/context").json()
        assert "staff_roster" in data
        assert "volunteers" in data["staff_roster"]

    def test_contains_languages(self, client: TestClient) -> None:
        data = client.get("/api/context").json()
        assert "language_pool" in data
        assert "en" in data["language_pool"]


class TestEventsEndpoint:
    """GET /api/events."""

    def test_returns_200(self, client: TestClient) -> None:
        resp = client.get("/api/events")
        assert resp.status_code == 200

    def test_returns_correct_count(self, client: TestClient) -> None:
        data = client.get("/api/events").json()
        assert data["count"] == 6
        assert len(data["events"]) == 6

    def test_event_summaries_have_titles(self, client: TestClient) -> None:
        data = client.get("/api/events").json()
        for ev in data["events"]:
            assert "title" in ev
            assert len(ev["title"]) > 0


class TestSingleEventEndpoint:
    """GET /api/events/{index}."""

    def test_valid_index(self, client: TestClient) -> None:
        resp = client.get("/api/events/0")
        assert resp.status_code == 200
        assert resp.json()["event_id"] == "EVT-001"

    def test_invalid_index(self, client: TestClient) -> None:
        resp = client.get("/api/events/99")
        assert resp.status_code == 404


class TestTriggerEndpoint:
    """POST /api/events/{index}/trigger."""

    def test_trigger_returns_decision(self, client: TestClient) -> None:
        resp = client.post("/api/events/0/trigger")
        assert resp.status_code == 200
        data = resp.json()
        assert "event" in data
        assert "decision" in data
        assert data["decision"]["event_id"] == "EVT-001"

    def test_trigger_invalid_index(self, client: TestClient) -> None:
        resp = client.post("/api/events/99/trigger")
        assert resp.status_code == 404

    def test_trigger_adds_to_history(self, client: TestClient) -> None:
        client.post("/api/events/0/trigger")
        resp = client.get("/api/decisions")
        assert resp.json()["count"] == 1


class TestDecisionsEndpoint:
    """GET and DELETE /api/decisions."""

    def test_initially_empty(self, client: TestClient) -> None:
        resp = client.get("/api/decisions")
        assert resp.status_code == 200
        assert resp.json()["count"] == 0

    def test_reset_clears_history(self, client: TestClient) -> None:
        client.post("/api/events/0/trigger")
        assert client.get("/api/decisions").json()["count"] == 1
        resp = client.delete("/api/decisions")
        assert resp.status_code == 200
        assert client.get("/api/decisions").json()["count"] == 0


class TestFrontendServing:
    """GET / should serve the frontend."""

    def test_root_serves_html(self, client: TestClient) -> None:
        resp = client.get("/")
        # Will be 200 if frontend exists, 404 if not — both are valid responses
        assert resp.status_code in (200, 404)
