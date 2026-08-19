from __future__ import annotations

"""Prime Agent Python-backed skill entry point for Parent Atlas GEMM probes."""

from pathlib import Path
import sys
from typing import Any


def _repo_root() -> Path:
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / ".git").exists() or (parent / "sveltekit-frontend").exists():
            return parent
    cwd = Path.cwd().resolve()
    for candidate in (cwd, *cwd.parents):
        if (candidate / "sveltekit-frontend" / "python" / "parent_atlas_tensor").exists():
            return candidate
    raise RuntimeError("ATLAS_GEMM_REPO_ROOT_NOT_FOUND")


def _ensure_project_python_path() -> Path:
    root = _repo_root()
    python_root = root / "sveltekit-frontend" / "python"
    if not python_root.exists():
        raise RuntimeError(f"ATLAS_GEMM_PROJECT_PYTHON_NOT_FOUND:{python_root}")
    value = str(python_root)
    if value not in sys.path:
        sys.path.insert(0, value)
    return root


async def run(
    m: int = 1024,
    n: int = 1024,
    k: int = 1024,
    seed: int = 0xA71A5,
    warmup: int = 3,
    repeats: int = 7,
    require_cuda: bool = False,
    spawn_reviewers: bool = True,
    output_path: str = ".atlas/receipts/rtx-gemm.json",
) -> dict[str, Any]:
    root = _ensure_project_python_path()
    from parent_atlas_tensor.prime_rlm_gemm import run_gemm_with_rlm_review

    target = Path(output_path)
    if not target.is_absolute():
        target = root / target

    return await run_gemm_with_rlm_review(
        output_path=str(target),
        m=m,
        n=n,
        k=k,
        seed=seed,
        warmup=warmup,
        repeats=repeats,
        require_cuda=require_cuda,
        spawn_reviewers=spawn_reviewers,
    )
