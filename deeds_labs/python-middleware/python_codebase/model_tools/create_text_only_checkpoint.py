#!/usr/bin/env python3
"""
Create text-only checkpoint for TensorRT-LLM by removing vision components
"""

import os
import json
import shutil
from pathlib import Path
import safetensors
from safetensors.torch import load_file, save_file
import torch

def create_text_only_checkpoint(source_dir: str, output_dir: str):
    """Create text-only checkpoint by removing vision tensors"""

    source_path = Path(source_dir)
    output_path = Path(output_dir)

    print(f"Creating text-only checkpoint from {source_path}")
    print(f"Output directory: {output_path}")

    # Create output directory
    output_path.mkdir(exist_ok=True)

    # Load the source safetensors file
    safetensors_file = source_path / "rank0.safetensors"
    if not safetensors_file.exists():
        raise FileNotFoundError(f"Source safetensors not found: {safetensors_file}")

    print("Loading source checkpoint...")
    state_dict = load_file(str(safetensors_file))

    print(f"Original checkpoint has {len(state_dict)} tensors")

    # Define vision-related tensor patterns to remove
    vision_patterns = [
        "vision_",
        "visual_",
        "image_",
        "patch_embed",
        "cls_token",
        "pos_embed",
        "vision_tower",
        "mm_projector",
        "multi_modal_projector"
    ]

    # Filter out vision tensors
    text_only_state_dict = {}
    removed_tensors = []

    for key, tensor in state_dict.items():
        is_vision = any(pattern in key.lower() for pattern in vision_patterns)

        if not is_vision:
            text_only_state_dict[key] = tensor
        else:
            removed_tensors.append(key)

    print(f"Removed {len(removed_tensors)} vision tensors:")
    for tensor_name in removed_tensors[:10]:  # Show first 10
        print(f"  - {tensor_name}")
    if len(removed_tensors) > 10:
        print(f"  ... and {len(removed_tensors) - 10} more")

    print(f"Text-only checkpoint has {len(text_only_state_dict)} tensors")

    # Save the text-only checkpoint
    output_safetensors = output_path / "rank0.safetensors"
    print(f"Saving text-only checkpoint to {output_safetensors}")
    save_file(text_only_state_dict, str(output_safetensors))

    # Copy config.json if it exists
    config_file = source_path / "config.json"
    if config_file.exists():
        shutil.copy2(config_file, output_path / "config.json")
        print("Copied config.json")

        # Update config to remove vision components
        with open(output_path / "config.json", 'r') as f:
            config = json.load(f)

        # Remove vision-related config keys
        vision_config_keys = [
            "vision_config",
            "image_token_index",
            "vision_feature_select_strategy",
            "vision_feature_layer",
            "image_grid_pinpoints",
            "vision_tower"
        ]

        for key in vision_config_keys:
            if key in config:
                del config[key]
                print(f"Removed {key} from config")

        # Ensure it's text-only
        config["text_only"] = True
        config["is_multimodal"] = False

        with open(output_path / "config.json", 'w') as f:
            json.dump(config, f, indent=2)

        print("Updated config for text-only model")

    print("✅ Text-only checkpoint created successfully!")

    # Print file sizes
    orig_size = safetensors_file.stat().st_size / (1024**3)  # GB
    new_size = output_safetensors.stat().st_size / (1024**3)  # GB

    print(f"Original size: {orig_size:.2f} GB")
    print(f"Text-only size: {new_size:.2f} GB")
    print(f"Size reduction: {((orig_size - new_size) / orig_size * 100):.1f}%")

def main():
    """Main function"""

    # Use the complete checkpoint
    source_dir = "/home/james/gemma3_complete"
    output_dir = "/home/james/gemma3_text_only_checkpoint"

    try:
        create_text_only_checkpoint(source_dir, output_dir)
    except Exception as e:
        print(f"❌ Error creating text-only checkpoint: {e}")
        return 1

    return 0

if __name__ == "__main__":
    exit(main())