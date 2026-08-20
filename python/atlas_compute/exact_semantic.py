"""Deterministic exact semantic search reference built from PyTorch GEMM.

The numerical work may run on CUDA, but final ranking is stabilized on the CPU
using canonical row ordinals as the secondary key. This avoids relying on the
unstable tie ordering documented for torch.topk and cuVS brute-force.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
from typing import Any, Literal, Sequence

import numpy as np

from .determinism import configure_torch_determinism

Metric = Literal["cosine", "inner_product", "sqeuclidean"]


@dataclass(frozen=True)
class ExactSemanticHit:
    rank: int
    ordinal: int
    canonical_id: str
    distance: float
    score: float


@dataclass(frozen=True)
class ExactSemanticSearchReceipt:
    schema: str
    metric: Metric
    dimensions: int
    corpus_rows: int
    query_rows: int
    top_k: int
    device: str
    dtype: str
    matmul_mode: str
    tie_break: str
    result_checksum: str
    hits: list[list[ExactSemanticHit]]

    def to_dict(self) -> dict[str, Any]:
        value = asdict(self)
        return value


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _validate_matrix(name: str, value: Any, expected_dim: int | None = None) -> None:
    if value.ndim != 2:
        raise ValueError(f"{name} must be rank-2, got shape={tuple(value.shape)}")
    if expected_dim is not None and int(value.shape[1]) != expected_dim:
        raise ValueError(f"{name} dim={value.shape[1]} != {expected_dim}")
    if value.shape[0] <= 0 or value.shape[1] <= 0:
        raise ValueError(f"{name} must be non-empty")


def _pairwise_distance(torch: Any, queries: Any, corpus: Any, metric: Metric) -> tuple[Any, Any]:
    """Return `(distance, score)` matrices shaped [Q,N]."""

    # GEMM is the dominant primitive for all three metrics.
    dot = torch.matmul(queries, corpus.transpose(0, 1))

    if metric == "inner_product":
        score = dot
        distance = -dot
        return distance, score

    if metric == "cosine":
        q_norm = torch.linalg.vector_norm(queries, ord=2, dim=1, keepdim=True).clamp_min(1e-12)
        x_norm = torch.linalg.vector_norm(corpus, ord=2, dim=1, keepdim=True).clamp_min(1e-12)
        score = dot / (q_norm * x_norm.transpose(0, 1))
        distance = 1.0 - score
        return distance, score

    if metric == "sqeuclidean":
        q_sq = torch.sum(queries * queries, dim=1, keepdim=True)
        x_sq = torch.sum(corpus * corpus, dim=1, keepdim=True).transpose(0, 1)
        # Clamp tiny negative roundoff after expanded L2 GEMM formula.
        distance = (q_sq + x_sq - 2.0 * dot).clamp_min(0.0)
        score = -distance
        return distance, score

    raise ValueError(f"unsupported metric: {metric}")


def exact_semantic_search(
    corpus_vectors: Sequence[Sequence[float]] | np.ndarray,
    query_vectors: Sequence[Sequence[float]] | np.ndarray,
    canonical_ids: Sequence[str],
    *,
    metric: Metric = "cosine",
    top_k: int = 10,
    device: str | None = None,
    seed: int = 0xA71A5,
    matmul_mode: Literal["ieee", "tf32"] = "ieee",
) -> ExactSemanticSearchReceipt:
    """Run exhaustive exact semantic search with deterministic tie breaking.

    `canonical_ids[i]` is the identity of corpus row ordinal `i`; ordinals are
    projection coordinates only and are never returned as canonical identities.
    """

    import torch

    determinism = configure_torch_determinism(seed=seed, matmul_mode=matmul_mode)
    resolved_device = device or ("cuda" if torch.cuda.is_available() else "cpu")

    corpus_np = np.asarray(corpus_vectors, dtype=np.float32)
    queries_np = np.asarray(query_vectors, dtype=np.float32)
    _validate_matrix("corpus_vectors", corpus_np)
    _validate_matrix("query_vectors", queries_np, int(corpus_np.shape[1]))

    if len(canonical_ids) != int(corpus_np.shape[0]):
        raise ValueError("canonical_ids length must equal corpus rows")
    if len(set(canonical_ids)) != len(canonical_ids):
        raise ValueError("canonical_ids must be unique within a frozen corpus snapshot")
    if top_k <= 0 or top_k > int(corpus_np.shape[0]):
        raise ValueError(f"top_k must be in [1,{corpus_np.shape[0]}]")

    corpus = torch.as_tensor(corpus_np, dtype=torch.float32, device=resolved_device)
    queries = torch.as_tensor(queries_np, dtype=torch.float32, device=resolved_device)

    with torch.inference_mode():
        distances_t, scores_t = _pairwise_distance(torch, queries, corpus, metric)

    distances = distances_t.detach().cpu().numpy().astype(np.float64, copy=False)
    scores = scores_t.detach().cpu().numpy().astype(np.float64, copy=False)
    ordinals = np.arange(corpus_np.shape[0], dtype=np.int64)

    all_hits: list[list[ExactSemanticHit]] = []
    checksum_rows: list[str] = []
    for query_index in range(queries_np.shape[0]):
        # np.lexsort uses the last key as primary: distance first, ordinal second.
        # This produces stable canonical ordering for equal numerical distances.
        order = np.lexsort((ordinals, distances[query_index]))[:top_k]
        hits: list[ExactSemanticHit] = []
        for rank, ordinal_value in enumerate(order.tolist(), start=1):
            hit = ExactSemanticHit(
                rank=rank,
                ordinal=int(ordinal_value),
                canonical_id=str(canonical_ids[ordinal_value]),
                distance=float(distances[query_index, ordinal_value]),
                score=float(scores[query_index, ordinal_value]),
            )
            hits.append(hit)
            checksum_rows.append(
                f"{query_index}\0{rank}\0{hit.ordinal}\0{hit.canonical_id}\0"
                f"{hit.distance:.17g}\0{hit.score:.17g}"
            )
        all_hits.append(hits)

    return ExactSemanticSearchReceipt(
        schema="atlas.exact-semantic-search-receipt.v1",
        metric=metric,
        dimensions=int(corpus_np.shape[1]),
        corpus_rows=int(corpus_np.shape[0]),
        query_rows=int(queries_np.shape[0]),
        top_k=top_k,
        device=resolved_device,
        dtype="float32",
        matmul_mode=determinism.matmul_mode,
        tie_break="distance_ascending_then_canonical_ordinal",
        result_checksum=_sha256("\n".join(checksum_rows)),
        hits=all_hits,
    )
