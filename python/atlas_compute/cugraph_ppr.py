"""cuGraph personalized PageRank parity for frozen Atlas incidence graphs."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
from typing import Any, Sequence

import numpy as np


@dataclass(frozen=True)
class CuGraphPprParityReceipt:
    schema: str
    alpha: float
    epsilon: float
    max_iterations: int
    node_count: int
    edge_count: int
    converged: bool
    maximum_absolute_error: float | None
    l1_error: float | None
    score_checksum: str
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def run_cugraph_ppr_parity(
    node_ids: Sequence[str],
    undirected_edges: Sequence[tuple[str, str]],
    seed_ids: Sequence[str],
    *,
    alpha: float = 0.85,
    epsilon: float = 1e-6,
    max_iterations: int = 100,
    reference_scores: Sequence[float] | None = None,
) -> tuple[dict[str, float], CuGraphPprParityReceipt]:
    """Run cuGraph PageRank with personalization over dense frozen ordinals.

    `node_ids` are sorted internally to create contiguous ordinals. If
    `reference_scores` is provided, it must already be ordered by this same
    sorted-node order and parity error is reported against it.
    """

    import cudf
    import cugraph

    ordered_nodes = sorted(set(node_ids))
    if len(ordered_nodes) != len(node_ids):
        raise ValueError("node_ids must be unique")
    ordinal = {node_id: index for index, node_id in enumerate(ordered_nodes)}
    seeds = sorted(set(seed_ids))
    if not seeds or any(seed not in ordinal for seed in seeds):
        raise ValueError("all seed_ids must exist in node_ids")

    normalized_edges: set[tuple[int, int]] = set()
    for left_id, right_id in undirected_edges:
        if left_id not in ordinal or right_id not in ordinal:
            raise ValueError(f"edge references unknown node: {(left_id, right_id)}")
        left, right = ordinal[left_id], ordinal[right_id]
        if left == right:
            continue
        a, b = (left, right) if left < right else (right, left)
        normalized_edges.add((a, b))
    if not normalized_edges:
        raise ValueError("incidence graph must contain at least one edge")

    src = [edge[0] for edge in sorted(normalized_edges)]
    dst = [edge[1] for edge in sorted(normalized_edges)]
    edges = cudf.DataFrame({"src": src, "dst": dst})
    graph = cugraph.Graph(directed=False)
    graph.from_cudf_edgelist(edges, source="src", destination="dst", renumber=False)

    mass = 1.0 / len(seeds)
    personalization = cudf.DataFrame({
        "vertex": [ordinal[seed] for seed in seeds],
        "values": [mass] * len(seeds),
    })
    result = cugraph.pagerank(
        graph,
        alpha=alpha,
        personalization=personalization,
        max_iter=max_iterations,
        tol=epsilon,
        fail_on_nonconvergence=False,
    )
    if isinstance(result, tuple):
        frame, converged = result
    else:
        frame, converged = result, True

    frame = frame.sort_values("vertex")
    vertices = frame["vertex"].to_pandas().to_numpy(dtype=np.int64)
    values = frame["pagerank"].to_pandas().to_numpy(dtype=np.float64)
    scores_array = np.zeros(len(ordered_nodes), dtype=np.float64)
    for vertex, value in zip(vertices.tolist(), values.tolist()):
        if 0 <= int(vertex) < len(scores_array):
            scores_array[int(vertex)] = float(value)

    maximum_absolute_error: float | None = None
    l1_error: float | None = None
    if reference_scores is not None:
        reference = np.asarray(reference_scores, dtype=np.float64)
        if reference.shape != scores_array.shape:
            raise ValueError("reference_scores length must equal sorted node count")
        absolute = np.abs(scores_array - reference)
        maximum_absolute_error = float(np.max(absolute))
        l1_error = float(np.sum(absolute))

    score_rows = [f"{node_id}\0{scores_array[index]:.17g}" for index, node_id in enumerate(ordered_nodes)]
    receipt = CuGraphPprParityReceipt(
        schema="atlas.cugraph-ppr-parity-receipt.v1",
        alpha=alpha,
        epsilon=epsilon,
        max_iterations=max_iterations,
        node_count=len(ordered_nodes),
        edge_count=len(normalized_edges),
        converged=bool(converged),
        maximum_absolute_error=maximum_absolute_error,
        l1_error=l1_error,
        score_checksum=hashlib.sha256("\n".join(score_rows).encode("utf-8")).hexdigest(),
        canonical_authority=False,
    )
    return {node_id: float(scores_array[index]) for index, node_id in enumerate(ordered_nodes)}, receipt
