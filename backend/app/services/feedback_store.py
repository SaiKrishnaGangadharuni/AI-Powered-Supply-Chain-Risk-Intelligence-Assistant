"""SQLite-backed HILT feedback store."""
from __future__ import annotations

import sqlite3
import time
from threading import Lock
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.core.logging import logger


class FeedbackStore:
    def __init__(self) -> None:
        self.path = settings.resolve(settings.sqlite_path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = Lock()
        self._init()

    def _conn(self) -> sqlite3.Connection:
        return sqlite3.connect(str(self.path), check_same_thread=False)

    def _init(self) -> None:
        with self._lock, self._conn() as c:
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS feedback (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    message_id TEXT NOT NULL,
                    rating TEXT NOT NULL,
                    note TEXT,
                    ts REAL NOT NULL
                )
                """
            )
            c.execute(
                "CREATE INDEX IF NOT EXISTS idx_feedback_session ON feedback(session_id)"
            )
            c.commit()
        logger.info(f"FeedbackStore ready at {self.path}")

    def add(
        self,
        session_id: str,
        message_id: str,
        rating: str,
        note: Optional[str] = None,
    ) -> None:
        with self._lock, self._conn() as c:
            c.execute(
                "INSERT INTO feedback (session_id, message_id, rating, note, ts) VALUES (?, ?, ?, ?, ?)",
                (session_id, message_id, rating, note, time.time()),
            )
            c.commit()

    def list(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._lock, self._conn() as c:
            cur = c.execute(
                "SELECT id, session_id, message_id, rating, note, ts FROM feedback "
                "ORDER BY ts DESC LIMIT ?",
                (limit,),
            )
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]


feedback_store = FeedbackStore()
