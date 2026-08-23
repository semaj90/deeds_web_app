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
import json
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
    numerical_owner: str = "python_pytorch"
    execution_device: str = "cpu"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class LowRankCpuCudaParityReceipt:
    schema: str
    status: str
    cuda_available: bool
    input_checksum: str
    representation_id: str | None
    representation_revision: str | None
    candidate_ordinal_map_checksum: str | None
    singular_value_max_abs_delta: float | None
    singular_value_max_relative_delta: float | None
    relative_error_abs_delta: float | None
    top_k_overlap_abs_delta: float | None
    sample_bounds_valid: bool | None
    canonical_authority: bool = False
    numerical_owner: str = "python_pytorch"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def candidate_ordinal_map_checksum(canonical_ids: Sequence[str]) -> str:
    """Checksum the dense ordinal map using the frozen snapshot convention."""
    normalized = [str(value) for value in canonical_ids]
    if not normalized or any(not value for value in normalized):
        raise ValueError("canonical_ids must be non-empty strings")
    if len(set(normalized)) != len(normalized):
        raise ValueError("canonical_ids must be unique")
    if normalized != sorted(normalized):
        raise ValueError("canonical_ids must be in canonical ordinal order")
    return _sha256_bytes(json.dumps(normalized, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))


def _stable_top_k(values: np.ndarray, k: int) -> list[LowRankRecommendation]:
    ordinals = np.arange(values.shape[0], dtype=np.int64)
    order = np.lexsort((ordinals, -values.astype(np.float64, copy=False)))[:k]
    return [
        LowRankRecommendation(rank=rank, column_ordinal=int(index), score=float(values[index]))
        for rank, index in enumerate(order.tolist(), start=1)
    ]


def _length_square_sample_torch(tensor: Any, sample_count: int, seed: int) -> list[int]:
    """Sample row ordinals from tensor-native length-squared probabilities.

    This is a nomination lane only. It never creates a retrieval vote or
    canonical identity. Keeping the reduction and multinomial call in PyTorch
    allows the same implementation to run on CPU or CUDA without copying the
    large matrix through JavaScript/NumPy loops.
    """
    import torch

    row_norm_sq = tensor.square().sum(dim=1)
    total = row_norm_sq.sum()
    if not bool(torch.isfinite(total).item()) or float(total.detach().cpu()) <= 0.0:
        return []
    probabilities = row_norm_sq / total
    generator = torch.Generator(device=tensor.device)
    generator.manual_seed(seed)
    samples = torch.multinomial(
        probabilities,
        num_samples=sample_count,
        replacement=True,
        generator=generator,
    )
    return [int(value) for value in samples.detach().cpu().tolist()]


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

    samples = _length_square_sample_torch(tensor, sample_count, seed)
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
        numerical_owner="python_pytorch",
        execution_device=str(tensor.device),
    )


def prove_low_rank_cpu_cuda_parity(
    matrix: Sequence[Sequence[float]] | np.ndarray,
    *,
    target_rank: int = 4,
    oversampling: int = 8,
    power_iterations: int = 2,
    top_k: int = 10,
    sample_count: int = 64,
    seed: int = 0xA71A5,
    canonical_ids: Sequence[str] | None = None,
    representation_id: str | None = None,
    representation_revision: str | None = None,
) -> LowRankCpuCudaParityReceipt:
    """Compare the Python/PyTorch CPU and CUDA owners on one bounded matrix.

    CPU and CUDA multinomial implementations are allowed to choose different
    ordinals for the same seed. Parity therefore compares numerical outputs,
    probability-derived bounds, and policy flags rather than requiring byte-
    identical random samples across devices.
    """
    import torch

    source = np.asarray(matrix, dtype=np.float32)
    if canonical_ids is not None and len(canonical_ids) != source.shape[0]:
        raise ValueError("canonical_ids length must match matrix rows")
    ordinal_checksum = candidate_ordinal_map_checksum(canonical_ids) if canonical_ids is not None else None
    cpu = compare_low_rank_recommendations(
        source,
        target_rank=target_rank,
        oversampling=oversampling,
        power_iterations=power_iterations,
        top_k=top_k,
        sample_count=sample_count,
        seed=seed,
        device="cpu",
    )
    if not torch.cuda.is_available():
        return LowRankCpuCudaParityReceipt(
            schema="atlas.low-rank-cpu-cuda-parity-receipt.v1",
            status="CUDA_UNAVAILABLE",
            cuda_available=False,
            input_checksum=cpu.input_checksum,
            representation_id=representation_id,
            representation_revision=representation_revision,
            candidate_ordinal_map_checksum=ordinal_checksum,
            singular_value_max_abs_delta=None,
            singular_value_max_relative_delta=None,
            relative_error_abs_delta=None,
            top_k_overlap_abs_delta=None,
            sample_bounds_valid=None,
        )

    cuda = compare_low_rank_recommendations(
        source,
        target_rank=target_rank,
        oversampling=oversampling,
        power_iterations=power_iterations,
        top_k=top_k,
        sample_count=sample_count,
        seed=seed,
        device="cuda",
    )
    singular_delta = max(
        abs(left - right)
        for left, right in zip(cpu.exact_singular_values, cuda.exact_singular_values)
    )
    singular_relative_delta = max(
        abs(left - right) / max(abs(left), 1e-12)
        for left, right in zip(cpu.exact_singular_values, cuda.exact_singular_values)
    )
    relative_delta = abs(cpu.relative_frobenius_error - cuda.relative_frobenius_error)
    overlap_delta = abs(cpu.top_k_overlap - cuda.top_k_overlap)
    sample_bounds_valid = all(0 <= ordinal < source.shape[0] for ordinal in cuda.length_square_sample_ordinals)
    status = (
        "PARITY_PROVEN"
        if singular_relative_delta <= 1e-3 and relative_delta <= 1e-3 and sample_bounds_valid
        else "NUMERICAL_MISMATCH"
    )
    return LowRankCpuCudaParityReceipt(
        schema="atlas.low-rank-cpu-cuda-parity-receipt.v1",
        status=status,
        cuda_available=True,
        input_checksum=cpu.input_checksum,
        representation_id=representation_id,
        representation_revision=representation_revision,
        candidate_ordinal_map_checksum=ordinal_checksum,
        singular_value_max_abs_delta=singular_delta,
        singular_value_max_relative_delta=singular_relative_delta,
        relative_error_abs_delta=relative_delta,
        top_k_overlap_abs_delta=overlap_delta,
        sample_bounds_valid=sample_bounds_valid,
    )
