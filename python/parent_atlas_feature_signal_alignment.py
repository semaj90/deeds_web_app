"""Parent Atlas aligned feature-signal experiment reference evaluator.

This module evaluates *already computed* outputs from one frozen revision set. It
is intentionally backend-neutral: Qdrant, cuVS, CAGRA, cuML, SOM, sparse GPU/CPU
kernels, and contextual tensor producers must first persist revision-qualified
outputs aligned to the same canonical ordinals.

Approximation proposes; aligned exact measurements prove.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence
import math

import numpy as np


@dataclass(frozen=True)
class TopKMetrics:
    overlap_at_k: float
    recall_at_k: float


@dataclass(frozen=True)
class SparseShapeMetrics:
    density: float
    row_irregularity_cv: float


@dataclass(frozen=True)
class RetrievalMetrics:
    recall_at_k: float
    mrr: float


def _as_int_rows(x: np.ndarray | Sequence[Sequence[int]]) -> np.ndarray:
    arr = np.asarray(x, dtype=np.int64)
    if arr.ndim != 2:
        raise ValueError("expected a rank-2 [queries, k] integer matrix")
    return arr


def topk_overlap_and_recall(
    exact_topk: np.ndarray | Sequence[Sequence[int]],
    challenger_topk: np.ndarray | Sequence[Sequence[int]],
) -> TopKMetrics:
    """Mean set overlap/recall for equal-K result matrices.

    For exact Top-K as the oracle, overlap@K and Recall@K are numerically equal,
    but both names are retained because the receipt compares multiple executor
    semantics and may later add unequal candidate-pool metrics.
    """
    exact = _as_int_rows(exact_topk)
    challenger = _as_int_rows(challenger_topk)
    if exact.shape != challenger.shape:
        raise ValueError(f"Top-K shapes differ: exact={exact.shape}, challenger={challenger.shape}")
    if exact.shape[1] == 0:
        raise ValueError("K must be > 0")

    scores = []
    for gold, pred in zip(exact, challenger, strict=True):
        gold_set = set(map(int, gold.tolist()))
        pred_set = set(map(int, pred.tolist()))
        scores.append(len(gold_set & pred_set) / len(gold_set))
    mean = float(np.mean(scores)) if scores else 0.0
    return TopKMetrics(overlap_at_k=mean, recall_at_k=mean)


def distribution_entropy(probabilities: np.ndarray, *, eps: float = 1e-12) -> float:
    """Mean Shannon entropy over rows of an already-normalized soft distribution."""
    p = np.asarray(probabilities, dtype=np.float64)
    if p.ndim != 2:
        raise ValueError("probabilities must be [rows, clusters]")
    row_sums = p.sum(axis=1)
    if not np.allclose(row_sums, 1.0, atol=1e-5):
        raise ValueError("cluster distributions must sum to 1 per row")
    p = np.clip(p, eps, 1.0)
    return float(np.mean(-(p * np.log(p)).sum(axis=1)))


def cluster_stability(labels_a: Sequence[int], labels_b: Sequence[int]) -> float:
    """Permutation-invariant pairwise co-membership agreement.

    This avoids treating arbitrary KMeans label numbers as canonical identity.
    O(N^2) reference implementation; use sampled/vectorized challengers at scale.
    """
    a = np.asarray(labels_a)
    b = np.asarray(labels_b)
    if a.shape != b.shape or a.ndim != 1:
        raise ValueError("cluster label arrays must be equal-length rank-1 vectors")
    n = len(a)
    if n < 2:
        return 1.0
    agree = 0
    total = 0
    for i in range(n):
        for j in range(i + 1, n):
            agree += int((a[i] == a[j]) == (b[i] == b[j]))
            total += 1
    return agree / total


def som_quantization_error(vectors: np.ndarray, bmu_vectors: np.ndarray) -> float:
    x = np.asarray(vectors, dtype=np.float64)
    bmu = np.asarray(bmu_vectors, dtype=np.float64)
    if x.shape != bmu.shape or x.ndim != 2:
        raise ValueError("vectors and BMU vectors must have identical [rows, dims] shape")
    return float(np.linalg.norm(x - bmu, axis=1).mean())


def som_neighborhood_preservation(
    semantic_neighbors: np.ndarray,
    som_neighbors: np.ndarray,
) -> float:
    """Mean neighborhood overlap using canonical ordinals."""
    return topk_overlap_and_recall(semantic_neighbors, som_neighbors).overlap_at_k


def sparse_shape_metrics(indptr: Sequence[int], *, n_cols: int) -> SparseShapeMetrics:
    ptr = np.asarray(indptr, dtype=np.int64)
    if ptr.ndim != 1 or len(ptr) < 2 or n_cols <= 0:
        raise ValueError("invalid CSR indptr/n_cols")
    row_nnz = np.diff(ptr)
    n_rows = len(row_nnz)
    nnz = int(ptr[-1])
    density = nnz / (n_rows * n_cols) if n_rows else 0.0
    mean = float(row_nnz.mean()) if n_rows else 0.0
    std = float(row_nnz.std()) if n_rows else 0.0
    cv = std / mean if mean > 0 else 0.0
    return SparseShapeMetrics(density=float(density), row_irregularity_cv=float(cv))


def retrieval_recall_mrr(
    ranked_ordinals: np.ndarray | Sequence[Sequence[int]],
    relevant_ordinals: Sequence[set[int]],
) -> RetrievalMetrics:
    ranked = _as_int_rows(ranked_ordinals)
    if len(ranked) != len(relevant_ordinals):
        raise ValueError("query count mismatch")

    recalls: list[float] = []
    reciprocal_ranks: list[float] = []
    for row, relevant in zip(ranked, relevant_ordinals, strict=True):
        relevant = set(map(int, relevant))
        if not relevant:
            continue
        hits = sum(int(int(v) in relevant) for v in row)
        recalls.append(hits / len(relevant))
        rr = 0.0
        for rank, ordinal in enumerate(row, start=1):
            if int(ordinal) in relevant:
                rr = 1.0 / rank
                break
        reciprocal_ranks.append(rr)

    return RetrievalMetrics(
        recall_at_k=float(np.mean(recalls)) if recalls else 0.0,
        mrr=float(np.mean(reciprocal_ranks)) if reciprocal_ranks else 0.0,
    )


def retrieval_lift(baseline: float, contextual: float) -> float:
    """Absolute retrieval lift; receipts should retain baseline and challenger too."""
    if not (math.isfinite(baseline) and math.isfinite(contextual)):
        raise ValueError("retrieval metrics must be finite")
    return float(contextual - baseline)


def binary_hamming_distance(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Readable reference for packed/unpacked binary projection parity.

    Inputs are bool/0-1 matrices of equal shape; accelerated implementations may
    replace this with XOR+popcount but must match this result exactly.
    """
    aa = np.asarray(a, dtype=np.bool_)
    bb = np.asarray(b, dtype=np.bool_)
    if aa.shape != bb.shape:
        raise ValueError("binary projection shapes must match")
    return np.count_nonzero(np.logical_xor(aa, bb), axis=-1).astype(np.int64)


def canonical_alignment_checksum_payload(
    ordinals: Sequence[int],
    canonical_ids: Sequence[str],
    signal_labels: Sequence[str],
) -> bytes:
    """Produce stable text bytes for a higher-level cryptographic checksum.

    Float matrices themselves should be hashed from a separately specified dtype,
    byte order, shape, and canonical row-major encoding. This helper only covers
    identity/order metadata.
    """
    if len(ordinals) != len(canonical_ids):
        raise ValueError("ordinal/canonical-id count mismatch")
    rows = ["atlas.feature-signal-alignment.identity.v1"]
    rows.extend(f"{int(o)}\t{cid}" for o, cid in zip(ordinals, canonical_ids, strict=True))
    rows.append("signals=" + ",".join(sorted(signal_labels)))
    return ("\n".join(rows) + "\n").encode("utf-8")
