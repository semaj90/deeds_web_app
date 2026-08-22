"""Exact binary-Hamming evaluation for Parent Atlas aligned snapshots.

The binary codes are produced by the existing cuVS binary quantizer. This module
intentionally evaluates those codes with a deterministic NumPy popcount oracle
rather than introducing a second ANN/index owner. It measures representation
quality against the already-frozen semantic exact Top-K and records latency.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
import time
from typing import Any, Sequence

import numpy as np


_POPCOUNT_U8 = np.asarray([value.bit_count() for value in range(256)], dtype=np.uint8)


@dataclass(frozen=True)
class BinaryHammingRetrievalReceipt:
    schema: str
    rows: int
    encoded_bytes_per_row: int
    query_count: int
    top_k: int
    search_backend: str
    search_metric: str
    self_exclusion: bool
    benchmark_repeats: int
    mean_overlap_at_k: float
    minimum_query_overlap_at_k: float
    mean_latency_ms: float
    p95_latency_ms: float
    rankings_checksum: str
    distances_checksum: str
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _stable_checksum(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _encoded_matrix(value: Sequence[Sequence[int]] | np.ndarray) -> np.ndarray:
    encoded = np.asarray(value)
    if encoded.ndim != 2 or encoded.shape[0] == 0 or encoded.shape[1] == 0:
        raise ValueError("encoded binary matrix must be non-empty rank-2")
    if encoded.dtype != np.uint8:
        if not np.issubdtype(encoded.dtype, np.integer):
            raise ValueError("encoded binary matrix must contain uint8-compatible integers")
        if np.any(encoded < 0) or np.any(encoded > 255):
            raise ValueError("encoded binary matrix contains values outside uint8 range")
        encoded = encoded.astype(np.uint8)
    return np.ascontiguousarray(encoded, dtype=np.uint8)


def rank_binary_hamming_exact(
    encoded: Sequence[Sequence[int]] | np.ndarray,
    *,
    query_ordinal: int,
    top_k: int,
) -> tuple[list[int], list[int]]:
    """Return exact Hamming neighbors with deterministic ordinal tie-breaking."""

    source = _encoded_matrix(encoded)
    if not 0 <= query_ordinal < source.shape[0]:
        raise ValueError("query_ordinal out of range")
    if not 1 <= top_k < source.shape[0]:
        raise ValueError("top_k must be >=1 and smaller than row count")

    xor = np.bitwise_xor(source, source[query_ordinal])
    distances = _POPCOUNT_U8[xor].sum(axis=1, dtype=np.int32)
    ordinals = np.arange(source.shape[0], dtype=np.int64)
    ordering = np.lexsort((ordinals, distances))
    selected = [int(value) for value in ordering if int(value) != query_ordinal][:top_k]
    selected_distances = [int(distances[value]) for value in selected]
    return selected, selected_distances


def evaluate_binary_hamming_retrieval(
    encoded: Sequence[Sequence[int]] | np.ndarray,
    query_ordinals: Sequence[int],
    exact_reference_ordinals: Sequence[Sequence[int]],
    *,
    top_k: int,
    benchmark_repeats: int = 3,
) -> BinaryHammingRetrievalReceipt:
    """Measure exact Hamming Top-K overlap and query latency.

    `exact_reference_ordinals` must be the same self-excluding semantic exact
    rankings used elsewhere in the aligned-snapshot experiment. The Hamming
    result is a challenger representation only and never becomes canonical.
    """

    source = _encoded_matrix(encoded)
    queries = [int(value) for value in query_ordinals]
    references = [[int(value) for value in row] for row in exact_reference_ordinals]
    if not queries:
        raise ValueError("query_ordinals required")
    if len(queries) != len(references):
        raise ValueError("query/reference row count mismatch")
    if len(set(queries)) != len(queries):
        raise ValueError("query_ordinals must be unique")
    if not 1 <= top_k < source.shape[0]:
        raise ValueError("top_k must be >=1 and smaller than row count")
    if benchmark_repeats <= 0:
        raise ValueError("benchmark_repeats must be positive")
    for query, reference in zip(queries, references, strict=True):
        if not 0 <= query < source.shape[0]:
            raise ValueError("query ordinal out of range")
        if len(reference) < top_k:
            raise ValueError("exact reference does not contain top_k neighbors")
        if query in reference[:top_k]:
            raise ValueError("exact reference must be self-excluding")

    rankings: list[list[int]] = []
    selected_distances: list[list[int]] = []
    latencies: list[float] = []
    overlaps: list[float] = []

    for query, reference in zip(queries, references, strict=True):
        observed_ranking: list[int] | None = None
        observed_distances: list[int] | None = None
        for _ in range(benchmark_repeats):
            started = time.perf_counter()
            ranking, distances = rank_binary_hamming_exact(source, query_ordinal=query, top_k=top_k)
            latencies.append((time.perf_counter() - started) * 1000.0)
            if observed_ranking is None:
                observed_ranking = ranking
                observed_distances = distances
            elif ranking != observed_ranking or distances != observed_distances:
                raise RuntimeError("binary Hamming replay was not deterministic")
        assert observed_ranking is not None and observed_distances is not None
        rankings.append(observed_ranking)
        selected_distances.append(observed_distances)
        overlaps.append(len(set(observed_ranking) & set(reference[:top_k])) / float(top_k))

    return BinaryHammingRetrievalReceipt(
        schema="atlas.binary-hamming-retrieval-receipt.v1",
        rows=int(source.shape[0]),
        encoded_bytes_per_row=int(source.shape[1]),
        query_count=len(queries),
        top_k=top_k,
        search_backend="numpy_exact_popcount",
        search_metric="bitwise_hamming",
        self_exclusion=True,
        benchmark_repeats=int(benchmark_repeats),
        mean_overlap_at_k=float(np.mean(overlaps)),
        minimum_query_overlap_at_k=float(np.min(overlaps)),
        mean_latency_ms=float(np.mean(latencies)),
        p95_latency_ms=float(np.percentile(latencies, 95)),
        rankings_checksum=_stable_checksum(rankings),
        distances_checksum=_stable_checksum(selected_distances),
        canonical_authority=False,
    )
