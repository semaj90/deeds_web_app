#!/usr/bin/env python3
"""
Analyze the 19GB checkpoint and compare with expected Gemma structure
"""

from safetensors.torch import load_file
import json
import os

def analyze_checkpoint():
    checkpoint_dir = "/home/james/gemma3_trt_ready"
    model_path = os.path.join(checkpoint_dir, "rank0.safetensors")
    config_path = os.path.join(checkpoint_dir, "config.json")

    print("🔍 Analyzing 19GB checkpoint structure")

    # Load config
    with open(config_path, 'r') as f:
        config = json.load(f)

    print(f"📊 Model config:")
    print(f"  Architecture: {config.get('architectures', ['Unknown'])[0]}")
    print(f"  Layers: {config.get('num_hidden_layers', 'Unknown')}")
    print(f"  Hidden size: {config.get('hidden_size', 'Unknown')}")
    print(f"  Vocab size: {config.get('vocab_size', 'Unknown')}")

    # Load and analyze tensors
    print(f"\n🔄 Loading tensors from {model_path}")
    tensors = load_file(model_path, device="cpu")

    print(f"✅ Loaded {len(tensors)} tensors")

    # Analyze tensor structure
    layer_counts = {}
    tensor_types = {}

    for name, tensor in tensors.items():
        # Extract layer info
        if 'layers.' in name:
            layer_num = name.split('layers.')[1].split('.')[0]
            layer_counts[layer_num] = layer_counts.get(layer_num, 0) + 1

        # Extract tensor type
        if '.' in name:
            tensor_type = name.split('.')[-1]
            tensor_types[tensor_type] = tensor_types.get(tensor_type, 0) + 1

        # Show first few tensors
        if list(tensors.keys()).index(name) < 10:
            print(f"  {name}: {tensor.shape}")

    print(f"\n📊 Layer analysis:")
    for layer, count in sorted(layer_counts.items(), key=lambda x: int(x[0])):
        print(f"  Layer {layer}: {count} tensors")

    print(f"\n📊 Tensor type analysis:")
    for tensor_type, count in sorted(tensor_types.items()):
        print(f"  {tensor_type}: {count} tensors")

    # Expected vs actual
    expected_layers = config.get('num_hidden_layers', 42)
    actual_layers = len(layer_counts)

    print(f"\n🎯 Layer completeness:")
    print(f"  Expected layers: {expected_layers}")
    print(f"  Found layers: {actual_layers}")
    print(f"  Complete: {'✅' if actual_layers >= expected_layers else '❌'}")

    # Check for critical missing tensors
    critical_tensors = [
        'embed_tokens.weight',
        'norm.weight',
        'lm_head.weight'
    ]

    print(f"\n🔍 Critical tensor check:")
    for critical in critical_tensors:
        found = any(critical in name for name in tensors.keys())
        print(f"  {critical}: {'✅' if found else '❌'}")

    return len(tensors), actual_layers, expected_layers

if __name__ == "__main__":
    analyze_checkpoint()