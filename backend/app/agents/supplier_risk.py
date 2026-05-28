"""Supplier Risk agent — focuses on supplier reliability, defect rates, lead times."""
from __future__ import annotations

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents._common import format_docs_for_prompt, node_span, retrieve
from app.core.llm_router import TaskType, router

SYSTEM = (
    "You are the Supplier Risk Analyst. Focus on supplier reliability, defect rates, "
    "lead times, manufacturing quality, and inspection failures. Use only the "
    "retrieved supply-chain incidents below. Be specific, cite doc ids inline like "
    "[Doc N], and call out risk indicators explicitly."
)


def run(state: dict) -> dict:
    query = state.get("query", "")
    with node_span("supplier_risk"):
        retrieved = retrieve(query)
        docs = retrieved["docs"]
        context = retrieved["context"]

        msgs = [
            SystemMessage(content=SYSTEM),
            HumanMessage(
                content=(
                    f"Query: {query}\n\n"
                    f"Retrieved incidents:\n{format_docs_for_prompt(docs)}\n\n"
                    "Produce a concise analysis (3-6 sentences)."
                )
            ),
        ]
        resp = router.invoke(TaskType.SUMMARIZATION, msgs)
        answer = getattr(resp, "content", "") or ""

    prior = state.get("agent_outputs", {}) or {}
    prior_docs = state.get("retrieved_docs", []) or []
    return {
        "retrieved_docs": prior_docs + docs,
        "agent_outputs": {
            **prior,
            "supplier_risk": {
                "answer": answer, "context": context,
                "max_score": retrieved["max_score"], "doc_count": len(docs),
            },
        },
    }
