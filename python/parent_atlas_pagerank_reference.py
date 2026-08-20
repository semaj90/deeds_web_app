#!/usr/bin/env python3
"""Dependency-free PageRank reference for Parent Atlas.

This module is intentionally small enough to act as a mathematical oracle for
NetworkX, Neo4j GDS, cuGraph, and future GPU implementations.

For a directed weighted graph with damping factor ``d`` and personalization
vector ``v`` (uniform by default), PageRank is the stationary vector ``r``:

    r = (1 - d) v + d P^T r

where ``P`` is row-stochastic. Dangling nodes (zero outgoing weight) are
redistributed according to ``v``. Equivalently:

    r_i = (1-d) v_i
          + d * sum_{j -> i} r_j * w_ji / sum_k w_jk
          + d * v_i * sum_{j in dangling} r_j

The implementation below uses power iteration. It is not the production
PageRank owner; it is a deterministic correctness oracle.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from dataclasses import dataclass
from typing import Iterable, Mapping, Sequence


@dataclass(frozen=True, slots=True)
class WeightedEdge:
    source: str
    target: str
    weight: float = 1.0


def _normalize_distribution(
    nodes: Sequence[str],
    values: Mapping[str, float] | None,
) -> dict[str, float]:
    if not nodes:
        return {}
    if values is None:
        uniform = 1.0 / len(nodes)
        return {node: uniform for node in nodes}

    unknown = set(values) - set(nodes)
    if unknown:
        raise ValueError(f"personalization contains unknown nodes: {sorted(unknown)}")

    normalized = {node: float(values.get(node, 0.0)) for node in nodes}
    if any((not math.isfinite(value) or value < 0.0) for value in normalized.values()):
        raise ValueError("personalization values must be finite and non-negative")

    total = sum(normalized.values())
    if total <= 0.0:
        raise ValueError("personalization must have positive total mass")
    return {node: value / total for node, value in normalized.items()}


def pagerank(
    nodes: Iterable[str],
    edges: Iterable[WeightedEdge],
    *,
    damping: float = 0.85,
    tolerance: float = 1e-12,
    max_iterations: int = 1000,
    personalization: Mapping[str, float] | None = None,
) -> dict[str, float]:
    """Compute weighted directed PageRank with explicit dangling redistribution."""

    ordered_nodes = tuple(dict.fromkeys(nodes))
    if not ordered_nodes:
        return {}
    if not 0.0 <= damping < 1.0:
        raise ValueError("damping must satisfy 0 <= damping < 1")
    if tolerance <= 0.0 or not math.isfinite(tolerance):
        raise ValueError("tolerance must be finite and > 0")
    if max_iterations <= 0:
        raise ValueError("max_iterations must be > 0")

    node_set = set(ordered_nodes)
    outgoing: dict[str, list[tuple[str, float]]] = defaultdict(list)
    outgoing_weight = {node: 0.0 for node in ordered_nodes}

    for edge in edges:
        if edge.source not in node_set or edge.target not in node_set:
            raise ValueError(f"edge references unknown node: {edge}")
        weight = float(edge.weight)
        if not math.isfinite(weight) or weight <= 0.0:
            raise ValueError("edge weights must be finite and > 0")
        outgoing[edge.source].append((edge.target, weight))
        outgoing_weight[edge.source] += weight

    teleport = _normalize_distribution(ordered_nodes, personalization)
    rank = dict(teleport)
    dangling = tuple(node for node in ordered_nodes if outgoing_weight[node] == 0.0)

    for _ in range(max_iterations):
        dangling_mass = sum(rank[node] for node in dangling)
        next_rank = {
            node: (1.0 - damping) * teleport[node]
            + damping * dangling_mass * teleport[node]
            for node in ordered_nodes
        }

        for source in ordered_nodes:
            denominator = outgoing_weight[source]
            if denominator == 0.0:
                continue
            source_mass = damping * rank[source]
            for target, weight in outgoing[source]:
                next_rank[target] += source_mass * (weight / denominator)

        error = sum(abs(next_rank[node] - rank[node]) for node in ordered_nodes)
        rank = next_rank
        if error <= tolerance:
            total = sum(rank.values())
            return {node: rank[node] / total for node in ordered_nodes}

    raise RuntimeError(
        f"PageRank failed to converge in {max_iterations} iterations "
        f"(last L1 error={error:.3e})"
    )


def _demo_graph() -> tuple[list[str], list[WeightedEdge]]:
    # A -> B -> C -> A is symmetric, so every node converges to 1/3.
    return ["A", "B", "C"], [
        WeightedEdge("A", "B"),
        WeightedEdge("B", "C"),
        WeightedEdge("C", "A"),
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description="Compute a small PageRank reference graph")
    parser.add_argument("--damping", type=float, default=0.85)
    args = parser.parse_args()

    nodes, edges = _demo_graph()
    scores = pagerank(nodes, edges, damping=args.damping)
    print(
        json.dumps(
            {
                "schema": "parent-atlas.pagerank-reference.v1",
                "formula": "r=(1-d)v+d*P^T*r",
                "damping": args.damping,
                "scores": scores,
                "sum": sum(scores.values()),
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
