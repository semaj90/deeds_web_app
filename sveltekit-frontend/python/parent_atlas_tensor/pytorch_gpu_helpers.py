from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Iterable

import numpy as np
import torch
import torch.nn.functional as F


@dataclass(frozen=True)
class GpuBatchPlan:
    rows_per_tile: int
    dimension: int
    dtype: str
    bytes_per_tile: int
    resident_tiles: int
    active_tiles: int = 1
    prefetch_tiles: int = 1


def dtype_bytes(dtype: str) -> int:
    return {"float32": 4, "float16": 2, "bfloat16": 2, "int8": 1}.get(dtype, 0)


def plan_tiles(rows: int, dimension: int, dtype: str, budget_bytes: int, reserve_fraction: float = 0.25) -> GpuBatchPlan:
    if not 0 <= reserve_fraction < 1:
        raise ValueError("reserve_fraction must be in [0,1)")
    b = dtype_bytes(dtype)
    if b <= 0:
        raise ValueError(f"unsupported dtype: {dtype}")
    bytes_per_tile = rows * dimension * b
    usable = int(budget_bytes * (1.0 - reserve_fraction))
    resident = max(2, usable // max(1, bytes_per_tile))
    return GpuBatchPlan(rows, dimension, dtype, bytes_per_tile, resident)


def exact_cosine_topk(tile: torch.Tensor, query: torch.Tensor, k: int) -> tuple[torch.Tensor, torch.Tensor]:
    x = F.normalize(tile.float(), dim=-1)
    q = F.normalize(query.float().reshape(1, -1), dim=-1)
    values, indices = torch.topk(q @ x.T, k=min(k, x.shape[0]), dim=-1)
    return indices[0], values[0]


def batched_exact_cosine(matrix: torch.Tensor, queries: torch.Tensor, k: int, rows_per_tile: int = 4096) -> tuple[torch.Tensor, torch.Tensor]:
    q = F.normalize(queries.float(), dim=-1)
    best_scores = torch.full((q.shape[0], k), -math.inf, device=q.device)
    best_indices = torch.full((q.shape[0], k), -1, dtype=torch.long, device=q.device)
    for start in range(0, matrix.shape[0], rows_per_tile):
        tile = F.normalize(matrix[start:start + rows_per_tile].float(), dim=-1)
        scores = q @ tile.T
        local_k = min(k, tile.shape[0])
        vals, idx = torch.topk(scores, k=local_k, dim=-1)
        idx = idx + start
        all_vals = torch.cat([best_scores, vals], dim=-1)
        all_idx = torch.cat([best_indices, idx], dim=-1)
        best_scores, pos = torch.topk(all_vals, k=k, dim=-1)
        best_indices = torch.gather(all_idx, 1, pos)
    return best_indices, best_scores


def to_pinned_host(array: np.ndarray) -> torch.Tensor:
    cpu = torch.as_tensor(np.ascontiguousarray(array))
    if not torch.cuda.is_available():
        return cpu
    pinned = torch.empty_like(cpu, pin_memory=True)
    pinned.copy_(cpu)
    return pinned
