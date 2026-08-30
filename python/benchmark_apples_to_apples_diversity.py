"""LATENT-DIVERSITY-02: apples-to-apples diversity + relevance comparison, one identity space.

The earlier MMR challenger (benchmark_qdrant_native_mmr_challenger.py) ran against
codebase_chunks_768 (a known two-generation Qdrant collection with an inconsistent identity
scheme), while the latent_256 policies ran against codebase_chunk_index directly. Their
diversity numbers were explicitly flagged as not comparable for that reason.

This script closes that gap: implements semantic_768 MMR manually (the standard formula --
iteratively pick argmax(lambda * relevance - (1-lambda) * max_similarity_to_already_selected)
using the SAME content_embedding vectors in the SAME codebase_chunk_index pool already used by
baseline / exact_hash_only / exact_and_semantic. No Qdrant collection identity issues, no second
embedding model, no query-side latent encoder for the MMR policy -- exactly what the review's
control experiment intended, just executed in the identity space the other policies already use.

Four policies compared, same pool, same identity space, same silver relevance labels:
  baseline               -- top-10 by relevance, no dedup
  exact_and_semantic      -- Stage A + Stage B (latent_256), with refill
  semantic_768_mmr        -- manual MMR over content_embedding (lambda=0.5), no latent_256
  exact_and_semantic_and_mmr -- Stage A, then MMR-style selection using latent_256 similarity
                                 for redundancy but semantic_768 cosine for relevance (i.e. the
                                 review's own suggested CrossRepresentationDiversityV1 shape,
                                 built here for the first time as an extra data point)
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


def is_silver_relevant(source_ref: str, keywords: list[str]) -> bool:
    lowered = (source_ref or "").lower()
    return any(re.search(kw, lowered) for kw in keywords)


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
    """Standard MMR: relevance and redundancy both computed on semantic_768. Query relevance =
    cosine(candidate_768, query_768). No latent_256 involved -- pure control."""
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


def select_exact_and_semantic_and_mmr(rows: list[dict], final_k: int, query_vec_norm: np.ndarray, lam: float, threshold: float) -> list[dict]:
    """CrossRepresentationDiversityV1 shape: relevance from semantic_768 (existing production
    signal), redundancy from latent_256 (the learned representation). Built here as a first data
    point, per the review's own suggested architecture -- not previously implemented anywhere."""
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

    remaining = list(stage_a)
    selected: list[dict] = []
    while remaining and len(selected) < final_k:
        best_idx, best_score = None, -1e9
        for i, r in enumerate(remaining):
            relevance = cosine(r["content_vec_norm"], query_vec_norm)
            if r["latent_vec"] is None or not selected:
                redundancy = 0.0
            else:
                sel_with_latent = [s for s in selected if s["latent_vec"] is not None]
                redundancy = max((cosine(r["latent_vec"], s["latent_vec"]) for s in sel_with_latent), default=0.0)
            score = lam * relevance - (1 - lam) * redundancy
            if score > best_score:
                best_score, best_idx = score, i
        selected.append(remaining.pop(best_idx))
    return selected


def run_query(conn, query_text: str, keywords: list[str]) -> dict:
    query_vec = np.array(embed_query(query_text), dtype=np.float32)
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

    for r in rows:
        r["latent_vec"] = np.fromstring(r["latent_256"].strip("[]"), sep=",", dtype=np.float32) if r["latent_256"] else None
        cv = np.fromstring(r["content_embedding"].strip("[]"), sep=",", dtype=np.float32)
        r["content_vec_norm"] = cv / np.linalg.norm(cv)
        r["silver_relevant"] = is_silver_relevant(r["source_ref"], keywords)

    silver_relevant_in_pool = sum(1 for r in rows if r["silver_relevant"])

    policies_fns = {
        "baseline": lambda: select_baseline(rows, FINAL_K),
        "exact_and_semantic": lambda: select_exact_and_semantic(rows, FINAL_K, THRESHOLD),
        "semantic_768_mmr": lambda: select_semantic_768_mmr(rows, FINAL_K, query_vec_norm, MMR_LAMBDA),
        "exact_and_semantic_and_mmr": lambda: select_exact_and_semantic_and_mmr(rows, FINAL_K, query_vec_norm, MMR_LAMBDA, THRESHOLD),
    }

    policies = {}
    for name, fn in policies_fns.items():
        selection_started = time.perf_counter()
        selected = fn()
        selection_duration_ms = (time.perf_counter() - selection_started) * 1000.0
        relevant_selected = [r for r in selected if r["silver_relevant"]]
        recall = len(relevant_selected) / silver_relevant_in_pool if silver_relevant_in_pool else None
        rr = 0.0
        for rank, r in enumerate(selected, start=1):
            if r["silver_relevant"]:
                rr = 1.0 / rank
                break
        policies[name] = {
            "finalCount": len(selected),
            "uniqueSources": len(set(r["source_ref"] for r in selected)),
            "relevantInFinal": len(relevant_selected),
            "recallAt10": recall,
            "reciprocalRankAt10": rr,
            "selectionDurationMs": selection_duration_ms,
        }

    return {"query": query_text, "silverRelevantInPool": silver_relevant_in_pool, "poolSize": len(rows), "policies": policies}


def main() -> None:
    conn = psycopg2.connect(DATABASE_URL)
    started_at = time.time()
    results = []
    try:
        for q, kws in QUERIES_WITH_KEYWORDS:
            r = run_query(conn, q, kws)
            results.append(r)
            print(json.dumps({"event": "query_complete", "query": q, "policies": r["policies"]}))
    finally:
        conn.close()
    duration_s = time.time() - started_at

    policy_names = ["baseline", "exact_and_semantic", "semantic_768_mmr", "exact_and_semantic_and_mmr"]
    summary = {}
    for policy in policy_names:
        final_counts = [r["policies"][policy]["finalCount"] for r in results]
        unique_sources = [r["policies"][policy]["uniqueSources"] for r in results]
        recalls = [r["policies"][policy]["recallAt10"] for r in results if r["policies"][policy]["recallAt10"] is not None]
        rrs = [r["policies"][policy]["reciprocalRankAt10"] for r in results]
        durations = [r["policies"][policy]["selectionDurationMs"] for r in results]
        summary[policy] = {
            "avg_final_count": float(np.mean(final_counts)),
            "avg_unique_sources": float(np.mean(unique_sources)),
            "avg_recall_at_10_silver": float(np.mean(recalls)) if recalls else None,
            "avg_mrr_at_10_silver": float(np.mean(rrs)),
            "selection_p50_ms": float(np.percentile(durations, 50)),
            "selection_p95_ms": float(np.percentile(durations, 95)),
        }

    receipt = {
        "schema": "atlas.apples-to-apples-diversity-eval.v1",
        "canonical_authority": False,
        "note": "All policies run against the SAME codebase_chunk_index pool with the SAME silver-standard relevance labels. Selection latency measures only in-memory policy selection after the shared database query and embedding step; it is not end-to-end retrieval latency.",
        "pool_k": POOL_K,
        "final_k": FINAL_K,
        "mmr_lambda": MMR_LAMBDA,
        "threshold": THRESHOLD,
        "queries": results,
        "summary": summary,
        "duration_s": duration_s,
    }
    out_path = "docs/reports/apples-to-apples-diversity-eval-v1.json"
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(receipt, fh, indent=2)
    print(json.dumps({"event": "receipt_written", "path": out_path}))
    print(json.dumps({"status": "APPLES_TO_APPLES_EVAL_PROVEN", "summary": summary}))


if __name__ == "__main__":
    main()
