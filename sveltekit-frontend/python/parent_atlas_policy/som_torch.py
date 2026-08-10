"""Small experimental 20x20 SOM for derived routing coordinates.

Train from KMeans centroids first. This is not canonical semantic identity.
"""
from __future__ import annotations
import torch

class Som2D:
    def __init__(self, dim: int, rows: int = 20, cols: int = 20, device: str | None = None):
        self.rows, self.cols, self.dim = rows, cols, dim
        self.device = device or ('cuda' if torch.cuda.is_available() else 'cpu')
        self.weights = torch.randn(rows, cols, dim, device=self.device)
        self.weights = torch.nn.functional.normalize(self.weights, dim=-1)
        yy, xx = torch.meshgrid(torch.arange(rows, device=self.device), torch.arange(cols, device=self.device), indexing='ij')
        self.grid = torch.stack([yy, xx], dim=-1).float()

    @torch.no_grad()
    def bmu(self, x: torch.Tensor) -> torch.Tensor:
        x = torch.nn.functional.normalize(x.to(self.device), dim=-1)
        sim = torch.einsum('...d,rcd->...rc', x, self.weights)
        flat = sim.flatten(-2).argmax(dim=-1)
        return torch.stack([flat // self.cols, flat % self.cols], dim=-1)

    @torch.no_grad()
    def fit(self, samples: torch.Tensor, epochs: int = 200, lr: float = 0.15, sigma: float = 4.0):
        x = torch.nn.functional.normalize(samples.to(self.device), dim=-1)
        for epoch in range(epochs):
            frac = 1 - epoch / max(1, epochs - 1)
            eta = max(0.01, lr * frac)
            sig = max(0.75, sigma * frac)
            for sample in x:
                rc = self.bmu(sample)
                d2 = ((self.grid - rc.float()) ** 2).sum(dim=-1)
                neighborhood = torch.exp(-d2 / (2 * sig * sig)).unsqueeze(-1)
                self.weights.add_(eta * neighborhood * (sample - self.weights))
                self.weights.copy_(torch.nn.functional.normalize(self.weights, dim=-1))
        return self
