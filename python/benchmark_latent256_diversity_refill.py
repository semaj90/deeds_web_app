"""LATENT256-DIVERSITY-REFILL-01 (partial): does refill resolve the coverage regression found by
benchmark_latent256_dedup.py?

That earlier benchmark measured "how much redundancy exists in the raw top-50 pool" -- it did NOT
model the actual production shape (a small finalK selected from a larger pool, refilled when a
duplicate is skipped). This script does, mirroring selectDiverseCandidates() exactly: pool=50,
finalK=10, Stage A exact-content-hash collapse, Stage B latent_256 near-duplicate skip with
refill.

Reports unique-source coverage at finalK=10 for three policies:
  baseline            -- top-10 by relevance, no dedup at all
  exact_hash_only      -- Stage A only (content_hash collapse + refill)
  exact_and_semantic    -- Stage A + Stage B (full selectDiverseCandidates behavior)

This answers the specific diagnostic question raised in review. It does NOT attempt Recall@10/
MRR@10/nDCG@10 (those need a labeled golden query set with known-relevant documents, which does
not exist in this repo and is not fabricated here) or the Qdrant-native-MMR challenger (separate,
larger follow-up). Both are explicitly out of scope for this script.
"""

from __future__ import annotations

import json
import os
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
    return resp.json()["embeddings"][0]


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


def select_diverse(rows: list[dict], final_k: int, threshold: float, use_exact: bool, use_semantic: bool) -> list[dict]:
    """Mirrors selectDiverseCandidates() exactly: Stage A (exact content_hash) then Stage B
    (latent_256 cosine), greedy in rank order, refill until final_k or pool exhausted."""
    stage_a: list[dict] = []
    if use_exact:
        seen_hash: dict[str, str] = {}
        for r in rows:
            h = r.get("content_hash")
            if not h:
                stage_a.append(r)
                continue
            if h in seen_hash:
                continue  # exact duplicate, skip
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
        is_dup = any(cosine(vec, sv) >= threshold for sv in selected_vecs)
        if is_dup:
            continue
        selected_vecs.append(vec)
        selected.append(r)
    return selected


def run_query(conn, query_text: str) -> dict:
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

    policies = {}
    for name, use_exact, use_semantic in [
        ("baseline", False, False),
        ("exact_hash_only", True, False),
        ("exact_and_semantic", True, True),
    ]:
        selected = select_diverse(rows, FINAL_K, THRESHOLD, use_exact, use_semantic)
        policies[name] = {
            "finalCount": len(selected),
            "uniqueSources": len(set(r["source_ref"] for r in selected)),
        }

    return {"query": query_text, "poolSize": len(rows), "policies": policies}


def main() -> None:
    conn = psycopg2.connect(DATABASE_URL)
    started_at = time.time()
    results = []
    try:
        for q in REALISTIC_QUERIES:
            r = run_query(conn, q)
            results.append(r)
            print(json.dumps({"event": "query_complete", "query": q, "policies": r["policies"]}))
    finally:
        conn.close()
    duration_s = time.time() - started_at

    summary = {}
    for policy in ["baseline", "exact_hash_only", "exact_and_semantic"]:
        final_counts = [r["policies"][policy]["finalCount"] for r in results]
        unique_sources = [r["policies"][policy]["uniqueSources"] for r in results]
        summary[policy] = {
            "avg_final_count": float(np.mean(final_counts)),
            "avg_unique_sources": float(np.mean(unique_sources)),
            "min_final_count": min(final_counts),
        }

    baseline_avg = summary["baseline"]["avg_unique_sources"]
    for policy in ["exact_hash_only", "exact_and_semantic"]:
        summary[policy]["unique_source_change_vs_baseline_pct"] = (
            (summary[policy]["avg_unique_sources"] - baseline_avg) / baseline_avg
        )

    receipt = {
        "schema": "atlas.latent256-diversity-refill-partial-eval.v1",
        "canonical_authority": False,
        "note": "Answers ONLY whether refill resolves the coverage regression. Does not include Recall@K/MRR/nDCG (no labeled golden set exists) or the Qdrant-native-MMR challenger -- both explicitly out of scope here.",
        "pool_k": POOL_K,
        "final_k": FINAL_K,
        "threshold": THRESHOLD,
        "query_count": len(REALISTIC_QUERIES),
        "queries": results,
        "summary": summary,
        "duration_s": duration_s,
    }
    out_path = "docs/reports/latent256-diversity-refill-partial-eval-v1.json"
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(receipt, fh, indent=2)
    print(json.dumps({"event": "receipt_written", "path": out_path}))
    print(json.dumps({"status": "PARTIAL_REFILL_EVAL_PROVEN", "summary": summary}))


if __name__ == "__main__":
    main()
