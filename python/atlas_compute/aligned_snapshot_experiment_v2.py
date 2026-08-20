"""Parent Atlas aligned snapshot experiment v2.

Semantic rows stay canonical-ID ordered. Contextual windows require an explicit
source/AST/workflow/temporal permutation and are scattered back to canonical
ordinals before feature alignment. Snapshot lineage identity and cross-block
canonical row-order identity are carried as distinct checksums.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
import math
from pathlib import Path
from typing import Any, Literal

import numpy as np

from .aligned_snapshot_experiment import (
    StageStatus,
    _benchmark_sparse_dense,
    _build_relation_snapshot,
    _filter_exact_hits,
    _load_relevance,
    _retrieval_metric,
    _run_qdrant_sweep,
)
from .ann_compare import compare_cuvs_exact_and_cagra
from .cluster_softmax import run_cuvs_soft_kmeans
from .cuvs_analytics import run_cuvs_binary_quantization
from .exact_semantic import exact_semantic_search
from .feature_alignment import align_feature_blocks, make_feature_block
from .ordered_context import contextualize_explicit_order
from .semantic_snapshot_freeze import load_and_verify_frozen_snapshot
from .som import train_deterministic_som
from .sparse_relations import build_binary_incidence, sparse_relation_softmax, sparse_relation_spmm


Metric = Literal["cosine", "inner_product", "sqeuclidean"]


@dataclass(frozen=True)
class AlignedSnapshotExperimentV2Receipt:
    schema: str
    experiment_revision: str
    semantic_snapshot_revision: str
    representation_revision: str
    semantic_versioned_row_identity_checksum: str
    semantic_canonical_order_checksum: str
    semantic_tensor_checksum: str
    row_count: int
    semantic_dimensions: int
    metric: str
    k: int
    query_ordinals: list[int]
    query_canonical_ids: list[str]
    exact_semantic_result_checksum: str
    exact_self_exclusion: bool
    pytorch_cuvs_exact_topk_overlap: float | None
    cagra_recall_at_k: float | None
    qdrant_hnsw_best_recall_at_k: float | None
    cluster_entropy: float | None
    cluster_replay_stability: float | None
    som_quantization_error: float | None
    som_neighborhood_overlap_at_k: float | None
    sparse_dense: dict[str, Any] | None
    context_retrieval: dict[str, Any]
    nary_retrieval: dict[str, Any]
    stages: dict[str, dict[str, Any]]
    aligned_feature_matrix_checksum: str
    aligned_feature_row_identity_checksum: str
    aligned_feature_columns: int
    output_checksum: str
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _stable(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _canonical_ids(manifest: dict[str, Any]) -> list[str]:
    rows = manifest.get("rows") or []
    ids = [str(row.get("canonical_id") or "") for row in rows]
    if len(ids) != manifest.get("row_count") or any(not value for value in ids) or len(set(ids)) != len(ids):
        raise ValueError("semantic manifest canonical rows invalid")
    return ids


def _rank_som(coords: np.ndarray, query_ordinals: list[int], k: int) -> list[list[int]]:
    row_ordinals = np.arange(coords.shape[0], dtype=np.int64)
    rankings: list[list[int]] = []
    for query in query_ordinals:
        delta = coords - coords[query]
        distance = np.sum(delta * delta, axis=1, dtype=np.float64)
        order = np.lexsort((row_ordinals, distance))
        rankings.append([int(v) for v in order if int(v) != query][:k])
    return rankings


def _mean_overlap(a: list[list[int]], b: list[list[int]], k: int) -> float:
    return float(np.mean([len(set(x[:k]) & set(y[:k])) / float(k) for x, y in zip(a, b, strict=True)]))


def _recommend_hnsw(sweep: list[dict[str, Any]], minimum_recall: float) -> dict[str, Any] | None:
    eligible = [row for row in sweep if float(row.get("recall_at_k", 0.0)) >= minimum_recall]
    if not eligible:
        return None
    return min(
        eligible,
        key=lambda row: (
            float(row.get("mean_latency_ms", float("inf"))),
            float(row.get("p95_latency_ms", float("inf"))),
            int(row.get("hnsw_ef", 0)),
        ),
    )


def run_aligned_snapshot_experiment_v2(
    *,
    semantic_manifest_path: str | Path,
    experiment_spec_path: str | Path,
    output_path: str | Path,
) -> AlignedSnapshotExperimentV2Receipt:
    semantic, manifest = load_and_verify_frozen_snapshot(semantic_manifest_path)
    spec = json.loads(Path(experiment_spec_path).read_text(encoding="utf-8"))
    canonical_ids = _canonical_ids(manifest)
    row_index = {value: index for index, value in enumerate(canonical_ids)}
    revision = str(spec.get("experiment_revision") or "")
    if not revision:
        raise ValueError("experiment_revision is required")
    metric: Metric = str(spec.get("metric") or "cosine")  # type: ignore[assignment]
    if metric not in {"cosine", "inner_product", "sqeuclidean"}:
        raise ValueError("unsupported metric")
    k = int(spec.get("k") or 10)
    if not (1 <= k < semantic.shape[0]):
        raise ValueError("k must be smaller than corpus row count")

    query_ids = [str(value) for value in (spec.get("query_canonical_ids") or canonical_ids[: min(32, len(canonical_ids))])]
    if not query_ids or any(value not in row_index for value in query_ids):
        raise ValueError("query IDs must belong to frozen semantic snapshot")
    query_ordinals = [row_index[value] for value in query_ids]
    queries = semantic[np.asarray(query_ordinals, dtype=np.int64)]
    device = str(spec.get("torch_device") or "cpu")

    exact = exact_semantic_search(
        semantic, queries, canonical_ids, metric=metric,
        top_k=min(k + 1, semantic.shape[0]), device=device,
    )
    exact_ordinals = _filter_exact_hits(exact, query_ordinals, k)
    exact_rankings = [[canonical_ids[value] for value in row] for row in exact_ordinals]
    stages: dict[str, dict[str, Any]] = {
        "pytorch_exact": asdict(StageStatus("PASS", None, exact.to_dict())),
    }

    exact_overlap: float | None = None
    cagra_recall: float | None = None
    if bool(spec.get("enable_cuvs", True)):
        try:
            ann = compare_cuvs_exact_and_cagra(
                semantic, queries, metric=metric, k=k,
                query_corpus_ordinals=query_ordinals,
                graph_degree=int(spec.get("cagra_graph_degree") or 64),
                intermediate_graph_degree=int(spec.get("cagra_intermediate_graph_degree") or 128),
                build_algo=str(spec.get("cagra_build_algo") or "ivf_pq"),
                search_width=int(spec.get("cagra_search_width") or 1),
                itopk_size=int(spec.get("cagra_itopk_size") or max(64, k + 1)),
            )
            cuvs_exact = [row.exact_ordinals for row in ann.comparisons]
            exact_overlap = _mean_overlap(exact_ordinals, cuvs_exact, k)
            cagra_recall = ann.mean_recall_at_k
            stages["cuvs_exact_cagra"] = asdict(StageStatus("PASS", None, {
                **ann.to_dict(),
                "pytorch_cuvs_exact_topk_overlap": exact_overlap,
            }))
        except Exception as error:
            stages["cuvs_exact_cagra"] = asdict(StageStatus("ERROR", f"{type(error).__name__}:{error}", None))
    else:
        stages["cuvs_exact_cagra"] = asdict(StageStatus("SKIPPED", "disabled", None))

    qdrant_best: float | None = None
    qdrant_cfg = spec.get("qdrant")
    if isinstance(qdrant_cfg, dict) and qdrant_cfg.get("enabled", False):
        try:
            qdrant = _run_qdrant_sweep(semantic, canonical_ids, query_ordinals, config=qdrant_cfg, k=k)
            qdrant_best = max((float(row["recall_at_k"]) for row in qdrant["sweep"]), default=0.0)
            recall_floor = float(qdrant_cfg.get("minimum_recall_at_k") or 0.95)
            recommended = _recommend_hnsw(qdrant["sweep"], recall_floor)
            qdrant = {
                **qdrant,
                "minimum_recall_at_k": recall_floor,
                "recommended_hnsw_ef": int(recommended["hnsw_ef"]) if recommended else None,
                "recommendation_status": "ELIGIBLE" if recommended else "NO_SWEEP_POINT_MEETS_RECALL_FLOOR",
            }
            stages["qdrant_hnsw"] = asdict(StageStatus("PASS", None, qdrant))
        except Exception as error:
            stages["qdrant_hnsw"] = asdict(StageStatus("ERROR", f"{type(error).__name__}:{error}", None))
    else:
        stages["qdrant_hnsw"] = asdict(StageStatus("SKIPPED", "not enabled", None))

    blocks = [make_feature_block(
        block_id="semantic_768",
        revision=str(manifest["representation_revision"]),
        canonical_ids=canonical_ids,
        values=semantic,
        column_names=[f"semantic_{i}" for i in range(semantic.shape[1])],
        normalizations=["l2_row"] * semantic.shape[1],
    )]

    if bool(spec.get("enable_binary_quantization", True)):
        try:
            _encoded, binary_receipt = run_cuvs_binary_quantization(semantic)
            stages["binary_hamming_projection"] = asdict(StageStatus("PASS", None, binary_receipt.to_dict()))
        except Exception as error:
            stages["binary_hamming_projection"] = asdict(StageStatus("ERROR", f"{type(error).__name__}:{error}", None))
    else:
        stages["binary_hamming_projection"] = asdict(StageStatus("SKIPPED", "disabled", None))

    cluster_entropy: float | None = None
    cluster_stability: float | None = None
    if bool(spec.get("enable_kmeans", True)):
        try:
            clusters = int(spec.get("kmeans_clusters") or min(20, max(2, round(math.sqrt(len(canonical_ids))))))
            kmeans_args = dict(
                n_clusters=clusters,
                temperature=float(spec.get("kmeans_temperature") or 1.0),
                input_normalization="l2_row",
                streaming_batch_size=int(spec.get("kmeans_streaming_batch_size") or 0),
                prediction_batch_size=int(spec.get("kmeans_prediction_batch_size") or 0),
                device=device,
            )
            labels1, _c1, probs1, r1 = run_cuvs_soft_kmeans(semantic, **kmeans_args)
            labels2, _c2, probs2, r2 = run_cuvs_soft_kmeans(semantic, **kmeans_args)
            cluster_entropy = r1.mean_assignment_entropy
            cluster_stability = float(np.mean(labels1 == labels2))
            blocks.append(make_feature_block(
                block_id="soft_kmeans", revision=revision, canonical_ids=canonical_ids,
                values=probs1,
                column_names=[f"cluster_{i}" for i in range(probs1.shape[1])],
                normalizations=["none"] * probs1.shape[1],
            ))
            stages["soft_kmeans"] = asdict(StageStatus("PASS", None, {
                "first": r1.to_dict(), "replay": r2.to_dict(),
                "replay_label_agreement": cluster_stability,
                "probability_max_abs_replay_error": float(np.max(np.abs(probs1 - probs2))),
                "stability_scope": "deterministic_replay_only_not_perturbation_robustness",
            }))
        except Exception as error:
            stages["soft_kmeans"] = asdict(StageStatus("ERROR", f"{type(error).__name__}:{error}", None))
    else:
        stages["soft_kmeans"] = asdict(StageStatus("SKIPPED", "disabled", None))

    som_quant: float | None = None
    som_overlap: float | None = None
    if bool(spec.get("enable_som", True)):
        try:
            normalized_semantic = semantic / np.maximum(np.linalg.norm(semantic, axis=1, keepdims=True), 1e-12)
            grid_rows = int(spec.get("som_grid_rows") or max(2, round(len(canonical_ids) ** 0.25)))
            grid_cols = int(spec.get("som_grid_columns") or grid_rows)
            coords, _codebook, som = train_deterministic_som(
                normalized_semantic.astype(np.float32), grid_rows=grid_rows, grid_columns=grid_cols,
                epochs=int(spec.get("som_epochs") or 20), device=device,
            )
            coords_np = coords.detach().cpu().numpy().astype(np.float32, copy=False)
            som_overlap = _mean_overlap(exact_ordinals, _rank_som(coords_np, query_ordinals, k), k)
            som_quant = som.quantization_error
            blocks.append(make_feature_block(
                block_id="som_coordinates", revision=revision, canonical_ids=canonical_ids,
                values=coords_np, column_names=["som_y", "som_x"], normalizations=["minmax", "minmax"],
            ))
            stages["som"] = asdict(StageStatus("PASS", None, {
                **som.to_dict(), "semantic_neighborhood_overlap_at_k": som_overlap,
            }))
        except Exception as error:
            stages["som"] = asdict(StageStatus("ERROR", f"{type(error).__name__}:{error}", None))
    else:
        stages["som"] = asdict(StageStatus("SKIPPED", "disabled", None))

    sparse_dense: dict[str, Any] | None = None
    nary_rankings: list[list[str]] | None = None
    nary = spec.get("nary")
    if isinstance(nary, dict) and nary.get("relationships"):
        try:
            normalized_semantic = semantic / np.maximum(np.linalg.norm(semantic, axis=1, keepdims=True), 1e-12)
            relationship_ids, edges, relation_features = _build_relation_snapshot(canonical_ids, normalized_semantic, nary)
            incidence, ir = build_binary_incidence(canonical_ids, relationship_ids, edges, device=device)
            weighted, wr = sparse_relation_softmax(incidence, dim=1, temperature=float(nary.get("temperature") or 1.0))
            propagated, pr = sparse_relation_spmm(weighted, relation_features)
            propagated_np = propagated.detach().cpu().numpy().astype(np.float32, copy=False)
            benchmark = _benchmark_sparse_dense(incidence, relation_features, repeats=int(spec.get("benchmark_repeats") or 10))
            sparse_dense = asdict(benchmark)
            blocks.append(make_feature_block(
                block_id="nary_context", revision=str(nary.get("snapshot_revision") or revision),
                canonical_ids=canonical_ids, values=propagated_np,
                column_names=[f"nary_{i}" for i in range(propagated_np.shape[1])],
                normalizations=["zscore"] * propagated_np.shape[1],
            ))
            weights_np = weighted.to_dense().detach().cpu().numpy()
            rel_ordinals = np.arange(len(relationship_ids), dtype=np.int64)
            nary_rankings = []
            for query in query_ordinals:
                order = np.lexsort((rel_ordinals, -weights_np[query]))
                nary_rankings.append([relationship_ids[int(i)] for i in order if weights_np[query, int(i)] > 0])
            stages["nary_sparse"] = asdict(StageStatus("PASS", None, {
                "incidence": ir.to_dict(), "softmax": wr.to_dict(), "propagation": pr.to_dict(),
                "sparse_dense_benchmark": sparse_dense,
            }))
        except Exception as error:
            stages["nary_sparse"] = asdict(StageStatus("ERROR", f"{type(error).__name__}:{error}", None))
    else:
        stages["nary_sparse"] = asdict(StageStatus("SKIPPED", "nary relationships not supplied", None))

    relevance = _load_relevance(spec.get("relevance"))
    context_cfg = spec.get("context")
    if isinstance(context_cfg, dict) and context_cfg.get("ordered_canonical_ids"):
        try:
            normalized_semantic = semantic / np.maximum(np.linalg.norm(semantic, axis=1, keepdims=True), 1e-12)
            context_np, _mask, context_receipt = contextualize_explicit_order(
                normalized_semantic.astype(np.float32), canonical_ids,
                [str(v) for v in context_cfg["ordered_canonical_ids"]],
                order_kind=str(context_cfg.get("order_kind") or "source_order"),
                context_revision=str(context_cfg.get("context_revision") or revision),
                window_size=int(context_cfg.get("window_size") or 9),
                causal=bool(context_cfg.get("causal", False)),
                temperature=float(context_cfg.get("temperature") or 1.0),
                device=device,
            )
            blocks.append(make_feature_block(
                block_id="ordered_context", revision=str(context_cfg.get("context_revision") or revision),
                canonical_ids=canonical_ids, values=context_np,
                column_names=[f"context_{i}" for i in range(context_np.shape[1])],
                normalizations=["zscore"] * context_np.shape[1],
            ))
            stages["ordered_context"] = asdict(StageStatus("PASS", None, context_receipt.to_dict()))
            if relevance:
                baseline = _retrieval_metric(exact_rankings, query_ids, relevance, k)
                context_exact = exact_semantic_search(
                    context_np, context_np[np.asarray(query_ordinals)], canonical_ids,
                    metric="cosine", top_k=min(k + 1, len(canonical_ids)), device=device,
                )
                context_hits = _filter_exact_hits(context_exact, query_ordinals, k)
                context_rankings = [[canonical_ids[value] for value in row] for row in context_hits]
                contextual = _retrieval_metric(context_rankings, query_ids, relevance, k)
                context_retrieval = {
                    "status": "PASS", "baseline": asdict(baseline), "contextual": asdict(contextual),
                    "recall_lift": contextual.recall_at_k - baseline.recall_at_k,
                    "mrr_lift": contextual.mrr_at_k - baseline.mrr_at_k,
                }
            else:
                context_retrieval = {"status": "NOT_EVALUATED_NO_RELEVANCE_LABELS"}
        except Exception as error:
            stages["ordered_context"] = asdict(StageStatus("ERROR", f"{type(error).__name__}:{error}", None))
            context_retrieval = {"status": "ERROR", "reason": f"{type(error).__name__}:{error}"}
    else:
        stages["ordered_context"] = asdict(StageStatus("SKIPPED", "explicit context order not supplied", None))
        context_retrieval = {"status": "SKIPPED", "reason": "context.ordered_canonical_ids required"}

    nary_relevance = _load_relevance(spec.get("nary_relevance"))
    if nary_rankings is not None and nary_relevance:
        nary_retrieval = {"status": "PASS", **asdict(_retrieval_metric(nary_rankings, query_ids, nary_relevance, k))}
    elif nary_rankings is not None:
        nary_retrieval = {"status": "NOT_EVALUATED_NO_RELEVANCE_LABELS"}
    else:
        nary_retrieval = {"status": "SKIPPED"}

    aligned, alignment = align_feature_blocks(blocks)
    canonical_order_checksum = str(manifest.get("canonical_order_checksum") or alignment.row_identity_checksum)
    if canonical_order_checksum != alignment.row_identity_checksum:
        raise ValueError("SEMANTIC_CANONICAL_ORDER_CHECKSUM_MISMATCH")

    payload = {
        "schema": "atlas.aligned-snapshot-experiment.v2",
        "experiment_revision": revision,
        "semantic_snapshot_revision": str(manifest["snapshot_revision"]),
        "representation_revision": str(manifest["representation_revision"]),
        "semantic_versioned_row_identity_checksum": str(manifest["row_identity_checksum"]),
        "semantic_canonical_order_checksum": canonical_order_checksum,
        "semantic_tensor_checksum": str(manifest["tensor_checksum"]),
        "row_count": int(semantic.shape[0]),
        "semantic_dimensions": int(semantic.shape[1]),
        "metric": metric,
        "k": k,
        "query_ordinals": query_ordinals,
        "query_canonical_ids": query_ids,
        "exact_semantic_result_checksum": exact.result_checksum,
        "exact_self_exclusion": True,
        "pytorch_cuvs_exact_topk_overlap": exact_overlap,
        "cagra_recall_at_k": cagra_recall,
        "qdrant_hnsw_best_recall_at_k": qdrant_best,
        "cluster_entropy": cluster_entropy,
        "cluster_replay_stability": cluster_stability,
        "som_quantization_error": som_quant,
        "som_neighborhood_overlap_at_k": som_overlap,
        "sparse_dense": sparse_dense,
        "context_retrieval": context_retrieval,
        "nary_retrieval": nary_retrieval,
        "stages": stages,
        "aligned_feature_matrix_checksum": alignment.matrix_checksum,
        "aligned_feature_row_identity_checksum": alignment.row_identity_checksum,
        "aligned_feature_columns": int(aligned.shape[1]),
        "canonical_authority": False,
    }
    checksum = _sha(_stable(payload))
    receipt = AlignedSnapshotExperimentV2Receipt(**payload, output_checksum=checksum)
    target = Path(output_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(receipt.to_dict(), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return receipt
