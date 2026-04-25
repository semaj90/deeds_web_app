#!/usr/bin/env python3
"""
Find Correct Tensor Combination
Tests different combinations to find the one that gives us 1065 tensors
"""
import os
import gc

def test_combinations():
    """Test different file combinations to get 1065 tensors"""

    try:
        from safetensors.torch import load_file, save_file
        import torch
        print("✅ Required modules imported")
    except ImportError as e:
        print(f"❌ Import error: {e}")
        return False

    base_dir = "/mnt/c/Users/james/Videos/deeds-web-app"
    os.chdir(base_dir)

    print("🔍 Finding Correct Tensor Combination")
    print("=====================================")

    # All possible source files
    possible_files = {
        'temp_01': './temp_shards/temp_01.safetensors',
        'temp_02': './temp_shards/temp_02.safetensors',
        'temp_03': './temp_shards/temp_03.safetensors',
        'temp_04': './temp_shards/temp_04.safetensors',
        'temp_05_original': './temp_shards/temp_05.safetensors',
        'temp_05_fixed': './temp_shards/temp_05_fixed.safetensors',
        'model_01': './model_unsloth_hf_f16/model-00001-of-00005-004.safetensors',
        'model_02': './model_unsloth_hf_f16/model-00002-of-00005-003.safetensors',
        'model_03': './model_unsloth_hf_f16/model-00003-of-00005-001.safetensors',
        'model_04': './model_unsloth_hf_f16/model-00004-of-00005-002.safetensors',
        'model_05': './model_unsloth_hf_f16/model-00005-of-00005-005.safetensors'
    }

    # First, check each file individually
    print("\n1️⃣ Checking individual files:")
    file_info = {}

    for name, path in possible_files.items():
        if os.path.exists(path):
            try:
                tensors = load_file(path)
                tensor_count = len(tensors)

                # Check for BFloat16
                has_bfloat16 = False
                for _, tensor in tensors.items():
                    if tensor.dtype == torch.bfloat16:
                        has_bfloat16 = True
                        break

                file_info[name] = {
                    'path': path,
                    'count': tensor_count,
                    'bfloat16': has_bfloat16
                }

                status = "⚠️ BFloat16" if has_bfloat16 else "✅"
                print(f"  {status} {name}: {tensor_count} tensors")

                del tensors
                gc.collect()

            except Exception as e:
                print(f"  ❌ {name}: Error - {e}")
        else:
            print(f"  ❌ {name}: Not found")

    # Test combinations
    print("\n2️⃣ Testing combinations:")

    # Combination 1: temp files with fixed temp_05
    print("\n  Combo A: temp_01-04 + temp_05_fixed")
    combo_a = ['temp_01', 'temp_02', 'temp_03', 'temp_04', 'temp_05_fixed']
    total_a = sum(file_info.get(f, {}).get('count', 0) for f in combo_a)
    print(f"    Total: {total_a} tensors")

    # Combination 2: original model files with BFloat16 conversion
    print("\n  Combo B: model_01-05 (with BFloat16 conversion)")
    combo_b = ['model_01', 'model_02', 'model_03', 'model_04', 'model_05']
    total_b = sum(file_info.get(f, {}).get('count', 0) for f in combo_b)
    print(f"    Total: {total_b} tensors")

    # Find unique tensors (check for duplicates)
    print("\n3️⃣ Checking for unique tensors:")

    # Load temp_01-04
    unique_tensors = set()
    for i in range(1, 5):
        name = f'temp_{i:02d}'
        path = f'./temp_shards/{name}.safetensors'
        if os.path.exists(path):
            tensors = load_file(path)
            unique_tensors.update(tensors.keys())
            del tensors
            gc.collect()

    print(f"  Unique in temp_01-04: {len(unique_tensors)} tensors")

    # Check temp_05_fixed
    if os.path.exists('./temp_shards/temp_05_fixed.safetensors'):
        tensors = load_file('./temp_shards/temp_05_fixed.safetensors')
        new_tensors = set(tensors.keys()) - unique_tensors
        print(f"  New in temp_05_fixed: {len(new_tensors)} tensors")
        unique_tensors.update(tensors.keys())
        del tensors
        gc.collect()

    print(f"  Total unique: {len(unique_tensors)} tensors")

    # Recommendation
    print("\n✅ RECOMMENDATION:")
    if len(unique_tensors) == 1065:
        print("  Use temp_01-04 + temp_05_fixed = 1065 tensors")
        return True
    elif total_a == 1065:
        print("  Use Combo A (might have duplicates but should work)")
        return True
    else:
        print(f"  Need to investigate further. Got {len(unique_tensors)} unique tensors")
        print("  Try using original model files with BFloat16 conversion")
        return False

if __name__ == "__main__":
    try:
        success = test_combinations()
        exit(0 if success else 1)
    except Exception as e:
        print(f"❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)