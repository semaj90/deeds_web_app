"""Typed ordinal graph bridge for the Parent Atlas execution fabric.

Canonical identity remains outside NetworkX/cuGraph. This module accepts a
frozen ordinal graph, runs an explicitly selected executor, and returns a
receipt suitable for parity and promotion gates.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from atlas_graph_runtime.contracts import GraphBackend, GraphExecutionReceipt, TypedGraphEdge


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


def parse_graphrag_alignment_simdjson(raw_json: bytes | str) -> tuple[list[int], list[TypedGraphEdge]]:
    """Parse a GraphRAG alignment JSON payload via simdjson into ordinal nodes and typed edges."""
    import simdjson

    payload = raw_json.encode("utf-8") if isinstance(raw_json, str) else raw_json
    parsed = simdjson.Parser().parse(payload)
    if not isinstance(parsed, (dict, simdjson.Object, Mapping)):
        raise ValueError("GRAPHRAG_ALIGNMENT_MUST_BE_OBJECT")

    raw_nodes = parsed.get("nodeOrdinals")
    raw_edges = parsed.get("edges")
    if (
        not isinstance(raw_nodes, (list, simdjson.Array, Sequence))
        or isinstance(raw_nodes, (str, bytes))
        or not isinstance(raw_edges, (list, simdjson.Array, Sequence))
        or isinstance(raw_edges, (str, bytes))
    ):
        raise ValueError("GRAPHRAG_ALIGNMENT_MISSING_NODES_OR_EDGES")

    node_ordinals: list[int] = []
    for node in raw_nodes:
        if isinstance(node, bool) or not isinstance(node, int):
            raise ValueError("ATLAS_GRAPH_ORDINALS_MUST_BE_INTS")
        node_ordinals.append(int(node))

    edges: list[TypedGraphEdge] = []
    for edge in raw_edges:
        if not isinstance(edge, (dict, simdjson.Object, Mapping)):
            raise ValueError("GRAPHRAG_EDGE_MUST_BE_OBJECT")
        src = edge.get("srcOrdinal")
        dst = edge.get("dstOrdinal")
        kind = edge.get("kind", "RELATED_TO")
        weight = edge.get("weight", 1.0)
        if isinstance(src, bool) or isinstance(dst, bool) or not isinstance(src, int) or not isinstance(dst, int):
            raise ValueError("ATLAS_GRAPH_ORDINALS_MUST_BE_INTS")
        edges.append(TypedGraphEdge(src_ordinal=int(src), dst_ordinal=int(dst), kind=str(kind), weight=float(weight)))

    return node_ordinals, edges


def _run_torch_pagerank(
    node_ordinals: Sequence[int],
    edges: Sequence[TypedGraphEdge],
    *,
    device: str,
    alpha: float,
    tol: float,
    max_iter: int,
) -> dict[int, float]:
    import torch

    if device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("TORCH_CUDA_UNAVAILABLE")

    ordered_nodes = list(dict.fromkeys(int(o) for o in node_ordinals))
    n = len(ordered_nodes)
    if n == 0:
        return {}

    idx_by_ord = {ord_id: idx for idx, ord_id in enumerate(ordered_nodes)}
    # Match NetworkX DiGraph weight semantics (last edge weight wins on parallel edges, row-normalized out-weights)
    adj = torch.zeros((n, n), dtype=torch.float64, device=device)
    for edge in edges:
        if edge.src_ordinal not in idx_by_ord or edge.dst_ordinal not in idx_by_ord:
            raise ValueError("ATLAS_GRAPH_EDGE_ENDPOINT_MISSING")
        w = float(edge.weight)
        if w < 0:
            raise ValueError("ATLAS_GRAPH_NEGATIVE_WEIGHT")
        adj[idx_by_ord[edge.dst_ordinal], idx_by_ord[edge.src_ordinal]] = w

    out_sum = adj.sum(dim=0)
    dangling_mask = out_sum == 0
    inv_out = torch.where(dangling_mask, torch.zeros_like(out_sum), 1.0 / out_sum)
    trans = adj * inv_out.unsqueeze(0)

    x = torch.full((n,), 1.0 / n, dtype=torch.float64, device=device)
    teleport = (1.0 - alpha) / n

    for _ in range(max_iter):
        dangling_mass = alpha * x[dangling_mask].sum() / n
        x_next = alpha * torch.mv(trans, x) + dangling_mass + teleport
        if float(torch.abs(x_next - x).sum().item()) < n * tol:
            x = x_next
            break
        x = x_next

    values = x.detach().cpu().tolist()
    return {ord_id: float(val) for ord_id, val in zip(ordered_nodes, values)}


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
        elif backend in ("torch_cuda", "torch_cpu"):
            target_device = "cuda" if backend == "torch_cuda" else "cpu"
            values = _run_torch_pagerank(
                node_ordinals,
                edges,
                device=target_device,
                alpha=alpha,
                tol=tol,
                max_iter=max_iter,
            )
            effective_backend = backend
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
