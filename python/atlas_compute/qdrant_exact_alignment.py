"""Cross-store exact alignment gate for frozen semantic_768 snapshots.

Qdrant exact search is a service-local full-scan oracle for its current
collection. Before using it to judge HNSW, Parent Atlas compares its exact Top-K
against the frozen PyTorch FP32 exact oracle. This detects stale/mismatched
collection revisions that could otherwise make ANN recall look excellent while
searching the wrong corpus.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
import time
from typing import Any, Sequence
from urllib import request as urllib_request

import numpy as np

from .exact_semantic import exact_semantic_search


@dataclass(frozen=True)
class QdrantExactAlignmentReceipt:
    schema: str
    collection: str
    vector_name: str | None
    canonical_payload_key: str
    metric: str
    k: int
    query_count: int
    minimum_overlap_at_k: float
    mean_overlap_at_k: float
    minimum_query_overlap_at_k: float
    exact_mean_latency_ms: float
    exact_p95_latency_ms: float
    pytorch_exact_checksum: str
    qdrant_exact_checksum: str
    status: str
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _stable_checksum(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _post_json(url: str, payload: dict[str, Any], timeout: float) -> dict[str, Any]:
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    request = urllib_request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    with urllib_request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _query_qdrant_exact(
    *,
    base_url: str,
    collection: str,
    vector_name: str | None,
    vector: np.ndarray,
    self_canonical_id: str,
    canonical_payload_key: str,
    k: int,
    timeout: float,
    restrict_to_ids: Sequence[str] | None = None,
) -> tuple[list[str], float]:
    filter_clause: dict[str, Any] = {
        "must_not": [{"key": canonical_payload_key, "match": {"value": self_canonical_id}}],
    }
    if restrict_to_ids is not None:
        # Scopes Qdrant's own exact search to the same sampled corpus subset
        # the sidecar was given — without this, Qdrant searches its full live
        # collection while the sidecar only sees a small inline sample, which
        # is not a same-corpus comparison and would produce misleading overlap.
        filter_clause["must"] = [{"key": canonical_payload_key, "match": {"any": list(restrict_to_ids)}}]
    payload: dict[str, Any] = {
        "query": vector.astype(np.float32, copy=False).tolist(),
        "limit": k,
        "with_payload": [canonical_payload_key],
        "filter": filter_clause,
        "params": {"exact": True},
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
        raise ValueError("Qdrant exact response has no result.points list")
    identities: list[str] = []
    for point in points:
        point_payload = point.get("payload") or {}
        identity = point_payload.get(canonical_payload_key)
        if not isinstance(identity, str) or not identity:
            raise ValueError(f"Qdrant exact point missing payload.{canonical_payload_key}")
        identities.append(identity)
    if len(identities) != k:
        raise ValueError(f"Qdrant exact returned {len(identities)} rows; expected {k}")
    return identities, elapsed


def compare_pytorch_and_qdrant_exact(
    semantic: np.ndarray,
    canonical_ids: Sequence[str],
    query_ordinals: Sequence[int],
    *,
    metric: str,
    k: int,
    qdrant: dict[str, Any],
    torch_device: str = "cpu",
) -> QdrantExactAlignmentReceipt:
    if not query_ordinals:
        raise ValueError("query_ordinals required")
    if not (1 <= k < semantic.shape[0]):
        raise ValueError("self-excluding k must be smaller than corpus rows")
    if len(canonical_ids) != semantic.shape[0]:
        raise ValueError("canonical_ids must align with semantic rows")

    queries = semantic[np.asarray(query_ordinals, dtype=np.int64)]
    pytorch = exact_semantic_search(
        semantic,
        queries,
        canonical_ids,
        metric=metric,
        top_k=min(k + 1, semantic.shape[0]),
        device=torch_device,
    )
    pytorch_rankings: list[list[str]] = []
    for query_index, hits in enumerate(pytorch.hits):
        self_ordinal = int(query_ordinals[query_index])
        ranking = [hit.canonical_id for hit in hits if hit.ordinal != self_ordinal][:k]
        if len(ranking) != k:
            raise RuntimeError("PyTorch exact did not produce enough non-self neighbors")
        pytorch_rankings.append(ranking)

    base_url = str(qdrant.get("url") or "http://127.0.0.1:6333")
    collection = str(qdrant.get("collection") or "")
    if not collection:
        raise ValueError("qdrant.collection is required")
    vector_name_raw = qdrant.get("vector_name")
    vector_name = str(vector_name_raw) if vector_name_raw else None
    payload_key = str(qdrant.get("canonical_payload_key") or "canonical_id")
    timeout = float(qdrant.get("timeout_seconds") or 15.0)
    minimum_overlap = float(qdrant.get("minimum_exact_overlap_at_k") or 0.95)
    if not 0.0 <= minimum_overlap <= 1.0:
        raise ValueError("minimum_exact_overlap_at_k must be in [0,1]")

    qdrant_rankings: list[list[str]] = []
    latencies: list[float] = []
    overlaps: list[float] = []
    for query_index, ordinal in enumerate(query_ordinals):
        ranking, latency = _query_qdrant_exact(
            base_url=base_url,
            collection=collection,
            vector_name=vector_name,
            vector=semantic[int(ordinal)],
            self_canonical_id=str(canonical_ids[int(ordinal)]),
            canonical_payload_key=payload_key,
            k=k,
            timeout=timeout,
        )
        qdrant_rankings.append(ranking)
        latencies.append(latency)
        overlaps.append(len(set(ranking) & set(pytorch_rankings[query_index])) / float(k))

    mean_overlap = float(np.mean(overlaps))
    minimum_query_overlap = float(np.min(overlaps))
    status = "ALIGNED" if mean_overlap >= minimum_overlap else "EXACT_STORE_MISMATCH"
    return QdrantExactAlignmentReceipt(
        schema="atlas.qdrant-exact-alignment-receipt.v1",
        collection=collection,
        vector_name=vector_name,
        canonical_payload_key=payload_key,
        metric=metric,
        k=k,
        query_count=len(query_ordinals),
        minimum_overlap_at_k=minimum_overlap,
        mean_overlap_at_k=mean_overlap,
        minimum_query_overlap_at_k=minimum_query_overlap,
        exact_mean_latency_ms=float(np.mean(latencies)),
        exact_p95_latency_ms=float(np.percentile(latencies, 95)),
        pytorch_exact_checksum=_stable_checksum(pytorch_rankings),
        qdrant_exact_checksum=_stable_checksum(qdrant_rankings),
        status=status,
        canonical_authority=False,
    )


# ── Sidecar (python/atlas_rapids_sidecar.py, live :8098 HTTP service) vs
# Qdrant exact-store alignment. Distinct from compare_pytorch_and_qdrant_exact
# above: that function proves the cuVS *algorithm* (run in-process) agrees
# with Qdrant; this one proves the *HTTP service boundary* — the actual
# request/response contract a real caller hits — agrees with Qdrant, on a
# real live corpus sample fetched directly from the collection rather than a
# frozen snapshot file.


def _fetch_qdrant_corpus_sample(
    *,
    base_url: str,
    collection: str,
    vector_name: str | None,
    canonical_payload_key: str,
    limit: int,
    timeout: float,
) -> tuple[np.ndarray, list[str]]:
    payload: dict[str, Any] = {
        "limit": limit,
        "with_payload": [canonical_payload_key],
        "with_vector": [vector_name] if vector_name else True,
    }
    response = _post_json(
        f"{base_url.rstrip('/')}/collections/{collection}/points/scroll",
        payload,
        timeout,
    )
    points = response.get("result", {}).get("points")
    if not isinstance(points, list):
        raise ValueError("Qdrant scroll response has no result.points list")

    vectors: list[list[float]] = []
    ids: list[str] = []
    for point in points:
        raw_vector = point.get("vector")
        if isinstance(raw_vector, dict):
            raw_vector = raw_vector.get(vector_name) if vector_name else None
        if not isinstance(raw_vector, list):
            raise ValueError("Qdrant scroll point missing vector")
        point_payload = point.get("payload") or {}
        identity = point_payload.get(canonical_payload_key)
        if not isinstance(identity, str) or not identity:
            raise ValueError(f"Qdrant scroll point missing payload.{canonical_payload_key}")
        vectors.append(raw_vector)
        ids.append(identity)

    return np.asarray(vectors, dtype=np.float32), ids


def _query_sidecar_knn_exact(
    *,
    sidecar_url: str,
    vector: np.ndarray,
    representation_id: str,
    dimension: int,
    corpus_vectors: np.ndarray,
    corpus_ids: Sequence[str],
    k: int,
    timeout: float,
) -> tuple[list[str], float]:
    payload = {
        "query": {
            "vector": vector.astype(np.float32, copy=False).tolist(),
            "representationId": representation_id,
            "dimension": dimension,
        },
        "corpus": [
            {
                "packetKey": corpus_id,
                "sourceRevision": "sidecar-qdrant-oracle-comparison",
                "vector": vec.astype(np.float32, copy=False).tolist(),
            }
            for corpus_id, vec in zip(corpus_ids, corpus_vectors)
        ],
        "topK": k,
    }
    started = time.perf_counter()
    response = _post_json(f"{sidecar_url.rstrip('/')}/v1/knn/exact", payload, timeout)
    elapsed = (time.perf_counter() - started) * 1000.0
    results = response.get("results")
    if not isinstance(results, list) or len(results) != k:
        got = len(results) if isinstance(results, list) else results
        raise ValueError(f"sidecar exact-KNN returned {got!r} rows; expected {k}")
    ranking = [str(row["packetKey"]) for row in results]
    return ranking, elapsed


@dataclass(frozen=True)
class SidecarQdrantAlignmentReceipt:
    schema: str
    collection: str
    vector_name: str | None
    canonical_payload_key: str
    sidecar_url: str
    representation_id: str
    dimension: int
    k: int
    corpus_sample_rows: int
    query_count: int
    minimum_overlap_at_k: float
    mean_overlap_at_k: float
    minimum_query_overlap_at_k: float
    sidecar_mean_latency_ms: float
    qdrant_mean_latency_ms: float
    sidecar_result_checksum: str
    qdrant_result_checksum: str
    status: str
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def compare_sidecar_and_qdrant_exact(
    *,
    base_url: str,
    collection: str,
    vector_name: str | None,
    canonical_payload_key: str,
    sidecar_url: str,
    representation_id: str,
    dimension: int,
    k: int,
    corpus_sample_rows: int,
    query_count: int,
    timeout: float = 15.0,
    minimum_overlap: float = 0.95,
) -> SidecarQdrantAlignmentReceipt:
    if not 0.0 <= minimum_overlap <= 1.0:
        raise ValueError("minimum_overlap must be in [0,1]")
    if query_count <= 0 or query_count > corpus_sample_rows:
        raise ValueError("query_count must be in [1, corpus_sample_rows]")
    if not (1 <= k < corpus_sample_rows):
        raise ValueError("self-excluding k must be smaller than corpus_sample_rows")

    corpus_vectors, corpus_ids = _fetch_qdrant_corpus_sample(
        base_url=base_url,
        collection=collection,
        vector_name=vector_name,
        canonical_payload_key=canonical_payload_key,
        limit=corpus_sample_rows,
        timeout=timeout,
    )
    if len(corpus_ids) != corpus_sample_rows:
        raise ValueError(f"Qdrant scroll returned {len(corpus_ids)} rows; expected {corpus_sample_rows}")
    if len(set(corpus_ids)) != len(corpus_ids):
        raise ValueError("duplicate canonical_id in sampled corpus — sample is not a valid identity set")
    if corpus_vectors.shape[1] != dimension:
        raise ValueError(f"sampled corpus vectors are {corpus_vectors.shape[1]}-dim, expected {dimension}")

    sidecar_rankings: list[list[str]] = []
    qdrant_rankings: list[list[str]] = []
    sidecar_latencies: list[float] = []
    qdrant_latencies: list[float] = []
    overlaps: list[float] = []

    for query_index in range(query_count):
        self_id = corpus_ids[query_index]
        query_vector = corpus_vectors[query_index]
        # Self-excluding: drop the query row from the corpus sent to the
        # sidecar (mirrors Qdrant's must_not self-exclusion filter below).
        remaining_ids = corpus_ids[:query_index] + corpus_ids[query_index + 1 :]
        remaining_vectors = np.concatenate(
            [corpus_vectors[:query_index], corpus_vectors[query_index + 1 :]], axis=0
        )

        sidecar_ranking, sidecar_latency = _query_sidecar_knn_exact(
            sidecar_url=sidecar_url,
            vector=query_vector,
            representation_id=representation_id,
            dimension=dimension,
            corpus_vectors=remaining_vectors,
            corpus_ids=remaining_ids,
            k=k,
            timeout=timeout,
        )
        qdrant_ranking, qdrant_latency = _query_qdrant_exact(
            base_url=base_url,
            collection=collection,
            vector_name=vector_name,
            vector=query_vector,
            self_canonical_id=self_id,
            canonical_payload_key=canonical_payload_key,
            k=k,
            timeout=timeout,
            restrict_to_ids=remaining_ids,
        )

        sidecar_rankings.append(sidecar_ranking)
        qdrant_rankings.append(qdrant_ranking)
        sidecar_latencies.append(sidecar_latency)
        qdrant_latencies.append(qdrant_latency)
        overlaps.append(len(set(sidecar_ranking) & set(qdrant_ranking)) / float(k))

    mean_overlap = float(np.mean(overlaps))
    minimum_query_overlap = float(np.min(overlaps))
    status = "ALIGNED" if mean_overlap >= minimum_overlap else "SIDECAR_QDRANT_MISMATCH"

    return SidecarQdrantAlignmentReceipt(
        schema="atlas.sidecar-qdrant-exact-alignment-receipt.v1",
        collection=collection,
        vector_name=vector_name,
        canonical_payload_key=canonical_payload_key,
        sidecar_url=sidecar_url,
        representation_id=representation_id,
        dimension=dimension,
        k=k,
        corpus_sample_rows=corpus_sample_rows,
        query_count=query_count,
        minimum_overlap_at_k=minimum_overlap,
        mean_overlap_at_k=mean_overlap,
        minimum_query_overlap_at_k=minimum_query_overlap,
        sidecar_mean_latency_ms=float(np.mean(sidecar_latencies)),
        qdrant_mean_latency_ms=float(np.mean(qdrant_latencies)),
        sidecar_result_checksum=_stable_checksum(sidecar_rankings),
        qdrant_result_checksum=_stable_checksum(qdrant_rankings),
        status=status,
        canonical_authority=False,
    )
