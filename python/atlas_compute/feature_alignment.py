"""Deterministic feature-block alignment for Parent Atlas tensors.

Continuous, binary and derived feature blocks may only be concatenated after
proving identical canonical row identity/order. Normalization is column-scoped
and explicit; binary masks remain exactly 0/1. The output is a derived feature
matrix and never canonical application truth.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
from typing import Any, Literal, Sequence

import numpy as np


Normalization = Literal["none", "minmax", "zscore", "log1p_minmax", "binary"]


@dataclass(frozen=True)
class FeatureBlock:
    block_id: str
    revision: str
    canonical_ids: list[str]
    values: np.ndarray
    column_names: list[str]
    normalizations: list[Normalization]
    canonical_authority: bool = False


@dataclass(frozen=True)
class FeatureColumnReceipt:
    column_index: int
    column_name: str
    block_id: str
    normalization: Normalization
    source_min: float
    source_max: float
    output_min: float
    output_max: float


@dataclass(frozen=True)
class FeatureMatrixAlignmentReceipt:
    schema: str
    row_count: int
    column_count: int
    block_ids: list[str]
    block_revisions: list[str]
    canonical_ids: list[str]
    row_identity_checksum: str
    matrix_checksum: str
    columns: list[FeatureColumnReceipt]
    dtype: str
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _identity_checksum(ids: Sequence[str]) -> str:
    payload = json.dumps(list(ids), ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return _sha256_bytes(payload)


def _normalize_column(values: np.ndarray, mode: Normalization) -> np.ndarray:
    x = values.astype(np.float32, copy=False)
    if not np.isfinite(x).all():
        raise ValueError("feature column contains non-finite values")
    if mode == "none":
        return x
    if mode == "binary":
        if not np.logical_or(x == 0.0, x == 1.0).all():
            raise ValueError("binary-normalized feature must contain only 0 or 1")
        return x
    if mode == "log1p_minmax":
        if np.any(x < 0):
            raise ValueError("log1p_minmax requires nonnegative values")
        x = np.log1p(x).astype(np.float32, copy=False)
        mode = "minmax"
    if mode == "minmax":
        lo = float(np.min(x))
        hi = float(np.max(x))
        if hi <= lo:
            return np.zeros_like(x, dtype=np.float32)
        return ((x - lo) / (hi - lo)).astype(np.float32, copy=False)
    if mode == "zscore":
        mean = float(np.mean(x, dtype=np.float64))
        std = float(np.std(x, dtype=np.float64))
        if std <= 1e-12:
            return np.zeros_like(x, dtype=np.float32)
        return ((x - mean) / std).astype(np.float32, copy=False)
    raise ValueError(f"unsupported normalization: {mode}")


def make_feature_block(
    *,
    block_id: str,
    revision: str,
    canonical_ids: Sequence[str],
    values: Sequence[Sequence[float]] | np.ndarray,
    column_names: Sequence[str],
    normalizations: Sequence[Normalization],
) -> FeatureBlock:
    ids = [str(value) for value in canonical_ids]
    if not ids or any(not value for value in ids):
        raise ValueError("canonical_ids must be non-empty strings")
    if len(set(ids)) != len(ids):
        raise ValueError("canonical_ids must be unique within a feature block")
    matrix = np.asarray(values, dtype=np.float32)
    if matrix.ndim != 2 or matrix.shape[0] != len(ids):
        raise ValueError("feature block matrix rows must equal canonical_ids length")
    names = [str(value) for value in column_names]
    norms = list(normalizations)
    if matrix.shape[1] != len(names) or len(names) != len(norms):
        raise ValueError("column_names and normalizations must match feature dimensions")
    if len(set(names)) != len(names):
        raise ValueError("column names must be unique within a feature block")
    if not np.isfinite(matrix).all():
        raise ValueError("feature block contains non-finite values")
    return FeatureBlock(
        block_id=block_id,
        revision=revision,
        canonical_ids=ids,
        values=np.ascontiguousarray(matrix),
        column_names=names,
        normalizations=norms,
    )


def align_feature_blocks(blocks: Sequence[FeatureBlock]) -> tuple[np.ndarray, FeatureMatrixAlignmentReceipt]:
    if not blocks:
        raise ValueError("at least one feature block is required")
    reference_ids = list(blocks[0].canonical_ids)
    if not reference_ids:
        raise ValueError("feature blocks cannot be empty")

    aligned: list[np.ndarray] = []
    column_receipts: list[FeatureColumnReceipt] = []
    global_column = 0
    seen_names: set[str] = set()

    for block in blocks:
        if block.canonical_ids != reference_ids:
            raise ValueError(f"FEATURE_ROW_ALIGNMENT_MISMATCH:{block.block_id}")
        if block.values.shape[0] != len(reference_ids):
            raise ValueError(f"FEATURE_ROW_COUNT_MISMATCH:{block.block_id}")
        normalized_columns: list[np.ndarray] = []
        for index, (name, mode) in enumerate(zip(block.column_names, block.normalizations, strict=True)):
            qualified_name = f"{block.block_id}:{name}"
            if qualified_name in seen_names:
                raise ValueError(f"duplicate qualified feature column: {qualified_name}")
            seen_names.add(qualified_name)
            source = block.values[:, index]
            output = _normalize_column(source, mode)
            normalized_columns.append(output)
            column_receipts.append(FeatureColumnReceipt(
                column_index=global_column,
                column_name=qualified_name,
                block_id=block.block_id,
                normalization=mode,
                source_min=float(np.min(source)),
                source_max=float(np.max(source)),
                output_min=float(np.min(output)),
                output_max=float(np.max(output)),
            ))
            global_column += 1
        aligned.append(np.stack(normalized_columns, axis=1).astype(np.float32, copy=False))

    matrix = np.ascontiguousarray(np.concatenate(aligned, axis=1), dtype=np.float32)
    receipt = FeatureMatrixAlignmentReceipt(
        schema="atlas.feature-matrix-alignment-receipt.v1",
        row_count=int(matrix.shape[0]),
        column_count=int(matrix.shape[1]),
        block_ids=[block.block_id for block in blocks],
        block_revisions=[block.revision for block in blocks],
        canonical_ids=reference_ids,
        row_identity_checksum=_identity_checksum(reference_ids),
        matrix_checksum=_sha256_bytes(matrix.tobytes(order="C")),
        columns=column_receipts,
        dtype="float32",
        canonical_authority=False,
    )
    return matrix, receipt
