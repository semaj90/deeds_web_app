"""Derive and validate the no-training AtlasGemmaRankV1 shape contract.

This is a read-only configuration proof. It does not instantiate a model,
allocate CUDA memory, mutate the upstream checkpoint, or create new weights.
The derived config is intentionally a custom ranker manifest rather than a
Gemma4AssistantConfig: the upstream assistant requires KV sharing by design.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from typing import Any

from atlas_gemma_rank_checkpoint_inventory_v1 import (
    _attention_shape_plan,
    checksum,
    file_checksum,
    load_json,
)


SCHEMA = "atlas.gemma-rank-standalone-shape-proof.v1"


def derive_standalone_config(upstream: dict[str, Any]) -> dict[str, Any]:
    text = upstream.get("text_config")
    if not isinstance(text, dict):
        raise ValueError("TEXT_CONFIG_MISSING")

    layers = int(text.get("num_hidden_layers") or 0)
    if layers <= 0:
        raise ValueError("NUM_HIDDEN_LAYERS_INVALID")

    return {
        "model_type": "atlas_gemma_rank",
        "architectures": ["AtlasGemmaRankForPairwiseScoring"],
        "sourceModel": upstream.get("model_type"),
        "sourceArchitecture": (upstream.get("architectures") or [None])[0],
        "hidden_size": int(text.get("hidden_size") or 0),
        "num_hidden_layers": layers,
        "num_attention_heads": int(text.get("num_attention_heads") or 0),
        "num_key_value_heads": int(text.get("num_key_value_heads") or 0),
        "num_kv_shared_layers": 0,
        "head_dim": int(text.get("head_dim") or 0),
        "global_head_dim": int(text.get("global_head_dim") or text.get("head_dim") or 0),
        "intermediate_size": int(text.get("intermediate_size") or 0),
        "layer_types": list(text.get("layer_types") or []),
        "use_bidirectional_attention": "all",
        "use_cache": False,
        "use_ordered_embeddings": False,
        "task": "pairwise_relevance_score",
        "rankHead": {"inFeatures": int(text.get("hidden_size") or 0), "outFeatures": 1, "bias": True},
    }


def prove_shape_contract(
    upstream: dict[str, Any],
    tensor_shapes: dict[str, list[int]],
    *,
    upstream_weights_checksum: str | None = None,
) -> dict[str, Any]:
    text = upstream.get("text_config")
    if not isinstance(text, dict):
        raise ValueError("TEXT_CONFIG_MISSING")
    layers = int(text.get("num_hidden_layers") or 0)
    derived = derive_standalone_config(upstream)
    shape_plan = _attention_shape_plan(text, layers)

    expected_new_tensors: dict[str, list[int]] = {}
    for layer in shape_plan:
        index = int(layer["layer"])
        expected_new_tensors.update({
            f"model.layers.{index}.self_attn.k_proj.weight": list(layer["kProjShape"]),
            f"model.layers.{index}.self_attn.v_proj.weight": list(layer["vProjShape"]),
            f"model.layers.{index}.self_attn.k_norm.weight": list(layer["kNormShape"]),
        })

    missing_new = sorted(name for name in expected_new_tensors if name not in tensor_shapes)
    present_new = sorted(name for name in tensor_shapes if name in expected_new_tensors)
    shape_mismatches = [
        {"tensor": name, "expected": expected, "actual": list(tensor_shapes[name])}
        for name, expected in sorted(expected_new_tensors.items())
        if name in tensor_shapes and list(tensor_shapes[name]) != expected
    ]
    config_invariants = {
        "customModelType": derived["model_type"] == "atlas_gemma_rank",
        "kvSharingDisabled": derived["num_kv_shared_layers"] == 0,
        "bidirectionalEncoding": derived["use_bidirectional_attention"] == "all",
        "cacheDisabledForCrossRank": derived["use_cache"] is False,
        "rankHeadScalar": derived["rankHead"] == {
            "inFeatures": derived["hidden_size"],
            "outFeatures": 1,
            "bias": True,
        },
        "upstreamOrderedEmbeddingNotRelabeled": upstream.get("use_ordered_embeddings") is True
        and derived["use_ordered_embeddings"] is False,
    }
    all_invariants = all(config_invariants.values())
    all_new_absent = len(missing_new) == len(expected_new_tensors) and not present_new
    all_new_present = len(missing_new) == 0 and len(present_new) == len(expected_new_tensors)
    status = (
        "STANDALONE_SHAPE_CONTRACT_PROVEN"
        if all_invariants and (all_new_absent or all_new_present) and not shape_mismatches
        else "BLOCKED_STANDALONE_SHAPE_CONTRACT"
    )

    result = {
        "schema": SCHEMA,
        "status": status,
        "upstreamConfigType": upstream.get("model_type"),
        "upstreamOrderedEmbeddings": upstream.get("use_ordered_embeddings"),
        "derivedConfig": derived,
        "configInvariants": config_invariants,
        "attentionShapePlan": shape_plan,
        "expectedNewTrainableAttentionTensors": expected_new_tensors,
        "missingNewTrainableAttentionTensors": missing_new,
        "presentNewTrainableAttentionTensors": present_new,
        "newTrainableAttentionState": "UNINITIALIZED_REQUIRED" if all_new_absent else "PRESENT_SHAPES_MATCH" if all_new_present else "PARTIAL_OR_INVALID",
        "shapeMismatches": shape_mismatches,
        "rankHeadPlan": [
            {"tensor": "atlas.rank_head.weight", "shape": [derived["rankHead"]["outFeatures"], derived["rankHead"]["inFeatures"]]},
            {"tensor": "atlas.rank_head.bias", "shape": [derived["rankHead"]["outFeatures"]]},
        ],
        "runtimeInstantiation": "NOT_ATTEMPTED_CUSTOM_ARCHITECTURE",
        "trainingPerformed": False,
        "weightsMutated": False,
        "canonicalAuthority": False,
        "upstreamWeightsChecksum": upstream_weights_checksum,
    }
    result["derivedConfigChecksum"] = checksum(derived)
    result["receiptChecksum"] = checksum(result)
    return result


def inspect(checkpoint_dir: Path) -> dict[str, Any]:
    config_path = checkpoint_dir / "config.json"
    weights_path = checkpoint_dir / "model.safetensors"
    upstream = load_json(config_path)
    tensor_shapes: dict[str, list[int]] = {}
    from safetensors import safe_open

    with safe_open(str(weights_path), framework="np") as handle:
        tensor_shapes = {name: list(handle.get_slice(name).get_shape()) for name in handle.keys()}
    receipt = prove_shape_contract(
        upstream,
        tensor_shapes,
        upstream_weights_checksum=file_checksum(weights_path),
    )
    receipt.update({
        "observedAt": datetime.now(timezone.utc).isoformat(),
        "checkpointDir": str(checkpoint_dir),
        "configPath": str(config_path),
        "weightsPath": str(weights_path),
        "tensorCount": len(tensor_shapes),
    })
    receipt["receiptChecksum"] = checksum(receipt)
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    receipt = inspect(args.checkpoint_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "schema": receipt["schema"],
        "status": receipt["status"],
        "tensorCount": receipt["tensorCount"],
        "expectedNewTrainableAttentionTensors": len(receipt["expectedNewTrainableAttentionTensors"]),
        "missingNewTrainableAttentionTensors": len(receipt["missingNewTrainableAttentionTensors"]),
        "shapeMismatches": len(receipt["shapeMismatches"]),
        "output": str(args.output),
        "weightsMutated": receipt["weightsMutated"],
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
