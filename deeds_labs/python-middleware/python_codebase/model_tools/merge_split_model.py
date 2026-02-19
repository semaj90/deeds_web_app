#!/usr/bin/env python3
"""
Merge split Gemma model into complete TensorRT-LLM checkpoint
Combines layers 0-39 from fixed checkpoint with layers 40-47 from patch
"""

import os
import re
from pathlib import Path
from safetensors.torch import load_file, save_file
import torch

def rename_hf_to_trtllm(name: str):
    """Convert HuggingFace tensor names to TensorRT-LLM format"""

    # Language model prefix patterns
    patterns = [
        (r"language_model\.model\.embed_tokens\.weight", r"transformer.vocab_embedding.weight"),
        (r"language_model\.model\.layers\.(\d+)\.input_layernorm\.weight", r"transformer.layers.\1.input_layernorm.weight"),
        (r"language_model\.model\.layers\.(\d+)\.self_attn\.q_proj\.weight", r"transformer.layers.\1.attention.qkv.weight"),
        (r"language_model\.model\.layers\.(\d+)\.self_attn\.k_proj\.weight", None),  # merged with q_proj
        (r"language_model\.model\.layers\.(\d+)\.self_attn\.v_proj\.weight", None),  # merged with q_proj
        (r"language_model\.model\.layers\.(\d+)\.self_attn\.o_proj\.weight", r"transformer.layers.\1.attention.dense.weight"),
        (r"language_model\.model\.layers\.(\d+)\.self_attn\.q_norm\.weight", r"transformer.layers.\1.attention.q_layernorm.weight"),
        (r"language_model\.model\.layers\.(\d+)\.self_attn\.k_norm\.weight", r"transformer.layers.\1.attention.k_layernorm.weight"),
        (r"language_model\.model\.layers\.(\d+)\.mlp\.gate_proj\.weight", r"transformer.layers.\1.mlp.fc.weight"),
        (r"language_model\.model\.layers\.(\d+)\.mlp\.up_proj\.weight", None),  # merged with gate_proj
        (r"language_model\.model\.layers\.(\d+)\.mlp\.down_proj\.weight", r"transformer.layers.\1.mlp.proj.weight"),
        (r"language_model\.model\.layers\.(\d+)\.post_attention_layernorm\.weight", r"transformer.layers.\1.post_layernorm.weight"),
        (r"language_model\.model\.layers\.(\d+)\.pre_feedforward_layernorm\.weight", r"transformer.layers.\1.pre_feedforward_layernorm.weight"),
        (r"language_model\.model\.layers\.(\d+)\.post_feedforward_layernorm\.weight", r"transformer.layers.\1.post_feedforward_layernorm.weight"),
        (r"language_model\.model\.norm\.weight", r"transformer.ln_f.weight"),
    ]

    for source_pattern, target_pattern in patterns:
        if re.match(source_pattern, name):
            if target_pattern is None:
                return None  # Skip tensors that get merged
            else:
                return re.sub(source_pattern, target_pattern, name)

    # Skip vision components
    if any(skip in name.lower() for skip in ['vision_', 'visual_', 'image_', 'mm_projector']):
        return None

    return name  # Keep unknown patterns as-is

def merge_qkv_tensors(state_dict, layer_idx, prefix="language_model.model"):
    """Merge Q, K, V tensors into QKV format for TensorRT-LLM"""

    q_key = f"{prefix}.layers.{layer_idx}.self_attn.q_proj.weight"
    k_key = f"{prefix}.layers.{layer_idx}.self_attn.k_proj.weight"
    v_key = f"{prefix}.layers.{layer_idx}.self_attn.v_proj.weight"

    if all(key in state_dict for key in [q_key, k_key, v_key]):
        q_tensor = state_dict[q_key]
        k_tensor = state_dict[k_key]
        v_tensor = state_dict[v_key]

        # Concatenate Q, K, V tensors
        qkv_tensor = torch.cat([q_tensor, k_tensor, v_tensor], dim=0)

        return f"transformer.layers.{layer_idx}.attention.qkv.weight", qkv_tensor

    return None, None

def main():
    """Merge split model files into complete TensorRT checkpoint"""

    print("🔧 Merging Split Gemma Model for TensorRT-LLM")
    print("=" * 60)

    # File paths
    base_checkpoint = "/home/james/gemma3_trtllm_fixed/rank0.safetensors"
    patch_checkpoint = "/home/james/gemma3_patch/missing_tensors.safetensors"
    output_checkpoint = "/home/james/gemma3_complete_merged/rank0.safetensors"

    # Create output directory
    output_dir = Path(output_checkpoint).parent
    output_dir.mkdir(exist_ok=True)

    print(f"📥 Loading base checkpoint (layers 0-39): {base_checkpoint}")
    base_data = load_file(base_checkpoint)
    print(f"   Found {len(base_data)} tensors")

    print(f"📥 Loading patch checkpoint (layers 40-47): {patch_checkpoint}")
    patch_data = load_file(patch_checkpoint)
    print(f"   Found {len(patch_data)} tensors")

    # Start with base data
    merged_data = dict(base_data)

    # Get layer ranges
    base_layers = set()
    patch_layers = set()

    for key in base_data.keys():
        match = re.search(r'layers\.(\d+)\.', key)
        if match:
            base_layers.add(int(match.group(1)))

    for key in patch_data.keys():
        match = re.search(r'layers\.(\d+)\.', key)
        if match:
            patch_layers.add(int(match.group(1)))

    print(f"📊 Base layers: {sorted(base_layers)}")
    print(f"📊 Patch layers: {sorted(patch_layers)}")

    # Process patch data
    processed_patch = {}
    merged_tensors = set()

    # First, handle QKV merging for patch layers
    for layer_idx in sorted(patch_layers):
        qkv_name, qkv_tensor = merge_qkv_tensors(patch_data, layer_idx)
        if qkv_name and qkv_tensor is not None:
            processed_patch[qkv_name] = qkv_tensor
            merged_tensors.update([
                f"language_model.model.layers.{layer_idx}.self_attn.q_proj.weight",
                f"language_model.model.layers.{layer_idx}.self_attn.k_proj.weight",
                f"language_model.model.layers.{layer_idx}.self_attn.v_proj.weight"
            ])
            print(f"✅ Merged QKV for layer {layer_idx}")

    # Process remaining patch tensors
    for original_name, tensor in patch_data.items():
        if original_name in merged_tensors:
            continue  # Skip already merged tensors

        new_name = rename_hf_to_trtllm(original_name)
        if new_name is None:
            continue  # Skip tensors that should be dropped

        processed_patch[new_name] = tensor

    # Add processed patch data to merged data
    merged_data.update(processed_patch)

    print(f"📊 Final merged checkpoint has {len(merged_data)} tensors")

    # Verify we have all expected layers
    final_layers = set()
    for key in merged_data.keys():
        match = re.search(r'layers\.(\d+)\.', key)
        if match:
            final_layers.add(int(match.group(1)))

    print(f"📊 Final layers: {sorted(final_layers)}")

    expected_layers = set(range(48))  # Gemma should have 48 layers (0-47)
    missing_layers = expected_layers - final_layers

    if missing_layers:
        print(f"⚠️  Missing layers: {sorted(missing_layers)}")
    else:
        print("✅ All 48 layers present!")

    # Save merged checkpoint
    print(f"💾 Saving merged checkpoint: {output_checkpoint}")
    save_file(merged_data, output_checkpoint)

    # Copy config
    config_source = "/home/james/gemma3_complete/config.json"
    config_dest = output_dir / "config.json"

    if Path(config_source).exists():
        import shutil
        shutil.copy2(config_source, config_dest)
        print("✅ Copied config.json")

    # Get file sizes
    output_size = Path(output_checkpoint).stat().st_size / (1024**3)
    base_size = Path(base_checkpoint).stat().st_size / (1024**3)
    patch_size = Path(patch_checkpoint).stat().st_size / (1024**3)

    print(f"📊 Size comparison:")
    print(f"   Base checkpoint: {base_size:.2f} GB")
    print(f"   Patch checkpoint: {patch_size:.2f} GB")
    print(f"   Merged checkpoint: {output_size:.2f} GB")

    print("\n🎉 Model merging complete!")
    print(f"📁 Complete checkpoint: {output_checkpoint}")
    print("🚀 Ready for TensorRT engine building!")

    return 0

if __name__ == "__main__":
    exit(main())