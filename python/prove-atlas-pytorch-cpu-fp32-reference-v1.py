"""Read-only PyTorch CPU FP32 numerical reference for the bounded Atlas ranker.

This is an executor/reference receipt only. It initializes missing derived
attention tensors in memory, never writes model weights, and does not claim
ranking quality, source authority, or production promotion.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any

import torch
from safetensors import safe_open
from transformers import Gemma4ForCausalLM

from atlas_gemma_rank_load_init_proof_v1 import checksum, derived_text_config, file_checksum, initialize_parameter


SCHEMA = "atlas.pytorch-cpu-fp32-reference.v1"
NEW_SUFFIXES = (".self_attn.k_proj.weight", ".self_attn.v_proj.weight", ".self_attn.k_norm.weight")


def prove(checkpoint_dir: Path, *, seed: int = 17) -> dict[str, Any]:
    config_path = checkpoint_dir / "config.json"
    weights_path = checkpoint_dir / "model.safetensors"
    if not config_path.is_file() or not weights_path.is_file():
        raise FileNotFoundError(checkpoint_dir)

    upstream = json.loads(config_path.read_text(encoding="utf-8"))
    source_checksum_before = file_checksum(weights_path)
    config = derived_text_config(upstream)
    torch.manual_seed(seed)
    model = Gemma4ForCausalLM(config)
    if hasattr(model, "lm_head"):
        del model.lm_head
    model = model.to(dtype=torch.float32, device="cpu").eval()
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
                shape_mismatches.append({"tensor": name, "checkpoint": list(source.shape), "model": list(target.shape)})
                continue
            with torch.no_grad():
                target.copy_(source.to(dtype=torch.float32, device="cpu"))
            loaded.append(name)

    new_attention = sorted(name for name in state if name.endswith(NEW_SUFFIXES))
    initialized: list[dict[str, Any]] = []
    for name in new_attention:
        initializer = initialize_parameter(name, state[name])
        initialized.append({"tensor": name, "shape": list(state[name].shape), "initializer": initializer,
                            "finite": bool(torch.isfinite(state[name]).all().item())})

    rank_head = torch.nn.Linear(config.hidden_size, 1, bias=True, dtype=torch.float32).eval()
    with torch.no_grad():
        torch.nn.init.xavier_uniform_(rank_head.weight)
        rank_head.bias.zero_()
    input_ids = torch.tensor([[2, 100, 101, 102, 1]], dtype=torch.long, device="cpu")
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
    repeat_exact = bool(torch.equal(hidden, repeat_hidden) and torch.equal(score, repeat_score))
    inherited = sorted(name for name in loaded if not name.endswith(NEW_SUFFIXES))
    status = ("PYTORCH_CPU_FP32_REFERENCE_PROVEN"
              if len(inherited) == 46 and len(new_attention) == 12 and len(initialized) == 12
              and not shape_mismatches and finite and repeat_exact and source_checksum_before == source_checksum_after
              else "BLOCKED_PYTORCH_CPU_FP32_REFERENCE")
    result: dict[str, Any] = {
        "schema": SCHEMA,
        "status": status,
        "executor": "PYTORCH_CPU",
        "device": "cpu",
        "dtype": "float32",
        "component": "atlas_gemma_rank_v1_bounded_reference",
        "checkpointDir": str(checkpoint_dir),
        "modelRevision": source_checksum_before,
        "derivedConfig": {"hiddenSize": config.hidden_size, "numHiddenLayers": config.num_hidden_layers,
                           "numAttentionHeads": config.num_attention_heads, "numKeyValueHeads": config.num_key_value_heads},
        "checkpointTensorCount": len(checkpoint_names),
        "loadedInheritedTensorCount": len(inherited),
        "initializedDerivedTensorCount": len(initialized),
        "shapeMismatches": shape_mismatches,
        "checkpointOnlyTensorCount": len(checkpoint_only),
        "inputChecksum": checksum({"inputIds": input_ids.tolist(), "attentionMask": attention_mask.tolist()}),
        "outputChecksum": checksum({"hidden": hidden.detach().cpu().tolist(), "score": score.detach().cpu().tolist()}),
        "outputShape": {"hidden": list(hidden.shape), "score": list(score.shape)},
        "finite": finite,
        "repeatExact": repeat_exact,
        "referenceAuthority": True,
        "canonicalAuthority": False,
        "writesPerformed": False,
        "trainingPerformed": False,
        "checkpointMutated": source_checksum_before != source_checksum_after,
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
    receipt = prove(args.checkpoint_dir, seed=args.seed)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"schema": receipt["schema"], "status": receipt["status"], "dtype": receipt["dtype"],
                      "outputChecksum": receipt["outputChecksum"], "repeatExact": receipt["repeatExact"],
                      "writesPerformed": False, "output": str(args.output)}, sort_keys=True))
    return 0 if receipt["status"] == "PYTORCH_CPU_FP32_REFERENCE_PROVEN" else 1


if __name__ == "__main__":
    raise SystemExit(main())
