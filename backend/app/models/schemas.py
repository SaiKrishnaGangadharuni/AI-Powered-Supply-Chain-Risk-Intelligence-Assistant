"""Pydantic API schemas (stub — to be expanded per endpoint)."""
from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    query: str = Field(..., min_length=1)
    session_id: Optional[str] = None
    stream: bool = True


class RetrievedDoc(BaseModel):
    id: str
    text: str
    score: float
    metadata: dict = Field(default_factory=dict)


class ChatResponse(BaseModel):
    answer: str
    session_id: str
    severity: Literal["LOW", "MEDIUM", "HIGH"] = "LOW"
    docs: List[RetrievedDoc] = Field(default_factory=list)
    needs_human: bool = False


class FeedbackRequest(BaseModel):
    session_id: str
    message_id: str
    rating: Literal["up", "down"]
    note: Optional[str] = None


class IngestionRunRequest(BaseModel):
    source: Literal["kaggle_mcp", "local"] = "kaggle_mcp"
    dataset: Literal["dataco", "fashion"] = "dataco"
