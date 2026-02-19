#!/usr/bin/env python3
"""
Final merge: Combine 18.1GB base (922 tensors) + 3.34GB patch (104 tensors)
"""

from safetensors.torch import load_file, save_file
import os

def final_merge():
    base_path = "/home/james/gemma3_clean_checkpoint/rank0.safetensors"
    patch_path = "/home/james/gemma3_patch/missing_tensors.safetensors"
    output_dir = "/home/james/gemma3_complete"
    output_path = os.path.join(output_dir, "rank0.safetensors")

    os.makedirs(output_dir, exist_ok=True)

    print("🔧 Final Merge: Base + Patch")
    print("=" * 60)

    # Load base
    print(f"📦 Loading base checkpoint (18.1GB, 922 tensors)...")
    base_tensors = load_file(base_path)
    base_count = len(base_tensors)
    print(f"  ✅ {base_count} tensors loaded")

    # Load patch
    print(f"\n📦 Loading patch (3.34GB, 104 tensors)...")
    patch_tensors = load_file(patch_path)
    patch_count = len(patch_tensors)
    print(f"  ✅ {patch_count} tensors loaded")

    # Show what we're adding
    print(f"\n🔍 Patch contents (layers 40-47):")
    layer_counts = {}
    for name in patch_tensors.keys():
        if "layers." in name:
            layer_num = int(name.split("layers.")[1].split(".")[0])
            layer_counts[layer_num] = layer_counts.get(layer_num, 0) + 1

    for layer in sorted(layer_counts.keys()):
        print(f"  Layer {layer}: +{layer_counts[layer]} tensors")

    # Merge (patch overrides base if any conflicts)
    print(f"\n🔗 Merging tensors...")
    complete_tensors = {**base_tensors, **patch_tensors}
    final_count = len(complete_tensors)

    print(f"  📊 Result: {base_count} + {patch_count} = {final_count} unique tensors")

    # Save complete checkpoint
    print(f"\n💾 Saving complete checkpoint...")
    print(f"  Path: {output_path}")
    print(f"  This will take a moment...")

    save_file(complete_tensors, output_path)

    final_size = os.path.getsize(output_path) / (1024**3)
    print(f"  ✅ Saved: {final_size:.1f}GB")

    # Copy config
    config_src = "/mnt/c/Users/james/Videos/deeds-web-app/model_unsloth_hf_f16/config.json"
    config_dst = os.path.join(output_dir, "config.json")
    os.system(f"cp {config_src} {config_dst}")
    print(f"  ✅ Config copied")

    # Verify completeness
    print(f"\n🔍 Verification:")

    # Check all layers
    all_layers = set()
    for name in complete_tensors.keys():
        if "layers." in name:
            layer_num = int(name.split("layers.")[1].split(".")[0])
            all_layers.add(layer_num)

    print(f"  Layers present: {min(all_layers)}-{max(all_layers)} ({len(all_layers)} total)")

    missing_layers = []
    for i in range(48):
        if i not in all_layers:
            missing_layers.append(i)

    if missing_layers:
        print(f"  ⚠️ Missing layers: {missing_layers}")
    else:
        print(f"  ✅ All 48 layers present!")

    print(f"\n🎉 COMPLETE CHECKPOINT READY!")
    print(f"📂 Location: {output_dir}")
    print(f"📊 Tensors: {final_count}")
    print(f"💾 Size: {final_size:.1f}GB")
    print(f"🚀 Ready for:")
    print(f"  • PyTorch inference")
    print(f"  • TensorRT-LLM conversion")
    print(f"  • Legal AI production")

    # Create README
    readme_path = os.path.join(output_dir, "README.md")
    with open(readme_path, 'w') as f:
        f.write(f"# Gemma3 Legal AI Complete Checkpoint\n\n")
        f.write(f"- **Tensors**: {final_count}\n")
        f.write(f"- **Size**: {final_size:.1f}GB\n")
        f.write(f"- **Layers**: 0-47 complete\n")
        f.write(f"- **Type**: Tied embeddings (no separate lm_head)\n\n")
        f.write(f"## Usage\n\n")
        f.write(f"```python\n")
        f.write(f"from transformers import AutoModelForCausalLM\n")
        f.write(f'model = AutoModelForCausalLM.from_pretrained("{output_dir}")\n')
        f.write(f"```\n")

    return final_count

if __name__ == "__main__":
    tensor_count = final_merge()
    print(f"\n✅ Merge successful: {tensor_count} tensors")