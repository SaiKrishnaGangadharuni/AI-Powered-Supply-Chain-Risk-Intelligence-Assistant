"""Session-scoped event bus for live orchestration telemetry.

Usage:
    from app.services.event_bus import event_bus, current_session_id
    # in agent / retrieval / guardrail code:
    event_bus.emit("node_start", node="supplier_risk")
    # in WS handler:
    token = current_session_id.set(session_id)
    try:
        ... run graph ...
        events = event_bus.drain(session_id)
    finally:
        current_session_id.reset(token)
"""
from __future__ import annotations

import time
from collections import defaultdict
from contextvars import ContextVar
from threading import Lock
from typing import Any, Dict, List

current_session_id: ContextVar[str] = ContextVar("current_session_id", default="")


class EventBus:
    def __init__(self) -> None:
        self._lock = Lock()
        self._events: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

    def emit(self, kind: str, **payload: Any) -> None:
        sid = payload.pop("session_id", None) or current_session_id.get("")
        if not sid:
            return
        event = {"t": time.time(), "type": kind, **payload}
        with self._lock:
            self._events[sid].append(event)

    def drain(self, session_id: str) -> List[Dict[str, Any]]:
        with self._lock:
            evs = self._events.pop(session_id, [])
        return evs

    def clear(self, session_id: str) -> None:
        with self._lock:
            self._events.pop(session_id, None)


event_bus = EventBus()
