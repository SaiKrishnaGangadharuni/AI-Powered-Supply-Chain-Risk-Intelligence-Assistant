"""
MCP client that spawns our local Kaggle MCP server over stdio and calls tools.

This is the *demonstrable* MCP integration:
    pipeline → MCP client → spawns `python -m mcp_server.server` (stdio)
                          → calls `fetch_kaggle_dataset` tool
                          → returns local CSV paths

If anything in the MCP path fails (server can't start, Kaggle creds missing,
network failure), the caller is expected to fall back to local CSV loading.
"""
from __future__ import annotations

import asyncio
import json
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from app.core.config import settings
from app.core.logging import logger

# Path to backend/ (parent of app/ and mcp_server/)
BACKEND_DIR = Path(__file__).resolve().parents[2]


def _server_params() -> StdioServerParameters:
    """Spawn the MCP server as a subprocess: `python -m mcp_server.server`."""
    return StdioServerParameters(
        command=sys.executable,
        args=["-m", "mcp_server.server"],
        cwd=str(BACKEND_DIR),
        env=None,  # inherits current env (which already has KAGGLE_* loaded)
    )


@asynccontextmanager
async def _mcp_session():
    params = _server_params()
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            yield session


def _extract_text(result: Any) -> str:
    """Pull text payload from an MCP CallToolResult."""
    parts = []
    for c in getattr(result, "content", []) or []:
        text = getattr(c, "text", None)
        if text:
            parts.append(text)
    return "\n".join(parts)


async def _call_tool_async(name: str, arguments: Dict[str, Any]) -> Any:
    async with _mcp_session() as session:
        logger.info(f"[MCP] calling tool {name} args={arguments}")
        result = await session.call_tool(name, arguments=arguments)
        text = _extract_text(result)
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return text


def call_tool(name: str, arguments: Optional[Dict[str, Any]] = None) -> Any:
    """Sync wrapper around an MCP tool call."""
    return asyncio.run(_call_tool_async(name, arguments or {}))


# ---------------- High-level helpers ----------------
def ping() -> bool:
    try:
        out = call_tool("ping")
        return out == "pong" or out == '"pong"'
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[MCP] ping failed: {e!r}")
        return False


def list_files(slug: str) -> List[Dict[str, Any]]:
    payload = call_tool("list_kaggle_files", {"slug": slug})
    if isinstance(payload, dict):
        return payload.get("files", [])
    return []


def fetch_dataset(slug: str, dest_dir: str) -> Dict[str, Any]:
    """Returns {"slug", "dest_dir", "files": [...]}."""
    payload = call_tool("fetch_kaggle_dataset", {"slug": slug, "dest_dir": dest_dir})
    if not isinstance(payload, dict):
        raise RuntimeError(f"Unexpected MCP payload: {payload!r}")
    return payload


def is_available() -> bool:
    """Quick check used by the pipeline to decide MCP vs local fallback."""
    if not settings.kaggle_username or not settings.kaggle_key:
        return False
    return ping()
