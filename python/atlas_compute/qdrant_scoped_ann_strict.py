"""Strict same-corpus Qdrant exact/HNSW proof path.

This module intentionally reuses the existing Qdrant request primitives and
QdrantScopedAnnReceipt shape while tightening eligibility: HNSW is unreachable
unless BOTH mean PyTorch↔Qdrant exact Top-K overlap and the minimum per-query
overlap meet the configured exact floor.
"""

from __future__ import annotations

from typing import Any, Sequence

import numpy as np

from .exact_semantic import exact_semantic_search
from .qdrant_exact_alignment_gate import evaluate_qdrant_exact_alignment_gate
from .qdrant_scoped_ann import (
    ComparisonScope,
    QdrantScopedAnnReceipt,
    QdrantScopedSweepPoint,
    _collection_vector_config,
    _query,
    _stable_checksum,
    expected_qdrant_distance,
)


def evaluate_qdrant_scoped_ann_strict(
    semantic: np.ndarray,
    canonical_ids: Sequence[str],
    query_ordinals: Sequence[int],
    *,
    metric: str,
    k: int,
    qdrant: dict[str, Any],
    torch_device: str = "cpu",
) -> QdrantScopedAnnReceipt:
    source = np.asarray(semantic, dtype=np.float32)
    ids = [str(value) for value in canonical_ids]
    if source.ndim != 2 or source.shape[0] != len(ids):
        raise ValueError("semantic rows and canonical IDs must align")
    if len(set(ids)) != len(ids):
        raise ValueError("canonical IDs must be unique")
    if not query_ordinals:
        raise ValueError("query_ordinals required")
    if not (1 <= k < source.shape[0]):
        raise ValueError("self-excluding k must be smaller than corpus rows")

    comparison_scope: ComparisonScope = str(qdrant.get("comparison_scope") or "snapshot_subset")  # type: ignore[assignment]
    if comparison_scope not in {"snapshot_subset", "full_collection"}:
        raise ValueError("unsupported qdrant comparison_scope")

    base_url = str(qdrant.get("url") or "http://127.0.0.1:6333")
    collection = str(qdrant.get("collection") or "")
    if not collection:
        raise ValueError("qdrant.collection is required")
    vector_name_raw = qdrant.get("vector_name")
    vector_name = str(vector_name_raw) if vector_name_raw else None
    payload_key = str(qdrant.get("canonical_payload_key") or "canonical_id")
    timeout = float(qdrant.get("timeout_seconds") or 15.0)
    minimum_exact_overlap = float(qdrant.get("minimum_exact_overlap_at_k") or 0.95)
    minimum_hnsw_recall = float(qdrant.get("minimum_recall_at_k") or 0.95)
    if not 0.0 <= minimum_exact_overlap <= 1.0 or not 0.0 <= minimum_hnsw_recall <= 1.0:
        raise ValueError("recall thresholds must be in [0,1]")
    ef_values = sorted({int(value) for value in qdrant.get("hnsw_ef") or [32, 64, 128, 256]})
    if not ef_values or any(value <= 0 for value in ef_values):
        raise ValueError("hnsw_ef values must be positive")

    expected_distance, distance_interpretation = expected_qdrant_distance(metric)
    qdrant_size, qdrant_distance = _collection_vector_config(
        base_url=base_url,
        collection=collection,
        vector_name=vector_name,
        timeout=timeout,
    )
    metric_aligned = qdrant_size == int(source.shape[1]) and qdrant_distance.lower() == expected_distance.lower()
    if not metric_aligned:
        return QdrantScopedAnnReceipt(
            schema="atlas.qdrant-scoped-ann-receipt.v1",
            comparison_scope=comparison_scope,
            scoped_corpus_count=len(ids),
            scoped_corpus_checksum=_stable_checksum(ids),
            collection=collection,
            vector_name=vector_name,
            canonical_payload_key=payload_key,
            metric=metric,
            qdrant_distance=qdrant_distance,
            qdrant_vector_size=qdrant_size,
            metric_alignment_status="MISMATCH",
            distance_interpretation=distance_interpretation,
            k=k,
            query_count=len(query_ordinals),
            minimum_exact_overlap_at_k=minimum_exact_overlap,
            pytorch_qdrant_exact_mean_overlap_at_k=0.0,
            pytorch_qdrant_exact_minimum_query_overlap_at_k=0.0,
            exact_alignment_status="METRIC_MISMATCH",
            exact_mean_latency_ms=0.0,
            exact_p95_latency_ms=0.0,
            exact_result_checksum=_stable_checksum([]),
            sweep=[],
            minimum_hnsw_recall_at_k=minimum_hnsw_recall,
            recommended_hnsw_ef=None,
            recommendation_status="BLOCKED_METRIC_MISMATCH",
            best_hnsw_recall_at_k=0.0,
            canonical_authority=False,
        )

    queries = source[np.asarray(query_ordinals, dtype=np.int64)]
    exact_reference = exact_semantic_search(
        source,
        queries,
        ids,
        metric=metric,
        top_k=min(k + 1, source.shape[0]),
        device=torch_device,
    )
    reference_rankings: list[list[str]] = []
    for query_index, hits in enumerate(exact_reference.hits):
        self_ordinal = int(query_ordinals[query_index])
        ranking = [hit.canonical_id for hit in hits if int(hit.ordinal) != self_ordinal][:k]
        if len(ranking) != k:
            raise RuntimeError("PyTorch exact did not produce enough non-self neighbors")
        reference_rankings.append(ranking)

    exact_rankings: list[list[str]] = []
    exact_latencies: list[float] = []
    exact_overlaps: list[float] = []
    for query_index, ordinal in enumerate(query_ordinals):
        ranking, latency = _query(
            base_url=base_url,
            collection=collection,
            vector_name=vector_name,
            vector=source[int(ordinal)],
            self_canonical_id=ids[int(ordinal)],
            canonical_payload_key=payload_key,
            comparison_scope=comparison_scope,
            scoped_canonical_ids=ids,
            k=k,
            exact=True,
            hnsw_ef=None,
            timeout=timeout,
        )
        exact_rankings.append(ranking)
        exact_latencies.append(latency)
        exact_overlaps.append(len(set(ranking) & set(reference_rankings[query_index])) / float(k))

    exact_gate = evaluate_qdrant_exact_alignment_gate(
        exact_overlaps,
        minimum_exact_overlap_at_k=minimum_exact_overlap,
    )
    exact_status = "ALIGNED" if exact_gate.hnsw_allowed else "EXACT_STORE_MISMATCH"

    sweep: list[QdrantScopedSweepPoint] = []
    if exact_gate.hnsw_allowed:
        for ef in ef_values:
            recalls: list[float] = []
            latencies: list[float] = []
            result_rows: list[list[str]] = []
            for query_index, ordinal in enumerate(query_ordinals):
                ranking, latency = _query(
                    base_url=base_url,
                    collection=collection,
                    vector_name=vector_name,
                    vector=source[int(ordinal)],
                    self_canonical_id=ids[int(ordinal)],
                    canonical_payload_key=payload_key,
                    comparison_scope=comparison_scope,
                    scoped_canonical_ids=ids,
                    k=k,
                    exact=False,
                    hnsw_ef=ef,
                    timeout=timeout,
                )
                recalls.append(len(set(ranking) & set(exact_rankings[query_index])) / float(k))
                latencies.append(latency)
                result_rows.append(ranking)
            sweep.append(QdrantScopedSweepPoint(
                hnsw_ef=ef,
                recall_at_k=float(np.mean(recalls)),
                mean_latency_ms=float(np.mean(latencies)),
                p95_latency_ms=float(np.percentile(latencies, 95)),
                result_checksum=_stable_checksum(result_rows),
            ))

    eligible = [row for row in sweep if row.recall_at_k >= minimum_hnsw_recall]
    recommended = min(
        eligible,
        key=lambda row: (row.mean_latency_ms, row.p95_latency_ms, row.hnsw_ef),
    ) if eligible else None

    return QdrantScopedAnnReceipt(
        schema="atlas.qdrant-scoped-ann-receipt.v1",
        comparison_scope=comparison_scope,
        scoped_corpus_count=len(ids),
        scoped_corpus_checksum=_stable_checksum(ids),
        collection=collection,
        vector_name=vector_name,
        canonical_payload_key=payload_key,
        metric=metric,
        qdrant_distance=qdrant_distance,
        qdrant_vector_size=qdrant_size,
        metric_alignment_status="ALIGNED",
        distance_interpretation=distance_interpretation,
        k=k,
        query_count=len(query_ordinals),
        minimum_exact_overlap_at_k=minimum_exact_overlap,
        pytorch_qdrant_exact_mean_overlap_at_k=exact_gate.mean_exact_overlap_at_k,
        pytorch_qdrant_exact_minimum_query_overlap_at_k=exact_gate.minimum_query_exact_overlap_at_k,
        exact_alignment_status=exact_status,
        exact_mean_latency_ms=float(np.mean(exact_latencies)),
        exact_p95_latency_ms=float(np.percentile(exact_latencies, 95)),
        exact_result_checksum=_stable_checksum(exact_rankings),
        sweep=sweep,
        minimum_hnsw_recall_at_k=minimum_hnsw_recall,
        recommended_hnsw_ef=recommended.hnsw_ef if recommended else None,
        recommendation_status=(
            "ELIGIBLE" if recommended else
            "BLOCKED_EXACT_STORE_MISMATCH" if not exact_gate.hnsw_allowed else
            "NO_SWEEP_POINT_MEETS_RECALL_FLOOR"
        ),
        best_hnsw_recall_at_k=max((row.recall_at_k for row in sweep), default=0.0),
        canonical_authority=False,
    )
