#!/usr/bin/env python3
"""
Find missing layers and merge complete Gemma3 model
"""

from safetensors.torch import load_file, save_file
import os
from collections import OrderedDict

def check_layers_in_file(file_path):
    """Check which layers are present in a safetensor file"""
    try:
        data = load_file(file_path)
        layers = set()
        for key in data.keys():
            if "layers." in key:
                parts = key.split(".")
                for i, part in enumerate(parts):
                    if part == "layers" and i+1 < len(parts):
                        layer_num = parts[i+1]
                        if layer_num.isdigit():
                            layers.add(int(layer_num))
                            break
        return sorted(layers), len(data)
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
        return [], 0

def main():
    # Check what we have
    print("=== Checking existing models ===")

    complete_model = "/home/james/gemma3_complete/rank0.safetensors"
    layers_complete, tensors_complete = check_layers_in_file(complete_model)
    print(f"Complete model: layers {layers_complete[:5]}...{layers_complete[-5:]} ({len(layers_complete)} layers, {tensors_complete} tensors)")

    # Find missing layers
    all_layers = set(range(48))
    missing_layers = sorted(all_layers - set(layers_complete))
    print(f"Missing layers: {missing_layers}")

    # Check unsloth sharded files
    print("\n=== Checking unsloth sharded files ===")
    unsloth_files = [
        "/mnt/c/Users/james/Videos/deeds-web-app/model_unsloth_hf_f16/model-00001-of-00005.safetensors",
        "/mnt/c/Users/james/Videos/deeds-web-app/model_unsloth_hf_f16/model-00002-of-00005.safetensors",
        "/mnt/c/Users/james/Videos/deeds-web-app/model_unsloth_hf_f16/model-00003-of-00005.safetensors",
        "/mnt/c/Users/james/Videos/deeds-web-app/model_unsloth_hf_f16/model-00004-of-00005.safetensors",
        "/mnt/c/Users/james/Videos/deeds-web-app/model_unsloth_hf_f16/model-00005-of-00005.safetensors"
    ]

    for file_path in unsloth_files:
        layers, tensors = check_layers_in_file(file_path)
        file_name = os.path.basename(file_path)
        if layers:
            print(f"{file_name}: layers {min(layers)}-{max(layers)} ({len(layers)} layers, {tensors} tensors)")
        else:
            print(f"{file_name}: No layers found or error")

    # Check which files have our missing layers
    print(f"\n=== Finding missing layers {missing_layers} ===")
    found_missing = {}

    for file_path in unsloth_files:
        layers, _ = check_layers_in_file(file_path)
        for missing_layer in missing_layers:
            if missing_layer in layers:
                if missing_layer not in found_missing:
                    found_missing[missing_layer] = []
                found_missing[missing_layer].append(os.path.basename(file_path))

    for layer, files in found_missing.items():
        print(f"Layer {layer}: found in {files}")

    # Check if we can complete the model
    missing_not_found = [layer for layer in missing_layers if layer not in found_missing]
    if missing_not_found:
        print(f"\n❌ Still missing layers: {missing_not_found}")
    else:
        print(f"\n✅ All missing layers found! Can create complete model.")

if __name__ == "__main__":
    main()