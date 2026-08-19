from __future__ import annotations

"""Prime Agent / RLM bridge for Parent Atlas GEMM receipts.

The GPU work stays local to the Parent Atlas Python runtime. Optional RLM child
agents receive an immutable JSON receipt for focused review. Per Prime Agent's
RLM contract, spawning a child returns an admission handle only; this module does
not pretend that admission is the child's answer or validation result.
"""

import json
from pathlib import Path
from typing import Any, Awaitable, Callable

from .gemm_primitives import run_gemm_suite

RlmCallable = Callable[..., Awaitable[Any]]


def _review_prompt(receipt_path: str, role: str) -> str:
    return f"""Parent Atlas GEMM receipt review.

Role: {role}
Receipt: {receipt_path}

Read the JSON receipt. Do not run or authorize mutations. Review only the
numerical/runtime evidence already present. Pay special attention to:
- NumPy float64 oracle vs CUDA lane relative Frobenius errors,
- requested cuBLAS/cuBLASLt preference vs actual independently proven dispatch,
- TF32/FP16/BF16 accuracy tradeoffs,
- whether any unavailable or failed lane is being mislabeled as success,
- whether this evidence is sufficient for downstream SVD/ModFKV execution.

Write a concise JSON review artifact next to the receipt named with your role.
Do not modify source files.
"""


def _resolve_rlm_callable(explicit: RlmCallable | None) -> RlmCallable:
    if explicit is not None:
        return explicit
    try:
        from rlm import rlm as runtime_rlm  # type: ignore
    except Exception as exc:  # pragma: no cover - Prime runtime only
        raise RuntimeError(
            "PRIME_RLM_RUNTIME_UNAVAILABLE: pass rlm_callable explicitly or run inside Prime Agent IPython"
        ) from exc
    return runtime_rlm


async def run_gemm_with_rlm_review(
    *,
    output_path: str = ".atlas/receipts/rtx-gemm.json",
    m: int = 1024,
    n: int = 1024,
    k: int = 1024,
    seed: int = 0xA71A5,
    warmup: int = 3,
    repeats: int = 7,
    require_cuda: bool = False,
    spawn_reviewers: bool = True,
    rlm_callable: RlmCallable | None = None,
) -> dict[str, Any]:
    receipt = run_gemm_suite(
        m=m,
        n=n,
        k=k,
        seed=seed,
        warmup=warmup,
        repeats=repeats,
        require_cuda=require_cuda,
        producer_revision="parent-atlas-prime-rlm-gemm.v1",
    )

    path = Path(output_path).expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(receipt, indent=2, allow_nan=False) + "\n", encoding="utf-8")

    handles: list[dict[str, Any]] = []
    if spawn_reviewers:
        rlm = _resolve_rlm_callable(rlm_callable)
        roles = (
            ("gemm-numerics", "Numerical analyst: compare errors, tolerances, dtype behavior, and oracle assumptions."),
            ("gemm-cuda", "CUDA analyst: assess Ampere/cuBLAS/cuBLASLt/TF32 evidence and backend-attestation limits."),
        )
        for name, role in roles:
            handle = await rlm(_review_prompt(str(path), role), name=name)
            handles.append({
                "name": getattr(handle, "name", name),
                "rlmChildId": getattr(handle, "rlm_child_id", None),
                "sessionDir": str(getattr(handle, "session_dir", "")) or None,
                "model": str(getattr(handle, "model", "")) or None,
                "admissionOnly": True,
                "answerReceived": False,
            })

    return {
        "schema": "atlas.prime-rlm-gemm-handoff.v1",
        "receiptPath": str(path),
        "gemmReceipt": receipt,
        "reviewerHandles": handles,
        "reviewerAdmissionDoesNotEqualValidation": True,
        "evidenceAuthorizesMutation": False,
        "canonicalWritesAllowed": False,
    }
