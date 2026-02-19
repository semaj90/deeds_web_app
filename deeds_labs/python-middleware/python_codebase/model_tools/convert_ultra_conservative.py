#!/usr/bin/env python3
"""
Ultra-Conservative Safetensor Conversion
Single-threaded, minimal memory, incremental saving
"""
import os
import gc
import time
from pathlib import Path

print("🚀 Ultra-Conservative Safetensor Conversion")
print("=" * 50)

def main():
    """Ultra-conservative single-threaded conversion"""

    # Paths
    base_dir = "/mnt/c/Users/james/Videos/deeds-web-app"
    temp_dir = os.path.join(base_dir, "temp_shards")
    output_dir = os.path.join(base_dir, "gemma3_trt_checkpoint")
    output_path = os.path.join(output_dir, "rank0.safetensors")

    Path(output_dir).mkdir(exist_ok=True)

    # Import safetensors
    try:
        from safetensors.torch import load_file, save_file
        print("✅ safetensors imported")
    except ImportError:
        print("❌ safetensors not available")
        return False

    # Find temp files
    temp_files = []
    for i in range(1, 6):
        temp_file = os.path.join(temp_dir, f"temp_{i:02d}.safetensors")
        if os.path.exists(temp_file):
            temp_files.append(temp_file)

    if not temp_files:
        print("❌ No temp files found")
        return False

    print(f"📂 Found {len(temp_files)} temp files")

    # Process ONE file at a time with minimal memory
    final_weights = {}

    for i, temp_file in enumerate(temp_files, 1):
        temp_name = os.path.basename(temp_file)
        print(f"\n[{i}/{len(temp_files)}] Processing {temp_name}...")

        try:
            # Load current temp file
            weights = load_file(temp_file)
            tensor_count = len(weights)
            print(f"  📦 Loaded {tensor_count} tensors")

            # Add to final dict in very small batches
            batch_size = 10  # Ultra-small batches
            keys = list(weights.keys())

            for batch_start in range(0, len(keys), batch_size):
                batch_end = min(batch_start + batch_size, len(keys))
                batch_keys = keys[batch_start:batch_end]

                # Add this batch
                for key in batch_keys:
                    final_weights[key] = weights[key]

                # Save checkpoint every 50 tensors
                if len(final_weights) % 50 == 0:
                    print(f"    💾 Checkpoint save at {len(final_weights)} tensors...")
                    try:
                        save_file(final_weights, output_path)
                        print(f"    ✅ Checkpoint saved")
                    except Exception as e:
                        print(f"    ⚠️ Checkpoint failed: {e}")

                # Force cleanup after each batch
                gc.collect()

            print(f"  ✅ Added {tensor_count} tensors (total: {len(final_weights)})")

            # Clear weights and force cleanup
            del weights
            del keys
            gc.collect()

        except Exception as e:
            print(f"  ❌ Error with {temp_name}: {e}")
            continue

    # Final save
    print(f"\n💾 Final save with {len(final_weights)} tensors...")

    try:
        save_file(final_weights, output_path)

        if os.path.exists(output_path):
            size_gb = os.path.getsize(output_path) / (1024**3)
            print(f"✅ SUCCESS! Final file: {size_gb:.1f}GB")

            # Copy config
            import shutil
            config_src = os.path.join(base_dir, "model_unsloth_hf_f16", "config.json")
            config_dst = os.path.join(output_dir, "config.json")
            shutil.copy2(config_src, config_dst)
            print("✅ Config copied")

            return True
        else:
            print("❌ Final file not created")
            return False

    except Exception as e:
        print(f"❌ Final save failed: {e}")
        return False

if __name__ == "__main__":
    try:
        success = main()
        if success:
            print("\n🎉 Conversion complete!")
            print("🚀 Ready for TensorRT build:")
            print("trtllm-build --checkpoint_dir ./gemma3_trt_checkpoint --output_dir ./gemma3_engines --max_batch_size 4 --max_input_len 2048 --max_seq_len 4096 --gemm_plugin float16 --gpt_attention_plugin float16 --remove_input_padding enable --log_level info")
        else:
            print("❌ Conversion failed")
    except Exception as e:
        print(f"❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()