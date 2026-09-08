"""Read-only in-memory load/init proof for the AtlasGemmaRank seed.

The proof uses the text-only Gemma 4 class, loads only exact inherited
checkpoint tensors, initializes the standalone K/V/KNorm tensors and a scalar
rank head in memory, and never writes the upstream checkpoint or a model
artifact. It deliberately does not execute a forward pass or training step.
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


SCHEMA = "atlas.gemma-rank-load-init-proof.v1"
NEW_SUFFIXES = (
    ".self_attn.k_proj.weight",
    ".self_attn.v_proj.weight",
    ".self_attn.k_norm.weight",
)


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def checksum(value: Any) -> str:
    return "sha256:" + hashlib.sha256(canonical_json(value)).hexdigest()


def file_checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return "sha256:" + digest.hexdigest()


def derived_text_config(upstream: dict[str, Any]) -> Gemma4TextConfig:
    text = dict(upstream.get("text_config") or {})
    if not text:
        raise ValueError("TEXT_CONFIG_MISSING")
    text.update({
        "num_kv_shared_layers": 0,
        "use_bidirectional_attention": "all",
        "use_cache": False,
    })
    return Gemma4TextConfig.from_dict(text)


def initialize_parameter(name: str, parameter: torch.Tensor) -> str:
    with torch.no_grad():
        if parameter.ndim == 2:
            torch.nn.init.xavier_uniform_(parameter)
            return "XAVIER_UNIFORM"
        if parameter.ndim == 1 and name.endswith("k_norm.weight"):
            parameter.fill_(1.0)
            return "ONES"
    raise ValueError(f"UNSUPPORTED_INITIALIZER_SHAPE:{name}:{list(parameter.shape)}")


def inspect(checkpoint_dir: Path, *, seed: int = 17) -> dict[str, Any]:
    config_path = checkpoint_dir / "config.json"
    weights_path = checkpoint_dir / "model.safetensors"
    if not config_path.is_file() or not weights_path.is_file():
        raise FileNotFoundError(checkpoint_dir)

    upstream = json.loads(config_path.read_text(encoding="utf-8"))
    source_checksum_before = file_checksum(weights_path)
    config = derived_text_config(upstream)

    torch.manual_seed(seed)
    model = Gemma4ForCausalLM(config)
    # The language-model head is not part of the ranker contract. Removing it
    # also prevents an unproven randomly initialized vocabulary head from being
    # mistaken for an inherited assistant tensor.
    if hasattr(model, "lm_head"):
        del model.lm_head
    model = model.to(dtype=torch.bfloat16)
    model.eval()
    state = model.state_dict()

    rank_head = torch.nn.Linear(config.hidden_size, 1, bias=True, dtype=torch.bfloat16)
    rank_head_init = {
        "weight": initialize_parameter("atlas.rank_head.weight", rank_head.weight),
        "bias": "ZEROS",
    }
    with torch.no_grad():
        rank_head.bias.zero_()

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

    finite_rank_head = bool(all(torch.isfinite(parameter).all().item() for parameter in rank_head.parameters()))
    source_checksum_after = file_checksum(weights_path)
    inherited = sorted(name for name in loaded if not name.endswith(NEW_SUFFIXES))
    status = (
        "LOAD_INIT_IN_MEMORY_PROVEN"
        if len(inherited) == 46
        and len(new_attention) == 12
        and len(initialized) == 12
        and not shape_mismatches
        and all(item["finite"] for item in initialized)
        and finite_rank_head
        and source_checksum_before == source_checksum_after
        else "BLOCKED_LOAD_INIT_PROOF"
    )
    result = {
        "schema": SCHEMA,
        "status": status,
        "checkpointDir": str(checkpoint_dir),
        "configPath": str(config_path),
        "runtimeClass": "Gemma4ForCausalLM",
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
        "loadedInheritedTensorNames": inherited,
        "initializedStandaloneAttentionTensorCount": len(initialized),
        "initializedStandaloneAttention": initialized,
        "rankHead": {
            "weightShape": list(rank_head.weight.shape),
            "biasShape": list(rank_head.bias.shape),
            "initializers": rank_head_init,
            "finite": finite_rank_head,
        },
        "checkpointOnlyTensorNames": checkpoint_only,
        "shapeMismatches": shape_mismatches,
        "sourceWeightsChecksumBefore": source_checksum_before,
        "sourceWeightsChecksumAfter": source_checksum_after,
        "runtimeInstantiation": "IN_MEMORY_ONLY",
        "forwardExecuted": False,
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
        "shapeMismatches": len(receipt["shapeMismatches"]),
        "forwardExecuted": receipt["forwardExecuted"],
        "trainingPerformed": receipt["trainingPerformed"],
        "checkpointMutated": receipt["checkpointMutated"],
        "output": str(args.output),
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
