from __future__ import annotations

import json

from .gemm_primitives import run_gemm_suite
from .rtx_linear_algebra_preflight import run_linear_algebra_preflight


def main() -> None:
    first = run_gemm_suite(
        m=32,
        n=24,
        k=16,
        seed=0xA71A5,
        warmup=0,
        repeats=1,
        require_cuda=False,
        producer_revision="gemm-primitives-selftest.v1",
    )
    second = run_gemm_suite(
        m=32,
        n=24,
        k=16,
        seed=0xA71A5,
        warmup=0,
        repeats=1,
        require_cuda=False,
        producer_revision="gemm-primitives-selftest.v1",
    )

    assert first["schema"] == "atlas.rtx-gemm-parity-receipt.v1"
    assert first["inputSha256"] == second["inputSha256"]
    assert first["numpyReference"]["outputSha256"] == second["numpyReference"]["outputSha256"]
    assert first["invariants"]["numpyFloat64IsNumericalOracle"] is True
    assert first["invariants"]["preferredBlasIsRequestNotKernelProof"] is True
    assert first["invariants"]["evidenceAuthorizesMutation"] is False
    assert first["invariants"]["canonicalWritesAllowed"] is False

    for lane in first["lanes"]:
        assert lane["backend_dispatch_independently_verified"] is False
        assert lane["backend_dispatch_proof"] == "PYTORCH_BACKEND_PREFERENCE_ONLY"

    preflight = run_linear_algebra_preflight(
        seed=0xA71A5,
        gemm_m=32,
        gemm_n=24,
        gemm_k=16,
        feature_rows=32,
        feature_cols=16,
        condition_number=1e4,
        modfkv_sample_count=16,
        modfkv_rank=4,
        require_cuda=False,
    )
    assert preflight["schema"] == "atlas.rtx-linear-algebra-preflight-receipt.v1"
    assert preflight["directSvdParity"]["matrixSha256"] == preflight["boundedModFkv"]["matrixSha256"]
    assert preflight["invariants"]["sameFeatureMatrixForSvdAndModFkv"] is True
    assert preflight["invariants"]["fullTangRecommendationAlgorithmExecuted"] is False
    assert preflight["invariants"]["evidenceAuthorizesMutation"] is False

    print(json.dumps({
        "schema": "atlas.gemm-primitives-selftest.v1",
        "status": "PASS",
        "cudaAvailable": first["cudaAttestation"].get("cudaAvailable", False),
        "gemmInputSha256": first["inputSha256"],
        "featureMatrixSha256": preflight["featureMatrix"]["matrixSha256"],
        "canonicalWritesAllowed": False,
    }, separators=(",", ":")))


if __name__ == "__main__":
    main()
