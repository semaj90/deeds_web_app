#!/usr/bin/env python3
"""
Phase 90 - GPU K-Means Clustering with PyTorch CUDA
Used for error clustering and ACE error analysis
"""

import math
import torch
from dataclasses import dataclass
from typing import Tuple

@dataclass
class KMeansResult:
    labels: torch.Tensor          # (N,) int64
    centroids: torch.Tensor       # (K,D) float16/float32
    inertia: float

def _l2_normalize(x: torch.Tensor, eps: float = 1e-12) -> torch.Tensor:
    """Normalize vectors to unit length"""
    return x / (x.norm(dim=1, keepdim=True) + eps)

@torch.no_grad()
def kmeans_cosine_cuda(
    X: torch.Tensor,
    k: int,
    iters: int = 25,
    seed: int = 42,
    batch: int = 8192,
    fp16: bool = True,
) -> KMeansResult:
    """
    GPU k-means using cosine distance via normalized dot product.

    Args:
        X: (N,D) float32 CPU or CUDA tensor
        k: Number of clusters
        iters: Number of iterations
        seed: Random seed
        batch: Batch size for assignment step
        fp16: Use FP16 for faster computation

    Returns:
        KMeansResult with labels, centroids, and inertia
    """
    if X.device.type != "cuda":
        X = X.cuda()

    torch.manual_seed(seed)

    # Normalize for cosine similarity
    X = X.float()
    X = _l2_normalize(X)

    if fp16:
        X = X.half()

    N, D = X.shape
    k = min(k, N)

    # k-means++ style init (cheap variant): sample random points
    idx = torch.randperm(N, device=X.device)[:k]
    C = X.index_select(0, idx).clone()  # (K,D)

    labels = torch.empty(N, device=X.device, dtype=torch.long)

    for _ in range(iters):
        # Assign step (batched)
        for start in range(0, N, batch):
            end = min(start + batch, N)
            xb = X[start:end]  # (B,D)
            # cosine sim = dot since normalized
            sims = xb @ C.T     # (B,K)
            labels[start:end] = torch.argmax(sims, dim=1)

        # Update step
        C_new = torch.zeros_like(C)
        counts = torch.zeros(k, device=X.device, dtype=torch.long)

        # accumulate
        for j in range(k):
            mask = labels == j
            cnt = int(mask.sum().item())
            if cnt == 0:
                continue
            counts[j] = cnt
            C_new[j] = X[mask].mean(dim=0)

        # re-seed empty clusters
        empty = counts == 0
        if empty.any():
            refill = torch.randperm(N, device=X.device)[: int(empty.sum().item())]
            C_new[empty] = X.index_select(0, refill)

        # renormalize centroids
        C = _l2_normalize(C_new.float()).to(X.dtype)

    # inertia (1 - cosine sim to assigned centroid)
    sims_final = (X @ C.T).gather(1, labels.view(-1, 1)).squeeze(1)
    inertia = float((1.0 - sims_final.float()).mean().item())

    return KMeansResult(labels=labels, centroids=C, inertia=inertia)


if __name__ == "__main__":
    # Test with dummy data
    if not torch.cuda.is_available():
        print("❌ CUDA not available")
        exit(1)

    print(f"✅ CUDA available: {torch.cuda.get_device_name(0)}")

    # Create test data
    N, D, K = 1000, 768, 10
    X = torch.randn(N, D, device='cuda')

    result = kmeans_cosine_cuda(X, K, iters=10)

    print(f"📊 Clustered {N} vectors into {K} clusters")
    print(f"   Inertia: {result.inertia:.4f}")
    print(f"   Labels shape: {result.labels.shape}")
    print(f"   Centroids shape: {result.centroids.shape}")
    print(f"✅ GPU k-means test passed")
