from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
from torch import nn


class DeterministicAutoencoder(nn.Module):
    """Deterministic 768 -> 256 -> 128 -> 256 -> 768 routing/compression helper."""

    def __init__(self, input_dim: int = 768, latent_dim: int = 128) -> None:
        super().__init__()
        self.encoder = nn.Sequential(nn.Linear(input_dim, 256), nn.GELU(), nn.Linear(256, latent_dim))
        self.decoder = nn.Sequential(nn.Linear(latent_dim, 256), nn.GELU(), nn.Linear(256, input_dim))

    def encode(self, x: torch.Tensor) -> torch.Tensor:
        return self.encoder(x)

    def decode(self, z: torch.Tensor) -> torch.Tensor:
        return self.decoder(z)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        z = self.encode(x)
        return z, self.decode(z)


@dataclass(frozen=True)
class AeProjectionResult:
    latent: np.ndarray
    reconstruction: np.ndarray
    mse: float


@torch.inference_mode()
def project(model: DeterministicAutoencoder, matrix: np.ndarray, device: str = "cuda") -> AeProjectionResult:
    x = torch.as_tensor(np.asarray(matrix, dtype=np.float32), device=device)
    z, recon = model(x)
    mse = torch.mean((recon - x) ** 2).item()
    return AeProjectionResult(z.detach().cpu().numpy(), recon.detach().cpu().numpy(), float(mse))


def load_checkpoint(path: str | Path, device: str = "cpu") -> DeterministicAutoencoder:
    model = DeterministicAutoencoder()
    state = torch.load(Path(path), map_location=device, weights_only=True)
    model.load_state_dict(state)
    model.to(device).eval()
    return model
