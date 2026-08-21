"""Same-corpus Qdrant exact/HNSW evaluation for frozen Atlas snapshots.

A frozen snapshot may represent an entire Qdrant collection or only a bounded
subset. ANN recall is only meaningful when Qdrant exact and HNSW search the same
corpus as the frozen PyTorch/cuVS oracle. This module makes that scope explicit.

`comparison_scope="snapshot_subset"` adds a payload `match.any` filter over the
frozen canonical IDs to BOTH exact and HNSW queries. `full_collection` performs
no inclusion filter and is valid only when the frozen snapshot is itself the
full service corpus; the exact-alignment gate must prove that assumption.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
import time
from typing import Any, Literal, Sequence
from urllib import request as urllib_request

import numpy as np

from .exact_semantic import exact_semantic_search

ComparisonScope = Literal["snapshot_subset", "full_collection"]


@dataclass(frozen=True)
class QdrantScopedSweepPoint:
    hnsw_ef: int
    recall_at_k: float
    mean_latency_ms: float
    p95_latency_ms: float
    result_checksum: str


@dataclass(frozen=True)
class QdrantScopedAnnReceipt:
    schema: str
    comparison_scope: ComparisonScope
    scoped_corpus_count: int
    scoped_corpus_checksum: str
    collection: str
    vector_name: str | None
    canonical_payload_key: str
    metric: str
    k: int
    query_count: int
    minimum_exact_overlap_at_k: float
    pytorch_qdrant_exact_mean_overlap_at_k: float
    pytorch_qdrant_exact_minimum_query_overlap_at_k: float
    exact_alignment_status: str
    exact_mean_latency_ms: float
    exact_p95_latency_ms: float
    exact_result_checksum: str
    sweep: list[QdrantScopedSweepPoint]
    minimum_hnsw_recall_at_k: float
    recommended_hnsw_ef: int | None
    recommendation_status: str
    best_hnsw_recall_at_k: float
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        value = asdict(self)
        value["sweep"] = [asdict(row) for row in self.sweep]
        return value


def _stable_checksum(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _post_json(url: str, payload: dict[str, Any], timeout: float) -> dict[str, Any]:
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    req = urllib_request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    with urllib_request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def build_same_corpus_filter(
    *,
    self_canonical_id: str,
    canonical_payload_key: str,
    comparison_scope: ComparisonScope,
    scoped_canonical_ids: Sequence[str],
) -> dict[str, Any]:
    if comparison_scope not in {"snapshot_subset", "full_collection"}:
        raise ValueError("comparison_scope must be snapshot_subset or full_collection")
    result: dict[str, Any] = {
        "must_not": [{"key": canonical_payload_key, "match": {"value": self_canonical_id}}],
    }
    if comparison_scope == "snapshot_subset":
        if not scoped_canonical_ids:
            raise ValueError("snapshot_subset requires scoped canonical IDs")
        result["must"] = [{
            "key": canonical_payload_key,
            "match": {"any": list(scoped_canonical_ids)},
        }]
    return result


def _query(
    *,
    base_url: str,
    collection: str,
    vector_name: str | None,
    vector: np.ndarray,
    self_canonical_id: str,
    canonical_payload_key: str,
    comparison_scope: ComparisonScope,
    scoped_canonical_ids: Sequence[str],
    k: int,
    exact: bool,
    hnsw_ef: int | None,
    timeout: float,
) -> tuple[list[str], float]:
    params: dict[str, Any] = {"exact": exact}
    if hnsw_ef is not None:
        params["hnsw_ef"] = int(hnsw_ef)
    payload: dict[str, Any] = {
        "query": vector.astype(np.float32, copy=False).tolist(),
        "limit": k,
        "with_payload": [canonical_payload_key],
        "filter": build_same_corpus_filter(
            self_canonical_id=self_canonical_id,
            canonical_payload_key=canonical_payload_key,
            comparison_scope=comparison_scope,
            scoped_canonical_ids=scoped_canonical_ids,
        ),
        "params": params,
    }
    if vector_name:
        payload["using"] = vector_name

    started = time.perf_counter()
    response = _post_json(
        f"{base_url.rstrip('/')}/collections/{collection}/points/query",
        payload,
        timeout,
    )
    elapsed = (time.perf_counter() - started) * 1000.0
    result = response.get("result") or {}
    points = result.get("points") if isinstance(result, dict) else result
    if not isinstance(points, list):
        raise ValueError("Qdrant query response has no result.points list")
    identities: list[str] = []
    for point in points:
        point_payload = point.get("payload") or {}
        identity = point_payload.get(canonical_payload_key)
        if not isinstance(identity, str) or not identity:
            raise ValueError(f"Qdrant point missing payload.{canonical_payload_key}")
        identities.append(identity)
    if len(identities) != k:
        raise ValueError(f"Qdrant returned {len(identities)} rows; expected {k}")
    return identities, elapsed


def evaluate_qdrant_scoped_ann(
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

    mean_exact_overlap = float(np.mean(exact_overlaps))
    min_exact_overlap = float(np.min(exact_overlaps))
    exact_status = "ALIGNED" if mean_exact_overlap >= minimum_exact_overlap else "EXACT_STORE_MISMATCH"

    sweep: list[QdrantScopedSweepPoint] = []
    if exact_status == "ALIGNED":
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
        k=k,
        query_count=len(query_ordinals),
        minimum_exact_overlap_at_k=minimum_exact_overlap,
        pytorch_qdrant_exact_mean_overlap_at_k=mean_exact_overlap,
        pytorch_qdrant_exact_minimum_query_overlap_at_k=min_exact_overlap,
        exact_alignment_status=exact_status,
        exact_mean_latency_ms=float(np.mean(exact_latencies)),
        exact_p95_latency_ms=float(np.percentile(exact_latencies, 95)),
        exact_result_checksum=_stable_checksum(exact_rankings),
        sweep=sweep,
        minimum_hnsw_recall_at_k=minimum_hnsw_recall,
        recommended_hnsw_ef=recommended.hnsw_ef if recommended else None,
        recommendation_status=(
            "ELIGIBLE" if recommended else
            "BLOCKED_EXACT_STORE_MISMATCH" if exact_status != "ALIGNED" else
            "NO_SWEEP_POINT_MEETS_RECALL_FLOOR"
        ),
        best_hnsw_recall_at_k=max((row.recall_at_k for row in sweep), default=0.0),
        canonical_authority=False,
    )
