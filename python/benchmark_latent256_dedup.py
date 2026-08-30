"""Benchmarks LATENT256_SEMANTIC_DEDUP's real-world impact: does it actually reduce redundancy
in real top-K retrieval results, and by how much?

Distinct from evaluate_latent256_dedup_threshold.py (which measured precision/recall against
content_hash ground truth to pick a threshold) -- this measures end-to-end impact on real query
results: how many near-duplicate candidates does a realistic top-50 retrieval actually contain,
and how much does pruning them at the evaluated threshold (0.90) change unique-source coverage.

Primary retrieval done directly in Postgres via pgvector cosine search on content_embedding
(halfvec(768)) rather than through Qdrant codebase_chunks_768 -- that collection's chunk_id
payload field is inconsistent (some real codebase_chunk_index UUIDs, some a different `card:...`
identity scheme from an older generation, per this repo's own documented collection-split
finding). Querying Postgres directly keeps identity clean: retrieval and latent_256 hydration
both key off the same codebase_chunk_index.id.

Query embedding via Ollama /api/embed (embeddinggemma:latest, matching this repo's canonical
embedding path) -- no dev server or SvelteKit module resolution needed.
"""

from __future__ import annotations

import argparse
import json
import os
import time

import numpy as np
import psycopg2
import psycopg2.extras
import requests

DEFAULT_DATABASE_URL = "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db"
OLLAMA_URL = "http://127.0.0.1:11434"
EMBED_MODEL = "embeddinggemma:latest"
THRESHOLD = 0.90  # EVALUATED_LATENT256_SIMILARITY_THRESHOLD, see post-process-reranker.ts

REALISTIC_QUERIES = [
    "database connection pool retry logic",
    "JWT authentication middleware",
    "vector similarity search with cosine distance",
    "React component state management with Svelte 5 runes",
    "error handling and logging middleware",
    "Redis cache invalidation after write",
    "Qdrant collection provisioning and upsert",
    "PostgreSQL migration with drizzle-orm",
    "WebSocket connection lifecycle",
    "file upload validation and storage",
]


def embed_query(text: str) -> list[float]:
    resp = requests.post(f"{OLLAMA_URL}/api/embed", json={"model": EMBED_MODEL, "input": text}, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    return data["embeddings"][0]


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


def semantic_dedup(ids: list[str], sources: list[str], vectors: list[np.ndarray], threshold: float) -> tuple[list[int], list[int]]:
    """Mirrors post-process-reranker.ts's greedy algorithm exactly: iterate in rank order
    (already sorted by relevance, i.e. input order here), keep a candidate unless it's a
    near-duplicate of an already-kept higher-ranked one."""
    survivors: list[int] = []
    removed: list[int] = []
    kept_vectors: list[np.ndarray] = []
    for idx, vec in enumerate(vectors):
        is_dup = any(cosine(vec, kv) >= threshold for kv in kept_vectors)
        if is_dup:
            removed.append(idx)
        else:
            survivors.append(idx)
            kept_vectors.append(vec)
    return survivors, removed


def run_query(conn, query_text: str, top_k: int) -> dict:
    query_vec = embed_query(query_text)
    query_vec_literal = "[" + ",".join(f"{v:.6f}" for v in query_vec) + "]"

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT id::text AS id, relative_path AS source_ref, latent_256::text AS latent_256,
                   1 - (content_embedding <=> %s::halfvec) AS cosine_768
            FROM codebase_chunk_index
            WHERE content_embedding IS NOT NULL AND latent_256 IS NOT NULL
            ORDER BY content_embedding <=> %s::halfvec
            LIMIT %s
            """,
            (query_vec_literal, query_vec_literal, top_k),
        )
        rows = cur.fetchall()

    ids = [r["id"] for r in rows]
    sources = [r["source_ref"] for r in rows]
    vectors = [np.fromstring(r["latent_256"].strip("[]"), sep=",", dtype=np.float32) for r in rows]

    unique_sources_before = len(set(sources))
    survivors, removed = semantic_dedup(ids, sources, vectors, THRESHOLD)
    unique_sources_after = len(set(sources[i] for i in survivors))

    return {
        "query": query_text,
        "candidates_before": len(rows),
        "candidates_after": len(survivors),
        "removed_count": len(removed),
        "unique_sources_before": unique_sources_before,
        "unique_sources_after": unique_sources_after,
        "removed_examples": [
            {"source_ref": sources[i], "cosine_768_relevance": float(rows[i]["cosine_768"])}
            for i in removed[:5]
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL))
    parser.add_argument("--top-k", type=int, default=50)
    parser.add_argument("--out", default="docs/reports/latent256-dedup-realworld-benchmark-v1.json")
    args = parser.parse_args()

    conn = psycopg2.connect(args.database_url)
    started_at = time.time()
    results = []
    try:
        for q in REALISTIC_QUERIES:
            r = run_query(conn, q, args.top_k)
            results.append(r)
            print(json.dumps({"event": "query_complete", **{k: v for k, v in r.items() if k != "removed_examples"}}))
    finally:
        conn.close()
    duration_s = time.time() - started_at

    total_before = sum(r["candidates_before"] for r in results)
    total_removed = sum(r["removed_count"] for r in results)
    avg_removed_pct = float(np.mean([r["removed_count"] / r["candidates_before"] for r in results]))
    avg_unique_source_gain_pct = float(np.mean([
        (r["unique_sources_after"] - r["unique_sources_before"]) / max(r["unique_sources_before"], 1)
        for r in results
    ]))

    receipt = {
        "schema": "atlas.latent256-dedup-realworld-benchmark.v1",
        "canonical_authority": False,
        "note": "Measures real impact on real top-K retrieval results. Does not itself activate or wire anything.",
        "threshold_used": THRESHOLD,
        "top_k": args.top_k,
        "query_count": len(REALISTIC_QUERIES),
        "queries": results,
        "summary": {
            "total_candidates_before": total_before,
            "total_removed": total_removed,
            "avg_removed_pct_per_query": avg_removed_pct,
            "avg_unique_source_ratio_change_pct": avg_unique_source_gain_pct,
        },
        "duration_s": duration_s,
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(receipt, fh, indent=2)
    print(json.dumps({"event": "receipt_written", "path": args.out}))
    print(json.dumps({
        "status": "REALWORLD_BENCHMARK_PROVEN",
        "avg_removed_pct_per_query": avg_removed_pct,
        "avg_unique_source_ratio_change_pct": avg_unique_source_gain_pct,
    }))


if __name__ == "__main__":
    main()
