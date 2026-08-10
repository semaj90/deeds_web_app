from __future__ import annotations
import numpy as np

def exact_search(dataset: np.ndarray, queries: np.ndarray, k: int, metric: str = "cosine"):
    import cupy as cp
    from cuvs.neighbors import brute_force
    x = cp.asarray(np.asarray(dataset, dtype=np.float32))
    q = cp.asarray(np.asarray(queries, dtype=np.float32))
    index = brute_force.build(x, metric=metric)
    distances, neighbors = brute_force.search(index, q, int(k))
    return cp.asnumpy(neighbors), cp.asnumpy(distances)
