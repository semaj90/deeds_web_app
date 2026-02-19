#!/usr/bin/env python3
import os
import gc
import time
from pathlib import Path
from safetensors.torch import load_file, save_file
import shutil

print("🚀 Converting Gemma3 safetensors (streaming approach)...")

model_dir = '/mnt/c/Users/james/Videos/deeds-web-app/model_unsloth_hf_f16'
output_dir = '/mnt/c/Users/james/Videos/deeds-web-app/gemma3_trt_checkpoint'
temp_dir = '/mnt/c/Users/james/Videos/deeds-web-app/temp_conversion'

Path(output_dir).mkdir(exist_ok=True)
Path(temp_dir).mkdir(exist_ok=True)

# Find real safetensor files
shard_files = []
for f in os.listdir(model_dir):
    if f.endswith('.safetensors') and 'model-' in f:
        path = os.path.join(model_dir, f)
        if not os.path.islink(path):
            shard_files.append(f)

print(f"Found {len(shard_files)} files")

# Process files sequentially to minimize memory usage
all_tensors = {}
batch_size = 100  # Process 100 tensors at a time

for i, shard_file in enumerate(sorted(shard_files), 1):
    print(f"[{i}/{len(shard_files)}] Processing {shard_file}...")

    shard_path = os.path.join(model_dir, shard_file)

    try:
        weights = load_file(shard_path)
        print(f"  📦 Loaded {len(weights)} tensors")

        # Add tensors in batches
        batch_count = 0
        for key, tensor in weights.items():
            all_tensors[key] = tensor
            batch_count += 1

            # Periodic cleanup
            if batch_count % batch_size == 0:
                gc.collect()
                print(f"    Processed {batch_count}/{len(weights)} tensors")

        print(f"  ✅ Added all {len(weights)} tensors")

        # Clear weights and force cleanup
        del weights
        gc.collect()
        time.sleep(0.1)  # Brief pause

    except Exception as e:
        print(f"  ❌ Error loading {shard_file}: {e}")
        continue

print(f"\n💾 Saving {len(all_tensors)} tensors...")
print("⏰ This will take several minutes for ~24GB file...")

# Save the combined file
rank0_file = os.path.join(output_dir, 'rank0.safetensors')

try:
    save_file(all_tensors, rank0_file)
    print("✅ File saved successfully")
except Exception as e:
    print(f"❌ Error saving file: {e}")
    print("💡 Try running with more memory or smaller batch size")
    exit(1)

# Verify and get file size
if os.path.exists(rank0_file):
    size_gb = os.path.getsize(rank0_file) / (1024**3)
    print(f"📊 File size: {size_gb:.1f}GB")
else:
    print("❌ Output file not found")
    exit(1)

# Copy config
config_src = os.path.join(model_dir, 'config.json')
config_dst = os.path.join(output_dir, 'config.json')
shutil.copy2(config_src, config_dst)
print("✅ Config copied")

# Cleanup temp directory
shutil.rmtree(temp_dir, ignore_errors=True)

print("\n🎉 Conversion complete!")
print(f"📂 Checkpoint: {output_dir}")
print("🚀 Ready for: trtllm-build")