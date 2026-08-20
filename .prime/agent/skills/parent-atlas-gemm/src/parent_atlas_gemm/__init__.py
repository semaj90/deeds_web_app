from __future__ import annotations

"""Prime Agent Python-backed skill entry point for Parent Atlas GEMM probes."""

from pathlib import Path
import sys
from typing import Any


def _repo_root() -> Path:
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "sveltekit-frontend").is_dir() and (parent / ".prime").is_dir():
            return parent
    cwd = Path.cwd().resolve()
    for candidate in (cwd, *cwd.parents):
        if (candidate / "sveltekit-frontend" / "python" / "parent_atlas_tensor").is_dir():
            return candidate
    raise RuntimeError("PARENT_ATLAS_REPO_ROOT_NOT_FOUND")


def _bridge() -> Any:
    python_root = _repo_root() / "sveltekit-frontend" / "python"
    path = str(python_root)
    if path not in sys.path:
        sys.path.insert(0, path)
    from parent_atlas_tensor import rlm_gemm_bridge
    return rlm_gemm_bridge


async def run(
    action: str = "attest",
    *,
    m: int = 1024,
    n: int = 1024,
    k: int = 1024,
    seed: int = 0xA71A5,
    warmup: int = 3,
    repeats: int = 7,
    require_cuda: bool = False,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Execute a read-only Parent Atlas numerical probe.

    action:
      attest  -> CUDA/runtime attestation
      gemm    -> NumPy oracle vs CUDA GEMM lanes
      svd     -> direct-SVD parity fixtures
      modfkv  -> bounded ModFKV experiment; requires payload
    """
    bridge = _bridge()
    normalized = action.strip().lower()
    if normalized == "attest":
        return bridge.rlm_cuda_attestation()
    if normalized == "gemm":
        return bridge.rlm_gemm_probe(
            m=m,
            n=n,
            k=k,
            seed=seed,
            warmup=warmup,
            repeats=repeats,
            require_cuda=require_cuda,
        )
    if normalized == "svd":
        return bridge.rlm_svd_parity_fixtures(require_cuda=require_cuda)
    if normalized == "modfkv":
        if payload is None:
            raise ValueError("PARENT_ATLAS_GEMM_MODFKV_PAYLOAD_REQUIRED")
        return bridge.rlm_modfkv_probe(payload)
    raise ValueError(f"PARENT_ATLAS_GEMM_UNKNOWN_ACTION:{action}")
