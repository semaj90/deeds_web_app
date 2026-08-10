from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
import torch

@dataclass
class CachedTensor:
    key: str
    tensor: torch.Tensor
    bytes: int

class RerankerTensorCache:
    """Caches reusable candidate tensors only. Reranker scores still require revision-qualified query/candidate keys."""
    def __init__(self, max_bytes: int) -> None:
        self.max_bytes = int(max_bytes)
        self.bytes = 0
        self.items: OrderedDict[str, CachedTensor] = OrderedDict()

    def put(self, key: str, tensor: torch.Tensor) -> None:
        tensor = tensor.detach()
        nbytes = tensor.nelement() * tensor.element_size()
        if key in self.items:
            old = self.items.pop(key); self.bytes -= old.bytes
        while self.items and self.bytes + nbytes > self.max_bytes:
            _, old = self.items.popitem(last=False); self.bytes -= old.bytes
        self.items[key] = CachedTensor(key, tensor, nbytes); self.bytes += nbytes

    def get(self, key: str) -> torch.Tensor | None:
        item = self.items.pop(key, None)
        if item is None: return None
        self.items[key] = item
        return item.tensor
