from __future__ import annotations
import numpy as np

def build_and_search(dataset: np.ndarray, queries: np.ndarray, k: int, metric: str = "cosine"):
    import cupy as cp
    from cuvs.neighbors import cagra
    x = cp.asarray(np.asarray(dataset, dtype=np.float32))
    q = cp.asarray(np.asarray(queries, dtype=np.float32))
    params = cagra.IndexParams(metric=metric)
    index = cagra.build(params, x)
    distances, neighbors = cagra.search(cagra.SearchParams(), index, q, int(k))
    return cp.asnumpy(neighbors), cp.asnumpy(distances), index
