"""LLM routing with task-specific model selection + fallback chain."""
from __future__ import annotations

from enum import Enum
from typing import Any, Callable, Dict, List, Optional

from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.core.config import settings
from app.core.logging import logger


class LLMProvider(str, Enum):
    OPENAI_MINI = "openai_mini"
    GROQ_LARGE = "groq_large"
    GROQ_SMALL = "groq_small"


class TaskType(str, Enum):
    """Task profile → maps to a preferred provider."""

    ROUTING = "routing"               # cheap classification → groq_small
    SUMMARIZATION = "summarization"   # mid-weight → groq_large
    REASONING = "reasoning"           # complex → openai_mini
    JUDGE = "judge"                   # eval / LLM-as-judge → openai_mini
    RECOMMENDATION = "recommendation" # final response → openai_mini


# Task → preferred provider
TASK_PREFERENCE: Dict[TaskType, LLMProvider] = {
    TaskType.ROUTING: LLMProvider.GROQ_SMALL,
    TaskType.SUMMARIZATION: LLMProvider.GROQ_LARGE,
    TaskType.REASONING: LLMProvider.OPENAI_MINI,
    TaskType.JUDGE: LLMProvider.OPENAI_MINI,
    TaskType.RECOMMENDATION: LLMProvider.OPENAI_MINI,
}


class LLMRouter:
    """
    Routes chat completions to the best LLM for the given task,
    with an explicit fallback chain on failure.

    Providers are constructed lazily so missing keys never break import.
    """

    def __init__(self) -> None:
        self._clients: Dict[LLMProvider, Any] = {}
        self._fallback_chain: List[LLMProvider] = [
            LLMProvider(name) for name in settings.fallback_chain_list
        ]

    # ---------- Client lazy construction ----------
    def _get_client(self, provider: LLMProvider) -> Any:
        if provider in self._clients:
            return self._clients[provider]

        if provider == LLMProvider.OPENAI_MINI:
            from langchain_openai import ChatOpenAI

            client = ChatOpenAI(
                model=settings.openai_model,
                api_key=settings.openai_api_key or None,
                temperature=0.2,
                timeout=60,
                max_retries=0,  # we handle retry/fallback ourselves
            )
        elif provider == LLMProvider.GROQ_LARGE:
            from langchain_groq import ChatGroq

            client = ChatGroq(
                model=settings.groq_model_large,
                api_key=settings.groq_api_key or None,
                temperature=0.2,
                timeout=60,
                max_retries=0,
            )
        elif provider == LLMProvider.GROQ_SMALL:
            from langchain_groq import ChatGroq

            client = ChatGroq(
                model=settings.groq_model_small,
                api_key=settings.groq_api_key or None,
                temperature=0.0,
                timeout=30,
                max_retries=0,
            )
        else:
            raise ValueError(f"Unknown provider: {provider}")

        self._clients[provider] = client
        return client

    # ---------- Public API ----------
    def get_for_task(self, task: TaskType) -> Any:
        provider = TASK_PREFERENCE[task]
        return self._get_client(provider)

    def get_chain_for_task(self, task: TaskType) -> List[LLMProvider]:
        """Preferred provider first, then fallbacks (deduped)."""
        preferred = TASK_PREFERENCE[task]
        chain: List[LLMProvider] = [preferred]
        for p in self._fallback_chain:
            if p not in chain:
                chain.append(p)
        return chain

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
        retry=retry_if_exception_type(Exception),
        reraise=True,
    )
    def _invoke_once(self, client: Any, messages: Any, **kwargs: Any) -> Any:
        return client.invoke(messages, **kwargs)

    def invoke(
        self,
        task: TaskType,
        messages: Any,
        on_fallback: Optional[Callable[[LLMProvider, Exception], None]] = None,
        **kwargs: Any,
    ) -> Any:
        """Run a chat completion with automatic provider fallback."""
        last_err: Optional[Exception] = None
        for provider in self.get_chain_for_task(task):
            try:
                client = self._get_client(provider)
                logger.debug(f"LLM invoke via {provider} for task={task}")
                return self._invoke_once(client, messages, **kwargs)
            except Exception as e:  # noqa: BLE001
                last_err = e
                logger.warning(f"LLM provider {provider} failed: {e!r}")
                if on_fallback:
                    on_fallback(provider, e)
                continue
        raise RuntimeError(
            f"All LLM providers in fallback chain failed for task={task}: {last_err!r}"
        )


# Module-level singleton
router = LLMRouter()


__all__ = ["LLMRouter", "LLMProvider", "TaskType", "router"]
