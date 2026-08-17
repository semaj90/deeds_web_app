#!/usr/bin/env python3
"""CrossEncoder benchmark for a frozen Parent Atlas candidate fabric.

Preferred input is a revisioned JSON file so evaluation is reproducible and does
not silently depend on a live database ranking owner.

Input schema (list of query objects):
[
  {
    "query_id": "q1",
    "query_text": "...",
    "candidates": [
      {
        "packet_key": "packet:...",
        "text": "...",
        "baseline_score": 0.7,
        "relevance_grade": 3
      }
    ]
  }
]

A legacy database fallback remains available only when DATABASE_URL is set.

Usage:
  python scripts/crossencoder-benchmark.py --input eval-candidates.json --top-k 5
  DATABASE_URL=... python scripts/crossencoder-benchmark.py --legacy-db --top-k 5
"""

from __future__ import annotations

import argparse
import json
import math
import os
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Optional

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

MODEL_ID = os.environ.get("CROSS_ENCODER_MODEL_ID", "mixedbread-ai/mxbai-rerank-base-v2")
MODEL_PATH = os.environ.get("CROSS_ENCODER_MODEL_PATH", "models/mxbai-rerank-base-v2")
MODEL_REVISION = os.environ.get("CROSS_ENCODER_MODEL_REVISION", MODEL_ID)
TOKENIZER_REVISION = os.environ.get("CROSS_ENCODER_TOKENIZER_REVISION", MODEL_REVISION)
INFERENCE_REVISION = os.environ.get("CROSS_ENCODER_INFERENCE_REVISION", "cross-encoder-logit-v1")
MAX_LENGTH = int(os.environ.get("CROSS_ENCODER_MAX_LENGTH", "512"))
BATCH_SIZE = int(os.environ.get("CROSS_ENCODER_BATCH_SIZE", "8"))


@dataclass(frozen=True)
class Candidate:
    packet_key: str
    text: str
    baseline_score: float
    relevance_grade: int


@dataclass(frozen=True)
class QueryCase:
    query_id: str
    query_text: str
    candidates: list[Candidate]


@dataclass(frozen=True)
class RerankExecution:
    ranking: list[tuple[str, float]]
    latency_ms: float
    vram_peak_mb: float
    device: str


@dataclass(frozen=True)
class BenchmarkResult:
    query_id: str
    candidate_count: int
    latency_ms: float
    vram_peak_mb: float
    device: str
    overlap_at_k: int
    ndcg_baseline: float
    ndcg_reranker: float
    ndcg_delta: float


def resolve_device(requested: str) -> torch.device:
    if requested == "cuda":
        if not torch.cuda.is_available():
            raise RuntimeError("--device=cuda requested but torch.cuda.is_available() is false")
        return torch.device("cuda")
    if requested == "cpu":
        return torch.device("cpu")
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def load_model(device: torch.device):
    print(f"[Benchmark] Loading model from {MODEL_PATH} on {device}...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
    dtype = torch.float16 if device.type == "cuda" else torch.float32
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_PATH,
        torch_dtype=dtype,
    ).to(device).eval()
    return tokenizer, model


def load_frozen_cases(path: Path) -> list[QueryCase]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise ValueError("frozen candidate file must contain a list")

    cases: list[QueryCase] = []
    for item in raw:
        if not isinstance(item, dict):
            raise ValueError("each query case must be an object")
        candidates = [
            Candidate(
                packet_key=str(candidate["packet_key"]),
                text=str(candidate["text"]),
                baseline_score=float(candidate.get("baseline_score", 0.0)),
                relevance_grade=int(candidate.get("relevance_grade", 0)),
            )
            for candidate in item.get("candidates", [])
        ]
        cases.append(QueryCase(
            query_id=str(item["query_id"]),
            query_text=str(item["query_text"]),
            candidates=candidates,
        ))
    return cases


def load_legacy_db_cases(limit_queries: int, candidate_limit: int) -> list[QueryCase]:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("legacy DB mode requires DATABASE_URL")

    import psycopg  # lazy: frozen JSON evaluation does not require psycopg

    candidate_model = os.environ.get("CROSS_ENCODER_BASELINE_MODEL", "xgboost_v2")
    cases: list[QueryCase] = []
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT q.query_id, q.query_text
                FROM evaluation_queries q
                JOIN evaluation_splits s ON q.query_id = s.query_id
                WHERE s.split_name = 'test'
                ORDER BY q.query_id
                LIMIT %s
                """,
                (limit_queries,),
            )
            queries = list(cur.fetchall())

        for query_id, query_text in queries:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT packet_key, text, xgboost_v2_score, relevance_grade
                    FROM retrieval_results
                    WHERE query_id = %s AND model = %s
                    ORDER BY xgboost_v2_score DESC
                    LIMIT %s
                    """,
                    (query_id, candidate_model, candidate_limit),
                )
                candidates = [
                    Candidate(
                        packet_key=str(row[0]),
                        text=str(row[1]),
                        baseline_score=float(row[2] or 0.0),
                        relevance_grade=int(row[3] or 0),
                    )
                    for row in cur.fetchall()
                ]
            cases.append(QueryCase(str(query_id), str(query_text), candidates))
    return cases


def rerank_batch(tokenizer, model, device: torch.device, query: str, candidates: list[Candidate]) -> RerankExecution:
    if device.type == "cuda":
        torch.cuda.reset_peak_memory_stats(device)
        torch.cuda.synchronize(device)

    started = time.perf_counter()
    scored: list[tuple[str, float]] = []

    for start in range(0, len(candidates), BATCH_SIZE):
        batch = candidates[start : start + BATCH_SIZE]
        pairs = [[query, candidate.text] for candidate in batch]
        encoded = tokenizer(
            pairs,
            padding=True,
            truncation=True,
            max_length=MAX_LENGTH,
            return_tensors="pt",
        ).to(device)

        with torch.inference_mode():
            logits = model(**encoded).logits.reshape(-1).float().cpu().tolist()

        scored.extend(
            (candidate.packet_key, float(score))
            for candidate, score in zip(batch, logits, strict=True)
        )

    if device.type == "cuda":
        torch.cuda.synchronize(device)
        peak_mb = torch.cuda.max_memory_allocated(device) / (1024 * 1024)
    else:
        peak_mb = 0.0

    return RerankExecution(
        ranking=sorted(scored, key=lambda item: item[1], reverse=True),
        latency_ms=(time.perf_counter() - started) * 1000,
        vram_peak_mb=peak_mb,
        device=device.type,
    )


def dcg_at_k(ranking: list[tuple[str, float]], gold_grades: dict[str, int], k: int) -> float:
    total = 0.0
    for position, (packet_key, _) in enumerate(ranking[:k], start=1):
        grade = max(0, int(gold_grades.get(packet_key, 0)))
        total += (2**grade - 1) / math.log2(position + 1)
    return total


def ndcg_at_k(ranking: list[tuple[str, float]], gold_grades: dict[str, int], k: int) -> float:
    dcg = dcg_at_k(ranking, gold_grades, k)
    ideal = sorted(gold_grades.items(), key=lambda item: item[1], reverse=True)
    ideal_ranking = [(packet_key, float(grade)) for packet_key, grade in ideal]
    idcg = dcg_at_k(ideal_ranking, gold_grades, k)
    return 0.0 if idcg == 0 else dcg / idcg


def benchmark_case(tokenizer, model, device: torch.device, case: QueryCase, top_k: int) -> Optional[BenchmarkResult]:
    if not case.candidates:
        print(f"[Benchmark] {case.query_id}: no candidates, skip")
        return None

    baseline = sorted(
        [(candidate.packet_key, candidate.baseline_score) for candidate in case.candidates],
        key=lambda item: item[1],
        reverse=True,
    )
    execution = rerank_batch(tokenizer, model, device, case.query_text, case.candidates)
    gold = {candidate.packet_key: candidate.relevance_grade for candidate in case.candidates}
    baseline_keys = {packet_key for packet_key, _ in baseline[:top_k]}
    reranked_keys = {packet_key for packet_key, _ in execution.ranking[:top_k]}
    ndcg_baseline = ndcg_at_k(baseline, gold, top_k)
    ndcg_reranker = ndcg_at_k(execution.ranking, gold, top_k)

    return BenchmarkResult(
        query_id=case.query_id,
        candidate_count=len(case.candidates),
        latency_ms=execution.latency_ms,
        vram_peak_mb=execution.vram_peak_mb,
        device=execution.device,
        overlap_at_k=len(baseline_keys & reranked_keys),
        ndcg_baseline=ndcg_baseline,
        ndcg_reranker=ndcg_reranker,
        ndcg_delta=ndcg_reranker - ndcg_baseline,
    )


def write_result(path: Path, results: list[BenchmarkResult], top_k: int) -> None:
    payload: dict[str, Any] = {
        "schema": "atlas.cross-encoder-eval.v1",
        "model_revision": MODEL_REVISION,
        "tokenizer_revision": TOKENIZER_REVISION,
        "inference_revision": INFERENCE_REVISION,
        "max_length": MAX_LENGTH,
        "top_k": top_k,
        "results": [asdict(result) for result in results],
    }
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="CrossEncoder reranker benchmark")
    parser.add_argument("--input", type=Path, help="Frozen candidate JSON; preferred evaluation source")
    parser.add_argument("--legacy-db", action="store_true", help="Use legacy live DB evaluation source")
    parser.add_argument("--device", choices=["auto", "cuda", "cpu"], default="auto")
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--candidate-limit", type=int, default=20)
    parser.add_argument("--query-limit", type=int, default=15)
    parser.add_argument("--output", type=Path, default=Path("crossencoder-benchmark-results.json"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.top_k <= 0:
        raise SystemExit("--top-k must be > 0")
    if bool(args.input) == bool(args.legacy_db):
        raise SystemExit("choose exactly one of --input or --legacy-db")

    cases = (
        load_frozen_cases(args.input)
        if args.input
        else load_legacy_db_cases(args.query_limit, args.candidate_limit)
    )
    device = resolve_device(args.device)
    tokenizer, model = load_model(device)

    results = [
        result
        for case in cases
        if (result := benchmark_case(tokenizer, model, device, case, args.top_k)) is not None
    ]

    if not results:
        print("[Benchmark] No results")
        return 1

    print(f"[Benchmark] queries={len(results)} device={device.type}")
    print(f"[Benchmark] avg latency={sum(r.latency_ms for r in results) / len(results):.2f}ms")
    print(f"[Benchmark] avg NDCG@{args.top_k} delta={sum(r.ndcg_delta for r in results) / len(results):+.4f}")

    if not args.dry_run:
        write_result(args.output, results, args.top_k)
        print(f"[Benchmark] wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
