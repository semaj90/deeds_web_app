"""Bounded dense-tensor PPR over Parent Atlas incidence graphs.

This is a PyTorch reference/challenger bridge, not a replacement for the TS CPU
oracle or cuGraph. It operates on a frozen incidence graph with canonical node
IDs sorted into deterministic ordinals, then uses dense GEMV/GEMM-style updates.
For large graphs, cuGraph remains the intended accelerator.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
from typing import Any, Iterable, Sequence

import numpy as np

from .determinism import configure_torch_determinism


@dataclass(frozen=True)
class HypergraphTensorPprReceipt:
    schema: str
    alpha: float
    epsilon: float
    max_iterations: int
    iterations: int
    converged: bool
    convergence_rule: str
    node_count: int
    edge_count: int
    seed_ids: list[str]
    node_ids: list[str]
    scores: list[float]
    result_checksum: str
    device: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _sha256(lines: Iterable[str]) -> str:
    return hashlib.sha256("\n".join(lines).encode("utf-8")).hexdigest()


def run_tensor_ppr(
    node_ids: Sequence[str],
    undirected_edges: Sequence[tuple[str, str]],
    seed_ids: Sequence[str],
    *,
    alpha: float = 0.85,
    epsilon: float = 1e-6,
    max_iterations: int = 100,
    device: str | None = None,
    seed: int = 0xA71A5,
    max_dense_nodes: int = 4096,
) -> HypergraphTensorPprReceipt:
    """Run deterministic PPR with cuGraph-compatible convergence threshold.

    Convergence uses ``L1(delta) < N * epsilon`` so the receipt can be compared
    directly with cuGraph PageRank/PPR configured with the same alpha/epsilon.
    The graph is treated as undirected because Atlas incidence projections join
    each entity node to a relationship node in both traversal directions.
    """

    import torch

    configure_torch_determinism(seed=seed, matmul_mode="ieee")
    if not (0.0 < alpha < 1.0):
        raise ValueError("alpha must be in (0,1)")
    if epsilon <= 0:
        raise ValueError("epsilon must be positive")
    if max_iterations <= 0:
        raise ValueError("max_iterations must be positive")

    ordered_nodes = sorted(set(str(value) for value in node_ids))
    if not ordered_nodes:
        raise ValueError("node_ids must be non-empty")
    if len(ordered_nodes) > max_dense_nodes:
        raise ValueError(
            f"dense tensor PPR limited to {max_dense_nodes} nodes; use cuGraph for {len(ordered_nodes)} nodes"
        )
    ordinal = {node_id: index for index, node_id in enumerate(ordered_nodes)}

    ordered_seeds = sorted(set(seed_ids))
    missing_seeds = [value for value in ordered_seeds if value not in ordinal]
    if missing_seeds:
        raise ValueError(f"seed IDs absent from frozen graph: {missing_seeds[:8]}")

    resolved_device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    n = len(ordered_nodes)
    adjacency = torch.zeros((n, n), dtype=torch.float32, device=resolved_device)
    normalized_edges: set[tuple[int, int]] = set()
    for left_id, right_id in undirected_edges:
        if left_id not in ordinal or right_id not in ordinal:
            raise ValueError(f"edge references unknown node: {(left_id, right_id)}")
        left, right = ordinal[left_id], ordinal[right_id]
        if left == right:
            continue
        a, b = (left, right) if left < right else (right, left)
        if (a, b) in normalized_edges:
            continue
        normalized_edges.add((a, b))
        adjacency[a, b] = 1.0
        adjacency[b, a] = 1.0

    degree = adjacency.sum(dim=1)
    transition = torch.zeros_like(adjacency)
    non_dangling = degree > 0
    transition[non_dangling] = adjacency[non_dangling] / degree[non_dangling].unsqueeze(1)

    personalization = torch.zeros(n, dtype=torch.float32, device=resolved_device)
    seed_mass = 1.0 / len(ordered_seeds)
    for value in ordered_seeds:
        personalization[ordinal[value]] = seed_mass

    scores = personalization.clone()
    threshold = float(n) * float(epsilon)
    converged = False
    iterations = 0

    with torch.inference_mode():
        for iteration in range(1, max_iterations + 1):
            # Row-vector PageRank update: p_next = alpha * p * P + teleport.
            next_scores = alpha * torch.matmul(scores.unsqueeze(0), transition).squeeze(0)
            dangling_mass = scores[~non_dangling].sum()
            if float(dangling_mass) != 0.0:
                next_scores = next_scores + alpha * dangling_mass * personalization
            next_scores = next_scores + (1.0 - alpha) * personalization
            total = next_scores.sum()
            if float(total) > 0.0:
                next_scores = next_scores / total
            delta = torch.sum(torch.abs(next_scores - scores))
            scores = next_scores
            iterations = iteration
            if float(delta) < threshold:
                converged = True
                break

    host_scores = scores.detach().cpu().numpy().astype(np.float64, copy=False)
    checksum_rows = [f"{node_id}\0{host_scores[index]:.17g}" for index, node_id in enumerate(ordered_nodes)]

    return HypergraphTensorPprReceipt(
        schema="atlas.hypergraph-tensor-ppr-receipt.v1",
        alpha=alpha,
        epsilon=epsilon,
        max_iterations=max_iterations,
        iterations=iterations,
        converged=converged,
        convergence_rule="l1_delta_lt_node_count_times_epsilon",
        node_count=n,
        edge_count=len(normalized_edges),
        seed_ids=ordered_seeds,
        node_ids=ordered_nodes,
        scores=host_scores.tolist(),
        result_checksum=_sha256(checksum_rows),
        device=resolved_device,
    )
