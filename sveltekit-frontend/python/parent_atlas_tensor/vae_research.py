from __future__ import annotations

import torch
from torch import nn

class ResearchVAE(nn.Module):
    """Research-only uncertainty model. Never use sampled output as canonical semantic_768."""
    def __init__(self, input_dim: int = 768, latent_dim: int = 128) -> None:
        super().__init__()
        self.backbone = nn.Sequential(nn.Linear(input_dim, 256), nn.GELU())
        self.mu = nn.Linear(256, latent_dim)
        self.logvar = nn.Linear(256, latent_dim)
        self.decoder = nn.Sequential(nn.Linear(latent_dim, 256), nn.GELU(), nn.Linear(256, input_dim))

    def encode(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        h = self.backbone(x)
        return self.mu(h), self.logvar(h)

    def reparameterize(self, mu: torch.Tensor, logvar: torch.Tensor) -> torch.Tensor:
        return mu + torch.exp(0.5 * logvar) * torch.randn_like(mu)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        mu, logvar = self.encode(x)
        z = self.reparameterize(mu, logvar)
        return self.decoder(z), mu, logvar
