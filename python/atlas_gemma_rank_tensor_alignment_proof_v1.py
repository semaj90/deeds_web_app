"""Read-only inherited-tensor and CUDA-GEMM alignment proof for AtlasGemmaRankV1.

This proof defines the AGMR-03 allow-list and initialization plan. It never
loads tensor values into a model, allocates CUDA memory, runs GEMM, or writes
the upstream checkpoint.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
from typing import Any

from atlas_gemma_rank_checkpoint_inventory_v1 import (
    _attention_shape_plan,
    checksum,
    file_checksum,
    load_json,
)


SCHEMA = "atlas.gemma-rank-tensor-alignment-proof.v1"
_LAYER_RE = re.compile(r"^model\.layers\.(\d+)\.(.+)$")


def _is_inherited_tensor(name: str) -> bool:
    if name in {"model.embed_tokens.weight", "model.norm.weight"}:
        return True
    match = _LAYER_RE.fullmatch(name)
    if not match:
        return False
    suffix = match.group(2)
    return suffix in {
        "input_layernorm.weight",
        "layer_scalar",
        "post_attention_layernorm.weight",
        "post_feedforward_layernorm.weight",
        "pre_feedforward_layernorm.weight",
        "self_attn.o_proj.weight",
        "self_attn.q_norm.weight",
        "self_attn.q_proj.weight",
        "mlp.down_proj.weight",
        "mlp.gate_proj.weight",
        "mlp.up_proj.weight",
    }


def _is_excluded_target_coupled_tensor(name: str) -> bool:
    return name.startswith(("pre_projection.", "post_projection.", "masked_embedding."))


def _expected_inherited_shapes(config: dict[str, Any]) -> dict[str, list[int]]:
    text = config["text_config"]
    hidden = int(text["hidden_size"])
    intermediate = int(text["intermediate_size"])
    heads = int(text["num_attention_heads"])
    vocab = int(config.get("vocab_size") or text.get("vocab_size") or 262144)
    plan = _attention_shape_plan(text, int(text["num_hidden_layers"]))
    expected: dict[str, list[int]] = {
        "model.embed_tokens.weight": [vocab, hidden],
        "model.norm.weight": [hidden],
    }
    for layer in plan:
        index = int(layer["layer"])
        prefix = f"model.layers.{index}."
        attention_dim = int(layer["perHeadDim"]) * heads
        expected.update({
            f"{prefix}input_layernorm.weight": [hidden],
            f"{prefix}layer_scalar": [1],
            f"{prefix}post_attention_layernorm.weight": [hidden],
            f"{prefix}post_feedforward_layernorm.weight": [hidden],
            f"{prefix}pre_feedforward_layernorm.weight": [hidden],
            f"{prefix}self_attn.o_proj.weight": [hidden, attention_dim],
            f"{prefix}self_attn.q_norm.weight": [int(layer["perHeadDim"])],
            f"{prefix}self_attn.q_proj.weight": [attention_dim, hidden],
            f"{prefix}mlp.down_proj.weight": [hidden, intermediate],
            f"{prefix}mlp.gate_proj.weight": [intermediate, hidden],
            f"{prefix}mlp.up_proj.weight": [intermediate, hidden],
        })
    return expected


def prove_tensor_alignment(
    config: dict[str, Any],
    tensor_shapes: dict[str, list[int]],
    tensor_dtypes: dict[str, str] | None = None,
    *,
    weights_checksum: str | None = None,
) -> dict[str, Any]:
    tensor_dtypes = tensor_dtypes or {}
    expected = _expected_inherited_shapes(config)
    inherited_names = sorted(name for name in tensor_shapes if _is_inherited_tensor(name))
    excluded_names = sorted(name for name in tensor_shapes if _is_excluded_target_coupled_tensor(name))
    unexpected_names = sorted(
        name for name in tensor_shapes if name not in expected and name not in excluded_names
    )
    missing_names = sorted(name for name in expected if name not in tensor_shapes)
    shape_mismatches = [
        {"tensor": name, "expected": shape, "actual": list(tensor_shapes[name])}
        for name, shape in sorted(expected.items())
        if name in tensor_shapes and list(tensor_shapes[name]) != shape
    ]

    shape_plan = _attention_shape_plan(
        config["text_config"], int(config["text_config"]["num_hidden_layers"])
    )
    new_attention = []
    for layer in shape_plan:
        index = int(layer["layer"])
        new_attention.extend([
            {"tensor": f"model.layers.{index}.self_attn.k_proj.weight", "shape": list(layer["kProjShape"]), "initializer": "NOT_APPLIED"},
            {"tensor": f"model.layers.{index}.self_attn.v_proj.weight", "shape": list(layer["vProjShape"]), "initializer": "NOT_APPLIED"},
            {"tensor": f"model.layers.{index}.self_attn.k_norm.weight", "shape": list(layer["kNormShape"]), "initializer": "NOT_APPLIED"},
        ])
    new_attention_names = {entry["tensor"] for entry in new_attention}
    unexpected_new_present = sorted(name for name in tensor_shapes if name in new_attention_names)

    gemm_shapes = [
        {"tensor": name, "shape": list(shape), "alignmentMultiple": 8,
         "dimensionsAligned": all(dimension % 8 == 0 for dimension in shape)}
        for name, shape in sorted(expected.items())
        if len(shape) == 2
    ]
    config_invariants = {
        "derivedRankerType": config.get("model_type") == "atlas_gemma_rank",
        "kvSharingDisabled": config.get("num_kv_shared_layers") == 0,
        "bidirectionalEncoding": config.get("use_bidirectional_attention") == "all",
        "cacheDisabled": config.get("use_cache") is False,
        "orderedEmbeddingRelabelingNotClaimed": config.get("use_ordered_embeddings") is False,
    }
    source_dtype_values = sorted({str(value) for value in tensor_dtypes.values()})
    status = (
        "INHERITED_TENSOR_ALIGNMENT_PROVEN"
        if all(config_invariants.values())
        and not missing_names
        and not unexpected_names
        and not shape_mismatches
        and not unexpected_new_present
        and all(entry["dimensionsAligned"] for entry in gemm_shapes)
        else "BLOCKED_TENSOR_ALIGNMENT"
    )
    result = {
        "schema": SCHEMA,
        "status": status,
        "configInvariants": config_invariants,
        "inheritedTensorCount": len(inherited_names),
        "inheritedTensorNames": inherited_names,
        "inheritedTensorMapping": [
            {"sourceTensor": name, "targetTensor": name, "action": "INHERIT_READ_ONLY"}
            for name in inherited_names
        ],
        "excludedTargetCoupledTensorNames": excluded_names,
        "unexpectedTensorNames": unexpected_names,
        "missingInheritedTensorNames": missing_names,
        "shapeMismatches": shape_mismatches,
        "newAttentionInitializationPlan": new_attention,
        "unexpectedNewAttentionTensorsPresent": unexpected_new_present,
        "rankHeadInitializationPlan": [
            {"tensor": "atlas.rank_head.weight", "shape": [1, int(config["hidden_size"])], "initializer": "NOT_APPLIED"},
            {"tensor": "atlas.rank_head.bias", "shape": [1], "initializer": "NOT_APPLIED"},
        ],
        "sourceDtypes": source_dtype_values,
        "cudaGemmAlignment": {
            "alignmentMultiple": 8,
            "matrixCount": len(gemm_shapes),
            "matrices": gemm_shapes,
            "cudaAllocated": False,
            "gemmExecuted": False,
        },
        "rerankerScoreContract": {
            "owner": "scripts/reranker-sidecar.py",
            "rawScoreKind": "mxbai_ranking_logit",
            "normalization": "sigmoid_once",
            "normalizedRange": [0, 1],
            "promotionAttempted": False,
        },
        "weightsChecksum": weights_checksum,
        "weightsMutated": False,
        "canonicalAuthority": False,
    }
    result["receiptChecksum"] = checksum(result)
    return result


def inspect(checkpoint_dir: Path) -> dict[str, Any]:
    config_path = checkpoint_dir / "config.json"
    weights_path = checkpoint_dir / "model.safetensors"
    config = load_json(config_path)
    from safetensors import safe_open

    with safe_open(str(weights_path), framework="np") as handle:
        tensor_shapes = {name: list(handle.get_slice(name).get_shape()) for name in handle.keys()}
        tensor_dtypes = {name: str(handle.get_slice(name).get_dtype()) for name in handle.keys()}
    receipt = prove_tensor_alignment(
        {
            **config.get("text_config", {}),
            "model_type": "atlas_gemma_rank",
            "num_kv_shared_layers": 0,
            "use_bidirectional_attention": "all",
            "use_cache": False,
            "use_ordered_embeddings": False,
            "text_config": config["text_config"],
        },
        tensor_shapes,
        tensor_dtypes,
        weights_checksum=file_checksum(weights_path),
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
        "inheritedTensorCount": receipt["inheritedTensorCount"],
        "excludedTargetCoupledTensorCount": len(receipt["excludedTargetCoupledTensorNames"]),
        "shapeMismatches": len(receipt["shapeMismatches"]),
        "sourceDtypes": receipt["sourceDtypes"],
        "cudaAllocated": receipt["cudaGemmAlignment"]["cudaAllocated"],
        "gemmExecuted": receipt["cudaGemmAlignment"]["gemmExecuted"],
        "output": str(args.output),
        "weightsMutated": receipt["weightsMutated"],
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
