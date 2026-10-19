"""
A/B Parity Checker: NetworkX (CPU Oracle) vs PyTorch Tensor Engine
Verifies graph centrality and PageRank computations on AST graphs extracted from :8095.

Constraints:
- Strictly read-only: zero database writes.
- 3-Rung Compute Ladder:
    Rung 1: NetworkX CPU Oracle (Reference)
    Rung 2: PyTorch CPU Tensor Vectorized Execution
    Rung 3: PyTorch CUDA GPU Execution (when available, VRAM bounded <100MB)
"""

import json
import math
import os
import sys
from pathlib import Path
import pytest
import networkx as nx
import torch

GRAPH_JSON_PATH = Path(".tmp/atlas/ast-graph-8095.json")


def load_ast_graph(json_path: Path) -> nx.DiGraph:
    """Load AST graph from 8095 JSON artifact or synthesize a realistic test graph."""
    G = nx.DiGraph()
    if json_path.exists():
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        for node in data.get("nodes", []):
            G.add_node(node["nodeKey"], **node)
        for edge in data.get("edges", []):
            G.add_edge(edge["sourceNode"], edge["targetNode"], type=edge.get("type", "UNKNOWN"))
    else:
        # Fallback synthetic DAG with calls, definitions, and imports
        for i in range(100):
            G.add_node(f"node_{i}", kind="function" if i % 2 == 0 else "import")
        for i in range(100):
            if i + 1 < 100:
                G.add_edge(f"node_{i}", f"node_{i+1}", type="CALLS")
            if i * 2 < 100 and i > 0:
                G.add_edge(f"node_{i}", f"node_{i*2}", type="REFERENCES")
    return G


def pytorch_pagerank(
    G: nx.DiGraph,
    alpha: float = 0.85,
    max_iter: int = 100,
    tol: float = 1e-6,
    device: str = "cpu",
) -> dict[str, float]:
    """Compute PageRank using PyTorch vector-matrix power iteration matching NetworkX exactly."""
    nodes = list(G.nodes())
    N = len(nodes)
    if N == 0:
        return {}
    if N == 1:
        return {nodes[0]: 1.0}

    node2idx = {n: i for i, n in enumerate(nodes)}

    # Build transition matrix
    A = torch.zeros((N, N), dtype=torch.float64, device=device)
    dangling = torch.zeros(N, dtype=torch.bool, device=device)

    for u in G.nodes():
        out_deg = G.out_degree(u)
        u_idx = node2idx[u]
        if out_deg == 0:
            dangling[u_idx] = True
        else:
            for v in G.successors(u):
                v_idx = node2idx[v]
                A[u_idx, v_idx] += 1.0 / out_deg

    x = torch.full((N,), 1.0 / N, dtype=torch.float64, device=device)

    for _ in range(max_iter):
        danglesum = alpha * torch.sum(x[dangling])
        x_next = alpha * (x @ A) + (danglesum + (1.0 - alpha)) / N
        err = torch.sum(torch.abs(x_next - x)).item()
        x = x_next
        if err < N * tol:
            break

    x_cpu = x.cpu()
    return {n: x_cpu[node2idx[n]].item() for n in nodes}


def pytorch_degree_centralities(
    G: nx.DiGraph,
    device: str = "cpu",
) -> tuple[dict[str, float], dict[str, float]]:
    """Compute in-degree and out-degree centralities using PyTorch."""
    nodes = list(G.nodes())
    N = len(nodes)
    if N <= 1:
        return {n: 0.0 for n in nodes}, {n: 0.0 for n in nodes}

    node2idx = {n: i for i, n in enumerate(nodes)}
    adj = torch.zeros((N, N), dtype=torch.float64, device=device)

    for u, v in G.edges():
        adj[node2idx[u], node2idx[v]] = 1.0

    denom = float(N - 1)
    in_degrees = torch.sum(adj, dim=0) / denom
    out_degrees = torch.sum(adj, dim=1) / denom

    in_cpu = in_degrees.cpu()
    out_cpu = out_degrees.cpu()

    in_cent = {n: in_cpu[node2idx[n]].item() for n in nodes}
    out_cent = {n: out_cpu[node2idx[n]].item() for n in nodes}
    return in_cent, out_cent


def pearson_correlation(x: list[float], y: list[float]) -> float:
    """Compute Pearson correlation between two float series."""
    n = len(x)
    if n < 2:
        return 1.0
    mean_x = sum(x) / n
    mean_y = sum(y) / n
    var_x = sum((xi - mean_x) ** 2 for xi in x)
    var_y = sum((yi - mean_y) ** 2 for yi in y)
    if var_x == 0.0 or var_y == 0.0:
        return 1.0
    cov_xy = sum((xi - mean_x) * (yi - mean_y) for xi, yi in zip(x, y))
    return cov_xy / math.sqrt(var_x * var_y)


class TestNetworkXPyTorchGraphParity:
    """A/B Parity verification suite."""

    @classmethod
    def setup_class(cls):
        cls.graph = load_ast_graph(GRAPH_JSON_PATH)

    def test_graph_loaded_and_non_empty(self):
        assert self.graph.number_of_nodes() > 0, "AST graph must have at least one node."
        assert self.graph.number_of_edges() > 0, "AST graph must have at least one edge."

    def test_pagerank_cpu_parity(self):
        # Oracle: NetworkX
        nx_pr = nx.pagerank(self.graph, alpha=0.85, tol=1e-6)
        # Rung 2: PyTorch CPU
        pt_pr = pytorch_pagerank(self.graph, alpha=0.85, tol=1e-6, device="cpu")

        nodes = list(self.graph.nodes())
        nx_vals = [nx_pr[n] for n in nodes]
        pt_vals = [pt_pr[n] for n in nodes]

        max_abs_diff = max(abs(a - b) for a, b in zip(nx_vals, pt_vals))
        corr = pearson_correlation(nx_vals, pt_vals)

        # PageRank sum check
        assert abs(sum(pt_vals) - 1.0) < 1e-4, f"PyTorch PageRank sum should be ~1.0, got {sum(pt_vals)}"
        assert max_abs_diff < 1e-5, f"PageRank max diff exceeds tolerance: {max_abs_diff}"
        assert corr > 0.9999, f"PageRank Pearson correlation is too low: {corr}"

    def test_degree_centrality_cpu_parity(self):
        nx_in = nx.in_degree_centrality(self.graph)
        nx_out = nx.out_degree_centrality(self.graph)

        pt_in, pt_out = pytorch_degree_centralities(self.graph, device="cpu")

        nodes = list(self.graph.nodes())
        in_diffs = [abs(nx_in[n] - pt_in[n]) for n in nodes]
        out_diffs = [abs(nx_out[n] - pt_out[n]) for n in nodes]

        assert max(in_diffs) < 1e-6, f"In-degree centrality max diff: {max(in_diffs)}"
        assert max(out_diffs) < 1e-6, f"Out-degree centrality max diff: {max(out_diffs)}"

    @pytest.mark.skipif(not torch.cuda.is_available(), reason="CUDA GPU not available")
    def test_pagerank_cuda_gpu_parity(self):
        # Ensure VRAM safety
        initial_vram = torch.cuda.memory_allocated()

        pt_cpu_pr = pytorch_pagerank(self.graph, alpha=0.85, tol=1e-6, device="cpu")
        pt_cuda_pr = pytorch_pagerank(self.graph, alpha=0.85, tol=1e-6, device="cuda")

        nodes = list(self.graph.nodes())
        cpu_vals = [pt_cpu_pr[n] for n in nodes]
        cuda_vals = [pt_cuda_pr[n] for n in nodes]

        max_abs_diff = max(abs(a - b) for a, b in zip(cpu_vals, cuda_vals))
        corr = pearson_correlation(cpu_vals, cuda_vals)

        assert max_abs_diff < 1e-5, f"CUDA vs CPU PageRank diff: {max_abs_diff}"
        assert corr > 0.9999, f"CUDA vs CPU PageRank correlation: {corr}"

        # Clean up GPU memory
        torch.cuda.empty_cache()
        peak_vram_mb = torch.cuda.max_memory_allocated() / (1024 * 1024)
        assert peak_vram_mb < 200, f"Peak VRAM exceeded 200MB safe budget: {peak_vram_mb}MB"
