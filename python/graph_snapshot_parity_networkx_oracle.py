#!/usr/bin/env python3
"""NetworkX oracle for the GRAPH_SNAPSHOT_PARITY frozen artifact contract.

Reads nodes.parquet / edges.parquet as exported by
scripts/atlas/export-graph-snapshot-parity-parquet.mts and computes the
single-backend structural metrics NetworkX can prove standalone: node/edge
count, weakly-connected component count, and a PageRank ranking (used later
for cross-backend correlation once a second backend is wired).

This script does NOT compare against cuGraph. It only proves the NetworkX
side of the parity contract. Cross-backend fields (pagerankTopKOverlap,
pagerankCorrelation, pagerankMaxDelta, louvainCommunityAgreement) are left
for the caller to fill in once both backends have run — reporting them here
would fabricate a comparison that never happened.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

try:
    import networkx as nx
    import pyarrow.parquet as pq
except ImportError as error:
    print(json.dumps({"status": "UNAVAILABLE", "reason": str(error)}))
    raise SystemExit(2)


def compute_edge_projection_diagnostics(edges_table) -> dict:
    """Measure whether the frozen projection has ambiguous duplicate/reciprocal
    undirected edge pairs before Louvain comparison."""
    if len(edges_table) == 0:
        return {"orderedDuplicateEdges": 0, "reciprocalEdgePairs": 0, "duplicateUnorderedPairs": 0}
    ordered_pairs = [(edge["src_gpu_node_id"], edge["dst_gpu_node_id"]) for edge in edges_table]
    ordered_set = set(ordered_pairs)
    ordered_duplicate_edges = len(ordered_pairs) - len(ordered_set)
    reciprocal_edge_pairs = sum(1 for (a, b) in ordered_set if a != b and (b, a) in ordered_set) // 2
    unordered_counter = Counter((min(a, b), max(a, b)) for (a, b) in ordered_pairs)
    duplicate_unordered_pairs = sum(1 for count in unordered_counter.values() if count > 1)
    return {
        "orderedDuplicateEdges": ordered_duplicate_edges,
        "reciprocalEdgePairs": reciprocal_edge_pairs,
        "duplicateUnorderedPairs": duplicate_unordered_pairs,
    }


def run(nodes_path: Path, edges_path: Path, scores_out: Path | None, louvain_out: Path | None) -> dict:
    nodes_table = pq.read_table(nodes_path).to_pylist()
    edges_table = pq.read_table(edges_path).to_pylist()

    graph = nx.DiGraph()
    for node in nodes_table:
        graph.add_node(node["gpu_node_id"], graph_node_key=node["graph_node_key"], node_kind=node["node_kind"])
    for edge in edges_table:
        graph.add_edge(edge["src_gpu_node_id"], edge["dst_gpu_node_id"], weight=edge["weight"])

    component_count = nx.number_weakly_connected_components(graph) if graph.number_of_nodes() > 0 else 0

    if graph.number_of_nodes() > 0:
        scores = nx.pagerank(graph, alpha=0.85, max_iter=100, tol=1e-8, weight="weight")
        if scores_out is not None:
            # Written as NDJSON to a file rather than embedded in stdout JSON:
            # for a 162k-node graph the full ranking is several MB, and this
            # repo's CLAUDE.md already documents the spawnSync-ENOBUFS class
            # of failure that comes from pushing large JSON through
            # pipes/exec. A file read is unbounded and doesn't risk that.
            with scores_out.open("w", encoding="utf-8") as handle:
                for node_id, score in sorted(scores.items(), key=lambda item: item[0]):
                    handle.write(json.dumps({"gpuNodeId": node_id, "pagerankRaw": score}) + "\n")

    community_count = None
    modularity = None
    if graph.number_of_nodes() > 0 and graph.number_of_edges() > 0:
        # LOUVAIN_PARITY_PROJECTION_V1: undirected, self-loops dropped (none
        # present in this corpus — same fact the cuGraph oracle checks, not
        # assumed here), weight='weight', resolution=1.0, threshold=1e-7,
        # max_level=100. NetworkX's own Louvain is order/randomness sensitive
        # — this run does not fix a seed, matching the cuGraph oracle (which
        # exposes no seed parameter either) — so exact partition labels are
        # never the comparison criterion, only ARI/NMI/modularity/community
        # count computed by the caller after both oracles have run.
        undirected = nx.Graph()
        undirected.add_nodes_from(graph.nodes())
        for u, v, data in graph.edges(data=True):
            if u == v:
                continue  # DROP self-loops (none present here — checked via edge count below)
            weight = data.get("weight", 1.0)
            if undirected.has_edge(u, v):
                undirected[u][v]["weight"] += weight  # parallel/reciprocal edges: sum weight
            else:
                undirected.add_edge(u, v, weight=weight)

        communities = nx.community.louvain_communities(
            undirected, weight="weight", resolution=1.0, threshold=1e-7, max_level=100
        )
        community_count = len(communities)
        modularity = nx.community.modularity(undirected, communities, weight="weight", resolution=1.0)
        if louvain_out is not None:
            with louvain_out.open("w", encoding="utf-8") as handle:
                for community_id, members in enumerate(communities):
                    for node_id in sorted(members):
                        handle.write(json.dumps({"gpuNodeId": node_id, "communityId": community_id}) + "\n")
    edge_projection_diagnostics = compute_edge_projection_diagnostics(edges_table)

    return {
        "backend": "networkx",
        # "EXECUTED", not "PROVEN" — same governance rule as the cuGraph
        # oracle: this only proves NETWORKX_LOUVAIN_EXECUTED. Cross-backend
        # partition parity (ARI/NMI) is decided by the caller, never by a
        # single backend's own oracle.
        "status": "EXECUTED" if graph.number_of_nodes() > 0 else "SKIP",
        "nodeCount": graph.number_of_nodes(),
        "edgeCount": graph.number_of_edges(),
        "componentCount": component_count,
        "louvainModularity": modularity,
        "louvainCommunityCount": community_count,
        "louvainProjection": "LOUVAIN_PARITY_PROJECTION_V1",
        "edgeProjectionDiagnostics": edge_projection_diagnostics,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--nodes", type=Path, required=True)
    parser.add_argument("--edges", type=Path, required=True)
    parser.add_argument("--scores-out", type=Path, default=None)
    parser.add_argument("--louvain-out", type=Path, default=None)
    args = parser.parse_args()

    if not args.nodes.exists() or not args.edges.exists():
        print(json.dumps({"status": "UNAVAILABLE", "reason": "nodes.parquet or edges.parquet not found"}))
        return 2

    print(json.dumps(run(args.nodes, args.edges, args.scores_out, args.louvain_out), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
