#!/usr/bin/env python3
"""
Fix TensorRT-LLM tensor naming requirements for Gemma3
Creates proper tensor name mapping from HuggingFace to TensorRT-LLM format
"""

import os
import json
from pathlib import Path
from safetensors.torch import load_file, save_file
import torch

def create_tensor_mapping():
    """Create mapping from HuggingFace names to TensorRT-LLM names"""

    # Core mappings discovered from analysis
    mapping = {
        # Embedding layer
        "language_model.model.embed_tokens.weight": "transformer.vocab_embedding.weight",

        # Output layer - note: TensorRT-LLM shares embeddings with lm_head
        # Will be handled separately

        # Layer mappings (per layer)
        # Pattern: language_model.model.layers.{i}.* -> transformer.layers.{i}.*
    }

    # Generate layer mappings for all 48 layers
    for i in range(48):
        layer_prefix_hf = f"language_model.model.layers.{i}"
        layer_prefix_trt = f"transformer.layers.{i}"

        # Layer norm mappings
        mapping[f"{layer_prefix_hf}.input_layernorm.weight"] = f"{layer_prefix_trt}.input_layernorm.weight"
        mapping[f"{layer_prefix_hf}.post_attention_layernorm.weight"] = f"{layer_prefix_trt}.post_layernorm.weight"

        # Attention mappings - HF has separate q,k,v,o projections, TRT-LLM has qkv combined
        # This requires special handling in the conversion function

        # MLP mappings
        mapping[f"{layer_prefix_hf}.mlp.gate_proj.weight"] = f"{layer_prefix_trt}.mlp.gate.weight"
        mapping[f"{layer_prefix_hf}.mlp.up_proj.weight"] = f"{layer_prefix_trt}.mlp.fc.weight"
        mapping[f"{layer_prefix_hf}.mlp.down_proj.weight"] = f"{layer_prefix_trt}.mlp.proj.weight"

    return mapping

def combine_qkv_weights(hf_weights, layer_idx):
    """Combine separate q,k,v weights into single qkv weight for TensorRT-LLM"""

    layer_prefix = f"language_model.model.layers.{layer_idx}.self_attn"

    # Get individual projection weights
    q_weight = hf_weights[f"{layer_prefix}.q_proj.weight"]
    k_weight = hf_weights[f"{layer_prefix}.k_proj.weight"]
    v_weight = hf_weights[f"{layer_prefix}.v_proj.weight"]

    # Combine into qkv format expected by TensorRT-LLM
    # Format: [q_heads, k_heads, v_heads] concatenated
    qkv_weight = torch.cat([q_weight, k_weight, v_weight], dim=0)

    return qkv_weight

def convert_checkpoint():
    """Convert HuggingFace checkpoint to TensorRT-LLM format"""

    # Paths
    HF_CHECKPOINT = "/home/james/gemma3_checkpoint_fixed/rank0.safetensors"
    TRT_CHECKPOINT_DIR = "/home/james/gemma3_trtllm_fixed"

    print("🔹 Loading HuggingFace checkpoint...")
    hf_weights = load_file(HF_CHECKPOINT)

    print(f"📊 Loaded {len(hf_weights)} tensors from HuggingFace checkpoint")

    # Create TensorRT-LLM weights dictionary
    trt_weights = {}

    # Get mapping
    mapping = create_tensor_mapping()

    print("🔄 Converting tensor names...")

    # Apply direct mappings
    for hf_name, trt_name in mapping.items():
        if hf_name in hf_weights:
            trt_weights[trt_name] = hf_weights[hf_name]
            print(f"✓ {hf_name} -> {trt_name}")

    # Handle special cases
    print("🔄 Combining QKV projections...")
    for i in range(48):
        layer_prefix_hf = f"language_model.model.layers.{i}.self_attn"
        layer_prefix_trt = f"transformer.layers.{i}"

        # Combine q,k,v into qkv
        if all(f"{layer_prefix_hf}.{proj}_proj.weight" in hf_weights for proj in ['q', 'k', 'v']):
            qkv_weight = combine_qkv_weights(hf_weights, i)
            trt_weights[f"{layer_prefix_trt}.attention.qkv.weight"] = qkv_weight
            print(f"✓ Layer {i}: Combined q,k,v -> qkv")

        # Attention output projection
        if f"{layer_prefix_hf}.o_proj.weight" in hf_weights:
            trt_weights[f"{layer_prefix_trt}.attention.dense.weight"] = hf_weights[f"{layer_prefix_hf}.o_proj.weight"]
            print(f"✓ Layer {i}: o_proj -> dense")

    # Handle embedding sharing (lm_head uses vocab_embedding in TensorRT-LLM)
    if "transformer.vocab_embedding.weight" in trt_weights:
        # TensorRT-LLM automatically shares embeddings with lm_head
        print("✓ Embedding sharing configured (lm_head will use vocab_embedding)")

    print(f"📊 Created {len(trt_weights)} tensors for TensorRT-LLM")

    # Create output directory
    os.makedirs(TRT_CHECKPOINT_DIR, exist_ok=True)

    # Save converted weights
    print("💾 Saving TensorRT-LLM checkpoint...")
    save_file(trt_weights, f"{TRT_CHECKPOINT_DIR}/rank0.safetensors")

    # Create TensorRT-LLM config
    config = {
        "architecture": "GemmaForCausalLM",
        "dtype": "float16",
        "hidden_size": 4096,
        "intermediate_size": 16384,
        "num_hidden_layers": 48,
        "num_attention_heads": 32,
        "num_key_value_heads": 8,
        "vocab_size": 262208,
        "max_position_embeddings": 4096,
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
            "num_layers": 48,
            "num_heads": 32,
            "num_kv_heads": 8,
            "hidden_size": 4096,
            "inter_size": 16384,
            "head_size": 128
        }
    }

    with open(f"{TRT_CHECKPOINT_DIR}/config.json", 'w') as f:
        json.dump(config, f, indent=2)

    print(f"✅ TensorRT-LLM checkpoint saved to: {TRT_CHECKPOINT_DIR}")
    print(f"📁 Files created:")
    print(f"   - rank0.safetensors ({os.path.getsize(f'{TRT_CHECKPOINT_DIR}/rank0.safetensors') / (1024**3):.1f}GB)")
    print(f"   - config.json")

    return TRT_CHECKPOINT_DIR

if __name__ == "__main__":
    print("Starting HuggingFace to TensorRT-LLM checkpoint conversion...")

    try:
        checkpoint_dir = convert_checkpoint()
        print("\n🎉 Conversion completed successfully!")
        print("Next: Use trtllm-build to create engine")
        print(f"Command: trtllm-build --checkpoint_dir {checkpoint_dir} --output_dir /home/james/gemma3_engine_final")
    except Exception as e:
        print(f"\n❌ Conversion failed: {e}")
        import traceback
        traceback.print_exc()