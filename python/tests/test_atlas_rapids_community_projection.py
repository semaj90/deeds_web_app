import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from atlas_rapids_community import (
    CommunityEdgeV1,
    CommunityNodeV1,
    CommunityPartitionRequestV1,
    canonicalize_undirected_edges,
)


def test_undirected_projection_sorts_nodes_and_sums_reciprocal_edges():
    nodes = [CommunityNodeV1(nodeId="z"), CommunityNodeV1(nodeId="b"), CommunityNodeV1(nodeId="a")]
    edges = [
        CommunityEdgeV1(source="a", target="b", weight=0.25),
        CommunityEdgeV1(source="b", target="a", weight=0.75),
        CommunityEdgeV1(source="a", target="b", weight=1.0),
        CommunityEdgeV1(source="z", target="b", weight=2.0),
    ]

    node_ids, projected_edges = canonicalize_undirected_edges(nodes, edges)

    assert node_ids == ["a", "b", "z"]
    assert projected_edges == [(0, 1, 2.0), (1, 2, 2.0)]


@pytest.mark.parametrize(
    ("nodes", "edges", "message"),
    [
        ([{"nodeId": "a"}], [{"source": "a", "target": "missing"}], "unknown node"),
        ([{"nodeId": "a"}], [{"source": "a", "target": "a"}], "self edges"),
    ],
)
def test_projection_request_rejects_unknown_nodes_and_self_edges(nodes, edges, message):
    with pytest.raises(ValueError, match=message):
        CommunityPartitionRequestV1(
            algorithm="leiden",
            graphRevision="graph:r1",
            topologyHash="sha256:topology",
            projectionRevision="projection:r1",
            projectionSemantics="atlas.undirected-weighted-projection.v1",
            nodes=nodes,
            edges=edges,
        )
