"""
Tests for core API endpoints.
Run from the backend/ directory:
    pytest ../tests/test_api.py -v
"""
import pytest
from fastapi.testclient import TestClient

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.main import app

client = TestClient(app)


def test_health_check():
    """Backend must return 200 with status=ok."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "ok"


def test_ingestion_status_returns_200():
    """Ingestion status endpoint must be reachable."""
    response = client.get("/api/ingestion/status")
    assert response.status_code == 200


def test_ingestion_status_has_required_fields():
    """Ingestion status response must include doc_count and sources."""
    response = client.get("/api/ingestion/status")
    data = response.json()
    assert "doc_count" in data
    assert "sources" in data


def test_chat_query_missing_body_returns_422():
    """POST /api/chat/query without body must return 422 Unprocessable Entity."""
    response = client.post("/api/chat/query", json={})
    assert response.status_code == 422


def test_chat_query_requires_query_field():
    """Chat query endpoint must reject requests missing the query field."""
    response = client.post("/api/chat/query", json={"session_id": "test"})
    assert response.status_code == 422


def test_analytics_late_delivery_endpoint():
    """Analytics late delivery endpoint must return a list."""
    response = client.get("/api/analytics/late-delivery")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_analytics_fraud_endpoint():
    """Analytics fraud endpoint must return a list."""
    response = client.get("/api/analytics/fraud")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
