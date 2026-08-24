import pytest

from atlas_compute.typed_graph_runtime import (
    TypedGraphEdge,
    run_pagerank,
    run_sssp,
    som_neighborhood,
)


def test_networkx_pagerank_receipt_uses_ordinal_graph():
    scores, receipt = run_pagerank(
        graph_revision="graph-test-v1",
        node_ordinals=[10, 11, 12],
        edges=[
            TypedGraphEdge(10, 11, "CALLS"),
            TypedGraphEdge(11, 12, "REFERENCES"),
        ],
    )
    assert receipt.status == "PROVEN"
    assert receipt.effective_backend == "networkx"
    assert receipt.canonical_authority is False
    assert set(scores) == {10, 11, 12}


def test_networkx_sssp_returns_distances_and_predecessors():
    paths, receipt = run_sssp(
        graph_revision="graph-test-v1",
        node_ordinals=[10, 11, 12, 99],
        edges=[
            TypedGraphEdge(10, 11, "CALLS", weight=2.0),
            TypedGraphEdge(11, 12, "REFERENCES", weight=3.0),
        ],
        source_ordinal=10,
    )
    assert receipt.operation == "GRAPH_SSSP"
    assert receipt.status == "PROVEN"
    assert paths[10] == (0.0, -1)
    assert paths[12] == (5.0, 11)
    assert paths[99][1] == -1
    assert paths[99][0] == float("inf")


def test_sssp_rejects_missing_source_and_negative_weights():
    with pytest.raises(ValueError, match="SSSP_SOURCE_NOT_IN_GRAPH"):
        run_sssp(graph_revision="graph-test-v1", node_ordinals=[1], edges=[], source_ordinal=2)
    with pytest.raises(ValueError, match="SSSP_NEGATIVE_WEIGHT_UNSUPPORTED"):
        run_sssp(
            graph_revision="graph-test-v1",
            node_ordinals=[1, 2],
            edges=[TypedGraphEdge(1, 2, "CALLS", weight=-1)],
            source_ordinal=1,
        )


def test_som_neighborhood_is_bounded_by_lattice():
    assert 153 in som_neighborhood(153, radius=1)
    assert len(som_neighborhood(153, radius=1)) == 9
    assert len(som_neighborhood(0, radius=1)) == 4
    with pytest.raises(ValueError, match="SOM_NEURON_OUT_OF_RANGE"):
        som_neighborhood(400)


def test_cugraph_request_fails_closed_without_promoting_cpu_result():
    scores, receipt = run_pagerank(
        graph_revision="graph-test-v1",
        node_ordinals=[1, 2],
        edges=[TypedGraphEdge(1, 2, "CALLS")],
        backend="cugraph",
    )
    assert receipt.requested_backend == "cugraph"
    if receipt.status != "PROVEN":
        assert scores == {}
        assert receipt.effective_backend == "none"
