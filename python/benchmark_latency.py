"""LATENT-DIVERSITY-02: latency p50/p95 for each policy.

Separates two cost components, since they have very different characteristics:
  pool_fetch_ms   -- Ollama embedding call + pgvector ANN search. Shared across all policies
                      (each policy operates on the same fetched pool); dominated by network/DB
                      I/O, expected to be the large component.
  selection_ms    -- the policy's own selection logic (numpy, in-process, no I/O). Expected to
                      be small; MMR's O(pool * finalK * selected) loop is the one to watch since
                      it's quadratic-ish in the selected set size, unlike the others.

Runs each of the 10 real queries once (n=10 -- explicitly disclosed as thin for a real p95
estimate; this is a first-order sanity check on relative cost, not a load-test-grade latency
SLA measurement) and reports min/p50/p95/max per component.
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
THRESHOLD = 0.90
POOL_K = 50
FINAL_K = 10
MMR_LAMBDA = 0.5

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


def select_baseline(rows: list[dict], final_k: int) -> list[dict]:
    return rows[:final_k]


def select_exact_and_semantic(rows: list[dict], final_k: int, threshold: float) -> list[dict]:
    seen_hash: dict[str, str] = {}
    stage_a = []
    for r in rows:
        h = r.get("content_hash")
        if not h:
            stage_a.append(r)
            continue
        if h in seen_hash:
            continue
        seen_hash[h] = r["id"]
        stage_a.append(r)
    selected: list[dict] = []
    selected_vecs: list[np.ndarray] = []
    for r in stage_a:
        if len(selected) >= final_k:
            break
        vec = r["latent_vec"]
        if vec is None:
            selected.append(r)
            continue
        if any(cosine(vec, sv) >= threshold for sv in selected_vecs):
            continue
        selected_vecs.append(vec)
        selected.append(r)
    return selected


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


def percentile(values: list[float], p: float) -> float:
    return float(np.percentile(values, p))


def main() -> None:
    conn = psycopg2.connect(DATABASE_URL)
    pool_fetch_ms: list[float] = []
    selection_ms: dict[str, list[float]] = {"baseline": [], "exact_and_semantic": [], "semantic_768_mmr": []}

    try:
        for q, kws in QUERIES_WITH_KEYWORDS:
            t0 = time.perf_counter()
            query_vec = np.array(embed_query(q), dtype=np.float32)
            query_vec_norm = query_vec / np.linalg.norm(query_vec)
            query_vec_literal = "[" + ",".join(f"{v:.6f}" for v in query_vec) + "]"

            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT id::text AS id, relative_path AS source_ref, content_hash,
                           latent_256::text AS latent_256, content_embedding::text AS content_embedding
                    FROM codebase_chunk_index
                    WHERE content_embedding IS NOT NULL AND latent_256 IS NOT NULL
                    ORDER BY content_embedding <=> %s::halfvec
                    LIMIT %s
                    """,
                    (query_vec_literal, POOL_K),
                )
                rows = cur.fetchall()
            t1 = time.perf_counter()
            pool_fetch_ms.append((t1 - t0) * 1000)

            for r in rows:
                r["latent_vec"] = np.fromstring(r["latent_256"].strip("[]"), sep=",", dtype=np.float32) if r["latent_256"] else None
                cv = np.fromstring(r["content_embedding"].strip("[]"), sep=",", dtype=np.float32)
                r["content_vec_norm"] = cv / np.linalg.norm(cv)

            t2 = time.perf_counter()
            select_baseline(rows, FINAL_K)
            t3 = time.perf_counter()
            selection_ms["baseline"].append((t3 - t2) * 1000)

            t4 = time.perf_counter()
            select_exact_and_semantic(rows, FINAL_K, THRESHOLD)
            t5 = time.perf_counter()
            selection_ms["exact_and_semantic"].append((t5 - t4) * 1000)

            t6 = time.perf_counter()
            select_semantic_768_mmr(rows, FINAL_K, query_vec_norm, MMR_LAMBDA)
            t7 = time.perf_counter()
            selection_ms["semantic_768_mmr"].append((t7 - t6) * 1000)

            print(json.dumps({
                "event": "query_complete", "query": q,
                "pool_fetch_ms": round((t1 - t0) * 1000, 2),
                "baseline_ms": round((t3 - t2) * 1000, 3),
                "exact_and_semantic_ms": round((t5 - t4) * 1000, 3),
                "semantic_768_mmr_ms": round((t7 - t6) * 1000, 3),
            }))
    finally:
        conn.close()

    summary = {
        "pool_fetch_ms": {
            "min": min(pool_fetch_ms), "p50": percentile(pool_fetch_ms, 50),
            "p95": percentile(pool_fetch_ms, 95), "max": max(pool_fetch_ms),
        },
    }
    for policy, values in selection_ms.items():
        summary[f"{policy}_selection_ms"] = {
            "min": min(values), "p50": percentile(values, 50),
            "p95": percentile(values, 95), "max": max(values),
        }

    receipt = {
        "schema": "atlas.latent256-diversity-latency-eval.v1",
        "canonical_authority": False,
        "note": "n=10 -- explicitly thin for a real p95 SLA measurement, this is a first-order sanity check on relative cost (pool fetch I/O vs in-process selection logic), not a load-test-grade latency benchmark.",
        "pool_k": POOL_K,
        "final_k": FINAL_K,
        "query_count": len(QUERIES_WITH_KEYWORDS),
        "summary_ms": summary,
        "interpretation": "pool_fetch_ms (Ollama embed + pgvector ANN) is expected to dominate total latency; *_selection_ms values show the ADDITIONAL cost of each policy's own logic, added on top of the shared pool_fetch_ms for that query.",
    }
    out_path = "docs/reports/latent256-diversity-latency-eval-v1.json"
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(receipt, fh, indent=2)
    print(json.dumps({"event": "receipt_written", "path": out_path}))
    print(json.dumps({"status": "LATENCY_EVAL_PROVEN", "summary_ms": summary}))


if __name__ == "__main__":
    main()
