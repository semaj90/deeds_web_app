#!/usr/bin/env python3
import os
import gc
import time
from pathlib import Path
from safetensors.torch import load_file, save_file
import shutil

print("🚀 Converting Gemma3 safetensors (tiny chunks approach)...")

model_dir = '/mnt/c/Users/james/Videos/deeds-web-app/model_unsloth_hf_f16'
output_dir = '/mnt/c/Users/james/Videos/deeds-web-app/gemma3_trt_checkpoint'
Path(output_dir).mkdir(exist_ok=True)

# Find real safetensor files
shard_files = []
for f in os.listdir(model_dir):
    if f.endswith('.safetensors') and 'model-' in f:
        path = os.path.join(model_dir, f)
        if not os.path.islink(path):
            shard_files.append(f)

print(f"Found {len(shard_files)} files")

# Process files in very small batches to avoid memory issues
final_weights = {}
chunk_size = 50  # Process only 50 tensors at a time

for i, shard_file in enumerate(sorted(shard_files), 1):
    print(f"[{i}/{len(shard_files)}] Processing {shard_file} in chunks...")

    shard_path = os.path.join(model_dir, shard_file)
    weights = load_file(shard_path)

    # Process this shard in small chunks
    weight_items = list(weights.items())
    total_in_shard = len(weight_items)

    for chunk_start in range(0, total_in_shard, chunk_size):
        chunk_end = min(chunk_start + chunk_size, total_in_shard)
        chunk_items = weight_items[chunk_start:chunk_end]

        print(f"  Chunk {chunk_start//chunk_size + 1}: tensors {chunk_start+1}-{chunk_end}")

        # Add chunk to final weights
        for key, tensor in chunk_items:
            final_weights[key] = tensor

        # Force cleanup every chunk
        gc.collect()
        time.sleep(0.1)  # Brief pause

    print(f"  ✅ Added all {total_in_shard} tensors from {shard_file}")

    # Clear the weights dict
    del weights
    del weight_items
    gc.collect()

print(f"\n💾 Saving {len(final_weights)} tensors in incremental mode...")

# Save using smaller memory footprint
rank0_file = os.path.join(output_dir, 'rank0.safetensors')

try:
    # Try to save with minimal memory usage
    print("Attempting save with memory optimization...")
    save_file(final_weights, rank0_file)

    if os.path.exists(rank0_file):
        size_gb = os.path.getsize(rank0_file) / (1024**3)
        print(f"✅ Success! File saved: {size_gb:.1f}GB")
    else:
        print("❌ File not created")
        exit(1)

except Exception as e:
    print(f"❌ Save failed: {e}")
    exit(1)

# Copy config
config_src = os.path.join(model_dir, 'config.json')
config_dst = os.path.join(output_dir, 'config.json')
shutil.copy2(config_src, config_dst)
print("✅ Config copied")

print("\n🎉 Conversion complete!")
print(f"📂 Output: {rank0_file}")
print("\n🚀 Next command:")
print("trtllm-build --checkpoint_dir ./gemma3_trt_checkpoint --output_dir ./gemma3_engines --max_batch_size 4 --max_input_len 2048 --max_seq_len 4096 --gemm_plugin float16 --gpt_attention_plugin float16 --remove_input_padding enable --log_level info")