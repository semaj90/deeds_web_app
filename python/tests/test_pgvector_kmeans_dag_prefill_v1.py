"""Tests for PG18 pgvector + KMeans SSD-backed DAG prefill builder."""
from __future__ import annotations

import pytest

from atlas_graph_runtime.pgvector_kmeans_dag_prefill_v1 import (
    MAX_TOP_K,
    build_pgvector_prefill_query_v1,
)


def test_build_pgvector_prefill_query_with_kmeans_and_fts() -> None:
    sql, params = build_pgvector_prefill_query_v1(
        top_k=6,
        kmeans_clusters=[12, 44],
        kmeans_model_version="mbk-spherical-content768-k256-v1",
        fts_query="drizzle schema",
    )
    assert "content_embedding_768 IS NOT NULL" in sql
    assert "kmeans_cluster = ANY(%s)" in sql
    assert "kmeans_model_version = %s" in sql
    assert "search_vector @@ plainto_tsquery('english', %s)" in sql
    assert params == [[12, 44], "mbk-spherical-content768-k256-v1", "drizzle schema"]


def test_build_pgvector_prefill_query_rejects_unbounded_top_k() -> None:
    with pytest.raises(ValueError, match=str(MAX_TOP_K)):
        build_pgvector_prefill_query_v1(top_k=MAX_TOP_K + 1)
