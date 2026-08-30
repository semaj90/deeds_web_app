"""LATENT-DIVERSITY-02: MMR_LAMBDA sweep -- is there an MMR operating point matching latent_256's
near-zero recall cost, or is the tradeoff fundamentally steeper for MMR at every setting?

Reuses the exact pool-fetch + silver-relevance-labeling logic from
benchmark_apples_to_apples_diversity.py (same 10 real queries, same codebase_chunk_index pool,
same silver labels) but fetches the pool ONCE per query and sweeps semantic_768_mmr across
lambda in {0.3, 0.5, 0.7, 0.9} against that cached pool -- no repeated embedding/Postgres calls
per lambda value. lambda=0.5 was already measured in apples-to-apples-diversity-eval-v1.json;
this fills in the rest of the curve.

lambda=1.0 (pure relevance, no diversity term) is also included as a sanity-check upper bound --
it should reduce to ~baseline behavior.
"""

from __future__ import annotations

import json
import os
import re
import time

import numpy as np
import psycopg2
import psycopg2.extras
import requests

DATABASE_URL = "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db"
OLLAMA_URL = "http://127.0.0.1:11434"
EMBED_MODEL = "embeddinggemma:latest"
POOL_K = 50
FINAL_K = 10
LAMBDA_VALUES = [0.3, 0.5, 0.7, 0.9, 1.0]

QUERIES_WITH_KEYWORDS = [
    ("database connection pool retry logic", ["pool", "connection", "retry", "db", "database"]),
    ("JWT authentication middleware", ["jwt", "auth", "middleware", "session", "token"]),
    ("vector similarity search with cosine distance", ["vector", "cosine", "similarity", "search", "embed", "qdrant"]),
    ("React component state management with Svelte 5 runes", ["state", "svelte", "store", "rune", "component"]),
    ("error handling and logging middleware", ["error", "log", "middleware", "handler", "exception"]),
    ("Redis cache invalidation after write", ["redis", "cache", "invalidat", "valkey", "bitfrost"]),
    ("Qdrant collection provisioning and upsert", ["qdrant", "collection", "upsert", "vector", "provision"]),
    ("PostgreSQL migration with drizzle-orm", ["migration", "drizzle", "postgres", "schema", "sql"]),
    ("WebSocket connection lifecycle", ["websocket", "socket", "connection", "lifecycle", "ws"]),
    ("file upload validation and storage", ["upload", "file", "validat", "storage", "seaweed"]),
]


def embed_query(text: str) -> list[float]:
    resp = requests.post(f"{OLLAMA_URL}/api/embed", json={"model": EMBED_MODEL, "input": text}, timeout=30)
    resp.raise_for_status()
    return resp.json()["embeddings"][0]


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


def is_silver_relevant(source_ref: str, keywords: list[str]) -> bool:
    lowered = (source_ref or "").lower()
    return any(re.search(kw, lowered) for kw in keywords)


def select_semantic_768_mmr(rows: list[dict], final_k: int, query_vec_norm: np.ndarray, lam: float) -> list[dict]:
    remaining = list(rows)
    selected: list[dict] = []
    while remaining and len(selected) < final_k:
        best_idx, best_score = None, -1e9
        for i, r in enumerate(remaining):
            relevance = cosine(r["content_vec_norm"], query_vec_norm)
            redundancy = max((cosine(r["content_vec_norm"], s["content_vec_norm"]) for s in selected), default=0.0)
            score = lam * relevance - (1 - lam) * redundancy
            if score > best_score:
                best_score, best_idx = score, i
        selected.append(remaining.pop(best_idx))
    return selected


def fetch_pool(conn, query_text: str, keywords: list[str]) -> tuple[list[dict], np.ndarray, int]:
    query_vec = np.array(embed_query(query_text), dtype=np.float32)
    query_vec_norm = query_vec / np.linalg.norm(query_vec)
    query_vec_literal = "[" + ",".join(f"{v:.6f}" for v in query_vec) + "]"

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT id::text AS id, relative_path AS source_ref, content_embedding::text AS content_embedding
            FROM codebase_chunk_index
            WHERE content_embedding IS NOT NULL AND latent_256 IS NOT NULL
            ORDER BY content_embedding <=> %s::halfvec
            LIMIT %s
            """,
            (query_vec_literal, POOL_K),
        )
        rows = cur.fetchall()

    for r in rows:
        cv = np.fromstring(r["content_embedding"].strip("[]"), sep=",", dtype=np.float32)
        r["content_vec_norm"] = cv / np.linalg.norm(cv)
        r["silver_relevant"] = is_silver_relevant(r["source_ref"], keywords)

    silver_relevant_in_pool = sum(1 for r in rows if r["silver_relevant"])
    return rows, query_vec_norm, silver_relevant_in_pool


def main() -> None:
    conn = psycopg2.connect(DATABASE_URL)
    started_at = time.time()
    per_query_results = []
    try:
        for q, kws in QUERIES_WITH_KEYWORDS:
            rows, query_vec_norm, silver_relevant_in_pool = fetch_pool(conn, q, kws)
            lambda_results = {}
            for lam in LAMBDA_VALUES:
                selected = select_semantic_768_mmr(rows, FINAL_K, query_vec_norm, lam)
                relevant_selected = [r for r in selected if r["silver_relevant"]]
                recall = len(relevant_selected) / silver_relevant_in_pool if silver_relevant_in_pool else None
                rr = 0.0
                for rank, r in enumerate(selected, start=1):
                    if r["silver_relevant"]:
                        rr = 1.0 / rank
                        break
                lambda_results[str(lam)] = {
                    "uniqueSources": len(set(r["source_ref"] for r in selected)),
                    "relevantInFinal": len(relevant_selected),
                    "recallAt10": recall,
                    "reciprocalRankAt10": rr,
                }
            per_query_results.append({"query": q, "silverRelevantInPool": silver_relevant_in_pool, "lambdas": lambda_results})
            print(json.dumps({"event": "query_complete", "query": q, "lambdas": lambda_results}))
    finally:
        conn.close()
    duration_s = time.time() - started_at

    summary = {}
    for lam in LAMBDA_VALUES:
        key = str(lam)
        unique_sources = [r["lambdas"][key]["uniqueSources"] for r in per_query_results]
        recalls = [r["lambdas"][key]["recallAt10"] for r in per_query_results if r["lambdas"][key]["recallAt10"] is not None]
        rrs = [r["lambdas"][key]["reciprocalRankAt10"] for r in per_query_results]
        summary[key] = {
            "avg_unique_sources": float(np.mean(unique_sources)),
            "avg_recall_at_10_silver": float(np.mean(recalls)) if recalls else None,
            "avg_mrr_at_10_silver": float(np.mean(rrs)),
        }

    receipt = {
        "schema": "atlas.mmr-lambda-sweep-eval.v1",
        "canonical_authority": False,
        "note": "Fills in the semantic_768_mmr diversity/recall tradeoff curve beyond the single lambda=0.5 point already measured in apples-to-apples-diversity-eval-v1.json. lambda=1.0 included as a sanity-check upper bound (should reduce toward baseline behavior).",
        "pool_k": POOL_K,
        "final_k": FINAL_K,
        "lambda_values": LAMBDA_VALUES,
        "queries": per_query_results,
        "summary": summary,
        "comparison_note": "latent_256 policy (exact_and_semantic) reference point: avg_unique_sources=7.4, avg_recall_at_10_silver=0.2375, avg_mrr_at_10_silver=0.800 (docs/reports/apples-to-apples-diversity-eval-v1.json). baseline: avg_unique_sources=6.6, avg_recall_at_10_silver=0.2388.",
        "duration_s": duration_s,
    }
    out_path = "docs/reports/mmr-lambda-sweep-eval-v1.json"
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(receipt, fh, indent=2)
    print(json.dumps({"event": "receipt_written", "path": out_path}))
    print(json.dumps({"status": "MMR_LAMBDA_SWEEP_PROVEN", "summary": summary}))


if __name__ == "__main__":
    main()
