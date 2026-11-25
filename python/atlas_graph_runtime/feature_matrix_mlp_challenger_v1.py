"""Ephemeral-hidden-state CPU-oracle MLP challenger over memory-mapped Arrow FeatureMatrix.

Uses `pyarrow.memory_map` (`mmap`) and zero-copy `FixedSizeListArray.values.to_numpy`
extraction with explicit `mmap` handle release and `tracemalloc` + `logging`
telemetry (`mmapUsed`, `zeroCopyValuesView`, `tracemallocPeakBytes`, `bufferReleased`).

Authority & hidden-state rule (`AGENTS.md`):
- Hidden-layer activations stay strictly ephemeral in-process and are NEVER
  returned, serialized, or persisted (`hiddenStatePersisted: False`).
- Outputs are non-canonical challenger signals (`canonicalAuthority: False`,
  `writesPerformed: False`).
"""
from __future__ import annotations

import logging
import math
import tracemalloc
from pathlib import Path
from typing import Any

import numpy as np
import pyarrow as pa
import pyarrow.ipc as ipc

LOGGER = logging.getLogger("atlas.feature_matrix_mlp_challenger_v1")

FEATURE_DIM = 5
HIDDEN_DIM = 16


def _gelu(x: np.ndarray) -> np.ndarray:
    return 0.5 * x * (1.0 + np.tanh(math.sqrt(2.0 / math.pi) * (x + 0.044715 * np.power(x, 3))))


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(x, -30.0, 30.0)))


def _extract_fixed_list_array_v1(
    arr: pa.Array,
    expected_dim: int,
    dtype: np.dtype,
    *,
    copy: bool = False,
) -> tuple[np.ndarray, bool]:
    """Extract a `(N, expected_dim)` matrix from a FixedSizeListArray with zero-copy view when contiguous."""
    if isinstance(arr, pa.FixedSizeListArray) and arr.type.list_size == expected_dim and arr.null_count == 0:
        flat = arr.values.to_numpy(zero_copy_only=True)
        mat = flat.reshape(len(arr), expected_dim)
        if copy or mat.dtype != dtype:
            return np.array(mat, dtype=dtype, copy=True), True
        return mat, True
    return np.asarray(arr.to_pylist(), dtype=dtype), False


def _extract_fixed_list_matrix_v1(col: pa.ChunkedArray, expected_dim: int, dtype: np.dtype) -> tuple[np.ndarray, bool]:
    """Extract a `(N, expected_dim)` matrix from a ChunkedArray with zero-copy view when contiguous."""
    arr = col.combine_chunks() if col.num_chunks > 1 else col.chunk(0)
    return _extract_fixed_list_array_v1(arr, expected_dim, dtype, copy=True)


def _deterministic_mlp_forward_v1(masked_features: np.ndarray) -> np.ndarray:
    """Run a deterministic 2-layer MLP (`5 -> 16 -> 1`); hidden activations remain ephemeral."""
    rng = np.random.default_rng(20261122)
    w1 = rng.normal(0.0, 0.25, size=(FEATURE_DIM, HIDDEN_DIM)).astype(np.float32)
    b1 = np.zeros((HIDDEN_DIM,), dtype=np.float32)
    w2 = rng.normal(0.0, 0.25, size=(HIDDEN_DIM, 1)).astype(np.float32)
    b2 = np.zeros((1,), dtype=np.float32)

    hidden = _gelu(masked_features @ w1 + b1)
    logits = (hidden @ w2 + b2).squeeze(-1)
    return _sigmoid(logits).astype(np.float32)


def load_arrow_feature_tensors_v1(
    arrow_path: str | Path,
    *,
    max_rows: int = 10_000,
) -> dict[str, Any]:
    """Load a bounded Arrow cohort; use the streaming scorer for larger files.

    The convenience API returns full NumPy arrays, so it cannot be constant
    memory. It iterates record batches and enforces a row cap rather than
    materializing the complete Arrow table with ``read_all()``.
    """
    if isinstance(max_rows, bool) or not isinstance(max_rows, int) or max_rows < 1:
        raise ValueError("max_rows must be a positive integer")
    path = Path(arrow_path)
    file_bytes = path.stat().st_size
    was_tracing = tracemalloc.is_tracing()
    if not was_tracing:
        tracemalloc.start()
    tracemalloc.reset_peak()

    feature_batches: list[np.ndarray] = []
    mask_batches: list[np.ndarray] = []
    chunk_ids: list[str] = []
    source_refs: list[str] = []
    source_revisions: list[str] = []
    chunk_sha256s: list[str] = []
    total_rows = 0
    feat_zero_copy = True
    mask_zero_copy = True

    with pa.memory_map(str(path), "r") as mmap_source:
        reader = ipc.open_file(mmap_source)
        batch = None
        for batch_index in range(reader.num_record_batches):
            batch = reader.get_batch(batch_index)
            next_total = total_rows + batch.num_rows
            if next_total > max_rows:
                if not was_tracing:
                    tracemalloc.stop()
                raise ValueError(
                    f"Arrow cohort has more than max_rows={max_rows}; "
                    "use score_feature_matrix_arrow_v1 for streaming top-K scoring"
                )
            features_b, feat_zc = _extract_fixed_list_array_v1(
                batch.column("features"), FEATURE_DIM, np.dtype(np.float32), copy=True
            )
            mask_b, mask_zc = _extract_fixed_list_array_v1(
                batch.column("presence_mask"), FEATURE_DIM, np.dtype(np.float32), copy=True
            )
            if features_b.ndim != 2 or features_b.shape[1] != FEATURE_DIM:
                raise ValueError(f"Expected features shape (N, {FEATURE_DIM}), got {features_b.shape}")
            if mask_b.shape != features_b.shape:
                raise ValueError(f"Mask shape {mask_b.shape} != features shape {features_b.shape}")
            if not np.isfinite(features_b).all():
                raise ValueError("Non-finite values detected in Arrow features tensor")
            feature_batches.append(features_b)
            mask_batches.append(mask_b)
            chunk_ids.extend(batch.column("chunk_id").to_pylist())
            source_refs.extend(batch.column("source_ref").to_pylist())
            source_revisions.extend(batch.column("source_revision").to_pylist())
            chunk_sha256s.extend(batch.column("chunk_sha256").to_pylist())
            feat_zero_copy = feat_zero_copy and feat_zc
            mask_zero_copy = mask_zero_copy and mask_zc
            total_rows = next_total
        del batch, reader

    features_a = (
        np.concatenate(feature_batches, axis=0)
        if feature_batches
        else np.empty((0, FEATURE_DIM), dtype=np.float32)
    )
    mask_a = (
        np.concatenate(mask_batches, axis=0)
        if mask_batches
        else np.empty((0, FEATURE_DIM), dtype=np.float32)
    )
    del feature_batches, mask_batches
    closed_after_read = True

    if features_a.ndim != 2 or features_a.shape[1] != FEATURE_DIM:
        raise ValueError(f"Expected features shape (N, {FEATURE_DIM}), got {features_a.shape}")
    if mask_a.shape != features_a.shape:
        raise ValueError(f"Mask shape {mask_a.shape} != features shape {features_a.shape}")
    if not np.isfinite(features_a).all():
        raise ValueError("Non-finite values detected in Arrow features tensor")

    cur_bytes, peak_bytes = tracemalloc.get_traced_memory()
    if not was_tracing:
        tracemalloc.stop()

    telemetry = {
        "mmapUsed": True,
        "mmapFileBytes": file_bytes,
        "zeroCopyValuesView": bool(feat_zero_copy and mask_zero_copy),
        "returnedArraysOwnMemory": True,
        "maxRows": max_rows,
        "bufferReleased": closed_after_read,
        "tracemallocCurrentBytes": int(cur_bytes),
        "tracemallocPeakBytes": int(peak_bytes),
    }
    LOGGER.info(
        "arrow_mmap_loaded path=%s rows=%d mmap_bytes=%d zero_copy=%s peak_bytes=%d released=%s",
        path,
        len(chunk_ids),
        file_bytes,
        telemetry["zeroCopyValuesView"],
        peak_bytes,
        closed_after_read,
    )

    return {
        "chunk_id": chunk_ids,
        "source_ref": source_refs,
        "source_revision": source_revisions,
        "chunk_sha256": chunk_sha256s,
        "features": features_a,
        "presence_mask": mask_a,
        "memoryTelemetry": telemetry,
    }


def score_feature_matrix_arrow_v1(
    arrow_path: str | Path = "docs/reports/feature_matrix_5.arrow",
    *,
    top_k: int = 5,
) -> dict[str, Any]:
    """Stream mmap'd Arrow FeatureMatrix RecordBatches through the MLP challenger without read_all()."""
    path = Path(arrow_path)
    file_bytes = path.stat().st_size
    was_tracing = tracemalloc.is_tracing()
    if not was_tracing:
        tracemalloc.start()
    tracemalloc.reset_peak()

    total_rows = 0
    zero_copy_all = True
    col_mask_sums = np.zeros((FEATURE_DIM,), dtype=np.float64)
    score_min: float | None = None
    score_max: float | None = None
    top_candidates: list[tuple[float, str, str]] = []

    with pa.memory_map(str(path), "r") as mmap_source:
        reader = ipc.open_file(mmap_source)
        batch = None
        for batch_idx in range(reader.num_record_batches):
            batch = reader.get_batch(batch_idx)
            feat_b, feat_zc = _extract_fixed_list_array_v1(
                batch.column("features"), FEATURE_DIM, np.dtype(np.float32), copy=False
            )
            mask_b, mask_zc = _extract_fixed_list_array_v1(
                batch.column("presence_mask"), FEATURE_DIM, np.dtype(np.float32), copy=False
            )
            zero_copy_all = zero_copy_all and feat_zc and mask_zc
            if feat_b.ndim != 2 or feat_b.shape[1] != FEATURE_DIM:
                raise ValueError(f"Expected features shape (N, {FEATURE_DIM}), got {feat_b.shape}")
            if mask_b.shape != feat_b.shape:
                raise ValueError(f"Mask shape {mask_b.shape} != features shape {feat_b.shape}")
            if not np.isfinite(feat_b).all():
                raise ValueError("Non-finite values detected in Arrow features tensor")

            scores_b = _deterministic_mlp_forward_v1(feat_b * mask_b)
            col_mask_sums += np.sum(mask_b, axis=0, dtype=np.float64)
            if len(scores_b) > 0:
                b_min = float(np.min(scores_b))
                b_max = float(np.max(scores_b))
                score_min = b_min if score_min is None else min(score_min, b_min)
                score_max = b_max if score_max is None else max(score_max, b_max)

            chunk_ids_b = batch.column("chunk_id").to_pylist()
            source_revs_b = batch.column("source_revision").to_pylist()
            for idx, score_val in enumerate(scores_b.tolist()):
                top_candidates.append((float(score_val), chunk_ids_b[idx], source_revs_b[idx]))
            top_candidates.sort(key=lambda item: (-item[0], item[1]))
            del top_candidates[max(0, top_k):]
            total_rows += len(scores_b)
        del batch, reader

    cur_bytes, peak_bytes = tracemalloc.get_traced_memory()
    if not was_tracing:
        tracemalloc.stop()

    telemetry = {
        "mmapUsed": True,
        "mmapFileBytes": file_bytes,
        "zeroCopyValuesView": bool(zero_copy_all),
        "streamingBatches": True,
        "bufferReleased": True,
        "tracemallocCurrentBytes": int(cur_bytes),
        "tracemallocPeakBytes": int(peak_bytes),
    }
    masked_cols = int(np.sum(col_mask_sums == 0))
    top_tuples = [
        (chunk_id, "challenger_score", round(score, 6), source_rev, "PROPOSED")
        for score, chunk_id, source_rev in top_candidates[:top_k]
    ]

    return {
        "schema": "atlas.feature-matrix-mlp-challenger.v1",
        "backend": "numpy_cpu_oracle",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "hiddenStatePersisted": False,
        "arrowPath": str(arrow_path),
        "rowCount": total_rows,
        "tensorShape": [total_rows, FEATURE_DIM],
        "fullyMaskedColumnCount": masked_cols,
        "scoreMin": round(score_min, 6) if score_min is not None else None,
        "scoreMax": round(score_max, 6) if score_max is not None else None,
        "memoryTelemetry": telemetry,
        "topTuples": top_tuples,
    }
