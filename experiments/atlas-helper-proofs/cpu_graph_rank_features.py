"""NetworkX PageRank + reversed-edge CheiRank CPU oracle (proposal only)."""
from dataclasses import dataclass
import math

@dataclass(frozen=True)
class GraphRank:
    node: str
    pagerank: float
    cheirank: float
    combined: float

def rank_directed(nodes, edges, alpha=0.85):
    import networkx as nx
    if not 0 < alpha < 1:
        raise ValueError("INVALID_ALPHA")
    nodes = tuple(nodes)
    edges = tuple(edges)
    if not nodes or len(set(nodes)) != len(nodes) or any(not isinstance(n,str) or not n for n in nodes):
        raise ValueError("INVALID_NODES")
    if any(a not in nodes or b not in nodes for a,b in edges):
        raise ValueError("UNQUALIFIED_EDGE")
    graph = nx.DiGraph()
    graph.add_nodes_from(nodes)
    graph.add_edges_from(edges)
    pr = nx.pagerank(graph, alpha=alpha, max_iter=500, tol=1e-10)
    cr = nx.pagerank(graph.reverse(copy=True), alpha=alpha, max_iter=500, tol=1e-10)
    return tuple(GraphRank(n, float(pr[n]), float(cr[n]), float((pr[n]+cr[n])/2))
                 for n in sorted(nodes))
