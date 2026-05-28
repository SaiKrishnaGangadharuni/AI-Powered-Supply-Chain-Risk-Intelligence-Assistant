"""Ingestion pipeline orchestrator.

Flow:
    1. Resolve source (Kaggle MCP → local CSV fallback)
    2. Load DataFrame
    3. Random-sample DataCo down to settings.dataco_sample_rows (fashion: keep all)
    4. Transform rows → natural-language incident documents
    5. Embed with bge-small (in batches)
    6. Upsert into ChromaDB
    7. Build BM25 index over the same docs
    8. Return a status dict (counts, source used, timings)

Pipeline state is exposed via the /api/ingestion endpoints so the Admin UI
can poll progress.
"""
from __future__ import annotations

import shutil
import time
from dataclasses import dataclass, field
from pathlib import Path
from threading import Lock
from typing import Any, Dict, List, Literal, Optional

import pandas as pd

from app.core.config import settings
from app.core.logging import logger
from app.ingestion import kaggle_mcp, local_loader, transformer
from app.retrieval.bm25_index import BM25Index
from app.retrieval.embeddings import embed_texts
from app.retrieval.vector_store import VectorStore

SourceName = Literal["dataco", "fashion"]
SourceMode = Literal["kaggle_mcp", "local", "auto"]


# ---------------- pipeline status (thread-safe singleton) ----------------
@dataclass
class PipelineStatus:
    state: str = "idle"               # idle | running | done | error
    stage: str = ""                    # last completed stage
    source_used: Optional[str] = None  # "kaggle_mcp" | "local"
    dataset: Optional[str] = None
    rows_loaded: int = 0
    docs_built: int = 0
    docs_indexed: int = 0
    vector_count: int = 0
    bm25_count: int = 0
    elapsed_sec: float = 0.0
    error: Optional[str] = None
    started_at: Optional[float] = None
    finished_at: Optional[float] = None
    events: List[Dict[str, Any]] = field(default_factory=list)

    def event(self, msg: str) -> None:
        self.events.append({"t": time.time(), "msg": msg})
        if len(self.events) > 100:
            self.events = self.events[-100:]


class _StatusStore:
    def __init__(self) -> None:
        self._status = PipelineStatus()
        self._lock = Lock()

    def get(self) -> PipelineStatus:
        with self._lock:
            return self._status

    def set(self, status: PipelineStatus) -> None:
        with self._lock:
            self._status = status


status_store = _StatusStore()


# ---------------- main pipeline ----------------
def run_pipeline(
    dataset: SourceName = "dataco",
    source: SourceMode = "auto",
    reset: bool = False,
) -> Dict[str, Any]:
    """Run the full ingestion pipeline.

    Args:
        dataset: which dataset to ingest
        source:  "kaggle_mcp" forces MCP path; "local" forces CSV; "auto" tries MCP then CSV
        reset:   drop existing vector + BM25 indexes first

    Returns: dict snapshot of the resulting status.
    """
    status = PipelineStatus(state="running", dataset=dataset, started_at=time.time())
    status_store.set(status)
    t0 = time.time()

    try:
        # 1. Load DataFrame
        df, source_used = _load_dataframe(dataset, source, status)
        status.source_used = source_used
        status.rows_loaded = len(df)
        status.stage = "loaded"
        status.event(f"Loaded {len(df):,} rows via {source_used}")

        # 2. Sample
        df = _maybe_sample(df, dataset)
        status.event(f"After sampling: {len(df):,} rows")

        # 3. Transform
        docs = transformer.transform_dataframe(df, dataset)
        status.docs_built = len(docs)
        status.stage = "transformed"
        status.event(f"Built {len(docs):,} incident documents")

        # 4. Vector store (optional reset)
        vs = VectorStore()
        bm25 = BM25Index()
        if reset:
            vs.reset()
            status.event("Reset vector + BM25 indexes")

        # 5. Embed + upsert in batches
        _embed_and_upsert(docs, vs, status)

        # 6. BM25
        bm25.build(
            ids=[d["id"] for d in docs],
            documents=[d["text"] for d in docs],
            metadatas=[d["metadata"] for d in docs],
        )
        status.bm25_count = bm25.count()
        status.stage = "bm25_built"
        status.event(f"BM25 index built with {bm25.count():,} docs")

        status.vector_count = vs.count()
        status.state = "done"
        status.stage = "done"
        status.finished_at = time.time()
        status.elapsed_sec = round(status.finished_at - t0, 2)
        logger.info(
            f"Ingestion done in {status.elapsed_sec}s — "
            f"vectors={status.vector_count} bm25={status.bm25_count}"
        )

    except Exception as e:  # noqa: BLE001
        logger.exception("Ingestion failed")
        status.state = "error"
        status.error = repr(e)
        status.finished_at = time.time()
        status.elapsed_sec = round(status.finished_at - t0, 2)

    status_store.set(status)
    return status_snapshot()


# ---------------- helpers ----------------
def _load_dataframe(
    dataset: SourceName,
    source: SourceMode,
    status: PipelineStatus,
) -> tuple[pd.DataFrame, str]:
    """Returns (df, source_used)."""
    want_mcp = source in ("kaggle_mcp", "auto")
    if want_mcp:
        try:
            if kaggle_mcp.is_available():
                slug = (
                    settings.dataco_dataset if dataset == "dataco"
                    else settings.fashion_dataset
                )
                dest = settings.resolve(f"./data/kaggle_cache/{dataset}")
                status.event(f"MCP fetch_kaggle_dataset({slug})")
                payload = kaggle_mcp.fetch_dataset(slug, str(dest))
                csv_path = _pick_csv(payload.get("files", []), dataset)
                if not csv_path:
                    raise RuntimeError("No CSV in MCP-downloaded dataset files")
                df = _read_csv(csv_path, dataset)
                return df, "kaggle_mcp"
            status.event("MCP not available — falling back to local CSV")
        except Exception as e:  # noqa: BLE001
            if source == "kaggle_mcp":
                raise
            status.event(f"MCP path failed ({e!r}) — using local CSV")

    # local fallback
    if dataset == "dataco":
        return local_loader.load_dataco_csv(), "local"
    return local_loader.load_fashion_csv(), "local"


def _pick_csv(files: List[str], dataset: SourceName) -> Optional[str]:
    """Choose the right CSV out of the downloaded files."""
    csvs = [f for f in files if f.lower().endswith(".csv")]
    if not csvs:
        return None
    # Prefer the largest CSV (DataCo) or first one for fashion
    if dataset == "dataco":
        return max(csvs, key=lambda p: Path(p).stat().st_size if Path(p).exists() else 0)
    return csvs[0]


def _read_csv(path: str, dataset: SourceName) -> pd.DataFrame:
    enc = "latin-1" if dataset == "dataco" else "utf-8"
    return pd.read_csv(path, encoding=enc, low_memory=False)


def _maybe_sample(df: pd.DataFrame, dataset: SourceName) -> pd.DataFrame:
    if dataset == "dataco" and len(df) > settings.dataco_sample_rows:
        return df.sample(
            n=settings.dataco_sample_rows,
            random_state=42,
        ).reset_index(drop=True)
    return df


def _embed_and_upsert(
    docs: List[Dict[str, Any]],
    vs: VectorStore,
    status: PipelineStatus,
) -> None:
    bs = settings.incident_doc_batch_size
    total = len(docs)
    indexed = 0
    for i in range(0, total, bs):
        chunk = docs[i : i + bs]
        ids = [d["id"] for d in chunk]
        texts = [d["text"] for d in chunk]
        metas = [d["metadata"] for d in chunk]
        embs = embed_texts(texts)
        vs.upsert(ids, texts, embs, metas)
        indexed += len(chunk)
        status.docs_indexed = indexed
        status.stage = f"embedding {indexed}/{total}"
        if i // bs % 5 == 0:
            status.event(f"Embedded {indexed}/{total}")
    status.event(f"Embedded + upserted {indexed}/{total}")


# ---------------- read-side ----------------
def status_snapshot() -> Dict[str, Any]:
    s = status_store.get()
    return {
        "state": s.state,
        "stage": s.stage,
        "source_used": s.source_used,
        "dataset": s.dataset,
        "rows_loaded": s.rows_loaded,
        "docs_built": s.docs_built,
        "docs_indexed": s.docs_indexed,
        "vector_count": s.vector_count,
        "bm25_count": s.bm25_count,
        "elapsed_sec": s.elapsed_sec,
        "error": s.error,
        "started_at": s.started_at,
        "finished_at": s.finished_at,
        "recent_events": s.events[-15:],
    }


def reset_caches() -> None:
    """Optional helper to wipe the Kaggle download cache."""
    cache = settings.resolve("./data/kaggle_cache")
    if cache.exists():
        shutil.rmtree(cache, ignore_errors=True)
