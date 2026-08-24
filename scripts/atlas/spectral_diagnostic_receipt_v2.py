#!/usr/bin/env python3
"""Read-only cuGraph spectral determinism and objective diagnostic.

This diagnostic consumes a frozen nodes.parquet/edges.parquet fixture. It does
not write graph facts, projections, or retrieval state. Cluster labels are
canonicalized before checksums and ARI comparisons because GPU label integers
are arbitrary.
"""

from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import platform
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


def digest(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def canonical_labels(frame: Any, vertex_column: str = "vertex", cluster_column: str = "cluster") -> list[int]:
    rows = frame[[vertex_column, cluster_column]].sort_values(vertex_column)
    remap: dict[Any, int] = {}
    result: list[int] = []
    for value in rows[cluster_column].to_pandas().tolist() if hasattr(rows[cluster_column], "to_pandas") else rows[cluster_column].tolist():
        if value not in remap:
            remap[value] = len(remap)
        result.append(remap[value])
    return result


def ari(left: list[int], right: list[int]) -> float:
    if len(left) != len(right):
        raise ValueError("ARI inputs must have equal length")
    if len(left) < 2:
        return 1.0
    _, li = np.unique(np.asarray(left), return_inverse=True)
    _, ri = np.unique(np.asarray(right), return_inverse=True)
    table = np.zeros((int(li.max()) + 1, int(ri.max()) + 1), dtype=np.int64)
    np.add.at(table, (li, ri), 1)
    comb2 = lambda values: values * (values - 1) / 2.0
    cells = float(np.sum(comb2(table)))
    rows = float(np.sum(comb2(table.sum(axis=1))))
    cols = float(np.sum(comb2(table.sum(axis=0))))
    total = comb2(len(left))
    expected = rows * cols / total
    maximum = 0.5 * (rows + cols)
    return 1.0 if maximum == expected else float((cells - expected) / (maximum - expected))


def co_membership_agreement(left: list[int], right: list[int]) -> float:
    if len(left) != len(right):
        raise ValueError("co-membership inputs must have equal length")
    if len(left) < 2:
        return 1.0
    total = 0
    matching = 0
    for first in range(len(left)):
        for second in range(first + 1, len(left)):
            total += 1
            matching += (left[first] == left[second]) == (right[first] == right[second])
    return matching / total


def contingency(left: list[int], right: list[int]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for left_label, right_label in zip(left, right):
        key = f"{left_label}:{right_label}"
        counts[key] = counts.get(key, 0) + 1
    return counts


def align_labels(reference: list[int], candidate: list[int]) -> list[int]:
    labels = sorted(set(candidate))
    target = sorted(set(reference))
    if len(labels) != len(target) or len(labels) > 9:
        return candidate
    best = candidate
    best_matches = -1
    for permutation in itertools.permutations(target):
        mapping = dict(zip(labels, permutation))
        aligned = [mapping[label] for label in candidate]
        matches = sum(left == right for left, right in zip(reference, aligned))
        if matches > best_matches:
            best_matches = matches
            best = aligned
    return best


def coo_audit(edges: pd.DataFrame) -> dict[str, int | str]:
    pairs = list(zip(edges["src_gpu_node_id"].astype(int), edges["dst_gpu_node_id"].astype(int)))
    undirected = [tuple(sorted(pair)) for pair in pairs]
    directed_unique = len(set(pairs))
    undirected_unique = len(set(undirected))
    self_loops = sum(source == target for source, target in pairs)
    return {
        "rawEdgeCount": len(pairs),
        "uniqueDirectedEdgeCount": directed_unique,
        "uniqueUndirectedEdgeCount": undirected_unique,
        "selfLoopCount": self_loops,
        "cooEntryCount": len(pairs) * 2,
        "uniqueCooEntryCount": directed_unique * 2,
        "duplicateCooEntryCount": max(0, len(pairs) * 2 - directed_unique * 2),
        "symmetricExpansionCount": len(pairs),
        "duplicateReductionPolicy": "none_required" if directed_unique == len(pairs) else "grouped_before_gpu",
        "weightAggregationPolicy": "fixture_preaggregated_by_undirected_pair",
        "cooChecksum": digest([(int(s), int(t), float(w)) for s, t, w in edges[["src_gpu_node_id", "dst_gpu_node_id", "weight"]].itertuples(index=False, name=None)]),
    }


def cpu_objectives(edges: pd.DataFrame, labels: list[int]) -> dict[str, float]:
    degrees = np.zeros(len(labels), dtype=np.float64)
    total = 0.0
    edge_cut = 0.0
    for source, target, weight in edges[["src_gpu_node_id", "dst_gpu_node_id", "weight"]].itertuples(index=False, name=None):
        source, target, weight = int(source), int(target), float(weight)
        degrees[source] += weight
        degrees[target] += weight
        total += weight
        if labels[source] != labels[target]:
            edge_cut += weight
    modularity = 0.0
    for source, target, weight in edges[["src_gpu_node_id", "dst_gpu_node_id", "weight"]].itertuples(index=False, name=None):
        source, target, weight = int(source), int(target), float(weight)
        if labels[source] == labels[target]:
            modularity += 2.0 * (weight - degrees[source] * degrees[target] / (2.0 * total))
    modularity /= 2.0 * total
    ratio_cut = 0.0
    for cluster in sorted(set(labels)):
        members = {index for index, label in enumerate(labels) if label == cluster}
        boundary = sum(
            float(weight)
            for source, target, weight in edges[["src_gpu_node_id", "dst_gpu_node_id", "weight"]].itertuples(index=False, name=None)
            if (int(source) in members) != (int(target) in members)
        )
        ratio_cut += boundary / len(members)
    # Use NetworkX's weighted modularity definition as the CPU oracle. The
    # earlier hand calculation used a different edge-mass normalization.
    return {"modularity": networkx_modularity(edges, labels), "edgeCut": float(edge_cut), "ratioCut": float(ratio_cut)}


def networkx_modularity(edges: pd.DataFrame, labels: list[int]) -> float:
    import networkx as nx  # type: ignore

    graph = nx.Graph()
    graph.add_nodes_from(range(len(labels)))
    for source, target, weight in edges[["src_gpu_node_id", "dst_gpu_node_id", "weight"]].itertuples(index=False, name=None):
        graph.add_edge(int(source), int(target), weight=float(weight))
    communities: dict[int, set[int]] = {}
    for vertex, cluster in enumerate(labels):
        communities.setdefault(int(cluster), set()).add(vertex)
    return float(nx.algorithms.community.quality.modularity(graph, list(communities.values()), weight="weight"))


def kmeans_census(
    vertex_count: int,
    edge_records: list[tuple[int, int, float]],
    cluster_count: int,
    component_count: int,
    baseline_labels: list[int],
    seed: int,
) -> dict[str, Any]:
    try:
        from cuml.cluster import KMeans  # type: ignore
        from atlas_compute.spectral_reference import modularity_matrix  # type: ignore
    except Exception as error:
        return {"available": False, "error": str(error), "runs": []}

    matrix = modularity_matrix(vertex_count, edge_records)
    eigenvalues, eigenvectors = np.linalg.eigh(matrix)
    selected = eigenvectors[:, np.argsort(eigenvalues)[::-1][:component_count]]
    embedding = selected / np.maximum(np.linalg.norm(selected, axis=1, keepdims=True), 1e-15)
    runs: list[dict[str, Any]] = []
    for init in ("scalable-k-means++", "k-means++", "random"):
        for n_init in (1, 10):
            try:
                model = KMeans(
                    n_clusters=cluster_count,
                    max_iter=100,
                    tol=1e-5,
                    random_state=seed,
                    init=init,
                    n_init=n_init,
                )
                labels = [int(value) for value in model.fit_predict(embedding).tolist()]
                runs.append(
                    {
                        "init": init,
                        "nInit": n_init,
                        "ariToCuGraph": ari(labels, baseline_labels),
                        "coMembershipAgreement": co_membership_agreement(labels, baseline_labels),
                        "inertia": float(model.inertia_),
                    }
                )
            except Exception as error:
                runs.append({"init": init, "nInit": n_init, "error": str(error)})
    return {
        "available": True,
        "cumlVersion": __import__("cuml").__version__,
        "embedding": "cpu_modularity_eigenvectors_row_l2_normalized",
        "embeddingChecksum": digest(embedding.tolist()),
        "runs": runs,
    }


def run(args: argparse.Namespace) -> dict[str, Any]:
    import cudf  # type: ignore
    import cugraph  # type: ignore
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "python"))
    from atlas_compute.spectral_reference import spectral_partition  # type: ignore

    nodes = pd.read_parquet(args.nodes)
    edges = pd.read_parquet(args.edges)
    nodes = nodes.sort_values("gpu_node_id").reset_index(drop=True)
    if args.candidate_size:
        nodes = nodes.head(args.candidate_size).copy()
    edges = edges[["src_gpu_node_id", "dst_gpu_node_id", "weight"]].copy()
    allowed_nodes = set(nodes["gpu_node_id"].astype(int).tolist())
    edges = edges[
        edges["src_gpu_node_id"].astype(int).isin(allowed_nodes)
        & edges["dst_gpu_node_id"].astype(int).isin(allowed_nodes)
    ].copy()
    edges["src_gpu_node_id"] = edges["src_gpu_node_id"].astype(np.int32)
    edges["dst_gpu_node_id"] = edges["dst_gpu_node_id"].astype(np.int32)
    edges["weight"] = edges["weight"].astype(float)
    graph_checksum = digest(nodes[["gpu_node_id", "packet_key"]].astype(str).to_dict("records"))
    ordinal_checksum = digest(nodes["gpu_node_id"].astype(int).tolist())
    audit = coo_audit(edges)

    gpu_edges = cudf.DataFrame(edges)
    graph = cugraph.Graph(directed=False)
    graph.from_cudf_edgelist(
        gpu_edges,
        source="src_gpu_node_id",
        destination="dst_gpu_node_id",
        edge_attr="weight",
    )

    tolerances = [float(value) for value in args.tolerances.split(",") if value.strip()]
    tolerance_runs: list[dict[str, Any]] = []
    for tolerance in tolerances:
        partitions = []
        timings = []
        analyzer_rows = []
        gpu_analyzer_rows = []
        for _ in range(3):
            started = time.perf_counter()
            partition = cugraph.spectralModularityMaximizationClustering(
                graph,
                num_clusters=args.cluster_count,
                num_eigen_vects=args.num_eigen_vects,
                evs_tolerance=tolerance,
                evs_max_iter=args.evs_max_iter,
                kmean_tolerance=args.kmean_tolerance,
                kmean_max_iter=args.kmean_max_iter,
                random_state=args.random_seed,
            )
            timings.append((time.perf_counter() - started) * 1000.0)
            labels = canonical_labels(partition)
            partitions.append(labels)
            analyzer_rows.append(cpu_objectives(edges, labels))
            cluster_count = int(partition["cluster"].nunique())
            gpu_analyzer_rows.append(
                {
                    "modularity": float(cugraph.analyzeClustering_modularity(graph, cluster_count, partition)),
                    "edgeCut": float(cugraph.analyzeClustering_edge_cut(graph, cluster_count, partition)),
                    "ratioCut": float(cugraph.analyzeClustering_ratio_cut(graph, cluster_count, partition)),
                }
            )
        checksums = [digest(labels) for labels in partitions]
        tolerance_runs.append(
            {
                "evsTolerance": tolerance,
                "runs": 3,
                "assignmentChecksums": checksums,
                "canonicalPartitionChecksums": checksums,
                "gpuGpuARI": [ari(partitions[0], partitions[index]) for index in (1, 2)],
                "gpuRepeatDeterministic": len(set(checksums)) == 1,
                "objective": analyzer_rows[0],
                "gpuObjective": gpu_analyzer_rows[0],
                "networkxModularity": networkx_modularity(edges, partitions[0]),
                "cpuGpuObjectiveDelta": {
                    key: analyzer_rows[0][key] - gpu_analyzer_rows[0][key]
                    for key in analyzer_rows[0]
                },
                "objectiveSpread": {
                    key: max(row[key] for row in analyzer_rows) - min(row[key] for row in analyzer_rows)
                    for key in analyzer_rows[0]
                },
                "elapsedMs": timings,
            }
        )

    edge_records = [
        (int(source), int(target), float(weight))
        for source, target, weight in edges[["src_gpu_node_id", "dst_gpu_node_id", "weight"]].itertuples(index=False, name=None)
    ]
    reference_comparisons: list[dict[str, Any]] = []
    gpu_baseline = next((item for item in tolerance_runs if item["evsTolerance"] == 1e-5), tolerance_runs[0])
    gpu_baseline_labels = None
    # Re-run only the baseline once for the CPU comparison; the determinism
    # sweep above remains the source of GPU repeat evidence.
    baseline_partition = cugraph.spectralModularityMaximizationClustering(
        graph,
        num_clusters=args.cluster_count,
        num_eigen_vects=args.num_eigen_vects,
        evs_tolerance=float(gpu_baseline["evsTolerance"]),
        evs_max_iter=args.evs_max_iter,
        kmean_tolerance=args.kmean_tolerance,
        kmean_max_iter=args.kmean_max_iter,
        random_state=args.random_seed,
    )
    gpu_baseline_labels = canonical_labels(baseline_partition)
    for operator in ("normalized_laplacian", "modularity"):
        cpu_result = spectral_partition(
            len(nodes),
            edge_records,
            cluster_count=args.cluster_count,
            num_eigenvectors=args.num_eigen_vects,
            kmeans_iterations=args.kmean_max_iter,
            operator=operator,
        )

        cpu_labels = [int(item["cluster"]) for item in cpu_result["assignments"]]
        aligned_gpu_labels = align_labels(cpu_labels, gpu_baseline_labels)
        reference_comparisons.append(
            {
                "operator": operator,
                "cpuAssignmentChecksum": cpu_result["assignment_checksum"],
                "cpuGpuARI": ari(cpu_labels, gpu_baseline_labels),
                "coMembershipAgreement": co_membership_agreement(cpu_labels, aligned_gpu_labels),
                "movedNodeCount": sum(left != right for left, right in zip(cpu_labels, aligned_gpu_labels)),
                "movedNodeOrdinals": [
                    index for index, (left, right) in enumerate(zip(cpu_labels, aligned_gpu_labels)) if left != right
                ],
                "cpuClusterSizes": {str(label): cpu_labels.count(label) for label in sorted(set(cpu_labels))},
                "gpuClusterSizes": {str(label): aligned_gpu_labels.count(label) for label in sorted(set(aligned_gpu_labels))},
                "clusterContingency": contingency(cpu_labels, aligned_gpu_labels),
                "cpuObjectives": cpu_objectives(edges, cpu_labels),
                "eigenspace": cpu_result["eigenspace"],
            }
        )

    census = kmeans_census(
        len(nodes), edge_records, args.cluster_count, args.num_eigen_vects, gpu_baseline_labels, args.random_seed
    )

    return {
        "schema": "atlas.spectral-diagnostic-receipt.v2",
        "producer": "scripts/atlas/spectral_diagnostic_receipt_v2.py",
        "readOnly": True,
        "runtime": {
            "python": platform.python_version(),
            "platform": platform.platform(),
            "cugraphVersion": getattr(cugraph, "__version__", "UNKNOWN"),
            "cudfVersion": getattr(cudf, "__version__", "UNKNOWN"),
            "spectralApiOwner": "CUGRAPH",
            "spectralImplementation": "CUVS_LEGACY_CUGRAPH_WRAPPER",
        },
        "frozenConfiguration": {
            "clusterCount": args.cluster_count,
            "numEigenvectors": args.num_eigen_vects,
            "evsMaxIterations": args.evs_max_iter,
            "kmeanTolerance": args.kmean_tolerance,
            "kmeanMaxIterations": args.kmean_max_iter,
            "randomSeed": args.random_seed,
            "nInit": None,
            "kmeansInitMethod": None,
            "kmeansOversamplingFactor": None,
            "observability": "NOT_EXPOSED_BY_CUGRAPH_WRAPPER",
            "gpuEigenvectorsExposed": False,
            "eigenvectorObservability": "ASSIGNMENTS_ONLY_FROM_CUGRAPH_PYTHON_WRAPPER",
            "nextParityPath": "CUVS_SPECTRAL_EMBEDDING_PRECOMPUTED_COO_OR_CUML_CPP",
        },
        "fixture": {
            "nodes": str(Path(args.nodes).resolve()),
            "edges": str(Path(args.edges).resolve()),
            "nodeCount": len(nodes),
            "graphChecksum": graph_checksum,
            "ordinalMapChecksum": ordinal_checksum,
            "cooAudit": audit,
        },
        "diagnostics": {
            "gpuRepeatDeterminism": all(item["gpuRepeatDeterministic"] for item in tolerance_runs),
            "toleranceSweep": tolerance_runs,
            "cpuReferenceComparisons": reference_comparisons,
            "kmeansCensus": census,
            "promotionGate": {"cpuGpuARI": 0.99, "state": "BLOCKED", "reason": "cpu_gpu_ari_below_threshold"},
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--nodes", required=True)
    parser.add_argument("--edges", required=True)
    parser.add_argument("--receipt-out", required=True)
    parser.add_argument("--cluster-count", type=int, required=True)
    parser.add_argument("--candidate-size", type=int)
    parser.add_argument("--num-eigen-vects", type=int, required=True)
    parser.add_argument("--random-seed", type=int, required=True)
    parser.add_argument("--evs-max-iter", type=int, default=100)
    parser.add_argument("--kmean-tolerance", type=float, default=1e-5)
    parser.add_argument("--kmean-max-iter", type=int, default=100)
    parser.add_argument("--tolerances", default="1e-4,1e-5,1e-6,1e-7")
    args = parser.parse_args()
    receipt = run(args)
    output = Path(args.receipt_out)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"receipt": str(output), "schema": receipt["schema"], "gpuRepeatDeterminism": receipt["diagnostics"]["gpuRepeatDeterminism"], "duplicateCooEntryCount": receipt["fixture"]["cooAudit"]["duplicateCooEntryCount"]}, indent=2))


if __name__ == "__main__":
    main()
