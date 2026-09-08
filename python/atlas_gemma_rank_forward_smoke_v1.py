"""Bounded forward-shape smoke for the initialized AtlasGemmaRank seed.

This loads the exact inherited tensors and initializes the derived attention
tensors in memory, then runs one synthetic token sequence through the text
backbone and scalar rank head. It does not train, write a model artifact, or
claim ranking quality.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from typing import Any

import torch
from safetensors import safe_open
from transformers import Gemma4ForCausalLM, Gemma4TextConfig

from atlas_gemma_rank_load_init_proof_v1 import checksum, derived_text_config, file_checksum, initialize_parameter


SCHEMA = "atlas.gemma-rank-forward-smoke.v1"
NEW_SUFFIXES = (
    ".self_attn.k_proj.weight",
    ".self_attn.v_proj.weight",
    ".self_attn.k_norm.weight",
)


def inspect(checkpoint_dir: Path, *, seed: int = 17) -> dict[str, Any]:
    config_path = checkpoint_dir / "config.json"
    weights_path = checkpoint_dir / "model.safetensors"
    if not config_path.is_file() or not weights_path.is_file():
        raise FileNotFoundError(checkpoint_dir)

    raw = json.loads(config_path.read_text(encoding="utf-8"))
    source_checksum_before = file_checksum(weights_path)
    config: Gemma4TextConfig = derived_text_config(raw)
    torch.manual_seed(seed)
    model = Gemma4ForCausalLM(config)
    if hasattr(model, "lm_head"):
        del model.lm_head
    model = model.to(dtype=torch.bfloat16).eval()
    state = model.state_dict()

    loaded: list[str] = []
    shape_mismatches: list[dict[str, Any]] = []
    checkpoint_only: list[str] = []
    with safe_open(str(weights_path), framework="pt", device="cpu") as handle:
        checkpoint_names = sorted(handle.keys())
        for name in checkpoint_names:
            if name not in state:
                checkpoint_only.append(name)
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

    new_attention = sorted(name for name in state if name.endswith(NEW_SUFFIXES))
    initialized: list[dict[str, Any]] = []
    for name in new_attention:
        initializer = initialize_parameter(name, state[name])
        initialized.append({
            "tensor": name,
            "shape": list(state[name].shape),
            "initializer": initializer,
            "finite": bool(torch.isfinite(state[name]).all().item()),
        })

    rank_head = torch.nn.Linear(config.hidden_size, 1, bias=True, dtype=torch.bfloat16).eval()
    with torch.no_grad():
        torch.nn.init.xavier_uniform_(rank_head.weight)
        rank_head.bias.zero_()

    input_ids = torch.tensor([[2, 100, 101, 102, 1]], dtype=torch.long)
    attention_mask = torch.ones_like(input_ids)
    with torch.inference_mode():
        output = model.model(input_ids=input_ids, attention_mask=attention_mask)
        hidden = output.last_hidden_state
        score = rank_head(hidden[:, -1, :])
        repeat_output = model.model(input_ids=input_ids, attention_mask=attention_mask)
        repeat_hidden = repeat_output.last_hidden_state
        repeat_score = rank_head(repeat_hidden[:, -1, :])

    source_checksum_after = file_checksum(weights_path)
    finite = bool(torch.isfinite(hidden).all().item() and torch.isfinite(score).all().item())
    repeat_forward_exact = bool(torch.equal(hidden, repeat_hidden) and torch.equal(score, repeat_score))
    inherited = sorted(name for name in loaded if not name.endswith(NEW_SUFFIXES))
    status = (
        "FORWARD_SHAPE_FINITE_PROVEN"
        if len(inherited) == 46
        and len(new_attention) == 12
        and len(initialized) == 12
        and not shape_mismatches
        and finite
        and repeat_forward_exact
        and source_checksum_before == source_checksum_after
        else "BLOCKED_FORWARD_SMOKE"
    )
    result = {
        "schema": SCHEMA,
        "status": status,
        "checkpointDir": str(checkpoint_dir),
        "runtimeClass": "Gemma4ForCausalLM.text_backbone",
        "derivedConfig": {
            "hiddenSize": config.hidden_size,
            "numHiddenLayers": config.num_hidden_layers,
            "numAttentionHeads": config.num_attention_heads,
            "numKeyValueHeads": config.num_key_value_heads,
            "numKvSharedLayers": config.num_kv_shared_layers,
            "useBidirectionalAttention": config.use_bidirectional_attention,
            "useCache": config.use_cache,
            "dtype": "bfloat16",
        },
        "checkpointTensorCount": len(checkpoint_names),
        "loadedInheritedTensorCount": len(inherited),
        "initializedStandaloneAttentionTensorCount": len(initialized),
        "checkpointOnlyTensorNames": checkpoint_only,
        "shapeMismatches": shape_mismatches,
        "fixture": {
            "synthetic": True,
            "inputIds": input_ids.tolist(),
            "attentionMask": attention_mask.tolist(),
            "hiddenShape": list(hidden.shape),
            "scoreShape": list(score.shape),
            "hiddenDtype": str(hidden.dtype),
            "scoreDtype": str(score.dtype),
            "hiddenFinite": bool(torch.isfinite(hidden).all().item()),
            "scoreFinite": bool(torch.isfinite(score).all().item()),
            "repeatForwardExact": repeat_forward_exact,
            "repeatHiddenShape": list(repeat_hidden.shape),
            "repeatScoreShape": list(repeat_score.shape),
        },
        "sourceWeightsChecksumBefore": source_checksum_before,
        "sourceWeightsChecksumAfter": source_checksum_after,
        "runtimeInstantiation": "IN_MEMORY_ONLY",
        "forwardExecuted": True,
        "deterministicCpuForwardProven": repeat_forward_exact,
        "rankingQualityProven": False,
        "trainingPerformed": False,
        "cudaAllocated": False,
        "checkpointMutated": source_checksum_before != source_checksum_after,
        "weightsMutated": False,
        "canonicalAuthority": False,
        "observedAt": datetime.now(timezone.utc).isoformat(),
    }
    result["receiptChecksum"] = checksum(result)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=17)
    args = parser.parse_args()
    receipt = inspect(args.checkpoint_dir, seed=args.seed)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "schema": receipt["schema"],
        "status": receipt["status"],
        "checkpointTensorCount": receipt["checkpointTensorCount"],
        "loadedInheritedTensorCount": receipt["loadedInheritedTensorCount"],
        "initializedStandaloneAttentionTensorCount": receipt["initializedStandaloneAttentionTensorCount"],
        "hiddenShape": receipt["fixture"]["hiddenShape"],
        "scoreShape": receipt["fixture"]["scoreShape"],
        "finite": receipt["fixture"]["hiddenFinite"] and receipt["fixture"]["scoreFinite"],
        "rankingQualityProven": receipt["rankingQualityProven"],
        "output": str(args.output),
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
