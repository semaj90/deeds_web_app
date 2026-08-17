from python.atlas_rapids_community import (
    CUGRAPH_LEIDEN_26_06,
    CommunityEdgeV1,
    CommunityNodeV1,
    CommunityPartitionRequestV1,
    UNDIRECTED_WEIGHTED_PROJECTION_V1,
    canonicalize_partitions,
    canonicalize_undirected_edges,
)


def test_undirected_edge_canonicalization_aggregates_reverse_duplicates():
    nodes = [CommunityNodeV1(nodeId="c"), CommunityNodeV1(nodeId="a"), CommunityNodeV1(nodeId="b")]
    edges = [
        CommunityEdgeV1(source="a", target="b", weight=1.0),
        CommunityEdgeV1(source="b", target="a", weight=2.0),
        CommunityEdgeV1(source="b", target="c", weight=4.0),
    ]

    node_ids, rows = canonicalize_undirected_edges(nodes, edges)
    assert node_ids == ["a", "b", "c"]
    assert rows == [(0, 1, 3.0), (1, 2, 4.0)]


def test_partition_fingerprint_is_independent_of_backend_partition_numbers():
    node_ids = ["packet:a", "packet:b", "packet:c", "packet:d"]
    left_assignments, left_communities = canonicalize_partitions(
        node_ids,
        {0: 99, 1: 99, 2: 7, 3: 7},
    )
    right_assignments, right_communities = canonicalize_partitions(
        node_ids,
        {0: 3, 1: 3, 2: 88, 3: 88},
    )

    assert [x.communityFingerprint for x in left_assignments] == [x.communityFingerprint for x in right_assignments]
    assert [x.communityFingerprint for x in left_communities] == [x.communityFingerprint for x in right_communities]


def test_request_requires_explicit_undirected_projection_semantics():
    req = CommunityPartitionRequestV1(
        algorithm="leiden",
        graphRevision="graph:1",
        topologyHash="sha256:topology",
        projectionRevision="projection:feature-undirected:1",
        projectionSemantics=UNDIRECTED_WEIGHTED_PROJECTION_V1,
        nodes=[CommunityNodeV1(nodeId="a"), CommunityNodeV1(nodeId="b")],
        edges=[CommunityEdgeV1(source="a", target="b", weight=1.0)],
    )
    assert req.algorithm == "leiden"
    assert CUGRAPH_LEIDEN_26_06.endswith("26.06")
