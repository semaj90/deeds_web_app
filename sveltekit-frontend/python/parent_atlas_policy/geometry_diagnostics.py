"""Directional geometry diagnostics for Parent Atlas.

Prefer JVP/VJP or sampled directions over full Jacobian materialization for 768->128/3 maps.
"""
from __future__ import annotations
import math
import torch
from torch.func import jvp, grad

@torch.no_grad()
def random_unit_directions(x: torch.Tensor, count: int = 16) -> torch.Tensor:
    dirs = torch.randn((count, *x.shape), device=x.device, dtype=x.dtype)
    flat = dirs.flatten(1)
    flat = flat / flat.norm(dim=1, keepdim=True).clamp_min(1e-8)
    return flat.reshape_as(dirs)

def directional_stretch(fn, x: torch.Tensor, directions: torch.Tensor) -> dict[str, float]:
    stretches = []
    for direction in directions:
        _, tangent = jvp(fn, (x,), (direction,))
        stretches.append(float(tangent.norm().detach().cpu()))
    t = torch.tensor(stretches)
    return {
        'samples': len(stretches),
        'stretch_mean': float(t.mean()),
        'stretch_max': float(t.max()),
        'stretch_min': float(t.min()),
    }

def score_covector(score_fn, x: torch.Tensor) -> torch.Tensor:
    """Gradient of a scalar score: the coordinate representation of the local covector dS_x."""
    return grad(score_fn)(x)

def cosine(a: torch.Tensor, b: torch.Tensor) -> torch.Tensor:
    an = a / a.norm(dim=-1, keepdim=True).clamp_min(1e-8)
    bn = b / b.norm(dim=-1, keepdim=True).clamp_min(1e-8)
    return (an * bn).sum(dim=-1).clamp(-1, 1)

def angular_area(a: torch.Tensor, b: torch.Tensor) -> torch.Tensor:
    c = cosine(a, b)
    return torch.sqrt((1 - c * c).clamp_min(0))
