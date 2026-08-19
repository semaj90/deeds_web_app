"""Parent Atlas Triton decision-function challengers.

PyTorch/LibTorch remain the readable reference. Triton is an optimized executor
for kernels that benefit from fusion. Unsupported/experimental functions must
carry quality receipts before replacing pretrained model behavior.
"""
from __future__ import annotations

from dataclasses import dataclass

try:
    import torch
    import triton
    import triton.language as tl
except Exception:  # pragma: no cover - workstation/runtime dependent
    torch = None
    triton = None
    tl = None


@dataclass(frozen=True)
class TritonDecisionCapability:
    name: str
    available: bool
    experimental: bool
    note: str


if triton is not None:
    @triton.jit
    def _sigmoid_kernel(x_ptr, y_ptr, n: tl.constexpr, BLOCK: tl.constexpr):
        offsets = tl.arange(0, BLOCK)
        mask = offsets < n
        x = tl.load(x_ptr + offsets, mask=mask, other=0.0).to(tl.float32)
        y = 1.0 / (1.0 + tl.exp(-x))
        tl.store(y_ptr + offsets, y, mask=mask)

    @triton.jit
    def _squaremax_row_kernel(x_ptr, y_ptr, n_cols: tl.constexpr, BLOCK: tl.constexpr):
        cols = tl.arange(0, BLOCK)
        mask = cols < n_cols
        x = tl.load(x_ptr + cols, mask=mask, other=float('inf')).to(tl.float32)
        minimum = tl.min(x, axis=0)
        shifted = tl.where(mask, x - minimum, 0.0)
        sq = shifted * shifted
        denom = tl.sum(sq, axis=0)
        uniform = 1.0 / n_cols
        y = tl.where(mask, tl.where(denom > 0.0, sq / denom, uniform), 0.0)
        tl.store(y_ptr + cols, y, mask=mask)


def sigmoid_triton(x):
    if torch is None or triton is None:
        raise RuntimeError("Triton/PyTorch unavailable")
    if not x.is_cuda:
        raise ValueError("sigmoid_triton requires a CUDA tensor")
    flat = x.contiguous().view(-1)
    out = torch.empty_like(flat)
    block = triton.next_power_of_2(flat.numel())
    _sigmoid_kernel[(1,)](flat, out, flat.numel(), BLOCK=block)
    return out.view_as(x)


def softmax_triton(x, dim=-1):
    """Use the canonical Triton softmax primitive/reference path first.

    TODO(PERF): promote to the fused-row tutorial-style kernel only for matrix
    shapes where row width fits the target GPU SRAM/resource envelope.
    """
    if torch is None or triton is None or tl is None:
        raise RuntimeError("Triton/PyTorch unavailable")
    if not x.is_cuda:
        raise ValueError("softmax_triton requires a CUDA tensor")
    # Keep readable/reference behavior until shape-specific fused kernel parity is proven.
    return torch.softmax(x, dim=dim)


def squaremax_triton_experimental(x):
    if torch is None or triton is None:
        raise RuntimeError("Triton/PyTorch unavailable")
    if not x.is_cuda or x.ndim != 1:
        raise ValueError("experimental squaremax stub currently accepts one CUDA row")
    out = torch.empty_like(x)
    block = triton.next_power_of_2(x.numel())
    _squaremax_row_kernel[(1,)](x, out, x.numel(), BLOCK=block)
    return out


def capabilities() -> list[TritonDecisionCapability]:
    available = torch is not None and triton is not None
    return [
        TritonDecisionCapability("SIGMOID", available, False, "elementwise fused candidate"),
        TritonDecisionCapability("SOFTMAX", available, False, "use fused row kernel only after shape-specific parity"),
        TritonDecisionCapability("SPARSEMAX", False, False, "TODO: sort/threshold GPU implementation"),
        TritonDecisionCapability("SQUAREMAX", available, True, "experimental; model quality receipt required for attention"),
        TritonDecisionCapability("POLYNOMIAL", False, True, "TODO: define exact polynomial family and proof contract first"),
    ]


# TODO(PYTORCH-INTEGRATION): wrap proven kernels with torch.library.triton_op
# only when Parent Atlas needs a PyTorch-builtin-like operator for torch.compile,
# AOTInductor, tensor subclasses, or CPU fallback composition.
