from __future__ import annotations

import pytest

from python.atlas_community_parity import (
    CommunityParityInputV1,
    PartitionAssignmentV1,
    compare_community_partitions_v1,
)


def _rows(mapping: dict[str, str]) -> list[PartitionAssignmentV1]:
    return [PartitionAssignmentV1(nodeId=node_id, communityId=community_id) for node_id, community_id in mapping.items()]


def test_relabelled_identical_partition_is_proven() -> None:
    receipt = compare_community_partitions_v1(
        CommunityParityInputV1(
            graphRevision="graph:1",
            projectionRevision="projection:1",
            topologyHash="sha256:topology",
            algorithm="louvain",
            oracleBackend="neo4j-gds",
            challengerBackend="cugraph",
            oracleAssignments=_rows({"A": "99", "B": "99", "C": "7", "D": "7"}),
            challengerAssignments=_rows({"A": "3", "B": "3", "C": "88", "D": "88"}),
            oracleModularity=0.42,
            challengerModularity=0.421,
        )
    )

    assert receipt.status == "PROVEN"
    assert receipt.adjustedRandIndex == pytest.approx(1.0)
    assert receipt.normalizedMutualInformation == pytest.approx(1.0)
    assert receipt.pairwiseMembershipAgreement == pytest.approx(1.0)
    assert receipt.communityCountDelta == 0


def test_materially_different_partition_fails() -> None:
    receipt = compare_community_partitions_v1(
        CommunityParityInputV1(
            graphRevision="graph:1",
            projectionRevision="projection:1",
            topologyHash="sha256:topology",
            algorithm="leiden",
            oracleBackend="neo4j-gds",
            challengerBackend="cugraph",
            oracleAssignments=_rows({"A": "1", "B": "1", "C": "2", "D": "2", "E": "3", "F": "3"}),
            challengerAssignments=_rows({"A": "x", "B": "y", "C": "x", "D": "y", "E": "x", "F": "y"}),
            oracleModularity=0.61,
            challengerModularity=0.12,
        )
    )

    assert receipt.status == "FAILED"
    assert "ARI_BELOW_THRESHOLD" in receipt.reasonCodes
    assert "NMI_BELOW_THRESHOLD" in receipt.reasonCodes


def test_missing_modularity_is_partial_not_proven() -> None:
    receipt = compare_community_partitions_v1(
        CommunityParityInputV1(
            graphRevision="graph:1",
            projectionRevision="projection:1",
            topologyHash="sha256:topology",
            algorithm="louvain",
            oracleBackend="neo4j-gds",
            challengerBackend="cugraph",
            oracleAssignments=_rows({"A": "1", "B": "1", "C": "2"}),
            challengerAssignments=_rows({"A": "9", "B": "9", "C": "8"}),
        )
    )

    assert receipt.adjustedRandIndex == pytest.approx(1.0)
    assert receipt.status == "PARTIAL"
    assert "MODULARITY_NOT_COMPARABLE" in receipt.reasonCodes


def test_mismatched_node_universe_fails_closed() -> None:
    with pytest.raises(ValueError, match="node universes differ"):
        CommunityParityInputV1(
            graphRevision="graph:1",
            projectionRevision="projection:1",
            topologyHash="sha256:topology",
            algorithm="louvain",
            oracleBackend="neo4j-gds",
            challengerBackend="cugraph",
            oracleAssignments=_rows({"A": "1", "B": "1"}),
            challengerAssignments=_rows({"A": "9", "C": "9"}),
        )
