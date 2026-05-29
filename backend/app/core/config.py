"""Application configuration loaded from .env via Pydantic settings."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- LLM Providers ----
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    groq_api_key: str = ""
    groq_model_small: str = "llama-3.1-8b-instant"
    groq_model_large: str = "llama-3.3-70b-versatile"

    llm_fallback_chain: str = "openai_mini,groq_large,groq_small"

    # ---- Embeddings / Reranker ----
    embedding_provider: str = "openai"  # "openai" | "fastembed" (local ONNX fallback)
    embedding_model: str = "text-embedding-3-small"
    embedding_dim: int = 1536
    fastembed_model: str = "BAAI/bge-small-en-v1.5"  # used when embedding_provider=fastembed (384-dim)
    reranker_model: str = "cosine"  # cross-encoder replaced with cosine; no torch needed
    huggingface_token: str = ""

    # ---- Vector Store ----
    chroma_persist_dir: str = "./storage/chroma"
    chroma_collection: str = "supply_chain_incidents"

    # ---- Hybrid Retrieval ----
    dense_top_k: int = 20
    sparse_top_k: int = 20
    rrf_k: int = 60
    rerank_top_k: int = 5
    crag_relevance_threshold: float = 0.6

    # ---- Caches ----
    semantic_cache_threshold: float = 0.92
    semantic_cache_max_items: int = 500
    keyword_cache_max_items: int = 1000

    # ---- LangSmith ----
    langchain_tracing_v2: bool = True
    langchain_endpoint: str = "https://api.smith.langchain.com"
    langchain_api_key: str = ""
    langchain_project: str = "supply-chain-risk-assistant"

    # ---- Kaggle ----
    kaggle_username: str = ""
    kaggle_key: str = ""
    kaggle_mcp_url: str = "https://www.kaggle.com/mcp"
    dataco_dataset: str = "shashwatwork/dataco-smart-supply-chain-for-big-data-analysis"
    fashion_dataset: str = "harshsingh2209/supply-chain-analysis"

    # ---- Ingestion ----
    dataco_sample_rows: int = 2500
    incident_doc_batch_size: int = 128
    local_dataco_csv: str = (
        "./data/source_dataset/DataCo SMART SUPPLY CHAIN FOR BIG DATA ANALYSIS/"
        "DataCoSupplyChainDataset.csv"
    )
    local_fashion_csv: str = "./data/source_dataset/supply_chain_data.csv"

    # ---- Persistence ----
    sqlite_path: str = "./storage/sqlite/app.db"
    langgraph_checkpoint_db: str = "./storage/sqlite/checkpoints.db"

    # ---- Guardrails ----
    max_context_tokens: int = 6000
    llmlingua_compression_ratio: float = 0.5
    injection_detection_enabled: bool = True
    privacy_filter_enabled: bool = True

    # ---- HILT ----
    high_severity_interrupt: bool = True

    # ---- API ----
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # ---- Logging ----
    log_level: str = "INFO"

    # ---- Derived helpers ----
    @property
    def fallback_chain_list(self) -> List[str]:
        return [s.strip() for s in self.llm_fallback_chain.split(",") if s.strip()]

    @property
    def cors_origins_list(self) -> List[str]:
        return [s.strip() for s in self.cors_origins.split(",") if s.strip()]

    @property
    def root_dir(self) -> Path:
        return ROOT_DIR

    def resolve(self, path_str: str) -> Path:
        p = Path(path_str)
        return p if p.is_absolute() else (ROOT_DIR / p).resolve()

    @field_validator("crag_relevance_threshold", "semantic_cache_threshold")
    @classmethod
    def _bounds_0_1(cls, v: float) -> float:
        if not 0.0 <= v <= 1.0:
            raise ValueError("threshold must be between 0 and 1")
        return v


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
