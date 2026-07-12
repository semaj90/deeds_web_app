#!/usr/bin/env python3
"""
KMeans GPU Worker

Reads JSON from stdin, computes KMeans clustering on GPU using PyTorch,
writes results to stdout. Used by topology enrichment pipeline.

Protocol:
  INPUT (stdin):  {"vectors": [[...], ...], "k": 256, "max_iter": 100, "random_seed": 42}
  OUTPUT (stdout): {"cluster_ids": [...], "centroids": [...], "cluster_sizes": [...], "confidence": 0.85, "iterations": 45}
  ERROR (stderr):  {"error": "message"}
"""

import sys
import json
import torch
import numpy as np
from typing import Dict, List, Any

def kmeans_gpu(
    vectors: np.ndarray,
    k: int,
    max_iter: int = 100,
    tol: float = 1e-4,
    random_seed: int = 42
) -> Dict[str, Any]:
    """
    Run KMeans clustering on GPU.

    Args:
        vectors: (n, d) array of embeddings
        k: number of clusters
        max_iter: maximum iterations
        tol: convergence tolerance (centroid movement)
        random_seed: reproducible seeding

    Returns:
        {
          "cluster_ids": [int, ...],          # n-length cluster assignments
          "centroids": [[float, ...], ...],   # (k, d) cluster centers
          "cluster_sizes": [int, ...],        # (k,) elements per cluster
          "confidence": float,                # 1.0 - (variance / sqrt(d))
          "iterations": int                   # actual iterations until convergence
        }
    """
    torch.manual_seed(random_seed)
    np.random.seed(random_seed)

    n, d = vectors.shape

    # Move to GPU
    device = 'cuda:0' if torch.cuda.is_available() else 'cpu'
    x_gpu = torch.tensor(vectors, dtype=torch.float32, device=device)

    # Initialize centroids (k-means++)
    indices = np.random.choice(n, k, replace=False)
    centroids = x_gpu[indices].clone()

    cluster_ids = torch.zeros(n, dtype=torch.long, device=device)

    for iteration in range(max_iter):
        # Assign to nearest centroid (Euclidean distance)
        distances = torch.cdist(x_gpu, centroids)  # (n, k)
        cluster_ids_new = torch.argmin(distances, dim=1)

        # Check convergence
        if torch.equal(cluster_ids, cluster_ids_new):
            break

        cluster_ids = cluster_ids_new

        # Update centroids
        centroids_new = torch.zeros_like(centroids)
        cluster_sizes = torch.zeros(k, device=device)

        for i in range(k):
            mask = cluster_ids == i
            count = mask.sum().item()

            if count > 0:
                centroids_new[i] = x_gpu[mask].mean(dim=0)
                cluster_sizes[i] = float(count)
            else:
                # Empty cluster: reinitialize with random point
                random_idx = np.random.randint(0, n)
                centroids_new[i] = x_gpu[random_idx].clone()
                cluster_sizes[i] = 0.0

        # Check centroid convergence
        centroid_shift = torch.norm(centroids_new - centroids).item()
        centroids = centroids_new

        if centroid_shift < tol:
            break

    # Compute confidence (1.0 - normalized variance)
    distances = torch.cdist(x_gpu, centroids)
    min_distances = torch.min(distances, dim=1)[0]
    variance = min_distances.mean().item()

    # Normalize by sqrt(d) to make dimension-independent
    confidence = max(0.0, min(1.0, 1.0 - (variance / (d ** 0.5))))

    return {
        "cluster_ids": cluster_ids.cpu().numpy().tolist(),
        "centroids": centroids.cpu().detach().numpy().tolist(),
        "cluster_sizes": cluster_sizes.cpu().numpy().tolist(),
        "confidence": float(confidence),
        "iterations": iteration + 1,
    }


def main():
    try:
        # Read JSON from stdin
        input_data = sys.stdin.read()
        job = json.loads(input_data)

        # Extract parameters
        vectors = np.array(job['vectors'], dtype=np.float32)
        k = int(job['k'])
        max_iter = int(job.get('max_iter', 100))
        tol = float(job.get('tol', 1e-4))
        random_seed = int(job.get('random_seed', 42))

        # Validate input
        if vectors.shape[0] == 0:
            raise ValueError("No vectors provided")
        if k > vectors.shape[0]:
            raise ValueError(f"k ({k}) cannot exceed number of vectors ({vectors.shape[0]})")
        if k < 2:
            raise ValueError(f"k must be at least 2, got {k}")

        # Run KMeans
        result = kmeans_gpu(vectors, k, max_iter, tol, random_seed)

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
