#!/usr/bin/env python3
"""Parent Atlas readable tensor-math reference helpers.

This module intentionally keeps the equations visible in PyTorch before any
cuBLASLt/Triton/cuTile specialization. It supports CPU and CUDA and exposes
Ampere precision controls explicitly so parity receipts can record them.

Production ownership:
- cuBLASLt: dense GEMM/GEMV/cosine batches on Windows native when proven.
- cuGraph: BFS/SSSP/PageRank/PPR on WSL2 bounded graph projections.
- PyTorch here: readable CPU/CUDA reference and fallback.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import torch

DTypeName = Literal["fp32", "tf32", "bf16", "fp16"]


@dataclass(frozen=True)
class PrecisionPolicy:
    input_dtype: DTypeName = "fp32"
    fp32_matmul_precision: Literal["highest", "high", "medium"] = "highest"
    allow_fp16_reduced_precision_reduction: bool = False
    allow_bf16_reduced_precision_reduction: bool = False


def configure_precision(policy: PrecisionPolicy) -> None:
    """Set precision explicitly; do not rely on process defaults."""
    torch.set_float32_matmul_precision(policy.fp32_matmul_precision)
    if torch.cuda.is_available():
        torch.backends.cuda.matmul.allow_fp16_reduced_precision_reduction = (
            policy.allow_fp16_reduced_precision_reduction
        )
        torch.backends.cuda.matmul.allow_bf16_reduced_precision_reduction = (
            policy.allow_bf16_reduced_precision_reduction
        )


def torch_dtype(name: DTypeName) -> torch.dtype:
    if name in ("fp32", "tf32"):
        return torch.float32
    if name == "bf16":
        return torch.bfloat16
    if name == "fp16":
        return torch.float16
    raise ValueError(name)


def l2_normalize(x: torch.Tensor, eps: float = 1e-12) -> torch.Tensor:
    return x / torch.linalg.vector_norm(x, dim=-1, keepdim=True).clamp_min(eps)


def cosine_scores(query: torch.Tensor, candidates: torch.Tensor) -> torch.Tensor:
    """Canonical cosine score: normalized matrix-vector product."""
    if query.ndim != 1 or candidates.ndim != 2 or candidates.shape[1] != query.shape[0]:
        raise ValueError("expected query[D] and candidates[N,D]")
    q = l2_normalize(query.float())
    c = l2_normalize(candidates.float())
    return c @ q


def cosine_topk(query: torch.Tensor, candidates: torch.Tensor, k: int) -> tuple[torch.Tensor, torch.Tensor]:
    scores = cosine_scores(query, candidates)
    k = min(max(1, int(k)), int(scores.numel()))
    return torch.topk(scores, k=k, largest=True, sorted=True)


def dense_project(x: torch.Tensor, weight: torch.Tensor, bias: torch.Tensor | None = None) -> torch.Tensor:
    """Readable GEMM/GEMV reference for latent64/128 and feature-head projections."""
    y = x @ weight
    return y if bias is None else y + bias


def signed_s3_scores(query4: torch.Tensor, candidates4: torch.Tensor) -> torch.Tensor:
    """Directional S^3 similarity; x and -x remain opposite feature directions."""
    if query4.shape[-1] != 4 or candidates4.shape[-1] != 4:
        raise ValueError("SIGNED_S3_DOT requires four-dimensional feature vectors")
    dots = cosine_scores(query4.reshape(4), candidates4.reshape(-1, 4))
    return (dots + 1.0) * 0.5


def frontier_scores(
    semantic: torch.Tensor,
    latent128: torch.Tensor,
    latent64: torch.Tensor,
    relation: torch.Tensor,
    pagerank: torch.Tensor,
    ontology: torch.Tensor,
    depth: torch.Tensor,
    weights: tuple[float, float, float, float, float, float, float] = (0.40, 0.10, 0.05, 0.20, 0.10, 0.10, 0.05),
) -> torch.Tensor:
    """Vectorized reference for the deterministic TypeScript frontier formula."""
    ws, w128, w64, wr, wp, wo, wh = weights
    return (
        ws * semantic.clamp(0, 1)
        + w128 * latent128.clamp(0, 1)
        + w64 * latent64.clamp(0, 1)
        + wr * relation.clamp(0, 1)
        + wp * pagerank.clamp(0, 1)
        + wo * ontology.clamp(0, 1)
        - wh * depth.clamp_min(0)
    )


def batched_frontier_topk(features: torch.Tensor, k: int) -> tuple[torch.Tensor, torch.Tensor]:
    """features[N,7] columns match frontier_scores arguments in contract order."""
    if features.ndim != 2 or features.shape[1] != 7:
        raise ValueError("expected features[N,7]")
    score = frontier_scores(*(features[:, i] for i in range(7)))
    k = min(max(1, int(k)), int(score.numel()))
    return torch.topk(score, k=k, largest=True, sorted=True)


def environment_receipt() -> dict:
    device = None
    cc = None
    if torch.cuda.is_available():
        device = torch.cuda.get_device_name(0)
        major, minor = torch.cuda.get_device_capability(0)
        cc = f"{major}.{minor}"
    return {
        "schema": "atlas.pytorch-gpu-math-environment.v1",
        "torch_version": torch.__version__,
        "cuda_runtime": torch.version.cuda,
        "cuda_available": torch.cuda.is_available(),
        "device": device,
        "compute_capability": cc,
        "float32_matmul_precision": torch.get_float32_matmul_precision(),
        "fp16_reduced_precision_reduction": (
            torch.backends.cuda.matmul.allow_fp16_reduced_precision_reduction
            if torch.cuda.is_available() else None
        ),
        "bf16_reduced_precision_reduction": (
            torch.backends.cuda.matmul.allow_bf16_reduced_precision_reduction
            if torch.cuda.is_available() else None
        ),
    }


if __name__ == "__main__":
    configure_precision(PrecisionPolicy())
    print(environment_receipt())
