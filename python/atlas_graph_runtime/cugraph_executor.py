"""Thin RAPIDS/cuGraph executor calls; never an identity or persistence owner."""

from __future__ import annotations

from .contracts import GraphExecutionReceipt, GraphExecutionReceiptV2, upgrade_graph_execution_receipt_v1
from .pagerank_parity import pagerank_scores_checksum
from .ppr_parity import PprExecutionIdentityV1, normalize_seed_weights


def run_personalized_pagerank(
    *, identity: PprExecutionIdentityV1
) -> tuple[dict[int, float], GraphExecutionReceiptV2]:
    """Run cuGraph PPR over the caller's frozen CandidateOrdinal vertices.

    The first parity surface is directed and unweighted. cuGraph's Python API
    accepts an explicit dangling distribution; this adapter pins it to the
    normalized personalization vector to match NetworkX.
    """
    import cudf
    import cugraph

    edges = cudf.DataFrame({
        "src": [src for src, _ in identity.edge_ordinals],
        "dst": [dst for _, dst in identity.edge_ordinals],
    })
    graph = cugraph.Graph(directed=True)
    # The explicit vertices argument is required: isolated CandidateOrdinals
    # cannot otherwise be represented by an edge list and disappear at output.
    graph.from_cudf_edgelist(
        edges,
        source="src",
        destination="dst",
        renumber=False,
        store_transposed=True,
        vertices=cudf.Series(identity.candidate_ordinals, dtype="int64"),
    )
    normalized = normalize_seed_weights(dict(identity.seed_weights))
    personalization = cudf.DataFrame()
    personalization["vertex"] = cudf.Series([ordinal for ordinal, _ in normalized], dtype="int64")
    personalization["values"] = cudf.Series([weight for _, weight in normalized], dtype="float32")
    result = cugraph.pagerank(
        graph,
        alpha=identity.alpha,
        personalization=personalization,
        dangling=personalization,
        max_iter=identity.max_iterations,
        tol=identity.epsilon,
        fail_on_nonconvergence=False,
    )
    converged = True
    if isinstance(result, tuple):
        frame, converged = result
    else:
        frame = result
    if not converged:
        raise RuntimeError("CUGRAPH_PPR_NONCONVERGED")
    frame = frame.sort_values("vertex").to_pandas()
    values = {int(row.vertex): float(row.pagerank) for row in frame.itertuples(index=False)}
    if set(values) != set(identity.candidate_ordinals):
        missing = sorted(set(identity.candidate_ordinals) - set(values))
        extra = sorted(set(values) - set(identity.candidate_ordinals))
        raise RuntimeError(f"CUGRAPH_PPR_ORDINAL_SET_MISMATCH:missing={missing}:extra={extra}")
    legacy = GraphExecutionReceipt(
        schema="atlas.graph-execution-receipt.v1",
        operation="GRAPH_PPR",
        requested_backend="cugraph",
        effective_backend="cugraph",
        graph_revision=identity.graph_revision,
        node_count=len(identity.candidate_ordinals),
        edge_count=len(identity.edge_ordinals),
        status="PROVEN",
    )
    receipt = upgrade_graph_execution_receipt_v1(
        legacy,
        executor_revision=f"cugraph:{cugraph.__version__}:ppr-v1",
        input_checksum=identity.canonical_input_checksum(),
        output_checksum=pagerank_scores_checksum(values),
    )
    return values, receipt
