#!/usr/bin/env python3
"""Deterministic 500/5000 Parent Atlas spectral routing benchmark.

Input is the packet-level fixture produced by build_spectral_live_fixture.py.
That fixture already has dense gpu_node_id ordinals and combines projected
structural edge families with explicitly-derived SEMANTIC_KNN edges.

This module is imported by run_fabric_benchmark.py. It is not an execution
owner and never writes canonical graph facts, retrieval votes, or mutations.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import time
from importlib.metadata import PackageNotFoundError, version as package_version
from typing import Dict, Mapping, Optional, Sequence

import numpy as np
import pandas as pd

DERIVED_EDGE_MARKERS = ("SIMILAR", "SEMANTIC", "KNN", "COOCCUR", "CO_OCCUR", "LEXICAL")
DEFAULT_RECALL_K = (10, 50, 100)
DEFAULT_SEED = 0x0A71A5


def _version(name: str) -> str:
    try:
        return package_version(name)
    except PackageNotFoundError:
        return "UNKNOWN"


def _hash(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode()).hexdigest()


def _used_gpu_bytes(cp) -> int:
    free_bytes, total_bytes = cp.cuda.runtime.memGetInfo()
    return int(total_bytes - free_bytes)


def _ari(a: Sequence[int], b: Sequence[int]) -> float:
    if len(a) != len(b):
        raise ValueError("ARI arrays must have equal length")
    n = len(a)
    if n < 2:
        return 1.0
    _, ai = np.unique(np.asarray(a), return_inverse=True)
    _, bi = np.unique(np.asarray(b), return_inverse=True)
    table = np.zeros((int(ai.max()) + 1, int(bi.max()) + 1), dtype=np.int64)
    np.add.at(table, (ai, bi), 1)
    comb2 = lambda x: x * (x - 1) / 2.0
    sum_cells = float(np.sum(comb2(table)))
    sum_rows = float(np.sum(comb2(table.sum(axis=1))))
    sum_cols = float(np.sum(comb2(table.sum(axis=0))))
    total = comb2(n)
    if total == 0:
        return 1.0
    expected = sum_rows * sum_cols / total
    maximum = 0.5 * (sum_rows + sum_cols)
    return 1.0 if maximum == expected else float((sum_cells - expected) / (maximum - expected))


def _mean_pairwise_ari(runs: Sequence[np.ndarray]) -> Optional[float]:
    values = [_ari(runs[i], runs[j]) for i in range(len(runs)) for j in range(i + 1, len(runs))]
    return float(np.mean(values)) if values else None


def _is_factual(edge_type: str) -> bool:
    upper = edge_type.upper()
    return not any(marker in upper for marker in DERIVED_EDGE_MARKERS)


def _normalize_partition(frame, cluster_column: str):
    result = frame[["vertex", cluster_column]].rename(columns={cluster_column: "cluster"})
    return result.sort_values("vertex").reset_index(drop=True)


def _partition_map(frame: pd.DataFrame) -> Dict[int, object]:
    return {int(row.vertex): row.cluster for row in frame.itertuples(index=False)}


def _analyzers(cugraph, graph, partition_gpu) -> Mapping[str, Optional[float]]:
    count = int(partition_gpu["cluster"].nunique())
    if count < 2:
        return {"cluster_count": count, "modularity": None, "edge_cut": None, "ratio_cut": None}
    return {
        "cluster_count": count,
        "modularity": float(cugraph.analyzeClustering_modularity(graph, count, partition_gpu)),
        "edge_cut": float(cugraph.analyzeClustering_edge_cut(graph, count, partition_gpu)),
        "ratio_cut": float(cugraph.analyzeClustering_ratio_cut(graph, count, partition_gpu)),
    }


def _factual_neighbors(edges: pd.DataFrame, size: int) -> Dict[int, set[int]]:
    result = {vertex: set() for vertex in range(size)}
    for row in edges.itertuples(index=False):
        if not _is_factual(str(row.edge_type)):
            continue
        src = int(row.src_gpu_node_id)
        dst = int(row.dst_gpu_node_id)
        if src == dst or src >= size or dst >= size:
            continue
        result[src].add(dst)
        result[dst].add(src)
    return result


def _semantic_neighbors(edges: pd.DataFrame, size: int) -> Dict[int, list[tuple[int, float]]]:
    result: Dict[int, list[tuple[int, float]]] = {vertex: [] for vertex in range(size)}
    semantic = edges[edges["edge_type"].astype(str) == "SEMANTIC_KNN"]
    for row in semantic.itertuples(index=False):
        src = int(row.src_gpu_node_id)
        dst = int(row.dst_gpu_node_id)
        if src < size and dst < size and src != dst:
            result[src].append((dst, float(row.weight)))
    for src in result:
        result[src].sort(key=lambda pair: (-pair[1], pair[0]))
    return result


def _rank(seed: int, vertices: Sequence[int], pagerank: Mapping[int, float], partition: Optional[Mapping[int, object]]) -> list[int]:
    if partition is None or seed not in partition:
        return sorted((v for v in vertices if v != seed), key=lambda v: (-pagerank.get(v, 0.0), v))
    label = partition[seed]
    same = [v for v in vertices if v != seed and partition.get(v) == label]
    rest = [v for v in vertices if v != seed and partition.get(v) != label]
    same.sort(key=lambda v: (-pagerank.get(v, 0.0), v))
    rest.sort(key=lambda v: (-pagerank.get(v, 0.0), v))
    return same + rest


def _semantic_rank(seed: int, vertices: Sequence[int], pagerank: Mapping[int, float], semantic: Mapping[int, list[tuple[int, float]]]) -> list[int]:
    seen = {seed}
    ranked: list[int] = []
    for vertex, _weight in semantic.get(seed, []):
        if vertex not in seen:
            seen.add(vertex)
            ranked.append(vertex)
    ranked.extend(sorted((v for v in vertices if v not in seen), key=lambda v: (-pagerank.get(v, 0.0), v)))
    return ranked


def _evaluate_view(
    *,
    name: str,
    vertices: Sequence[int],
    factual: Mapping[int, set[int]],
    source_ref: Mapping[int, Optional[str]],
    ranker,
    recall_k: Sequence[int],
    validator: Optional[Mapping[int, float]],
    repair: Optional[Mapping[int, float]],
) -> Mapping[str, object]:
    eligible = [v for v in vertices if factual.get(v)]
    eligible.sort(key=lambda v: (-len(factual[v]), v))
    seeds = eligible[: min(64, len(eligible))]
    recalls = {k: [] for k in recall_k}
    coverage = {k: [] for k in recall_k}
    reciprocal_ranks: list[float] = []
    validator_values: list[float] = []
    repair_values: list[float] = []
    for seed in seeds:
        relevant = factual[seed]
        ranking = ranker(seed)
        first_relevant_rank = next((i + 1 for i, vertex in enumerate(ranking) if vertex in relevant), None)
        reciprocal_ranks.append(0.0 if first_relevant_rank is None else 1.0 / first_relevant_rank)
        relevant_sources = {source_ref[v] for v in relevant if source_ref.get(v)}
        for k in recall_k:
            top = ranking[:k]
            hits = relevant.intersection(top)
            recalls[k].append(len(hits) / len(relevant))
            hit_sources = {source_ref[v] for v in hits if source_ref.get(v)}
            coverage[k].append(len(hit_sources) / len(relevant_sources) if relevant_sources else (1.0 if hits else 0.0))
        window = ranking[: max(recall_k)]
        if validator:
            values = [validator[v] for v in window if v in validator]
            if values:
                validator_values.append(float(np.mean(values)))
        if repair:
            values = [repair[v] for v in window if v in repair]
            if values:
                repair_values.append(float(np.mean(values)))
    return {
        "view": name,
        "seed_queries": len(seeds),
        "recall": {f"@{k}": float(np.mean(v)) if v else None for k, v in recalls.items()},
        "source_coverage": {f"@{k}": float(np.mean(v)) if v else None for k, v in coverage.items()},
        "mrr_first_factual_neighbor": float(np.mean(reciprocal_ranks)) if reciprocal_ranks else None,
        "validator_success": float(np.mean(validator_values)) if validator_values else None,
        "repair_success": float(np.mean(repair_values)) if repair_values else None,
    }


def run_spectral_live_fixture(args, reports_dir: str) -> Mapping[str, object]:
    try:
        import cupy as cp
        import cudf
        import cugraph
    except ImportError as error:
        raise RuntimeError(f"spectral_live_fixture requires RAPIDS/cuGraph/cuDF/CuPy: {error}") from error

    if not args.nodes or not args.edges:
        raise ValueError("spectral_live_fixture requires --nodes and --edges from build_spectral_live_fixture.py")
    candidate_sizes = sorted(set(args.candidate_size or [500, 5000]))
    recall_k = sorted(set(args.recall_k or DEFAULT_RECALL_K))
    repeats = int(args.repeats or 3)
    seed = int(args.random_seed if args.random_seed is not None else DEFAULT_SEED)
    if repeats < 2:
        raise ValueError("repeats must be >=2 for stability")

    nodes_all = cudf.read_parquet(args.nodes)
    edges_all = cudf.read_parquet(args.edges)
    if args.edge_type:
        edges_all = edges_all[edges_all["edge_type"].isin(args.edge_type)]
    if len(nodes_all) < max(candidate_sizes):
        raise ValueError(f"fixture has {len(nodes_all)} candidates, need {max(candidate_sizes)}")
    labels_all = cudf.read_parquet(args.labels) if args.labels else None

    started_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    results = []
    for size in candidate_sizes:
        fixture_started = time.perf_counter()
        gpu_before = _used_gpu_bytes(cp)
        prep_started = time.perf_counter()
        nodes_gpu = nodes_all[nodes_all["gpu_node_id"] < size].sort_values("gpu_node_id")
        edges_gpu = edges_all[(edges_all["src_gpu_node_id"] < size) & (edges_all["dst_gpu_node_id"] < size)]
        nodes = nodes_gpu.to_pandas().sort_values("gpu_node_id").reset_index(drop=True)
        edges = edges_gpu.to_pandas().reset_index(drop=True)
        if len(nodes) != size or nodes["gpu_node_id"].tolist() != list(range(size)):
            raise ValueError(f"fixture {size} requires dense gpu_node_id 0..{size - 1}")
        if edges.empty:
            raise ValueError(f"fixture {size} has no edges")

        # cuGraph clustering graph: weighted undirected simple projection.
        simple = edges[["src_gpu_node_id", "dst_gpu_node_id", "weight"]].copy()
        simple["src"] = np.minimum(simple["src_gpu_node_id"].to_numpy(), simple["dst_gpu_node_id"].to_numpy())
        simple["dst"] = np.maximum(simple["src_gpu_node_id"].to_numpy(), simple["dst_gpu_node_id"].to_numpy())
        simple = simple[simple["src"] != simple["dst"]]
        simple = simple.groupby(["src", "dst"], as_index=False)["weight"].sum()
        if simple.empty:
            raise ValueError(f"fixture {size} has no non-self graph edges")
        simple_gpu = cudf.from_pandas(simple)
        graph = cugraph.Graph(directed=False)
        graph.from_cudf_edgelist(
            simple_gpu,
            source="src",
            destination="dst",
            edge_attr="weight",
            vertices=cudf.Series(np.arange(size, dtype=np.int64)),
            renumber=False,
            store_transposed=True,
        )
        prep_ms = (time.perf_counter() - prep_started) * 1000.0
        gpu_after_graph = _used_gpu_bytes(cp)

        factual = _factual_neighbors(edges, size)
        semantic = _semantic_neighbors(edges, size)
        source_ref = {
            int(row.gpu_node_id): (None if pd.isna(row.source_ref) else str(row.source_ref))
            for row in nodes.itertuples(index=False)
        }

        pagerank_started = time.perf_counter()
        pr_result = cugraph.pagerank(graph, alpha=0.85, max_iter=100, tol=1e-8, fail_on_nonconvergence=False)
        if isinstance(pr_result, tuple):
            pr_gpu, pr_converged = pr_result
        else:
            pr_gpu, pr_converged = pr_result, None
        cp.cuda.runtime.deviceSynchronize()
        pagerank_ms = (time.perf_counter() - pagerank_started) * 1000.0
        pr_pdf = pr_gpu.to_pandas()
        pagerank = {int(row.vertex): float(row.pagerank) for row in pr_pdf.itertuples(index=False)}

        # Leiden first: its observed community count is a challenger for k, not canonical truth.
        leiden_runs: list[np.ndarray] = []
        leiden_first_gpu = None
        leiden_first_cpu = None
        leiden_latency = None
        leiden_reported_modularity = None
        gpu_high = max(gpu_before, gpu_after_graph, _used_gpu_bytes(cp))
        for repeat in range(repeats):
            t0 = time.perf_counter()
            partition, modularity = cugraph.leiden(
                graph, max_iter=100, resolution=1.0, random_state=seed + repeat, theta=1.0
            )
            cp.cuda.runtime.deviceSynchronize()
            elapsed = (time.perf_counter() - t0) * 1000.0
            gpu_high = max(gpu_high, _used_gpu_bytes(cp))
            normalized = _normalize_partition(partition, "partition")
            cpu = normalized.to_pandas()
            leiden_runs.append(cpu["cluster"].to_numpy(np.int64))
            if repeat == 0:
                leiden_first_gpu = normalized
                leiden_first_cpu = cpu
                leiden_latency = elapsed
                leiden_reported_modularity = float(modularity)
        assert leiden_first_gpu is not None and leiden_first_cpu is not None
        cluster_count = max(2, min(int(leiden_first_cpu["cluster"].nunique()), size - 1))
        eigenvectors = min(cluster_count, max(2, int(math.ceil(math.log2(cluster_count)))))

        def run_spectral(method: str):
            runs: list[np.ndarray] = []
            first_gpu = None
            first_cpu = None
            first_latency = None
            local_high = _used_gpu_bytes(cp)
            for repeat in range(repeats):
                kwargs = dict(
                    num_clusters=cluster_count,
                    num_eigen_vects=eigenvectors,
                    evs_tolerance=1e-5,
                    evs_max_iter=100,
                    kmean_tolerance=1e-5,
                    kmean_max_iter=100,
                    random_state=seed + repeat,
                )
                t0 = time.perf_counter()
                raw = (
                    cugraph.spectralBalancedCutClustering(graph, **kwargs)
                    if method == "BALANCED_CUT"
                    else cugraph.spectralModularityMaximizationClustering(graph, **kwargs)
                )
                cp.cuda.runtime.deviceSynchronize()
                elapsed = (time.perf_counter() - t0) * 1000.0
                local_high = max(local_high, _used_gpu_bytes(cp))
                normalized = _normalize_partition(raw, "cluster")
                cpu = normalized.to_pandas()
                runs.append(cpu["cluster"].to_numpy(np.int64))
                if repeat == 0:
                    first_gpu, first_cpu, first_latency = normalized, cpu, elapsed
            return {
                "gpu": first_gpu,
                "cpu": first_cpu,
                "latency_ms": float(first_latency),
                "stability_ari": _mean_pairwise_ari(runs),
                "analyzers": _analyzers(cugraph, graph, first_gpu),
                "gpu_high": int(local_high),
            }

        balanced = run_spectral("BALANCED_CUT")
        spectral_mod = run_spectral("MODULARITY_MAXIMIZATION")
        gpu_high = max(gpu_high, balanced["gpu_high"], spectral_mod["gpu_high"], _used_gpu_bytes(cp))

        labels = None
        if labels_all is not None:
            labels = labels_all[labels_all["gpu_node_id"] < size].to_pandas()
        optional_partitions: Dict[str, Optional[Dict[int, object]]] = {}
        validator = repair = None
        if labels is not None:
            for name, column in (("kmeans", "kmeans_cluster_id"), ("som", "som_cell"), ("community", "community_id")):
                if column in labels.columns:
                    rows = labels[["gpu_node_id", column]].dropna()
                    optional_partitions[name] = {int(r.gpu_node_id): getattr(r, column) for r in rows.itertuples(index=False)} or None
            if "validator_success" in labels.columns:
                rows = labels[["gpu_node_id", "validator_success"]].dropna()
                validator = {int(r.gpu_node_id): float(r.validator_success) for r in rows.itertuples(index=False)}
            if "repair_success" in labels.columns:
                rows = labels[["gpu_node_id", "repair_success"]].dropna()
                repair = {int(r.gpu_node_id): float(r.repair_success) for r in rows.itertuples(index=False)}

        leiden_map = _partition_map(leiden_first_cpu)
        balanced_map = _partition_map(balanced["cpu"])
        spectral_mod_map = _partition_map(spectral_mod["cpu"])
        vertices = list(range(size))
        retrieval = [
            _evaluate_view(
                name="pagerank_only", vertices=vertices, factual=factual, source_ref=source_ref,
                ranker=lambda q: _rank(q, vertices, pagerank, None), recall_k=recall_k, validator=validator, repair=repair,
            ),
            _evaluate_view(
                name="semantic_knn_plus_pagerank", vertices=vertices, factual=factual, source_ref=source_ref,
                ranker=lambda q: _semantic_rank(q, vertices, pagerank, semantic), recall_k=recall_k, validator=validator, repair=repair,
            ),
            _evaluate_view(
                name="leiden_plus_pagerank", vertices=vertices, factual=factual, source_ref=source_ref,
                ranker=lambda q: _rank(q, vertices, pagerank, leiden_map), recall_k=recall_k, validator=validator, repair=repair,
            ),
            _evaluate_view(
                name="spectral_balanced_cut_plus_pagerank", vertices=vertices, factual=factual, source_ref=source_ref,
                ranker=lambda q: _rank(q, vertices, pagerank, balanced_map), recall_k=recall_k, validator=validator, repair=repair,
            ),
            _evaluate_view(
                name="spectral_modularity_plus_pagerank", vertices=vertices, factual=factual, source_ref=source_ref,
                ranker=lambda q: _rank(q, vertices, pagerank, spectral_mod_map), recall_k=recall_k, validator=validator, repair=repair,
            ),
        ]
        for name, partition in optional_partitions.items():
            if partition:
                retrieval.append(_evaluate_view(
                    name=f"{name}_plus_pagerank", vertices=vertices, factual=factual, source_ref=source_ref,
                    ranker=lambda q, p=partition: _rank(q, vertices, pagerank, p), recall_k=recall_k, validator=validator, repair=repair,
                ))

        agreement = {
            "balanced_cut_vs_leiden_ari": _ari(balanced["cpu"]["cluster"].to_numpy(np.int64), leiden_first_cpu["cluster"].to_numpy(np.int64)),
            "spectral_modularity_vs_leiden_ari": _ari(spectral_mod["cpu"]["cluster"].to_numpy(np.int64), leiden_first_cpu["cluster"].to_numpy(np.int64)),
        }
        for name, partition in optional_partitions.items():
            if partition and len(partition) == size:
                ordered = np.asarray([str(partition[v]) for v in vertices])
                _, coded = np.unique(ordered, return_inverse=True)
                agreement[f"balanced_cut_vs_{name}_ari"] = _ari(balanced["cpu"]["cluster"].to_numpy(np.int64), coded)
                agreement[f"spectral_modularity_vs_{name}_ari"] = _ari(spectral_mod["cpu"]["cluster"].to_numpy(np.int64), coded)
            else:
                agreement[f"balanced_cut_vs_{name}_ari"] = None
                agreement[f"spectral_modularity_vs_{name}_ari"] = None

        edge_family_counts = {str(k): int(v) for k, v in edges.groupby("edge_type").size().to_dict().items()}
        results.append({
            "candidate_count": size,
            "edge_count_typed": int(len(edges)),
            "edge_count_simple_undirected": int(len(simple)),
            "edge_family_counts": edge_family_counts,
            "factual_edge_count": int(sum(_is_factual(str(v)) for v in edges["edge_type"])),
            "semantic_knn_edge_count": int((edges["edge_type"].astype(str) == "SEMANTIC_KNN").sum()),
            "distinct_source_refs": len({v for v in source_ref.values() if v}),
            "sparse_representation": {
                "fixture_input": "COO_TYPED_EDGE_LIST",
                "cugraph_executor": "WEIGHTED_UNDIRECTED_COMPRESSED_GRAPH",
                "store_transposed": True,
            },
            "cluster_count_owner": "LEIDEN_CHALLENGER",
            "cluster_count": cluster_count,
            "num_eigenvectors": eigenvectors,
            "random_seed": seed,
            "repeats": repeats,
            "pagerank": {"latency_ms": pagerank_ms, "converged": None if pr_converged is None else bool(pr_converged)},
            "leiden": {
                "latency_ms": leiden_latency,
                "reported_modularity": leiden_reported_modularity,
                "analyzers": _analyzers(cugraph, graph, leiden_first_gpu),
                "stability_ari": _mean_pairwise_ari(leiden_runs),
            },
            "spectral_balanced_cut": {
                "latency_ms": balanced["latency_ms"], "analyzers": balanced["analyzers"], "stability_ari": balanced["stability_ari"],
            },
            "spectral_modularity": {
                "latency_ms": spectral_mod["latency_ms"], "analyzers": spectral_mod["analyzers"], "stability_ari": spectral_mod["stability_ari"],
            },
            "partition_agreement": agreement,
            "retrieval": retrieval,
            "validator_success_available": validator is not None,
            "repair_success_available": repair is not None,
            "latency": {"host_gpu_fixture_prep_ms": prep_ms, "total_fixture_ms": (time.perf_counter() - fixture_started) * 1000.0},
            "gpu_memory": {
                "used_bytes_before": gpu_before,
                "used_bytes_after_graph": gpu_after_graph,
                "observed_high_watermark_bytes": gpu_high,
                "observed_delta_bytes": gpu_high - gpu_before,
                "measurement": "CUDA_MEM_GET_INFO_CHECKPOINT_HIGH_WATERMARK_NOT_KERNEL_PEAK",
            },
        })

    receipt = {
        "schema": "atlas.spectral-live-fixture-receipt.v1",
        "status": "EXECUTED_UNPROVEN",
        "producer": "run_fabric_benchmark.py::spectral_live_fixture",
        "producer_revision": "2026-08-20.spectral-live-fixture-v2",
        "started_at": started_at,
        "completed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "input": {
            "nodes": os.path.abspath(args.nodes),
            "edges": os.path.abspath(args.edges),
            "labels": os.path.abspath(args.labels) if args.labels else None,
            "candidate_sizes": candidate_sizes,
            "recall_k": recall_k,
            "edge_types": sorted(args.edge_type or []),
        },
        "runtime": {"cugraph": _version("cugraph-cu13"), "cudf": _version("cudf-cu13"), "cupy": _version("cupy-cuda13x")},
        "edge_authority": {"SEMANTIC_KNN": "DERIVED_SIMILARITY", "factual_oracle_excludes_derived_similarity": True},
        "results": results,
        "promotion_rule": {
            "spectral_is_routing_hint_only": True,
            "daily_graphify_requires_measurable_delta_over_semantic_leiden_kmeans_som": True,
            "validator_repair_metrics_must_come_from_external_joined_evidence": True,
        },
    }
    receipt["input_hash"] = _hash(receipt["input"])
    receipt["output_hash"] = _hash(results)
    out = args.receipt_out or os.path.join(reports_dir, "spectral-live-fixture-receipt.json")
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w", encoding="utf-8") as handle:
        json.dump(receipt, handle, indent=2)
    print(json.dumps({"status": receipt["status"], "receipt": os.path.abspath(out), "output_hash": receipt["output_hash"]}, sort_keys=True))
    return receipt
