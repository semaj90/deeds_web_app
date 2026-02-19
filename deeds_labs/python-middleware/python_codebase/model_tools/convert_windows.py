#!/usr/bin/env python3
import os
import gc
import sys
from pathlib import Path
import shutil

print("🚀 Converting safetensors on Windows...")

# Windows paths
model_dir = r'C:\Users\james\Videos\deeds-web-app\model_unsloth_hf_f16'
output_dir = r'C:\Users\james\Videos\deeds-web-app\gemma3_trt_checkpoint'
temp_dir = r'C:\Users\james\Videos\deeds-web-app\temp_shards'

Path(output_dir).mkdir(exist_ok=True)

try:
    from safetensors.torch import load_file, save_file
    print("✅ safetensors imported successfully")
except ImportError:
    print("❌ safetensors not available. Install with:")
    print("pip install safetensors torch")
    sys.exit(1)

# Check if we have temp files or original files
if os.path.exists(temp_dir):
    print(f"📂 Using temp files from: {temp_dir}")
    source_dir = temp_dir
    source_files = sorted([f for f in os.listdir(temp_dir) if f.endswith('.safetensors')])
else:
    print(f"📂 Using original model files from: {model_dir}")
    source_dir = model_dir
    source_files = sorted([f for f in os.listdir(model_dir)
                          if f.endswith('.safetensors') and 'model-' in f and
                          not os.path.islink(os.path.join(model_dir, f))])

if not source_files:
    print("❌ No safetensor files found")
    sys.exit(1)

print(f"Found {len(source_files)} files:")
for f in source_files:
    size_mb = os.path.getsize(os.path.join(source_dir, f)) / (1024**2)
    print(f"  {f}: {size_mb:.1f}MB")

# Process files with minimal memory usage
combined_weights = {}
total_tensors = 0

for i, shard_file in enumerate(source_files, 1):
    shard_path = os.path.join(source_dir, shard_file)
    print(f"\n[{i}/{len(source_files)}] Loading {shard_file}...")

    try:
        weights = load_file(shard_path)
        tensor_count = len(weights)

        # Add weights to combined dict
        combined_weights.update(weights)
        total_tensors += tensor_count

        print(f"  ✅ Added {tensor_count} tensors (total: {total_tensors})")

        # Clear and cleanup
        del weights
        gc.collect()

    except Exception as e:
        print(f"  ❌ Error loading {shard_file}: {e}")
        continue

# Save combined file
rank0_file = os.path.join(output_dir, 'rank0.safetensors')
print(f"\n💾 Saving {len(combined_weights)} tensors to Windows file system...")

try:
    save_file(combined_weights, rank0_file)

    if os.path.exists(rank0_file):
        size_gb = os.path.getsize(rank0_file) / (1024**3)
        print(f"✅ SUCCESS! File saved: {size_gb:.1f}GB")
    else:
        print("❌ File not created")
        sys.exit(1)

except Exception as e:
    print(f"❌ Save failed: {e}")
    print(f"Error type: {type(e).__name__}")
    sys.exit(1)

# Copy config
config_src = os.path.join(model_dir, 'config.json')
config_dst = os.path.join(output_dir, 'config.json')
shutil.copy2(config_src, config_dst)
print("✅ Config copied")

print("\n🎉 Windows conversion complete!")
print(f"📂 Output: {rank0_file}")
print("\nNext: Use TensorRT-LLM tools to build .plan engine files")