"""SSD-backed PostgreSQL 18 pgvector + KMeans DAG prefill & multi-parameter eval retriever.

Pushes HNSW vector search (`content_embedding_768 <=> $vec::vector`), optional
KMeans cluster prefill (`kmeans_cluster = ANY(...)`), and FTS (`search_vector`)
into PostgreSQL 18 (`default_transaction_read_only=on`) so Python never loads
full embedding/feature matrices into RAM.

Authority & safety rules (`AGENTS.md`):
- Uses `embeddinggemma:latest` (`semantic_768`) for `codebase_chunk_index.content_embedding_768`.
- `kmeans_cluster` is a derived routing/prefill filter only (no identity or extra vote).
- Read-only (`canonicalAuthority: False`, `writesPerformed: False`, `hiddenStatePersisted: False`).
"""
from __future__ import annotations

import logging
import os
import tracemalloc
from typing import Any

from atlas_graph_runtime.eg2_challenger_lane_v1 import (
    CANONICAL_MODEL,
    DEFAULT_OLLAMA_URL,
    embed_texts_ollama_v1,
)

LOGGER = logging.getLogger("atlas.pgvector_kmeans_dag_prefill_v1")
MAX_TOP_K = 50


def build_pgvector_prefill_query_v1(
    *,
    top_k: int = 10,
    kmeans_clusters: list[int] | None = None,
    kmeans_model_version: str | None = None,
    fts_query: str | None = None,
) -> tuple[str, list[Any]]:
    """Build parameterized read-only SQL for PG18 pgvector HNSW + KMeans prefill."""
    if top_k < 1 or top_k > MAX_TOP_K:
        raise ValueError(f"top_k must be between 1 and {MAX_TOP_K}, got {top_k}")

    clauses = ["content_embedding_768 IS NOT NULL"]
    params: list[Any] = []

    if kmeans_clusters:
        clauses.append("kmeans_cluster = ANY(%s)")
        params.append([int(c) for c in kmeans_clusters])
    if kmeans_model_version:
        clauses.append("kmeans_model_version = %s")
        params.append(kmeans_model_version)
    if fts_query and fts_query.strip():
        clauses.append("search_vector @@ plainto_tsquery('english', %s)")
        params.append(fts_query.strip())

    where_sql = " AND ".join(clauses)
    sql = f"""
        SELECT id::text,
               relative_path,
               symbol,
               kmeans_cluster,
               kmeans_model_version,
               1.0 - (content_embedding_768 <=> %s::vector) AS cosine_sim
        FROM codebase_chunk_index
        WHERE {where_sql}
        ORDER BY content_embedding_768 <=> %s::vector
        LIMIT %s
    """
    return sql.strip(), params


def fetch_pgvector_kmeans_dag_prefill_v1(
    query_text: str,
    *,
    top_k: int = 8,
    ef_search: int = 40,
    kmeans_clusters: list[int] | None = None,
    kmeans_model_version: str | None = None,
    fts_query: str | None = None,
    dsn: str | None = None,
    ollama_url: str = DEFAULT_OLLAMA_URL,
) -> dict[str, Any]:
    """Execute bounded read-only pgvector + KMeans prefill query in PG18 with memory telemetry."""
    import psycopg

    if ef_search < 10 or ef_search > 400:
        raise ValueError(f"ef_search must be between 10 and 400, got {ef_search}")

    was_tracing = tracemalloc.is_tracing()
    if not was_tracing:
        tracemalloc.start()
    tracemalloc.reset_peak()

    vec = embed_texts_ollama_v1([query_text], model=CANONICAL_MODEL, ollama_url=ollama_url)[0]
    vec_literal = "[" + ",".join(f"{v:.7f}" for v in vec) + "]"

    sql, filter_params = build_pgvector_prefill_query_v1(
        top_k=top_k,
        kmeans_clusters=kmeans_clusters,
        kmeans_model_version=kmeans_model_version,
        fts_query=fts_query,
    )
    exec_params: list[Any] = [vec_literal, *filter_params, vec_literal, int(top_k)]

    db_url = dsn or os.environ.get("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL environment variable or explicit dsn is required")
    with psycopg.connect(db_url, options="-c default_transaction_read_only=on") as conn:
        with conn.cursor() as cur:
            cur.execute(f"SET LOCAL hnsw.ef_search = {int(ef_search)}")
            cur.execute(sql, exec_params)
            rows = cur.fetchall()

    cur_bytes, peak_bytes = tracemalloc.get_traced_memory()
    if not was_tracing:
        tracemalloc.stop()

    hits = [
        {
            "chunkId": r[0],
            "relativePath": r[1],
            "symbol": r[2],
            "kmeansCluster": r[3],
            "kmeansModelVersion": r[4],
            "cosineSimilarity": round(float(r[5]), 6),
        }
        for r in rows
    ]
    LOGGER.info(
        "pgvector_prefill_done top_k=%d ef_search=%d hits=%d peak_bytes=%d",
        top_k,
        ef_search,
        len(hits),
        peak_bytes,
    )
    return {
        "schema": "atlas.pgvector-kmeans-dag-prefill.v1",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "hiddenStatePersisted": False,
        "transactionReadOnly": True,
        "model": CANONICAL_MODEL,
        "params": {
            "topK": top_k,
            "efSearch": ef_search,
            "kmeansClusters": kmeans_clusters,
            "kmeansModelVersion": kmeans_model_version,
            "ftsQuery": fts_query,
        },
        "hitCount": len(hits),
        "memoryTelemetry": {
            "mmapUsed": False,
            "pgvectorSsdBacked": True,
            "tracemallocCurrentBytes": int(cur_bytes),
            "tracemallocPeakBytes": int(peak_bytes),
        },
        "hits": hits,
    }


def run_multi_param_prefill_eval_v1(
    query_text: str,
    param_grid: list[dict[str, Any]],
    *,
    dsn: str | None = None,
    ollama_url: str = DEFAULT_OLLAMA_URL,
) -> dict[str, Any]:
    """Evaluate multiple pgvector/KMeans prefill parameter sets for DAG/agent eval testing."""
    runs = []
    for cfg in param_grid:
        runs.append(
            fetch_pgvector_kmeans_dag_prefill_v1(
                query_text,
                top_k=int(cfg.get("top_k", 5)),
                ef_search=int(cfg.get("ef_search", 40)),
                kmeans_clusters=cfg.get("kmeans_clusters"),
                kmeans_model_version=cfg.get("kmeans_model_version"),
                fts_query=cfg.get("fts_query"),
                dsn=dsn,
                ollama_url=ollama_url,
            )
        )
    return {
        "schema": "atlas.pgvector-multi-param-eval.v1",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "query": query_text,
        "runCount": len(runs),
        "runs": [
            {
                "params": r["params"],
                "hitCount": r["hitCount"],
                "peakBytes": r["memoryTelemetry"]["tracemallocPeakBytes"],
                "topPaths": [h["relativePath"] for h in r["hits"][:3]],
            }
            for r in runs
        ],
    }
