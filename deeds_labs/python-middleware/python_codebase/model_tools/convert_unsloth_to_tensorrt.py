#!/usr/bin/env python3
"""
Convert unsloth HF16 model directly to TensorRT-LLM format
Uses the original unsloth model directory with proper tensor mapping
"""

import os
import json
from pathlib import Path
from safetensors.torch import load_file, save_file
import torch
from collections import OrderedDict

def load_unsloth_model():
    """Load the complete unsloth model from all shards"""

    model_dir = "/mnt/c/Users/james/Videos/deeds-web-app/model_unsloth_hf_f16"
    all_weights = OrderedDict()

    # Load all 5 shards from the unsloth model
    shard_files = [
        "model-00001-of-00005.safetensors",
        "model-00002-of-00005.safetensors",
        "model-00003-of-00005.safetensors",
        "model-00004-of-00005.safetensors",
        "model-00005-of-00005.safetensors"
    ]

    for shard_file in shard_files:
        shard_path = os.path.join(model_dir, shard_file)
        print(f"📁 Loading {shard_file}...")

        shard_weights = load_file(shard_path)
        print(f"   Loaded {len(shard_weights)} tensors")

        # Merge into all_weights
        all_weights.update(shard_weights)

    print(f"📊 Total tensors loaded: {len(all_weights)}")
    return all_weights

def convert_unsloth_to_tensorrt():
    """Convert unsloth model to TensorRT-LLM format with strict naming requirements"""

    TRT_CHECKPOINT_DIR = "/home/james/gemma3_unsloth_tensorrt"

    print("🔹 Loading unsloth HF16 model...")
    hf_weights = load_unsloth_model()

    # Create TensorRT-LLM weights with exact naming requirements
    trt_weights = OrderedDict()

    # Core embeddings
    if "model.embed_tokens.weight" in hf_weights:
        trt_weights["transformer.vocab_embedding.weight"] = hf_weights["model.embed_tokens.weight"]
        print("✓ Embedded tokens converted")

    # Final layer norm
    if "model.norm.weight" in hf_weights:
        trt_weights["transformer.ln_f.weight"] = hf_weights["model.norm.weight"]
        print("✓ Final layer norm converted")

    # Convert all 48 layers
    print("🔄 Converting 48 transformer layers...")

    for i in range(48):
        layer_prefix_hf = f"model.layers.{i}"
        layer_prefix_trt = f"transformer.layers.{i}"

        # Layer normalization
        if f"{layer_prefix_hf}.input_layernorm.weight" in hf_weights:
            trt_weights[f"{layer_prefix_trt}.input_layernorm.weight"] = hf_weights[f"{layer_prefix_hf}.input_layernorm.weight"]

        if f"{layer_prefix_hf}.post_attention_layernorm.weight" in hf_weights:
            trt_weights[f"{layer_prefix_trt}.post_layernorm.weight"] = hf_weights[f"{layer_prefix_hf}.post_attention_layernorm.weight"]

        # MLP layers
        mlp_mappings = {
            "mlp.gate_proj.weight": "mlp.gate.weight",
            "mlp.up_proj.weight": "mlp.fc.weight",
            "mlp.down_proj.weight": "mlp.proj.weight"
        }

        for hf_suffix, trt_suffix in mlp_mappings.items():
            hf_key = f"{layer_prefix_hf}.{hf_suffix}"
            if hf_key in hf_weights:
                trt_weights[f"{layer_prefix_trt}.{trt_suffix}"] = hf_weights[hf_key]

        # Attention - combine q,k,v into qkv
        q_key = f"{layer_prefix_hf}.self_attn.q_proj.weight"
        k_key = f"{layer_prefix_hf}.self_attn.k_proj.weight"
        v_key = f"{layer_prefix_hf}.self_attn.v_proj.weight"

        if all(key in hf_weights for key in [q_key, k_key, v_key]):
            q_weight = hf_weights[q_key]
            k_weight = hf_weights[k_key]
            v_weight = hf_weights[v_key]

            # Combine q,k,v weights for TensorRT-LLM
            qkv_weight = torch.cat([q_weight, k_weight, v_weight], dim=0)
            trt_weights[f"{layer_prefix_trt}.attention.qkv.weight"] = qkv_weight

        # Attention output projection
        o_key = f"{layer_prefix_hf}.self_attn.o_proj.weight"
        if o_key in hf_weights:
            trt_weights[f"{layer_prefix_trt}.attention.dense.weight"] = hf_weights[o_key]

        if i % 10 == 0:
            print(f"✓ Processed layer {i}")

    print(f"📊 Created {len(trt_weights)} TensorRT-LLM tensors")

    # Create output directory
    os.makedirs(TRT_CHECKPOINT_DIR, exist_ok=True)

    # Save TensorRT-LLM checkpoint
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

    # File size info
    checkpoint_size = os.path.getsize(f"{TRT_CHECKPOINT_DIR}/rank0.safetensors") / (1024**3)
    print(f"📁 Files created:")
    print(f"   - rank0.safetensors ({checkpoint_size:.1f}GB)")
    print(f"   - config.json")

    return TRT_CHECKPOINT_DIR

if __name__ == "__main__":
    print("Converting unsloth HF16 model to TensorRT-LLM format...")

    try:
        checkpoint_dir = convert_unsloth_to_tensorrt()
        print("\n🎉 Conversion successful!")
        print("Next: Build TensorRT engine")
        print(f"Command: trtllm-build --checkpoint_dir {checkpoint_dir} --output_dir /home/james/gemma3_engine_unsloth")
    except Exception as e:
        print(f"\n❌ Conversion failed: {e}")
        import traceback
        traceback.print_exc()