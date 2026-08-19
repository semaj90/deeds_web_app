from __future__ import annotations

"""Prime Agent Python-backed skill entry point for Parent Atlas GEMM probes.

Prime's persistent kernel remains the orchestration/RLM surface. The actual
NumPy/PyTorch/CUDA benchmark runs in the Parent Atlas project Python so the
kernel does not install or own a second CUDA/PyTorch stack.
"""

import asyncio
import json
import os
from pathlib import Path
import subprocess
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


def _project_python(root: Path) -> Path:
    explicit = os.environ.get("ATLAS_PYTHON_EXE") or os.environ.get("PYTHON_EXE")
    if explicit:
        path = Path(explicit).expanduser()
        if path.exists():
            return path.resolve()
        raise RuntimeError(f"ATLAS_GEMM_EXPLICIT_PYTHON_NOT_FOUND:{path}")

    candidates = (
        root / ".venv" / "Scripts" / "python.exe",
        root / ".venv" / "bin" / "python",
        root / "sveltekit-frontend" / ".venv" / "Scripts" / "python.exe",
        root / "sveltekit-frontend" / ".venv" / "bin" / "python",
    )
    for candidate in candidates:
        if candidate.exists():
            return candidate.resolve()
    raise RuntimeError(
        "ATLAS_GEMM_PROJECT_PYTHON_NOT_FOUND: set ATLAS_PYTHON_EXE or create the repo .venv"
    )


def _run_project_gemm(
    root: Path,
    *,
    m: int,
    n: int,
    k: int,
    seed: int,
    warmup: int,
    repeats: int,
    require_cuda: bool,
) -> dict[str, Any]:
    python = _project_python(root)
    python_root = root / "sveltekit-frontend" / "python"
    env = os.environ.copy()
    existing = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = str(python_root) + (os.pathsep + existing if existing else "")
    args = [
        str(python),
        "-m",
        "parent_atlas_tensor.gemm_primitives",
        "--m", str(m),
        "--n", str(n),
        "--k", str(k),
        "--seed", hex(seed),
        "--warmup", str(warmup),
        "--repeats", str(repeats),
    ]
    if require_cuda:
        args.append("--require-cuda")

    completed = subprocess.run(
        args,
        cwd=str(root),
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(
            "ATLAS_GEMM_PROJECT_PROCESS_FAILED:"
            f"exit={completed.returncode}:stderr={completed.stderr[-4000:]}"
        )
    try:
        return json.loads(completed.stdout.strip())
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"ATLAS_GEMM_PROJECT_PROCESS_INVALID_JSON:{completed.stdout[-4000:]}"
        ) from exc


def _review_prompt(receipt_path: str, role: str) -> str:
    return f"""Parent Atlas GEMM receipt review.

Role: {role}
Receipt: {receipt_path}

Read the JSON receipt. Do not run or authorize mutations. Review only the
numerical/runtime evidence already present. Check numerical errors, RTX/Ampere
precision behavior, backend-preference-vs-dispatch-proof distinctions, failed or
unavailable lanes, and readiness for downstream SVD/ModFKV work. Write a concise
JSON review artifact next to the receipt named with your role. Do not modify
source files.
"""


async def _spawn_reviewers(receipt_path: str) -> list[dict[str, Any]]:
    try:
        from rlm import rlm  # type: ignore
    except Exception as exc:
        raise RuntimeError("PRIME_RLM_RUNTIME_UNAVAILABLE") from exc

    handles: list[dict[str, Any]] = []
    roles = (
        ("gemm-numerics", "Numerical analyst: compare errors, dtype behavior, and oracle assumptions."),
        ("gemm-cuda", "CUDA analyst: assess Ampere/cuBLAS/cuBLASLt/TF32 evidence and dispatch-attestation limits."),
    )
    for name, role in roles:
        handle = await rlm(_review_prompt(receipt_path, role), name=name)
        handles.append({
            "name": getattr(handle, "name", name),
            "rlmChildId": getattr(handle, "rlm_child_id", None),
            "sessionDir": str(getattr(handle, "session_dir", "")) or None,
            "model": str(getattr(handle, "model", "")) or None,
            "admissionOnly": True,
            "answerReceived": False,
        })
    return handles


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
    root = _repo_root()
    gemm_receipt = await asyncio.to_thread(
        _run_project_gemm,
        root,
        m=m,
        n=n,
        k=k,
        seed=seed,
        warmup=warmup,
        repeats=repeats,
        require_cuda=require_cuda,
    )

    target = Path(output_path)
    if not target.is_absolute():
        target = root / target
    target = target.resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(gemm_receipt, indent=2, allow_nan=False) + "\n", encoding="utf-8")

    handles = await _spawn_reviewers(str(target)) if spawn_reviewers else []
    return {
        "schema": "atlas.prime-rlm-gemm-handoff.v1",
        "projectPython": str(_project_python(root)),
        "primeKernelOwnsCudaRuntime": False,
        "receiptPath": str(target),
        "gemmReceipt": gemm_receipt,
        "reviewerHandles": handles,
        "reviewerAdmissionDoesNotEqualValidation": True,
        "evidenceAuthorizesMutation": False,
        "canonicalWritesAllowed": False,
    }
