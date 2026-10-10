from __future__ import annotations

from atlas_graph_runtime.contracts import TypedGraphEdge
from atlas_graph_runtime.networkx_executor import (
    run_bfs_neighborhood,
    run_cheirank,
    run_pagerank,
    run_sssp,
    run_strongly_connected_components,
    run_topological_order,
)


def test_networkx_pagerank_adapter_calls_cpu_oracle_with_ordinal_keys():
    edges = [
        TypedGraphEdge(10, 20, "calls"),
        TypedGraphEdge(20, 30, "calls"),
        TypedGraphEdge(30, 10, "calls"),
    ]
    scores, receipt = run_pagerank(
        graph_revision="fixture:cycle-v1",
        node_ordinals=[30, 10, 20],
        edges=edges,
    )

    assert receipt.status == "PROVEN"
    assert receipt.requested_backend == "networkx"
    assert receipt.effective_backend == "networkx"
    assert set(scores) == {10, 20, 30}
    assert abs(sum(scores.values()) - 1.0) < 1e-12


def test_networkx_sssp_adapter_preserves_predecessor_ordinals():
    edges = [
        TypedGraphEdge(10, 20, "calls", 1.0),
        TypedGraphEdge(20, 30, "calls", 2.0),
        TypedGraphEdge(10, 30, "calls", 9.0),
    ]
    distances, receipt = run_sssp(
        graph_revision="fixture:path-v1",
        node_ordinals=[30, 10, 20],
        edges=edges,
        source_ordinal=10,
    )

    assert receipt.status == "PROVEN"
    assert receipt.effective_backend == "networkx"
    assert distances[10] == (0.0, -1)
    assert distances[20] == (1.0, 10)
    assert distances[30] == (3.0, 20)


def test_networkx_adapter_rejects_unknown_sssp_source():
    try:
        run_sssp(
            graph_revision="fixture:path-v1",
            node_ordinals=[10],
            edges=[],
            source_ordinal=99,
        )
    except ValueError as exc:
        assert str(exc) == "ATLAS_SSSP_SOURCE_NOT_IN_GRAPH"
    else:
        raise AssertionError("unknown source ordinal must fail closed")


def test_cheirank_reverses_edges_and_binds_executor_receipt():
    scores, receipt = run_cheirank(
        graph_revision="fixture:direction-v1",
        node_ordinals=[20, 10],
        edges=[TypedGraphEdge(10, 20, "calls")],
    )

    assert scores[10] > scores[20]
    assert receipt.operation == "GRAPH_CHEIRANK"
    assert receipt.effective_backend == "networkx"
    assert receipt.graph_revision == "fixture:direction-v1"
    assert receipt.canonical_authority is False
    assert receipt.writes_performed is False
    assert receipt.input_checksum.startswith("sha256:")
    assert receipt.output_checksum.startswith("sha256:")


def test_bfs_neighborhood_is_directed_bounded_and_deterministic():
    edges = [
        TypedGraphEdge(10, 30, "calls"),
        TypedGraphEdge(10, 20, "calls"),
        TypedGraphEdge(20, 40, "calls"),
        TypedGraphEdge(30, 40, "calls"),
    ]
    result, receipt = run_bfs_neighborhood(
        graph_revision="fixture:bfs-v1",
        node_ordinals=[40, 30, 20, 10],
        edges=edges,
        source_ordinal=10,
        max_depth=1,
    )

    assert result == ((10, 0, -1), (20, 1, 10), (30, 1, 10))
    assert receipt.operation == "GRAPH_BFS_NEIGHBORHOOD"
    assert receipt.canonical_authority is False
    assert receipt.writes_performed is False


def test_scc_and_topological_order_are_stable_and_cycles_reject():
    nodes = [4, 3, 2, 1]
    edges = [
        TypedGraphEdge(2, 1, "calls"),
        TypedGraphEdge(1, 2, "calls"),
        TypedGraphEdge(2, 3, "calls"),
    ]
    components, receipt = run_strongly_connected_components(
        graph_revision="fixture:scc-v1", node_ordinals=nodes, edges=edges,
    )
    assert components == ((1, 2), (3,), (4,))
    assert receipt.operation == "GRAPH_SCC"
    assert receipt.canonical_authority is False

    dag_edges = [TypedGraphEdge(2, 3, "calls"), TypedGraphEdge(1, 3, "calls")]
    order, topo_receipt = run_topological_order(
        graph_revision="fixture:dag-v1", node_ordinals=nodes, edges=dag_edges,
    )
    assert order == (1, 2, 3, 4)
    assert topo_receipt.operation == "GRAPH_TOPOLOGICAL_ORDER"
    assert topo_receipt.canonical_authority is False

    try:
        run_topological_order(
            graph_revision="fixture:cycle-v1",
            node_ordinals=[1, 2],
            edges=[TypedGraphEdge(1, 2, "calls"), TypedGraphEdge(2, 1, "calls")],
        )
    except ValueError as exc:
        assert str(exc) == "ATLAS_TOPOLOGICAL_GRAPH_CYCLIC"
    else:
        raise AssertionError("cyclic input must fail closed")
