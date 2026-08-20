"""Sparse relation tensor references for Parent Atlas.

Canonical N-ary relationship facts stay in the database. This module builds
revision-qualified 0/1 incidence projections for bounded tensor analytics.
Unspecified sparse softmax entries receive zero probability mass (equivalent to
-logit infinity), matching torch.sparse.softmax semantics.

This is NOT an implementation of MOSparse. Published descriptions of MOSparse
use a learned selector for GPU SpGEMM workflows and its code is not public. Atlas
starts with an auditable density/budget policy and may learn a selector later
from its own benchmark receipts.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
from typing import Any, Literal, Sequence

import numpy as np

from .determinism import configure_torch_determinism


@dataclass(frozen=True)
class SparseRelationReceipt:
    schema: str
    row_count: int
    column_count: int
    nnz: int
    density: float
    binary_mask_checksum: str
    sparse_layout: str
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class SparseSoftmaxReceipt:
    schema: str
    dim: int
    nnz: int
    temperature: float
    values_checksum: str
    max_row_sum_error: float
    unspecified_probability: float
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class SparseSpmmReceipt:
    schema: str
    relation_shape: list[int]
    dense_feature_shape: list[int]
    output_shape: list[int]
    nnz: int
    output_checksum: str
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class SparseComputePolicyReceipt:
    schema: str
    rows: int
    columns: int
    nnz: int
    density: float
    sparse_density_threshold: float
    minimum_cells_for_sparse: int
    selected_mode: Literal["dense", "sparse"]
    selector: str
    learned_selector_used: bool
    mosparse_reimplementation_claimed: bool
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _checksum(value: np.ndarray) -> str:
    return hashlib.sha256(np.ascontiguousarray(value).tobytes()).hexdigest()


def build_binary_incidence(
    row_ids: Sequence[str],
    column_ids: Sequence[str],
    edges: Sequence[tuple[str, str]],
    *,
    device: str | None = None,
    seed: int = 0xA71A5,
):
    import torch

    configure_torch_determinism(seed=seed, matmul_mode="ieee")
    rows = list(row_ids)
    cols = list(column_ids)
    if len(set(rows)) != len(rows) or len(set(cols)) != len(cols):
        raise ValueError("row_ids and column_ids must each be unique")
    row_index = {value: index for index, value in enumerate(rows)}
    col_index = {value: index for index, value in enumerate(cols)}
    pairs = sorted({(row_index[r], col_index[c]) for r, c in edges if r in row_index and c in col_index})
    if len(pairs) != len(set(edges)):
        unknown = [(r, c) for r, c in edges if r not in row_index or c not in col_index]
        if unknown:
            raise ValueError(f"incidence edges reference unknown identities: {unknown[:5]}")
    resolved_device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    if pairs:
        indices = torch.tensor(pairs, dtype=torch.int64, device=resolved_device).T.contiguous()
        values = torch.ones(len(pairs), dtype=torch.float32, device=resolved_device)
    else:
        indices = torch.empty((2, 0), dtype=torch.int64, device=resolved_device)
        values = torch.empty((0,), dtype=torch.float32, device=resolved_device)
    tensor = torch.sparse_coo_tensor(indices, values, size=(len(rows), len(cols)), device=resolved_device).coalesce()
    dense_mask = tensor.to_dense().detach().cpu().numpy().astype(np.uint8, copy=False)
    nnz = int(tensor._nnz())
    cells = max(len(rows) * len(cols), 1)
    receipt = SparseRelationReceipt(
        schema="atlas.sparse-relation-receipt.v1",
        row_count=len(rows),
        column_count=len(cols),
        nnz=nnz,
        density=float(nnz / cells),
        binary_mask_checksum=_checksum(dense_mask),
        sparse_layout="coo",
        canonical_authority=False,
    )
    return tensor, receipt


def sparse_relation_softmax(
    sparse_logits: Any,
    *,
    dim: int = 1,
    temperature: float = 1.0,
):
    import torch

    if temperature <= 0 or not np.isfinite(temperature):
        raise ValueError("temperature must be finite and positive")
    logits = sparse_logits.coalesce()
    if logits.layout != torch.sparse_coo:
        raise ValueError("sparse_relation_softmax currently requires COO")
    scaled = torch.sparse_coo_tensor(
        logits.indices(), logits.values().float() / float(temperature), logits.shape, device=logits.device,
    ).coalesce()
    probabilities = torch.sparse.softmax(scaled, dim=dim, dtype=torch.float32).coalesce()
    dense = probabilities.to_dense()
    row_sums = dense.sum(dim=dim)
    active = (scaled.to_dense() != 0).any(dim=dim) if scaled._nnz() else torch.zeros_like(row_sums, dtype=torch.bool)
    # Binary incidence often uses logit value 1. For general sparse logits a
    # specified zero is valid but sparse COO may retain it. Determine active
    # slices from indices instead of numerical value.
    if dim == 1 and scaled._nnz():
        active = torch.zeros(scaled.shape[0], dtype=torch.bool, device=scaled.device)
        active[scaled.indices()[0].unique()] = True
    elif dim == 0 and scaled._nnz():
        active = torch.zeros(scaled.shape[1], dtype=torch.bool, device=scaled.device)
        active[scaled.indices()[1].unique()] = True
    error = (row_sums[active] - 1.0).abs().max() if bool(active.any()) else torch.tensor(0.0, device=dense.device)
    values_host = probabilities.values().detach().cpu().numpy().astype(np.float32, copy=False)
    receipt = SparseSoftmaxReceipt(
        schema="atlas.sparse-softmax-receipt.v1",
        dim=dim,
        nnz=int(probabilities._nnz()),
        temperature=float(temperature),
        values_checksum=_checksum(values_host),
        max_row_sum_error=float(error.detach().cpu()),
        unspecified_probability=0.0,
        canonical_authority=False,
    )
    return probabilities, receipt


def sparse_relation_spmm(sparse_relation: Any, dense_features: Any):
    import torch

    relation = sparse_relation.coalesce()
    features = torch.as_tensor(dense_features, dtype=torch.float32, device=relation.device)
    if relation.ndim != 2 or features.ndim != 2 or relation.shape[1] != features.shape[0]:
        raise ValueError("SpMM shapes must satisfy relation[M,N] @ features[N,D]")
    output = torch.sparse.mm(relation, features)
    host = output.detach().cpu().numpy().astype(np.float32, copy=False)
    receipt = SparseSpmmReceipt(
        schema="atlas.sparse-spmm-receipt.v1",
        relation_shape=[int(v) for v in relation.shape],
        dense_feature_shape=[int(v) for v in features.shape],
        output_shape=[int(v) for v in output.shape],
        nnz=int(relation._nnz()),
        output_checksum=_checksum(host),
        canonical_authority=False,
    )
    return output, receipt


def choose_sparse_compute_mode(
    *,
    rows: int,
    columns: int,
    nnz: int,
    sparse_density_threshold: float = 0.15,
    minimum_cells_for_sparse: int = 4096,
) -> SparseComputePolicyReceipt:
    if rows < 0 or columns < 0 or nnz < 0 or nnz > rows * columns:
        raise ValueError("invalid sparse matrix shape/nnz")
    cells = rows * columns
    density = float(nnz / cells) if cells else 0.0
    selected: Literal["dense", "sparse"] = (
        "sparse" if cells >= minimum_cells_for_sparse and density <= sparse_density_threshold else "dense"
    )
    return SparseComputePolicyReceipt(
        schema="atlas.sparse-compute-policy-receipt.v1",
        rows=rows,
        columns=columns,
        nnz=nnz,
        density=density,
        sparse_density_threshold=sparse_density_threshold,
        minimum_cells_for_sparse=minimum_cells_for_sparse,
        selected_mode=selected,
        selector="deterministic_density_and_size_threshold",
        learned_selector_used=False,
        mosparse_reimplementation_claimed=False,
        canonical_authority=False,
    )
