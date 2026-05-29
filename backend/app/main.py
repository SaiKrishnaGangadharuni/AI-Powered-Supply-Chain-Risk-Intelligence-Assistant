"""FastAPI application entrypoint."""
from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging import configure_logging, logger


def _configure_langsmith() -> None:
    """Set the LangChain/LangSmith env vars so traces flow automatically."""
    if settings.langchain_tracing_v2 and settings.langchain_api_key:
        os.environ["LANGCHAIN_TRACING_V2"] = "true"
        os.environ["LANGCHAIN_ENDPOINT"] = settings.langchain_endpoint
        os.environ["LANGCHAIN_API_KEY"] = settings.langchain_api_key
        os.environ["LANGCHAIN_PROJECT"] = settings.langchain_project
        logger.info(f"LangSmith tracing enabled (project={settings.langchain_project})")
    else:
        os.environ.pop("LANGCHAIN_TRACING_V2", None)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    _configure_langsmith()
    logger.info("Booting Supply Chain Risk Intelligence Assistant API")
    yield
    logger.info("Shutting down")


app = FastAPI(
    title="Supply Chain Risk Intelligence Assistant",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "supply-chain-risk-assistant"}


# Routers
from app.api.routes import analytics, anomaly, chat, evaluation, ingestion, mcp_browser  # noqa: E402

app.include_router(chat.router,       prefix="/api/chat",       tags=["chat"])
app.include_router(ingestion.router,  prefix="/api/ingestion",  tags=["ingestion"])
app.include_router(evaluation.router, prefix="/api/evaluation", tags=["evaluation"])
app.include_router(mcp_browser.router,prefix="/api/mcp",        tags=["mcp"])
app.include_router(anomaly.router,    prefix="/api/anomaly",    tags=["anomaly"])
app.include_router(analytics.router,  prefix="/api/analytics",  tags=["analytics"])
