"""Random Fourier Features (RFF) challenger transform for Parent Atlas.

Theory (Rahimi & Recht, 2007):
Maps input feature vectors into a randomized basis such that the inner product
between transformed vectors approximates the shift-invariant Gaussian RBF kernel:
    k(x, y) = exp(-||x - y||^2 / (2 * sigma^2))

Transform definition:
    z(x) = sqrt(2 / D) * cos(x @ W + b)
where:
    - x: input tensor of shape [..., d_in] (optionally L2-normalized)
    - W ~ N(0, (1 / sigma^2) * I) of shape [d_in, D]
    - b ~ Uniform[0, 2 * pi] of shape [D]
    - D: projection dimension (e.g. 256 or 128)

Architectural Boundary & Invariants:
1. RFF is an OFFLINE / CHALLENGER projection for kernelized distance comparison.
2. It is NOT an autoencoder or semantic compression model.
3. It does NOT replace `content_embedding_768` (EmbeddingGemma) in production Qdrant.
4. RFF inner product approximates the non-linear Gaussian RBF kernel, NOT cosine similarity.
   For unit-norm vectors: ||x - y||^2 = 2 - 2 * (x . y), so k(x, y) = exp(-(1 - x . y) / sigma^2).
5. Corpus and query MUST use the identical frozen seed and parameters (W, b).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import math
from typing import Any

import torch
import torch.nn.functional as F


@dataclass(frozen=True)
class RFFReceipt:
    schema: str
    input_dim: int
    output_dim: int
    sigma: float
    seed: int
    device: str
    dtype: str
    w_checksum: str
    b_checksum: str
    notes: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def build_rff(
    input_dim: int = 768,
    output_dim: int = 256,
    sigma: float = 1.0,
    seed: int = 42,
    device: str = "cpu",
    dtype: torch.dtype = torch.float32,
) -> tuple[torch.Tensor, torch.Tensor]:
    """Generate frozen deterministic weights (W) and bias (b) for RFF projection.

    Uses a deterministic CPU generator to guarantee identical weights regardless
    of whether generation or inference occurs on CPU or CUDA.

    Args:
        input_dim: Dimension of the input vector (default: 768 for semantic_768).
        output_dim: Projection dimension D (e.g. 256 or 128).
        sigma: Kernel bandwidth parameter for Gaussian RBF kernel.
        seed: Fixed random seed for reproducibility.
        device: Device to place the resulting tensors on.
        dtype: Data type (default: torch.float32).

    Returns:
        tuple[torch.Tensor, torch.Tensor]: (W, b)
            W: [input_dim, output_dim] drawn from N(0, (1 / sigma^2) * I)
            b: [output_dim] drawn from Uniform[0, 2 * pi)
    """
    if input_dim <= 0 or output_dim <= 0:
        raise ValueError(f"Dimensions must be positive: input_dim={input_dim}, output_dim={output_dim}")
    if sigma <= 0.0:
        raise ValueError(f"Sigma must be positive: sigma={sigma}")

    # Generate on CPU generator for cross-platform and CPU/GPU determinism
    gen = torch.Generator(device="cpu").manual_seed(seed)

    # W drawn from N(0, (1 / sigma^2) * I) -> stddev = 1.0 / sigma
    stddev = 1.0 / sigma
    w_cpu = torch.randn(input_dim, output_dim, generator=gen, dtype=dtype) * stddev

    # b drawn from Uniform[0, 2 * pi)
    b_cpu = torch.rand(output_dim, generator=gen, dtype=dtype) * (2.0 * math.pi)

    w = w_cpu.to(device=device)
    b = b_cpu.to(device=device)

    return w, b


def rff_transform(
    x: torch.Tensor,
    w: torch.Tensor,
    b: torch.Tensor,
    normalize_input: bool = True,
) -> torch.Tensor:
    """Transform input features using Random Fourier Features.

    Computes: z(x) = sqrt(2 / D) * cos(x @ W + b)

    Args:
        x: Input tensor of shape [..., input_dim].
        w: Weight matrix of shape [input_dim, output_dim].
        b: Bias vector of shape [output_dim].
        normalize_input: If True, applies L2 normalization to x along the last dimension.

    Returns:
        Transformed tensor of shape [..., output_dim].
    """
    if x.shape[-1] != w.shape[0]:
        raise ValueError(
            f"Input dimension mismatch: x has last dim {x.shape[-1]}, but W expects {w.shape[0]}"
        )
    if w.shape[1] != b.shape[0]:
        raise ValueError(
            f"Projection dimension mismatch: W has {w.shape[1]} columns, but b has length {b.shape[0]}"
        )

    output_dim = w.shape[1]
    scale = math.sqrt(2.0 / float(output_dim))

    if normalize_input:
        x = F.normalize(x, p=2, dim=-1)

    projected = torch.matmul(x, w) + b
    return scale * torch.cos(projected)


def rbf_kernel_exact(
    x: torch.Tensor,
    y: torch.Tensor,
    sigma: float = 1.0,
    normalize_input: bool = True,
) -> torch.Tensor:
    """Compute exact pairwise Gaussian RBF kernel: k(x_i, y_j) = exp(-||x_i - y_j||^2 / (2 * sigma^2)).

    Args:
        x: Tensor of shape [N, d].
        y: Tensor of shape [M, d].
        sigma: Kernel bandwidth parameter.
        normalize_input: If True, L2-normalizes x and y.

    Returns:
        Tensor of shape [N, M] with exact kernel values in (0, 1].
    """
    if normalize_input:
        x = F.normalize(x, p=2, dim=-1)
        y = F.normalize(y, p=2, dim=-1)

    # Squared Euclidean distance: ||x - y||^2 = ||x||^2 + ||y||^2 - 2 * <x, y>
    x_norm_sq = torch.sum(x ** 2, dim=-1, keepdim=True)  # [N, 1]
    y_norm_sq = torch.sum(y ** 2, dim=-1, keepdim=True).transpose(-2, -1)  # [1, M]
    dist_sq = x_norm_sq + y_norm_sq - 2.0 * torch.matmul(x, y.transpose(-2, -1))
    dist_sq = torch.clamp(dist_sq, min=0.0)

    gamma = 1.0 / (2.0 * (sigma ** 2))
    return torch.exp(-gamma * dist_sq)


def rff_approx_kernel(
    zx: torch.Tensor,
    zy: torch.Tensor,
) -> torch.Tensor:
    """Compute approximate kernel from RFF embeddings via inner product: <z(x), z(y)>.

    Args:
        zx: Transformed tensor of shape [N, D].
        zy: Transformed tensor of shape [M, D].

    Returns:
        Tensor of shape [N, M] with approximate kernel values.
    """
    return torch.matmul(zx, zy.transpose(-2, -1))
