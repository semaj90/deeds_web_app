from __future__ import annotations

from atlas_graph_runtime.contracts import TypedGraphEdge
from atlas_graph_runtime.networkx_executor import run_pagerank, run_sssp


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
