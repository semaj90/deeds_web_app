#!/usr/bin/env python
"""GRAPH-PAGERANK-02 -- characterizes cuGraph's dangling-parameter no-op.

Distinct from GRAPH-PAGERANK-01 (isolation fixture, zero dangling nodes):
this fixture deliberately contains dangling nodes (nodes with zero
out-degree, occurring naturally from the random edge distribution).
Measures whether cuGraph's documented dangling-parameter no-op (verified
directly against cuGraph's own docs: "This parameter is here for NetworkX
compatibility and ignored") produces an actual measurable divergence from
NetworkX (which DOES use its dangling parameter) on a concrete graph.

This is a characterization result, not a pass/fail gate on GRAPH-PAGERANK-01
-- a real divergence here is an expected, informative finding about backend
semantics, not a bug.

Run inside conda env atlas-rapids-cu13:
  PYTHONPATH=. /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python \
    -m atlas_compute.gpu_mini_fabric.graph_pagerank_02_dangling
"""

from __future__ import annotations

import json
from pathlib import Path

import cudf
import cugraph
import networkx as nx
import numpy as np

from atlas_compute.gpu_mini_fabric.graph_execution_semantics import (
    assert_semantics_agree,
    compute_semantics_cugraph,
    compute_semantics_networkx,
)
from atlas_compute.gpu_mini_fabric.graph_fixture import generate_graph_fixture_with_dangling_v1

ALPHA = 0.85
TOLERANCE = 1.0e-6
MAX_ITERATIONS = 200

OUT_PATH = Path(
    "/mnt/c/Users/james/Videos/deeds-web-app/docs/reports/gpu-mini-fabric-01-graph-pagerank-02-dangling.json"
)


def main() -> None:
    fixture = generate_graph_fixture_with_dangling_v1()

    nxg = nx.DiGraph()
    nxg.add_nodes_from(fixture.node_keys)
    nxg.add_edges_from(zip(fixture.edge_src, fixture.edge_dst))

    dangling_nodes = [n for n in nxg.nodes if nxg.out_degree(n) == 0]

    # NetworkX default: dangling nodes redistribute uniformly (no explicit
    # dangling= personalization vector passed -> defaults to the
    # personalization vector, uniform if that's also unset).
    nx_scores = nx.pagerank(nxg, alpha=ALPHA, tol=TOLERANCE, max_iter=MAX_ITERATIONS)

    edges_df = cudf.DataFrame({"src": fixture.edge_src, "dst": fixture.edge_dst})
    cg = cugraph.Graph(directed=True)
    cg.from_cudf_edgelist(edges_df, source="src", destination="dst", renumber=True, store_transposed=True)

    nx_semantics = compute_semantics_networkx(nxg, fixture.node_keys)
    cg_semantics = compute_semantics_cugraph(cg, fixture.node_keys)
    # NOTE: vertexCount is expected to still agree (cuGraph includes
    # zero-out-degree nodes as long as they appear as an edge destination
    # somewhere, same as NetworkX with add_nodes_from). Only dangling
    # semantics/handling differs, not the vertex/edge SET -- so this gate
    # should still pass; if it doesn't, that's a DIFFERENT bug worth its own
    # investigation, not something GRAPH-PAGERANK-02 is designed to explain.
    assert_semantics_agree(nx_semantics, cg_semantics)

    cg_result = cugraph.pagerank(cg, alpha=ALPHA, tol=TOLERANCE, max_iter=MAX_ITERATIONS)
    cg_pdf = cg_result.to_pandas()
    cg_scores = dict(zip(cg_pdf["vertex"], cg_pdf["pagerank"]))

    nx_arr = np.array([nx_scores[k] for k in fixture.node_keys])
    cg_arr = np.array([cg_scores[k] for k in fixture.node_keys])

    rank_correlation = float(np.corrcoef(nx_arr, cg_arr)[0, 1])
    max_absolute_error = float(np.max(np.abs(nx_arr - cg_arr)))
    mean_absolute_error = float(np.mean(np.abs(nx_arr - cg_arr)))

    # Isolate the effect ON the dangling nodes' own scores specifically,
    # and on the graph as a whole (since dangling-node rank redistribution
    # affects every node's score, not just the dangling nodes').
    dangling_idx = [fixture.node_keys.index(n) for n in dangling_nodes]
    dangling_abs_errors = [abs(nx_arr[i] - cg_arr[i]) for i in dangling_idx]

    top_100_nx = set(sorted(fixture.node_keys, key=lambda k: -nx_scores[k])[:100])
    top_100_cg = set(sorted(fixture.node_keys, key=lambda k: -cg_scores[k])[:100])
    top_100_overlap = len(top_100_nx & top_100_cg) / 100

    report = {
        "schema": "atlas.gpu-mini-fabric.graph-pagerank-02-dangling-result.v1",
        "test": "GRAPH-PAGERANK-02",
        "purpose": "characterize cuGraph dangling-parameter no-op vs NetworkX dangling redistribution -- NOT a pass/fail gate on GRAPH-PAGERANK-01",
        "read_only": True,
        "canonical_production_data_touched": False,
        "fixture": fixture.to_manifest_dict(),
        "dangling_node_count": len(dangling_nodes),
        "graph_execution_semantics_v1": {
            "networkx": nx_semantics.to_dict(),
            "cugraph": cg_semantics.to_dict(),
            "agree_on_vertex_edge_set": True,
        },
        "page_rank_parity_policy_v1": {"alpha": ALPHA, "tolerance": TOLERANCE, "maxIterations": MAX_ITERATIONS},
        "metrics": {
            "rankCorrelation_wholeGraph": round(rank_correlation, 8),
            "maxAbsoluteError_wholeGraph": round(max_absolute_error, 10),
            "meanAbsoluteError_wholeGraph": round(mean_absolute_error, 10),
            "top100Overlap_wholeGraph": round(top_100_overlap, 6),
            "maxAbsoluteError_danglingNodesOnly": round(max(dangling_abs_errors), 10) if dangling_abs_errors else None,
            "meanAbsoluteError_danglingNodesOnly": round(float(np.mean(dangling_abs_errors)), 10) if dangling_abs_errors else None,
        },
        "finding": None,  # filled in below
    }

    # Characterize, don't gate: describe what was actually measured.
    if max_absolute_error > 1e-4:
        report["finding"] = (
            f"MEASURABLE DIVERGENCE: dangling-node handling produces a real score difference "
            f"(max abs error {max_absolute_error:.6g} whole-graph, "
            f"{max(dangling_abs_errors):.6g} on dangling nodes specifically) between NetworkX's "
            f"dangling-rank redistribution and cuGraph's no-op. This is expected per the documented "
            f"API difference, now empirically confirmed rather than assumed."
        )
    else:
        report["finding"] = (
            f"NO MEASURABLE DIVERGENCE at this dangling-node fraction ({len(dangling_nodes)}/{fixture.num_nodes} "
            f"nodes): scores agree within {max_absolute_error:.6g} despite the documented API difference -- "
            f"the effect may be too small to detect at this graph's dangling-node density, or NetworkX's "
            f"default (uniform) redistribution converges close to cuGraph's no-op result for this graph shape."
        )

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    print("Report:", OUT_PATH)


if __name__ == "__main__":
    main()
