"""Read-only warm CPU batch benchmark for the AtlasGemmaRank seed.

This measures the current standalone-shape proof model with its untrained rank
head. It is a throughput/shape benchmark, not a relevance-quality comparison:
the Gemma rank head is intentionally untrained and no live service is called.
The mxbai timings are copied from the existing live fixture receipt so units
remain explicit (mxbai per-request GPU/HTTP versus Gemma in-process CPU batch).
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import torch
from safetensors import safe_open
from transformers import Gemma4ForCausalLM, Gemma4TextConfig, PreTrainedTokenizerFast

from atlas_gemma_rank_shadow_04_v1 import COHORT, WORKSPACE_REVISION, content_revision
from atlas_gemma_rank_load_init_proof_v1 import (
    checksum,
    derived_text_config,
    file_checksum,
    initialize_parameter,
)


SCHEMA = "atlas.gemma-rank-cpu-batch-benchmark.v1"
NEW_SUFFIXES = (".self_attn.k_proj.weight", ".self_attn.v_proj.weight", ".self_attn.k_norm.weight")


def load_config(raw: dict[str, Any]) -> Gemma4TextConfig:
    """Accept the upstream assistant config or an exported standalone config."""
    if raw.get("text_config"):
        return derived_text_config(raw)
    if raw.get("model_type") == "gemma4_text":
        return Gemma4TextConfig.from_dict(raw)
    raise ValueError("UNSUPPORTED_GEMMA_RANK_CONFIG")


def load_model(checkpoint_dir: Path) -> tuple[Gemma4ForCausalLM, PreTrainedTokenizerFast, str]:
    raw = json.loads((checkpoint_dir / "config.json").read_text(encoding="utf-8"))
    weights_path = checkpoint_dir / "model.safetensors"
    config = load_config(raw)
    model = Gemma4ForCausalLM(config)
    if hasattr(model, "lm_head"):
        del model.lm_head
    model = model.to(dtype=torch.bfloat16).eval()
    state = model.state_dict()
    with safe_open(str(weights_path), framework="pt", device="cpu") as handle:
        for name in sorted(handle.keys()):
            if name not in state or list(handle.get_tensor(name).shape) != list(state[name].shape):
                continue
            with torch.no_grad():
                state[name].copy_(handle.get_tensor(name).to(dtype=state[name].dtype))
    for name in [n for n in state if n.endswith(NEW_SUFFIXES)]:
        initialize_parameter(name, state[name])
    tokenizer = PreTrainedTokenizerFast(tokenizer_file=str(checkpoint_dir / "tokenizer.json"))
    return model, tokenizer, file_checksum(weights_path)


def run_benchmark(checkpoint_dir: Path, *, repeats: int = 3) -> dict[str, Any]:
    load_started = time.perf_counter()
    model, tokenizer, source_checksum = load_model(checkpoint_dir)
    load_ms = (time.perf_counter() - load_started) * 1000
    rank_head = torch.nn.Linear(model.config.hidden_size, 1, bias=True, dtype=torch.bfloat16).eval()
    with torch.no_grad():
        torch.nn.init.xavier_uniform_(rank_head.weight)
        rank_head.bias.zero_()

    rows: list[dict[str, Any]] = []
    all_texts: list[str] = []
    for item in COHORT:
        for candidate_id, text in item["candidates"]:
            all_texts.append(f"[QUERY]\n{item['query']}\n[DOCUMENT]\n{text}")
            rows.append({
                "query": item["query"],
                "canonicalId": candidate_id,
                "sourceRevision": content_revision(text),
                "workspaceRevision": WORKSPACE_REVISION,
            })

    # The upstream assistant tokenizer intentionally has no pad/eos special
    # token metadata. Build a masked batch explicitly so the benchmark does
    # not add a vocabulary row or mutate the tokenizer configuration.
    encoded_rows = tokenizer(all_texts, padding=False, truncation=True, max_length=512)["input_ids"]
    padded_length = max(len(row) for row in encoded_rows)
    input_ids = torch.tensor([row + [0] * (padded_length - len(row)) for row in encoded_rows], dtype=torch.long)
    attention_mask = torch.tensor(
        [[1] * len(row) + [0] * (padded_length - len(row)) for row in encoded_rows],
        dtype=torch.long,
    )
    last_indices = attention_mask.sum(dim=1) - 1
    batch_indices = torch.arange(len(all_texts))

    def rank_last(hidden: torch.Tensor) -> torch.Tensor:
        return rank_head(hidden[batch_indices, last_indices])

    with torch.inference_mode():
        _ = rank_last(model.model(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state)
    timings: list[float] = []
    finite = True
    for _ in range(max(1, repeats)):
        started = time.perf_counter()
        with torch.inference_mode():
            hidden = model.model(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
            scores = rank_last(hidden)
        timings.append((time.perf_counter() - started) * 1000)
        finite = finite and bool(torch.isfinite(hidden).all().item() and torch.isfinite(scores).all().item())

    mxbai_receipt = Path(__file__).parents[1] / "docs" / "reports" / "rerank-shadow-01-live-fixture-v1.json"
    mxbai = json.loads(mxbai_receipt.read_text(encoding="utf-8"))
    mxbai_latencies = [float(row["latencyMs"]) for row in mxbai["detail"]["mxbai"]]
    ordered_timings = sorted(timings)

    def percentile(percent: float) -> float:
        index = min(len(ordered_timings) - 1, max(0, int((percent / 100) * len(ordered_timings) + 0.999999) - 1))
        return ordered_timings[index]

    result: dict[str, Any] = {
        "schema": SCHEMA,
        "status": "CPU_BATCH_SHAPE_FINITE_PROVEN" if finite and source_checksum == file_checksum(checkpoint_dir / "model.safetensors") else "BLOCKED",
        "checkpointDir": str(checkpoint_dir),
        "batchSize": len(all_texts),
        "inputFormat": "[QUERY] query [DOCUMENT] candidate; candidate identity remains outside model text",
        "repeatCount": max(1, repeats),
        "tokenizerPadding": "explicit_id_0_masked_no_tokenizer_mutation",
        "maxLength": 512,
        "paddedTokenCount": int(input_ids.shape[1]),
        "rankHeadTrained": False,
        "rankingQualityProven": False,
        "cudaAllocated": False,
        "executionDevice": "cpu",
        "cpuFallback": False,
        "gpuProbePerformed": False,
        "peakVramMiB": None,
        "trainingPerformed": False,
        "checkpointMutated": source_checksum != file_checksum(checkpoint_dir / "model.safetensors"),
        "allFinite": finite,
        "modelLoadMs": round(load_ms, 3),
        "forwardBatchLatencyMs": {
            "min": round(min(timings), 3),
            "max": round(max(timings), 3),
            "mean": round(sum(timings) / len(timings), 3),
            "p50": round(percentile(50), 3),
            "p95": round(percentile(95), 3),
            "perCandidateMean": round(sum(timings) / len(timings) / len(all_texts), 3),
        },
        "mxbaiLiveFixturePerRequestLatencyMs": {
            "min": round(min(mxbai_latencies), 3),
            "max": round(max(mxbai_latencies), 3),
            "mean": round(sum(mxbai_latencies) / len(mxbai_latencies), 3),
            "unit": "one HTTP request containing five candidates; CUDA sidecar",
        },
        "comparisonLimits": [
            "Gemma values are an untrained structural seed and cannot be compared for ranking quality.",
            "Gemma timings are in-process CPU batch forward only; model load is reported separately.",
            "mxbai timings are existing live HTTP+GPU per-request timings, not a CPU/GPU kernel benchmark.",
            "No AtlasGemma ONNX/WebGPU artifact exists yet, so no WebGPU timing is reported.",
        ],
        "rows": rows,
        "sourceWeightsChecksum": source_checksum,
        "observedAt": datetime.now(timezone.utc).isoformat(),
    }
    result["receiptChecksum"] = checksum(result)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--repeats", type=int, default=3)
    args = parser.parse_args()
    result = run_benchmark(args.checkpoint_dir, repeats=args.repeats)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k not in {"rows"}}, indent=2))
    return 0 if result["status"] == "CPU_BATCH_SHAPE_FINITE_PROVEN" else 1


if __name__ == "__main__":
    raise SystemExit(main())
