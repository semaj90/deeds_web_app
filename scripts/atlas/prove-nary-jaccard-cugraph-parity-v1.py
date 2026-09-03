"""Bounded direct NetworkX/cuGraph Jaccard parity proof.

This is a fixture-only challenger. It uses one shared undirected incidence
topology, supplies the CPU-generated candidate pairs to cuGraph, and compares
results by external node keys. It never writes a datastore or promotes edges.
"""

from __future__ import annotations

import json
import sys
import argparse
from pathlib import Path

# `scripts/atlas/sparse/` is a project namespace, not the third-party sparse
# package expected by RAPIDS' Dask compatibility layer.
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path = [entry for entry in sys.path if Path(entry or ".").resolve() != SCRIPT_DIR]

import cugraph
import cudf
import networkx as nx

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))
from parent_atlas_ontology.networkx_snapshot import bounded_incidence_jaccard  # noqa: E402

GRAPH_REVISION = "graph:nary-jaccard-fixture-v1"


def build_fixture() -> nx.MultiDiGraph:
    graph = nx.MultiDiGraph()
    relations = {
        "relation:r1": ("entity:a", "entity:b", "entity:c"),
        "relation:r2": ("entity:b", "entity:c", "entity:d"),
        "relation:r3": ("entity:x", "entity:y"),
    }
    for relation, participants in relations.items():
        graph.add_node(relation, node_kind="NARY_RELATION")
        for ordinal, participant in enumerate(participants):
            graph.add_node(participant, node_kind="ENTITY")
            graph.add_edge(relation, participant, key=f"{relation}:{ordinal}", edge_kind="PARTICIPANT")
    return graph


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--report-path",
        type=Path,
        default=ROOT / "docs" / "reports" / "nary-jaccard-cugraph-parity-v1.json",
    )
    parser.add_argument("--executor-path", default="DIRECT_PYTHON")
    args = parser.parse_args()
    graph = build_fixture()
    cpu = bounded_incidence_jaccard(graph, graph_revision=GRAPH_REVISION, max_pairs=128)
    node_keys = sorted(graph.nodes, key=lambda node: (str(graph.nodes[node].get("node_kind", "")), str(node)))
    id_by_key = {str(key): index for index, key in enumerate(node_keys)}
    edges = [(id_by_key[str(source)], id_by_key[str(target)]) for source, target in graph.edges()]
    edge_df = cudf.DataFrame({"src": [row[0] for row in edges], "dst": [row[1] for row in edges]})
    gpu_graph = cugraph.Graph(directed=False)
    gpu_graph.from_cudf_edgelist(edge_df, source="src", destination="dst", renumber=False)
    pair_rows = cpu["results"]
    pair_df = cudf.DataFrame({
        "first": [id_by_key[row["leftNodeKey"]] for row in pair_rows],
        "second": [id_by_key[row["rightNodeKey"]] for row in pair_rows],
    })
    gpu_rows = cugraph.jaccard(gpu_graph, vertex_pair=pair_df).to_pandas()
    gpu_by_pair = {
        (int(row.first), int(row.second)): float(row.jaccard_coeff)
        for row in gpu_rows.itertuples(index=False)
    }
    mismatches = []
    for row in pair_rows:
        pair = (id_by_key[row["leftNodeKey"]], id_by_key[row["rightNodeKey"]])
        gpu_score = gpu_by_pair.get(pair)
        if gpu_score is None or abs(float(row["jaccard"]) - gpu_score) > 1e-6:
            mismatches.append({**row, "gpuJaccard": gpu_score})
    report = {
        "schema": "atlas.nary-jaccard-cugraph-parity.v1",
        "status": "NARY_JACCARD_CUGRAPH_PARITY_PROVEN" if not mismatches else "NARY_JACCARD_CUGRAPH_PARITY_FAILED",
        "executorPath": args.executor_path,
        "graphRevision": GRAPH_REVISION,
        "vertexCount": graph.number_of_nodes(),
        "edgeCount": graph.number_of_edges(),
        "candidatePairChecksum": cpu["candidatePairChecksum"],
        "cpuPairCount": len(pair_rows),
        "gpuPairCount": len(gpu_rows),
        "missingGpuPairs": [row for row in pair_rows if (id_by_key[row["leftNodeKey"]], id_by_key[row["rightNodeKey"]]) not in gpu_by_pair],
        "extraGpuPairs": len(gpu_by_pair) - len(pair_rows),
        "maxAbsoluteError": max((abs(float(row["jaccard"]) - gpu_by_pair[(id_by_key[row["leftNodeKey"]], id_by_key[row["rightNodeKey"]])]) for row in pair_rows), default=0.0),
        "mismatchedPairs": mismatches,
        "renumbered": False,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    args.report_path.parent.mkdir(parents=True, exist_ok=True)
    args.report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["status"] == "NARY_JACCARD_CUGRAPH_PARITY_PROVEN" else 1


if __name__ == "__main__":
    raise SystemExit(main())
