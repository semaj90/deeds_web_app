"""One frozen Parent Atlas aligned-snapshot experiment.

The experiment consumes ONE semantic_768 snapshot and optional N-ary/context
fixtures. It never mutates canonical state. Every derived block is aligned by the
same frozen canonical row order and emitted with checksums/measurements.

Stages:
- deterministic PyTorch exact semantic Top-K reference (self excluded)
- optional cuVS exact vs CAGRA Recall@K
- optional Qdrant exact vs HNSW ef sweep using the same query vectors
- cuVS soft KMeans + replay stability/entropy
- deterministic SOM + semantic-neighborhood preservation
- binary N-ary incidence + sparse softmax + sparse/dense propagation latency
- ordered sliding-window contextualization + optional retrieval lift
- optional N-ary relationship Recall/MRR when relevance labels are supplied
- FeatureMatrixAlignment receipt/checksum over row-aligned derived blocks

GPU/service stages fail independently and remain visible as SKIPPED/ERROR instead
of invalidating the CPU identity/alignment proof.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
import math
from pathlib import Path
import time
from typing import Any, Iterable, Literal, Sequence
from urllib import request as urllib_request
from urllib.error import URLError, HTTPError

import numpy as np

from .ann_compare import compare_cuvs_exact_and_cagra
from .cluster_softmax import run_cuvs_soft_kmeans
from .contextual_windows import contextualize_sliding_windows
from .exact_semantic import exact_semantic_search
from .feature_alignment import make_feature_block, align_feature_blocks
from .semantic_snapshot_freeze import load_and_verify_frozen_snapshot
from .som import train_deterministic_som
from .sparse_relations import build_binary_incidence, sparse_relation_softmax, sparse_relation_spmm


Metric = Literal["cosine", "inner_product", "sqeuclidean"]


@dataclass(frozen=True)
class StageStatus:
    status: Literal["PASS", "SKIPPED", "ERROR", "NOT_EVALUATED_NO_RELEVANCE_LABELS"]
    reason: str | None
    receipt: dict[str, Any] | None


@dataclass(frozen=True)
class RetrievalMetric:
    recall_at_k: float
    mrr_at_k: float
    query_count: int


@dataclass(frozen=True)
class SparseDenseBenchmark:
    rows: int
    relationship_count: int
    feature_dimensions: int
    nnz: int
    density: float
    row_nnz_mean: float
    row_nnz_std: float
    row_nnz_max: int
    sparse_mean_ms: float
    dense_mean_ms: float
    sparse_output_checksum: str
    dense_output_checksum: str
    max_abs_parity_error: float


@dataclass(frozen=True)
class AlignedSnapshotExperimentReceipt:
    schema: str
    experiment_revision: str
    semantic_snapshot_revision: str
    representation_revision: str
    row_identity_checksum: str
    semantic_tensor_checksum: str
    row_count: int
    dimensions: int
    metric: str
    k: int
    query_ordinals: list[int]
    query_canonical_ids: list[str]
    exact_semantic_result_checksum: str
    exact_self_exclusion: bool
    stages: dict[str, dict[str, Any]]
    cluster_entropy: float | None
    cluster_replay_stability: float | None
    som_quantization_error: float | None
    som_neighborhood_overlap_at_k: float | None
    sparse_dense: dict[str, Any] | None
    context_retrieval: dict[str, Any]
    nary_retrieval: dict[str, Any]
    aligned_feature_matrix_checksum: str
    aligned_feature_row_identity_checksum: str
    aligned_feature_columns: int
    output_checksum: str
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _stable_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _checksum_array(value: np.ndarray) -> str:
    return _sha256_bytes(np.ascontiguousarray(value).tobytes(order="C"))


def _canonical_ids(manifest: dict[str, Any]) -> list[str]:
    rows = manifest.get("rows") or []
    ids = [str(row.get("canonical_id")) for row in rows]
    if len(ids) != manifest.get("row_count") or any(not value for value in ids):
        raise ValueError("frozen semantic manifest rows/canonical IDs are invalid")
    if len(set(ids)) != len(ids):
        raise ValueError("frozen semantic manifest canonical IDs must be unique")
    return ids


def _filter_exact_hits(receipt: Any, query_ordinals: Sequence[int], k: int) -> list[list[int]]:
    output: list[list[int]] = []
    for query_index, hits in enumerate(receipt.hits):
        self_ordinal = int(query_ordinals[query_index])
        filtered = [int(hit.ordinal) for hit in hits if int(hit.ordinal) != self_ordinal]
        if len(filtered) < k:
            raise RuntimeError("exact semantic search did not produce enough non-self hits")
        output.append(filtered[:k])
    return output


def _neighbor_overlap(reference: Sequence[Sequence[int]], challenger: Sequence[Sequence[int]], k: int) -> float:
    if len(reference) != len(challenger) or not reference:
        return 0.0
    values = [len(set(a[:k]) & set(b[:k])) / float(k) for a, b in zip(reference, challenger, strict=True)]
    return float(np.mean(values))


def _rank_by_distance(matrix: np.ndarray, query_ordinals: Sequence[int], k: int) -> list[list[int]]:
    order_ids = np.arange(matrix.shape[0], dtype=np.int64)
    output: list[list[int]] = []
    for ordinal in query_ordinals:
        delta = matrix - matrix[int(ordinal)]
        distances = np.sum(delta * delta, axis=1, dtype=np.float64)
        ordering = np.lexsort((order_ids, distances))
        selected = [int(value) for value in ordering.tolist() if int(value) != int(ordinal)][:k]
        output.append(selected)
    return output


def _retrieval_metric(
    rankings: Sequence[Sequence[str]],
    query_ids: Sequence[str],
    relevance: dict[str, set[str]],
    k: int,
) -> RetrievalMetric:
    recalls: list[float] = []
    reciprocal: list[float] = []
    evaluated = 0
    for query_id, ranking in zip(query_ids, rankings, strict=True):
        truth = relevance.get(query_id)
        if not truth:
            continue
        evaluated += 1
        top = list(ranking[:k])
        recalls.append(len(set(top) & truth) / float(len(truth)))
        rr = 0.0
        for rank, candidate in enumerate(top, start=1):
            if candidate in truth:
                rr = 1.0 / rank
                break
        reciprocal.append(rr)
    return RetrievalMetric(
        recall_at_k=float(np.mean(recalls)) if recalls else 0.0,
        mrr_at_k=float(np.mean(reciprocal)) if reciprocal else 0.0,
        query_count=evaluated,
    )


def _load_relevance(value: Any) -> dict[str, set[str]]:
    if not isinstance(value, dict):
        return {}
    return {
        str(query): {str(item) for item in items}
        for query, items in value.items()
        if isinstance(items, list)
    }


def _timed(fn: Any, *, warmup: int = 2, repeats: int = 10) -> tuple[Any, float]:
    result = None
    for _ in range(warmup):
        result = fn()
    samples: list[float] = []
    for _ in range(repeats):
        started = time.perf_counter()
        result = fn()
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.synchronize()
        except Exception:
            pass
        samples.append((time.perf_counter() - started) * 1000.0)
    return result, float(np.mean(samples))


def _build_relation_snapshot(
    canonical_ids: Sequence[str],
    semantic: np.ndarray,
    nary: dict[str, Any],
) -> tuple[list[str], list[tuple[str, str]], np.ndarray]:
    relationships = nary.get("relationships") if isinstance(nary, dict) else None
    if not isinstance(relationships, list) or not relationships:
        raise ValueError("nary.relationships must be a non-empty list")
    row_index = {value: index for index, value in enumerate(canonical_ids)}
    relationship_ids: list[str] = []
    edges: list[tuple[str, str]] = []
    relation_features: list[np.ndarray] = []
    seen: set[str] = set()
    for relation in relationships:
        relationship_id = str(relation.get("relationship_id") or "")
        participants = [str(value) for value in relation.get("participant_ids") or []]
        if not relationship_id or relationship_id in seen:
            raise ValueError("relationship_id must be non-empty and unique")
        if len(participants) < 1 or any(value not in row_index for value in participants):
            raise ValueError(f"relationship {relationship_id} has unknown/empty participants")
        seen.add(relationship_id)
        relationship_ids.append(relationship_id)
        for participant in sorted(set(participants)):
            edges.append((participant, relationship_id))
        ordinals = np.asarray([row_index[value] for value in sorted(set(participants))], dtype=np.int64)
        relation_features.append(np.mean(semantic[ordinals], axis=0, dtype=np.float32))
    return relationship_ids, edges, np.ascontiguousarray(np.stack(relation_features), dtype=np.float32)


def _benchmark_sparse_dense(
    incidence: Any,
    relation_features: np.ndarray,
    *,
    repeats: int = 10,
) -> SparseDenseBenchmark:
    import torch

    relation = incidence.coalesce()
    features = torch.as_tensor(relation_features, dtype=torch.float32, device=relation.device)
    dense_relation = relation.to_dense()
    row_nnz = np.bincount(
        relation.indices()[0].detach().cpu().numpy(), minlength=int(relation.shape[0]),
    ).astype(np.int64, copy=False)

    sparse_output, sparse_ms = _timed(lambda: torch.sparse.mm(relation, features), repeats=repeats)
    dense_output, dense_ms = _timed(lambda: dense_relation @ features, repeats=repeats)
    sparse_host = sparse_output.detach().cpu().numpy().astype(np.float32, copy=False)
    dense_host = dense_output.detach().cpu().numpy().astype(np.float32, copy=False)
    error = float(np.max(np.abs(sparse_host - dense_host))) if sparse_host.size else 0.0
    cells = int(relation.shape[0] * relation.shape[1])
    return SparseDenseBenchmark(
        rows=int(relation.shape[0]),
        relationship_count=int(relation.shape[1]),
        feature_dimensions=int(features.shape[1]),
        nnz=int(relation._nnz()),
        density=float(relation._nnz() / cells) if cells else 0.0,
        row_nnz_mean=float(np.mean(row_nnz)) if row_nnz.size else 0.0,
        row_nnz_std=float(np.std(row_nnz)) if row_nnz.size else 0.0,
        row_nnz_max=int(np.max(row_nnz)) if row_nnz.size else 0,
        sparse_mean_ms=sparse_ms,
        dense_mean_ms=dense_ms,
        sparse_output_checksum=_checksum_array(sparse_host),
        dense_output_checksum=_checksum_array(dense_host),
        max_abs_parity_error=error,
    )


def _http_json(url: str, payload: dict[str, Any], timeout: float) -> dict[str, Any]:
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    req = urllib_request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    with urllib_request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _qdrant_query(
    *,
    base_url: str,
    collection: str,
    vector_name: str | None,
    vector: Sequence[float],
    canonical_id: str,
    canonical_payload_key: str,
    k: int,
    exact: bool,
    hnsw_ef: int | None,
    timeout: float,
) -> tuple[list[str], float]:
    payload: dict[str, Any] = {
        "query": list(map(float, vector)),
        "limit": k,
        "with_payload": [canonical_payload_key],
        "filter": {
            "must_not": [{"key": canonical_payload_key, "match": {"value": canonical_id}}],
        },
        "params": {"exact": exact},
    }
    if vector_name:
        payload["using"] = vector_name
    if hnsw_ef is not None:
        payload["params"]["hnsw_ef"] = int(hnsw_ef)
    started = time.perf_counter()
    response = _http_json(
        f"{base_url.rstrip('/')}/collections/{collection}/points/query",
        payload,
        timeout,
    )
    elapsed = (time.perf_counter() - started) * 1000.0
    result = response.get("result") or {}
    points = result.get("points") if isinstance(result, dict) else result
    if not isinstance(points, list):
        raise ValueError("Qdrant query response has no result.points list")
    ids: list[str] = []
    for point in points:
        payload_value = point.get("payload") or {}
        identity = payload_value.get(canonical_payload_key)
        if not isinstance(identity, str) or not identity:
            raise ValueError(f"Qdrant point missing payload.{canonical_payload_key}")
        ids.append(identity)
    return ids, elapsed


def _run_qdrant_sweep(
    semantic: np.ndarray,
    canonical_ids: Sequence[str],
    query_ordinals: Sequence[int],
    *,
    config: dict[str, Any],
    k: int,
) -> dict[str, Any]:
    base_url = str(config.get("url") or "http://127.0.0.1:6333")
    collection = str(config.get("collection") or "")
    if not collection:
        raise ValueError("qdrant.collection is required")
    vector_name = config.get("vector_name")
    payload_key = str(config.get("canonical_payload_key") or "canonical_id")
    ef_values = [int(value) for value in config.get("hnsw_ef") or [32, 64, 128, 256]]
    timeout = float(config.get("timeout_seconds") or 15.0)

    exact_rankings: list[list[str]] = []
    exact_latencies: list[float] = []
    for ordinal in query_ordinals:
        ranking, latency = _qdrant_query(
            base_url=base_url,
            collection=collection,
            vector_name=str(vector_name) if vector_name else None,
            vector=semantic[int(ordinal)],
            canonical_id=canonical_ids[int(ordinal)],
            canonical_payload_key=payload_key,
            k=k,
            exact=True,
            hnsw_ef=None,
            timeout=timeout,
        )
        exact_rankings.append(ranking)
        exact_latencies.append(latency)

    sweep: list[dict[str, Any]] = []
    for ef in ef_values:
        recalls: list[float] = []
        latencies: list[float] = []
        checksum_rows: list[str] = []
        for query_index, ordinal in enumerate(query_ordinals):
            ranking, latency = _qdrant_query(
                base_url=base_url,
                collection=collection,
                vector_name=str(vector_name) if vector_name else None,
                vector=semantic[int(ordinal)],
                canonical_id=canonical_ids[int(ordinal)],
                canonical_payload_key=payload_key,
                k=k,
                exact=False,
                hnsw_ef=ef,
                timeout=timeout,
            )
            recalls.append(len(set(ranking) & set(exact_rankings[query_index])) / float(k))
            latencies.append(latency)
            checksum_rows.append(f"{query_index}:{'|'.join(ranking)}")
        sweep.append({
            "hnsw_ef": ef,
            "recall_at_k": float(np.mean(recalls)),
            "mean_latency_ms": float(np.mean(latencies)),
            "p95_latency_ms": float(np.percentile(latencies, 95)),
            "result_checksum": _sha256_bytes("\n".join(checksum_rows).encode("utf-8")),
        })
    return {
        "exact_mean_latency_ms": float(np.mean(exact_latencies)),
        "exact_p95_latency_ms": float(np.percentile(exact_latencies, 95)),
        "exact_result_checksum": _sha256_bytes(_stable_json(exact_rankings)),
        "sweep": sweep,
    }


def run_aligned_snapshot_experiment(
    *,
    semantic_manifest_path: str | Path,
    experiment_spec_path: str | Path,
    output_path: str | Path,
) -> AlignedSnapshotExperimentReceipt:
    semantic, semantic_manifest = load_and_verify_frozen_snapshot(semantic_manifest_path)
    spec = json.loads(Path(experiment_spec_path).read_text(encoding="utf-8"))
    canonical_ids = _canonical_ids(semantic_manifest)
    row_index = {value: index for index, value in enumerate(canonical_ids)}

    experiment_revision = str(spec.get("experiment_revision") or "")
    if not experiment_revision:
        raise ValueError("experiment_revision is required")
    metric: Metric = str(spec.get("metric") or "cosine")  # type: ignore[assignment]
    if metric not in {"cosine", "inner_product", "sqeuclidean"}:
        raise ValueError("metric must be cosine, inner_product, or sqeuclidean")
    k = int(spec.get("k") or 10)
    if not (1 <= k < semantic.shape[0]):
        raise ValueError("k must be >=1 and smaller than semantic row count")

    query_ids = [str(value) for value in spec.get("query_canonical_ids") or canonical_ids[: min(32, len(canonical_ids))]]
    if not query_ids or any(value not in row_index for value in query_ids):
        raise ValueError("query_canonical_ids must be non-empty canonical IDs from the frozen snapshot")
    query_ordinals = [row_index[value] for value in query_ids]
    queries = semantic[np.asarray(query_ordinals, dtype=np.int64)]

    # Search k+1 so each in-corpus query can exclude itself deterministically.
    exact = exact_semantic_search(
        semantic,
        queries,
        canonical_ids,
        metric=metric,
        top_k=min(k + 1, semantic.shape[0]),
        device=str(spec.get("torch_device") or "cpu"),
    )
    exact_ordinals = _filter_exact_hits(exact, query_ordinals, k)
    exact_rankings = [[canonical_ids[value] for value in row] for row in exact_ordinals]

    stages: dict[str, dict[str, Any]] = {
        "exact_semantic": asdict(StageStatus("PASS", None, exact.to_dict())),
    }

    # cuVS/CAGRA is optional but consumes exactly the same corpus/query bytes.
    if bool(spec.get("enable_cuvs", True)):
        try:
            ann = compare_cuvs_exact_and_cagra(
                semantic,
                queries,
                metric=metric,
                k=k,
                query_corpus_ordinals=query_ordinals,
                graph_degree=int(spec.get("cagra_graph_degree") or 64),
                intermediate_graph_degree=int(spec.get("cagra_intermediate_graph_degree") or 128),
                build_algo=str(spec.get("cagra_build_algo") or "ivf_pq"),
                search_width=int(spec.get("cagra_search_width") or 1),
                itopk_size=int(spec.get("cagra_itopk_size") or max(64, k + 1)),
            )
            stages["cuvs_cagra"] = asdict(StageStatus("PASS", None, ann.to_dict()))
        except Exception as error:
            stages["cuvs_cagra"] = asdict(StageStatus("ERROR", f"{type(error).__name__}:{error}", None))
    else:
        stages["cuvs_cagra"] = asdict(StageStatus("SKIPPED", "disabled by experiment spec", None))

    qdrant_config = spec.get("qdrant")
    if isinstance(qdrant_config, dict) and qdrant_config.get("enabled", False):
        try:
            qdrant = _run_qdrant_sweep(
                semantic, canonical_ids, query_ordinals, config=qdrant_config, k=k,
            )
            stages["qdrant_hnsw"] = asdict(StageStatus("PASS", None, qdrant))
        except (URLError, HTTPError, OSError, ValueError) as error:
            stages["qdrant_hnsw"] = asdict(StageStatus("ERROR", f"{type(error).__name__}:{error}", None))
    else:
        stages["qdrant_hnsw"] = asdict(StageStatus("SKIPPED", "qdrant stage not enabled", None))

    feature_blocks = []

    # Semantic block: row-wise L2 normalization for aligned multi-signal geometry.
    norms = np.linalg.norm(semantic.astype(np.float64), axis=1, keepdims=True)
    semantic_l2 = (semantic / np.maximum(norms, 1e-12)).astype(np.float32)
    feature_blocks.append(make_feature_block(
        block_id="semantic_l2",
        revision=str(semantic_manifest["representation_revision"]),
        canonical_ids=canonical_ids,
        values=semantic_l2,
        column_names=[f"semantic_{index}" for index in range(semantic_l2.shape[1])],
        normalizations=["none"] * semantic_l2.shape[1],
    ))

    cluster_entropy: float | None = None
    cluster_stability: float | None = None
    if bool(spec.get("enable_kmeans", True)):
        try:
            clusters = int(spec.get("kmeans_clusters") or min(20, max(2, int(round(math.sqrt(len(canonical_ids)))))))
            labels1, _centroids1, probabilities1, receipt1 = run_cuvs_soft_kmeans(
                semantic,
                n_clusters=clusters,
                temperature=float(spec.get("kmeans_temperature") or 1.0),
                input_normalization="l2_row",
                device=str(spec.get("torch_device") or "cpu"),
            )
            labels2, _centroids2, probabilities2, receipt2 = run_cuvs_soft_kmeans(
                semantic,
                n_clusters=clusters,
                temperature=float(spec.get("kmeans_temperature") or 1.0),
                input_normalization="l2_row",
                device=str(spec.get("torch_device") or "cpu"),
            )
            cluster_stability = float(np.mean(labels1 == labels2))
            cluster_entropy = receipt1.mean_assignment_entropy
            feature_blocks.append(make_feature_block(
                block_id="soft_kmeans",
                revision=experiment_revision,
                canonical_ids=canonical_ids,
                values=probabilities1,
                column_names=[f"cluster_{index}_probability" for index in range(probabilities1.shape[1])],
                normalizations=["none"] * probabilities1.shape[1],
            ))
            stages["soft_kmeans"] = asdict(StageStatus("PASS", None, {
                "first": receipt1.to_dict(),
                "replay": receipt2.to_dict(),
                "replay_label_agreement": cluster_stability,
                "probability_replay_max_abs_error": float(np.max(np.abs(probabilities1 - probabilities2))),
            }))
        except Exception as error:
            stages["soft_kmeans"] = asdict(StageStatus("ERROR", f"{type(error).__name__}:{error}", None))
    else:
        stages["soft_kmeans"] = asdict(StageStatus("SKIPPED", "disabled by experiment spec", None))

    som_quantization: float | None = None
    som_overlap: float | None = None
    if bool(spec.get("enable_som", True)):
        try:
            grid_rows = int(spec.get("som_grid_rows") or max(2, int(round(math.sqrt(math.sqrt(len(canonical_ids)))))))
            grid_columns = int(spec.get("som_grid_columns") or grid_rows)
            coords, _codebook, som_receipt = train_deterministic_som(
                semantic_l2,
                grid_rows=grid_rows,
                grid_columns=grid_columns,
                epochs=int(spec.get("som_epochs") or 20),
                device=str(spec.get("torch_device") or "cpu"),
            )
            coords_host = coords.detach().cpu().numpy().astype(np.float32, copy=False)
            som_neighbors = _rank_by_distance(coords_host, query_ordinals, k)
            som_overlap = _neighbor_overlap(exact_ordinals, som_neighbors, k)
            som_quantization = som_receipt.quantization_error
            feature_blocks.append(make_feature_block(
                block_id="som_coordinates",
                revision=experiment_revision,
                canonical_ids=canonical_ids,
                values=coords_host,
                column_names=["som_y", "som_x"],
                normalizations=["minmax", "minmax"],
            ))
            stages["som"] = asdict(StageStatus("PASS", None, {
                **som_receipt.to_dict(),
                "semantic_neighborhood_overlap_at_k": som_overlap,
            }))
        except Exception as error:
            stages["som"] = asdict(StageStatus("ERROR", f"{type(error).__name__}:{error}", None))
    else:
        stages["som"] = asdict(StageStatus("SKIPPED", "disabled by experiment spec", None))

    sparse_dense_result: SparseDenseBenchmark | None = None
    nary_rankings: list[list[str]] | None = None
    nary_config = spec.get("nary")
    if isinstance(nary_config, dict) and nary_config.get("relationships"):
        try:
            relationship_ids, edges, relation_features = _build_relation_snapshot(canonical_ids, semantic_l2, nary_config)
            incidence, incidence_receipt = build_binary_incidence(
                canonical_ids,
                relationship_ids,
                edges,
                device=str(spec.get("torch_device") or "cpu"),
            )
            weighted, softmax_receipt = sparse_relation_softmax(
                incidence,
                dim=1,
                temperature=float(nary_config.get("temperature") or 1.0),
            )
            propagated, propagation_receipt = sparse_relation_spmm(weighted, relation_features)
            propagated_host = propagated.detach().cpu().numpy().astype(np.float32, copy=False)
            sparse_dense_result = _benchmark_sparse_dense(
                incidence,
                relation_features,
                repeats=int(spec.get("benchmark_repeats") or 10),
            )
            feature_blocks.append(make_feature_block(
                block_id="nary_propagated",
                revision=str(nary_config.get("snapshot_revision") or experiment_revision),
                canonical_ids=canonical_ids,
                values=propagated_host,
                column_names=[f"nary_context_{index}" for index in range(propagated_host.shape[1])],
                normalizations=["zscore"] * propagated_host.shape[1],
            ))
            dense_weights = weighted.to_dense().detach().cpu().numpy()
            nary_rankings = [
                [relationship_ids[index] for index in np.lexsort((np.arange(len(relationship_ids)), -dense_weights[row])).tolist() if dense_weights[row, index] > 0]
                for row in query_ordinals
            ]
            stages["nary_sparse"] = asdict(StageStatus("PASS", None, {
                "incidence": incidence_receipt.to_dict(),
                "softmax": softmax_receipt.to_dict(),
                "propagation": propagation_receipt.to_dict(),
                "sparse_dense_benchmark": asdict(sparse_dense_result),
            }))
        except Exception as error:
            stages["nary_sparse"] = asdict(StageStatus("ERROR", f"{type(error).__name__}:{error}", None))
    else:
        stages["nary_sparse"] = asdict(StageStatus("SKIPPED", "nary relationships not supplied", None))

    # Ordered contextual projection. Row order comes from the frozen semantic snapshot.
    context, context_masks, context_receipt = contextualize_sliding_windows(
        semantic_l2,
        window_size=int(spec.get("context_window_size") or 9),
        stride=1,
        causal=bool(spec.get("context_causal", False)),
        similarity="cosine",
        temperature=float(spec.get("context_temperature") or 1.0),
        device=str(spec.get("torch_device") or "cpu"),
    )
    context_host = context.detach().cpu().numpy().astype(np.float32, copy=False)
    feature_blocks.append(make_feature_block(
        block_id="context_window",
        revision=experiment_revision,
        canonical_ids=canonical_ids,
        values=context_host,
        column_names=[f"context_{index}" for index in range(context_host.shape[1])],
        normalizations=["zscore"] * context_host.shape[1],
    ))
    stages["context_window"] = asdict(StageStatus("PASS", None, {
        **context_receipt.to_dict(),
        "mask_checksum": _checksum_array(context_masks),
    }))

    relevance = _load_relevance(spec.get("relevance"))
    if relevance:
        base_metric = _retrieval_metric(exact_rankings, query_ids, relevance, k)
        context_exact = exact_semantic_search(
            context_host,
            context_host[np.asarray(query_ordinals, dtype=np.int64)],
            canonical_ids,
            metric="cosine",
            top_k=min(k + 1, context_host.shape[0]),
            device=str(spec.get("torch_device") or "cpu"),
        )
        context_ordinals = _filter_exact_hits(context_exact, query_ordinals, k)
        context_rankings = [[canonical_ids[value] for value in row] for row in context_ordinals]
        context_metric = _retrieval_metric(context_rankings, query_ids, relevance, k)
        context_retrieval: dict[str, Any] = {
            "status": "PASS",
            "baseline": asdict(base_metric),
            "contextual": asdict(context_metric),
            "recall_lift": context_metric.recall_at_k - base_metric.recall_at_k,
            "mrr_lift": context_metric.mrr_at_k - base_metric.mrr_at_k,
        }
    else:
        context_retrieval = {
            "status": "NOT_EVALUATED_NO_RELEVANCE_LABELS",
            "reason": "provide spec.relevance[query_canonical_id]=[relevant_canonical_ids...]",
        }

    nary_relevance = _load_relevance(spec.get("nary_relevance"))
    if nary_relevance and nary_rankings is not None:
        nary_metric = _retrieval_metric(nary_rankings, query_ids, nary_relevance, k)
        nary_retrieval: dict[str, Any] = {"status": "PASS", **asdict(nary_metric)}
    else:
        nary_retrieval = {
            "status": "NOT_EVALUATED_NO_RELEVANCE_LABELS" if nary_rankings is not None else "SKIPPED",
            "reason": "provide spec.nary_relevance or nary relationships",
        }

    aligned, alignment_receipt = align_feature_blocks(feature_blocks)

    receipt_without_checksum = {
        "schema": "atlas.aligned-snapshot-experiment.v1",
        "experiment_revision": experiment_revision,
        "semantic_snapshot_revision": str(semantic_manifest["snapshot_revision"]),
        "representation_revision": str(semantic_manifest["representation_revision"]),
        "row_identity_checksum": str(semantic_manifest["row_identity_checksum"]),
        "semantic_tensor_checksum": str(semantic_manifest["tensor_checksum"]),
        "row_count": int(semantic.shape[0]),
        "dimensions": int(semantic.shape[1]),
        "metric": metric,
        "k": k,
        "query_ordinals": query_ordinals,
        "query_canonical_ids": query_ids,
        "exact_semantic_result_checksum": exact.result_checksum,
        "exact_self_exclusion": True,
        "stages": stages,
        "cluster_entropy": cluster_entropy,
        "cluster_replay_stability": cluster_stability,
        "som_quantization_error": som_quantization,
        "som_neighborhood_overlap_at_k": som_overlap,
        "sparse_dense": asdict(sparse_dense_result) if sparse_dense_result else None,
        "context_retrieval": context_retrieval,
        "nary_retrieval": nary_retrieval,
        "aligned_feature_matrix_checksum": alignment_receipt.matrix_checksum,
        "aligned_feature_row_identity_checksum": alignment_receipt.row_identity_checksum,
        "aligned_feature_columns": int(aligned.shape[1]),
        "canonical_authority": False,
    }
    output_checksum = _sha256_bytes(_stable_json(receipt_without_checksum))
    receipt = AlignedSnapshotExperimentReceipt(**receipt_without_checksum, output_checksum=output_checksum)
    output_target = Path(output_path)
    output_target.parent.mkdir(parents=True, exist_ok=True)
    output_target.write_text(json.dumps(receipt.to_dict(), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return receipt
