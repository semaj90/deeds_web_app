from __future__ import annotations

from dataclasses import dataclass
import numpy as np

@dataclass(frozen=True)
class LowRankFactors:
    left: np.ndarray
    singular: np.ndarray
    right_t: np.ndarray


def truncated_svd(matrix: np.ndarray, rank: int = 128) -> LowRankFactors:
    x = np.asarray(matrix, dtype=np.float32)
    if rank <= 0 or rank > min(x.shape):
        raise ValueError("rank out of range")
    u, s, vt = np.linalg.svd(x, full_matrices=False)
    return LowRankFactors(u[:, :rank], s[:rank], vt[:rank, :])


def reconstruct(f: LowRankFactors) -> np.ndarray:
    return (f.left * f.singular) @ f.right_t
