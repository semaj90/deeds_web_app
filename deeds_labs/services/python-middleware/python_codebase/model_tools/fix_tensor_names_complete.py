#!/usr/bin/env python3
"""
Complete TensorRT-LLM tensor name mapping for Gemma3.

This script loads the HuggingFace checkpoints, normalises the tensor names, and
emits a TensorRT-LLM ready checkpoint. The previous prototype hard-coded most
paths which made it difficult to share checkpoints or audit exactly which
weights were mapped. The refreshed version adds:
  * CLI parameters for checkpoint, output and layer counts
  * Robust shard loading with validation
  * A JSON mapping report so we can prove coverage when debugging TensorRT-LLM
  * Optional report path override for reproducible investigations
"""

from __future__ import annotations

import argparse
import json
import os
from collections import OrderedDict
from pathlib import Path
from typing import Dict, Iterable, List

import torch
from safetensors.torch import load_file, save_file


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Complete Gemma3 tensor mapping")
    parser.add_argument(
        "--checkpoint_dir",
        type=Path,
        default=Path("/home/james/gemma3_checkpoint_fixed"),
        help="Directory that contains HuggingFace shard files",
    )
    parser.add_argument(
        "--output_dir",
        type=Path,
        default=Path("/home/james/gemma3_trtllm_complete"),
        help="Directory for TensorRT-LLM checkpoint + config",
    )
    parser.add_argument(
        "--num_layers",
        type=int,
        default=48,
        help="Transformer layer count (Gemma3-27B = 48)",
    )
    parser.add_argument(
        "--shards",
        nargs="*",
        default=[
            "model-00001-of-00005.safetensors",
            "model-00002-of-00005.safetensors",
            "model-00003-of-00005.safetensors",
            "model-00004-of-00005.safetensors",
            "model-00005-of-00005.safetensors",
        ],
        help="List of shard file names relative to checkpoint_dir",
    )
    parser.add_argument(
        "--report_file",
        type=Path,
        default=None,
        help="Optional JSON file for the mapping audit report",
    )
    return parser.parse_args()


def load_all_shards(checkpoint_dir: Path, shard_files: Iterable[str]) -> OrderedDict:
    """Load every shard into an ordered dict matching the HuggingFace layout."""

    all_weights: OrderedDict[str, torch.Tensor] = OrderedDict()

    for shard_file in shard_files:
        shard_path = checkpoint_dir / shard_file
        if not shard_path.exists():
            raise FileNotFoundError(f"Missing shard: {shard_path}")

        print(f"📁 Loading {shard_file}...")
        shard_weights = load_file(str(shard_path))
        print(f"   Loaded {len(shard_weights)} tensors")
        all_weights.update(shard_weights)

    print(f"📊 Total tensors loaded: {len(all_weights)}")

    layer_counts: Dict[int, int] = {}
    for key in all_weights.keys():
        if ".layers." not in key:
            continue
        layer_num = key.split(".layers.")[1].split(".")[0]
        if layer_num.isdigit():
            idx = int(layer_num)
            layer_counts[idx] = layer_counts.get(idx, 0) + 1

    if layer_counts:
        print(
            f"📊 Layers found: {min(layer_counts.keys())} to {max(layer_counts.keys())} "
            f"({len(layer_counts)} layers)"
        )

    return all_weights


def create_tensor_mapping(num_layers: int) -> Dict[str, str]:
    mapping: Dict[str, str] = {
        "language_model.model.embed_tokens.weight": "transformer.vocab_embedding.weight",
        "language_model.model.norm.weight": "transformer.ln_f.weight",
        "language_model.lm_head.weight": "lm_head.weight",
    }

    for i in range(num_layers):
        layer_prefix_hf = f"language_model.model.layers.{i}"
        layer_prefix_trt = f"transformer.layers.{i}"

        mapping[f"{layer_prefix_hf}.input_layernorm.weight"] = f"{layer_prefix_trt}.input_layernorm.weight"
        mapping[f"{layer_prefix_hf}.post_attention_layernorm.weight"] = f"{layer_prefix_trt}.post_layernorm.weight"

        mapping[f"{layer_prefix_hf}.mlp.gate_proj.weight"] = f"{layer_prefix_trt}.mlp.gate.weight"
        mapping[f"{layer_prefix_hf}.mlp.up_proj.weight"] = f"{layer_prefix_trt}.mlp.fc.weight"
        mapping[f"{layer_prefix_hf}.mlp.down_proj.weight"] = f"{layer_prefix_trt}.mlp.proj.weight"

        mapping[f"{layer_prefix_hf}.self_attn.o_proj.weight"] = f"{layer_prefix_trt}.attention.dense.weight"

    return mapping


def combine_qkv_weights(hf_weights: Dict[str, torch.Tensor], layer_idx: int) -> torch.Tensor | None:
    layer_prefix = f"language_model.model.layers.{layer_idx}.self_attn"
    q_key = f"{layer_prefix}.q_proj.weight"
    k_key = f"{layer_prefix}.k_proj.weight"
    v_key = f"{layer_prefix}.v_proj.weight"

    if not all(key in hf_weights for key in (q_key, k_key, v_key)):
        print(f"⚠️  Missing q/k/v weights for layer {layer_idx}")
        return None

    q_weight = hf_weights[q_key]
    k_weight = hf_weights[k_key]
    v_weight = hf_weights[v_key]

    if q_weight.shape != k_weight.shape or q_weight.shape != v_weight.shape:
        raise ValueError(
            f"QKV shape mismatch in layer {layer_idx}: "
            f"{q_weight.shape} vs {k_weight.shape} vs {v_weight.shape}"
        )

    if q_weight.ndim < 2:
        raise ValueError(f"Unexpected tensor rank for QKV in layer {layer_idx}: {q_weight.ndim}")

    return torch.cat([q_weight, k_weight, v_weight], dim=0)


def convert_checkpoint(args: argparse.Namespace) -> Path:
    print("🔹 Loading all HuggingFace checkpoint shards...")
    hf_weights = load_all_shards(args.checkpoint_dir, args.shards)

    trt_weights: OrderedDict[str, torch.Tensor] = OrderedDict()
    mapping = create_tensor_mapping(args.num_layers)

    print("🔄 Converting tensor names...")
    direct_hits: List[str] = []
    missing_expected: List[str] = []

    for hf_name, trt_name in mapping.items():
        tensor = hf_weights.get(hf_name)
        if tensor is None:
            missing_expected.append(hf_name)
            continue
        trt_weights[trt_name] = tensor
        direct_hits.append(hf_name)
        print(f"✓ {hf_name} -> {trt_name}")

    print(f"📊 Direct mappings applied: {len(direct_hits)}")

    print("🔄 Combining QKV projections...")
    qkv_layers: List[int] = []
    for i in range(args.num_layers):
        layer_prefix_trt = f"transformer.layers.{i}"
        qkv_weight = combine_qkv_weights(hf_weights, i)
        if qkv_weight is None:
            continue
        trt_weights[f"{layer_prefix_trt}.attention.qkv.weight"] = qkv_weight
        qkv_layers.append(i)
        print(f"✓ Layer {i}: Combined q,k,v -> qkv ({tuple(qkv_weight.shape)})")

    print(f"📊 QKV combinations created: {len(qkv_layers)}")

    embedding_shared = configure_embedding_sharing(trt_weights, hf_weights)
    if embedding_shared:
        print("✓ Embedding sharing ready (lm_head uses vocab embedding)")

    print(f"📊 Total TensorRT-LLM tensors created: {len(trt_weights)}")

    os.makedirs(args.output_dir, exist_ok=True)
    save_file(trt_weights, str(args.output_dir / "rank0.safetensors"))

    config = {
        "architecture": "GemmaForCausalLM",
        "dtype": "float16",
        "hidden_size": 4096,
        "intermediate_size": 16384,
        "num_hidden_layers": args.num_layers,
        "num_attention_heads": 32,
        "num_key_value_heads": 8,
        "vocab_size": 262208,
        "max_position_embeddings": 4096,
        "rotary_base": 10000.0,
        "rope_theta": 1000000.0,
        "rms_norm_eps": 1e-06,
        "builder_config": {
            "name": "gemma",
            "precision": "float16",
            "tensor_parallel": 1,
            "pipeline_parallel": 1,
            "max_batch_size": 4,
            "max_input_len": 2048,
            "max_output_len": 2048,
            "max_beam_width": 1,
            "vocab_size": 262208,
            "num_layers": args.num_layers,
            "num_heads": 32,
            "num_kv_heads": 8,
            "hidden_size": 4096,
            "inter_size": 16384,
            "head_size": 128,
        },
    }

    with open(args.output_dir / "config.json", "w") as f:
        json.dump(config, f, indent=2)

    checkpoint_size = os.path.getsize(args.output_dir / "rank0.safetensors") / (1024**3)
    print(f"✅ Complete TensorRT-LLM checkpoint saved to: {args.output_dir}")
    print("📁 Files created:")
    print(f"   - rank0.safetensors ({checkpoint_size:.1f}GB)")
    print("   - config.json")

    create_mapping_report(
        args=args,
        mapping=mapping,
        hf_weights=hf_weights,
        trt_weights=trt_weights,
        direct_hits=direct_hits,
        missing_expected=missing_expected,
        qkv_layers=qkv_layers,
        embedding_shared=embedding_shared,
    )

    return args.output_dir


def configure_embedding_sharing(
    trt_weights: OrderedDict[str, torch.Tensor], hf_weights: Dict[str, torch.Tensor]
) -> bool:
    """Ensure lm_head reuses the vocab embedding tensor."""

    vocab_key = "transformer.vocab_embedding.weight"
    lm_head_target = "lm_head.weight"

    if vocab_key not in trt_weights:
        print("⚠️  Cannot configure embedding sharing - vocab embedding missing")
        return False

    vocab_tensor = trt_weights[vocab_key]
    lm_head_tensor = hf_weights.get("language_model.lm_head.weight")

    if lm_head_tensor is not None and not torch.equal(lm_head_tensor, vocab_tensor):
        print("⚠️  HF lm_head differs from embeddings - forcing share for TensorRT-LLM")

    trt_weights[lm_head_target] = vocab_tensor
    return True


def create_mapping_report(
    *,
    args: argparse.Namespace,
    mapping: Dict[str, str],
    hf_weights: Dict[str, torch.Tensor],
    trt_weights: Dict[str, torch.Tensor],
    direct_hits: List[str],
    missing_expected: List[str],
    qkv_layers: List[int],
    embedding_shared: bool,
) -> None:
    """Emit a JSON report so we know what was mapped and what was skipped."""

    unmapped_hf = sorted(
        set(hf_weights.keys())
        - set(direct_hits)
        - {
            f"language_model.model.layers.{i}.self_attn.{proj}_proj.weight"
            for i in range(args.num_layers)
            for proj in ("q", "k", "v")
        }
    )

    report = {
        "hf_checkpoint_dir": str(args.checkpoint_dir),
        "output_dir": str(args.output_dir),
        "num_layers": args.num_layers,
        "direct_mapped": len(direct_hits),
        "expected_missing": missing_expected,
        "qkv_layers": qkv_layers,
        "total_trt_tensors": len(trt_weights),
        "embedding_shared": embedding_shared,
        "unmapped_hf_sample": unmapped_hf[:50],  # keep report readable
    }

    report_path = args.report_file or (args.output_dir / "mapping_report.json")
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)

    print(f"📝 Mapping report saved to {report_path}")


if __name__ == "__main__":
    print("Starting complete HuggingFace to TensorRT-LLM checkpoint conversion...")
    cli_args = parse_args()

    try:
        checkpoint_dir = convert_checkpoint(cli_args)
        print("\n🎉 Complete conversion successful!")
        print("Next: Build TensorRT engine")
        print(
            "Command: trtllm-build --checkpoint_dir "
            f"{checkpoint_dir} --output_dir /home/james/gemma3_engine_complete"
        )
    except Exception as e:  # pragma: no cover - runtime aid
        print(f"\n❌ Conversion failed: {e}")
        import traceback

        traceback.print_exc()
