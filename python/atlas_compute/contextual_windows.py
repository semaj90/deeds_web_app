"""Sliding-window contextual aggregation for Parent Atlas feature tensors.

A linear window is a derived context projection over an explicitly ordered row
snapshot. It does not create graph edges or canonical relationships. Each center
row receives a softmax-normalized weighted aggregate of rows inside its bounded
window; a 0/1 support mask records which positions participated.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
from typing import Any, Literal, Sequence

import numpy as np

from .determinism import configure_torch_determinism


@dataclass(frozen=True)
class ContextualWindowReceipt:
    schema: str
    rows: int
    dimensions: int
    window_size: int
    stride: int
    causal: bool
    similarity: str
    temperature: float
    context_checksum: str
    support_mask_checksum: str
    mean_active_window: float
    max_softmax_sum_error: float
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _checksum(array: np.ndarray) -> str:
    return hashlib.sha256(np.ascontiguousarray(array).tobytes()).hexdigest()


def contextualize_sliding_windows(
    matrix: Sequence[Sequence[float]] | np.ndarray,
    *,
    window_size: int = 9,
    stride: int = 1,
    causal: bool = False,
    similarity: Literal["cosine", "dot"] = "cosine",
    temperature: float = 1.0,
    device: str | None = None,
    seed: int = 0xA71A5,
):
    import torch

    configure_torch_determinism(seed=seed, matmul_mode="ieee")
    source = np.asarray(matrix, dtype=np.float32)
    if source.ndim != 2 or source.shape[0] == 0 or source.shape[1] == 0:
        raise ValueError("matrix must be non-empty rank-2")
    if window_size <= 0 or window_size % 2 == 0:
        raise ValueError("window_size must be a positive odd integer")
    if stride <= 0:
        raise ValueError("stride must be positive")
    if temperature <= 0 or not np.isfinite(temperature):
        raise ValueError("temperature must be finite and positive")

    resolved_device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    x = torch.as_tensor(source, dtype=torch.float32, device=resolved_device)
    n, d = x.shape
    half = window_size // 2
    centers = list(range(0, int(n), stride))
    context_rows: list[Any] = []
    masks = np.zeros((len(centers), int(n)), dtype=np.uint8)
    sum_errors: list[float] = []
    active_counts: list[int] = []

    with torch.inference_mode():
        for output_index, center in enumerate(centers):
            if causal:
                start = max(0, center - window_size + 1)
                end = center + 1
            else:
                start = max(0, center - half)
                end = min(int(n), center + half + 1)
            indices = torch.arange(start, end, device=resolved_device)
            candidates = x.index_select(0, indices)
            query = x[center]
            if similarity == "cosine":
                query_norm = torch.linalg.vector_norm(query).clamp_min(1e-12)
                candidate_norm = torch.linalg.vector_norm(candidates, dim=1).clamp_min(1e-12)
                logits = (candidates @ query) / (candidate_norm * query_norm)
            else:
                logits = candidates @ query
            weights = torch.softmax(logits / float(temperature), dim=0, dtype=torch.float32)
            aggregate = weights @ candidates
            context_rows.append(aggregate)
            masks[output_index, start:end] = 1
            sum_errors.append(abs(float(weights.sum().detach().cpu()) - 1.0))
            active_counts.append(end - start)

    context = torch.stack(context_rows, dim=0)
    host = context.detach().cpu().numpy().astype(np.float32, copy=False)
    receipt = ContextualWindowReceipt(
        schema="atlas.contextual-window-receipt.v1",
        rows=int(n),
        dimensions=int(d),
        window_size=window_size,
        stride=stride,
        causal=causal,
        similarity=similarity,
        temperature=float(temperature),
        context_checksum=_checksum(host),
        support_mask_checksum=_checksum(masks),
        mean_active_window=float(np.mean(active_counts)),
        max_softmax_sum_error=float(max(sum_errors, default=0.0)),
        canonical_authority=False,
    )
    return context, masks, receipt
