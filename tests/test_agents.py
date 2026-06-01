"""
Tests for the Orchestrator agent — intent classification and severity routing.
Run from the backend/ directory:
    pytest ../tests/test_agents.py -v
"""
import pytest
from unittest.mock import MagicMock, patch

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_llm_response(intent: str, severity: str) -> MagicMock:
    """Build a mock LLM response with the given intent/severity JSON."""
    import json
    mock = MagicMock()
    mock.content = json.dumps({"intent": intent, "severity": severity, "rationale": "test"})
    return mock


# ── Orchestrator parse logic ──────────────────────────────────────────────────

def test_orchestrator_parse_valid_json():
    """_parse must correctly extract intent and severity from valid JSON."""
    from app.agents.orchestrator import _parse
    result = _parse('{"intent": "shipment_analysis", "severity": "HIGH", "rationale": "late"}')
    assert result["intent"] == "shipment_analysis"
    assert result["severity"] == "HIGH"


def test_orchestrator_parse_embedded_json():
    """_parse must extract JSON even when embedded in surrounding text."""
    from app.agents.orchestrator import _parse
    raw = 'Sure! Here is the result: {"intent": "supplier_risk", "severity": "LOW", "rationale": "ok"} Done.'
    result = _parse(raw)
    assert result["intent"] == "supplier_risk"


def test_orchestrator_parse_invalid_falls_back_to_general():
    """_parse must return general/LOW defaults when JSON is completely broken."""
    from app.agents.orchestrator import _parse
    result = _parse("this is not json at all")
    assert result["intent"] == "general"
    assert result["severity"] == "LOW"


def test_orchestrator_routes_shipment_query():
    """Orchestrator must classify a late delivery query as shipment_analysis."""
    from app.agents.orchestrator import orchestrate

    mock_response = _make_llm_response("shipment_analysis", "MEDIUM")

    with patch("app.agents.orchestrator.router") as mock_router:
        mock_router.invoke.return_value = mock_response
        state = {"query": "Which shipping mode has the highest late delivery rate?", "session_id": "test"}
        result = orchestrate(state)

    assert result.get("intent") == "shipment_analysis"


def test_orchestrator_routes_fraud_query_as_high_severity():
    """Orchestrator must classify a fraud query as HIGH severity."""
    from app.agents.orchestrator import orchestrate

    mock_response = _make_llm_response("supplier_risk", "HIGH")

    with patch("app.agents.orchestrator.router") as mock_router:
        mock_router.invoke.return_value = mock_response
        state = {"query": "I have a suspected fraud order from LATAM worth $50,000", "session_id": "test"}
        result = orchestrate(state)

    assert result.get("severity") == "HIGH"


def test_orchestrator_routes_inventory_query():
    """Orchestrator must classify a stockout query as inventory_intelligence."""
    from app.agents.orchestrator import orchestrate

    mock_response = _make_llm_response("inventory_intelligence", "MEDIUM")

    with patch("app.agents.orchestrator.router") as mock_router:
        mock_router.invoke.return_value = mock_response
        state = {"query": "What are the current stockout risks in the fashion supply chain?", "session_id": "test"}
        result = orchestrate(state)

    assert result.get("intent") == "inventory_intelligence"
