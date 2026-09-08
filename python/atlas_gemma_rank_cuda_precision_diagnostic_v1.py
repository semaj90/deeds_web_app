"""Read-only CPU/GPU precision diagnostic for the AtlasGemmaRank seed."""

from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path

import torch
from transformers import PreTrainedTokenizerFast

from atlas_gemma_rank_breadth_50_v1 import QUERIES
from atlas_gemma_rank_cuda_forward_probe_v1 import build_model, file_checksum


def score(model: torch.nn.Module, head: torch.nn.Module, ids: torch.Tensor) -> torch.Tensor:
    with torch.inference_mode():
        mask = torch.ones_like(ids)
        hidden = model.model(input_ids=ids, attention_mask=mask).last_hidden_state
        return head(hidden[:, -1, :])


def compare(checkpoint_dir: Path, *, batch_size: int, max_length: int) -> dict[str, object]:
    tokenizer = PreTrainedTokenizerFast(tokenizer_file=str(checkpoint_dir / "tokenizer.json"))
    texts = QUERIES[:batch_size]
    token_rows = [tokenizer(text, truncation=True, max_length=max_length)["input_ids"] for text in texts]
    before = file_checksum(checkpoint_dir / "model.safetensors")

    bf_cpu, bf_head_cpu, _ = build_model(checkpoint_dir, seed=17)
    bf_gpu = copy.deepcopy(bf_cpu).cuda()
    bf_head_gpu = copy.deepcopy(bf_head_cpu).cuda()
    fp_cpu = copy.deepcopy(bf_cpu).float()
    fp_head_cpu = copy.deepcopy(bf_head_cpu).float()
    fp_gpu = copy.deepcopy(fp_cpu).cuda()
    fp_head_gpu = copy.deepcopy(fp_head_cpu).cuda()

    observations: list[dict[str, object]] = []
    for index, row in enumerate(token_rows):
        ids_cpu = torch.tensor([row], dtype=torch.long)
        ids_gpu = ids_cpu.cuda()
        bf_cpu_score = score(bf_cpu, bf_head_cpu, ids_cpu).float()
        bf_gpu_score = score(bf_gpu, bf_head_gpu, ids_gpu).float().cpu()
        fp_cpu_score = score(fp_cpu, fp_head_cpu, ids_cpu).float()
        fp_gpu_score = score(fp_gpu, fp_head_gpu, ids_gpu).float().cpu()
        torch.cuda.synchronize()
        bf_delta = (bf_cpu_score - bf_gpu_score).abs()
        fp_delta = (fp_cpu_score - fp_gpu_score).abs()
        gpu_precision_delta = (bf_gpu_score - fp_gpu_score).abs()
        observations.append({
            "index": index,
            "tokenCount": len(row),
            "bf16Cpu": float(bf_cpu_score.item()),
            "bf16Gpu": float(bf_gpu_score.item()),
            "bf16AbsoluteDelta": float(bf_delta.item()),
            "fp32Cpu": float(fp_cpu_score.item()),
            "fp32Gpu": float(fp_gpu_score.item()),
            "fp32AbsoluteDelta": float(fp_delta.item()),
            "gpuBf16VsFp32AbsoluteDelta": float(gpu_precision_delta.item()),
        })

    bf16_cpu = torch.tensor([row["bf16Cpu"] for row in observations])
    bf16_gpu = torch.tensor([row["bf16Gpu"] for row in observations])
    fp32_cpu = torch.tensor([row["fp32Cpu"] for row in observations])
    fp32_gpu = torch.tensor([row["fp32Gpu"] for row in observations])
    after = file_checksum(checkpoint_dir / "model.safetensors")
    return {
        "schema": "atlas.gemma-rank-cuda-precision-diagnostic.v1",
        "status": "FP32_PARITY_PROVEN_BF16_DRIFT_ISOLATED" if (
            max(row["fp32AbsoluteDelta"] for row in observations) < 0.001
            and all(torch.isfinite(values).all().item() for values in (bf16_cpu, bf16_gpu, fp32_cpu, fp32_gpu))
            and before == after
        ) else "BLOCKED_PRECISION_DIAGNOSTIC",
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
            "observations": observations,
            "bf16MaxAbsoluteDelta": max(row["bf16AbsoluteDelta"] for row in observations),
            "fp32MaxAbsoluteDelta": max(row["fp32AbsoluteDelta"] for row in observations),
            "gpuBf16VsFp32MaxAbsoluteDelta": max(row["gpuBf16VsFp32AbsoluteDelta"] for row in observations),
            "bf16OrderAgreement": bool(torch.equal(torch.argsort(bf16_cpu, descending=True), torch.argsort(bf16_gpu, descending=True))),
            "fp32OrderAgreement": bool(torch.equal(torch.argsort(fp32_cpu, descending=True), torch.argsort(fp32_gpu, descending=True))),
        },
        "checkpointMutated": before != after,
        "trainingPerformed": False,
        "rankingQualityProven": False,
        "canonicalAuthority": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint-dir", type=Path, required=True)
    parser.add_argument("--batch-size", type=int, default=3)
    parser.add_argument("--max-length", type=int, default=128)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = compare(args.checkpoint_dir, batch_size=args.batch_size, max_length=args.max_length)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "schema": result["schema"],
        "status": result["status"],
        "bf16MaxAbsoluteDelta": result["fixture"]["bf16MaxAbsoluteDelta"],
        "fp32MaxAbsoluteDelta": result["fixture"]["fp32MaxAbsoluteDelta"],
        "gpuBf16VsFp32MaxAbsoluteDelta": result["fixture"]["gpuBf16VsFp32MaxAbsoluteDelta"],
        "bf16OrderAgreement": result["fixture"]["bf16OrderAgreement"],
        "fp32OrderAgreement": result["fixture"]["fp32OrderAgreement"],
        "output": str(args.output),
    }, sort_keys=True))
    return 0 if result["status"] == "FP32_PARITY_PROVEN_BF16_DRIFT_ISOLATED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
