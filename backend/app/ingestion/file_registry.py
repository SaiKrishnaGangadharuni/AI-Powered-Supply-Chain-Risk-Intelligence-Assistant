"""Tracks which files have already been loaded into the vector store."""
from __future__ import annotations

import json
import time
from pathlib import Path
from threading import Lock
from typing import Dict, Optional

from app.core.config import settings


class LoadedFileRegistry:
    """Persists loaded-file metadata to a JSON file in data/."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._path = settings.resolve("./data/loaded_files.json")
        self._path.parent.mkdir(parents=True, exist_ok=True)

    def _read(self) -> Dict[str, dict]:
        if not self._path.exists():
            return {}
        try:
            return json.loads(self._path.read_text(encoding="utf-8"))
        except Exception:
            return {}

    def _write(self, data: Dict[str, dict]) -> None:
        self._path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def is_loaded(self, key: str) -> bool:
        return key in self._read()

    def get(self, key: str) -> Optional[dict]:
        return self._read().get(key)

    def mark_loaded(self, key: str, rows: int, docs: int) -> None:
        with self._lock:
            data = self._read()
            data[key] = {"rows": rows, "docs": docs, "loaded_at": time.time()}
            self._write(data)

    def remove(self, key: str) -> None:
        with self._lock:
            data = self._read()
            data.pop(key, None)
            self._write(data)

    def clear_all(self) -> None:
        with self._lock:
            self._write({})

    def all(self) -> Dict[str, dict]:
        return self._read()


file_registry = LoadedFileRegistry()
