"""Read-only GPU FP16-versus-FP32 control for the AtlasGemmaRank seed."""

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

    seed_model, seed_head, _ = build_model(checkpoint_dir, seed=17)
    fp32_model = copy.deepcopy(seed_model).float().cuda().eval()
    fp32_head = copy.deepcopy(seed_head).float().cuda().eval()
    fp16_model = copy.deepcopy(fp32_model).half().eval()
    fp16_head = copy.deepcopy(fp32_head).half().eval()

    torch.cuda.reset_peak_memory_stats()
    observations: list[dict[str, object]] = []
    for index, row in enumerate(token_rows):
        ids = torch.tensor([row], dtype=torch.long, device="cuda")
        fp32_score = score(fp32_model, fp32_head, ids).float()
        fp16_score = score(fp16_model, fp16_head, ids).float()
        fp16_repeat = score(fp16_model, fp16_head, ids).float()
        torch.cuda.synchronize()
        delta = (fp16_score - fp32_score).abs()
        repeat_delta = (fp16_score - fp16_repeat).abs()
        observations.append({
            "index": index,
            "tokenCount": len(row),
            "fp32Gpu": float(fp32_score.item()),
            "fp16Gpu": float(fp16_score.item()),
            "fp16VsFp32AbsoluteDelta": float(delta.item()),
            "fp16RepeatAbsoluteDelta": float(repeat_delta.item()),
        })

    fp32_scores = torch.tensor([row["fp32Gpu"] for row in observations])
    fp16_scores = torch.tensor([row["fp16Gpu"] for row in observations])
    after = file_checksum(checkpoint_dir / "model.safetensors")
    all_values = [
        row["fp32Gpu"] for row in observations
    ] + [row["fp16Gpu"] for row in observations]
    return {
        "schema": "atlas.gemma-rank-cuda-fp16-control.v1",
        "status": "FP16_GPU_CONTROL_FINITE_ORDER_PROVEN_PARITY_OPEN" if (
            all(torch.isfinite(torch.tensor(value)) for value in all_values)
            and all(row["fp16RepeatAbsoluteDelta"] == 0.0 for row in observations)
            and before == after
        ) else "BLOCKED_FP16_GPU_CONTROL",
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
            "fp16GpuVsFp32MaxAbsoluteDelta": max(row["fp16VsFp32AbsoluteDelta"] for row in observations),
            "fp16OrderAgreement": bool(torch.equal(
                torch.argsort(fp32_scores, descending=True),
                torch.argsort(fp16_scores, descending=True),
            )),
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
        "fp16GpuVsFp32MaxAbsoluteDelta": result["fixture"]["fp16GpuVsFp32MaxAbsoluteDelta"],
        "fp16OrderAgreement": result["fixture"]["fp16OrderAgreement"],
        "output": str(args.output),
    }, sort_keys=True))
    return 0 if result["status"] == "FP16_GPU_CONTROL_FINITE_ORDER_PROVEN_PARITY_OPEN" else 1


if __name__ == "__main__":
    raise SystemExit(main())
