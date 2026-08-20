from __future__ import annotations

"""Deterministic smoke tests for Parent Atlas GEMM/RLM integration.

CPU-only execution proves receipt structure and oracle determinism. CUDA-specific
claims remain unproven unless --require-cuda is supplied and at least one CUDA
lane executes successfully.
"""

import argparse
import json

from .gemm_primitives import cuda_attestation, run_gemm_suite
from .rlm_gemm_bridge import rlm_cuda_attestation, rlm_gemm_probe


def run_selftest(require_cuda: bool = False) -> dict:
    first = run_gemm_suite(
        m=64,
        n=48,
        k=32,
        seed=0xA71A5,
        warmup=1,
        repeats=2,
        require_cuda=require_cuda,
        producer_revision="parent-atlas-gemm-selftest.v1",
    )
    second = run_gemm_suite(
        m=64,
        n=48,
        k=32,
        seed=0xA71A5,
        warmup=1,
        repeats=2,
        require_cuda=require_cuda,
        producer_revision="parent-atlas-gemm-selftest.v1",
    )

    assert first["inputSha256"] == second["inputSha256"]
    assert first["numpyReference"]["outputSha256"] == second["numpyReference"]["outputSha256"]
    assert first["invariants"]["numpyFloat64IsNumericalOracle"] is True
    assert first["invariants"]["preferredBlasIsRequestNotKernelProof"] is True
    assert first["invariants"]["evidenceAuthorizesMutation"] is False
    assert first["invariants"]["canonicalWritesAllowed"] is False

    attestation = cuda_attestation()
    bridge_attestation = rlm_cuda_attestation()
    bridge_probe = rlm_gemm_probe(
        32,
        32,
        32,
        seed=0xA71A5,
        warmup=0,
        repeats=1,
        require_cuda=require_cuda,
    )
    assert bridge_attestation["canonicalWritesAllowed"] is False
    assert bridge_probe["rlmIntegration"]["agentMayAuthorizeMutation"] is False

    cuda_executed = first["summary"]["executedLaneCount"] > 0
    if require_cuda:
        assert attestation.get("cudaAvailable") is True
        assert cuda_executed

    return {
        "schema": "atlas.rtx-gemm-selftest-receipt.v1",
        "deterministicInputIdentity": True,
        "deterministicNumpyOracle": True,
        "rlmBridgeVerified": True,
        "cudaAvailable": bool(attestation.get("cudaAvailable", False)),
        "cudaLaneExecuted": cuda_executed,
        "cudaProofStatus": "EXECUTED" if cuda_executed else "UNAVAILABLE",
        "kernelDispatchIndependentlyVerified": False,
        "canonicalWritesAllowed": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser(prog="parent-atlas-gemm-selftest")
    parser.add_argument("--require-cuda", action="store_true")
    args = parser.parse_args()
    print(json.dumps(run_selftest(require_cuda=args.require_cuda), separators=(",", ":")))


if __name__ == "__main__":
    main()
