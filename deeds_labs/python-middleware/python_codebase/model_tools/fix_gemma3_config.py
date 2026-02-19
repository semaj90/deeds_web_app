#!/usr/bin/env python3
"""
Fix Gemma3 config for TensorRT-LLM compatibility
Add missing layer_types attribute that TensorRT-LLM expects
"""
import json
import shutil
import os

def fix_gemma3_config():
    """Add missing layer_types to Gemma3 config for TensorRT-LLM"""

    source_dir = "/mnt/c/Users/james/Videos/deeds-web-app/model_unsloth_hf_f16"
    fixed_dir = "/home/james/gemma3_hf_fixed"

    # Create fixed directory
    os.makedirs(fixed_dir, exist_ok=True)

    print(f"📁 Creating fixed model directory: {fixed_dir}")

    # Copy all files from source to fixed directory
    print("📋 Copying model files...")
    for item in os.listdir(source_dir):
        source_item = os.path.join(source_dir, item)
        dest_item = os.path.join(fixed_dir, item)

        if os.path.isfile(source_item):
            shutil.copy2(source_item, dest_item)
        elif os.path.isdir(source_item):
            shutil.copytree(source_item, dest_item, dirs_exist_ok=True)

    # Load and fix config.json
    config_path = os.path.join(fixed_dir, "config.json")
    print(f"🔧 Fixing config.json at {config_path}")

    with open(config_path, 'r') as f:
        config = json.load(f)

    # Add required layer_types for TensorRT-LLM Gemma3
    # Gemma3 uses sliding window attention pattern
    num_layers = config.get("num_hidden_layers", 48)
    sliding_pattern = config.get("sliding_window_pattern", 6)

    # Create layer_types pattern: sliding attention every N layers
    layer_types = []
    for i in range(num_layers):
        if i % sliding_pattern == 0:
            layer_types.append("sliding_attention")
        else:
            layer_types.append("global_attention")

    # Add missing attributes for TensorRT-LLM
    config.update({
        "layer_types": layer_types,
        "sliding_window_pattern": sliding_pattern,
        "attn_implementation": "flash_attention_2",
        "rope_scaling": {
            "factor": 8.0,
            "rope_type": "linear"
        }
    })

    # Save fixed config
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)

    print(f"✅ Fixed config.json with {len(layer_types)} layer_types")
    print(f"✅ Layer pattern: sliding every {sliding_pattern} layers")
    print(f"✅ Model ready at: {fixed_dir}")

    return fixed_dir

if __name__ == "__main__":
    fixed_dir = fix_gemma3_config()
    print(f"\n🎉 Model fixed successfully!")
    print(f"📍 Use this path for TensorRT-LLM: {fixed_dir}")