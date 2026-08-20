from __future__ import annotations

"""Small read-only bridge for Prime/RLM Python sessions.

The bridge gives a persistent interpreter a stable function-oriented surface
instead of requiring shell subprocesses. Returned values are JSON-serializable
receipts suitable for agent scratchpads, evaluation logs, or later validators.
"""

from typing import Any

from .gemm_primitives import cuda_attestation, run_gemm_suite
from .svd_parity import run_fixture_suite as run_svd_fixture_suite
from .modfkv_bounded import run_modfkv


def rlm_cuda_attestation() -> dict[str, Any]:
    return {
        "schema": "atlas.rlm-cuda-attestation.v1",
        "cuda": cuda_attestation(),
        "toolSurface": "PYTHON_FUNCTION",
        "proposalOnly": True,
        "canonicalWritesAllowed": False,
    }


def rlm_gemm_probe(
    m: int = 1024,
    n: int = 1024,
    k: int = 1024,
    *,
    seed: int = 0xA71A5,
    warmup: int = 3,
    repeats: int = 7,
    require_cuda: bool = False,
) -> dict[str, Any]:
    receipt = run_gemm_suite(
        m=m,
        n=n,
        k=k,
        seed=seed,
        warmup=warmup,
        repeats=repeats,
        require_cuda=require_cuda,
        producer_revision="parent-atlas-rlm-gemm-bridge.v1",
    )
    receipt["rlmIntegration"] = {
        "surface": "PYTHON_FUNCTION",
        "persistentInterpreterCompatible": True,
        "agentMayReadReceipt": True,
        "agentMayAuthorizeMutation": False,
    }
    return receipt


def rlm_svd_parity_fixtures(*, require_cuda: bool = False) -> dict[str, Any]:
    receipt = run_svd_fixture_suite(require_cuda=require_cuda)
    receipt["rlmIntegration"] = {
        "surface": "PYTHON_FUNCTION",
        "agentMayReadReceipt": True,
        "agentMayAuthorizeMutation": False,
    }
    return receipt


def rlm_modfkv_probe(payload: dict[str, Any]) -> dict[str, Any]:
    receipt = run_modfkv(payload)
    receipt["rlmIntegration"] = {
        "surface": "PYTHON_FUNCTION",
        "agentMayReadReceipt": True,
        "agentMayAuthorizeMutation": False,
    }
    return receipt
