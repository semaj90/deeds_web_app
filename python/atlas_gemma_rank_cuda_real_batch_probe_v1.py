"""Read-only real-token CUDA BF16 batch probe for AtlasGemmaRank."""

from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path
import time

import torch
from transformers import PreTrainedTokenizerFast

from atlas_gemma_rank_breadth_50_v1 import QUERIES
from atlas_gemma_rank_cuda_forward_probe_v1 import build_model, file_checksum


def run(checkpoint_dir: Path, *, batch_size: int, max_length: int, repeats: int) -> dict[str, object]:
    tokenizer = PreTrainedTokenizerFast(tokenizer_file=str(checkpoint_dir / "tokenizer.json"))
    texts = QUERIES[:batch_size]
    encoded = tokenizer(texts, padding=False, truncation=True, max_length=max_length)["input_ids"]
    padded_length = max(len(row) for row in encoded)
    input_ids = torch.tensor(
        [row + [0] * (padded_length - len(row)) for row in encoded],
        dtype=torch.long,
    )
    attention_mask = torch.tensor(
        [[1] * len(row) + [0] * (padded_length - len(row)) for row in encoded],
        dtype=torch.long,
    )

    before = file_checksum(checkpoint_dir / "model.safetensors")
    cpu_model, cpu_head, inventory = build_model(checkpoint_dir, seed=17)
    gpu_model = copy.deepcopy(cpu_model).to(device="cuda")
    gpu_head = copy.deepcopy(cpu_head).to(device="cuda")

    def score(model: torch.nn.Module, head: torch.nn.Module, ids: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
        with torch.inference_mode():
            hidden = model.model(input_ids=ids, attention_mask=mask).last_hidden_state
            last_indices = mask.sum(dim=1).to(dtype=torch.long) - 1
            return head(hidden[torch.arange(ids.shape[0]), last_indices])

    cpu_times: list[float] = []
    cpu_output = None
    for _ in range(repeats):
        started = time.perf_counter()
        cpu_output = score(cpu_model, cpu_head, input_ids, attention_mask)
        cpu_times.append((time.perf_counter() - started) * 1000)
    assert cpu_output is not None
    cpu_repeat = score(cpu_model, cpu_head, input_ids, attention_mask)

    gpu_ids = input_ids.to(device="cuda")
    gpu_mask = attention_mask.to(device="cuda")
    score(gpu_model, gpu_head, gpu_ids, gpu_mask)
    torch.cuda.synchronize()
    gpu_times: list[float] = []
    gpu_output = None
    for _ in range(repeats):
        torch.cuda.synchronize()
        started = time.perf_counter()
        gpu_output = score(gpu_model, gpu_head, gpu_ids, gpu_mask)
        torch.cuda.synchronize()
        gpu_times.append((time.perf_counter() - started) * 1000)
    assert gpu_output is not None
    gpu_repeat = score(gpu_model, gpu_head, gpu_ids, gpu_mask)
    torch.cuda.synchronize()

    cpu_float = cpu_output.float()
    gpu_float = gpu_output.detach().cpu().float()
    delta = (cpu_float - gpu_float).abs()
    relative = delta / cpu_float.abs().clamp_min(1e-6)
    cpu_order = torch.argsort(cpu_float.flatten(), descending=True)
    gpu_order = torch.argsort(gpu_float.flatten(), descending=True)
    before_after_same = before == file_checksum(checkpoint_dir / "model.safetensors")
    result: dict[str, object] = {
        "schema": "atlas.gemma-rank-cuda-real-batch-probe.v1",
        "status": "CUDA_REAL_BATCH_FORWARD_ORDER_PROVEN_PARITY_OPEN" if (
            len(inventory["loaded"]) == 46
            and len(inventory["initialized"]) == 12
            and not inventory["shapeMismatches"]
            and bool(torch.isfinite(cpu_output).all().item())
            and bool(torch.isfinite(gpu_output).all().item())
            and bool(torch.equal(cpu_output, cpu_repeat))
            and bool(torch.equal(gpu_output, gpu_repeat))
            and bool(torch.equal(cpu_order, gpu_order))
            and before_after_same
        ) else "BLOCKED_CUDA_REAL_BATCH_FORWARD",
        "checkpointDir": str(checkpoint_dir),
        "hardware": {
            "gpu": torch.cuda.get_device_name(0),
            "computeCapability": list(torch.cuda.get_device_capability(0)),
            "torch": torch.__version__,
            "torchCuda": torch.version.cuda,
        },
        "fixture": {
            "batchSize": len(texts),
            "maxLength": max_length,
            "paddedTokenCount": padded_length,
            "tokenCounts": [len(row) for row in encoded],
            "cpuFinite": bool(torch.isfinite(cpu_output).all().item()),
            "gpuFinite": bool(torch.isfinite(gpu_output).all().item()),
            "cpuRepeatExact": bool(torch.equal(cpu_output, cpu_repeat)),
            "gpuRepeatExact": bool(torch.equal(gpu_output, gpu_repeat)),
            "rankingOrderAgreement": bool(torch.equal(cpu_order, gpu_order)),
            "cpuScores": cpu_float.tolist(),
            "gpuScores": gpu_float.tolist(),
            "maxAbsoluteDelta": float(delta.max().item()),
            "maxRelativeDelta": float(relative.max().item()),
        },
        "timing": {
            "repeats": repeats,
            "cpuMs": cpu_times,
            "gpuMs": gpu_times,
            "cpuMeanMs": sum(cpu_times) / len(cpu_times),
            "gpuMeanMs": sum(gpu_times) / len(gpu_times),
        },
        "cudaPeakMiB": round(torch.cuda.max_memory_allocated() / 1024 / 1024, 3),
        "checkpointMutated": not before_after_same,
        "trainingPerformed": False,
        "rankingQualityProven": False,
        "canonicalAuthority": False,
    }
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint-dir", type=Path, required=True)
    parser.add_argument("--batch-size", type=int, default=12)
    parser.add_argument("--max-length", type=int, default=128)
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = run(args.checkpoint_dir, batch_size=args.batch_size, max_length=args.max_length, repeats=args.repeats)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "schema": result["schema"],
        "status": result["status"],
        "batchSize": result["fixture"]["batchSize"],
        "paddedTokenCount": result["fixture"]["paddedTokenCount"],
        "cpuMeanMs": result["timing"]["cpuMeanMs"],
        "gpuMeanMs": result["timing"]["gpuMeanMs"],
        "maxAbsoluteDelta": result["fixture"]["maxAbsoluteDelta"],
        "rankingOrderAgreement": result["fixture"]["rankingOrderAgreement"],
        "output": str(args.output),
    }, sort_keys=True))
    return 0 if result["status"] == "CUDA_REAL_BATCH_FORWARD_ORDER_PROVEN_PARITY_OPEN" else 1


if __name__ == "__main__":
    raise SystemExit(main())
