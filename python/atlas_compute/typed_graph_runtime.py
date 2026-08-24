"""Typed ordinal graph bridge for the Parent Atlas execution fabric.

Canonical identity remains outside NetworkX/cuGraph. This module accepts a
frozen ordinal graph, runs an explicitly selected executor, and returns a
receipt suitable for parity and promotion gates.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Sequence

GraphBackend = Literal["networkx", "cugraph"]


@dataclass(frozen=True)
class TypedGraphEdge:
    src_ordinal: int
    dst_ordinal: int
    kind: str
    weight: float = 1.0


@dataclass(frozen=True)
class GraphExecutionReceipt:
    schema: str
    operation: str
    requested_backend: GraphBackend
    effective_backend: str
    graph_revision: str
    node_count: int
    edge_count: int
    status: Literal["PROVEN", "DEGRADED", "FAILED"]
    canonical_authority: bool = False
    error: str | None = None


def build_networkx_graph(node_ordinals: Sequence[int], edges: Sequence[TypedGraphEdge]) -> Any:
    try:
        import networkx as nx
    except Exception as exc:  # pragma: no cover - environment dependent
        raise RuntimeError("NETWORKX_UNAVAILABLE") from exc

    graph = nx.DiGraph()
    graph.add_nodes_from(int(ordinal) for ordinal in node_ordinals)
    for edge in edges:
        if not all(isinstance(value, int) for value in (edge.src_ordinal, edge.dst_ordinal)):
            raise ValueError("ATLAS_GRAPH_ORDINALS_MUST_BE_INTS")
        if edge.src_ordinal not in graph or edge.dst_ordinal not in graph:
            raise ValueError("ATLAS_GRAPH_EDGE_ENDPOINT_MISSING")
        graph.add_edge(edge.src_ordinal, edge.dst_ordinal, kind=edge.kind, weight=float(edge.weight))
    return graph


def run_pagerank(
    *,
    graph_revision: str,
    node_ordinals: Sequence[int],
    edges: Sequence[TypedGraphEdge],
    backend: GraphBackend = "networkx",
    alpha: float = 0.85,
    tol: float = 1e-8,
    max_iter: int = 100,
) -> tuple[dict[int, float], GraphExecutionReceipt]:
    graph = build_networkx_graph(node_ordinals, edges)
    try:
        kwargs = {"alpha": alpha, "tol": tol, "max_iter": max_iter, "weight": "weight"}
        if backend == "cugraph":
            # PageRank is dispatched through native cuGraph here. The current
            # nx-cugraph supported-algorithm list does not claim PageRank.
            import cudf
            import cugraph
            edge_frame = cudf.DataFrame({
                "src": [edge.src_ordinal for edge in edges],
                "dst": [edge.dst_ordinal for edge in edges],
                "weight": [float(edge.weight) for edge in edges],
            })
            gpu_graph = cugraph.Graph(directed=True)
            gpu_graph.from_cudf_edgelist(edge_frame, source="src", destination="dst", edge_attr="weight")
            frame = cugraph.pagerank(gpu_graph, alpha=alpha, tol=tol, max_iter=max_iter, weight="weight")
            values = dict(zip(frame["vertex"].to_pandas(), frame["pagerank"].to_pandas()))
            effective_backend = "cugraph"
        else:
            import networkx as nx
            values = nx.pagerank(graph, **kwargs)
            effective_backend = "networkx"
    except Exception as exc:
        return {}, GraphExecutionReceipt(
            schema="atlas.graph-execution-receipt.v1",
            operation="GRAPH_PAGERANK",
            requested_backend=backend,
            effective_backend="none",
            graph_revision=graph_revision,
            node_count=graph.number_of_nodes(),
            edge_count=graph.number_of_edges(),
            status="FAILED" if backend == "networkx" else "DEGRADED",
            error=f"{type(exc).__name__}: {exc}",
        )

    return (
        {int(node): float(score) for node, score in values.items()},
        GraphExecutionReceipt(
            schema="atlas.graph-execution-receipt.v1",
            operation="GRAPH_PAGERANK",
            requested_backend=backend,
            effective_backend=effective_backend,
            graph_revision=graph_revision,
            node_count=graph.number_of_nodes(),
            edge_count=graph.number_of_edges(),
            status="PROVEN",
        ),
    )


def run_sssp(
    *,
    graph_revision: str,
    node_ordinals: Sequence[int],
    edges: Sequence[TypedGraphEdge],
    source_ordinal: int,
    backend: GraphBackend = "networkx",
    cutoff: float | None = None,
) -> tuple[dict[int, tuple[float, int]], GraphExecutionReceipt]:
    """Run weighted single-source shortest paths over canonical ordinals."""
    graph = build_networkx_graph(node_ordinals, edges)
    if source_ordinal not in graph:
        raise ValueError("ATLAS_SSSP_SOURCE_NOT_IN_GRAPH")
    if any(float(edge.weight) < 0 for edge in edges):
        raise ValueError("ATLAS_SSSP_NEGATIVE_WEIGHT_UNSUPPORTED")

    try:
        if backend == "cugraph":
            import cudf
            import cugraph
            edge_frame = cudf.DataFrame({
                "src": [edge.src_ordinal for edge in edges],
                "dst": [edge.dst_ordinal for edge in edges],
                "weight": [float(edge.weight) for edge in edges],
            })
            gpu_graph = cugraph.Graph(directed=True)
            gpu_graph.from_cudf_edgelist(edge_frame, source="src", destination="dst", edge_attr="weight")
            frame = cugraph.sssp(gpu_graph, source=source_ordinal, cutoff=cutoff)
            rows = frame[["vertex", "distance", "predecessor"]].to_pandas()
            values = {
                int(row.vertex): (float(row.distance), int(row.predecessor))
                for row in rows.itertuples(index=False)
            }
            effective_backend = "cugraph"
        else:
            import networkx as nx
            distances, paths = nx.single_source_dijkstra(graph, source_ordinal, cutoff=cutoff, weight="weight")
            values = {
                int(node): (float(distances[node]), int(paths[node][-2]) if len(paths[node]) > 1 else -1)
                for node in distances
            }
            for node in graph:
                values.setdefault(int(node), (float("inf"), -1))
            effective_backend = "networkx"
    except Exception as exc:
        return {}, GraphExecutionReceipt(
            schema="atlas.graph-execution-receipt.v1",
            operation="GRAPH_SSSP",
            requested_backend=backend,
            effective_backend="none",
            graph_revision=graph_revision,
            node_count=graph.number_of_nodes(),
            edge_count=graph.number_of_edges(),
            status="FAILED" if backend == "networkx" else "DEGRADED",
            error=f"{type(exc).__name__}: {exc}",
        )

    return values, GraphExecutionReceipt(
        schema="atlas.graph-execution-receipt.v1",
        operation="GRAPH_SSSP",
        requested_backend=backend,
        effective_backend=effective_backend,
        graph_revision=graph_revision,
        node_count=graph.number_of_nodes(),
        edge_count=graph.number_of_edges(),
        status="PROVEN",
    )


def som_neighborhood(neuron_ordinal: int, radius: int = 1) -> tuple[int, ...]:
    if not isinstance(neuron_ordinal, int) or neuron_ordinal < 0 or neuron_ordinal >= 400:
        raise ValueError("ATLAS_SOM_NEURON_OUT_OF_RANGE")
    if not isinstance(radius, int) or radius < 0 or radius > 19:
        raise ValueError("ATLAS_SOM_RADIUS_OUT_OF_RANGE")
    row, col = divmod(neuron_ordinal, 20)
    return tuple(
        r * 20 + c
        for r in range(max(0, row - radius), min(20, row + radius + 1))
        for c in range(max(0, col - radius), min(20, col + radius + 1))
    )
