#!/usr/bin/env python3
"""
Convert Gemma3 12B checkpoint to TensorRT-LLM format
"""

import torch
import safetensors.torch
import json
import os
from pathlib import Path

def convert_checkpoint(input_dir: str, output_dir: str):
    """Convert Gemma3 checkpoint to TRT-LLM format"""

    input_dir = Path(input_dir)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load safetensors
    safetensors_path = input_dir / "rank0.safetensors"
    if not safetensors_path.exists():
        raise FileNotFoundError(f"rank0.safetensors not found in {input_dir}")

    print(f"Loading checkpoint from {safetensors_path}")
    state_dict = safetensors.torch.load_file(safetensors_path)

    # Load config
    config_path = input_dir / "config.json"
    if config_path.exists():
        with open(config_path) as f:
            config = json.load(f)
        print(f"Loaded config: {config}")
    else:
        print("Warning: config.json not found, using defaults")

    # TRT-LLM weight mapping
    weight_mapping = {
        # Embeddings
        "transformer.vocab_embedding.weight": "embed_tokens",
        "transformer.ln_f.weight": "norm",

        # Layer mappings (will be expanded for each layer)
        "transformer.layers.{layer}.attention.qkv.weight": "layers.{layer}.self_attn.qkv_proj",
        "transformer.layers.{layer}.attention.dense.weight": "layers.{layer}.self_attn.o_proj",
        "transformer.layers.{layer}.attention.q_layernorm.weight": "layers.{layer}.self_attn.q_norm",
        "transformer.layers.{layer}.attention.k_layernorm.weight": "layers.{layer}.self_attn.k_norm",

        "transformer.layers.{layer}.mlp.gate.weight": "layers.{layer}.mlp.gate_proj",
        "transformer.layers.{layer}.mlp.fc.weight": "layers.{layer}.mlp.up_proj",
        "transformer.layers.{layer}.mlp.proj.weight": "layers.{layer}.mlp.down_proj",

        "transformer.layers.{layer}.input_layernorm.weight": "layers.{layer}.input_layernorm",
        "transformer.layers.{layer}.post_layernorm.weight": "layers.{layer}.post_attention_layernorm",
        "transformer.layers.{layer}.pre_feedforward_layernorm.weight": "layers.{layer}.pre_feedforward_layernorm",
        "transformer.layers.{layer}.post_feedforward_layernorm.weight": "layers.{layer}.post_feedforward_layernorm",
    }

    converted_state_dict = {}

    # Convert embeddings
    if "transformer.vocab_embedding.weight" in state_dict:
        converted_state_dict["embed_tokens"] = state_dict["transformer.vocab_embedding.weight"]
        # Don't duplicate lm_head - TRT-LLM will handle tied weights
        # converted_state_dict["lm_head"] = state_dict["transformer.vocab_embedding.weight"]

    if "transformer.ln_f.weight" in state_dict:
        converted_state_dict["norm"] = state_dict["transformer.ln_f.weight"]

    # Convert layers
    num_layers = 48  # Gemma3 12B has 48 layers
    for layer_idx in range(num_layers):
        layer_prefix = f"transformer.layers.{layer_idx}"

        # Attention weights
        if f"{layer_prefix}.attention.qkv.weight" in state_dict:
            converted_state_dict[f"layers.{layer_idx}.self_attn.qkv_proj"] = state_dict[f"{layer_prefix}.attention.qkv.weight"]

        if f"{layer_prefix}.attention.dense.weight" in state_dict:
            converted_state_dict[f"layers.{layer_idx}.self_attn.o_proj"] = state_dict[f"{layer_prefix}.attention.dense.weight"]

        if f"{layer_prefix}.attention.q_layernorm.weight" in state_dict:
            converted_state_dict[f"layers.{layer_idx}.self_attn.q_norm"] = state_dict[f"{layer_prefix}.attention.q_layernorm.weight"]

        if f"{layer_prefix}.attention.k_layernorm.weight" in state_dict:
            converted_state_dict[f"layers.{layer_idx}.self_attn.k_norm"] = state_dict[f"{layer_prefix}.attention.k_layernorm.weight"]

        # MLP weights
        if f"{layer_prefix}.mlp.gate.weight" in state_dict:
            converted_state_dict[f"layers.{layer_idx}.mlp.gate_proj"] = state_dict[f"{layer_prefix}.mlp.gate.weight"]

        if f"{layer_prefix}.mlp.fc.weight" in state_dict:
            converted_state_dict[f"layers.{layer_idx}.mlp.up_proj"] = state_dict[f"{layer_prefix}.mlp.fc.weight"]

        if f"{layer_prefix}.mlp.proj.weight" in state_dict:
            converted_state_dict[f"layers.{layer_idx}.mlp.down_proj"] = state_dict[f"{layer_prefix}.mlp.proj.weight"]

        # Layer norms
        if f"{layer_prefix}.input_layernorm.weight" in state_dict:
            converted_state_dict[f"layers.{layer_idx}.input_layernorm"] = state_dict[f"{layer_prefix}.input_layernorm.weight"]

        if f"{layer_prefix}.post_layernorm.weight" in state_dict:
            converted_state_dict[f"layers.{layer_idx}.post_attention_layernorm"] = state_dict[f"{layer_prefix}.post_layernorm.weight"]

        if f"{layer_prefix}.pre_feedforward_layernorm.weight" in state_dict:
            converted_state_dict[f"layers.{layer_idx}.pre_feedforward_layernorm"] = state_dict[f"{layer_prefix}.pre_feedforward_layernorm.weight"]

        if f"{layer_prefix}.post_feedforward_layernorm.weight" in state_dict:
            converted_state_dict[f"layers.{layer_idx}.post_feedforward_layernorm"] = state_dict[f"{layer_prefix}.post_feedforward_layernorm.weight"]

    print(f"Converted {len(converted_state_dict)} tensors")

    # Save converted checkpoint
    output_path = output_dir / "converted_checkpoint.safetensors"
    safetensors.torch.save_file(converted_state_dict, output_path)
    print(f"Saved converted checkpoint to {output_path}")

    # Save tensor info for verification
    tensor_info = {}
    for name, tensor in converted_state_dict.items():
        tensor_info[name] = {
            "shape": list(tensor.shape),
            "dtype": str(tensor.dtype),
            "numel": tensor.numel()
        }

    info_path = output_dir / "tensor_info.json"
    with open(info_path, 'w') as f:
        json.dump(tensor_info, f, indent=2)
    print(f"Saved tensor info to {info_path}")

    return converted_state_dict

if __name__ == "__main__":
    import sys
    if len(sys.argv) != 3:
        print("Usage: python convert_checkpoint.py <input_dir> <output_dir>")
        sys.exit(1)

    input_dir = sys.argv[1]
    output_dir = sys.argv[2]

    convert_checkpoint(input_dir, output_dir)