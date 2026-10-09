"""CPU-only exact cosine reference for frozen, same-recipe embedding matrices.
No I/O, external model loads, GPU use, normalization inference, or admission.
"""
from __future__ import annotations
import numpy as np

def exact_cosine_topk(matrix, query, *, k: int, row_ids):
    a = np.asarray(matrix, dtype=np.float32)
    q = np.asarray(query, dtype=np.float32)
    if a.ndim != 2 or q.ndim != 1 or a.shape[1] != q.size:
        raise ValueError("EMBEDDING_SHAPE_MISMATCH")
    if not 1 <= k <= len(a) or len(row_ids) != len(a):
        raise ValueError("TOPK_OR_IDENTITY_INVALID")
    if len(set(row_ids)) != len(row_ids):
        raise ValueError("DUPLICATE_ROW_ID")
    if not np.isfinite(a).all() or not np.isfinite(q).all():
        raise ValueError("NONFINITE_VECTOR")
    norms = np.linalg.norm(a, axis=1)
    qnorm = np.linalg.norm(q)
    if not np.all(norms > 0) or not qnorm > 0:
        raise ValueError("ZERO_NORM_VECTOR")
    scores = (a @ q) / (norms * qnorm)
    order = sorted(range(len(a)), key=lambda i: (-float(scores[i]), str(row_ids[i])))
    return [(str(row_ids[i]), float(scores[i])) for i in order[:k]]
