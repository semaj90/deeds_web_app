#!/usr/bin/env python3
"""Readable PyTorch oracle for Parent Atlas recommendation math.

The reference intentionally keeps the formula visible:
  1. semantic_768 cosine is computed from normalized tensors;
  2. optional recommendation signals are presence-aware;
  3. missing enrichment is excluded from the denominator, not treated as zero;
  4. CPU is the reference default; CUDA runs the same PyTorch math as a challenger.

Input JSON:
{
  "query": [768 floats],
  "candidates": [[768 floats], ...],
  "features": [{"pagerank": 0.4, "hypergraph": null, ...}, ...]
}
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import torch

WEIGHTS = {
    "semantic": 0.40,
    "pagerank": 0.18,
    "hypergraph": 0.14,
    "som": 0.10,
    "ast": 0.08,
    "hypersphere": 0.10,
}


def clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def presence_aware_score(row: dict[str, float | None]) -> float:
    active = [key for key in WEIGHTS if row.get(key) is not None]
    denominator = sum(WEIGHTS[key] for key in active)
    if denominator <= 0:
        return 0.0
    numerator = sum(clamp01(float(row[key])) * WEIGHTS[key] for key in active)
    return numerator / denominator


def semantic_scores(query: torch.Tensor, candidates: torch.Tensor) -> torch.Tensor:
    query = query / torch.clamp(torch.linalg.vector_norm(query), min=1e-8)
    candidates = candidates / torch.clamp(
        torch.linalg.vector_norm(candidates, dim=1, keepdim=True), min=1e-8
    )
    # cosine in [-1, 1], mapped to [0, 1] for the recommendation feature slot.
    return torch.matmul(candidates, query).clamp(-1, 1).add(1).div(2)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cpu")
    args = parser.parse_args()

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    requested = args.device
    actual = "cuda" if requested == "cuda" and torch.cuda.is_available() else "cpu"
    device = torch.device(actual)

    query = torch.tensor(payload["query"], dtype=torch.float32, device=device)
    candidates = torch.tensor(payload["candidates"], dtype=torch.float32, device=device)
    if query.ndim != 1 or candidates.ndim != 2 or candidates.shape[1] != query.shape[0]:
        raise ValueError("expected query[D] and candidates[N,D]")

    semantic = semantic_scores(query, candidates).cpu().tolist()
    features = payload.get("features") or [{} for _ in semantic]
    if len(features) != len(semantic):
        raise ValueError("features length must equal candidate count")

    results = []
    for index, semantic_score in enumerate(semantic):
        row = dict(features[index])
        row["semantic"] = semantic_score
        results.append(
            {
                "index": index,
                "semantic": semantic_score,
                "final": presence_aware_score(row),
                "observed": sorted(key for key in WEIGHTS if row.get(key) is not None),
            }
        )

    print(
        json.dumps(
            {
                "schema": "atlas.recommendation-math-reference.v1",
                "requestedDevice": requested,
                "actualDevice": actual,
                "weights": WEIGHTS,
                "results": results,
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
