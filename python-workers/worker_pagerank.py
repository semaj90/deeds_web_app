#!/usr/bin/env python3
"""
PageRank GPU Worker

Reads JSON from stdin, computes PageRank on GPU using PyTorch,
writes results to stdout. Used by topology enrichment pipeline.

Protocol:
  INPUT (stdin):  {"edges": [[src, dst], ...], "personalization": [...], "damping": 0.85, "iterations": 50, "random_seed": 42}
  OUTPUT (stdout): {"node_ids": [...], "pagerank_scores": [...], "convergence": 0.95, "iterations": 42}
  ERROR (stderr):  {"error": "message"}
"""

import sys
import json
import torch
import numpy as np
from typing import Dict, List, Tuple, Any
from collections import defaultdict

def pagerank_gpu(
    edges: List[Tuple[int, int]],
    personalization: List[float] = None,
    damping: float = 0.85,
    iterations: int = 50,
    tol: float = 1e-4,
    random_seed: int = 42
) -> Dict[str, Any]:
    """
    Compute PageRank using power iteration on GPU.

    Args:
        edges: List of (source, destination) tuples
        personalization: Per-node personalization vector (optional)
        damping: Damping factor (default 0.85)
        iterations: Maximum iterations
        tol: Convergence tolerance
        random_seed: Reproducible seeding

    Returns:
        {
          "node_ids": [int, ...],           # sorted node IDs
          "pagerank_scores": [float, ...],  # PageRank scores (0-1 normalized)
          "convergence": float,             # final L2 distance
          "iterations": int                 # actual iterations
        }
    """
    torch.manual_seed(random_seed)
    np.random.seed(random_seed)

    # Build adjacency structure
    graph = defaultdict(list)
    all_nodes = set()

    for src, dst in edges:
        graph[src].append(dst)
        all_nodes.add(src)
        all_nodes.add(dst)

    if not all_nodes:
        raise ValueError("No edges provided")

    n = len(all_nodes)
    node_id_to_idx = {node_id: i for i, node_id in enumerate(sorted(all_nodes))}
    idx_to_node_id = {i: node_id for node_id, i in node_id_to_idx.items()}

    device = 'cuda:0' if torch.cuda.is_available() else 'cpu'

    # Transition matrix P (column-stochastic)
    # P[i][j] = 1 / out_degree[j] if edge j->i exists, 0 otherwise
    P = torch.zeros((n, n), dtype=torch.float32, device=device)

    out_degree = defaultdict(float)
    for src, dests in graph.items():
        out_degree[src] = float(len(dests))

    for src, dests in graph.items():
        src_idx = node_id_to_idx[src]
        d = out_degree[src]

        for dst in dests:
            dst_idx = node_id_to_idx[dst]
            P[dst_idx, src_idx] = 1.0 / d

    # Handle dangling nodes (out-degree = 0)
    dangling_mask = torch.zeros(n, dtype=torch.bool, device=device)
    for i in range(n):
        if P[:, i].sum() == 0:
            dangling_mask[i] = True
            P[:, i] = 1.0 / n

    # Personalization vector
    if personalization is None:
        e = torch.ones(n, dtype=torch.float32, device=device) / n
    else:
        e = torch.tensor(personalization, dtype=torch.float32, device=device)
        e = e / e.sum()  # Normalize

    # Power iteration: r = (1-d)*e + d*P*r
    r = e.clone()

    for epoch in range(iterations):
        r_new = (1 - damping) * e + damping * (P @ r)

        # Convergence check
        diff = torch.norm(r_new - r, p=2).item()

        if diff < tol:
            r = r_new
            break

        r = r_new

    # Normalize to [0, 1]
    r_min = r.min().item()
    r_max = r.max().item()
    if r_max > r_min:
        r_normalized = (r - r_min) / (r_max - r_min)
    else:
        r_normalized = torch.ones_like(r) / n

    return {
        "node_ids": [idx_to_node_id[i] for i in range(n)],
        "pagerank_scores": r_normalized.cpu().numpy().tolist(),
        "convergence": float(diff),
        "iterations": epoch + 1,
    }


def main():
    try:
        # Read JSON from stdin
        input_data = sys.stdin.read()
        job = json.loads(input_data)

        # Extract parameters
        edges = [tuple(edge) for edge in job.get('edges', [])]
        personalization = job.get('personalization', None)
        if personalization is not None:
            personalization = np.array(personalization, dtype=np.float32)

        damping = float(job.get('damping', 0.85))
        iterations = int(job.get('iterations', 50))
        tol = float(job.get('tol', 1e-4))
        random_seed = int(job.get('random_seed', 42))

        # Validate input
        if not edges:
            raise ValueError("No edges provided")
        if damping < 0 or damping > 1:
            raise ValueError(f"damping must be in [0, 1], got {damping}")
        if iterations < 1:
            raise ValueError(f"iterations must be at least 1, got {iterations}")

        # Compute PageRank
        result = pagerank_gpu(edges, personalization, damping, iterations, tol, random_seed)

        # Write result to stdout (JSON)
        print(json.dumps(result))
        sys.exit(0)

    except Exception as e:
        # Write error to stderr (JSON)
        error_msg = json.dumps({
            "error": str(e),
            "type": type(e).__name__,
        })
        print(error_msg, file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
