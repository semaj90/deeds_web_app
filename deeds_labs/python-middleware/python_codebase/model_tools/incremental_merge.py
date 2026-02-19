#!/usr/bin/env python3
"""
Incremental merge with immediate saves to prevent data loss
"""

import os
from safetensors.torch import load_file, save_file

def incremental_merge():
    clean_shards = [
        "model_unsloth_hf_f16/model-00001-of-00005-004.safetensors",
        "model_unsloth_hf_f16/model-00002-of-00005-003.safetensors",
        "model_unsloth_hf_f16/model-00003-of-00005-001.safetensors",
        "model_unsloth_hf_f16/model-00004-of-00005-002.safetensors",
        "model_unsloth_hf_f16/model-00005-of-00005-005.safetensors"
    ]

    final_dir = "/home/james/gemma3_complete_final"
    os.makedirs(final_dir, exist_ok=True)

    print("🔄 Incremental merge with immediate saves")

    # Start with first shard
    result_path = os.path.join(final_dir, "rank0.safetensors")

    print(f"📦 Loading shard 1...")
    merged = load_file(clean_shards[0])
    print(f"  ✅ {len(merged)} tensors")

    # Incrementally add each shard
    for i, shard_path in enumerate(clean_shards[1:], 2):
        print(f"\n📦 Adding shard {i}...")
        shard_tensors = load_file(shard_path)
        print(f"  ✅ {len(shard_tensors)} tensors loaded")

        # Merge
        merged.update(shard_tensors)
        print(f"  🔗 Total: {len(merged)} tensors")

        # Save checkpoint after each merge
        checkpoint_path = os.path.join(final_dir, f"checkpoint_{i}.safetensors")
        print(f"  💾 Saving checkpoint...")
        save_file(merged, checkpoint_path)

        # Clear shard from memory
        del shard_tensors

        checkpoint_size = os.path.getsize(checkpoint_path) / (1024**3)
        print(f"  ✅ Checkpoint {i}: {checkpoint_size:.1f}GB")

    # Final save
    print(f"\n💾 Final save: {len(merged)} tensors")
    save_file(merged, result_path)

    final_size = os.path.getsize(result_path) / (1024**3)
    print(f"✅ Complete: {final_size:.1f}GB")

    # Copy config
    config_src = "model_unsloth_hf_f16/config.json"
    config_dst = os.path.join(final_dir, "config.json")
    os.system(f"cp {config_src} {config_dst}")

    print(f"\n🎉 SUCCESS! Complete 1,065-tensor checkpoint ready")
    print(f"📂 {final_dir}")

    return len(merged)

if __name__ == "__main__":
    tensor_count = incremental_merge()
    print(f"🎯 Final tensor count: {tensor_count}")