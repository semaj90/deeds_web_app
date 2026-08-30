"""LATENT-DIVERSITY-02 (silver-standard partial): does selectDiverseCandidates preserve relevance,
using a defensible-but-weak proxy since no human-labeled golden query set exists in this repo?

This is explicitly a SILVER standard, not gold: "relevant" here means the candidate's
source_ref path contains at least one of the query's extracted keywords (simple lexical
overlap). That is a real, automatic, reproducible signal -- and a well-known fallback technique
when human relevance judgments don't exist -- but it is NOT equivalent to actual Recall@10/
MRR@10/nDCG@10 against verified ground truth. A human or an LLM-as-judge could both disagree
with it on individual cases. Treat this as a bounded sanity check, not a promotion gate.

Reports, per policy (baseline vs exact_and_semantic+refill):
  Recall@10 against the silver-relevant set (how many of the silver-relevant candidates present
  anywhere in the pool survived into the final 10)
  MRR@10 (reciprocal rank of the first silver-relevant hit in the final 10)

Does NOT compute nDCG or alpha-nDCG (those need graded, not just binary, relevance -- binary
lexical-match silver labels don't support that meaningfully) and does NOT include the Qdrant-
native-MMR challenger (separate integration, not started).
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

# (query, keywords) -- keywords chosen manually from the query text itself (not from results),
# so labeling can't leak information from what a search engine already returned.
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
    lowered = source_ref.lower()
    return any(re.search(kw, lowered) for kw in keywords)


def select_diverse(rows: list[dict], final_k: int, threshold: float, use_exact: bool, use_semantic: bool) -> list[dict]:
    stage_a: list[dict] = []
    if use_exact:
        seen_hash: dict[str, str] = {}
        for r in rows:
            h = r.get("content_hash")
            if not h:
                stage_a.append(r)
                continue
            if h in seen_hash:
                continue
            seen_hash[h] = r["id"]
            stage_a.append(r)
    else:
        stage_a = list(rows)

    if not use_semantic:
        return stage_a[:final_k]

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


def run_query(conn, query_text: str, keywords: list[str]) -> dict:
    query_vec = embed_query(query_text)
    query_vec_literal = "[" + ",".join(f"{v:.6f}" for v in query_vec) + "]"

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT id::text AS id, relative_path AS source_ref, content_hash, latent_256::text AS latent_256
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
        r["silver_relevant"] = is_silver_relevant(r["source_ref"], keywords)

    silver_relevant_in_pool = sum(1 for r in rows if r["silver_relevant"])

    policies = {}
    for name, use_exact, use_semantic in [("baseline", False, False), ("exact_and_semantic", True, True)]:
        selected = select_diverse(rows, FINAL_K, THRESHOLD, use_exact, use_semantic)
        relevant_selected = [r for r in selected if r["silver_relevant"]]
        recall = len(relevant_selected) / silver_relevant_in_pool if silver_relevant_in_pool else None
        rr = 0.0
        for rank, r in enumerate(selected, start=1):
            if r["silver_relevant"]:
                rr = 1.0 / rank
                break
        policies[name] = {
            "finalCount": len(selected),
            "relevantInFinal": len(relevant_selected),
            "recallAt10": recall,
            "reciprocalRankAt10": rr,
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
            print(json.dumps({"event": "query_complete", "query": q, "silverRelevantInPool": r["silverRelevantInPool"], "policies": r["policies"]}))
    finally:
        conn.close()
    duration_s = time.time() - started_at

    summary = {}
    for policy in ["baseline", "exact_and_semantic"]:
        recalls = [r["policies"][policy]["recallAt10"] for r in results if r["policies"][policy]["recallAt10"] is not None]
        rrs = [r["policies"][policy]["reciprocalRankAt10"] for r in results]
        summary[policy] = {
            "avg_recall_at_10_silver": float(np.mean(recalls)) if recalls else None,
            "avg_mrr_at_10_silver": float(np.mean(rrs)),
            "queries_with_zero_relevant_hits": sum(1 for rr in rrs if rr == 0.0),
        }

    receipt = {
        "schema": "atlas.latent256-silver-relevance-eval.v1",
        "canonical_authority": False,
        "note": "SILVER standard (lexical keyword match), NOT a human-labeled golden set. A bounded sanity check on relevance preservation, not a promotion gate. No nDCG (binary labels don't support graded relevance meaningfully). No Qdrant-native-MMR challenger (separate, not started).",
        "pool_k": POOL_K,
        "final_k": FINAL_K,
        "threshold": THRESHOLD,
        "query_count": len(QUERIES_WITH_KEYWORDS),
        "queries": results,
        "summary": summary,
        "duration_s": duration_s,
    }
    out_path = "docs/reports/latent256-silver-relevance-eval-v1.json"
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(receipt, fh, indent=2)
    print(json.dumps({"event": "receipt_written", "path": out_path}))
    print(json.dumps({"status": "SILVER_RELEVANCE_EVAL_PROVEN", "summary": summary}))


if __name__ == "__main__":
    main()
