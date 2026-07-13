#!/usr/bin/env python3
"""
CrossEncoder benchmark: measure quality lift, latency, and VRAM impact.
Tests mxbai-rerank-base-v2 over frozen XGBoost v2 top-20 candidates.

Usage:
  python scripts/crossencoder-benchmark.py [--dry-run] [--top-k 5]
"""

from __future__ import annotations

import argparse
import json
import time
from dataclasses import dataclass
from typing import Optional

import psycopg
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

# Database connection
DB_URL = "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db"

MODEL_ID = "mixedbread-ai/mxbai-rerank-base-v2"
MODEL_PATH = "models/mxbai-rerank-base-v2"
MAX_LENGTH = 512
BATCH_SIZE = 8


@dataclass
class BenchmarkResult:
    """Results for a single query."""
    query_id: str
    query_text: str
    candidate_count: int
    latency_ms: float
    vram_peak_mb: float
    # XGBoost ranking (top-20)
    xgboost_top_5: list[tuple[str, float]]
    # Reranker ranking (top-5)
    reranker_top_5: list[tuple[str, float]]
    # Overlap between top-5 lists
    overlap_at_5: int
    # NDCG@5 delta (if gold judgments available)
    ndcg_xgboost: Optional[float]
    ndcg_reranker: Optional[float]
    ndcg_delta: Optional[float]


def load_model() -> tuple[AutoTokenizer, AutoModelForSequenceClassification]:
    """Load mxbai-rerank-base-v2 model."""
    print(f"[Benchmark] Loading model from {MODEL_PATH}...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_PATH,
        torch_dtype=torch.float16,
        device_map="auto",
    ).eval()
    print("[Benchmark] Model loaded")
    return tokenizer, model


def fetch_xgboost_v2_top_20(conn: psycopg.Connection, query_id: str) -> list[dict]:
    """Fetch XGBoost v2 top-20 candidates for a query."""
    cur = conn.cursor()
    cur.execute("""
        SELECT
            packet_key,
            text,
            xgboost_v2_score,
            relevance_grade
        FROM retrieval_results
        WHERE query_id = %s
            AND model = 'xgboost_v2'
        ORDER BY xgboost_v2_score DESC
        LIMIT 20
    """, (query_id,))

    return [
        {
            "packet_key": row[0],
            "text": row[1],
            "xgboost_score": row[2],
            "relevance_grade": row[3],
        }
        for row in cur.fetchall()
    ]


def rerank_batch(
    tokenizer: AutoTokenizer,
    model: AutoModelForSequenceClassification,
    query: str,
    candidates: list[dict],
) -> list[tuple[str, float]]:
    """Rerank candidates using CrossEncoder."""
    torch.cuda.reset_peak_memory_stats()
    torch.cuda.synchronize()

    started = time.perf_counter()
    scored: list[tuple[str, float]] = []

    for start in range(0, len(candidates), BATCH_SIZE):
        batch = candidates[start : start + BATCH_SIZE]
        pairs = [[query, c["text"]] for c in batch]

        encoded = tokenizer(
            pairs,
            padding=True,
            truncation=True,
            max_length=MAX_LENGTH,
            return_tensors="pt",
        ).to("cuda")

        with torch.inference_mode():
            logits = model(**encoded).logits.reshape(-1).float().cpu().numpy()

        scored.extend(
            (c["packet_key"], float(score))
            for c, score in zip(batch, logits, strict=True)
        )

    torch.cuda.synchronize()
    elapsed_ms = (time.perf_counter() - started) * 1_000
    peak_mb = torch.cuda.max_memory_allocated() / (1024 * 1024)

    # Sort by score (descending)
    ranked = sorted(scored, key=lambda x: x[1], reverse=True)

    print(
        f"  Reranked {len(candidates)} candidates in {elapsed_ms:.2f}ms, "
        f"peak VRAM {peak_mb:.2f}MB"
    )

    return ranked, elapsed_ms, peak_mb


def compute_ndcg_at_5(ranking: list[tuple[str, float]], gold_grades: dict) -> float:
    """Compute NDCG@5 for a ranking against gold labels."""
    dcg = 0.0
    idcg = 0.0

    for i, (packet_key, _) in enumerate(ranking[:5]):
        grade = gold_grades.get(packet_key, 0)
        relevance = (2 ** grade - 1) / (2 ** (i + 1))
        dcg += relevance

    # Ideal DCG (assuming grades 3, 3, 3, 2, 2)
    ideal_grades = [3, 3, 3, 2, 2]
    for i, grade in enumerate(ideal_grades):
        relevance = (2 ** grade - 1) / (2 ** (i + 1))
        idcg += relevance

    if idcg == 0:
        return 0.0

    return dcg / idcg


def benchmark_query(
    conn: psycopg.Connection,
    tokenizer: AutoTokenizer,
    model: AutoModelForSequenceClassification,
    query_id: str,
    query_text: str,
) -> BenchmarkResult:
    """Benchmark a single query."""
    # Fetch XGBoost v2 top-20
    candidates = fetch_xgboost_v2_top_20(conn, query_id)

    if not candidates:
        print(f"[Benchmark] Query {query_id}: no candidates found, skipping")
        return None

    print(f"[Benchmark] Query {query_id}: {len(candidates)} candidates")

    # Rerank
    ranked, latency_ms, vram_peak_mb = rerank_batch(
        tokenizer, model, query_text, candidates
    )

    # Extract top-5
    xgboost_top_5 = [
        (c["packet_key"], c["xgboost_score"]) for c in candidates[:5]
    ]
    reranker_top_5 = ranked[:5]

    # Overlap
    xgboost_keys = set(k for k, _ in xgboost_top_5)
    reranker_keys = set(k for k, _ in reranker_top_5)
    overlap = len(xgboost_keys & reranker_keys)

    # NDCG@5 (if gold judgments available)
    gold_grades = {c["packet_key"]: c["relevance_grade"] for c in candidates}
    ndcg_xgboost = compute_ndcg_at_5(xgboost_top_5, gold_grades)
    ndcg_reranker = compute_ndcg_at_5(reranker_top_5, gold_grades)
    ndcg_delta = ndcg_reranker - ndcg_xgboost if ndcg_xgboost > 0 else None

    return BenchmarkResult(
        query_id=query_id,
        query_text=query_text,
        candidate_count=len(candidates),
        latency_ms=latency_ms,
        vram_peak_mb=vram_peak_mb,
        xgboost_top_5=xgboost_top_5,
        reranker_top_5=reranker_top_5,
        overlap_at_5=overlap,
        ndcg_xgboost=ndcg_xgboost,
        ndcg_reranker=ndcg_reranker,
        ndcg_delta=ndcg_delta,
    )


def main():
    parser = argparse.ArgumentParser(description="CrossEncoder benchmark")
    parser.add_argument("--dry-run", action="store_true", help="Do not write results")
    parser.add_argument(
        "--top-k", type=int, default=5, help="Top-K candidates to evaluate"
    )
    args = parser.parse_args()

    print("[Benchmark] CrossEncoder Reranker Benchmark")
    print(f"[Benchmark] Model: {MODEL_ID}")
    print(f"[Benchmark] Device: cuda" if torch.cuda.is_available() else "cpu")

    # Load model
    tokenizer, model = load_model()

    # Connect to DB
    print("[Benchmark] Connecting to database...")
    conn = psycopg.connect(DB_URL)

    # Fetch test queries (from evaluation_splits)
    cur = conn.cursor()
    cur.execute("""
        SELECT q.query_id, q.query_text
        FROM evaluation_queries q
        JOIN evaluation_splits s ON q.query_id = s.query_id
        WHERE s.split_name = 'test'
        ORDER BY q.query_id
        LIMIT 15
    """)

    test_queries = [(row[0], row[1]) for row in cur.fetchall()]
    print(f"[Benchmark] Found {len(test_queries)} test queries")

    # Benchmark each query
    results = []
    for query_id, query_text in test_queries:
        result = benchmark_query(conn, tokenizer, model, query_id, query_text)
        if result:
            results.append(result)

    conn.close()

    # Aggregate results
    if results:
        print("\n[Benchmark] RESULTS\n")
        print(f"  Total queries: {len(results)}")
        print(
            f"  Avg latency: {sum(r.latency_ms for r in results) / len(results):.2f}ms"
        )
        print(
            f"  Avg VRAM peak: {sum(r.vram_peak_mb for r in results) / len(results):.2f}MB"
        )
        print(
            f"  Avg overlap@5: {sum(r.overlap_at_5 for r in results) / len(results):.2f}"
        )

        ndcg_deltas = [r.ndcg_delta for r in results if r.ndcg_delta is not None]
        if ndcg_deltas:
            mean_delta = sum(ndcg_deltas) / len(ndcg_deltas)
            print(f"  Mean NDCG@5 delta: {mean_delta:+.4f}")

        # Write results
        if not args.dry_run:
            print("\n[Benchmark] Writing results to crossencoder-benchmark-results.json")
            with open("crossencoder-benchmark-results.json", "w") as f:
                json.dump(
                    [
                        {
                            "query_id": r.query_id,
                            "candidate_count": r.candidate_count,
                            "latency_ms": r.latency_ms,
                            "vram_peak_mb": r.vram_peak_mb,
                            "overlap_at_5": r.overlap_at_5,
                            "ndcg_xgboost": r.ndcg_xgboost,
                            "ndcg_reranker": r.ndcg_reranker,
                            "ndcg_delta": r.ndcg_delta,
                        }
                        for r in results
                    ],
                    f,
                    indent=2,
                )
    else:
        print("[Benchmark] No results")


if __name__ == "__main__":
    main()
