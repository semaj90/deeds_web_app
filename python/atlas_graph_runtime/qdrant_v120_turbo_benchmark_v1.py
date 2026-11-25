"""Benchmark Qdrant v1.20.2 float32 vs turbo16 vs turbo8 against exact 768D cosine oracle.

Creates isolated temporary collections, runs 50 real 768D queries pulled read-only from PG18
`codebase_chunk_index`, measures Recall@10, MRR, and P95 latency, and deletes temp collections.
"""

from __future__ import annotations

import json
import math
import pathlib
import time
import urllib.request
from typing import Any

import numpy as np
import psycopg

from python.atlas_graph_runtime.qdrant_v120_graphrag_adapter_v1 import (
    build_turboquant_code_bm25_collection_spec_v1,
)


def _qdrant_req(base: str, method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        f"{base}{path}",
        data=data,
        headers={"Content-Type": "application/json"} if data is not None else {},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def run_turbo_benchmark_v1(
    *,
    dsn: str,
    qdrant_url: str = "http://127.0.0.1:6333",
    corpus_limit: int = 200,
    query_count: int = 50,
    top_k: int = 10,
) -> dict[str, Any]:
    # 1. Read-only fetch of real 768D embeddings from PG18
    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            cur.execute("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            try:
                cur.execute(
                    """
                    SELECT id::text, content_embedding_768::float4[]
                    FROM codebase_chunk_index
                    WHERE content_embedding_768 IS NOT NULL
                    ORDER BY id ASC
                    LIMIT %s
                    """,
                    (int(corpus_limit),),
                )
                rows = cur.fetchall()
            finally:
                conn.rollback()

    if len(rows) < max(top_k, query_count):
        raise ValueError(f"INSUFFICIENT_PG18_EMBEDDINGS:{len(rows)}")

    ids = [str(r[0]) for r in rows]
    mat = np.array([r[1] for r in rows], dtype=np.float32)
    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    mat_norm = mat / norms

    # 2. Exact cosine ground-truth top-K for first `query_count` vectors
    queries = mat_norm[:query_count]
    sim_matrix = queries @ mat_norm.T  # (Q, N)
    exact_topk: list[set[int]] = []
    exact_top1: list[int] = []
    for q_idx in range(query_count):
        ranked = np.argsort(-sim_matrix[q_idx], kind="stable")[:top_k]
        exact_topk.append(set(int(i) for i in ranked))
        exact_top1.append(int(ranked[0]))

    results: dict[str, Any] = {}
    for datatype in ("float32", "turbo16", "turbo8"):
        col = f"atlas_bench_{datatype}_tmp"
        spec = build_turboquant_code_bm25_collection_spec_v1(
            collection_name=col,
            vector_size=mat.shape[1],
            datatype=datatype,
        )
        try:
            try:
                _qdrant_req(qdrant_url, "DELETE", f"/collections/{col}")
            except Exception:
                pass

            _qdrant_req(qdrant_url, "PUT", f"/collections/{col}", spec["create_collection_body"])

            # Upsert in batches of 100
            for start in range(0, len(rows), 100):
                pts = [
                    {
                        "id": idx + 1,
                        "vector": {"content": mat_norm[idx].tolist()},
                        "payload": {"candidate_id": ids[idx]},
                    }
                    for idx in range(start, min(start + 100, len(rows)))
                ]
                _qdrant_req(qdrant_url, "PUT", f"/collections/{col}/points?wait=true", {"points": pts})

            latencies_ms: list[float] = []
            recalls: list[float] = []
            mrrs: list[float] = []
            for q_idx in range(query_count):
                t0 = time.perf_counter()
                resp = _qdrant_req(
                    qdrant_url,
                    "POST",
                    f"/collections/{col}/points/query",
                    {
                        "query": queries[q_idx].tolist(),
                        "using": "content",
                        "limit": top_k,
                        "with_payload": False,
                    },
                )
                latencies_ms.append((time.perf_counter() - t0) * 1000.0)
                returned_indices = [int(pt["id"]) - 1 for pt in resp["result"]["points"]]
                recalls.append(len(set(returned_indices) & exact_topk[q_idx]) / float(top_k))
                target = exact_top1[q_idx]
                rr = 0.0
                for rank_i, cand_idx in enumerate(returned_indices):
                    if cand_idx == target:
                        rr = 1.0 / float(rank_i + 1)
                        break
                mrrs.append(rr)

            lat_sorted = sorted(latencies_ms)
            p95_idx = min(len(lat_sorted) - 1, math.ceil(0.95 * len(lat_sorted)) - 1)
            results[datatype] = {
                "recall_at_10": round(sum(recalls) / len(recalls), 4),
                "mrr": round(sum(mrrs) / len(mrrs), 4),
                "p50_ms": round(lat_sorted[len(lat_sorted) // 2], 3),
                "p95_ms": round(lat_sorted[p95_idx], 3),
            }
        finally:
            try:
                _qdrant_req(qdrant_url, "DELETE", f"/collections/{col}")
            except Exception:
                pass

    return {
        "schema": "atlas.qdrant-v120-turbo-benchmark.v1",
        "corpus_size": len(rows),
        "query_count": query_count,
        "top_k": top_k,
        "canonical_authority": False,
        "writes_performed": False,
        "results": results,
    }


if __name__ == "__main__":
    p = pathlib.Path(".env") if pathlib.Path(".env").exists() else pathlib.Path("sveltekit-frontend/.env")
    dsn = [l.split("=", 1)[1].strip().strip("\"'") for l in p.read_text().splitlines() if l.strip().startswith("DATABASE_URL=")][0]
    report = run_turbo_benchmark_v1(dsn=dsn)
    out_path = pathlib.Path("docs/reports/qdrant-v120-turbo-benchmark-v1.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
