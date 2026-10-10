"""NetworkX CPU graph oracles over frozen ordinal inputs.

Canonical graph identity remains upstream; results and receipts are diagnostic
execution artifacts and never grant admission or persistence authority.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections import deque
from typing import Any, Sequence

from .contracts import GraphExecutionReceipt, GraphExecutionReceiptV2, TypedGraphEdge
from .contracts import upgrade_graph_execution_receipt_v1
from .pagerank_parity import pagerank_scores_checksum
from .ppr_parity import PprExecutionIdentityV1, normalize_seed_weights


def _canonical_graph_input(
    graph_revision: str,
    node_ordinals: Sequence[int],
    edges: Sequence[TypedGraphEdge],
) -> tuple[tuple[int, ...], tuple[TypedGraphEdge, ...], str]:
    if not isinstance(graph_revision, str) or not graph_revision.strip():
        raise ValueError("ATLAS_GRAPH_REVISION_REQUIRED")
    if any(not isinstance(node, int) or isinstance(node, bool) for node in node_ordinals):
        raise ValueError("ATLAS_GRAPH_ORDINALS_MUST_BE_INTS")
    nodes = tuple(sorted(node_ordinals))
    if len(nodes) != len(set(nodes)):
        raise ValueError("ATLAS_GRAPH_NODE_ORDINAL_DUPLICATE")
    node_set = set(nodes)
    if any(not isinstance(edge, TypedGraphEdge) for edge in edges):
        raise ValueError("ATLAS_GRAPH_EDGE_INVALID")
    if any(
        not isinstance(edge.src_ordinal, int) or isinstance(edge.src_ordinal, bool)
        or not isinstance(edge.dst_ordinal, int) or isinstance(edge.dst_ordinal, bool)
        or not isinstance(edge.kind, str) or not edge.kind.strip()
        for edge in edges
    ):
        raise ValueError("ATLAS_GRAPH_EDGE_INVALID")
    normalized_edges = tuple(sorted(
        edges,
        key=lambda edge: (edge.src_ordinal, edge.dst_ordinal, edge.kind, edge.weight),
    ))
    endpoint_pairs: set[tuple[int, int]] = set()
    for edge in normalized_edges:
        if edge.src_ordinal not in node_set or edge.dst_ordinal not in node_set:
            raise ValueError("ATLAS_GRAPH_EDGE_ENDPOINT_MISSING")
        if isinstance(edge.weight, bool) or not isinstance(edge.weight, (int, float)) or not math.isfinite(float(edge.weight)) or edge.weight < 0:
            raise ValueError("ATLAS_GRAPH_EDGE_WEIGHT_INVALID")
        pair = (edge.src_ordinal, edge.dst_ordinal)
        if pair in endpoint_pairs:
            raise ValueError("ATLAS_GRAPH_PARALLEL_EDGE_UNSUPPORTED")
        endpoint_pairs.add(pair)
    payload = {
        "schema": "atlas.networkx-frozen-graph-input.v1",
        "graphRevision": graph_revision,
        "nodeOrdinals": nodes,
        "edges": [
            [edge.src_ordinal, edge.dst_ordinal, edge.kind, float(edge.weight)]
            for edge in normalized_edges
        ],
    }
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return nodes, normalized_edges, f"sha256:{hashlib.sha256(encoded).hexdigest()}"


def _execution_receipt(
    *, graph_revision: str, node_count: int, edge_count: int,
    operation: str, input_checksum: str, output: Any, parameters: dict[str, Any] | None = None,
) -> GraphExecutionReceiptV2:
    import networkx as nx

    encoded = json.dumps(output, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
    output_checksum = f"sha256:{hashlib.sha256(encoded).hexdigest()}"
    execution_input = json.dumps(
        {"graphInputChecksum": input_checksum, "operation": operation, "parameters": parameters or {}},
        ensure_ascii=False, separators=(",", ":"), sort_keys=True,
    ).encode("utf-8")
    execution_input_checksum = f"sha256:{hashlib.sha256(execution_input).hexdigest()}"
    legacy = GraphExecutionReceipt(
        schema="atlas.graph-execution-receipt.v1",
        operation=operation,
        requested_backend="networkx",
        effective_backend="networkx",
        graph_revision=graph_revision,
        node_count=node_count,
        edge_count=edge_count,
        status="PROVEN",
    )
    return upgrade_graph_execution_receipt_v1(
        legacy,
        executor_revision=f"networkx:{nx.__version__}:{operation.lower()}-v1",
        input_checksum=execution_input_checksum,
        output_checksum=output_checksum,
    )


def run_pagerank(
    *,
    graph_revision: str,
    node_ordinals: Sequence[int],
    edges: Sequence[TypedGraphEdge],
    alpha: float = 0.85,
    tol: float = 1e-8,
    max_iter: int = 100,
) -> tuple[dict[int, float], GraphExecutionReceipt]:
    """Invoke the established NetworkX PageRank oracle without fallback."""
    from atlas_compute.typed_graph_runtime import run_pagerank as run_compat_pagerank

    return run_compat_pagerank(
        graph_revision=graph_revision,
        node_ordinals=node_ordinals,
        edges=edges,
        backend="networkx",
        alpha=alpha,
        tol=tol,
        max_iter=max_iter,
    )


def run_pagerank_v2(
    *, graph_revision: str, node_ordinals: Sequence[int], edges: Sequence[TypedGraphEdge],
    alpha: float = 0.85, tol: float = 1e-8, max_iter: int = 100,
) -> tuple[dict[int, float], GraphExecutionReceiptV2]:
    import networkx as nx

    if not math.isfinite(alpha) or not 0.0 < alpha < 1.0:
        raise ValueError("ATLAS_PAGERANK_ALPHA_INVALID")
    if not math.isfinite(tol) or tol <= 0.0:
        raise ValueError("ATLAS_PAGERANK_TOLERANCE_INVALID")
    if not isinstance(max_iter, int) or isinstance(max_iter, bool) or max_iter < 1:
        raise ValueError("ATLAS_PAGERANK_MAX_ITER_INVALID")
    nodes, normalized_edges, input_checksum = _canonical_graph_input(graph_revision, node_ordinals, edges)
    if not nodes:
        raise ValueError("ATLAS_GRAPH_EMPTY")
    graph = nx.DiGraph()
    graph.add_nodes_from(nodes)
    graph.add_weighted_edges_from(
        (edge.src_ordinal, edge.dst_ordinal, float(edge.weight)) for edge in normalized_edges
    )
    uniform = {node: 1.0 / len(nodes) for node in nodes} if nodes else {}
    values = {int(node): float(score) for node, score in nx.pagerank(
        graph, alpha=alpha, tol=tol, max_iter=max_iter, weight="weight",
        personalization=uniform or None, dangling=uniform or None,
    ).items()} if nodes else {}
    receipt = _execution_receipt(
        graph_revision=graph_revision, node_count=len(nodes), edge_count=len(normalized_edges),
        operation="GRAPH_PAGERANK", input_checksum=input_checksum,
        output={str(key): values[key] for key in sorted(values)},
        parameters={
            "alpha": alpha, "tol": tol, "maxIter": max_iter, "weight": "weight",
            "edgeDirection": "forward", "weightNormalization": "networkx_out_strength",
            "danglingPolicy": "uniform", "tieOrder": "ordinal_map_sorted",
        },
    )
    return values, receipt


def run_sssp(
    *,
    graph_revision: str,
    node_ordinals: Sequence[int],
    edges: Sequence[TypedGraphEdge],
    source_ordinal: int,
    cutoff: float | None = None,
) -> tuple[dict[int, tuple[float, int]], GraphExecutionReceipt]:
    """Invoke the established NetworkX weighted-SSSP oracle."""
    from atlas_compute.typed_graph_runtime import run_sssp as run_compat_sssp

    return run_compat_sssp(
        graph_revision=graph_revision,
        node_ordinals=node_ordinals,
        edges=edges,
        source_ordinal=source_ordinal,
        backend="networkx",
        cutoff=cutoff,
    )


def run_sssp_v2(
    *, graph_revision: str, node_ordinals: Sequence[int], edges: Sequence[TypedGraphEdge],
    source_ordinal: int, cutoff: float | None = None,
) -> tuple[dict[int, tuple[float, int]], GraphExecutionReceiptV2]:
    import networkx as nx

    if cutoff is not None and (
        isinstance(cutoff, bool) or not isinstance(cutoff, (int, float))
        or not math.isfinite(float(cutoff)) or cutoff < 0.0
    ):
        raise ValueError("ATLAS_SSSP_CUTOFF_INVALID")
    nodes, normalized_edges, input_checksum = _canonical_graph_input(graph_revision, node_ordinals, edges)
    if source_ordinal not in nodes:
        raise ValueError("ATLAS_SSSP_SOURCE_NOT_IN_GRAPH")
    graph = nx.DiGraph()
    graph.add_nodes_from(nodes)
    graph.add_weighted_edges_from(
        (edge.src_ordinal, edge.dst_ordinal, float(edge.weight)) for edge in normalized_edges
    )
    distances, paths = nx.single_source_dijkstra(
        graph, source_ordinal, cutoff=cutoff, weight="weight",
    )
    values = {
        node: (
            float(distances[node]),
            int(paths[node][-2]) if len(paths[node]) > 1 else -1,
        ) if node in distances else (float("inf"), -1)
        for node in nodes
    }
    output = [
        [node, None if not math.isfinite(values[node][0]) else values[node][0], values[node][1]]
        for node in nodes
    ]
    receipt = _execution_receipt(
        graph_revision=graph_revision, node_count=len(nodes), edge_count=len(normalized_edges),
        operation="GRAPH_SSSP", input_checksum=input_checksum, output=output,
        parameters={"sourceOrdinal": source_ordinal, "cutoff": cutoff, "weight": "weight", "tieOrder": "ordinal_map_sorted"},
    )
    return values, receipt


def run_personalized_pagerank(
    *, identity: PprExecutionIdentityV1
) -> tuple[dict[int, float], GraphExecutionReceiptV2]:
    """Run NetworkX PPR with explicit seed-weight and dangling distributions."""
    import networkx as nx

    graph = nx.DiGraph()
    graph.add_nodes_from(identity.candidate_ordinals)
    graph.add_edges_from(identity.edge_ordinals)
    seed_map = dict(normalize_seed_weights(dict(identity.seed_weights)))
    scores = nx.pagerank(
        graph,
        alpha=identity.alpha,
        personalization=seed_map,
        dangling=seed_map,
        max_iter=identity.max_iterations,
        tol=identity.epsilon,
        weight=None,
    )
    values = {int(ordinal): float(score) for ordinal, score in scores.items()}
    legacy = GraphExecutionReceipt(
        schema="atlas.graph-execution-receipt.v1",
        operation="GRAPH_PPR",
        requested_backend="networkx",
        effective_backend="networkx",
        graph_revision=identity.graph_revision,
        node_count=len(identity.candidate_ordinals),
        edge_count=len(identity.edge_ordinals),
        status="PROVEN",
    )
    receipt = upgrade_graph_execution_receipt_v1(
        legacy,
        executor_revision=f"networkx:{nx.__version__}:ppr-v1",
        input_checksum=identity.canonical_input_checksum(),
        output_checksum=pagerank_scores_checksum(values),
    )
    return values, receipt


def run_cheirank(
    *, graph_revision: str, node_ordinals: Sequence[int], edges: Sequence[TypedGraphEdge],
    alpha: float = 0.85, tol: float = 1e-8, max_iter: int = 100,
) -> tuple[dict[int, float], GraphExecutionReceiptV2]:
    import networkx as nx

    nodes, normalized_edges, input_checksum = _canonical_graph_input(graph_revision, node_ordinals, edges)
    if not nodes:
        raise ValueError("ATLAS_GRAPH_EMPTY")
    graph = nx.DiGraph()
    graph.add_nodes_from(nodes)
    graph.add_weighted_edges_from(
        (edge.src_ordinal, edge.dst_ordinal, float(edge.weight)) for edge in normalized_edges
    )
    values = {int(node): float(score) for node, score in nx.pagerank(
        graph.reverse(copy=True), alpha=alpha, tol=tol, max_iter=max_iter, weight="weight",
        dangling={node: 1.0 / len(nodes) for node in nodes} if nodes else None,
    ).items()}
    return values, _execution_receipt(
        graph_revision=graph_revision, node_count=len(nodes), edge_count=len(normalized_edges),
        operation="GRAPH_CHEIRANK", input_checksum=input_checksum,
        output={str(key): values[key] for key in sorted(values)},
        parameters={"alpha": alpha, "tol": tol, "maxIter": max_iter, "weight": "weight", "edgeDirection": "reversed", "danglingPolicy": "uniform"},
    )


def run_bfs_neighborhood(
    *, graph_revision: str, node_ordinals: Sequence[int], edges: Sequence[TypedGraphEdge],
    source_ordinal: int, max_depth: int,
) -> tuple[tuple[tuple[int, int, int], ...], GraphExecutionReceiptV2]:
    import networkx as nx

    if not isinstance(max_depth, int) or isinstance(max_depth, bool) or max_depth < 0:
        raise ValueError("ATLAS_BFS_MAX_DEPTH_INVALID")
    nodes, normalized_edges, input_checksum = _canonical_graph_input(graph_revision, node_ordinals, edges)
    if source_ordinal not in nodes:
        raise ValueError("ATLAS_BFS_SOURCE_NOT_IN_GRAPH")
    graph = nx.DiGraph()
    graph.add_nodes_from(nodes)
    graph.add_edges_from((edge.src_ordinal, edge.dst_ordinal) for edge in normalized_edges)
    rows = [(source_ordinal, 0, -1)]
    depths = {source_ordinal: 0}
    queue = deque([source_ordinal])
    while queue:
        parent = queue.popleft()
        if depths[parent] >= max_depth:
            continue
        for child in sorted(graph.successors(parent)):
            if child in depths:
                continue
            depths[child] = depths[parent] + 1
            rows.append((child, depths[child], parent))
            queue.append(child)
    result = tuple(rows)
    receipt = _execution_receipt(
        graph_revision=graph_revision, node_count=len(nodes), edge_count=len(normalized_edges),
        operation="GRAPH_BFS_NEIGHBORHOOD", input_checksum=input_checksum,
        output=[list(row) for row in result],
        parameters={"sourceOrdinal": source_ordinal, "maxDepth": max_depth, "edgeDirection": "forward", "neighborOrder": "ascending_ordinal"},
    )
    return result, receipt


def run_strongly_connected_components(
    *, graph_revision: str, node_ordinals: Sequence[int], edges: Sequence[TypedGraphEdge],
) -> tuple[tuple[tuple[int, ...], ...], GraphExecutionReceiptV2]:
    import networkx as nx

    nodes, normalized_edges, input_checksum = _canonical_graph_input(graph_revision, node_ordinals, edges)
    graph = nx.DiGraph()
    graph.add_nodes_from(nodes)
    graph.add_edges_from((edge.src_ordinal, edge.dst_ordinal) for edge in normalized_edges)
    components = tuple(sorted(
        (tuple(sorted(component)) for component in nx.strongly_connected_components(graph)),
        key=lambda component: component[0],
    ))
    receipt = _execution_receipt(
        graph_revision=graph_revision, node_count=len(nodes), edge_count=len(normalized_edges),
        operation="GRAPH_SCC", input_checksum=input_checksum,
        output=[list(component) for component in components],
    )
    return components, receipt


def run_topological_order(
    *, graph_revision: str, node_ordinals: Sequence[int], edges: Sequence[TypedGraphEdge],
) -> tuple[tuple[int, ...], GraphExecutionReceiptV2]:
    import networkx as nx

    nodes, normalized_edges, input_checksum = _canonical_graph_input(graph_revision, node_ordinals, edges)
    graph = nx.DiGraph()
    graph.add_nodes_from(nodes)
    graph.add_edges_from((edge.src_ordinal, edge.dst_ordinal) for edge in normalized_edges)
    try:
        order = tuple(nx.lexicographical_topological_sort(graph, key=int))
    except nx.NetworkXUnfeasible as exc:
        raise ValueError("ATLAS_TOPOLOGICAL_GRAPH_CYCLIC") from exc
    receipt = _execution_receipt(
        graph_revision=graph_revision, node_count=len(nodes), edge_count=len(normalized_edges),
        operation="GRAPH_TOPOLOGICAL_ORDER", input_checksum=input_checksum,
        output=list(order),
    )
    return order, receipt
