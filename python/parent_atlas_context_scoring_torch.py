#!/usr/bin/env python3
"""PyTorch challenger for Parent Atlas contextual-tree scoring.

This module is intentionally pure scoring: no Qdrant/Neo4j I/O and no writes.
It exists for CPU/CUDA parity against the TypeScript/Python reference softmax
and cosine formulas before GPU promotion.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence


@dataclass(frozen=True)
class TorchContextScoreResult:
    cosine: list[float]
    logits: list[float]
    probabilities: list[float]
    device: str
    dtype: str


def score_context_batch(
    query_vector: Sequence[float],
    candidate_vectors: Sequence[Sequence[float]],
    scalar_features: Sequence[Sequence[float]],
    scalar_weights: Sequence[float],
    *,
    cosine_weight: float = 1.0,
    temperature: float = 1.0,
    device: str = "cpu",
) -> TorchContextScoreResult:
    """Compute cosine + scalar weighted logits + softmax.

    Scalar feature columns are expected to already be normalized [0,1] values
    such as structural, sparse lexical, authority, and tool relevance. This
    function does not create or reinterpret those features.
    """
    if temperature <= 0:
        raise ValueError("temperature must be positive")
    if not candidate_vectors:
        return TorchContextScoreResult([], [], [], device, "float32")

    import torch
    import torch.nn.functional as F

    q = torch.tensor(query_vector, dtype=torch.float32, device=device)
    x = torch.tensor(candidate_vectors, dtype=torch.float32, device=device)
    if x.ndim != 2 or q.ndim != 1 or x.shape[1] != q.shape[0]:
        raise ValueError("candidate vectors must be [N,D] and query vector [D]")

    q_batch = q.unsqueeze(0).expand(x.shape[0], -1)
    cosine_raw = F.cosine_similarity(x, q_batch, dim=1, eps=1e-8)
    cosine01 = (cosine_raw + 1.0) * 0.5

    if scalar_features:
        features = torch.tensor(scalar_features, dtype=torch.float32, device=device)
        weights = torch.tensor(scalar_weights, dtype=torch.float32, device=device)
        if features.ndim != 2 or features.shape[0] != x.shape[0]:
            raise ValueError("scalar_features must be [N,F]")
        if weights.ndim != 1 or weights.shape[0] != features.shape[1]:
            raise ValueError("scalar_weights must match scalar feature width")
        scalar_logits = features @ weights
    else:
        scalar_logits = torch.zeros(x.shape[0], dtype=torch.float32, device=device)

    logits = cosine_weight * cosine01 + scalar_logits
    probabilities = F.softmax(logits / temperature, dim=0)

    return TorchContextScoreResult(
        cosine=cosine_raw.detach().cpu().tolist(),
        logits=logits.detach().cpu().tolist(),
        probabilities=probabilities.detach().cpu().tolist(),
        device=str(x.device),
        dtype=str(x.dtype).replace("torch.", ""),
    )
