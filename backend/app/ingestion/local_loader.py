"""Local CSV fallback loaders (used when MCP server is unavailable)."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import pandas as pd

from app.core.config import settings
from app.core.logging import logger


def _resolve(path_str: str) -> Path:
    return settings.resolve(path_str)


def load_dataco_csv(path: Optional[str] = None) -> pd.DataFrame:
    """DataCo Smart Supply Chain — ~180k rows, e-commerce retail.

    encoding='latin-1' because the file contains non-UTF8 customer names.
    """
    p = _resolve(path or settings.local_dataco_csv)
    if not p.exists():
        raise FileNotFoundError(f"DataCo CSV not found at {p}")
    logger.info(f"Loading DataCo CSV from {p}")
    df = pd.read_csv(p, encoding="latin-1", low_memory=False)
    logger.info(f"Loaded DataCo: {len(df):,} rows, {len(df.columns)} cols")
    return df


def load_fashion_csv(path: Optional[str] = None) -> pd.DataFrame:
    """Fashion / beauty supply chain — 100 rows."""
    p = _resolve(path or settings.local_fashion_csv)
    if not p.exists():
        raise FileNotFoundError(f"Fashion CSV not found at {p}")
    logger.info(f"Loading Fashion CSV from {p}")
    df = pd.read_csv(p)
    logger.info(f"Loaded Fashion: {len(df):,} rows, {len(df.columns)} cols")
    return df
