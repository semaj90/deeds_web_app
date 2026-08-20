"""Bounded live cuGraph fixture for Parent Atlas spectral-routing proof.

This module intentionally accepts a frozen, revision-qualified graph fixture. It
runs PageRank, spectral balanced cut, spectral modularity and Leiden on the same
weighted graph, records assignment/analyzer metrics, and emits no canonical
relationships. The intended production fixture size is 500..5000 vertices.
"""

from __future__ import annotations

from contextlib import contextmanager
from hashlib import sha256
import importlib.metadata
import json
import math
import time
from typing import Any, Iterator

import numpy as np

from .gpu_memory import GpuMemorySampler

NVTX_DOMAIN = "parent-atlas"
NVTX_ROOT_RANGE = "atlas.graph_fixture"


def _stable_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def checksum(value: Any) -> str:
    return sha256(_stable_json(value)).hexdigest()


def _version(distribution: str) -> str:
    try:
        return importlib.metadata.version(distribution)
    except importlib.metadata.PackageNotFoundError:
        return "unknown"


def _cuda_version() -> str | None:
    try:
        import cupy as cp

        runtime = int(cp.cuda.runtime.runtimeGetVersion())
        major = runtime // 1000
        minor = (runtime % 1000) // 10
        return f"{major}.{minor}"
    except Exception:
        return None


@contextmanager
def nvtx_range(message: str) -> Iterator[None]:
    """Push a registered NVTX range if NVIDIA's Python NVTX package is present."""
    try:
        import nvtx

        with nvtx.annotate(message, domain=NVTX_DOMAIN):
            yield
        return
    except ImportError as exc:
        raise RuntimeError(
            "NVTX_RUNTIME_MISSING: install/import NVIDIA nvtx before live profiling"
        ) from exc


def _validate_fixture(raw: dict[str, Any]) -> dict[str, Any]:
    required = [
        "workflow_id",
        "workflow_revision",
        "source_snapshot_revision",
        "graph_revision",
        "feature_revision",
        "row_identity_checksum",
        "random_seed",
        "num_clusters",
        "vertices",
        "edges",
    ]
    missing = [key for key in required if key not in raw]
    if missing:
        raise ValueError(f"LIVE_GRAPH_FIXTURE_MISSING_FIELDS:{','.join(missing)}")
    vertices = raw["vertices"]
    edges = raw["edges"]
    if not isinstance(vertices, list) or not 500 <= len(vertices) <= 5000:
        raise ValueError("LIVE_GRAPH_FIXTURE_VERTEX_COUNT_MUST_BE_500_TO_5000")
    ordinals = [int(vertex["ordinal"]) for vertex in vertices]
    if ordinals != list(range(len(vertices))):
        raise ValueError("LIVE_GRAPH_FIXTURE_ORDINALS_MUST_BE_DENSE_AND_ORDERED")
    if len({str(vertex["candidate_id"]) for vertex in vertices}) != len(vertices):
        raise ValueError("LIVE_GRAPH_FIXTURE_CANDIDATE_IDS_MUST_BE_UNIQUE")
    if not isinstance(edges, list) or not edges:
        raise ValueError("LIVE_GRAPH_FIXTURE_REQUIRES_EDGES")
    allowed_families = {
        "AST_CALL",
        "AST_IMPORT",
        "AST_REFERENCE",
        "NARY_INCIDENCE",
        "ONTOLOGY_ROLE",
        "SEMANTIC_KNN",
        "LEXICAL_COOCCURRENCE",
        "WORKFLOW_DEPENDENCY",
    }
    for edge in edges:
        src, dst = int(edge["src"]), int(edge["dst"])
        if src < 0 or dst < 0 or src >= len(vertices) or dst >= len(vertices):
            raise ValueError("LIVE_GRAPH_FIXTURE_EDGE_VERTEX_OUT_OF_RANGE")
        if src == dst:
            raise ValueError("LIVE_GRAPH_FIXTURE_SELF_LOOP_FORBIDDEN")
        weight = float(edge.get("weight", 1.0))
        if not math.isfinite(weight) or weight < 0:
            raise ValueError("LIVE_GRAPH_FIXTURE_EDGE_WEIGHT_INVALID")
        if edge.get("family") not in allowed_families:
            raise ValueError("LIVE_GRAPH_FIXTURE_EDGE_FAMILY_INVALID")
    clusters = int(raw["num_clusters"])
    if clusters < 2 or clusters > len(vertices):
        raise ValueError("LIVE_GRAPH_FIXTURE_CLUSTER_COUNT_INVALID")
    if int(raw["workflow_revision"]) < 0:
        raise ValueError("LIVE_GRAPH_FIXTURE_WORKFLOW_REVISION_INVALID")
    row_checksum = str(raw["row_identity_checksum"])
    if len(row_checksum) != 64 or any(ch not in "0123456789abcdef" for ch in row_checksum):
        raise ValueError("LIVE_GRAPH_FIXTURE_ROW_IDENTITY_CHECKSUM_INVALID")
    return raw


def _assignment_records(frame: Any, *, cluster_column: str, vertices: list[dict[str, Any]]) -> list[dict[str, Any]]:
    pdf = frame[["vertex", cluster_column]].to_pandas().sort_values("vertex")
    records: list[dict[str, Any]] = []
    for row in pdf.itertuples(index=False):
        ordinal = int(row[0])
        records.append(
            {
                "vertex_ordinal": ordinal,
                "candidate_id": str(vertices[ordinal]["candidate_id"]),
                "cluster_id": int(row[1]),
            }
        )
    if [record["vertex_ordinal"] for record in records] != list(range(len(vertices))):
        raise RuntimeError("CUGRAPH_ASSIGNMENTS_DID_NOT_COVER_DENSE_ORDINALS")
    return records


def _assignment_checksum(records: list[dict[str, Any]]) -> str:
    return checksum(sorted(records, key=lambda item: (item["vertex_ordinal"], item["candidate_id"])))


def _labels(records: list[dict[str, Any]], vertex_count: int) -> np.ndarray:
    values = np.empty(vertex_count, dtype=np.int64)
    for record in records:
        values[int(record["vertex_ordinal"])] = int(record["cluster_id"])
    return values


def adjusted_rand_index(labels_a: np.ndarray, labels_b: np.ndarray) -> float:
    """Dependency-free adjusted Rand index for stability receipts."""
    if labels_a.shape != labels_b.shape:
        raise ValueError("ARI_LABEL_SHAPE_MISMATCH")
    n = int(labels_a.size)
    if n < 2:
        return 1.0
    _, inv_a = np.unique(labels_a, return_inverse=True)
    _, inv_b = np.unique(labels_b, return_inverse=True)
    contingency = np.zeros((int(inv_a.max()) + 1, int(inv_b.max()) + 1), dtype=np.int64)
    np.add.at(contingency, (inv_a, inv_b), 1)

    def comb2(values: np.ndarray) -> float:
        values = values.astype(np.float64)
        return float(np.sum(values * (values - 1.0) / 2.0))

    sum_comb = comb2(contingency)
    sum_a = comb2(contingency.sum(axis=1))
    sum_b = comb2(contingency.sum(axis=0))
    total = n * (n - 1) / 2.0
    if total == 0:
        return 1.0
    expected = (sum_a * sum_b) / total
    maximum = 0.5 * (sum_a + sum_b)
    denominator = maximum - expected
    return 1.0 if denominator == 0 and sum_comb == expected else float((sum_comb - expected) / denominator)


def _cluster_query_metrics(
    labels: np.ndarray,
    pagerank_by_vertex: dict[int, float],
    vertices: list[dict[str, Any]],
    eval_cases: list[dict[str, Any]],
) -> tuple[float | None, float | None, float | None]:
    if not eval_cases:
        return None, None, None
    recalls: list[float] = []
    source_coverages: list[float] = []
    repair_successes: list[float] = []
    for case in eval_cases:
        seeds = [int(value) for value in case.get("seed_ordinals", [])]
        relevant = {int(value) for value in case.get("relevant_ordinals", [])}
        successful = {int(value) for value in case.get("historical_repair_success_ordinals", [])}
        k = int(case.get("k", 32))
        if not seeds or not relevant or k <= 0:
            continue
        seed_clusters = {int(labels[ordinal]) for ordinal in seeds}
        candidates = [ordinal for ordinal in range(len(vertices)) if int(labels[ordinal]) in seed_clusters]
        candidates.sort(key=lambda ordinal: (-pagerank_by_vertex.get(ordinal, 0.0), ordinal))
        top = candidates[:k]
        recalls.append(len(relevant.intersection(top)) / len(relevant))
        unique_sources = {str(vertices[ordinal]["source_ref"]) for ordinal in top}
        source_coverages.append(len(unique_sources) / max(1, len(top)))
        if successful:
            repair_successes.append(len(successful.intersection(top)) / len(successful))
    if not recalls:
        return None, None, None
    return (
        float(np.mean(recalls)),
        float(np.mean(source_coverages)),
        float(np.mean(repair_successes)) if repair_successes else None,
    )


def _analyze(cugraph: Any, graph: Any, assignments: Any, cluster_column: str, n_clusters: int) -> dict[str, float | None]:
    kwargs = {
        "G": graph,
        "n_clusters": n_clusters,
        "clustering": assignments,
        "vertex_col_name": "vertex",
        "cluster_col_name": cluster_column,
    }
    result: dict[str, float | None] = {"modularity_score": None, "edge_cut_score": None, "ratio_cut_score": None}
    for key, name in [
        ("modularity_score", "analyzeClustering_modularity"),
        ("edge_cut_score", "analyzeClustering_edge_cut"),
        ("ratio_cut_score", "analyzeClustering_ratio_cut"),
    ]:
        fn = getattr(cugraph, name, None)
        if fn is not None:
            result[key] = float(fn(**kwargs))
    return result


def _run_spectral(
    cugraph: Any,
    graph: Any,
    *,
    method: str,
    n_clusters: int,
    seed: int,
    num_eigenvectors: int,
) -> Any:
    common = {
        "G": graph,
        "num_clusters": n_clusters,
        "num_eigen_vects": num_eigenvectors,
        "evs_tolerance": 1e-5,
        "evs_max_iter": 100,
        "kmean_tolerance": 1e-5,
        "kmean_max_iter": 100,
        "random_state": seed,
    }
    if method == "SPECTRAL_BALANCED_CUT":
        return cugraph.spectralBalancedCutClustering(**common)
    if method == "SPECTRAL_MODULARITY":
        return cugraph.spectralModularityMaximizationClustering(**common)
    raise ValueError(f"unknown spectral method {method}")


def run_live_graph_fixture(raw_fixture: dict[str, Any]) -> dict[str, Any]:
    fixture = _validate_fixture(raw_fixture)
    fixture_checksum = checksum(fixture)
    vertices = fixture["vertices"]
    edges = fixture["edges"]
    vertex_count = len(vertices)
    n_clusters = int(fixture["num_clusters"])
    seed = int(fixture["random_seed"])
    num_eigenvectors = min(n_clusters, max(2, int(math.ceil(math.log2(n_clusters)))))

    import cudf
    import cugraph

    edge_frame = cudf.DataFrame(
        {
            "src": [int(edge["src"]) for edge in edges],
            "dst": [int(edge["dst"]) for edge in edges],
            "weight": [float(edge.get("weight", 1.0)) for edge in edges],
        }
    )
    graph = cugraph.Graph(directed=False)
    graph.from_cudf_edgelist(edge_frame, source="src", destination="dst", edge_attr="weight", renumber=False)

    memory_sampler = GpuMemorySampler().start()
    algorithm_metrics: list[dict[str, Any]] = []
    assignments_by_algorithm: dict[str, list[dict[str, Any]]] = {}

    try:
        with nvtx_range(NVTX_ROOT_RANGE):
            start = time.perf_counter()
            with nvtx_range("atlas.graph_fixture.pagerank"):
                pagerank = cugraph.pagerank(graph)
            pagerank_runtime_ms = (time.perf_counter() - start) * 1000.0
            pagerank_pdf = pagerank[["vertex", "pagerank"]].to_pandas()
            pagerank_by_vertex = {int(row.vertex): float(row.pagerank) for row in pagerank_pdf.itertuples(index=False)}
            algorithm_metrics.append(
                {
                    "algorithm": "PAGERANK",
                    "runtime_ms": pagerank_runtime_ms,
                }
            )

            for algorithm in ("SPECTRAL_BALANCED_CUT", "SPECTRAL_MODULARITY"):
                start = time.perf_counter()
                with nvtx_range(f"atlas.graph_fixture.{algorithm.lower()}"):
                    frame = _run_spectral(
                        cugraph,
                        graph,
                        method=algorithm,
                        n_clusters=n_clusters,
                        seed=seed,
                        num_eigenvectors=num_eigenvectors,
                    )
                runtime_ms = (time.perf_counter() - start) * 1000.0
                records = _assignment_records(frame, cluster_column="cluster", vertices=vertices)
                assignments_by_algorithm[algorithm] = records
                labels = _labels(records, vertex_count)
                analyzer = _analyze(cugraph, graph, frame, "cluster", n_clusters)
                with nvtx_range(f"atlas.graph_fixture.{algorithm.lower()}.stability"):
                    frame_2 = _run_spectral(
                        cugraph,
                        graph,
                        method=algorithm,
                        n_clusters=n_clusters,
                        seed=seed + 1,
                        num_eigenvectors=num_eigenvectors,
                    )
                labels_2 = _labels(_assignment_records(frame_2, cluster_column="cluster", vertices=vertices), vertex_count)
                recall, source_coverage, repair_success = _cluster_query_metrics(
                    labels,
                    pagerank_by_vertex,
                    vertices,
                    list(fixture.get("evaluation_cases", [])),
                )
                algorithm_metrics.append(
                    {
                        "algorithm": algorithm,
                        "assignment_checksum": _assignment_checksum(records),
                        "cluster_count": n_clusters,
                        **analyzer,
                        "stability_ari": adjusted_rand_index(labels, labels_2),
                        "recall_at_k": recall,
                        "source_coverage_at_k": source_coverage,
                        "historical_repair_success_at_k": repair_success,
                        "runtime_ms": runtime_ms,
                    }
                )

            start = time.perf_counter()
            with nvtx_range("atlas.graph_fixture.leiden"):
                leiden_frame, leiden_modularity = cugraph.leiden(
                    graph,
                    max_iter=int(fixture.get("leiden_max_iterations", 100)),
                    resolution=float(fixture.get("leiden_resolution", 1.0)),
                    random_state=seed,
                )
            leiden_runtime_ms = (time.perf_counter() - start) * 1000.0
            records = _assignment_records(leiden_frame, cluster_column="partition", vertices=vertices)
            assignments_by_algorithm["LEIDEN"] = records
            labels = _labels(records, vertex_count)
            with nvtx_range("atlas.graph_fixture.leiden.stability"):
                leiden_frame_2, _ = cugraph.leiden(
                    graph,
                    max_iter=int(fixture.get("leiden_max_iterations", 100)),
                    resolution=float(fixture.get("leiden_resolution", 1.0)),
                    random_state=seed + 1,
                )
            labels_2 = _labels(_assignment_records(leiden_frame_2, cluster_column="partition", vertices=vertices), vertex_count)
            recall, source_coverage, repair_success = _cluster_query_metrics(
                labels,
                pagerank_by_vertex,
                vertices,
                list(fixture.get("evaluation_cases", [])),
            )
            algorithm_metrics.append(
                {
                    "algorithm": "LEIDEN",
                    "assignment_checksum": _assignment_checksum(records),
                    "cluster_count": len(set(int(value) for value in labels)),
                    "modularity_score": float(leiden_modularity),
                    "stability_ari": adjusted_rand_index(labels, labels_2),
                    "recall_at_k": recall,
                    "source_coverage_at_k": source_coverage,
                    "historical_repair_success_at_k": repair_success,
                    "runtime_ms": leiden_runtime_ms,
                }
            )

            for baseline_name, vertex_field in (("KMEANS_BASELINE", "kmeans_cluster"), ("SOM_BASELINE", "som_cluster")):
                if all(vertex_field in vertex and vertex[vertex_field] is not None for vertex in vertices):
                    labels = np.asarray([int(vertex[vertex_field]) for vertex in vertices], dtype=np.int64)
                    records = [
                        {
                            "vertex_ordinal": ordinal,
                            "candidate_id": str(vertices[ordinal]["candidate_id"]),
                            "cluster_id": int(labels[ordinal]),
                        }
                        for ordinal in range(vertex_count)
                    ]
                    recall, source_coverage, repair_success = _cluster_query_metrics(
                        labels,
                        pagerank_by_vertex,
                        vertices,
                        list(fixture.get("evaluation_cases", [])),
                    )
                    algorithm_metrics.append(
                        {
                            "algorithm": baseline_name,
                            "assignment_checksum": _assignment_checksum(records),
                            "cluster_count": len(set(int(value) for value in labels)),
                            "recall_at_k": recall,
                            "source_coverage_at_k": source_coverage,
                            "historical_repair_success_at_k": repair_success,
                            "runtime_ms": 0.0,
                        }
                    )
    finally:
        gpu_memory = memory_sampler.stop().to_dict()

    return {
        "schema": "atlas.live-graph-fixture-receipt.v1",
        "receipt_id": f"live-graph:{fixture['workflow_id']}:{fixture['graph_revision']}:{fixture_checksum[:16]}",
        "workflow_id": str(fixture["workflow_id"]),
        "workflow_revision": int(fixture["workflow_revision"]),
        "source_snapshot_revision": str(fixture["source_snapshot_revision"]),
        "graph_revision": str(fixture["graph_revision"]),
        "feature_revision": str(fixture["feature_revision"]),
        "row_identity_checksum": str(fixture["row_identity_checksum"]),
        "fixture_checksum": fixture_checksum,
        "vertex_count": vertex_count,
        "edge_count": int(graph.number_of_edges()),
        "random_seed": seed,
        "algorithms": algorithm_metrics,
        "gpu_memory_receipt": gpu_memory,
        "rapids_version": _version("rapids"),
        "cugraph_version": str(getattr(cugraph, "__version__", _version("cugraph-cu13"))),
        "cuda_version": _cuda_version(),
        "assignments": assignments_by_algorithm,
        "status": "EXECUTED",
        "canonical_authority": False,
        "producer_revision": "live-graph-fixture-v1",
    }
