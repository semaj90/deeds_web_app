"""Optional neural executor router trained only from measured compute receipts.

The deterministic ComputeRecommendationPolicy remains authoritative. This model
is a challenger that predicts a distribution over already-eligible executors; it
cannot make an ineligible executor legal and cannot create canonical evidence.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
from typing import Any, Sequence

import numpy as np

from .determinism import configure_torch_determinism


@dataclass(frozen=True)
class NeuralRouterReceipt:
    schema: str
    input_dimensions: int
    hidden_dimensions: int
    executor_count: int
    epochs: int
    optimizer: str
    learning_rate: float
    weight_decay: float
    final_loss: float
    probabilities: list[float]
    predicted_executor_index: int
    model_checksum: str
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _state_checksum(model: Any) -> str:
    import torch

    digest = hashlib.sha256()
    for name, tensor in sorted(model.state_dict().items()):
        digest.update(name.encode("utf-8"))
        digest.update(np.ascontiguousarray(tensor.detach().cpu().numpy()).tobytes())
    return digest.hexdigest()


def train_receipt_router(
    features: Sequence[Sequence[float]] | np.ndarray,
    labels: Sequence[int] | np.ndarray,
    inference_features: Sequence[float] | np.ndarray,
    *,
    executor_count: int,
    hidden_dimensions: int = 32,
    epochs: int = 100,
    learning_rate: float = 1e-3,
    weight_decay: float = 1e-2,
    temperature: float = 1.0,
    seed: int = 0xA71A5,
    device: str = "cpu",
) -> NeuralRouterReceipt:
    import torch
    from torch import nn

    configure_torch_determinism(seed=seed, matmul_mode="ieee")
    x = torch.as_tensor(np.asarray(features, dtype=np.float32), device=device)
    y = torch.as_tensor(np.asarray(labels, dtype=np.int64), device=device)
    q = torch.as_tensor(np.asarray(inference_features, dtype=np.float32), device=device)
    if x.ndim != 2 or y.ndim != 1 or x.shape[0] != y.shape[0]:
        raise ValueError("features/labels shape mismatch")
    if q.ndim != 1 or q.shape[0] != x.shape[1]:
        raise ValueError("inference feature dimension mismatch")
    if executor_count < 2:
        raise ValueError("executor_count must be >= 2")
    if torch.any(y < 0) or torch.any(y >= executor_count):
        raise ValueError("label out of executor range")
    if not (temperature > 0):
        raise ValueError("temperature must be positive")

    model = nn.Sequential(
        nn.Linear(int(x.shape[1]), hidden_dimensions),
        nn.GELU(),
        nn.Linear(hidden_dimensions, executor_count),
    ).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate, weight_decay=weight_decay)
    criterion = nn.CrossEntropyLoss()

    final_loss = 0.0
    model.train()
    for _ in range(epochs):
        optimizer.zero_grad(set_to_none=True)
        logits = model(x)
        loss = criterion(logits, y)
        loss.backward()
        optimizer.step()
        final_loss = float(loss.detach().cpu())

    model.eval()
    with torch.no_grad():
        logits = model(q.unsqueeze(0))[0] / temperature
        probabilities = torch.softmax(logits, dim=0)
        predicted = int(torch.argmax(probabilities).item())

    return NeuralRouterReceipt(
        schema="atlas.neural-router-receipt.v1",
        input_dimensions=int(x.shape[1]),
        hidden_dimensions=hidden_dimensions,
        executor_count=executor_count,
        epochs=epochs,
        optimizer="AdamW",
        learning_rate=learning_rate,
        weight_decay=weight_decay,
        final_loss=final_loss,
        probabilities=[float(value) for value in probabilities.detach().cpu().tolist()],
        predicted_executor_index=predicted,
        model_checksum=_state_checksum(model),
        canonical_authority=False,
    )
