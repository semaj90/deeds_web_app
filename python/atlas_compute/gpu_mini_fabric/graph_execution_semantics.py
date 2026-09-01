"""GraphExecutionSemanticsV1 -- compared BEFORE any cross-engine PageRank (or
other graph-algorithm) result is trusted.

Directly targets the real lesson from rapidsai/cugraph#482 (verified against
the issue's full resolution thread): the reporter's own graph was
accidentally undirected on the NetworkX side and directed on the cuGraph
side. A vertexCount/edgeCount/directed mismatch check here would have caught
that before any PageRank score was even computed.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
from typing import Any

import networkx as nx


@dataclass(frozen=True)
class GraphExecutionSemanticsV1:
    engine: str
    directed: bool
    vertex_count: int
    edge_count: int
    weighted: bool
    symmetrized: bool
    renumbered: bool
    ordinal_map_checksum: str
    dangling_node_count: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "engine": self.engine,
            "directed": self.directed,
            "vertexCount": self.vertex_count,
            "edgeCount": self.edge_count,
            "weighted": self.weighted,
            "symmetrized": self.symmetrized,
            "renumbered": self.renumbered,
            "ordinalMapChecksum": self.ordinal_map_checksum,
            "danglingNodeCount": self.dangling_node_count,
        }


def _ordinal_map_checksum(node_keys: list[str]) -> str:
    return hashlib.sha256("\n".join(sorted(node_keys)).encode()).hexdigest()


def compute_semantics_networkx(g: "nx.DiGraph", node_keys: list[str]) -> GraphExecutionSemanticsV1:
    dangling = sum(1 for n in g.nodes if g.out_degree(n) == 0)
    return GraphExecutionSemanticsV1(
        engine="networkx",
        directed=g.is_directed(),
        vertex_count=g.number_of_nodes(),
        edge_count=g.number_of_edges(),
        weighted=nx.is_weighted(g),
        symmetrized=False,
        renumbered=False,
        ordinal_map_checksum=_ordinal_map_checksum(list(g.nodes)),
        dangling_node_count=dangling,
    )


def compute_semantics_cugraph(cg, node_keys: list[str]) -> GraphExecutionSemanticsV1:
    vertex_count = cg.number_of_vertices()
    edge_count = cg.number_of_edges()
    directed = cg.is_directed()
    # cuGraph's own vertex list (post-renumbering, but returns original labels).
    verts = cg.nodes().to_pandas().tolist() if hasattr(cg, "nodes") else node_keys
    out_deg_df = cg.out_degree().to_pandas()
    dangling = int((out_deg_df["degree"] == 0).sum())
    return GraphExecutionSemanticsV1(
        engine="cugraph",
        directed=directed,
        vertex_count=vertex_count,
        edge_count=edge_count,
        weighted=False,
        symmetrized=False,
        renumbered=True,
        ordinal_map_checksum=_ordinal_map_checksum([str(v) for v in verts]),
        dangling_node_count=dangling,
    )


def assert_semantics_agree(nx_sem: GraphExecutionSemanticsV1, cg_sem: GraphExecutionSemanticsV1) -> None:
    """Blocks any downstream PageRank/BFS comparison if the two engines
    disagree on directedness or vertex/edge counts -- the exact class of bug
    that produced rapidsai/cugraph#482's mismatch."""
    mismatches = []
    if nx_sem.directed != cg_sem.directed:
        mismatches.append(f"directed mismatch: networkx={nx_sem.directed} cugraph={cg_sem.directed}")
    if nx_sem.vertex_count != cg_sem.vertex_count:
        mismatches.append(f"vertexCount mismatch: networkx={nx_sem.vertex_count} cugraph={cg_sem.vertex_count}")
    if nx_sem.edge_count != cg_sem.edge_count:
        mismatches.append(f"edgeCount mismatch: networkx={nx_sem.edge_count} cugraph={cg_sem.edge_count}")
    if mismatches:
        raise AssertionError("GraphExecutionSemanticsV1 disagreement -- blocking comparison: " + "; ".join(mismatches))
