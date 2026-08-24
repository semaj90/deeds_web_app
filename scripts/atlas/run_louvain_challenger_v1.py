#!/usr/bin/env python3
"""Invoke the existing atlas_rapids_community Louvain challenger against a
frozen live-graph fixture. Does not write graph facts, projections, or
retrieval state -- this is read-only, GPU-side comparison work, mirroring
the Leiden/spectral diagnostics already run against the same fixture (see
docs/reports/spectral-rtx-alignment-sweep-20260823.md, LVG-7 "Louvain
comparison" section). This intentionally reuses
python/atlas_rapids_community.py::run_cugraph_partition rather than
re-implementing a Louvain call -- see that module's docstring for why it is
the canonical GPU community-detection challenger for this kind of frozen
undirected weighted projection.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "python"))

from atlas_rapids_community import (  # noqa: E402
    CommunityEdgeV1,
    CommunityNodeV1,
    CommunityPartitionRequestV1,
    run_cugraph_partition,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", required=True, help="live-graph-fixture.v1 JSON")
    parser.add_argument("--receipt-out", required=True)
    parser.add_argument("--resolution", type=float, default=1.0)
    parser.add_argument("--max-iterations", type=int, default=100)
    parser.add_argument("--threshold", type=float, default=1e-7)
    args = parser.parse_args()

    fixture = json.loads(Path(args.fixture).read_text(encoding="utf-8"))
    nodes = [CommunityNodeV1(nodeId=vertex["packet_key"]) for vertex in fixture["vertices"]]
    by_ordinal = {vertex["ordinal"]: vertex["packet_key"] for vertex in fixture["vertices"]}
    edges = [
        CommunityEdgeV1(
            source=by_ordinal[edge["src"]],
            target=by_ordinal[edge["dst"]],
            weight=float(edge["weight"]),
        )
        for edge in fixture["edges"]
        if edge["src"] != edge["dst"]
    ]

    request = CommunityPartitionRequestV1(
        algorithm="louvain",
        graphRevision=fixture.get("graph_revision", "unknown"),
        topologyHash=fixture.get("fixture_checksum", "unknown"),
        projectionRevision=fixture.get("workflow_revision_id", "louvain-challenger-v1"),
        projectionSemantics="atlas.undirected-weighted-projection.v1",
        nodes=nodes,
        edges=edges,
        resolution=args.resolution,
        maxIterations=args.max_iterations,
        threshold=args.threshold,
    )
    response = run_cugraph_partition(request)

    community_sizes = sorted((len(c.memberNodeIds) for c in response.communities), reverse=True)
    output = Path(args.receipt_out)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(response.model_dump_json(indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "receipt": str(output),
                "algorithm": response.algorithm,
                "algorithmId": response.algorithmId,
                "modularity": response.modularity,
                "communityCount": len(response.communities),
                "communitySizes": community_sizes,
                "durationMs": response.durationMs,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
