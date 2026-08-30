"""LATENT-DIVERSITY-02: Qdrant-native-MMR challenger.

Compares selectDiverseCandidates() (Postgres exact-hash + latent_256 dedup, with refill) against
Qdrant's own native MMR query strategy operating directly on semantic_768 -- the control
experiment the review specifically recommended because it needs no second text-embedding model
and no query-side latent encoder:

  query -> EmbeddingGemma semantic_768 -> Qdrant candidates -> MMR over semantic_768

Uses codebase_chunks_768's `content` named vector (768-dim). Uses the SAME 10 queries and the
SAME silver-standard keyword-match relevance labels as benchmark_latent256_silver_relevance.py,
so results are directly comparable across all three policies:

  baseline                 -- Postgres pgvector top-10, no dedup
  exact_and_semantic+refill -- selectDiverseCandidates policy (Postgres, latent_256)
  qdrant_native_mmr         -- Qdrant MMR query on semantic_768 (no latent_256 involved)

Silver-standard caveat is identical to the earlier script: lexical keyword-in-source_ref match,
not human-labeled ground truth. codebase_chunks_768 is a known two-generation collection (some
points have a clean source_ref path, some carry an older `card:...`/numeric identity scheme --
see this repo's own documented collection-split finding) -- points with an unusable source_ref
simply can't match any keyword and are treated as silver-non-relevant, which is conservative
(never inflates qdrant_native_mmr's apparent recall).
"""

from __future__ import annotations

import json
import os
import re
import time

import requests

QDRANT_URL = "http://127.0.0.1:6333"
OLLAMA_URL = "http://127.0.0.1:11434"
EMBED_MODEL = "embeddinggemma:latest"
COLLECTION = "codebase_chunks_768"
POOL_K = 50
FINAL_K = 10
MMR_DIVERSITY = 0.5  # 0 = pure relevance, 1 = pure diversity; 0.5 is Qdrant's typical balanced default

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


def is_silver_relevant(source_ref: str, keywords: list[str]) -> bool:
    lowered = (source_ref or "").lower()
    return any(re.search(kw, lowered) for kw in keywords)


def qdrant_mmr_query(query_vec: list[float]) -> list[dict]:
    resp = requests.post(
        f"{QDRANT_URL}/collections/{COLLECTION}/points/query",
        json={
            "query": {"nearest": query_vec, "mmr": {"diversity": MMR_DIVERSITY, "candidates_limit": POOL_K}},
            "using": "content",
            "limit": FINAL_K,
            "with_payload": ["source_ref"],
        },
        timeout=30,
    )
    resp.raise_for_status()
    body = resp.json()
    if body.get("status") != "ok":
        raise RuntimeError(f"QDRANT_MMR_QUERY_FAILED: {body}")
    return body["result"]["points"]


def run_query(query_text: str, keywords: list[str]) -> dict:
    query_vec = embed_query(query_text)
    points = qdrant_mmr_query(query_vec)

    relevant_flags = [is_silver_relevant(p.get("payload", {}).get("source_ref", ""), keywords) for p in points]
    relevant_count = sum(relevant_flags)
    rr = 0.0
    for rank, is_rel in enumerate(relevant_flags, start=1):
        if is_rel:
            rr = 1.0 / rank
            break

    return {
        "query": query_text,
        "finalCount": len(points),
        "relevantInFinal": relevant_count,
        "reciprocalRankAt10": rr,
        "uniqueSourceRefs": len(set(p.get("payload", {}).get("source_ref", "") for p in points)),
    }


def main() -> None:
    started_at = time.time()
    results = []
    for q, kws in QUERIES_WITH_KEYWORDS:
        r = run_query(q, kws)
        results.append(r)
        print(json.dumps({"event": "query_complete", **r}))
    duration_s = time.time() - started_at

    import statistics
    avg_final = statistics.mean(r["finalCount"] for r in results)
    avg_relevant = statistics.mean(r["relevantInFinal"] for r in results)
    avg_mrr = statistics.mean(r["reciprocalRankAt10"] for r in results)
    avg_unique_sources = statistics.mean(r["uniqueSourceRefs"] for r in results)

    receipt = {
        "schema": "atlas.qdrant-native-mmr-challenger-eval.v1",
        "canonical_authority": False,
        "note": "SILVER standard relevance (same as latent256-silver-relevance-eval-v1.json). Operates on semantic_768 via codebase_chunks_768's native Qdrant MMR -- no latent_256 involved. codebase_chunks_768 is a known two-generation collection; points with an unusable source_ref are conservatively treated as silver-non-relevant.",
        "collection": COLLECTION,
        "mmr_diversity_param": MMR_DIVERSITY,
        "pool_k": POOL_K,
        "final_k": FINAL_K,
        "queries": results,
        "summary": {
            "avg_final_count": avg_final,
            "avg_relevant_in_final": avg_relevant,
            "avg_mrr_at_10_silver": avg_mrr,
            "avg_unique_source_refs": avg_unique_sources,
        },
        "comparison_note": "Compare against docs/reports/latent256-silver-relevance-eval-v1.json (exact_and_semantic avg_mrr_at_10_silver=0.800) and latent256-diversity-refill-partial-eval-v1.json (exact_and_semantic avg_unique_sources=7.4/10).",
        "duration_s": duration_s,
    }
    out_path = "docs/reports/qdrant-native-mmr-challenger-eval-v1.json"
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(receipt, fh, indent=2)
    print(json.dumps({"event": "receipt_written", "path": out_path}))
    print(json.dumps({"status": "MMR_CHALLENGER_EVAL_PROVEN", "summary": receipt["summary"]}))


if __name__ == "__main__":
    main()
