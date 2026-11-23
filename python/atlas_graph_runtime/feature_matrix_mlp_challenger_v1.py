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


def _extract_fixed_list_matrix_v1(col: pa.ChunkedArray, expected_dim: int, dtype: np.dtype) -> tuple[np.ndarray, bool]:
    """Extract a `(N, expected_dim)` matrix from a FixedSizeListArray with zero-copy view when contiguous."""
    arr = col.combine_chunks() if col.num_chunks > 1 else col.chunk(0)
    if isinstance(arr, pa.FixedSizeListArray) and arr.type.list_size == expected_dim and arr.null_count == 0:
        flat = arr.values.to_numpy(zero_copy_only=True)
        mat = flat.reshape(len(arr), expected_dim)
        return np.array(mat, dtype=dtype, copy=True), True
    return np.asarray(col.to_pylist(), dtype=dtype), False


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


def load_arrow_feature_tensors_v1(arrow_path: str | Path) -> dict[str, Any]:
    """Memory-map an Arrow IPC file via `pa.memory_map`, extract float32 matrices, and release mmap."""
    path = Path(arrow_path)
    file_bytes = path.stat().st_size
    was_tracing = tracemalloc.is_tracing()
    if not was_tracing:
        tracemalloc.start()
    tracemalloc.reset_peak()

    with pa.memory_map(str(path), "r") as mmap_source:
        table = ipc.open_file(mmap_source).read_all()
        features_a, feat_zero_copy = _extract_fixed_list_matrix_v1(
            table["features"], FEATURE_DIM, np.dtype(np.float32)
        )
        mask_a, mask_zero_copy = _extract_fixed_list_matrix_v1(
            table["presence_mask"], FEATURE_DIM, np.dtype(np.float32)
        )
        chunk_ids = table["chunk_id"].to_pylist()
        source_refs = table["source_ref"].to_pylist()
        source_revisions = table["source_revision"].to_pylist()
        chunk_sha256s = table["chunk_sha256"].to_pylist()
        closed_after_read = False
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
    """Run in-memory MLP challenger scoring over mmap'd Arrow FeatureMatrix without persisting hidden states."""
    loaded = load_arrow_feature_tensors_v1(arrow_path)
    features_a: np.ndarray = loaded["features"]
    mask_a: np.ndarray = loaded["presence_mask"]
    masked_a = features_a * mask_a

    scores_a = _deterministic_mlp_forward_v1(masked_a)
    scores = [float(s) for s in scores_a.tolist()]
    masked_cols = int(np.sum(np.sum(mask_a, axis=0) == 0))

    ranked_indices = sorted(range(len(scores)), key=lambda i: (-scores[i], loaded["chunk_id"][i]))
    top_tuples = [
        (
            loaded["chunk_id"][idx],
            "challenger_score",
            round(scores[idx], 6),
            loaded["source_revision"][idx],
            "PROPOSED",
        )
        for idx in ranked_indices[:top_k]
    ]

    return {
        "schema": "atlas.feature-matrix-mlp-challenger.v1",
        "backend": "numpy_cpu_oracle",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "hiddenStatePersisted": False,
        "arrowPath": str(arrow_path),
        "rowCount": len(scores),
        "tensorShape": list(masked_a.shape),
        "fullyMaskedColumnCount": masked_cols,
        "scoreMin": round(min(scores), 6) if scores else None,
        "scoreMax": round(max(scores), 6) if scores else None,
        "memoryTelemetry": loaded["memoryTelemetry"],
        "topTuples": top_tuples,
    }
