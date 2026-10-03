import pytest

from atlas_compute.typed_graph_runtime import (
    TypedGraphEdge,
    run_pagerank,
    run_sssp,
    som_neighborhood,
)
from atlas_graph_runtime.contracts import (
    GraphExecutionReceipt,
    upgrade_graph_execution_receipt_v1,
)
from atlas_graph_runtime.pagerank_parity import (
    compare_pagerank_v2,
    compare_pagerank_metrics_v1,
    pagerank_scores_checksum,
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


def test_receipt_v2_preserves_v1_vocabulary_and_adds_explicit_provenance():
    legacy = GraphExecutionReceipt(
        schema="atlas.graph-execution-receipt.v1",
        operation="GRAPH_PAGERANK",
        requested_backend="networkx",
        effective_backend="networkx",
        graph_revision="graph-test-v1",
        node_count=2,
        edge_count=1,
        status="PROVEN",
    )
    receipt = upgrade_graph_execution_receipt_v1(
        legacy,
        executor_revision="networkx:3.4.2",
        input_checksum="sha256:" + "a" * 64,
        output_checksum="sha256:" + "b" * 64,
    )

    assert receipt.schema == "atlas.graph-execution-receipt.v2"
    assert receipt.operation == legacy.operation
    assert receipt.requested_backend == legacy.requested_backend
    assert receipt.effective_backend == legacy.effective_backend
    assert receipt.graph_revision == legacy.graph_revision
    assert receipt.node_count == legacy.node_count
    assert receipt.edge_count == legacy.edge_count
    assert receipt.status == legacy.status
    assert receipt.canonical_authority is False
    assert receipt.writes_performed is False
    assert legacy.schema == "atlas.graph-execution-receipt.v1"


@pytest.mark.parametrize(
    ("field", "value", "error"),
    [
        ("executor_revision", "", "GRAPH_RECEIPT_V2_EXECUTOR_REVISION_REQUIRED"),
        ("input_checksum", "not-a-checksum", "GRAPH_RECEIPT_V2_CHECKSUM_FORMAT_INVALID"),
        ("output_checksum", "", "GRAPH_RECEIPT_V2_OUTPUT_CHECKSUM_REQUIRED"),
    ],
)
def test_receipt_v2_rejects_missing_or_unverifiable_provenance(field, value, error):
    legacy = GraphExecutionReceipt(
        schema="atlas.graph-execution-receipt.v1",
        operation="GRAPH_BFS",
        requested_backend="networkx",
        effective_backend="networkx",
        graph_revision="graph-test-v1",
        node_count=1,
        edge_count=0,
        status="PROVEN",
    )
    values = {
        "executor_revision": "networkx:3.4.2",
        "input_checksum": "sha256:" + "a" * 64,
        "output_checksum": "sha256:" + "b" * 64,
    }
    values[field] = value
    with pytest.raises(ValueError, match=error):
        upgrade_graph_execution_receipt_v1(legacy, **values)


def test_receipt_v2_rejects_v1_canonical_authority_claim():
    legacy = GraphExecutionReceipt(
        schema="atlas.graph-execution-receipt.v1",
        operation="GRAPH_BFS",
        requested_backend="networkx",
        effective_backend="networkx",
        graph_revision="graph-test-v1",
        node_count=1,
        edge_count=0,
        status="PROVEN",
        canonical_authority=True,
    )
    with pytest.raises(ValueError, match="GRAPH_RECEIPT_V2_CANONICAL_AUTHORITY_FORBIDDEN"):
        upgrade_graph_execution_receipt_v1(
            legacy,
            executor_revision="networkx:3.4.2",
            input_checksum="sha256:" + "a" * 64,
            output_checksum="sha256:" + "b" * 64,
        )
    assert legacy.canonical_authority is True


def _pagerank_v2_receipt(backend, scores):
    return upgrade_graph_execution_receipt_v1(
        GraphExecutionReceipt(
            schema="atlas.graph-execution-receipt.v1",
            operation="GRAPH_PAGERANK",
            requested_backend=backend,
            effective_backend=backend,
            graph_revision="sha256:" + "c" * 64,
            node_count=3,
            edge_count=2,
            status="PROVEN",
        ),
        executor_revision=f"{backend}:fixture-revision",
        input_checksum="sha256:" + "d" * 64,
        output_checksum=pagerank_scores_checksum(scores),
    )


def test_pagerank_parity_joins_by_ordinal_and_ignores_map_order():
    nx_scores = {4: 0.6, 2: 0.3, 8: 0.1}
    cg_scores = {8: 0.1000001, 4: 0.5999999, 2: 0.3}
    receipt = compare_pagerank_v2(
        networkx_receipt=_pagerank_v2_receipt("networkx", nx_scores),
        cugraph_receipt=_pagerank_v2_receipt("cugraph", cg_scores),
        networkx_scores=nx_scores,
        cugraph_scores=cg_scores,
        graph_ordinal_map_checksum="sha256:" + "e" * 64,
        top_k=2,
        tolerance=1e-5,
    )
    replay = compare_pagerank_v2(
        networkx_receipt=_pagerank_v2_receipt("networkx", dict(reversed(list(nx_scores.items())))),
        cugraph_receipt=_pagerank_v2_receipt("cugraph", dict(reversed(list(cg_scores.items())))),
        networkx_scores=dict(reversed(list(nx_scores.items()))),
        cugraph_scores=dict(reversed(list(cg_scores.items()))),
        graph_ordinal_map_checksum="sha256:" + "e" * 64,
        top_k=2,
        tolerance=1e-5,
    )
    assert receipt.status == "PARITY_PROVEN"
    assert receipt.top_k_overlap == 2
    assert receipt.networkx_output_checksum == replay.networkx_output_checksum
    assert receipt.cugraph_output_checksum == replay.cugraph_output_checksum
    assert receipt.canonical_authority is False
    assert receipt.writes_performed is False


def test_pagerank_parity_fails_closed_on_different_graph_input_or_ordinal_set():
    nx_scores = {1: 0.5, 2: 0.3, 3: 0.2}
    cg_scores = {1: 0.5, 2: 0.3, 4: 0.2}
    with pytest.raises(ValueError, match="PAGERANK_PARITY_ORDINAL_SET_MISMATCH"):
        compare_pagerank_v2(
            networkx_receipt=_pagerank_v2_receipt("networkx", nx_scores),
            cugraph_receipt=_pagerank_v2_receipt("cugraph", cg_scores),
            networkx_scores=nx_scores,
            cugraph_scores=cg_scores,
            graph_ordinal_map_checksum="sha256:" + "e" * 64,
        )

    nx_receipt = _pagerank_v2_receipt("networkx", nx_scores)
    different_graph = upgrade_graph_execution_receipt_v1(
        GraphExecutionReceipt(
            schema="atlas.graph-execution-receipt.v1",
            operation="GRAPH_PAGERANK",
            requested_backend="cugraph",
            effective_backend="cugraph",
            graph_revision="sha256:" + "f" * 64,
            node_count=3,
            edge_count=2,
            status="PROVEN",
        ),
        executor_revision="cugraph:fixture-revision",
        input_checksum="sha256:" + "d" * 64,
        output_checksum=pagerank_scores_checksum(nx_scores),
    )
    with pytest.raises(ValueError, match="PAGERANK_PARITY_INPUT_MISMATCH"):
        compare_pagerank_v2(
            networkx_receipt=nx_receipt,
            cugraph_receipt=different_graph,
            networkx_scores=nx_scores,
            cugraph_scores=nx_scores,
            graph_ordinal_map_checksum="sha256:" + "e" * 64,
        )


def test_pagerank_parity_does_not_pass_when_top_k_order_diverges():
    nx_scores = {1: 0.51, 2: 0.49, 3: 0.0}
    cg_scores = {1: 0.49, 2: 0.51, 3: 0.0}
    receipt = compare_pagerank_v2(
        networkx_receipt=_pagerank_v2_receipt("networkx", nx_scores),
        cugraph_receipt=_pagerank_v2_receipt("cugraph", cg_scores),
        networkx_scores=nx_scores,
        cugraph_scores=cg_scores,
        graph_ordinal_map_checksum="sha256:" + "e" * 64,
        top_k=1,
        tolerance=0.05,
    )
    assert receipt.max_absolute_delta <= receipt.tolerance
    assert receipt.top_k_overlap == 0
    assert receipt.status == "PARITY_DIVERGED"


def test_pagerank_metric_receipt_includes_correlations_topk_error_and_dangling_mass():
    nx_scores = {0: 0.5, 1: 0.3, 2: 0.2}
    cg_scores = {0: 0.5000001, 1: 0.2999999, 2: 0.2}
    metrics = compare_pagerank_metrics_v1(
        networkx_receipt=_pagerank_v2_receipt("networkx", nx_scores),
        cugraph_receipt=_pagerank_v2_receipt("cugraph", cg_scores),
        networkx_scores=nx_scores,
        cugraph_scores=cg_scores,
        graph_ordinal_map_checksum="sha256:" + "e" * 64,
        dangling_ordinals=(2,),
        dangling_policy="UNIFORM",
    )
    assert metrics["pearson"] is not None
    assert metrics["spearman"] == 1.0
    assert metrics["topKOverlap"]["10"]["fraction"] == 1.0
    assert metrics["scoreL1"] == pytest.approx(2e-7)
    assert metrics["scoreLInf"] == pytest.approx(1e-7)
    assert metrics["danglingScoreMassAbsoluteDelta"] == 0.0
