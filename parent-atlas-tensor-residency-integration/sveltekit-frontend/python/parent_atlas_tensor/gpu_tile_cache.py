from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from typing import Callable

import numpy as np
import torch

@dataclass
class GpuTile:
    key: str
    tensor: torch.Tensor
    bytes: int
    last_used: int
    pin_count: int = 0

class GpuTileCache:
    """Logical LRU cache. ACE should rank/promote tiles before calling this backend."""
    def __init__(self, max_bytes: int, device: str = "cuda") -> None:
        self.max_bytes = int(max_bytes)
        self.device = torch.device(device)
        self.tiles: OrderedDict[str, GpuTile] = OrderedDict()
        self.clock = 0
        self.bytes = 0
        self.copy_stream = torch.cuda.Stream(device=self.device) if self.device.type == "cuda" else None

    def has(self, key: str) -> bool:
        return key in self.tiles

    def _evict(self, needed: int) -> None:
        while self.tiles and self.bytes + needed > self.max_bytes:
            victim_key = next((k for k, v in self.tiles.items() if v.pin_count == 0), None)
            if victim_key is None:
                raise MemoryError("all GPU tiles are pinned")
            victim = self.tiles.pop(victim_key)
            self.bytes -= victim.bytes

    def promote(self, key: str, host_matrix: np.ndarray) -> GpuTile:
        if key in self.tiles:
            tile = self.tiles.pop(key)
            self.clock += 1
            tile.last_used = self.clock
            self.tiles[key] = tile
            return tile
        x = np.ascontiguousarray(host_matrix, dtype=np.float32)
        needed = x.nbytes
        self._evict(needed)
        host = torch.from_numpy(x)
        if self.device.type == "cuda":
            pinned = torch.empty_like(host, pin_memory=True)
            pinned.copy_(host)
            assert self.copy_stream is not None
            with torch.cuda.stream(self.copy_stream):
                gpu = pinned.to(self.device, non_blocking=True)
            self.copy_stream.synchronize()
        else:
            gpu = host
        self.clock += 1
        tile = GpuTile(key=key, tensor=gpu, bytes=needed, last_used=self.clock)
        self.tiles[key] = tile
        self.bytes += needed
        return tile

    def exact_cosine(self, key: str, query: np.ndarray, k: int) -> tuple[np.ndarray, np.ndarray]:
        tile = self.tiles[key]
        q = torch.as_tensor(np.asarray(query, dtype=np.float32), device=tile.tensor.device).reshape(1, -1)
        q = torch.nn.functional.normalize(q, dim=1)
        x = torch.nn.functional.normalize(tile.tensor, dim=1)
        scores = q @ x.T
        vals, idx = torch.topk(scores, min(k, x.shape[0]), dim=1)
        return idx[0].detach().cpu().numpy(), vals[0].detach().cpu().numpy()
