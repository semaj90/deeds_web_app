"""MMR-LAMBDA-SWEEP-01 (corrected terminology): fine-grained mmrRelevanceWeight sweep.

Renamed from the earlier "lambda" naming per review: LambdaMART/LambdaRank's "lambda" refers to
metric-weighted ranking gradients during training -- an unrelated concept. This script uses
mmrRelevanceWeight throughout: MMR's own operator-selected relevance/diversity interpolation
coefficient (Qdrant's own API exposes this as `diversity`, where mmrRelevanceWeight = 1 -
diversity). Nothing here trains a ranking model; XGBoost/LambdaMART work is explicitly future,
gated on a human-labeled golden set that doesn't exist yet.

Fills in the earlier coarse sweep ({0.3, 0.5, 0.7, 0.9, 1.0}) with the finer grid the review
specifically requested in the range it flagged as the interesting zone:
  {0.50, 0.60, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 1.00}

Adds duplicateRate@10 (fraction of the final K whose pairwise max latent_256 cosine similarity
to another selected candidate exceeds the evaluated threshold -- a direct redundancy measure,
independent of the silver relevance labels) and computes an explicit dominance verdict against
the latent_256 policy's reference point.
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
LATENT_THRESHOLD = 0.90  # for duplicateRate@10, using the same evaluated latent_256 threshold
POOL_K = 50
FINAL_K = 10
MMR_RELEVANCE_WEIGHTS = [0.50, 0.60, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 1.00]

# Reference points already established (docs/reports/apples-to-apples-diversity-eval-v1.json)
LATENT_256_REFERENCE = {"avg_unique_sources": 7.4, "avg_recall_at_10_silver": 0.2374621124621125}
BASELINE_REFERENCE = {"avg_unique_sources": 6.6, "avg_recall_at_10_silver": 0.2388348138348138}
RECALL_TOLERANCE = 0.99  # recall@10 >= baseline * 0.99, per the review's Pareto criterion

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


def select_semantic_768_mmr(rows: list[dict], final_k: int, query_vec_norm: np.ndarray, weight: float) -> list[dict]:
    """weight = mmrRelevanceWeight: 1.0 = pure relevance, 0.0 = pure diversity."""
    remaining = list(rows)
    selected: list[dict] = []
    while remaining and len(selected) < final_k:
        best_idx, best_score = None, -1e9
        for i, r in enumerate(remaining):
            relevance = cosine(r["content_vec_norm"], query_vec_norm)
            redundancy = max((cosine(r["content_vec_norm"], s["content_vec_norm"]) for s in selected), default=0.0)
            score = weight * relevance - (1 - weight) * redundancy
            if score > best_score:
                best_score, best_idx = score, i
        selected.append(remaining.pop(best_idx))
    return selected


def duplicate_rate(selected: list[dict], threshold: float) -> float:
    """Fraction of selected candidates whose latent_256 vector has cosine similarity >=
    threshold to at least one OTHER selected candidate -- independent of silver labels."""
    with_vec = [r for r in selected if r.get("latent_vec") is not None]
    if not with_vec:
        return 0.0
    flagged = 0
    for i, r in enumerate(with_vec):
        for j, other in enumerate(with_vec):
            if i == j:
                continue
            if cosine(r["latent_vec"], other["latent_vec"]) >= threshold:
                flagged += 1
                break
    return flagged / len(selected)


def fetch_pool(conn, query_text: str, keywords: list[str]) -> tuple[list[dict], np.ndarray, int]:
    query_vec = np.array(embed_query(query_text), dtype=np.float32)
    query_vec_norm = query_vec / np.linalg.norm(query_vec)
    query_vec_literal = "[" + ",".join(f"{v:.6f}" for v in query_vec) + "]"

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT id::text AS id, relative_path AS source_ref,
                   content_embedding::text AS content_embedding, latent_256::text AS latent_256
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
        r["latent_vec"] = np.fromstring(r["latent_256"].strip("[]"), sep=",", dtype=np.float32) if r["latent_256"] else None
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
            weight_results = {}
            for weight in MMR_RELEVANCE_WEIGHTS:
                selected = select_semantic_768_mmr(rows, FINAL_K, query_vec_norm, weight)
                relevant_selected = [r for r in selected if r["silver_relevant"]]
                recall = len(relevant_selected) / silver_relevant_in_pool if silver_relevant_in_pool else None
                rr = 0.0
                for rank, r in enumerate(selected, start=1):
                    if r["silver_relevant"]:
                        rr = 1.0 / rank
                        break
                weight_results[str(weight)] = {
                    "uniqueSources": len(set(r["source_ref"] for r in selected)),
                    "relevantInFinal": len(relevant_selected),
                    "recallAt10": recall,
                    "reciprocalRankAt10": rr,
                    "duplicateRateAt10": duplicate_rate(selected, LATENT_THRESHOLD),
                }
            per_query_results.append({"query": q, "silverRelevantInPool": silver_relevant_in_pool, "weights": weight_results})
            print(json.dumps({"event": "query_complete", "query": q}))
    finally:
        conn.close()
    duration_s = time.time() - started_at

    summary = {}
    for weight in MMR_RELEVANCE_WEIGHTS:
        key = str(weight)
        unique_sources = [r["weights"][key]["uniqueSources"] for r in per_query_results]
        recalls = [r["weights"][key]["recallAt10"] for r in per_query_results if r["weights"][key]["recallAt10"] is not None]
        rrs = [r["weights"][key]["reciprocalRankAt10"] for r in per_query_results]
        dup_rates = [r["weights"][key]["duplicateRateAt10"] for r in per_query_results]
        avg_recall = float(np.mean(recalls)) if recalls else None
        summary[key] = {
            "avg_unique_sources": float(np.mean(unique_sources)),
            "avg_recall_at_10_silver": avg_recall,
            "avg_mrr_at_10_silver": float(np.mean(rrs)),
            "avg_duplicate_rate_at_10": float(np.mean(dup_rates)),
            "meets_recall_tolerance": (avg_recall is not None and avg_recall >= BASELINE_REFERENCE["avg_recall_at_10_silver"] * RECALL_TOLERANCE),
        }

    # Dominance verdict: does any weight meet the recall tolerance AND beat latent_256's diversity?
    dominating_weights = [
        w for w in MMR_RELEVANCE_WEIGHTS
        if summary[str(w)]["meets_recall_tolerance"]
        and summary[str(w)]["avg_unique_sources"] > LATENT_256_REFERENCE["avg_unique_sources"]
    ]
    if dominating_weights:
        verdict = "YES"
        verdict_detail = f"mmrRelevanceWeight values {dominating_weights} meet recall tolerance AND exceed latent_256's diversity -- MMR may make the learned dedup unnecessary at these operating points."
    else:
        verdict = "NO"
        verdict_detail = "No mmrRelevanceWeight in the swept range both meets the recall tolerance (>= baseline*0.99) and exceeds latent_256's diversity. latent_256 represents a genuinely useful conservative operating point not reachable by tuning MMR alone."

    receipt = {
        "schema": "atlas.mmr-relevance-weight-sweep.v1",
        "canonical_authority": False,
        "note": "Renamed from 'lambda' to mmrRelevanceWeight to avoid collision with LambdaMART/LambdaRank's unrelated gradient-construction lambda, per review. 1.0 = pure relevance, 0.0 = pure diversity (Qdrant's own diversity param = 1 - mmrRelevanceWeight).",
        "pool_k": POOL_K,
        "final_k": FINAL_K,
        "mmr_relevance_weights": MMR_RELEVANCE_WEIGHTS,
        "latent_256_reference_point": LATENT_256_REFERENCE,
        "baseline_reference_point": BASELINE_REFERENCE,
        "recall_tolerance": RECALL_TOLERANCE,
        "queries": per_query_results,
        "summary": summary,
        "dominance_verdict": verdict,
        "dominance_verdict_detail": verdict_detail,
        "duration_s": duration_s,
    }
    out_path = "docs/reports/mmr-relevance-weight-sweep-v1.json"
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(receipt, fh, indent=2)
    print(json.dumps({"event": "receipt_written", "path": out_path}))
    print(json.dumps({"status": "MMR_RELEVANCE_WEIGHT_SWEEP_PROVEN", "verdict": verdict, "summary": summary}))


if __name__ == "__main__":
    main()
