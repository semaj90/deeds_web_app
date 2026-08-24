"""Low-rank comparison helpers for Parent Atlas.

This module deliberately distinguishes:
- full SVD reference on a bounded dense matrix,
- seeded randomized low-rank challenger,
- Tang-inspired length-square sampling used only for candidate nomination.

It does NOT claim to implement Tang's full sublinear recommendation algorithm;
that method assumes a sample-query data structure and stronger input-model
contracts than a normal dense tensor provides.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
from typing import Any, Sequence

import numpy as np

from .determinism import configure_torch_determinism


@dataclass(frozen=True)
class LowRankRecommendation:
    rank: int
    column_ordinal: int
    score: float


@dataclass(frozen=True)
class LowRankComparisonReceipt:
    schema: str
    method: str
    rows: int
    columns: int
    target_rank: int
    oversampling: int
    power_iterations: int
    seed: int
    exact_singular_values: list[float]
    approximate_singular_values: list[float]
    relative_frobenius_error: float
    top_k_overlap: float
    exact_recommendations: list[LowRankRecommendation]
    approximate_recommendations: list[LowRankRecommendation]
    length_square_sample_ordinals: list[int]
    input_checksum: str
    output_checksum: str
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class CandidateShortlistReceipt:
    schema: str
    policy: str
    rows: int
    columns: int
    rank: int
    target_count: int
    seed: int
    device: str
    input_checksum: str
    output_checksum: str
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _stable_top_k(values: np.ndarray, k: int) -> list[LowRankRecommendation]:
    ordinals = np.arange(values.shape[0], dtype=np.int64)
    order = np.lexsort((ordinals, -values.astype(np.float64, copy=False)))[:k]
    return [
        LowRankRecommendation(rank=rank, column_ordinal=int(index), score=float(values[index]))
        for rank, index in enumerate(order.tolist(), start=1)
    ]


def _length_square_sample(matrix: np.ndarray, sample_count: int, seed: int) -> list[int]:
    row_norm_sq = np.sum(matrix.astype(np.float64) ** 2, axis=1)
    total = float(row_norm_sq.sum())
    if total <= 0:
        return []
    probabilities = row_norm_sq / total
    rng = np.random.default_rng(seed)
    samples = rng.choice(matrix.shape[0], size=sample_count, replace=True, p=probabilities)
    return [int(value) for value in samples.tolist()]


def compare_low_rank_recommendations(
    matrix: Sequence[Sequence[float]] | np.ndarray,
    *,
    query_row: int = 0,
    target_rank: int = 16,
    oversampling: int = 8,
    power_iterations: int = 2,
    top_k: int = 10,
    sample_count: int = 64,
    seed: int = 0xA71A5,
    device: str | None = None,
) -> LowRankComparisonReceipt:
    """Compare a seeded randomized low-rank challenger against full SVD.

    The reference uses ``torch.linalg.svd``. The challenger uses
    ``torch.svd_lowrank`` with q=rank+oversampling and a frozen RNG seed.
    Recommendation scores are the selected query row of each reconstructed
    matrix, ranked with deterministic ordinal tie breaking.
    """

    import torch

    configure_torch_determinism(seed=seed, matmul_mode="ieee")
    source = np.asarray(matrix, dtype=np.float32)
    if source.ndim != 2 or source.shape[0] == 0 or source.shape[1] == 0:
        raise ValueError("matrix must be non-empty rank-2")
    if not (0 <= query_row < source.shape[0]):
        raise ValueError("query_row out of range")
    max_rank = min(source.shape)
    if not (1 <= target_rank <= max_rank):
        raise ValueError(f"target_rank must be in [1,{max_rank}]")
    if oversampling < 0:
        raise ValueError("oversampling must be nonnegative")
    if power_iterations < 0:
        raise ValueError("power_iterations must be nonnegative")
    if not (1 <= top_k <= source.shape[1]):
        raise ValueError("top_k out of range")

    resolved_device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    tensor = torch.as_tensor(source, dtype=torch.float32, device=resolved_device)

    with torch.inference_mode():
        # Full bounded reference. U/V signs are non-unique, therefore the receipt
        # compares singular values and reconstructed matrices, never raw vectors.
        u, s, vh = torch.linalg.svd(tensor, full_matrices=False)
        k = target_rank
        exact_reconstruction = (u[:, :k] * s[:k]) @ vh[:k, :]

        q = min(max_rank, target_rank + oversampling)
        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)
        approx_u, approx_s, approx_v = torch.svd_lowrank(tensor, q=q, niter=power_iterations)
        approx_k = min(target_rank, approx_s.shape[0])
        approximate_reconstruction = (approx_u[:, :approx_k] * approx_s[:approx_k]) @ approx_v[:, :approx_k].transpose(0, 1)

        residual = torch.linalg.vector_norm(tensor - approximate_reconstruction)
        denom = torch.linalg.vector_norm(tensor).clamp_min(1e-12)
        relative_error = float((residual / denom).detach().cpu())

    exact_row = exact_reconstruction[query_row].detach().cpu().numpy().astype(np.float64, copy=False)
    approx_row = approximate_reconstruction[query_row].detach().cpu().numpy().astype(np.float64, copy=False)
    exact_top = _stable_top_k(exact_row, top_k)
    approx_top = _stable_top_k(approx_row, top_k)
    exact_set = {item.column_ordinal for item in exact_top}
    approx_set = {item.column_ordinal for item in approx_top}
    overlap = len(exact_set & approx_set) / float(top_k)

    samples = _length_square_sample(source, sample_count, seed)
    input_checksum = _sha256_bytes(np.ascontiguousarray(source).tobytes())
    output_payload = (
        f"{relative_error:.17g}|{overlap:.17g}|"
        + ",".join(str(item.column_ordinal) for item in approx_top)
        + "|" + ",".join(map(str, samples))
    )

    return LowRankComparisonReceipt(
        schema="atlas.low-rank-comparison-receipt.v1",
        method="full_svd_vs_seeded_svd_lowrank_with_length_square_sampling",
        rows=int(source.shape[0]),
        columns=int(source.shape[1]),
        target_rank=target_rank,
        oversampling=oversampling,
        power_iterations=power_iterations,
        seed=seed,
        exact_singular_values=[float(value) for value in s[:target_rank].detach().cpu().tolist()],
        approximate_singular_values=[float(value) for value in approx_s[:target_rank].detach().cpu().tolist()],
        relative_frobenius_error=relative_error,
        top_k_overlap=overlap,
        exact_recommendations=exact_top,
        approximate_recommendations=approx_top,
        length_square_sample_ordinals=samples,
        input_checksum=input_checksum,
        output_checksum=_sha256_bytes(output_payload.encode("utf-8")),
        canonical_authority=False,
    )


def shortlist_candidate_ordinals(
    matrix: Sequence[Sequence[float]] | np.ndarray,
    candidate_ordinals: Sequence[int],
    query_features: Sequence[float],
    *,
    rank: int = 32,
    target_count: int = 96,
    seed: int = 0xA71A5,
    device: str | None = None,
) -> tuple[list[int], CandidateShortlistReceipt]:
    """Nominate candidate rows with a bounded low-rank query projection.

    This is an explicit ``TANG_INSPIRED`` nomination primitive, not Tang's
    sublinear algorithm. Exact ranking and evidence promotion remain outside
    this function. Candidate ordinals are preserved as the durable identity;
    matrix row positions are only execution addresses.
    """

    import torch

    source = np.asarray(matrix, dtype=np.float32)
    ordinals = np.asarray(candidate_ordinals, dtype=np.int64)
    query = np.asarray(query_features, dtype=np.float32)
    if source.ndim != 2 or source.shape[0] == 0 or source.shape[1] == 0:
        raise ValueError("matrix must be non-empty rank-2")
    if ordinals.ndim != 1 or ordinals.shape[0] != source.shape[0]:
        raise ValueError("candidate_ordinals must match matrix rows")
    if query.ndim != 1 or query.shape[0] != source.shape[1]:
        raise ValueError("query_features must match matrix columns")
    if len(set(ordinals.tolist())) != len(ordinals):
        raise ValueError("candidate_ordinals must be unique")
    max_rank = min(source.shape)
    if not (1 <= rank <= max_rank):
        raise ValueError(f"rank must be in [1,{max_rank}]")
    if not (1 <= target_count <= source.shape[0]):
        raise ValueError("target_count must be within matrix rows")

    configure_torch_determinism(seed=seed, matmul_mode="ieee")
    resolved_device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    tensor = torch.as_tensor(source, dtype=torch.float32, device=resolved_device)
    query_tensor = torch.as_tensor(query, dtype=torch.float32, device=resolved_device)
    with torch.inference_mode():
        mean = tensor.mean(dim=0, keepdim=True)
        centered = tensor - mean
        _, _, vh = torch.linalg.svd(centered, full_matrices=False)
        basis = vh[:rank].transpose(0, 1)
        candidate_latent = centered @ basis
        query_latent = (query_tensor.unsqueeze(0) - mean) @ basis
        candidate_norm = torch.linalg.vector_norm(candidate_latent, dim=1).clamp_min(1e-12)
        query_norm = torch.linalg.vector_norm(query_latent, dim=1).clamp_min(1e-12)
        scores = (candidate_latent @ query_latent.squeeze(0)) / (candidate_norm * query_norm)

    score_values = scores.detach().cpu().numpy().astype(np.float64, copy=False)
    row_indices = np.arange(source.shape[0], dtype=np.int64)
    order = np.lexsort((ordinals, row_indices, -score_values))[:target_count]
    selected = [int(ordinals[index]) for index in order.tolist()]
    input_checksum = _sha256_bytes(np.ascontiguousarray(source).tobytes() + np.ascontiguousarray(query).tobytes())
    output_checksum = _sha256_bytes(",".join(map(str, selected)).encode("utf-8"))
    receipt = CandidateShortlistReceipt(
        schema="atlas.candidate-shortlist-receipt.v1",
        policy="TANG_INSPIRED_LOW_RANK_SHORTLIST",
        rows=int(source.shape[0]),
        columns=int(source.shape[1]),
        rank=int(rank),
        target_count=int(target_count),
        seed=int(seed),
        device=resolved_device,
        input_checksum=input_checksum,
        output_checksum=output_checksum,
        canonical_authority=False,
    )
    return selected, receipt
