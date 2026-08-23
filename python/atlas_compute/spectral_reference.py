"""Bounded CPU spectral partition reference for cuGraph parity.

This is a numerical reference only.  It never writes graph state and does not
assign semantic meaning to backend cluster labels.
"""

from __future__ import annotations

from hashlib import sha256
import json
from typing import Sequence

import numpy as np

from .spectral import symmetric_eigenspace


def normalized_laplacian(
    vertex_count: int,
    edges: Sequence[tuple[int, int, float]],
) -> np.ndarray:
    if vertex_count < 2:
        raise ValueError("vertex_count must be >= 2")
    adjacency = np.zeros((vertex_count, vertex_count), dtype=np.float64)
    for source, target, weight in edges:
        source, target, weight = int(source), int(target), float(weight)
        if source == target or not (0 <= source < vertex_count and 0 <= target < vertex_count):
            raise ValueError("spectral edges must be bounded non-self edges")
        if not np.isfinite(weight) or weight <= 0:
            raise ValueError("spectral edge weights must be finite and positive")
        adjacency[source, target] += weight
        adjacency[target, source] += weight
    degree = adjacency.sum(axis=1)
    if np.any(degree <= 0):
        raise ValueError("spectral reference requires every vertex to have degree")
    inv_sqrt = 1.0 / np.sqrt(degree)
    return np.eye(vertex_count) - (inv_sqrt[:, None] * adjacency * inv_sqrt[None, :])


def modularity_matrix(
    vertex_count: int,
    edges: Sequence[tuple[int, int, float]],
) -> np.ndarray:
    """Return the weighted Newman-Girvan modularity operator."""
    adjacency = np.zeros((vertex_count, vertex_count), dtype=np.float64)
    for source, target, weight in edges:
        source, target, weight = int(source), int(target), float(weight)
        if source == target or not (0 <= source < vertex_count and 0 <= target < vertex_count):
            raise ValueError("modularity edges must be bounded non-self edges")
        if not np.isfinite(weight) or weight <= 0:
            raise ValueError("modularity edge weights must be finite and positive")
        adjacency[source, target] += weight
        adjacency[target, source] += weight
    degrees = adjacency.sum(axis=1)
    total = float(degrees.sum())
    if total <= 0:
        raise ValueError("modularity reference requires positive edge mass")
    return adjacency - np.outer(degrees, degrees) / total


def _kmeans(points: np.ndarray, cluster_count: int, iterations: int) -> np.ndarray:
    # Deterministic farthest-point initialization; no random state is hidden.
    centers = [0]
    while len(centers) < cluster_count:
        distances = np.min(
            ((points[:, None, :] - points[np.asarray(centers)][None, :, :]) ** 2).sum(axis=2), axis=1
        )
        distances[np.asarray(centers)] = -1.0
        centers.append(int(np.argmax(distances)))
    centroids = points[np.asarray(centers)].copy()
    labels = np.zeros(points.shape[0], dtype=np.int64)
    for _ in range(iterations):
        distances = ((points[:, None, :] - centroids[None, :, :]) ** 2).sum(axis=2)
        next_labels = np.argmin(distances, axis=1)
        if np.array_equal(labels, next_labels):
            break
        labels = next_labels
        for cluster in range(cluster_count):
            members = points[labels == cluster]
            if len(members):
                centroids[cluster] = members.mean(axis=0)
    return labels


def spectral_partition(
    vertex_count: int,
    edges: Sequence[tuple[int, int, float]],
    *,
    cluster_count: int,
    num_eigenvectors: int,
    kmeans_iterations: int = 100,
    operator: str = "normalized_laplacian",
) -> dict[str, object]:
    if not 2 <= cluster_count <= vertex_count:
        raise ValueError("cluster_count out of range")
    if not 1 <= num_eigenvectors <= cluster_count:
        raise ValueError("num_eigenvectors out of range")
    if operator == "normalized_laplacian":
        matrix = normalized_laplacian(vertex_count, edges)
        largest = False
    elif operator == "modularity":
        matrix = modularity_matrix(vertex_count, edges)
        largest = True
    else:
        raise ValueError("operator must be normalized_laplacian or modularity")
    vectors, eigenspace = symmetric_eigenspace(
        matrix, component_count=num_eigenvectors, largest=largest
    )
    row_norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    embedded = vectors / np.maximum(row_norms, 1e-15)
    labels = _kmeans(embedded, cluster_count, kmeans_iterations)
    assignments = [{"vertex": i, "cluster": int(label)} for i, label in enumerate(labels)]
    checksum = sha256(json.dumps(assignments, separators=(",", ":")).encode()).hexdigest()
    return {
        "schema": "atlas.cpu-spectral-partition-reference.v1",
        "assignments": assignments,
        "assignment_checksum": checksum,
        "eigenspace": eigenspace.to_dict(),
        "operator": operator,
        "canonical_authority": False,
        "promotion_eligible": False,
    }


def adjusted_rand_index(labels_a: Sequence[int], labels_b: Sequence[int]) -> float:
    a, b = np.asarray(labels_a), np.asarray(labels_b)
    if a.shape != b.shape:
        raise ValueError("ARI label shape mismatch")
    if a.size < 2:
        return 1.0
    _, ai = np.unique(a, return_inverse=True)
    _, bi = np.unique(b, return_inverse=True)
    table = np.zeros((ai.max() + 1, bi.max() + 1), dtype=np.int64)
    np.add.at(table, (ai, bi), 1)
    comb = lambda values: np.sum(values * (values - 1) / 2.0)
    total = a.size * (a.size - 1) / 2.0
    expected = comb(table.sum(axis=1)) * comb(table.sum(axis=0)) / total
    maximum = 0.5 * (comb(table.sum(axis=1)) + comb(table.sum(axis=0)))
    observed = comb(table)
    return 1.0 if maximum == expected else float((observed - expected) / (maximum - expected))
