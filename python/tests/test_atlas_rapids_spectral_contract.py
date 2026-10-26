import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from atlas_rapids_community import (
    MAX_COMMUNITY_EDGES_V1,
    MAX_COMMUNITY_NODES_V1,
    CommunityPartitionRequestV1,
)


def test_spectral_request_is_revision_bound_and_bounded():
    request = CommunityPartitionRequestV1(
        algorithm="spectral",
        graphRevision="g1",
        topologyHash="t1",
        projectionRevision="p1",
        projectionSemantics="atlas.undirected-weighted-projection.v1",
        nodes=[{"nodeId": "a"}, {"nodeId": "b"}],
        edges=[{"source": "a", "target": "b", "weight": 1.0}],
        numClusters=2,
        numEigenvectors=2,
        eigenMaxIterations=100,
        kmeansMaxIterations=100,
    )
    assert request.algorithm == "spectral"
    assert request.numClusters == 2
    assert request.projectionRevision == "p1"


def test_spectral_request_rejects_invalid_eigenvector_and_cluster_bounds():
    base = dict(
        algorithm="spectral",
        graphRevision="g1",
        topologyHash="t1",
        projectionRevision="p1",
        projectionSemantics="atlas.undirected-weighted-projection.v1",
        nodes=[{"nodeId": "a"}, {"nodeId": "b"}],
        edges=[],
    )
    with pytest.raises(ValueError, match="numEigenvectors"):
        CommunityPartitionRequestV1(**base, numClusters=2, numEigenvectors=3)
    with pytest.raises(ValueError, match="numClusters"):
        CommunityPartitionRequestV1(**base, numClusters=3, numEigenvectors=2)


def test_community_request_rejects_oversized_node_and_edge_projections():
    base = dict(
        algorithm="leiden",
        graphRevision="g1",
        topologyHash="t1",
        projectionRevision="p1",
        projectionSemantics="atlas.undirected-weighted-projection.v1",
        edges=[],
    )
    with pytest.raises(ValueError, match="nodes"):
        CommunityPartitionRequestV1(**base, nodes=[{"nodeId": str(i)} for i in range(MAX_COMMUNITY_NODES_V1 + 1)])
    with pytest.raises(ValueError, match="edges"):
        CommunityPartitionRequestV1(
            **{**base, "edges": [{"source": "a", "target": "b", "weight": 1.0}] * (MAX_COMMUNITY_EDGES_V1 + 1)},
            nodes=[{"nodeId": "a"}, {"nodeId": "b"}],
        )
