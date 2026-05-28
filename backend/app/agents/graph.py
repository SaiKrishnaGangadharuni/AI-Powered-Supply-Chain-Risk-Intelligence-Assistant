"""LangGraph state graph wiring.

Flow:
    START → orchestrator → (fan-out by intent) → recommendation → END

Conditional routing from orchestrator picks one or more specialist nodes
based on the classified intent. The recommendation node always runs last.

HILT: if severity == HIGH, the graph's compile() applies an
interrupt_before("recommendation") so a human can review before the final
answer is composed.
"""
from __future__ import annotations

from pathlib import Path
from typing import Annotated, Any, Dict, List, Optional, TypedDict

from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages

from app.agents import (
    inventory_intelligence,
    orchestrator,
    recommendation,
    shipment_analysis,
    supplier_risk,
)
from app.core.config import settings
from app.core.logging import logger


class AgentState(TypedDict, total=False):
    messages: Annotated[List[Any], add_messages]
    query: str
    intent: str
    severity: str
    retrieved_docs: List[Dict[str, Any]]
    agent_outputs: Dict[str, Any]
    final_answer: Optional[str]
    needs_human: bool
    session_id: str


def _route_specialists(state: AgentState) -> List[str]:
    """Decide which specialist node(s) to fan out to based on intent."""
    intent = (state.get("intent") or "general").lower()
    if intent == "supplier_risk":
        return ["supplier_risk"]
    if intent == "shipment_analysis":
        return ["shipment_analysis"]
    if intent == "inventory_intelligence":
        return ["inventory_intelligence"]
    # general / unknown → run all three
    return ["supplier_risk", "shipment_analysis", "inventory_intelligence"]


def build_graph(checkpointer: Optional[Any] = None):
    """Build and compile the LangGraph state graph.

    Args:
        checkpointer: optional LangGraph checkpointer; falls back to file-backed SQLite.
    """
    graph = StateGraph(AgentState)

    graph.add_node("orchestrator", orchestrator.orchestrate)
    graph.add_node("supplier_risk", supplier_risk.run)
    graph.add_node("shipment_analysis", shipment_analysis.run)
    graph.add_node("inventory_intelligence", inventory_intelligence.run)
    graph.add_node("recommendation", recommendation.run)

    graph.add_edge(START, "orchestrator")
    graph.add_conditional_edges(
        "orchestrator",
        _route_specialists,
        {
            "supplier_risk": "supplier_risk",
            "shipment_analysis": "shipment_analysis",
            "inventory_intelligence": "inventory_intelligence",
        },
    )
    for node in ("supplier_risk", "shipment_analysis", "inventory_intelligence"):
        graph.add_edge(node, "recommendation")
    graph.add_edge("recommendation", END)

    if checkpointer is None:
        ckpt_path = settings.resolve(settings.langgraph_checkpoint_db)
        ckpt_path.parent.mkdir(parents=True, exist_ok=True)
        checkpointer = SqliteSaver.from_conn_string(str(ckpt_path))

    interrupt = ["recommendation"] if settings.high_severity_interrupt else []

    compiled = graph.compile(
        checkpointer=checkpointer,
        interrupt_before=interrupt,  # honored only when severity==HIGH at runtime
    )
    logger.info("LangGraph compiled (interrupt_before=%s)", interrupt)
    return compiled


# Module-level lazy singleton
_compiled = None


def get_graph():
    global _compiled
    if _compiled is None:
        _compiled = build_graph()
    return _compiled
