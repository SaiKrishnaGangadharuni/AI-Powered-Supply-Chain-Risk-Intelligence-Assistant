"""Shared helpers for specialist agents."""
from __future__ import annotations

import time
from contextlib import contextmanager
from typing import Any, Dict, List, Optional

from app.core.logging import logger
from app.guardrails.llm_compress import compress
from app.retrieval.hybrid_search import hybrid_search
from app.services.event_bus import event_bus


def retrieve(query: str, where: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Run hybrid retrieval and return {docs, max_score, reformulated_from, context}."""
    t0 = time.time()
    res = hybrid_search(query, where=where)
    docs = res["docs"]
    context = compress([d.get("text", "") for d in docs])
    event_bus.emit(
        "retrieval",
        elapsed_ms=int((time.time() - t0) * 1000),
        docs=len(docs),
        max_score=res.get("max_score", 0.0),
        reformulated_from=res.get("reformulated_from"),
    )
    return {**res, "context": context}


def format_docs_for_prompt(docs: List[Dict[str, Any]], limit: int = 5) -> str:
    out = []
    for i, d in enumerate(docs[:limit], 1):
        meta = d.get("metadata", {})
        out.append(
            f"[Doc {i} | id={d.get('id')} | severity={meta.get('severity', '?')} "
            f"| source={meta.get('source', '?')}]\n{d.get('text', '')}"
        )
    return "\n\n".join(out)


@contextmanager
def node_span(name: str, **extra: Any):
    """Emit node_start / node_end with elapsed timing."""
    t0 = time.time()
    event_bus.emit("node_start", node=name, **extra)
    err: Optional[BaseException] = None
    try:
        yield
    except BaseException as e:  # noqa: BLE001
        err = e
        raise
    finally:
        payload = {"elapsed_ms": int((time.time() - t0) * 1000)}
        if err is not None:
            event_bus.emit("node_error", node=name, error=repr(err), **payload)
        else:
            event_bus.emit("node_end", node=name, **payload)
