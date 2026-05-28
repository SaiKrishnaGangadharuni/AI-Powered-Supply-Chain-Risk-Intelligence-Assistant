"""
Custom MCP server exposing Kaggle dataset operations as MCP tools.

Run standalone (stdio transport):
    python -m mcp_server.server

Tools exposed:
    - list_kaggle_files(slug): list files inside a Kaggle dataset
    - fetch_kaggle_dataset(slug, dest_dir): download + unzip a dataset, return file paths
    - ping(): liveness check

Authentication: uses KAGGLE_USERNAME + KAGGLE_KEY from environment (.env).
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import List

# Make sibling `app/` importable when run as `python -m mcp_server.server`
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT.parent / ".env")

from mcp.server.fastmcp import FastMCP  # noqa: E402

mcp = FastMCP("kaggle-supply-chain-mcp")


def _ensure_kaggle_env() -> None:
    """Set kaggle.json-equivalent env vars so the kaggle CLI/SDK can authenticate."""
    user = os.getenv("KAGGLE_USERNAME", "")
    key = os.getenv("KAGGLE_KEY", "")
    if not user or not key:
        raise RuntimeError(
            "KAGGLE_USERNAME / KAGGLE_KEY missing in environment. "
            "Set them in .env before starting the MCP server."
        )
    os.environ["KAGGLE_USERNAME"] = user
    os.environ["KAGGLE_KEY"] = key


def _kaggle_api():
    """Lazy import — kaggle SDK validates creds on import."""
    _ensure_kaggle_env()
    from kaggle.api.kaggle_api_extended import KaggleApi

    api = KaggleApi()
    api.authenticate()
    return api


# ---------------- MCP tools ----------------
@mcp.tool()
def ping() -> str:
    """Liveness check for the MCP server."""
    return "pong"


@mcp.tool()
def list_kaggle_files(slug: str) -> str:
    """
    List files inside a Kaggle dataset.

    Args:
        slug: Kaggle dataset slug, e.g. "shashwatwork/dataco-smart-supply-chain-for-big-data-analysis"

    Returns:
        JSON string: {"slug": str, "files": [{"name": str, "size": int}, ...]}
    """
    api = _kaggle_api()
    files = api.dataset_list_files(slug).files
    payload = {
        "slug": slug,
        "files": [{"name": f.name, "size": getattr(f, "totalBytes", None)} for f in files],
    }
    return json.dumps(payload)


@mcp.tool()
def fetch_kaggle_dataset(slug: str, dest_dir: str) -> str:
    """
    Download and unzip a Kaggle dataset into `dest_dir`.

    Args:
        slug: Kaggle dataset slug
        dest_dir: absolute path of destination directory; created if missing

    Returns:
        JSON string: {"slug": str, "dest_dir": str, "files": [absolute paths...]}
    """
    api = _kaggle_api()
    out = Path(dest_dir).expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)

    api.dataset_download_files(slug, path=str(out), unzip=True, quiet=True)

    files: List[str] = []
    for p in out.rglob("*"):
        if p.is_file():
            files.append(str(p))

    return json.dumps({"slug": slug, "dest_dir": str(out), "files": files})


if __name__ == "__main__":
    # stdio transport (default) — Claude Desktop / our MCP client both speak this
    mcp.run()
