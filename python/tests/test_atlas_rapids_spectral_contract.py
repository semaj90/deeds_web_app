import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from atlas_rapids_community import CommunityPartitionRequestV1


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
