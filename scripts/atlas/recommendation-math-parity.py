#!/usr/bin/env python3
"""CPU/CUDA parity harness for readable Parent Atlas recommendation math.

TODO(TEST-LATER): run on the workstation with the installed CUDA-enabled PyTorch.
This script never changes ranking policy; it proves that the accelerator evaluates
an already-defined formula within an explicit numeric tolerance.
"""
from __future__ import annotations

import argparse
import json
import math
import random

try:
    import torch
except ImportError as exc:
    print(json.dumps({"status": "PYTORCH_UNAVAILABLE", "reason": str(exc)}))
    raise SystemExit(2)


def semantic_scores(query: torch.Tensor, candidates: torch.Tensor) -> torch.Tensor:
    q = query / query.norm(p=2).clamp_min(1e-8)
    c = candidates / candidates.norm(p=2, dim=1, keepdim=True).clamp_min(1e-8)
    return ((c @ q).clamp(-1, 1) + 1) / 2


def make_fixture(rows: int, dim: int, seed: int) -> tuple[torch.Tensor, torch.Tensor]:
    random.seed(seed)
    torch.manual_seed(seed)
    return torch.randn(dim, dtype=torch.float32), torch.randn(rows, dim, dtype=torch.float32)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", type=int, default=128)
    ap.add_argument("--dim", type=int, default=768)
    ap.add_argument("--seed", type=int, default=742338109)
    ap.add_argument("--abs-tol", type=float, default=1e-5)
    args = ap.parse_args()

    q, c = make_fixture(args.rows, args.dim, args.seed)
    cpu = semantic_scores(q, c).cpu()
    if not torch.cuda.is_available():
        print(json.dumps({
            "schema": "atlas.recommendation-math-parity-report.v1",
            "status": "CUDA_UNAVAILABLE",
            "cpu_rows": args.rows,
            "dim": args.dim,
            "todo": "TODO(TEST-LATER): rerun with CUDA-enabled Torch; CPU result remains the reference.",
        }, sort_keys=True))
        return 2

    gpu = semantic_scores(q.cuda(), c.cuda()).cpu()
    delta = (cpu - gpu).abs()
    max_abs = float(delta.max())
    rmse = math.sqrt(float(torch.mean(delta * delta)))
    status = "PASS" if max_abs <= args.abs_tol else "FAIL"
    print(json.dumps({
        "schema": "atlas.recommendation-math-parity-report.v1",
        "status": status,
        "torch_version": torch.__version__,
        "cuda_version": torch.version.cuda,
        "gpu_name": torch.cuda.get_device_name(0),
        "rows": args.rows,
        "dim": args.dim,
        "seed": args.seed,
        "max_abs_error": max_abs,
        "rmse": rmse,
        "threshold": args.abs_tol,
        "todo": [
            "TODO(TEST-LATER): add real CandidateFeatureRow fixtures after synthetic parity is green.",
            "TODO(TEST-LATER): compare LibTorch output against this same fixture identity.",
        ],
    }, sort_keys=True))
    return 0 if status == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
