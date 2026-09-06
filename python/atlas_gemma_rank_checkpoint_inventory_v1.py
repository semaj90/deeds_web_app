"""Read-only inventory for a Gemma 4 assistant -> AtlasGemmaRank seed.

This script does not modify model weights or create a standalone checkpoint.
It records the compatible inherited tensors, target-coupled blockers, and the
new trainable tensors that a later, separately authorized surgery/training
stage would need to create.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from typing import Any


SCHEMA = "atlas.gemma-rank-checkpoint-inventory.v1"


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def checksum(value: Any) -> str:
    return "sha256:" + hashlib.sha256(canonical_json(value)).hexdigest()


def file_checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return "sha256:" + digest.hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"CONFIG_NOT_OBJECT:{path}")
    return value


def _text_config(config: dict[str, Any]) -> dict[str, Any]:
    value = config.get("text_config")
    if not isinstance(value, dict):
        raise ValueError("TEXT_CONFIG_MISSING")
    return value


def _layer_tensor_names(tensor_names: list[str], layer: int, projection: str) -> list[str]:
    prefix = f"model.layers.{layer}.self_attn.{projection}."
    return sorted(name for name in tensor_names if name.startswith(prefix))


def _attention_shape_plan(text: dict[str, Any], layers: int) -> list[dict[str, Any]]:
    """Derive standalone K/V/KNorm shapes from the checkpoint configuration."""
    hidden_size = int(text.get("hidden_size") or 0)
    attention_heads = int(text.get("num_attention_heads") or 0)
    kv_heads = int(text.get("num_key_value_heads") or attention_heads or 0)
    head_dim = int(text.get("head_dim") or (hidden_size // attention_heads if attention_heads else 0))
    global_head_dim = int(text.get("global_head_dim") or head_dim)
    layer_types = text.get("layer_types")
    if not isinstance(layer_types, list):
        layer_types = []

    plan: list[dict[str, Any]] = []
    for layer in range(layers):
        layer_type = str(layer_types[layer] if layer < len(layer_types) else "").lower()
        is_full = "full" in layer_type or "global" in layer_type
        per_head_dim = global_head_dim if is_full else head_dim
        projection_shape = [per_head_dim * kv_heads, hidden_size]
        plan.append({
            "layer": layer,
            "layerType": layer_type or "unspecified",
            "perHeadDim": per_head_dim,
            "numKeyValueHeads": kv_heads,
            "kProjShape": projection_shape,
            "vProjShape": projection_shape,
            "kNormShape": [per_head_dim],
        })
    return plan


def classify_inventory(config: dict[str, Any], tensor_shapes: dict[str, list[int]]) -> dict[str, Any]:
    text = _text_config(config)
    tensor_names = sorted(tensor_shapes)
    layers = int(text.get("num_hidden_layers") or 0)
    inherited_prefixes = (
        "model.embed_tokens.",
        "model.layers.",
        "model.norm.",
        "masked_embedding.",
        "pre_projection.",
        "post_projection.",
    )
    inherited = [name for name in tensor_names if name.startswith(inherited_prefixes)]
    shape_plan = _attention_shape_plan(text, layers)
    missing_attention: list[str] = []
    missing_kv: list[str] = []
    missing_k_norm: list[str] = []
    shape_mismatches: list[dict[str, Any]] = []
    for layer_plan in shape_plan:
        layer = layer_plan["layer"]
        expected_shapes = {
            f"model.layers.{layer}.self_attn.k_proj.weight": layer_plan["kProjShape"],
            f"model.layers.{layer}.self_attn.v_proj.weight": layer_plan["vProjShape"],
            f"model.layers.{layer}.self_attn.k_norm.weight": layer_plan["kNormShape"],
        }
        for name, expected_shape in expected_shapes.items():
            actual_shape = tensor_shapes.get(name)
            if actual_shape is None:
                missing_attention.append(name)
                if ".k_norm." in name:
                    missing_k_norm.append(name)
                else:
                    missing_kv.append(name)
            elif list(actual_shape) != list(expected_shape):
                shape_mismatches.append({
                    "tensor": name,
                    "expected": expected_shape,
                    "actual": list(actual_shape),
                })

    blockers: list[str] = []
    if int(text.get("num_kv_shared_layers") or 0) > 0:
        blockers.append("TARGET_KV_SHARED_LAYERS_CONFIGURED")
    if missing_kv:
        blockers.append("STANDALONE_KV_TENSORS_ABSENT")
    if missing_k_norm:
        blockers.append("STANDALONE_K_NORM_TENSORS_ABSENT")
    if shape_mismatches:
        blockers.append("STANDALONE_ATTENTION_SHAPE_MISMATCH")
    if text.get("use_bidirectional_attention") != "all":
        blockers.append("BIDIRECTIONAL_ATTENTION_NOT_CONFIGURED")
    if config.get("use_ordered_embeddings") is True:
        blockers.append("ORDERED_EMBEDDING_ROW_ALIGNMENT_REQUIRES_EXPLICIT_PROOF")

    new_trainable = [*missing_attention, "atlas.rank_head.weight", "atlas.rank_head.bias"]
    return {
        "architecture": config.get("architectures", []),
        "modelType": config.get("model_type"),
        "textConfig": {
            key: text.get(key)
            for key in (
                "hidden_size",
                "num_hidden_layers",
                "num_attention_heads",
                "num_key_value_heads",
                "num_kv_shared_layers",
                "layer_types",
                "use_bidirectional_attention",
                "enable_moe_block",
                "use_double_wide_mlp",
                "head_dim",
                "intermediate_size",
            )
        },
        "tensorCount": len(tensor_names),
        "tensorShapes": {name: tensor_shapes[name] for name in tensor_names},
        "inheritedTensorCount": len(inherited),
        "inheritedTensorPrefixes": list(inherited_prefixes),
        "standaloneAttentionShapePlan": shape_plan,
        "missingStandaloneAttentionTensors": missing_attention,
        "missingStandaloneKvTensors": missing_kv,
        "missingStandaloneKNormTensors": missing_k_norm,
        "standaloneAttentionShapeMismatches": shape_mismatches,
        "newTrainableTensorPlan": new_trainable,
        "status": "BLOCKED_TARGET_COUPLED_ASSISTANT" if blockers else "STANDALONE_CANDIDATE_CONFIGURED",
        "blockers": blockers,
        "canonicalAuthority": False,
        "weightsMutated": False,
    }


def inspect_checkpoint(checkpoint_dir: Path, *, hash_weights: bool = False) -> dict[str, Any]:
    if not checkpoint_dir.is_dir():
        raise FileNotFoundError(checkpoint_dir)
    config_path = checkpoint_dir / "config.json"
    weights_path = checkpoint_dir / "model.safetensors"
    config = load_json(config_path)
    tensor_shapes: dict[str, list[int]] = {}
    safetensors_available = True
    try:
        from safetensors import safe_open
    except ImportError:
        safetensors_available = False
    if safetensors_available and weights_path.is_file():
        with safe_open(str(weights_path), framework="np") as handle:
            tensor_shapes = {name: list(handle.get_slice(name).get_shape()) for name in handle.keys()}
    inventory = classify_inventory(config, tensor_shapes)
    inventory["schema"] = SCHEMA
    inventory["checkpointDir"] = str(checkpoint_dir)
    inventory["files"] = {
        "config": {"path": str(config_path), "bytes": config_path.stat().st_size},
        "weights": {
            "path": str(weights_path),
            "bytes": weights_path.stat().st_size if weights_path.is_file() else None,
            "sha256": file_checksum(weights_path) if hash_weights and weights_path.is_file() else None,
        },
    }
    inventory["safetensorsAvailable"] = safetensors_available
    if not safetensors_available or not weights_path.is_file():
        inventory["status"] = "BLOCKED_WEIGHT_INVENTORY_UNAVAILABLE"
        inventory["blockers"] = [*inventory["blockers"], "WEIGHT_FILE_OR_SAFETENSORS_UNAVAILABLE"]
    inventory["observedAt"] = datetime.now(timezone.utc).isoformat()
    inventory["receiptChecksum"] = checksum(inventory)
    return inventory


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--hash-weights", action="store_true")
    args = parser.parse_args()
    receipt = inspect_checkpoint(args.checkpoint_dir, hash_weights=args.hash_weights)
    rendered = json.dumps(receipt, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    print(json.dumps({
        "schema": receipt["schema"],
        "status": receipt["status"],
        "tensorCount": receipt["tensorCount"],
        "missingStandaloneAttentionTensors": len(receipt["missingStandaloneAttentionTensors"]),
        "missingStandaloneKvTensors": len(receipt["missingStandaloneKvTensors"]),
        "output": str(args.output) if args.output else None,
        "weightsMutated": receipt["weightsMutated"],
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
