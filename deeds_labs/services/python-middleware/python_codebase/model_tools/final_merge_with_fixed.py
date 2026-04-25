#!/usr/bin/env python3
"""
Final Merge with Fixed BFloat16
Uses incremental saves to avoid memory issues
"""
import os
import gc

def final_merge():
    from safetensors.torch import load_file, save_file

    print("🚀 Final Merge with Fixed BFloat16")
    print("==================================")

    output_file = "./gemma3_trt_checkpoint/rank0.safetensors"

    # Start fresh
    all_tensors = {}

    # Process files one by one with saves after each
    files = [
        "./temp_shards/temp_01.safetensors",
        "./temp_shards/temp_02.safetensors",
        "./temp_shards/temp_03.safetensors",
        "./temp_shards/temp_04.safetensors",
        "./temp_shards/temp_05_fixed.safetensors"  # Use the fixed version
    ]

    for i, file in enumerate(files, 1):
        print(f"\n[{i}/5] Processing {os.path.basename(file)}...")

        # Load current file
        tensors = load_file(file)
        print(f"  📥 Loaded {len(tensors)} tensors")

        # Add to collection
        for name, tensor in tensors.items():
            all_tensors[name] = tensor

        print(f"  📊 Total tensors: {len(all_tensors)}")

        # Save after each file to avoid final memory spike
        print(f"  💾 Saving checkpoint...")
        save_file(all_tensors, output_file)

        size_gb = os.path.getsize(output_file) / (1024**3)
        print(f"  ✅ Checkpoint saved: {size_gb:.1f}GB")

        # Cleanup
        del tensors
        gc.collect()

    # Final verification
    print("\n🔍 Final verification...")
    verify = load_file(output_file)
    print(f"✅ Successfully loaded {len(verify)} tensors")

    final_size = os.path.getsize(output_file) / (1024**3)
    print(f"\n🎉 SUCCESS!")
    print(f"📊 Total tensors: {len(verify)}")
    print(f"📊 File size: {final_size:.2f}GB")
    print(f"📂 Output: {output_file}")
    print("\n✅ Ready for TensorRT engine build!")

    return True

if __name__ == "__main__":
    try:
        final_merge()
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()