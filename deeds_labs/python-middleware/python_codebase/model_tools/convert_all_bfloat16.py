#!/usr/bin/env python3
"""
Convert All BFloat16 Temp Files to Float16
Converts temp_01-04 from BFloat16 to Float16 format
"""
import os
import gc

def convert_all_bfloat16():
    """Convert all temp files from BFloat16 to Float16"""

    try:
        from safetensors.torch import load_file, save_file
        import torch
        print("✅ Required modules imported")
    except ImportError as e:
        print(f"❌ Import error: {e}")
        return False

    base_dir = "/mnt/c/Users/james/Videos/deeds-web-app"
    os.chdir(base_dir)

    print("🔄 Converting All BFloat16 Temp Files to Float16")
    print("================================================")

    # Convert temp_01 through temp_04
    for i in range(1, 5):
        temp_file = f"./temp_shards/temp_{i:02d}.safetensors"
        fixed_file = f"./temp_shards/temp_{i:02d}_fixed.safetensors"

        print(f"\n[{i}/4] Converting {temp_file}...")

        if not os.path.exists(temp_file):
            print(f"  ❌ File not found")
            continue

        try:
            # Load original file
            tensors = load_file(temp_file)
            print(f"  📥 Loaded {len(tensors)} tensors")

            # Convert BFloat16 to Float16
            converted_tensors = {}
            bf16_count = 0
            f16_count = 0
            other_count = 0

            for name, tensor in tensors.items():
                if tensor.dtype == torch.bfloat16:
                    # Convert BFloat16 -> Float32 -> Float16
                    converted_tensors[name] = tensor.float().half()
                    bf16_count += 1
                elif tensor.dtype == torch.float16:
                    converted_tensors[name] = tensor
                    f16_count += 1
                else:
                    # Keep other types as-is
                    converted_tensors[name] = tensor
                    other_count += 1

            print(f"  🔄 Converted {bf16_count} BFloat16 → Float16")
            print(f"  ✅ Kept {f16_count} Float16 tensors")
            if other_count > 0:
                print(f"  📋 Other types: {other_count}")

            # Save fixed file
            print(f"  💾 Saving to {fixed_file}...")
            save_file(converted_tensors, fixed_file)

            # Verify file size
            original_size = os.path.getsize(temp_file) / (1024**3)
            fixed_size = os.path.getsize(fixed_file) / (1024**3)
            print(f"  📊 Original: {original_size:.2f}GB → Fixed: {fixed_size:.2f}GB")

            # Cleanup
            del tensors
            del converted_tensors
            gc.collect()

            print(f"  ✅ Successfully converted temp_{i:02d}")

        except Exception as e:
            print(f"  ❌ Error converting temp_{i:02d}: {e}")
            continue

    # Verify we have all fixed files
    print(f"\n🔍 Verification:")
    all_fixed_files = []

    for i in range(1, 6):  # Include temp_05_fixed
        if i == 5:
            fixed_file = f"./temp_shards/temp_05_fixed.safetensors"
        else:
            fixed_file = f"./temp_shards/temp_{i:02d}_fixed.safetensors"

        if os.path.exists(fixed_file):
            size_gb = os.path.getsize(fixed_file) / (1024**3)
            all_fixed_files.append(fixed_file)
            print(f"  ✅ {os.path.basename(fixed_file)}: {size_gb:.2f}GB")
        else:
            print(f"  ❌ {os.path.basename(fixed_file)}: Missing")

    print(f"\n📊 Summary:")
    print(f"  Fixed files created: {len(all_fixed_files)}/5")
    total_size = sum(os.path.getsize(f) for f in all_fixed_files) / (1024**3)
    print(f"  Total size: {total_size:.2f}GB")

    if len(all_fixed_files) == 5:
        print(f"\n🎉 SUCCESS! All temp files converted to Float16")
        print(f"📋 Ready to merge:")
        for f in all_fixed_files:
            print(f"    {os.path.basename(f)}")
        return True
    else:
        print(f"\n⚠️ Some files missing. Need all 5 for complete merge.")
        return False

if __name__ == "__main__":
    try:
        success = convert_all_bfloat16()
        exit(0 if success else 1)
    except Exception as e:
        print(f"❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)