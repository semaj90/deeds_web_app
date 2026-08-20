#!/usr/bin/env python3
"""Parent Atlas execution-identity probe for dense CUDA kernels.

This is a read-only experiment. It does not train, write model weights, mutate
indexes, or autotune kernels. It proves increasingly optimized implementations
against simple PyTorch reference math:

1. eager PyTorch cosine/top-k reference
2. torch.compile(..., backend="inductor") parity when available
3. raw Triton weighted-row-score kernel parity when Triton is available
4. torch.nn.functional.grouped_mm 3-D primitive parity ONLY when model topology
   is explicitly declared MoE and the current CUDA device supports the API

Input: optional JSON object on stdin.
Output: one canonical JSON receipt on stdout.
"""

from __future__ import annotations

import json
import math
import sys
import time
from typing import Any


def now_ms() -> float:
    return time.perf_counter() * 1000.0


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def read_payload() -> dict[str, Any]:
    raw = sys.stdin.read().strip()
    if not raw:
        return {}
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError("stdin JSON must be an object")
    return parsed


def model_moe_identity(payload: dict[str, Any]) -> dict[str, Any]:
    topology = payload.get("modelTopology") or {}
    declared = topology.get("topology") == "MOE"
    experts = topology.get("expertCount")
    topk = topology.get("expertsPerToken")
    valid = (
        declared
        and isinstance(experts, int)
        and experts > 0
        and isinstance(topk, int)
        and topk > 0
        and topk <= experts
    )
    return {
        "declaredMoe": bool(declared),
        "expertCount": experts if valid else None,
        "expertsPerToken": topk if valid else None,
        "groupedGemmEligibleByTopology": bool(valid),
        "reason": "EXPLICIT_MOE_TOPOLOGY" if valid else "MODEL_MOE_TOPOLOGY_NOT_EXPLICIT",
    }


def synchronize(torch: Any) -> None:
    if torch.cuda.is_available():
        torch.cuda.synchronize()


def benchmark(fn, warmup: int = 2, iterations: int = 5) -> tuple[Any, float]:
    result = None
    for _ in range(max(0, warmup)):
        result = fn()
    synchronize(__import__("torch"))
    start = now_ms()
    for _ in range(max(1, iterations)):
        result = fn()
    synchronize(__import__("torch"))
    elapsed = now_ms() - start
    return result, elapsed / max(1, iterations)


def main() -> int:
    payload = read_payload()
    import torch
    import torch.nn.functional as F

    seed = int(payload.get("seed", 0xA71A5))
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)

    device = torch.device("cuda" if torch.cuda.is_available() and payload.get("forceCpu") is not True else "cpu")
    candidate_count = max(8, min(int(payload.get("candidateCount", 2048)), 65536))
    dimension = int(payload.get("dimension", 768))
    if dimension not in (64, 128, 384, 768):
        raise ValueError("dimension must be one of 64/128/384/768 for this probe")
    topk = max(1, min(int(payload.get("topK", 32)), candidate_count))
    dtype = torch.float32

    candidates = torch.randn((candidate_count, dimension), device=device, dtype=dtype)
    query = torch.randn((dimension,), device=device, dtype=dtype)

    def eager_cosine_topk():
        q = F.normalize(query, dim=0, eps=1e-8)
        x = F.normalize(candidates, dim=1, eps=1e-8)
        scores = x @ q
        return torch.topk(scores, k=topk, largest=True, sorted=True)

    eager_out, eager_ms = benchmark(eager_cosine_topk)
    eager_values, eager_indices = eager_out

    compile_receipt: dict[str, Any] = {
        "attempted": False,
        "available": hasattr(torch, "compile"),
        "backend": "inductor",
        "parity": None,
        "indexParity": None,
        "maxAbsError": None,
        "meanMs": None,
        "error": None,
    }
    if hasattr(torch, "compile") and payload.get("skipCompile") is not True:
        compile_receipt["attempted"] = True
        try:
            compiled = torch.compile(eager_cosine_topk, backend="inductor", fullgraph=False)
            compiled_out, compiled_ms = benchmark(compiled)
            compiled_values, compiled_indices = compiled_out
            max_error = float((compiled_values - eager_values).abs().max().detach().cpu())
            compile_receipt.update({
                "parity": bool(torch.allclose(compiled_values, eager_values, rtol=1e-4, atol=1e-5)),
                "indexParity": bool(torch.equal(compiled_indices, eager_indices)),
                "maxAbsError": max_error,
                "meanMs": compiled_ms,
            })
        except Exception as exc:  # capability receipt, not a hard failure
            compile_receipt["error"] = f"{type(exc).__name__}: {exc}"

    # Raw Triton proof uses a deliberately simple row dot-product kernel. No
    # autotune is used in this first proof, so runtime identity is repeatable.
    triton_receipt: dict[str, Any] = {
        "attempted": False,
        "available": False,
        "kernel": "weighted_row_dot_v1",
        "autotuned": False,
        "parity": None,
        "maxAbsError": None,
        "meanMs": None,
        "error": None,
    }
    if device.type == "cuda" and payload.get("skipTriton") is not True:
        try:
            import triton
            import triton.language as tl
            triton_receipt["available"] = True

            @triton.jit
            def weighted_row_dot_kernel(x_ptr, w_ptr, out_ptr, rows: tl.constexpr, cols: tl.constexpr, block: tl.constexpr):
                row = tl.program_id(0)
                offsets = tl.arange(0, block)
                mask = offsets < cols
                x = tl.load(x_ptr + row * cols + offsets, mask=mask, other=0.0)
                w = tl.load(w_ptr + offsets, mask=mask, other=0.0)
                score = tl.sum(x * w, axis=0)
                tl.store(out_ptr + row, score)

            feature_cols = max(1, min(int(payload.get("featureColumns", 25)), 256))
            feature_rows = candidate_count
            features = torch.randn((feature_rows, feature_cols), device=device, dtype=torch.float32).contiguous()
            weights = torch.randn((feature_cols,), device=device, dtype=torch.float32).contiguous()
            reference = features @ weights
            block = 1 << math.ceil(math.log2(feature_cols))
            output = torch.empty((feature_rows,), device=device, dtype=torch.float32)

            def triton_run():
                weighted_row_dot_kernel[(feature_rows,)](
                    features,
                    weights,
                    output,
                    rows=feature_rows,
                    cols=feature_cols,
                    block=block,
                )
                return output

            triton_receipt["attempted"] = True
            triton_out, triton_ms = benchmark(triton_run)
            max_error = float((triton_out - reference).abs().max().detach().cpu())
            triton_receipt.update({
                "parity": bool(torch.allclose(triton_out, reference, rtol=1e-4, atol=1e-5)),
                "maxAbsError": max_error,
                "meanMs": triton_ms,
                "tritonVersion": getattr(triton, "__version__", None),
            })
        except Exception as exc:
            triton_receipt["error"] = f"{type(exc).__name__}: {exc}"

    topology = model_moe_identity(payload)
    capability = tuple(torch.cuda.get_device_capability()) if device.type == "cuda" else None
    sm80_or_newer = capability is not None and (capability[0] * 10 + capability[1]) >= 80
    grouped_receipt: dict[str, Any] = {
        "attempted": False,
        "available": hasattr(F, "grouped_mm"),
        "modelTopology": topology,
        "sm80OrNewer": sm80_or_newer,
        "form": "3D_EQUAL_GROUPS",
        "offs": None,
        "parity": None,
        "maxAbsError": None,
        "meanMs": None,
        "error": None,
        "reasonCodes": [],
    }

    if not topology["groupedGemmEligibleByTopology"]:
        grouped_receipt["reasonCodes"].append("BLOCKED_NO_EXPLICIT_MODEL_MOE")
    elif device.type != "cuda":
        grouped_receipt["reasonCodes"].append("BLOCKED_CUDA_UNAVAILABLE")
    elif not sm80_or_newer:
        grouped_receipt["reasonCodes"].append("BLOCKED_COMPUTE_CAPABILITY_LT_SM80")
    elif not hasattr(F, "grouped_mm"):
        grouped_receipt["reasonCodes"].append("BLOCKED_GROUPED_MM_API_UNAVAILABLE")
    elif payload.get("skipGroupedMm") is True:
        grouped_receipt["reasonCodes"].append("SKIPPED_BY_REQUEST")
    else:
        grouped_receipt["attempted"] = True
        try:
            experts = int(topology["expertCount"])
            tokens = max(1, min(int(payload.get("tokensPerExpert", 8)), 128))
            k_dim = max(16, min(int(payload.get("groupedK", 128)), 1024))
            n_dim = max(16, min(int(payload.get("groupedN", 128)), 1024))
            a = torch.randn((experts, tokens, k_dim), device=device, dtype=torch.bfloat16)
            b = torch.randn((experts, k_dim, n_dim), device=device, dtype=torch.bfloat16)
            reference = torch.bmm(a, b)

            def grouped_run():
                return F.grouped_mm(a, b, offs=None)

            grouped_out, grouped_ms = benchmark(grouped_run)
            max_error = float((grouped_out.float() - reference.float()).abs().max().detach().cpu())
            grouped_receipt.update({
                "parity": bool(torch.allclose(grouped_out.float(), reference.float(), rtol=5e-2, atol=5e-2)),
                "maxAbsError": max_error,
                "meanMs": grouped_ms,
                "shapeA": list(a.shape),
                "shapeB": list(b.shape),
            })
            grouped_receipt["reasonCodes"].append("EXPLICIT_MOE_GROUPED_GEMM_PRIMITIVE_PROBED")
        except Exception as exc:
            grouped_receipt["error"] = f"{type(exc).__name__}: {exc}"
            grouped_receipt["reasonCodes"].append("GROUPED_MM_RUNTIME_FAILED")

    receipt = {
        "schema": "atlas.compile-triton-probe.v1",
        "seed": seed,
        "torchVersion": torch.__version__,
        "device": str(device),
        "cudaAvailable": bool(torch.cuda.is_available()),
        "cudaVersion": getattr(torch.version, "cuda", None),
        "computeCapability": list(capability) if capability else None,
        "candidateCount": candidate_count,
        "dimension": dimension,
        "topK": topk,
        "eager": {
            "meanMs": eager_ms,
            "topIndicesChecksum": __import__("hashlib").sha256(eager_indices.detach().cpu().numpy().tobytes()).hexdigest(),
        },
        "torchCompile": compile_receipt,
        "triton": triton_receipt,
        "groupedMm": grouped_receipt,
        "canonicalWrites": False,
        "onlineTrainingAllowed": False,
    }
    print(canonical_json(receipt))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
