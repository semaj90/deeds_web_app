"""Ordered context projection that re-aligns derived context to canonical rows."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
from typing import Any, Sequence

import numpy as np

from .contextual_windows import contextualize_sliding_windows


@dataclass(frozen=True)
class OrderedContextReceipt:
    schema: str
    order_kind: str
    context_revision: str
    row_count: int
    dimensions: int
    order_identity_checksum: str
    canonical_identity_checksum: str
    context_checksum_in_order: str
    context_checksum_canonical_scatter: str
    window_receipt: dict[str, Any]
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _ids_checksum(values: Sequence[str]) -> str:
    return _sha(json.dumps(list(values), separators=(",", ":"), ensure_ascii=False).encode("utf-8"))


def contextualize_explicit_order(
    semantic_matrix: np.ndarray,
    canonical_ids: Sequence[str],
    ordered_canonical_ids: Sequence[str],
    *,
    order_kind: str,
    context_revision: str,
    window_size: int = 9,
    causal: bool = False,
    temperature: float = 1.0,
    device: str = "cpu",
):
    canonical = [str(value) for value in canonical_ids]
    ordered = [str(value) for value in ordered_canonical_ids]
    if len(ordered) != len(canonical) or set(ordered) != set(canonical):
        raise ValueError("ordered_canonical_ids must be an exact permutation of canonical_ids")
    if not order_kind or not context_revision:
        raise ValueError("order_kind and context_revision are required")

    matrix = np.asarray(semantic_matrix, dtype=np.float32)
    if matrix.ndim != 2 or matrix.shape[0] != len(canonical):
        raise ValueError("semantic_matrix rows must equal canonical_ids")
    canonical_index = {value: index for index, value in enumerate(canonical)}
    ordered_ordinals = np.asarray([canonical_index[value] for value in ordered], dtype=np.int64)
    ordered_matrix = np.ascontiguousarray(matrix[ordered_ordinals], dtype=np.float32)
    ordered_context, masks, window_receipt = contextualize_sliding_windows(
        ordered_matrix,
        window_size=window_size,
        stride=1,
        causal=causal,
        similarity="cosine",
        temperature=temperature,
        device=device,
    )
    ordered_host = ordered_context.detach().cpu().numpy().astype(np.float32, copy=False)
    canonical_host = np.empty_like(ordered_host)
    for ordered_position, canonical_ordinal in enumerate(ordered_ordinals.tolist()):
        canonical_host[canonical_ordinal] = ordered_host[ordered_position]

    receipt = OrderedContextReceipt(
        schema="atlas.ordered-context-receipt.v1",
        order_kind=order_kind,
        context_revision=context_revision,
        row_count=int(matrix.shape[0]),
        dimensions=int(matrix.shape[1]),
        order_identity_checksum=_ids_checksum(ordered),
        canonical_identity_checksum=_ids_checksum(canonical),
        context_checksum_in_order=_sha(np.ascontiguousarray(ordered_host).tobytes()),
        context_checksum_canonical_scatter=_sha(np.ascontiguousarray(canonical_host).tobytes()),
        window_receipt=window_receipt.to_dict(),
        canonical_authority=False,
    )
    return canonical_host, masks, receipt
