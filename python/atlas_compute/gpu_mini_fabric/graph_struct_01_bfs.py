#!/usr/bin/env python
"""GPU-GRAPH-STRUCT-01 -- NetworkX <-> cuGraph BFS parity on GraphFixtureV1.

Vertex identity is the nodeKey string, fed directly to both engines --
neither engine's internal row position/renumbering is ever compared.
Bounded depth=2 (ACE's "evidence around symbol X at depth 2" request maps
directly to this).

Run inside conda env atlas-rapids-cu13:
  PYTHONPATH=. /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python \
    -m atlas_compute.gpu_mini_fabric.graph_struct_01_bfs
"""

from __future__ import annotations

import json
from pathlib import Path

import cudf
import cugraph
import networkx as nx

from atlas_compute.gpu_mini_fabric.graph_fixture import generate_graph_fixture_v1

DEPTH_LIMIT = 2
NUM_SEEDS = 5

OUT_PATH = Path(
    "/mnt/c/Users/james/Videos/deeds-web-app/docs/reports/gpu-mini-fabric-01-graph-struct-01-bfs.json"
)


def main() -> None:
    fixture = generate_graph_fixture_v1()

    # NetworkX oracle (CPU) -- DiGraph collapses parallel edges naturally.
    nxg = nx.DiGraph()
    nxg.add_nodes_from(fixture.node_keys)
    nxg.add_edges_from(zip(fixture.edge_src, fixture.edge_dst))

    # cuGraph (GPU) -- fed nodeKey strings directly as src/dst, never a row index.
    edges_df = cudf.DataFrame({"src": fixture.edge_src, "dst": fixture.edge_dst})
    cg = cugraph.Graph(directed=True)
    cg.from_cudf_edgelist(edges_df, source="src", destination="dst", renumber=True)

    # Fixed deterministic seed set (every 2000th node key -> 5 seeds).
    seed_nodes = [fixture.node_keys[i] for i in range(0, fixture.num_nodes, fixture.num_nodes // NUM_SEEDS)][:NUM_SEEDS]

    per_seed_results = []
    all_exact = True
    for seed in seed_nodes:
        nx_depths = nx.single_source_shortest_path_length(nxg, seed, cutoff=DEPTH_LIMIT)
        nx_set = set(nx_depths.keys())

        cg_bfs = cugraph.bfs(cg, start=seed, depth_limit=DEPTH_LIMIT)
        cg_bfs_pdf = cg_bfs.to_pandas()
        # Unreached vertices carry the INT32_MAX sentinel (2147483647), not -1
        # -- verified live via direct inspection, not assumed from docstring.
        reached = cg_bfs_pdf[cg_bfs_pdf["distance"] <= DEPTH_LIMIT]
        cg_set = set(reached["vertex"].tolist())
        cg_depths = dict(zip(reached["vertex"], reached["distance"]))

        node_set_exact = nx_set == cg_set
        depth_agreement = all(nx_depths[k] == cg_depths.get(k, -999) for k in nx_set)
        all_exact = all_exact and node_set_exact and depth_agreement

        per_seed_results.append({
            "seed": seed,
            "nx_reached_count": len(nx_set),
            "cg_reached_count": len(cg_set),
            "node_set_exact_match": node_set_exact,
            "depth_agreement": depth_agreement,
        })

    report = {
        "schema": "atlas.gpu-mini-fabric.graph-struct-01-bfs-result.v1",
        "test": "GPU-GRAPH-STRUCT-01",
        "phase": "D1",
        "read_only": True,
        "canonical_production_data_touched": False,
        "fixture": fixture.to_manifest_dict(),
        "depth_limit": DEPTH_LIMIT,
        "vertex_identity": "nodeKey (string), never row index or engine-internal ID",
        "per_seed": per_seed_results,
        "gate": {
            "all_seeds_exact_match": all_exact,
            "RESULT": "PASS" if all_exact else "FAIL",
        },
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    print("Report:", OUT_PATH)


if __name__ == "__main__":
    main()
