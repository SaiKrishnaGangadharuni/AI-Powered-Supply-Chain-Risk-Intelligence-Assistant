"""In-memory LRU cache for keyword lookups (supplier names, regions, etc.)."""
from __future__ import annotations

from collections import OrderedDict
from threading import Lock
from typing import Any, Optional

from app.core.config import settings


class KeywordCache:
    def __init__(self, max_items: Optional[int] = None) -> None:
        self.max_items = max_items or settings.keyword_cache_max_items
        self._store: "OrderedDict[str, Any]" = OrderedDict()
        self._lock = Lock()

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            if key not in self._store:
                return None
            val = self._store.pop(key)
            self._store[key] = val
            return val

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            if key in self._store:
                self._store.pop(key)
            self._store[key] = value
            while len(self._store) > self.max_items:
                self._store.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    def size(self) -> int:
        return len(self._store)


keyword_cache = KeywordCache()
