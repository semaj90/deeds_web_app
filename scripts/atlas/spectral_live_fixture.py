#!/usr/bin/env python3
"""Live Parent Atlas graph-routing fixture.

This module is intentionally a benchmark helper, not a new execution owner.
`scripts/atlas/run_fabric_benchmark.py` imports and invokes it.

Inputs
------
- frozen GRAPH_SNAPSHOT_PARITY `nodes.parquet`
- frozen GRAPH_SNAPSHOT_PARITY `edges.parquet`
- optional routing-label parquet joined by `gpu_node_id`

For each requested candidate size (normally 500 and 5000), it:
1. deterministically chooses one connected induced subgraph,
2. builds one weighted undirected cuGraph graph,
3. runs Leiden, spectral balanced cut, spectral modularity maximization,
4. runs PageRank for within-partition ranking,
5. repeats stochastic partitioners to measure stability,
6. uses held-out factual graph neighbours as a retrieval oracle,
7. compares optional KMeans/SOM/community labels without recomputing them,
8. reports graph quality, Recall@K/source coverage, latency and observed GPU bytes.

Spectral/cluster assignments are routing observations only. They never mint
canonical relationships or authorize source mutation.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import time
from dataclasses import dataclass
from importlib.metadata import PackageNotFoundError, version as package_version
from typing import Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

import numpy as np


DEFAULT_RECALL_K = (10, 50, 100)
DEFAULT_REPEATS = 3
DEFAULT_SEED = 0x0A71A5
DERIVED_EDGE_MARKERS = (
    "SIMILAR",
    "SEMANTIC",
    "KNN",
    "COOCCUR",
    "CO_OCCUR",
    "LEXICAL",
)


def _package_version(name: str) -> str:
    try:
        return package_version(name)
    except PackageNotFoundError:
        return "UNKNOWN"


def _sha256_json(value) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _device_used_bytes(cp) -> int:
    free_bytes, total_bytes = cp.cuda.runtime.memGetInfo()
    return int(total_bytes - free_bytes)


def _adjusted_rand_index(a: Sequence[int], b: Sequence[int]) -> float:
    if len(a) != len(b):
        raise ValueError("ARI inputs must have equal length")
    n = len(a)
    if n < 2:
        return 1.0
    a_ids, a_inv = np.unique(np.asarray(a), return_inverse=True)
    b_ids, b_inv = np.unique(np.asarray(b), return_inverse=True)
    contingency = np.zeros((len(a_ids), len(b_ids)), dtype=np.int64)
    np.add.at(contingency, (a_inv, b_inv), 1)

    comb2 = lambda x: x * (x - 1) / 2.0
    sum_cells = float(np.sum(comb2(contingency)))
    row_sums = contingency.sum(axis=1)
    col_sums = contingency.sum(axis=0)
    sum_rows = float(np.sum(comb2(row_sums)))
    sum_cols = float(np.sum(comb2(col_sums)))
    total = comb2(n)
    if total == 0:
        return 1.0
    expected = (sum_rows * sum_cols) / total
    maximum = 0.5 * (sum_rows + sum_cols)
    if maximum == expected:
        return 1.0
    return float((sum_cells - expected) / (maximum - expected))


def _mean_pairwise_ari(assignments: Sequence[np.ndarray]) -> Optional[float]:
    if len(assignments) < 2:
        return None
    values: List[float] = []
    for i in range(len(assignments)):
        for j in range(i + 1, len(assignments)):
            values.append(_adjusted_rand_index(assignments[i], assignments[j]))
    return float(np.mean(values)) if values else None


def _normalize_partition(df, *, vertex_col: str, cluster_col: str):
    normalized = df[[vertex_col, cluster_col]].rename(
        columns={vertex_col: "vertex", cluster_col: "cluster"}
    )
    return normalized.sort_values("vertex").reset_index(drop=True)


def _partition_analyzers(cugraph, graph, partition) -> Mapping[str, Optional[float]]:
    n_clusters = int(partition["cluster"].nunique())
    if n_clusters < 2:
        return {"cluster_count": n_clusters, "modularity": None, "edge_cut": None, "ratio_cut": None}
    return {
        "cluster_count": n_clusters,
        "modularity": float(cugraph.analyzeClustering_modularity(graph, n_clusters, partition)),
        "edge_cut": float(cugraph.analyzeClustering_edge_cut(graph, n_clusters, partition)),
        "ratio_cut": float(cugraph.analyzeClustering_ratio_cut(graph, n_clusters, partition)),
    }


def _is_factual_edge_type(edge_type: str) -> bool:
    upper = edge_type.upper()
    return not any(marker in upper for marker in DERIVED_EDGE_MARKERS)


def _build_factual_neighbor_map(edge_pdf, local_vertices: set[int]) -> Dict[int, set[int]]:
    result: Dict[int, set[int]] = {vertex: set() for vertex in local_vertices}
    for row in edge_pdf.itertuples(index=False):
        edge_type = str(row.edge_type)
        if not _is_factual_edge_type(edge_type):
            continue
        src = int(row.src_local)
        dst = int(row.dst_local)
        if src == dst:
            continue
        if src in result and dst in result:
            result[src].add(dst)
            result[dst].add(src)
    return result


def _partition_map(partition_pdf) -> Dict[int, int]:
    return {int(row.vertex): int(row.cluster) for row in partition_pdf.itertuples(index=False)}


def _label_partition(labels_pdf, column: str) -> Optional[Dict[int, str]]:
    if labels_pdf is None or column not in labels_pdf.columns:
        return None
    result: Dict[int, str] = {}
    for row in labels_pdf[["local_vertex", column]].itertuples(index=False):
        value = getattr(row, column)
        if value is None:
            continue
        if isinstance(value, float) and np.isnan(value):
            continue
        result[int(row.local_vertex)] = str(value)
    return result or None


def _ranking_for_seed(
    seed: int,
    candidate_vertices: Sequence[int],
    pagerank: Mapping[int, float],
    partition: Optional[Mapping[int, object]],
) -> List[int]:
    if partition is None or seed not in partition:
        pool = [v for v in candidate_vertices if v != seed]
    else:
        label = partition[seed]
        same = [v for v in candidate_vertices if v != seed and partition.get(v) == label]
        rest = [v for v in candidate_vertices if v != seed and partition.get(v) != label]
        pool = same + rest
    return sorted(pool, key=lambda v: (-pagerank.get(v, 0.0), v))


def _evaluate_retrieval(
    *,
    name: str,
    vertices: Sequence[int],
    factual_neighbors: Mapping[int, set[int]],
    pagerank: Mapping[int, float],
    partition: Optional[Mapping[int, object]],
    source_ref_by_vertex: Mapping[int, Optional[str]],
    recall_k: Sequence[int],
    max_seed_queries: int,
    validator_by_vertex: Optional[Mapping[int, float]] = None,
    repair_by_vertex: Optional[Mapping[int, float]] = None,
) -> Mapping[str, object]:
    eligible = [v for v in vertices if len(factual_neighbors.get(v, set())) > 0]
    eligible.sort(key=lambda v: (-len(factual_neighbors[v]), v))
    seeds = eligible[:max_seed_queries]
    if not seeds:
        return {"view": name, "seed_queries": 0, "recall": {}, "source_coverage": {}, "validator_success": None, "repair_success": None}

    recalls: Dict[int, List[float]] = {k: [] for k in recall_k}
    source_coverages: Dict[int, List[float]] = {k: [] for k in recall_k}
    validator_values: List[float] = []
    repair_values: List[float] = []

    for seed in seeds:
        relevant = factual_neighbors[seed]
        relevant_sources = {
            source_ref_by_vertex.get(v)
            for v in relevant
            if source_ref_by_vertex.get(v)
        }
        ranking = _ranking_for_seed(seed, vertices, pagerank, partition)
        for k in recall_k:
            top = ranking[: min(k, len(ranking))]
            hits = relevant.intersection(top)
            recalls[k].append(len(hits) / len(relevant))
            hit_sources = {
                source_ref_by_vertex.get(v)
                for v in hits
                if source_ref_by_vertex.get(v)
            }
            if relevant_sources:
                source_coverages[k].append(len(hit_sources) / len(relevant_sources))
            else:
                source_coverages[k].append(1.0 if hits else 0.0)

        if validator_by_vertex is not None:
            top = ranking[: min(max(recall_k), len(ranking))]
            values = [validator_by_vertex[v] for v in top if v in validator_by_vertex]
            if values:
                validator_values.append(float(np.mean(values)))
        if repair_by_vertex is not None:
            top = ranking[: min(max(recall_k), len(ranking))]
            values = [repair_by_vertex[v] for v in top if v in repair_by_vertex]
            if values:
                repair_values.append(float(np.mean(values)))

    return {
        "view": name,
        "seed_queries": len(seeds),
        "recall": {f"@{k}": float(np.mean(values)) for k, values in recalls.items()},
        "source_coverage": {f"@{k}": float(np.mean(values)) for k, values in source_coverages.items()},
        "validator_success": float(np.mean(validator_values)) if validator_values else None,
        "repair_success": float(np.mean(repair_values)) if repair_values else None,
    }


@dataclass
class TimedPartition:
    name: str
    partition_gpu: object
    partition_cpu: object
    latency_ms: float
    observed_gpu_bytes: int
    analyzers: Mapping[str, Optional[float]]
    stability_ari: Optional[float]


def _run_partition_repeated(
    *,
    name: str,
    run_once,
    analyzer,
    repeats: int,
    cp,
) -> TimedPartition:
    runs_cpu = []
    first_gpu = None
    first_cpu = None
    first_latency = 0.0
    max_gpu_bytes = _device_used_bytes(cp)
    for repeat in range(repeats):
        started = time.perf_counter()
        part_gpu = run_once(repeat)
        cp.cuda.runtime.deviceSynchronize()
        latency_ms = (time.perf_counter() - started) * 1000.0
        max_gpu_bytes = max(max_gpu_bytes, _device_used_bytes(cp))
        part_cpu = part_gpu.to_pandas().sort_values("vertex").reset_index(drop=True)
        runs_cpu.append(part_cpu["cluster"].to_numpy(dtype=np.int64))
        if repeat == 0:
            first_gpu = part_gpu
            first_cpu = part_cpu
            first_latency = latency_ms
    assert first_gpu is not None and first_cpu is not None
    return TimedPartition(
        name=name,
        partition_gpu=first_gpu,
        partition_cpu=first_cpu,
        latency_ms=float(first_latency),
        observed_gpu_bytes=int(max_gpu_bytes),
        analyzers=analyzer(first_gpu),
        stability_ari=_mean_pairwise_ari(runs_cpu),
    )


def _candidate_fixture(nodes, edges, target_size: int, cugraph, cudf):
    # Selection graph uses all edges but collapses direction so one fixture does
    # not accidentally measure reachability quirks instead of clustering signal.
    selection_edges = edges[["src_gpu_node_id", "dst_gpu_node_id", "weight"]].copy()
    selection_graph = cugraph.Graph(directed=False)
    selection_graph.from_cudf_edgelist(
        selection_edges,
        source="src_gpu_node_id",
        destination="dst_gpu_node_id",
        edge_attr="weight",
        renumber=True,
    )
    degrees = selection_graph.degree().to_pandas().sort_values(["degree", "vertex"], ascending=[False, True])
    if degrees.empty:
        raise ValueError("graph fixture cannot select a seed from an empty graph")
    seed = int(degrees.iloc[0]["vertex"])
    bfs = cugraph.bfs(selection_graph, start=seed).to_pandas()
    bfs = bfs[bfs["distance"] >= 0].sort_values(["distance", "vertex"], ascending=[True, True])
    if len(bfs) < target_size:
        raise ValueError(f"largest selected component from seed {seed} has only {len(bfs)} reachable vertices; need {target_size}")
    selected_original = bfs.head(target_size)["vertex"].astype(np.int64).tolist()
    mapping_pdf = __import__("pandas").DataFrame({
        "gpu_node_id": selected_original,
        "local_vertex": np.arange(target_size, dtype=np.int64),
    })
    mapping = cudf.from_pandas(mapping_pdf)

    fixture_nodes = nodes.merge(mapping, on="gpu_node_id", how="inner").sort_values("local_vertex")
    src_map = mapping.rename(columns={"gpu_node_id": "src_gpu_node_id", "local_vertex": "src_local"})
    dst_map = mapping.rename(columns={"gpu_node_id": "dst_gpu_node_id", "local_vertex": "dst_local"})
    fixture_edges = edges.merge(src_map, on="src_gpu_node_id", how="inner").merge(dst_map, on="dst_gpu_node_id", how="inner")
    fixture_edges = fixture_edges[fixture_edges["src_local"] != fixture_edges["dst_local"]]
    if len(fixture_edges) == 0:
        raise ValueError("selected fixture has no internal edges")

    # Preserve original typed rows for edge-family/factual-oracle metrics, but
    # build the clustering graph as a deterministic weighted simple graph.
    undirected = fixture_edges[["src_local", "dst_local", "weight"]].copy()
    undirected["u"] = undirected[["src_local", "dst_local"]].min(axis=1)
    undirected["v"] = undirected[["src_local", "dst_local"]].max(axis=1)
    collapsed = undirected.groupby(["u", "v"], as_index=False).agg({"weight": "sum"})
    collapsed = collapsed.rename(columns={"u": "src", "v": "dst"})

    graph = cugraph.Graph(directed=False)
    graph.from_cudf_edgelist(
        collapsed,
        source="src",
        destination="dst",
        edge_attr="weight",
        vertices=cudf.Series(np.arange(target_size, dtype=np.int64)),
        renumber=False,
        store_transposed=True,
    )
    return seed, fixture_nodes, fixture_edges, graph, collapsed


def run_spectral_live_fixture(args, reports_dir: str) -> Mapping[str, object]:
    try:
        import cupy as cp
        import cudf
        import cugraph
    except ImportError as error:
        raise RuntimeError(f"spectral live fixture requires RAPIDS/cuGraph/cuDF/CuPy: {error}") from error

    if not args.nodes or not args.edges:
        raise ValueError("spectral_live_fixture requires --nodes and --edges")
    candidate_sizes = [int(v) for v in (args.candidate_size or [500, 5000])]
    if any(v < 2 for v in candidate_sizes):
        raise ValueError("candidate sizes must be >= 2")
    recall_k = tuple(sorted({int(v) for v in (args.recall_k or DEFAULT_RECALL_K)}))
    repeats = int(args.repeats or DEFAULT_REPEATS)
    if repeats < 2:
        raise ValueError("--repeats must be >= 2 to measure cluster stability")
    random_seed = int(args.random_seed if args.random_seed is not None else DEFAULT_SEED)

    started_at = _now_iso()
    nodes = cudf.read_parquet(args.nodes)
    edges = cudf.read_parquet(args.edges)
    required_node_columns = {"gpu_node_id", "graph_node_key", "source_ref", "packet_key"}
    required_edge_columns = {"src_gpu_node_id", "dst_gpu_node_id", "edge_type", "weight"}
    missing_nodes = required_node_columns.difference(nodes.columns)
    missing_edges = required_edge_columns.difference(edges.columns)
    if missing_nodes or missing_edges:
        raise ValueError(f"fixture parquet missing columns nodes={sorted(missing_nodes)} edges={sorted(missing_edges)}")
    if args.edge_type:
        edges = edges[edges["edge_type"].isin(args.edge_type)]
    if len(edges) == 0:
        raise ValueError("edge filter produced zero rows")

    labels = None
    if args.labels:
        labels = cudf.read_parquet(args.labels)
        if "gpu_node_id" not in labels.columns:
            raise ValueError("labels parquet must contain gpu_node_id")

    input_identity = {
        "nodes": os.path.abspath(args.nodes),
        "edges": os.path.abspath(args.edges),
        "labels": os.path.abspath(args.labels) if args.labels else None,
        "candidate_sizes": candidate_sizes,
        "edge_types": sorted(args.edge_type or []),
        "random_seed": random_seed,
        "repeats": repeats,
        "recall_k": recall_k,
    }
    results: List[Mapping[str, object]] = []

    for target_size in candidate_sizes:
        fixture_started = time.perf_counter()
        initial_gpu_bytes = _device_used_bytes(cp)
        seed_original, fixture_nodes, fixture_edges, graph, collapsed = _candidate_fixture(
            nodes, edges, target_size, cugraph, cudf
        )
        after_graph_gpu_bytes = _device_used_bytes(cp)
        fixture_nodes_pdf = fixture_nodes.to_pandas().sort_values("local_vertex").reset_index(drop=True)
        fixture_edges_pdf = fixture_edges.to_pandas()
        local_vertices = list(range(target_size))
        source_ref_by_vertex = {
            int(row.local_vertex): (None if row.source_ref is None else str(row.source_ref))
            for row in fixture_nodes_pdf.itertuples(index=False)
        }
        factual_neighbors = _build_factual_neighbor_map(fixture_edges_pdf, set(local_vertices))

        pagerank_started = time.perf_counter()
        pagerank_result = cugraph.pagerank(graph, alpha=0.85, max_iter=100, tol=1e-8, fail_on_nonconvergence=False)
        if isinstance(pagerank_result, tuple):
            pagerank_gpu, pagerank_converged = pagerank_result
        else:
            pagerank_gpu, pagerank_converged = pagerank_result, None
        cp.cuda.runtime.deviceSynchronize()
        pagerank_ms = (time.perf_counter() - pagerank_started) * 1000.0
        pagerank_pdf = pagerank_gpu.to_pandas()
        pagerank = {int(row.vertex): float(row.pagerank) for row in pagerank_pdf.itertuples(index=False)}

        leiden_runs: List[np.ndarray] = []
        leiden_first = None
        leiden_modularity = None
        leiden_latency_ms = None
        leiden_gpu_high = _device_used_bytes(cp)
        for repeat in range(repeats):
            t0 = time.perf_counter()
            parts, modularity = cugraph.leiden(
                graph,
                max_iter=100,
                resolution=1.0,
                random_state=random_seed + repeat,
                theta=1.0,
            )
            cp.cuda.runtime.deviceSynchronize()
            elapsed = (time.perf_counter() - t0) * 1000.0
            leiden_gpu_high = max(leiden_gpu_high, _device_used_bytes(cp))
            normalized = _normalize_partition(parts, vertex_col="vertex", cluster_col="partition")
            cpu = normalized.to_pandas()
            leiden_runs.append(cpu["cluster"].to_numpy(dtype=np.int64))
            if repeat == 0:
                leiden_first = normalized
                leiden_modularity = float(modularity)
                leiden_latency_ms = float(elapsed)
        assert leiden_first is not None
        cluster_count = int(leiden_first["cluster"].nunique())
        cluster_count = max(2, min(cluster_count, target_size))
        num_eigen = min(cluster_count, max(2, int(math.ceil(math.log2(cluster_count)))))

        def spectral_balanced_once(repeat: int):
            return _normalize_partition(
                cugraph.spectralBalancedCutClustering(
                    graph,
                    cluster_count,
                    num_eigen_vects=num_eigen,
                    evs_tolerance=1e-5,
                    evs_max_iter=100,
                    kmean_tolerance=1e-5,
                    kmean_max_iter=100,
                    random_state=random_seed + repeat,
                ),
                vertex_col="vertex",
                cluster_col="cluster",
            )

        def spectral_modularity_once(repeat: int):
            return _normalize_partition(
                cugraph.spectralModularityMaximizationClustering(
                    graph,
                    cluster_count,
                    num_eigen_vects=num_eigen,
                    evs_tolerance=1e-5,
                    evs_max_iter=100,
                    kmean_tolerance=1e-5,
                    kmean_max_iter=100,
                    random_state=random_seed + repeat,
                ),
                vertex_col="vertex",
                cluster_col="cluster",
            )

        analyzer = lambda part: _partition_analyzers(cugraph, graph, part)
        balanced = _run_partition_repeated(
            name="spectral_balanced_cut",
            run_once=spectral_balanced_once,
            analyzer=analyzer,
            repeats=repeats,
            cp=cp,
        )
        spectral_mod = _run_partition_repeated(
            name="spectral_modularity",
            run_once=spectral_modularity_once,
            analyzer=analyzer,
            repeats=repeats,
            cp=cp,
        )
        leiden_cpu = leiden_first.to_pandas()
        leiden_analyzers = analyzer(leiden_first)
        leiden_stability = _mean_pairwise_ari(leiden_runs)

        labels_pdf = None
        validator_by_vertex = None
        repair_by_vertex = None
        optional_partitions: Dict[str, Optional[Mapping[int, object]]] = {}
        optional_agreement: Dict[str, Mapping[str, Optional[float]]] = {}
        if labels is not None:
            labels_fixture = labels.merge(fixture_nodes[["gpu_node_id", "local_vertex"]], on="gpu_node_id", how="inner")
            labels_pdf = labels_fixture.to_pandas()
            if "validator_success" in labels_pdf.columns:
                validator_by_vertex = {
                    int(row.local_vertex): float(row.validator_success)
                    for row in labels_pdf[["local_vertex", "validator_success"]].dropna().itertuples(index=False)
                }
            if "repair_success" in labels_pdf.columns:
                repair_by_vertex = {
                    int(row.local_vertex): float(row.repair_success)
                    for row in labels_pdf[["local_vertex", "repair_success"]].dropna().itertuples(index=False)
                }
            for name, column in (
                ("kmeans", "kmeans_cluster_id"),
                ("som", "som_cell"),
                ("community", "community_id"),
            ):
                optional_partitions[name] = _label_partition(labels_pdf, column)

        partition_maps: Dict[str, Optional[Mapping[int, object]]] = {
            "pagerank_only": None,
            "leiden": _partition_map(leiden_cpu),
            "spectral_balanced_cut": _partition_map(balanced.partition_cpu),
            "spectral_modularity": _partition_map(spectral_mod.partition_cpu),
            **optional_partitions,
        }

        balanced_arr = balanced.partition_cpu["cluster"].to_numpy(dtype=np.int64)
        mod_arr = spectral_mod.partition_cpu["cluster"].to_numpy(dtype=np.int64)
        leiden_arr = leiden_cpu["cluster"].to_numpy(dtype=np.int64)
        optional_agreement["spectral_vs_leiden"] = {
            "balanced_cut_ari": _adjusted_rand_index(balanced_arr, leiden_arr),
            "spectral_modularity_ari": _adjusted_rand_index(mod_arr, leiden_arr),
        }
        if labels_pdf is not None:
            for name, partition in optional_partitions.items():
                if not partition or len(partition) != target_size:
                    optional_agreement[f"spectral_vs_{name}"] = {
                        "balanced_cut_ari": None,
                        "spectral_modularity_ari": None,
                    }
                    continue
                ordered_labels = [partition[v] for v in local_vertices]
                # ARI accepts categorical values after deterministic integer coding.
                _, coded = np.unique(np.asarray(ordered_labels, dtype=str), return_inverse=True)
                optional_agreement[f"spectral_vs_{name}"] = {
                    "balanced_cut_ari": _adjusted_rand_index(balanced_arr, coded),
                    "spectral_modularity_ari": _adjusted_rand_index(mod_arr, coded),
                }

        retrieval = [
            _evaluate_retrieval(
                name=name,
                vertices=local_vertices,
                factual_neighbors=factual_neighbors,
                pagerank=pagerank,
                partition=partition,
                source_ref_by_vertex=source_ref_by_vertex,
                recall_k=recall_k,
                max_seed_queries=min(64, target_size),
                validator_by_vertex=validator_by_vertex,
                repair_by_vertex=repair_by_vertex,
            )
            for name, partition in partition_maps.items()
            if name in {"pagerank_only", "leiden", "spectral_balanced_cut", "spectral_modularity"} or partition is not None
        ]

        edge_family_counts = {
            str(key): int(value)
            for key, value in fixture_edges_pdf.groupby("edge_type").size().to_dict().items()
        }
        factual_edge_count = int(sum(1 for row in fixture_edges_pdf.itertuples(index=False) if _is_factual_edge_type(str(row.edge_type))))
        total_source_refs = len({value for value in source_ref_by_vertex.values() if value})
        max_gpu_observed = max(
            initial_gpu_bytes,
            after_graph_gpu_bytes,
            leiden_gpu_high,
            balanced.observed_gpu_bytes,
            spectral_mod.observed_gpu_bytes,
            _device_used_bytes(cp),
        )
        fixture_runtime_ms = (time.perf_counter() - fixture_started) * 1000.0
        results.append({
            "candidate_count": target_size,
            "selection_seed_gpu_node_id": seed_original,
            "edge_count_typed": int(len(fixture_edges)),
            "edge_count_simple_undirected": int(len(collapsed)),
            "factual_edge_count": factual_edge_count,
            "edge_family_counts": edge_family_counts,
            "distinct_source_refs": total_source_refs,
            "cluster_count_owner": "LEIDEN_CHALLENGER",
            "cluster_count": cluster_count,
            "num_eigenvectors": num_eigen,
            "random_seed": random_seed,
            "repeats": repeats,
            "pagerank": {
                "latency_ms": float(pagerank_ms),
                "converged": None if pagerank_converged is None else bool(pagerank_converged),
            },
            "leiden": {
                "latency_ms": leiden_latency_ms,
                "reported_modularity": leiden_modularity,
                "analyzers": leiden_analyzers,
                "stability_ari": leiden_stability,
            },
            "spectral_balanced_cut": {
                "latency_ms": balanced.latency_ms,
                "analyzers": balanced.analyzers,
                "stability_ari": balanced.stability_ari,
            },
            "spectral_modularity": {
                "latency_ms": spectral_mod.latency_ms,
                "analyzers": spectral_mod.analyzers,
                "stability_ari": spectral_mod.stability_ari,
            },
            "partition_agreement": optional_agreement,
            "retrieval": retrieval,
            "validator_success_available": validator_by_vertex is not None,
            "repair_success_available": repair_by_vertex is not None,
            "gpu_memory": {
                "device_used_bytes_before": int(initial_gpu_bytes),
                "device_used_bytes_observed_high_watermark": int(max_gpu_observed),
                "device_used_delta_observed": int(max_gpu_observed - initial_gpu_bytes),
                "measurement": "CUDA_MEM_GET_INFO_CHECKPOINT_HIGH_WATERMARK_NOT_KERNEL_PEAK",
            },
            "fixture_runtime_ms": float(fixture_runtime_ms),
        })

    completed_at = _now_iso()
    receipt = {
        "schema": "atlas.spectral-live-fixture-receipt.v1",
        "receipt_id": f"receipt:spectral-live-fixture:{int(time.time() * 1000)}",
        "status": "EXECUTED_UNPROVEN",
        "producer": "scripts/atlas/run_fabric_benchmark.py::spectral_live_fixture",
        "producer_revision": "2026-08-20.spectral-live-fixture-v1",
        "started_at": started_at,
        "completed_at": completed_at,
        "input_hash": _sha256_json(input_identity),
        "runtime": {
            "cugraph": _package_version("cugraph-cu13"),
            "cudf": _package_version("cudf-cu13"),
            "cupy": _package_version("cupy-cuda13x"),
        },
        "edge_authority_policy": {
            "factual_oracle": "edge_type excludes semantic/similarity/knn/cooccurrence/lexical markers",
            "semantic_similarity_canonical_authority": False,
        },
        "results": results,
        "promotion_rule": {
            "spectral_is_routing_hint_only": True,
            "daily_graphify_requires_downstream_ablation": True,
            "required_metrics": [
                "cluster_stability",
                "recall_at_k",
                "source_coverage",
                "validator_success_when_available",
                "repair_success_when_available",
                "latency_ms",
                "gpu_bytes_observed",
            ],
        },
    }
    receipt["output_hash"] = _sha256_json(receipt["results"])
    out_path = args.receipt_out or os.path.join(reports_dir, "spectral-live-fixture-receipt.json")
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump(receipt, handle, indent=2)
    print(json.dumps({
        "status": receipt["status"],
        "receipt": os.path.abspath(out_path),
        "candidate_sizes": candidate_sizes,
        "output_hash": receipt["output_hash"],
    }, sort_keys=True))
    return receipt
