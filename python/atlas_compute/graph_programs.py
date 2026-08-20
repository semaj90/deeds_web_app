"""Deterministic graph-program references for Parent Atlas.

These routines are CPU/control-plane references. They operate on canonical node
IDs and return bounded traversal/scheduling receipts. GPU cuGraph is a parity/
throughput executor for large snapshots; it does not change graph semantics.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import heapq
from typing import Any, Iterable, Sequence

import networkx as nx


@dataclass(frozen=True)
class BfsReceipt:
    schema: str
    seed_ids: list[str]
    depth_limit: int
    visited_ids: list[str]
    distance_by_id: dict[str, int]
    predecessor_by_id: dict[str, str | None]
    layers: list[list[str]]
    output_checksum: str
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class CondensationDagReceipt:
    schema: str
    component_members: list[list[str]]
    node_to_component: dict[str, int]
    dag_edges: list[tuple[int, int]]
    lexicographic_component_order: list[int]
    cyclic_component_count: int
    output_checksum: str
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _sha256_lines(lines: Iterable[str]) -> str:
    return hashlib.sha256("\n".join(lines).encode("utf-8")).hexdigest()


def deterministic_bfs(
    node_ids: Sequence[str],
    edges: Sequence[tuple[str, str]],
    seed_ids: Sequence[str],
    *,
    depth_limit: int = 2,
    directed: bool = True,
) -> BfsReceipt:
    if depth_limit < 0:
        raise ValueError("depth_limit must be nonnegative")
    nodes = sorted(set(node_ids))
    node_set = set(nodes)
    seeds = sorted(set(seed_ids))
    missing = [seed for seed in seeds if seed not in node_set]
    if missing:
        raise ValueError(f"unknown BFS seeds: {missing}")

    adjacency: dict[str, set[str]] = {node: set() for node in nodes}
    for source, target in edges:
        if source not in node_set or target not in node_set:
            raise ValueError(f"edge references unknown node: {(source, target)}")
        adjacency[source].add(target)
        if not directed:
            adjacency[target].add(source)

    distance: dict[str, int] = {}
    predecessor: dict[str, str | None] = {}
    frontier = seeds
    for seed in seeds:
        distance[seed] = 0
        predecessor[seed] = None

    layers: list[list[str]] = [list(seeds)] if seeds else []
    current_depth = 0
    while frontier and current_depth < depth_limit:
        next_frontier: list[str] = []
        for source in frontier:
            for target in sorted(adjacency[source]):
                if target in distance:
                    continue
                distance[target] = current_depth + 1
                predecessor[target] = source
                next_frontier.append(target)
        next_frontier = sorted(set(next_frontier))
        if next_frontier:
            layers.append(next_frontier)
        frontier = next_frontier
        current_depth += 1

    visited = sorted(distance, key=lambda node: (distance[node], node))
    checksum = _sha256_lines(
        f"{node}\0{distance[node]}\0{predecessor[node] or ''}" for node in visited
    )
    return BfsReceipt(
        schema="atlas.bfs-receipt.v1",
        seed_ids=seeds,
        depth_limit=depth_limit,
        visited_ids=visited,
        distance_by_id={node: distance[node] for node in visited},
        predecessor_by_id={node: predecessor[node] for node in visited},
        layers=layers,
        output_checksum=checksum,
        canonical_authority=False,
    )


def condense_and_lexicographically_sort(
    node_ids: Sequence[str],
    edges: Sequence[tuple[str, str]],
) -> CondensationDagReceipt:
    """Condense SCCs then produce one deterministic topological component order.

    Topological order is undefined on cyclic graphs, so SCC condensation is the
    explicit first step. NetworkX uses Tarjan/Nuutila for SCC discovery; Atlas
    then re-numbers components by their sorted canonical members so backend SCC
    enumeration order cannot leak into receipts.
    """

    graph = nx.DiGraph()
    graph.add_nodes_from(sorted(set(node_ids)))
    graph.add_edges_from(edges)

    components = [sorted(component) for component in nx.strongly_connected_components(graph)]
    components.sort(key=lambda members: tuple(members))
    node_to_component = {
        node: component_id
        for component_id, members in enumerate(components)
        for node in members
    }

    dag_edges = sorted({
        (node_to_component[source], node_to_component[target])
        for source, target in graph.edges()
        if node_to_component[source] != node_to_component[target]
    })

    outgoing: dict[int, list[int]] = {i: [] for i in range(len(components))}
    indegree = {i: 0 for i in range(len(components))}
    for source, target in dag_edges:
        outgoing[source].append(target)
        indegree[target] += 1
    for values in outgoing.values():
        values.sort()

    ready: list[tuple[tuple[str, ...], int]] = []
    for component_id, degree in indegree.items():
        if degree == 0:
            heapq.heappush(ready, (tuple(components[component_id]), component_id))

    order: list[int] = []
    while ready:
        _, component_id = heapq.heappop(ready)
        order.append(component_id)
        for target in outgoing[component_id]:
            indegree[target] -= 1
            if indegree[target] == 0:
                heapq.heappush(ready, (tuple(components[target]), target))

    if len(order) != len(components):
        raise RuntimeError("condensation graph unexpectedly remained cyclic")

    checksum = _sha256_lines([
        *(f"C{component_id}:{'|'.join(members)}" for component_id, members in enumerate(components)),
        *(f"E:{source}->{target}" for source, target in dag_edges),
        f"ORDER:{','.join(map(str, order))}",
    ])
    return CondensationDagReceipt(
        schema="atlas.condensation-dag-receipt.v1",
        component_members=components,
        node_to_component=node_to_component,
        dag_edges=dag_edges,
        lexicographic_component_order=order,
        cyclic_component_count=sum(1 for members in components if len(members) > 1),
        output_checksum=checksum,
        canonical_authority=False,
    )
