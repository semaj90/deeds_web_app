"""PyTorch/Triton execution experiment for Parent Atlas tensor primitives.

Compares one intentionally simple elementwise primitive across:
- PyTorch eager reference
- torch.compile/Inductor
- raw Triton JIT when Triton/CUDA are available
- torch.library.triton_op when available

Callers may supply a frozen FP32 tensor snapshot. Every challenger consumes the
same bytes and is compared numerically to the eager result. This experiment is
backend evidence only and never canonical application truth.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import time
from typing import Any, Literal

import numpy as np

from .determinism import configure_torch_determinism

BackendName = Literal[
    "pytorch_eager",
    "torch_compile_inductor",
    "triton_jit",
    "torch_library_triton_op",
]

@dataclass(frozen=True)
class KernelBackendMeasurement:
    backend: BackendName
    available: bool
    passed_parity: bool
    max_abs_error: float | None
    mean_abs_error: float | None
    first_call_ms: float | None
    steady_state_ms: float | None
    output_checksum: str | None
    detail: str | None

@dataclass(frozen=True)
class TorchKernelExperimentReceipt:
    schema: str
    operation: str
    shape: list[int]
    dtype: str
    shape_policy: str
    source_tensor_checksum: str
    input_checksum: str
    reference_checksum: str
    measurements: list[KernelBackendMeasurement]
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

def _numpy_checksum(values: np.ndarray) -> str:
    return hashlib.sha256(np.ascontiguousarray(values, dtype=np.float32).tobytes()).hexdigest()

def _checksum(tensor: Any) -> str:
    return _numpy_checksum(tensor.detach().cpu().float().numpy())

def _measure(callable_obj: Any, x: Any, y: Any, *, warmup: int = 5, repeat: int = 20) -> tuple[Any, float, float]:
    import torch

    def sync() -> None:
        if x.is_cuda:
            torch.cuda.synchronize(x.device)

    start = time.perf_counter()
    out = callable_obj(x, y)
    sync()
    first_ms = (time.perf_counter() - start) * 1000.0

    for _ in range(warmup):
        callable_obj(x, y)
    sync()

    start = time.perf_counter()
    last = out
    for _ in range(repeat):
        last = callable_obj(x, y)
    sync()
    steady_ms = ((time.perf_counter() - start) * 1000.0) / repeat
    return last, first_ms, steady_ms

def _parity(reference: Any, challenger: Any) -> tuple[bool, float, float]:
    import torch

    delta = (reference.float() - challenger.float()).abs()
    max_error = float(delta.max().detach().cpu())
    mean_error = float(delta.mean().detach().cpu())
    return bool(torch.allclose(reference.float(), challenger.float(), rtol=1e-5, atol=1e-6)), max_error, mean_error

def _raw_triton_add_scale(scale: float):
    import triton
    import triton.language as tl

    @triton.jit
    def kernel(x_ptr, y_ptr, out_ptr, n_elements, BLOCK_SIZE: tl.constexpr, SCALE: tl.constexpr):
        offsets = tl.program_id(0) * BLOCK_SIZE + tl.arange(0, BLOCK_SIZE)
        mask = offsets < n_elements
        x = tl.load(x_ptr + offsets, mask=mask)
        y = tl.load(y_ptr + offsets, mask=mask)
        tl.store(out_ptr + offsets, x + y * SCALE, mask=mask)

    def call(x: Any, y: Any) -> Any:
        import torch

        out = torch.empty_like(x)
        n_elements = x.numel()
        grid = lambda meta: (triton.cdiv(n_elements, meta["BLOCK_SIZE"]),)
        kernel[grid](x, y, out, n_elements, BLOCK_SIZE=256, SCALE=scale)
        return out

    return call

def _triton_op_add_scale(scale: float):
    import torch
    import triton
    import triton.language as tl

    if not hasattr(torch.library, "triton_op") or not hasattr(torch.library, "wrap_triton"):
        raise RuntimeError("torch.library.triton_op/wrap_triton unavailable")

    @triton.jit
    def kernel(x_ptr, y_ptr, out_ptr, n_elements, BLOCK_SIZE: tl.constexpr, SCALE: tl.constexpr):
        offsets = tl.program_id(0) * BLOCK_SIZE + tl.arange(0, BLOCK_SIZE)
        mask = offsets < n_elements
        x = tl.load(x_ptr + offsets, mask=mask)
        y = tl.load(y_ptr + offsets, mask=mask)
        tl.store(out_ptr + offsets, x + y * SCALE, mask=mask)

    @torch.library.triton_op("parent_atlas::add_scale_experiment", mutates_args={})
    def operation(x: torch.Tensor, y: torch.Tensor) -> torch.Tensor:
        out = torch.empty_like(x)
        n_elements = x.numel()
        grid = lambda meta: (triton.cdiv(n_elements, meta["BLOCK_SIZE"]),)
        torch.library.wrap_triton(kernel)[grid](x, y, out, n_elements, BLOCK_SIZE=256, SCALE=scale)
        return out

    return operation

def run_torch_kernel_experiment(
    *,
    input_matrix: np.ndarray | None = None,
    rows: int = 1024,
    cols: int = 768,
    scale: float = 0.5,
    device: str | None = None,
    compile_dynamic: bool | None = None,
    seed: int = 0xA71A5,
) -> TorchKernelExperimentReceipt:
    import torch

    configure_torch_determinism(seed=seed, matmul_mode="ieee")
    selected_device = device or ("cuda" if torch.cuda.is_available() else "cpu")

    if input_matrix is None:
        generator = torch.Generator(device=selected_device)
        generator.manual_seed(seed)
        x = torch.randn((rows, cols), generator=generator, device=selected_device, dtype=torch.float32)
        source_checksum = _checksum(x)
    else:
        values = np.asarray(input_matrix, dtype=np.float32)
        if values.ndim != 2:
            raise ValueError(f"input_matrix must be rank-2; got shape={values.shape}")
        if not np.isfinite(values).all():
            raise ValueError("input_matrix contains non-finite values")
        x = torch.from_numpy(np.ascontiguousarray(values)).to(selected_device)
        rows, cols = values.shape
        source_checksum = _numpy_checksum(values)

    # Derive the companion tensor deterministically from the same frozen input
    # instead of introducing a second random data source.
    y = torch.flip(x, dims=[-1]).contiguous()

    def eager(a: torch.Tensor, b: torch.Tensor) -> torch.Tensor:
        return a + b * scale

    reference, first_ms, steady_ms = _measure(eager, x, y)
    measurements: list[KernelBackendMeasurement] = [KernelBackendMeasurement(
        backend="pytorch_eager",
        available=True,
        passed_parity=True,
        max_abs_error=0.0,
        mean_abs_error=0.0,
        first_call_ms=first_ms,
        steady_state_ms=steady_ms,
        output_checksum=_checksum(reference),
        detail="frozen-input reference" if input_matrix is not None else "generated fixture reference",
    )]

    try:
        compiled = torch.compile(eager, backend="inductor", dynamic=compile_dynamic)
        output, compiled_first, compiled_steady = _measure(compiled, x, y)
        passed, max_error, mean_error = _parity(reference, output)
        measurements.append(KernelBackendMeasurement(
            backend="torch_compile_inductor",
            available=True,
            passed_parity=passed,
            max_abs_error=max_error,
            mean_abs_error=mean_error,
            first_call_ms=compiled_first,
            steady_state_ms=compiled_steady,
            output_checksum=_checksum(output),
            detail=f"dynamic={compile_dynamic!r}",
        ))
    except Exception as exc:
        measurements.append(KernelBackendMeasurement(
            backend="torch_compile_inductor", available=False, passed_parity=False,
            max_abs_error=None, mean_abs_error=None, first_call_ms=None, steady_state_ms=None,
            output_checksum=None, detail=f"{type(exc).__name__}: {exc}",
        ))

    if selected_device.startswith("cuda"):
        try:
            triton_call = _raw_triton_add_scale(scale)
            output, triton_first, triton_steady = _measure(triton_call, x, y)
            passed, max_error, mean_error = _parity(reference, output)
            measurements.append(KernelBackendMeasurement(
                backend="triton_jit", available=True, passed_parity=passed,
                max_abs_error=max_error, mean_abs_error=mean_error,
                first_call_ms=triton_first, steady_state_ms=triton_steady,
                output_checksum=_checksum(output), detail="BLOCK_SIZE=256; no autotune",
            ))
        except Exception as exc:
            measurements.append(KernelBackendMeasurement(
                backend="triton_jit", available=False, passed_parity=False,
                max_abs_error=None, mean_abs_error=None, first_call_ms=None, steady_state_ms=None,
                output_checksum=None, detail=f"{type(exc).__name__}: {exc}",
            ))

        try:
            triton_op = _triton_op_add_scale(scale)
            compiled_triton_op = torch.compile(triton_op, backend="inductor", dynamic=compile_dynamic)
            output, op_first, op_steady = _measure(compiled_triton_op, x, y)
            passed, max_error, mean_error = _parity(reference, output)
            measurements.append(KernelBackendMeasurement(
                backend="torch_library_triton_op", available=True, passed_parity=passed,
                max_abs_error=max_error, mean_abs_error=mean_error,
                first_call_ms=op_first, steady_state_ms=op_steady,
                output_checksum=_checksum(output), detail="triton_op + wrap_triton + torch.compile",
            ))
        except Exception as exc:
            measurements.append(KernelBackendMeasurement(
                backend="torch_library_triton_op", available=False, passed_parity=False,
                max_abs_error=None, mean_abs_error=None, first_call_ms=None, steady_state_ms=None,
                output_checksum=None, detail=f"{type(exc).__name__}: {exc}",
            ))

    input_digest = hashlib.sha256()
    input_digest.update(np.ascontiguousarray(x.detach().cpu().numpy()).tobytes())
    input_digest.update(np.ascontiguousarray(y.detach().cpu().numpy()).tobytes())
    return TorchKernelExperimentReceipt(
        schema="atlas.torch-kernel-experiment-receipt.v2",
        operation="add_scale",
        shape=[rows, cols],
        dtype="float32",
        shape_policy="automatic" if compile_dynamic is None else ("forced_dynamic" if compile_dynamic else "forced_static"),
        source_tensor_checksum=source_checksum,
        input_checksum=input_digest.hexdigest(),
        reference_checksum=_checksum(reference),
        measurements=measurements,
        canonical_authority=False,
    )
