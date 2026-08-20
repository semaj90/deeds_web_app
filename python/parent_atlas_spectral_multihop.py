#!/usr/bin/env python3
"""Parent Atlas bounded spectral/multihop reference pipeline.

Reference-only implementation for proving math and CPU/GPU parity before a cuGraph/
cuSOLVER/cuBLASLt owner is promoted. It intentionally works on a bounded induced DAG
subgraph instead of materializing a dense whole-repository Laplacian.

Inputs are expected to be revision-frozen by the caller:
- semantic matrix X: [N, 768], float32
- directed edge list over row ordinals

Outputs:
- PCA/SVD latent_128 and latent_64
- DAG generation coordinates
- four spectral topology coordinates from the symmetric normalized Laplacian
- float32 byte payloads suitable for PostgreSQL BYTEA with SHA-256 receipts
"""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from typing import Iterable, Sequence

import networkx as nx
import numpy as np


@dataclass(frozen=True)
class ProjectionArtifact:
    rows: int
    cols: int
    dtype: str
    payload: bytes
    sha256_hex: str


def _artifact(matrix: np.ndarray) -> ProjectionArtifact:
    contiguous = np.ascontiguousarray(matrix, dtype=np.float32)
    payload = contiguous.tobytes(order="C")
    return ProjectionArtifact(
        rows=int(contiguous.shape[0]),
        cols=int(contiguous.shape[1]),
        dtype="float32-le",
        payload=payload,
        sha256_hex=sha256(payload).hexdigest(),
    )


def pca_svd_latents(semantic_768: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Deterministic PCA via thin SVD; returns latent128, latent64, singular values.

    This is the correctness/reference path. Production GPU execution can replace the
    matrix multiply with cuBLAS/cuBLASLt or PyTorch CUDA while retaining these outputs
    as the parity oracle for a frozen fixture.
    """
    x = np.asarray(semantic_768, dtype=np.float32)
    if x.ndim != 2 or x.shape[1] != 768:
        raise ValueError(f"expected [N,768], got {x.shape}")
    centered = x - x.mean(axis=0, keepdims=True)
    _, singular_values, vt = np.linalg.svd(centered, full_matrices=False)
    basis128 = vt[: min(128, vt.shape[0])].T
    latent128 = centered @ basis128
    if latent128.shape[1] < 128:
        latent128 = np.pad(latent128, ((0, 0), (0, 128 - latent128.shape[1])))
    latent64 = latent128[:, :64]
    return latent128.astype(np.float32), latent64.astype(np.float32), singular_values[:128].astype(np.float32)


def gpu_project(centered: np.ndarray, basis: np.ndarray) -> np.ndarray:
    """Optional RTX GEMM challenger using PyTorch CUDA; CPU callers fall back cleanly."""
    try:
        import torch
    except ImportError:
        return np.asarray(centered @ basis, dtype=np.float32)

    if not torch.cuda.is_available():
        return np.asarray(centered @ basis, dtype=np.float32)

    a = torch.as_tensor(centered, dtype=torch.float32, device="cuda")
    b = torch.as_tensor(basis, dtype=torch.float32, device="cuda")
    # torch.mm maps to NVIDIA GEMM machinery on CUDA. This is a challenger path;
    # cuBLASLt-specific heuristics belong in the native executor layer.
    out = torch.mm(a, b)
    return out.detach().cpu().numpy().astype(np.float32)


def bounded_dag_subgraph(
    nodes: Sequence[int],
    edges: Iterable[tuple[int, int]],
    anchors: Sequence[int],
    max_hops: int,
) -> nx.DiGraph:
    if max_hops < 0:
        raise ValueError("max_hops must be >= 0")
    graph = nx.DiGraph()
    graph.add_nodes_from(nodes)
    graph.add_edges_from(edges)
    if not nx.is_directed_acyclic_graph(graph):
        raise ValueError("spectral multihop reference expects a DAG projection")

    selected: set[int] = set()
    for anchor in anchors:
        if anchor not in graph:
            continue
        selected.add(anchor)
        frontier = {anchor}
        for _ in range(max_hops):
            nxt: set[int] = set()
            for node in frontier:
                nxt.update(graph.successors(node))
                nxt.update(graph.predecessors(node))
            nxt -= selected
            selected |= nxt
            frontier = nxt
            if not frontier:
                break
    return graph.subgraph(sorted(selected)).copy()


def dag_generations(graph: nx.DiGraph) -> dict[int, int]:
    if not nx.is_directed_acyclic_graph(graph):
        raise ValueError("graph is not a DAG")
    out: dict[int, int] = {}
    for generation, members in enumerate(nx.topological_generations(graph)):
        for node in members:
            out[int(node)] = generation
    return out


def spectral_topology4(graph: nx.DiGraph, node_order: Sequence[int]) -> tuple[np.ndarray, np.ndarray]:
    """Return four bounded spectral coordinates and selected eigenvalues.

    The directed DAG is symmetrized only for this derived topology operator. The
    canonical graph remains directed. For large graphs use cuGraph/sparse solvers;
    this dense eigensolve is deliberately bounded to the induced multihop subgraph.
    """
    if not node_order:
        return np.zeros((0, 4), dtype=np.float32), np.zeros((0,), dtype=np.float32)

    undirected = graph.to_undirected()
    adjacency = nx.to_numpy_array(undirected, nodelist=list(node_order), dtype=np.float64)
    degree = adjacency.sum(axis=1)
    inv_sqrt = np.zeros_like(degree)
    nonzero = degree > 0
    inv_sqrt[nonzero] = 1.0 / np.sqrt(degree[nonzero])
    laplacian = np.eye(len(node_order)) - (inv_sqrt[:, None] * adjacency * inv_sqrt[None, :])
    eigenvalues, eigenvectors = np.linalg.eigh(laplacian)

    # Skip the trivial smallest Laplacian mode where possible.
    start = 1 if len(node_order) > 1 else 0
    coords = eigenvectors[:, start : start + 4]
    if coords.shape[1] < 4:
        coords = np.pad(coords, ((0, 0), (0, 4 - coords.shape[1])))

    norms = np.linalg.norm(coords, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    coords = coords / norms
    return coords.astype(np.float32), eigenvalues[start : start + 4].astype(np.float32)


def spectral_gap(eigenvalues: Sequence[float]) -> float | None:
    values = np.sort(np.asarray(eigenvalues, dtype=np.float64))
    if values.size < 2:
        return None
    return float(max(0.0, values[1] - values[0]))


def build_bytea_artifacts(semantic_768: np.ndarray) -> dict[str, ProjectionArtifact]:
    latent128, latent64, singular_values = pca_svd_latents(semantic_768)
    return {
        "latent128": _artifact(latent128),
        "latent64": _artifact(latent64),
        "singular_values": _artifact(singular_values.reshape(1, -1)),
    }


if __name__ == "__main__":
    rng = np.random.default_rng(0xA71A5)
    fixture = rng.standard_normal((32, 768), dtype=np.float32)
    artifacts = build_bytea_artifacts(fixture)
    dag = nx.DiGraph([(0, 1), (0, 2), (1, 3), (2, 3), (3, 4), (4, 5)])
    subgraph = bounded_dag_subgraph(list(dag.nodes), dag.edges, anchors=[0], max_hops=3)
    order = list(nx.topological_sort(subgraph))
    topology4, eigenvalues = spectral_topology4(subgraph, order)
    print({
        "latent128_sha256": artifacts["latent128"].sha256_hex,
        "latent64_sha256": artifacts["latent64"].sha256_hex,
        "dag_generations": dag_generations(subgraph),
        "topology4_shape": list(topology4.shape),
        "eigenvalues": eigenvalues.tolist(),
        "spectral_gap": spectral_gap(eigenvalues),
    })
