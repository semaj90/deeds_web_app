"""Deterministic compute controls for Parent Atlas reference executors.

The reference lane is intentionally conservative:
- IEEE FP32 matmul by default (TF32 disabled for the oracle)
- torch deterministic algorithms fail closed
- fixed Python/NumPy/PyTorch seeds
- cuDNN benchmarking disabled
- CUBLAS_WORKSPACE_CONFIG pinned before CUDA GEMM use

Performance challengers may opt into TF32/FP16, but their receipts must remain
non-authoritative and be compared against an IEEE FP32/exact oracle.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import os
import random
from typing import Any, Literal

import numpy as np


MatmulMode = Literal["ieee", "tf32"]


@dataclass(frozen=True)
class TorchDeterminismReceipt:
    schema: str
    seed: int
    deterministic_algorithms: bool
    cublas_workspace_config: str
    matmul_mode: MatmulMode
    cudnn_benchmark: bool
    cudnn_deterministic: bool
    torch_version: str
    cuda_version: str | None
    cuda_available: bool
    device_name: str | None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _set_fp32_backend_precision(torch: Any, mode: MatmulMode) -> None:
    """Use the post-PyTorch-2.9 precision API when available, old flags otherwise."""

    precision = "ieee" if mode == "ieee" else "tf32"
    used_new_api = False

    try:
        if hasattr(torch.backends.cuda.matmul, "fp32_precision"):
            torch.backends.cuda.matmul.fp32_precision = precision
            used_new_api = True
    except Exception:
        pass

    try:
        if hasattr(torch.backends.cudnn, "fp32_precision"):
            torch.backends.cudnn.fp32_precision = precision
            used_new_api = True
    except Exception:
        pass

    # PyTorch docs advise not mixing the old allow_tf32 flags with the newer
    # fp32_precision API. Only use the compatibility flags when the new surface
    # is absent from the installed build.
    if not used_new_api:
        try:
            torch.backends.cuda.matmul.allow_tf32 = mode == "tf32"
        except Exception:
            pass
        try:
            torch.backends.cudnn.allow_tf32 = mode == "tf32"
        except Exception:
            pass

    # `highest` requests IEEE-like FP32 internal matmul; `high` allows TF32 on
    # supported CUDA devices. This call also gives older builds a compatible path.
    try:
        torch.set_float32_matmul_precision("highest" if mode == "ieee" else "high")
    except Exception:
        pass


def configure_torch_determinism(
    *,
    seed: int = 0xA71A5,
    matmul_mode: MatmulMode = "ieee",
    cublas_workspace_config: str = ":4096:8",
) -> TorchDeterminismReceipt:
    """Configure the same-process PyTorch reference lane deterministically.

    `CUBLAS_WORKSPACE_CONFIG` is set with ``setdefault`` so an operator-provided
    value is preserved. Call this before the first CUDA GEMM in the process.
    """

    os.environ.setdefault("CUBLAS_WORKSPACE_CONFIG", cublas_workspace_config)

    import torch

    random.seed(seed)
    np.random.seed(seed & 0xFFFF_FFFF)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)

    torch.use_deterministic_algorithms(True, warn_only=False)
    try:
        torch.backends.cudnn.benchmark = False
        torch.backends.cudnn.deterministic = True
    except Exception:
        pass

    _set_fp32_backend_precision(torch, matmul_mode)

    return TorchDeterminismReceipt(
        schema="atlas.torch-determinism-receipt.v1",
        seed=seed,
        deterministic_algorithms=bool(torch.are_deterministic_algorithms_enabled()),
        cublas_workspace_config=os.environ.get("CUBLAS_WORKSPACE_CONFIG", ""),
        matmul_mode=matmul_mode,
        cudnn_benchmark=bool(getattr(torch.backends.cudnn, "benchmark", False)),
        cudnn_deterministic=bool(getattr(torch.backends.cudnn, "deterministic", False)),
        torch_version=str(torch.__version__),
        cuda_version=str(torch.version.cuda) if torch.version.cuda else None,
        cuda_available=bool(torch.cuda.is_available()),
        device_name=torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
    )
