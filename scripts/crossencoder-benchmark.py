#!/usr/bin/env python3
"""
CrossEncoder benchmark: measure quality lift, latency, and VRAM impact.
Compares cross-encoders (mxbai-rerank-base-v2 and bge-reranker) over
the final fused candidate set (or frozen eval corpus) under identical inputs.

Usage:
  python scripts/crossencoder-benchmark.py --mock --models mxbai bge
  python scripts/crossencoder-benchmark.py --candidate-input path/to/fused_candidates.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
import time
from dataclasses import asdict, dataclass
from typing import Any, Mapping, Optional, Sequence

# Model configurations
MODEL_CONFIGS: dict[str, dict[str, Any]] = {
    "mxbai": {
        "model_id": "mixedbread-ai/mxbai-rerank-base-v2",
        "model_path": "models/mxbai-rerank-base-v2",
        "temperature": 1.0,
        "bias": 0.0,
        "max_length": 512,
    },
    "bge": {
        "model_id": "BAAI/bge-reranker-base",
        "model_path": "models/bge-reranker-base",
        "temperature": 1.0,
        "bias": 0.0,
        "max_length": 512,
    },
}

DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db",
)


@dataclass
class ModelQueryScore:
    model_key: str
    model_id: str
    latency_ms: float
    vram_peak_mb: float
    top_5: list[tuple[str, float]]  # (packet_key, calibrated_score)
    ndcg_at_5: Optional[float]
    ndcg_delta: Optional[float]


@dataclass
class FusedCandidateQueryBenchmark:
    query_id: str
    query_text: str
    candidate_count: int
    baseline_top_5: list[tuple[str, float]]
    baseline_ndcg_at_5: Optional[float]
    model_results: dict[str, ModelQueryScore]
    model_rank_correlation: Optional[float]  # Spearman rho between model predictions


def sigmoid_calibrate(raw_logit: float, temperature: float = 1.0, bias: float = 0.0) -> float:
    """Calibrate raw cross-encoder logit into [0, 1] probability mass."""
    if not math.isfinite(raw_logit):
        return 0.0
    t = temperature if temperature > 0 else 1.0
    scaled = (raw_logit - bias) / t
    if scaled > 40.0:
        return 1.0
    if scaled < -40.0:
        return 0.0
    return 1.0 / (1.0 + math.exp(-scaled))


def compute_ndcg_at_5(ranking: Sequence[tuple[str, float]], gold_grades: Mapping[str, int]) -> float:
    """Compute NDCG@5 for a ranking against gold relevance grades."""
    dcg = 0.0
    for i, (packet_key, _) in enumerate(ranking[:5]):
        grade = gold_grades.get(packet_key, 0)
        relevance = (2**grade - 1) / math.log2(i + 2)
        dcg += relevance

    # Compute IDCG from sorted gold grades
    all_grades = sorted(gold_grades.values(), reverse=True)[:5]
    idcg = sum((2**grade - 1) / math.log2(i + 2) for i, grade in enumerate(all_grades))

    if idcg <= 0.0:
        return 0.0
    return min(1.0, dcg / idcg)


def compute_spearman_correlation(
    scores_a: Sequence[float], scores_b: Sequence[float]
) -> Optional[float]:
    """Compute Spearman rank correlation between two score vectors of identical length."""
    n = len(scores_a)
    if n < 2 or len(scores_b) != n:
        return None

    def get_ranks(values: Sequence[float]) -> list[float]:
        sorted_indices = sorted(range(n), key=lambda idx: values[idx])
        ranks = [0.0] * n
        for rank, idx in enumerate(sorted_indices):
            ranks[idx] = float(rank + 1)
        return ranks

    ranks_a = get_ranks(scores_a)
    ranks_b = get_ranks(scores_b)

    d_squared_sum = sum((ranks_a[i] - ranks_b[i]) ** 2 for i in range(n))
    rho = 1.0 - (6.0 * d_squared_sum) / (n * (n**2 - 1))
    return max(-1.0, min(1.0, rho))


def load_fused_candidates_from_file(file_path: str) -> list[dict[str, Any]]:
    """Load candidates from SearchRuntime selected candidate set JSON or JSONL."""
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read().strip()

    if content.startswith("{"):
        data = json.loads(content)
        if "selectedCandidates" in data:
            return [
                {
                    "query_id": data.get("requestId", "file_query"),
                    "query_text": data.get("queryText", "fused candidate retrieval query"),
                    "candidates": [
                        {
                            "packet_key": c["packetKey"],
                            "text": c.get("text", f"Content for {c['packetKey']}"),
                            "baseline_score": c.get("score", 0.5),
                            "relevance_grade": c.get("relevanceGrade", 1),
                        }
                        for c in data["selectedCandidates"]
                    ],
                }
            ]
        elif "queries" in data:
            return data["queries"]

    # Try JSONL
    queries: list[dict[str, Any]] = []
    for line in content.splitlines():
        line = line.strip()
        if line:
            queries.append(json.loads(line))
    return queries


def fetch_fused_candidates_from_db(conn: Any, query_id: str) -> list[dict[str, Any]]:
    """Fetch fused candidates from database retrieval_results."""
    cur = conn.cursor()
    cur.execute(
        """
        SELECT
            packet_key,
            text,
            COALESCE(score, xgboost_v2_score, 0.0) AS fused_score,
            COALESCE(relevance_grade, 0) AS relevance_grade
        FROM retrieval_results
        WHERE query_id = %s
            AND model IN ('search_runtime_fused', 'xgboost_v2', 'fused_rrf')
        ORDER BY fused_score DESC
        LIMIT 20
        """,
        (query_id,),
    )
    return [
        {
            "packet_key": row[0],
            "text": row[1] or f"Text for {row[0]}",
            "baseline_score": float(row[2]),
            "relevance_grade": int(row[3]),
        }
        for row in cur.fetchall()
    ]


def mock_rerank_batch(
    query: str,
    candidates: Sequence[Mapping[str, Any]],
    model_key: str,
) -> tuple[list[tuple[str, float]], float, float]:
    """Deterministic mock scorer for CI and offline execution."""
    seed = int(hashlib.sha256(f"{model_key}:{query}".encode("utf-8")).hexdigest()[:8], 16)
    scored: list[tuple[str, float]] = []
    for i, c in enumerate(candidates):
        key = c["packet_key"]
        k_hash = int(hashlib.sha256(f"{key}:{seed}".encode("utf-8")).hexdigest()[:4], 16)
        raw_logit = ((k_hash % 2000) - 1000) / 200.0  # Range -5.0 to +5.0
        calibrated = sigmoid_calibrate(raw_logit)
        scored.append((key, calibrated))

    ranked = sorted(scored, key=lambda x: x[1], reverse=True)
    latency_ms = 4.2 + (len(candidates) * 0.8)
    vram_peak_mb = 256.0 if model_key == "mxbai" else 280.0
    return ranked, latency_ms, vram_peak_mb


def rerank_batch_live(
    tokenizer: Any,
    model: Any,
    query: str,
    candidates: Sequence[Mapping[str, Any]],
    config: Mapping[str, Any],
) -> tuple[list[tuple[str, float]], float, float]:
    """Execute live PyTorch CrossEncoder reranking."""
    import torch  # lazy import

    max_length = config.get("max_length", 512)
    batch_size = 8
    temperature = config.get("temperature", 1.0)
    bias = config.get("bias", 0.0)

    is_cuda = torch.cuda.is_available()
    if is_cuda:
        torch.cuda.reset_peak_memory_stats()
        torch.cuda.synchronize()

    started = time.perf_counter()
    scored: list[tuple[str, float]] = []

    for start in range(0, len(candidates), batch_size):
        batch = candidates[start : start + batch_size]
        pairs = [[query, c["text"]] for c in batch]

        encoded = tokenizer(
            pairs,
            padding=True,
            truncation=True,
            max_length=max_length,
            return_tensors="pt",
        )
        if is_cuda:
            encoded = encoded.to("cuda")

        with torch.inference_mode():
            raw_logits = model(**encoded).logits.reshape(-1).float().cpu().numpy()

        for c, logit in zip(batch, raw_logits, strict=True):
            calibrated = sigmoid_calibrate(float(logit), temperature=temperature, bias=bias)
            scored.append((c["packet_key"], calibrated))

    if is_cuda:
        torch.cuda.synchronize()
        peak_mb = torch.cuda.max_memory_allocated() / (1024 * 1024)
    else:
        peak_mb = 0.0

    elapsed_ms = (time.perf_counter() - started) * 1_000.0
    ranked = sorted(scored, key=lambda x: x[1], reverse=True)
    return ranked, elapsed_ms, peak_mb


def run_benchmark_on_query(
    query_id: str,
    query_text: str,
    candidates: Sequence[Mapping[str, Any]],
    models_to_test: Sequence[str],
    live_models: Optional[Mapping[str, tuple[Any, Any]]] = None,
    use_mock: bool = False,
) -> Optional[FusedCandidateQueryBenchmark]:
    """Benchmark mxbai vs bge under identical frozen candidate inputs."""
    if not candidates:
        return None

    gold_grades = {c["packet_key"]: int(c.get("relevance_grade", 0)) for c in candidates}
    baseline_ranking = sorted(
        [(c["packet_key"], float(c.get("baseline_score", 0.0))) for c in candidates],
        key=lambda x: x[1],
        reverse=True,
    )
    baseline_top_5 = baseline_ranking[:5]
    baseline_ndcg = compute_ndcg_at_5(baseline_top_5, gold_grades)

    model_results: dict[str, ModelQueryScore] = {}
    model_score_vectors: dict[str, list[float]] = {}

    for model_key in models_to_test:
        config = MODEL_CONFIGS[model_key]
        if use_mock or live_models is None or model_key not in live_models:
            ranked, latency_ms, vram_peak_mb = mock_rerank_batch(query_text, candidates, model_key)
        else:
            tokenizer, model = live_models[model_key]
            ranked, latency_ms, vram_peak_mb = rerank_batch_live(
                tokenizer, model, query_text, candidates, config
            )

        top_5 = ranked[:5]
        ndcg = compute_ndcg_at_5(top_5, gold_grades)
        ndcg_delta = ndcg - baseline_ndcg if baseline_ndcg > 0 else 0.0

        model_results[model_key] = ModelQueryScore(
            model_key=model_key,
            model_id=config["model_id"],
            latency_ms=round(latency_ms, 2),
            vram_peak_mb=round(vram_peak_mb, 2),
            top_5=top_5,
            ndcg_at_5=round(ndcg, 4),
            ndcg_delta=round(ndcg_delta, 4),
        )

        # Build candidate score vector preserving original candidate order
        score_by_key = dict(ranked)
        model_score_vectors[model_key] = [
            score_by_key.get(c["packet_key"], 0.0) for c in candidates
        ]

    rank_corr = None
    if len(models_to_test) >= 2:
        m1, m2 = models_to_test[0], models_to_test[1]
        rank_corr = compute_spearman_correlation(
            model_score_vectors[m1], model_score_vectors[m2]
        )

    return FusedCandidateQueryBenchmark(
        query_id=query_id,
        query_text=query_text,
        candidate_count=len(candidates),
        baseline_top_5=baseline_top_5,
        baseline_ndcg_at_5=round(baseline_ndcg, 4),
        model_results=model_results,
        model_rank_correlation=round(rank_corr, 4) if rank_corr is not None else None,
    )


def make_synthetic_test_queries() -> list[dict[str, Any]]:
    """Produce deterministic frozen test queries when DB is unavailable."""
    return [
        {
            "query_id": f"q_eval_{i+1:02d}",
            "query_text": f"Search query {i+1} for legal AI packet synthesis",
            "candidates": [
                {
                    "packet_key": f"pkt:entity:{i}_{j}",
                    "text": f"Candidate text document {j} for topic {i} in legal deeds",
                    "baseline_score": round(0.9 - (j * 0.04), 3),
                    "relevance_grade": 3 if j == 0 else (2 if j in (1, 2) else 0),
                }
                for j in range(15)
            ],
        }
        for i in range(5)
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description="CrossEncoder Benchmark for Fused Candidates")
    parser.add_argument("--candidate-input", type=str, default=None, help="Path to fused candidates JSON/JSONL")
    parser.add_argument("--models", nargs="+", default=["mxbai", "bge"], choices=["mxbai", "bge"], help="Models to compare")
    parser.add_argument("--mock", action="store_true", help="Run deterministic mock scoring (offline/CI mode)")
    parser.add_argument("--dry-run", action="store_true", help="Do not write output file")
    parser.add_argument("--output", type=str, default="crossencoder-benchmark-results.json", help="Output results path")
    args = parser.parse_args()

    print("[Benchmark] CrossEncoder Fused-Candidate Benchmark")
    print(f"[Benchmark] Target models: {args.models}")
    print(f"[Benchmark] Execution mode: {'MOCK' if args.mock else 'LIVE'}")

    live_models: dict[str, tuple[Any, Any]] = {}
    if not args.mock:
        try:
            import torch
            from transformers import AutoModelForSequenceClassification, AutoTokenizer

            for m_key in args.models:
                cfg = MODEL_CONFIGS[m_key]
                m_path = cfg["model_path"]
                if os.path.exists(m_path):
                    print(f"[Benchmark] Loading {m_key} from {m_path}...")
                    tok = AutoTokenizer.from_pretrained(m_path)
                    mod = AutoModelForSequenceClassification.from_pretrained(
                        m_path,
                        torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
                        device_map="auto" if torch.cuda.is_available() else None,
                    ).eval()
                    live_models[m_key] = (tok, mod)
                else:
                    print(f"[Benchmark] Model path {m_path} not found locally; falling back to mock for {m_key}")
        except Exception as exc:
            print(f"[Benchmark] Live model load failed: {exc}; falling back to mock mode")
            args.mock = True

    # Ingest candidates
    if args.candidate_input and os.path.exists(args.candidate_input):
        print(f"[Benchmark] Loading candidates from {args.candidate_input}...")
        query_bundles = load_fused_candidates_from_file(args.candidate_input)
    else:
        # Check DB
        query_bundles = []
        try:
            import psycopg

            conn = psycopg.connect(DB_URL)
            cur = conn.cursor()
            cur.execute(
                """
                SELECT q.query_id, q.query_text
                FROM evaluation_queries q
                JOIN evaluation_splits s ON q.query_id = s.query_id
                WHERE s.split_name = 'test'
                ORDER BY q.query_id
                LIMIT 10
                """
            )
            rows = cur.fetchall()
            for q_id, q_text in rows:
                cands = fetch_fused_candidates_from_db(conn, q_id)
                if cands:
                    query_bundles.append({"query_id": q_id, "query_text": q_text, "candidates": cands})
            conn.close()
        except Exception:
            pass

        if not query_bundles:
            print("[Benchmark] No database records; using frozen synthetic evaluation corpus")
            query_bundles = make_synthetic_test_queries()

    print(f"[Benchmark] Evaluating {len(query_bundles)} queries across identical candidate sets...")
    results: list[FusedCandidateQueryBenchmark] = []
    for qb in query_bundles:
        res = run_benchmark_on_query(
            query_id=qb["query_id"],
            query_text=qb["query_text"],
            candidates=qb["candidates"],
            models_to_test=args.models,
            live_models=live_models,
            use_mock=args.mock,
        )
        if res:
            results.append(res)

    print("\n" + "=" * 60)
    print("CrossEncoder Benchmark Results Summary (Identical Candidate Sets)")
    print("=" * 60)
    print(f"Total Queries Evaluated: {len(results)}")
    for m_key in args.models:
        latencies = [r.model_results[m_key].latency_ms for r in results if m_key in r.model_results]
        vrams = [r.model_results[m_key].vram_peak_mb for r in results if m_key in r.model_results]
        ndcg_deltas = [
            r.model_results[m_key].ndcg_delta
            for r in results
            if m_key in r.model_results and r.model_results[m_key].ndcg_delta is not None
        ]
        avg_lat = sum(latencies) / len(latencies) if latencies else 0.0
        avg_vram = sum(vrams) / len(vrams) if vrams else 0.0
        avg_delta = sum(ndcg_deltas) / len(ndcg_deltas) if ndcg_deltas else 0.0
        print(f"  Model [{m_key}]: Avg Latency: {avg_lat:.2f}ms | Avg Peak VRAM: {avg_vram:.2f}MB | Mean NDCG@5 Lift: {avg_delta:+.4f}")

    correlations = [r.model_rank_correlation for r in results if r.model_rank_correlation is not None]
    if correlations:
        avg_corr = sum(correlations) / len(correlations)
        print(f"  Spearman Rank Correlation between models: {avg_corr:.4f}")

    if not args.dry_run:
        output_data = {
            "schema": "atlas.crossencoder-benchmark-results.v1",
            "evaluatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "models": args.models,
            "mockMode": args.mock,
            "queryCount": len(results),
            "results": [asdict(r) for r in results],
        }
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(output_data, f, indent=2)
        print(f"\n[Benchmark] Results written to {args.output}")


if __name__ == "__main__":
    main()
