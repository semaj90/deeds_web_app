"""Read-only CUDA BF16 forward/parity probe for the AtlasGemmaRank seed."""

from __future__ import annotations

import argparse
from contextlib import nullcontext
import copy
from datetime import datetime, timezone
import json
from pathlib import Path
import time
from typing import Any

import torch
from safetensors import safe_open
from transformers import Gemma4ForCausalLM
from torch.nn.attention import SDPBackend, sdpa_kernel

from atlas_gemma_rank_load_init_proof_v1 import (
    checksum,
    derived_text_config,
    file_checksum,
    initialize_parameter,
)


NEW_SUFFIXES = (
    ".self_attn.k_proj.weight",
    ".self_attn.v_proj.weight",
    ".self_attn.k_norm.weight",
)


def build_model(checkpoint_dir: Path, *, seed: int) -> tuple[torch.nn.Module, torch.nn.Module, dict[str, Any]]:
    raw = json.loads((checkpoint_dir / "config.json").read_text(encoding="utf-8"))
    config = derived_text_config(raw)
    torch.manual_seed(seed)
    model = Gemma4ForCausalLM(config)
    if hasattr(model, "lm_head"):
        del model.lm_head
    model = model.to(dtype=torch.bfloat16).eval()

    loaded: list[str] = []
    shape_mismatches: list[dict[str, Any]] = []
    state = model.state_dict()
    with safe_open(str(checkpoint_dir / "model.safetensors"), framework="pt", device="cpu") as handle:
        for name in sorted(handle.keys()):
            if name not in state:
                continue
            source = handle.get_tensor(name)
            target = state[name]
            if list(source.shape) != list(target.shape):
                shape_mismatches.append({
                    "tensor": name,
                    "checkpoint": list(source.shape),
                    "model": list(target.shape),
                })
                continue
            with torch.no_grad():
                target.copy_(source.to(dtype=target.dtype))
            loaded.append(name)

    initialized: list[str] = []
    for name, parameter in state.items():
        if name.endswith(NEW_SUFFIXES):
            initialize_parameter(name, parameter)
            initialized.append(name)

    rank_head = torch.nn.Linear(config.hidden_size, 1, bias=True, dtype=torch.bfloat16).eval()
    with torch.no_grad():
        torch.nn.init.xavier_uniform_(rank_head.weight)
        rank_head.bias.zero_()

    return model, rank_head, {
        "config": config,
        "loaded": loaded,
        "initialized": initialized,
        "shapeMismatches": shape_mismatches,
    }


def forward(model: torch.nn.Module, rank_head: torch.nn.Module, input_ids: torch.Tensor) -> torch.Tensor:
    mask = torch.ones_like(input_ids)
    with torch.inference_mode():
        hidden = model.model(input_ids=input_ids, attention_mask=mask).last_hidden_state
        return rank_head(hidden[:, -1, :])


def timed_forward(model: torch.nn.Module, rank_head: torch.nn.Module, input_ids: torch.Tensor,
                  *, repeats: int, device: str) -> tuple[torch.Tensor, list[float]]:
    if device == "cuda":
        forward(model, rank_head, input_ids)
        torch.cuda.synchronize()
    timings: list[float] = []
    output = None
    for _ in range(repeats):
        if device == "cuda":
            torch.cuda.synchronize()
        started = time.perf_counter()
        output = forward(model, rank_head, input_ids)
        if device == "cuda":
            torch.cuda.synchronize()
        timings.append((time.perf_counter() - started) * 1000)
    assert output is not None
    return output, timings


def run(checkpoint_dir: Path, *, seed: int = 17, repeats: int = 3,
        attention_backend: str = "auto") -> dict[str, Any]:
    if attention_backend not in ("auto", "math"):
        raise ValueError(f"ATTENTION_BACKEND_UNSUPPORTED:{attention_backend}")
    if not torch.cuda.is_available():
        raise SystemExit("CUDA_UNAVAILABLE")
    weights_path = checkpoint_dir / "model.safetensors"
    before = file_checksum(weights_path)
    cpu_model, cpu_head, inventory = build_model(checkpoint_dir, seed=seed)
    gpu_model = copy.deepcopy(cpu_model).to(device="cuda")
    gpu_head = copy.deepcopy(cpu_head).to(device="cuda")
    input_ids = torch.tensor([
        [2, 100, 101, 102, 1],
        [2, 103, 104, 105, 1],
        [2, 106, 107, 108, 1],
    ], dtype=torch.long)
    cpu_input = input_ids.to(device="cpu")
    gpu_input = input_ids.to(device="cuda")

    # 'math' pins PyTorch's SDPA to the reference math kernel -- a
    # reproducibility oracle, not the eventual performance mode. 'auto'
    # (default, preserves every prior receipt's behavior unchanged) leaves
    # kernel selection to PyTorch, which may pick a fused implementation
    # whose output can differ slightly by backend.
    backend_ctx = sdpa_kernel(backends=[SDPBackend.MATH]) if attention_backend == "math" else nullcontext()
    with backend_ctx:
        cpu_output, cpu_ms = timed_forward(cpu_model, cpu_head, cpu_input, repeats=repeats, device="cpu")
        torch.cuda.reset_peak_memory_stats()
        gpu_output, gpu_ms = timed_forward(gpu_model, gpu_head, gpu_input, repeats=repeats, device="cuda")
        torch.cuda.synchronize()
        cpu_repeat = forward(cpu_model, cpu_head, cpu_input)
        gpu_repeat = forward(gpu_model, gpu_head, gpu_input)
        torch.cuda.synchronize()

    cpu_float = cpu_output.float()
    gpu_float = gpu_output.detach().cpu().float()
    delta = (cpu_float - gpu_float).abs()
    absolute_delta = float(delta.max().item())
    relative_delta = float((delta / cpu_float.abs().clamp_min(1e-6)).max().item())
    cpu_bf16 = cpu_output.detach().to(dtype=torch.bfloat16)
    upward = torch.nextafter(cpu_bf16, torch.full_like(cpu_bf16, float("inf")))
    downward = torch.nextafter(cpu_bf16, torch.full_like(cpu_bf16, float("-inf")))
    ulp = torch.maximum((upward - cpu_bf16).abs(), (cpu_bf16 - downward).abs()).float()
    allowed_delta = (ulp * 4.0).clamp_min(0.0625)
    bf16_ulp_parity = bool(torch.all(delta <= allowed_delta + 1e-6).item())
    cpu_repeat_exact = bool(torch.equal(cpu_output, cpu_repeat))
    gpu_repeat_exact = bool(torch.equal(gpu_output, gpu_repeat))
    cpu_order = torch.argsort(cpu_output.flatten(), descending=True)
    gpu_order = torch.argsort(gpu_output.flatten(), descending=True)
    order_agreement = bool(torch.equal(cpu_order, gpu_order.cpu()))
    after = file_checksum(weights_path)
    config = inventory["config"]
    result: dict[str, Any] = {
        "schema": "atlas.gemma-rank-cuda-forward-probe.v1",
        "status": "CUDA_BF16_FORWARD_FINITE_ORDER_PROVEN_PARITY_OPEN" if (
            not inventory["shapeMismatches"]
            and len(inventory["loaded"]) == 46
            and len(inventory["initialized"]) == 12
            and bool(torch.isfinite(cpu_output).all().item())
            and bool(torch.isfinite(gpu_output).all().item())
            and cpu_repeat_exact
            and gpu_repeat_exact
            and order_agreement
        ) else "BLOCKED_CUDA_BF16_FORWARD_PARITY",
        "checkpointDir": str(checkpoint_dir),
        "runtimeClass": "Gemma4ForCausalLM.text_backbone",
        "derivedConfig": {
            "hiddenSize": config.hidden_size,
            "numHiddenLayers": config.num_hidden_layers,
            "numAttentionHeads": config.num_attention_heads,
            "numKeyValueHeads": config.num_key_value_heads,
            "numKvSharedLayers": config.num_kv_shared_layers,
            "useBidirectionalAttention": config.use_bidirectional_attention,
            "dtype": "bfloat16",
        },
        "hardware": {
            "gpu": torch.cuda.get_device_name(0),
            "computeCapability": list(torch.cuda.get_device_capability(0)),
            "torch": torch.__version__,
            "torchCuda": torch.version.cuda,
        },
        "inventory": {
            "loadedInheritedTensorCount": len(inventory["loaded"]),
            "initializedStandaloneAttentionTensorCount": len(inventory["initialized"]),
            "shapeMismatches": inventory["shapeMismatches"],
        },
        "fixture": {
            "inputIds": input_ids.tolist(),
            "outputShape": list(gpu_output.shape),
            "cpuFinite": bool(torch.isfinite(cpu_output).all().item()),
            "gpuFinite": bool(torch.isfinite(gpu_output).all().item()),
            "cpuScore": cpu_output.detach().float().tolist(),
            "gpuScore": gpu_output.detach().float().cpu().tolist(),
            "absoluteMaxDelta": absolute_delta,
            "relativeMaxDelta": relative_delta,
            "bf16UlpParity": bf16_ulp_parity,
            "bf16MaxAllowedDelta": float(allowed_delta.max().item()),
            "cpuRepeatExact": cpu_repeat_exact,
            "gpuRepeatExact": gpu_repeat_exact,
            "rankingOrderAgreement": order_agreement,
            "numericalParityProven": bf16_ulp_parity,
        },
        "timing": {
            "repeats": repeats,
            "cpuMs": cpu_ms,
            "gpuMs": gpu_ms,
            "cpuMeanMs": sum(cpu_ms) / len(cpu_ms),
            "gpuMeanMs": sum(gpu_ms) / len(gpu_ms),
        },
        "cudaPeakMiB": round(torch.cuda.max_memory_allocated() / 1024 / 1024, 3),
        "sourceWeightsChecksumBefore": before,
        "sourceWeightsChecksumAfter": after,
        "checkpointMutated": before != after,
        "trainingPerformed": False,
        "rankingQualityProven": False,
        "canonicalAuthority": False,
        "attentionBackend": attention_backend,
        "observedAt": datetime.now(timezone.utc).isoformat(),
    }
    result["receiptChecksum"] = checksum(result)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=17)
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--attention-backend", choices=["auto", "math"], default="auto")
    args = parser.parse_args()
    result = run(args.checkpoint_dir, seed=args.seed, repeats=args.repeats,
                 attention_backend=args.attention_backend)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "schema": result["schema"],
        "status": result["status"],
        "cpuMeanMs": result["timing"]["cpuMeanMs"],
        "gpuMeanMs": result["timing"]["gpuMeanMs"],
        "absoluteMaxDelta": result["fixture"]["absoluteMaxDelta"],
        "bf16UlpParity": result["fixture"]["bf16UlpParity"],
        "cudaPeakMiB": result["cudaPeakMiB"],
        "output": str(args.output),
    }, sort_keys=True))
    return 0 if result["status"] == "CUDA_BF16_FORWARD_FINITE_ORDER_PROVEN_PARITY_OPEN" else 1


if __name__ == "__main__":
    raise SystemExit(main())
