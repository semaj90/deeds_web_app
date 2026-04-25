#!/usr/bin/env python3
"""
Convert Unsloth Gemma model to TensorRT-LLM format.

Maps HuggingFace weight names to TensorRT-LLM expected names:
- language_model.model.layers.X.* → transformer.layers.X.*
- Handles attention weight concatenation for QKV
- Handles MLP weight remapping
"""

import os
import argparse
from pathlib import Path
import json
import shutil
from typing import Dict, Any

import torch
from safetensors import safe_open
from safetensors.torch import save_file


def map_hf_to_trt_key(hf_key: str) -> str:
    """Map HuggingFace key to TensorRT-LLM key"""

    # Embeddings
    if hf_key == 'language_model.model.embed_tokens.weight':
        return 'transformer.vocab_embedding.weight'

    if hf_key == 'language_model.model.norm.weight':
        return 'transformer.ln_f.weight'

    # Language model head
    if hf_key == 'language_model.lm_head.weight':
        return 'lm_head.weight'

    # Layer mappings
    if hf_key.startswith('language_model.model.layers.'):
        parts = hf_key.split('.')
        layer_idx = parts[3]  # layers.X.*

        if len(parts) < 5:
            return hf_key  # Not a valid layer key

        component = parts[4]  # self_attn, mlp, etc.

        if component == 'self_attn':
            attn_type = parts[5]  # q_proj, k_proj, v_proj, o_proj, q_norm, k_norm

            if attn_type == 'q_proj':
                return f'transformer.layers.{layer_idx}.attention.q.weight'
            elif attn_type == 'k_proj':
                return f'transformer.layers.{layer_idx}.attention.k.weight'
            elif attn_type == 'v_proj':
                return f'transformer.layers.{layer_idx}.attention.v.weight'
            elif attn_type == 'o_proj':
                return f'transformer.layers.{layer_idx}.attention.dense.weight'
            elif attn_type == 'q_norm':
                return f'transformer.layers.{layer_idx}.attention.q_layernorm.weight'
            elif attn_type == 'k_norm':
                return f'transformer.layers.{layer_idx}.attention.k_layernorm.weight'

        elif component == 'mlp':
            mlp_type = parts[5]  # gate_proj, up_proj, down_proj

            if mlp_type == 'gate_proj':
                return f'transformer.layers.{layer_idx}.mlp.gate.weight'
            elif mlp_type == 'up_proj':
                return f'transformer.layers.{layer_idx}.mlp.fc.weight'
            elif mlp_type == 'down_proj':
                return f'transformer.layers.{layer_idx}.mlp.proj.weight'

        # Normalization layers
        elif component in ['input_layernorm', 'post_attention_layernorm',
                          'post_feedforward_layernorm', 'pre_feedforward_layernorm']:
            if component == 'post_attention_layernorm':
                component = 'post_layernorm'
            return f'transformer.layers.{layer_idx}.{component}.weight'

    # Return original key if no mapping found
    return hf_key


def concatenate_qkv_weights(layer_tensors: Dict[str, torch.Tensor], layer_idx: str) -> Dict[str, torch.Tensor]:
    """Concatenate Q, K, V weights into single QKV weight for TensorRT-LLM"""

    result = {}

    # Check if we have all QKV components
    q_key = f'transformer.layers.{layer_idx}.attention.q.weight'
    k_key = f'transformer.layers.{layer_idx}.attention.k.weight'
    v_key = f'transformer.layers.{layer_idx}.attention.v.weight'

    if q_key in layer_tensors and k_key in layer_tensors and v_key in layer_tensors:
        q_weight = layer_tensors[q_key]
        k_weight = layer_tensors[k_key]
        v_weight = layer_tensors[v_key]

        # Concatenate along output dimension (dim=0 for weight matrices)
        qkv_weight = torch.cat([q_weight, k_weight, v_weight], dim=0)

        # Replace individual weights with concatenated QKV
        result[f'transformer.layers.{layer_idx}.attention.qkv.weight'] = qkv_weight

        # Remove individual QKV weights
        del layer_tensors[q_key]
        del layer_tensors[k_key]
        del layer_tensors[v_key]

    return result


def adjust_qk_layernorm_tensor(key: str, tensor: torch.Tensor, head_size: int) -> torch.Tensor:
    """Slice Q/K layernorm weights down to head_size entries if needed."""
    if not key.endswith(('attention.q_layernorm.weight', 'attention.k_layernorm.weight')):
        return tensor

    if tensor.shape[0] == head_size:
        return tensor

    if tensor.shape[0] < head_size:
        raise ValueError(
            f"Tensor {key} has smaller dimension ({tensor.shape[0]}) than head_size ({head_size})"
        )

    # TRT-LLM expects only the first head_size entries.
    return tensor[:head_size].clone()


def convert_checkpoint(hf_checkpoint_dir: str, output_dir: str) -> str:
    """Convert HuggingFace checkpoint to TensorRT-LLM format"""

    print(f"Converting checkpoint from {hf_checkpoint_dir} to {output_dir}")

    os.makedirs(output_dir, exist_ok=True)

    # Copy and update config
    config_path = Path(hf_checkpoint_dir) / 'config.json'
    if config_path.exists():
        with config_path.open('r') as f:
            config = json.load(f)

        # Update config for TensorRT-LLM
        config['architecture'] = 'Gemma3ForCausalLM'
        config.setdefault('architectures', ['Gemma3ForCausalLM'])
        config['dtype'] = config.get('torch_dtype', 'float16')

        head_size = config.get('head_dim')
        if head_size is None:
            hidden = config.get('hidden_size', 0)
            heads = config.get('num_attention_heads', 1) or 1
            head_size = max(1, hidden // heads)
            config['head_dim'] = head_size

        with open(os.path.join(output_dir, 'config.json'), 'w') as f:
            json.dump(config, f, indent=2)
    else:
        raise FileNotFoundError(f"Missing config.json in {hf_checkpoint_dir}")

    # Copy tokenizer files
    for filename in ['tokenizer.json', 'tokenizer.model', 'tokenizer_config.json']:
        src = Path(hf_checkpoint_dir) / filename
        if src.exists():
            shutil.copy(src, os.path.join(output_dir, filename))

    # Process all shards
    shard_files = sorted([
        f for f in os.listdir(hf_checkpoint_dir)
        if f.endswith('.safetensors') and 'rank' not in f
    ])
    if not shard_files:
        raise RuntimeError("No .safetensors shards found to convert")

    all_tensors = {}

    for shard_file in shard_files:
        shard_path = os.path.join(hf_checkpoint_dir, shard_file)
        print(f"Processing {shard_file}...")

        with safe_open(shard_path, framework='pt', device='cpu') as f:
            num_keys = len(f.keys())
            for hf_key in f.keys():
                tensor = f.get_tensor(hf_key)
                trt_key = map_hf_to_trt_key(hf_key)

                tensor = adjust_qk_layernorm_tensor(trt_key, tensor, head_size)

                if trt_key in all_tensors:
                    print(f"Warning: duplicate key {trt_key}, overwriting")

                all_tensors[trt_key] = tensor
        print(f"  captured {num_keys} tensors")

    # Handle QKV concatenation per layer
    final_tensors = {}
    layer_groups = {}

    # Group tensors by layer
    for key, tensor in all_tensors.items():
        if key.startswith('transformer.layers.'):
            parts = key.split('.')
            if len(parts) >= 3:
                layer_idx = parts[2]
                if layer_idx not in layer_groups:
                    layer_groups[layer_idx] = {}
                layer_groups[layer_idx][key] = tensor
        else:
            final_tensors[key] = tensor

    # Process each layer
    for layer_idx, layer_tensors in layer_groups.items():
        # Concatenate QKV weights
        qkv_updates = concatenate_qkv_weights(layer_tensors, layer_idx)
        final_tensors.update(qkv_updates)

        # Add remaining layer tensors
        for key, tensor in layer_tensors.items():
            final_tensors[key] = tensor

    # Save final checkpoint
    output_file = os.path.join(output_dir, 'rank0.safetensors')
    save_file(final_tensors, output_file)

    print(f"Conversion complete! Saved {len(final_tensors)} tensors to {output_file}")
    return output_file


def main():
    parser = argparse.ArgumentParser(
        description="Convert Unsloth/HF Gemma checkpoint to TensorRT-LLM format"
    )
    parser.add_argument(
        "--src",
        required=True,
        help="Path to the source HuggingFace checkpoint directory",
    )
    parser.add_argument(
        "--dst",
        required=True,
        help="Path where the TensorRT-ready checkpoint should be written",
    )
    args = parser.parse_args()

    src = os.path.abspath(args.src)
    dst = os.path.abspath(args.dst)

    print("Starting Gemma -> TensorRT-LLM conversion...")
    print(f"Source: {src}")
    print(f"Destination: {dst}")
    output_file = convert_checkpoint(src, dst)
    print(f"Success! TensorRT-LLM checkpoint ready at: {output_file}")


if __name__ == '__main__':
    main()
