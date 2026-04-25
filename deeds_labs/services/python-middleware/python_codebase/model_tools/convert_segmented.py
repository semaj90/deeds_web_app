#!/usr/bin/env python3
import os
import gc
import sys
from pathlib import Path
from safetensors.torch import load_file, save_file
import shutil

print("🚀 Converting using segmented approach to avoid OOM killer...")

model_dir = '/mnt/c/Users/james/Videos/deeds-web-app/model_unsloth_hf_f16'
output_dir = '/mnt/c/Users/james/Videos/deeds-web-app/gemma3_trt_checkpoint'
temp_dir = '/mnt/c/Users/james/Videos/deeds-web-app/temp_shards'

Path(output_dir).mkdir(exist_ok=True)

# Check system limits first
print("🔍 Checking system resources...")
try:
    with open('/proc/meminfo', 'r') as f:
        meminfo = f.read()
        for line in meminfo.split('\n'):
            if 'MemAvailable' in line:
                mem_kb = int(line.split()[1])
                mem_gb = mem_kb / (1024**2)
                print(f"Available memory: {mem_gb:.1f}GB")
                if mem_gb < 8:
                    print("⚠️ Warning: Less than 8GB available memory")
except:
    print("Could not read memory info")

# Check if temp files exist
temp_files = sorted([f for f in os.listdir(temp_dir) if f.endswith('.safetensors')])
print(f"✅ Found {len(temp_files)} temp files")

# Instead of loading all into memory, try a different approach:
# Load each temp file and immediately append to a growing dict, saving frequently

rank0_file = os.path.join(output_dir, 'rank0.safetensors')

# Try to process and save in smaller increments
incremental_weights = {}
segment_size = 200  # Save after every 200 tensors
total_processed = 0

try:
    for i, temp_file in enumerate(temp_files, 1):
        temp_path = os.path.join(temp_dir, temp_file)
        print(f"\n[{i}/{len(temp_files)}] Processing {temp_file}...")

        # Load temp file
        weights = load_file(temp_path)
        print(f"  📦 Loaded {len(weights)} tensors")

        # Add weights in small chunks
        for j, (key, tensor) in enumerate(weights.items()):
            incremental_weights[key] = tensor
            total_processed += 1

            # Save intermediate checkpoint every segment_size tensors
            if total_processed % segment_size == 0:
                print(f"    💾 Intermediate save at {total_processed} tensors...")

                # Try to save current state
                try:
                    save_file(incremental_weights, rank0_file)
                    print(f"    ✅ Saved checkpoint with {len(incremental_weights)} tensors")
                except Exception as save_error:
                    print(f"    ⚠️ Checkpoint save failed: {save_error}")
                    # Continue without failing completely

                gc.collect()

        print(f"  ✅ Added {len(weights)} tensors (total: {len(incremental_weights)})")

        # Clear the weights dict
        del weights
        gc.collect()

    # Final save
    print(f"\n💾 Final save with {len(incremental_weights)} tensors...")
    save_file(incremental_weights, rank0_file)

    if os.path.exists(rank0_file):
        size_gb = os.path.getsize(rank0_file) / (1024**3)
        print(f"✅ SUCCESS! Final file saved: {size_gb:.1f}GB")
    else:
        print("❌ Final file not created")
        sys.exit(1)

except MemoryError as e:
    print(f"❌ MEMORY ERROR:")
    print(f"   Error: {e}")
    print(f"   Processed: {total_processed} tensors")
    print(f"   In memory: {len(incremental_weights)} tensors")
    print(f"   Try: sudo sysctl vm.overcommit_memory=1")
    sys.exit(1)

except Exception as e:
    import traceback
    print(f"❌ ERROR during processing:")
    print(f"   Error: {e}")
    print(f"   Type: {type(e).__name__}")
    print(f"   Processed: {total_processed} tensors")
    print(f"   Traceback:")
    traceback.print_exc()

    # Check if we have a partial file
    if os.path.exists(rank0_file):
        size_gb = os.path.getsize(rank0_file) / (1024**3)
        print(f"   Partial file exists: {size_gb:.1f}GB")
    sys.exit(1)

# Copy config
config_src = os.path.join(model_dir, 'config.json')
config_dst = os.path.join(output_dir, 'config.json')
shutil.copy2(config_src, config_dst)
print("✅ Config copied")

print("\n🎉 Conversion complete!")
print(f"📂 Output: {rank0_file}")
print("\n🚀 Ready for TensorRT build:")
print("trtllm-build --checkpoint_dir ./gemma3_trt_checkpoint --output_dir ./gemma3_engines --max_batch_size 4 --max_input_len 2048 --max_seq_len 4096 --gemm_plugin float16 --gpt_attention_plugin float16 --remove_input_padding enable --log_level info")