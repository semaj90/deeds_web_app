"""Differentiable stabilized L2 normalization reference for Atlas training."""
from __future__ import annotations

import torch


class _StabilizedL2Normalize(torch.autograd.Function):
    @staticmethod
    def forward(ctx, values: torch.Tensor, epsilon: float, dim: int) -> torch.Tensor:
        if epsilon <= 0:
            raise ValueError("epsilon must be positive")
        squared_norm = torch.sum(values * values, dim=dim, keepdim=True)
        radius = torch.sqrt(squared_norm + epsilon)
        ctx.save_for_backward(values, radius)
        ctx.dim = dim
        return values / radius

    @staticmethod
    def backward(ctx, grad_output: torch.Tensor):
        values, radius = ctx.saved_tensors
        input_grad_dot = torch.sum(values * grad_output, dim=ctx.dim, keepdim=True)
        grad_values = grad_output / radius - values * input_grad_dot / radius.pow(3)
        return grad_values, None, None


def stabilized_l2_normalize(
    values: torch.Tensor,
    *,
    epsilon: float = 1e-12,
    dim: int = -1,
) -> torch.Tensor:
    """Apply x/sqrt(sum(x²)+epsilon), with its exact autograd derivative.

    Use for differentiable feature transforms whose contract specifies epsilon
    inside the square root. Keep canonical embedding validation/normalization
    on its existing contract; this function is not a replacement for it.
    """
    if not isinstance(values, torch.Tensor):
        raise TypeError("values must be a torch.Tensor")
    if values.ndim == 0:
        raise ValueError("values must have at least one dimension")
    if not -values.ndim <= dim < values.ndim:
        raise ValueError("dim is out of range")
    return _StabilizedL2Normalize.apply(values, float(epsilon), int(dim))
