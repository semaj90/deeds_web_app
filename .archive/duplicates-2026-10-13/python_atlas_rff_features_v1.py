"""Random Fourier Features (RBF approximation) for L2-normalized inputs.

Form (Rahimi & Recht, cosine-only variant):

    x_hat = x / max(||x||_2, eps)            (row-wise L2 normalization)
    z(x)  = sqrt(2 / D) * cos(x_hat @ W.T + b)

with W ~ N(0, 1/sigma^2) of shape (D, d) and b ~ U[0, 2*pi) of shape (D,), so that

    E[z(x) . z(y)] = exp(-||x_hat - y_hat||^2 / (2 sigma^2)).

Weights are drawn on CPU from a seeded generator and then moved to `device`, so the same
seed gives the same W and b on every device. This is a challenger approximation. It is not
a retrieval owner and it is not a canonical representation.
"""

from __future__ import annotations

import math

import torch

_EPS = 1e-12


def build_rff(
    input_dim: int,
    output_dim: int,
    sigma: float,
    seed: int,
    device: str | torch.device = "cpu",
    dtype: torch.dtype = torch.float32,
) -> tuple[torch.Tensor, torch.Tensor]:
    """Return (W, b): W has shape (output_dim, input_dim), b has shape (output_dim,)."""
    if input_dim < 1 or output_dim < 1:
        raise ValueError("input_dim and output_dim must be >= 1")
    if not (sigma > 0 and math.isfinite(sigma)):
        raise ValueError("sigma must be a positive finite number")
    gen = torch.Generator(device="cpu").manual_seed(int(seed))
    w = torch.randn(output_dim, input_dim, generator=gen, dtype=torch.float64) / float(sigma)
    b = torch.rand(output_dim, generator=gen, dtype=torch.float64) * (2.0 * math.pi)
    return w.to(device=device, dtype=dtype), b.to(device=device, dtype=dtype)


def rff_transform(x: torch.Tensor, w: torch.Tensor, b: torch.Tensor) -> torch.Tensor:
    """Map x of shape (n, d) to features of shape (n, D)."""
    if x.ndim != 2 or x.shape[1] != w.shape[1]:
        raise ValueError(f"x must be (n, {w.shape[1]}), got {tuple(x.shape)}")
    norms = x.norm(dim=1, keepdim=True).clamp_min(_EPS)
    x_hat = x / norms
    proj = x_hat @ w.T + b
    scale = math.sqrt(2.0 / w.shape[0])
    return scale * torch.cos(proj)


def rbf_exact_on_normalized(x: torch.Tensor, sigma: float) -> torch.Tensor:
    """Exact RBF Gram matrix of the L2-normalized rows of x (the RFF target)."""
    norms = x.norm(dim=1, keepdim=True).clamp_min(_EPS)
    x_hat = x / norms
    sq = torch.cdist(x_hat, x_hat).pow(2)
    return torch.exp(-sq / (2.0 * float(sigma) ** 2))
