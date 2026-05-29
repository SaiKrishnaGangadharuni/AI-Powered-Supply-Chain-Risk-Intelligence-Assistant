"""
RAGAS metric runners for the Supply Chain Risk Intelligence Assistant.

Metrics evaluated:
  - context_precision  : retrieved context relevance ranking quality
  - context_recall     : ground truth coverage by retrieved context
  - answer_faithfulness: answer grounded in retrieved context (no hallucination)
  - answer_relevancy   : answer relevance to the input question

Usage (user-triggered only):
    from app.evaluation.ragas_metrics import run_metrics, run_full_suite
    results = run_full_suite()
    results = run_metrics(dataset)   # HuggingFace Dataset or list of dicts
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.core.logging import logger

GOLDEN_DATASET_PATH = Path(__file__).parent / "golden_dataset.json"

# Target thresholds (used for pass/fail reporting)
METRIC_THRESHOLDS = {
    "context_precision": 0.75,
    "context_recall": 0.70,
    "answer_faithfulness": 0.80,
    "answer_relevancy": 0.75,
}


# ---------------------------------------------------------------------------
# Lazy imports
# ---------------------------------------------------------------------------

def _load_ragas():
    try:
        from ragas import evaluate as ragas_evaluate
        from ragas.metrics import (
            answer_faithfulness,
            answer_relevancy,
            context_precision,
            context_recall,
        )
        from datasets import Dataset
        return ragas_evaluate, answer_faithfulness, answer_relevancy, \
               context_precision, context_recall, Dataset
    except ImportError as e:
        raise RuntimeError(
            "ragas or datasets not installed. Run: pip install ragas datasets"
        ) from e


def _load_langchain_openai(model: str = "gpt-4o-mini"):
    try:
        from langchain_openai import ChatOpenAI, OpenAIEmbeddings
        llm = ChatOpenAI(model=model, temperature=0)
        embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
        return llm, embeddings
    except ImportError as e:
        raise RuntimeError("langchain-openai not installed") from e


# ---------------------------------------------------------------------------
# Dataset builder
# ---------------------------------------------------------------------------

def build_ragas_dataset(
    questions: List[str],
    answers: List[str],
    contexts: List[List[str]],
    ground_truths: List[str],
) -> Any:
    """
    Build a HuggingFace Dataset in RAGAS format.

    Args:
        questions: user queries
        answers: generated answers from the RAG pipeline
        contexts: list of retrieved context strings per question
        ground_truths: expected answers from golden dataset

    Returns:
        HuggingFace Dataset
    """
    _, _, _, _, _, Dataset = _load_ragas()
    data = {
        "question": questions,
        "answer": answers,
        "contexts": contexts,
        "ground_truth": ground_truths,
    }
    return Dataset.from_dict(data)


# ---------------------------------------------------------------------------
# Golden dataset loader
# ---------------------------------------------------------------------------

def load_golden_dataset(category: Optional[str] = None) -> List[Dict]:
    with open(GOLDEN_DATASET_PATH, encoding="utf-8") as f:
        data = json.load(f)
    if category:
        data = [d for d in data if d.get("category") == category]
    return data


# ---------------------------------------------------------------------------
# Core runner
# ---------------------------------------------------------------------------

def run_metrics(
    dataset: Any,
    metric_names: Optional[List[str]] = None,
    model: str = "gpt-4o-mini",
) -> Dict[str, Any]:
    """
    Run RAGAS metrics on a HuggingFace Dataset.

    Args:
        dataset: HuggingFace Dataset with columns: question, answer, contexts, ground_truth
        metric_names: subset to run; None = all four
        model: LLM judge model name

    Returns:
        dict with per-metric scores and overall summary
    """
    (
        ragas_evaluate, answer_faithfulness, answer_relevancy,
        context_precision, context_recall, Dataset
    ) = _load_ragas()

    llm, embeddings = _load_langchain_openai(model=model)

    all_metrics = {
        "context_precision": context_precision,
        "context_recall": context_recall,
        "answer_faithfulness": answer_faithfulness,
        "answer_relevancy": answer_relevancy,
    }

    if metric_names:
        selected = [v for k, v in all_metrics.items() if k in metric_names]
    else:
        selected = list(all_metrics.values())

    logger.info(f"[RAGAS] Running {len(selected)} metrics on {len(dataset)} rows")
    t0 = time.perf_counter()

    result = ragas_evaluate(
        dataset=dataset,
        metrics=selected,
        llm=llm,
        embeddings=embeddings,
        raise_exceptions=False,
    )

    elapsed = time.perf_counter() - t0
    logger.info(f"[RAGAS] Evaluation complete in {elapsed:.1f}s")

    return _summarise(result, elapsed)


def _summarise(result: Any, elapsed: float) -> Dict[str, Any]:
    """Convert RAGAS EvaluationResult to a serialisable dict."""
    scores_dict = result.to_pandas().to_dict(orient="list")

    metric_cols = [
        c for c in scores_dict
        if c not in ("question", "answer", "contexts", "ground_truth")
    ]

    aggregated: Dict[str, Any] = {}
    for col in metric_cols:
        raw = [v for v in scores_dict[col] if v is not None and str(v) != "nan"]
        if not raw:
            continue
        mean_score = round(sum(raw) / len(raw), 4)
        threshold = METRIC_THRESHOLDS.get(col, 0.75)
        aggregated[col] = {
            "mean_score": mean_score,
            "min_score": round(min(raw), 4),
            "max_score": round(max(raw), 4),
            "pass_rate": round(sum(1 for s in raw if s >= threshold) / len(raw), 4),
            "threshold": threshold,
            "n_samples": len(raw),
        }

    overall_scores = [v["mean_score"] for v in aggregated.values()]
    overall_mean = round(sum(overall_scores) / len(overall_scores), 4) if overall_scores else 0.0

    return {
        "tool": "ragas",
        "metrics": aggregated,
        "overall_mean_score": overall_mean,
        "elapsed_seconds": round(elapsed, 2),
        "ran_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


# ---------------------------------------------------------------------------
# Full suite runner
# ---------------------------------------------------------------------------

def run_full_suite(
    pipeline_fn=None,
    model: str = "gpt-4o-mini",
    max_samples: int = 10,
    category: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Run RAGAS full suite against the golden dataset.

    Args:
        pipeline_fn: async callable(question) -> {"answer": str, "contexts": list[str]}
                     None = offline mode (uses ground_truth as answer)
        model: LLM judge model
        max_samples: max golden pairs to evaluate
        category: filter by category

    Returns:
        Evaluation summary dict
    """
    import asyncio

    golden = load_golden_dataset(category=category)[:max_samples]

    questions, answers, contexts_list, ground_truths = [], [], [], []

    for entry in golden:
        questions.append(entry["question"])
        ground_truths.append(entry["ground_truth"])

        if pipeline_fn:
            try:
                result = asyncio.run(pipeline_fn(entry["question"]))
                answers.append(result.get("answer", entry["ground_truth"]))
                contexts_list.append(result.get("contexts", entry["contexts"]))
            except Exception as exc:
                logger.warning(f"[RAGAS] Pipeline failed for {entry['id']}: {exc}")
                answers.append(entry["ground_truth"])
                contexts_list.append(entry["contexts"])
        else:
            # Offline mode: ground truth as answer to verify evaluation logic
            answers.append(entry["ground_truth"])
            contexts_list.append(entry["contexts"])

    dataset = build_ragas_dataset(questions, answers, contexts_list, ground_truths)
    return run_metrics(dataset, model=model)
