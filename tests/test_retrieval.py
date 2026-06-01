"""
Tests for retrieval components — embeddings, BM25, RRF fusion, reranker.
Run from the backend/ directory:
    pytest ../tests/test_retrieval.py -v
"""
import pytest
from unittest.mock import MagicMock, patch

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))


# ── RRF Fusion ───────────────────────────────────────────────────────────────

def test_rrf_fusion_combines_lists():
    """RRF must merge two ranked lists and score shared docs higher."""
    from app.retrieval.hybrid_search import _rrf_fuse

    dense = [{"id": "doc1", "score": 0.9}, {"id": "doc2", "score": 0.7}]
    sparse = [{"id": "doc2", "score": 0.8}, {"id": "doc3", "score": 0.6}]

    fused = _rrf_fuse(dense, sparse, k=60)
    ids = [d["id"] for d in fused]

    # doc2 appears in both lists — must rank highest
    assert ids[0] == "doc2"
    # all three docs must appear in result
    assert set(ids) == {"doc1", "doc2", "doc3"}


def test_rrf_fusion_empty_lists_returns_empty():
    """RRF must handle empty inputs without error."""
    from app.retrieval.hybrid_search import _rrf_fuse
    result = _rrf_fuse([], [], k=60)
    assert result == []


def test_rrf_fusion_single_list():
    """RRF must work correctly with only one populated list."""
    from app.retrieval.hybrid_search import _rrf_fuse
    dense = [{"id": "doc1", "score": 0.9}, {"id": "doc2", "score": 0.5}]
    result = _rrf_fuse(dense, [], k=60)
    assert len(result) == 2
    assert result[0]["id"] == "doc1"


# ── Reranker ─────────────────────────────────────────────────────────────────

def test_reranker_returns_top_k():
    """Reranker must return exactly top_k results."""
    from app.retrieval.reranker import rerank

    docs = [
        {"id": f"doc{i}", "content": f"supply chain document {i}", "score": 0.5}
        for i in range(10)
    ]
    query = "late delivery risk"
    results = rerank(query, docs, top_k=5)
    assert len(results) == 5


def test_reranker_returns_less_than_k_when_fewer_docs():
    """Reranker must not error when fewer docs than top_k are provided."""
    from app.retrieval.reranker import rerank

    docs = [{"id": "doc1", "content": "supply chain fraud LATAM", "score": 0.7}]
    results = rerank("fraud orders", docs, top_k=5)
    assert len(results) == 1


def test_reranker_scores_are_between_0_and_1():
    """All reranker output scores must be in [0, 1] range."""
    from app.retrieval.reranker import rerank

    docs = [
        {"id": "doc1", "content": "First Class shipping late delivery rate 95 percent", "score": 0.8},
        {"id": "doc2", "content": "Standard Class shipping most reliable mode", "score": 0.6},
        {"id": "doc3", "content": "LATAM market has highest fraud orders", "score": 0.4},
    ]
    results = rerank("which shipping mode is most reliable", docs, top_k=3)
    for r in results:
        assert 0.0 <= r["score"] <= 1.0


# ── Semantic Cache ────────────────────────────────────────────────────────────

def test_semantic_cache_hit_on_similar_query():
    """Cache must return a hit for a query with cosine similarity above threshold."""
    from app.cache.semantic_cache import SemanticCache

    cache = SemanticCache(threshold=0.92, max_items=10)

    with patch("app.cache.semantic_cache.embed_query") as mock_embed:
        import numpy as np
        # Same vector = similarity 1.0 → should always hit
        vec = np.array([0.1, 0.2, 0.3, 0.4])
        mock_embed.return_value = vec

        cache.set("what is the late delivery rate", "54.8% of orders are late")
        result = cache.get("what is the late delivery percentage")

    assert result == "54.8% of orders are late"


def test_semantic_cache_miss_on_different_query():
    """Cache must return None for a dissimilar query."""
    from app.cache.semantic_cache import SemanticCache

    cache = SemanticCache(threshold=0.92, max_items=10)

    with patch("app.cache.semantic_cache.embed_query") as mock_embed:
        import numpy as np
        # Two orthogonal vectors = similarity 0.0 → must miss
        mock_embed.side_effect = [
            np.array([1.0, 0.0, 0.0, 0.0]),  # set call
            np.array([0.0, 1.0, 0.0, 0.0]),  # get call
        ]
        cache.set("late delivery rate", "54.8%")
        result = cache.get("supplier lead time fashion dataset")

    assert result is None


def test_semantic_cache_respects_max_items():
    """Cache must not exceed max_items — oldest entry should be evicted."""
    from app.cache.semantic_cache import SemanticCache
    import numpy as np

    cache = SemanticCache(threshold=0.92, max_items=3)

    with patch("app.cache.semantic_cache.embed_query") as mock_embed:
        mock_embed.side_effect = [np.array([float(i), 0.0, 0.0]) for i in range(10)]
        cache.set("query1", "answer1")
        cache.set("query2", "answer2")
        cache.set("query3", "answer3")
        cache.set("query4", "answer4")  # should evict query1

    assert len(cache._store) <= 3
