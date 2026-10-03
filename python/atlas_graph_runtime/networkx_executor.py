"""Thin NetworkX CPU-oracle adapter over the existing compatibility owner.

This module deliberately contains no graph algorithms. Canonical graph identity
and graph construction inputs are supplied by the caller as frozen ordinals.
"""

from __future__ import annotations

from typing import Sequence

from .contracts import GraphExecutionReceipt, GraphExecutionReceiptV2, TypedGraphEdge
from .contracts import upgrade_graph_execution_receipt_v1
from .pagerank_parity import pagerank_scores_checksum
from .ppr_parity import PprExecutionIdentityV1, normalize_seed_weights


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
