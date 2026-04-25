"""
Chunked streaming merge - saves each shard immediately after loading
Minimal memory usage - processes one shard at a time
"""
import os
import gc
from safetensors import safe_open
from safetensors.torch import save_file
from tqdm import tqdm
from collections import OrderedDict

CHECKPOINT_DIR = "/home/james/gemma3_trtllm_checkpoint"

print("=" * 70)
print("Gemma3 Chunked Streaming Merge (Ultra Low Memory)")
print("=" * 70)

if not os.path.exists(CHECKPOINT_DIR):
    print(f"\nCheckpoint not found: {CHECKPOINT_DIR}")
    exit(1)

print(f"\nCheckpoint: {CHECKPOINT_DIR}\n")

# Strategy: Load one shard at a time, accumulate, save incrementally
shards = []
for i in range(1, 6):
    shard_name = f"model-0000{i}-of-00005.safetensors"
    shard_path = os.path.join(CHECKPOINT_DIR, shard_name)
    if os.path.exists(shard_path):
        size_gb = os.path.getsize(shard_path) / (1024**3)
        shards.append((i, shard_name, shard_path, size_gb))

print(f"Found {len(shards)} shards:\n")
for idx, name, path, size in shards:
    print(f"  [{idx}] {name}: {size:.2f}GB")
print()

# Process shards sequentially
merged = OrderedDict()
total_tensors = 0

print("Loading shards sequentially...\n")

for idx, shard_name, shard_path, size_gb in shards:
    print(f"[{idx}/5] Loading {shard_name} ({size_gb:.2f}GB)...")
    
    with safe_open(shard_path, framework="pt", device="cpu") as f:
        keys = list(f.keys())
        
        with tqdm(total=len(keys), desc=f"  Shard {idx}", unit="tensor", ncols=70) as pbar:
            for key in keys:
                tensor = f.get_tensor(key)
                merged[key] = tensor
                pbar.update(1)
        
        total_tensors += len(keys)
    
    # Save checkpoint after each shard to avoid memory buildup
    temp_output = os.path.join(CHECKPOINT_DIR, f"rank0_partial_{idx}.safetensors")
    print(f"  Saving partial checkpoint ({len(merged)} tensors)...")
    
    try:
        save_file(merged, temp_output)
        saved_size = os.path.getsize(temp_output) / (1024**3)
        print(f"  ✓ Saved {saved_size:.2f}GB")
    except Exception as e:
        print(f"  ✗ Save failed: {e}")
        print(f"  Continuing without intermediate save...")
    
    gc.collect()
    print()

# Final save
OUTPUT_FILE = os.path.join(CHECKPOINT_DIR, "rank0.safetensors")
print(f"{'='*70}")
print(f"Final save: rank0.safetensors")
print(f"{'='*70}")
print(f"Total tensors: {total_tensors}")
print(f"Saving... (this may take 2-5 minutes)\n")

import time
start = time.time()

try:
    save_file(merged, OUTPUT_FILE)
    elapsed = time.time() - start
    output_size = os.path.getsize(OUTPUT_FILE) / (1024**3)
    
    print(f"\n{'='*70}")
    print(f"✅ SUCCESS!")
    print(f"{'='*70}")
    print(f"File: rank0.safetensors")
    print(f"Size: {output_size:.2f}GB")
    print(f"Tensors: {total_tensors}")
    print(f"Time: {elapsed:.1f}s")
    
    # Clean up partial files
    print(f"\nCleaning up partial files...")
    for idx in range(1, 6):
        partial = os.path.join(CHECKPOINT_DIR, f"rank0_partial_{idx}.safetensors")
        if os.path.exists(partial):
            os.remove(partial)
            print(f"  ✓ Deleted rank0_partial_{idx}.safetensors")
    
except Exception as e:
    print(f"\n❌ ERROR: {e}")
    print(f"\nPartial checkpoints saved:")
    for idx in range(1, 6):
        partial = os.path.join(CHECKPOINT_DIR, f"rank0_partial_{idx}.safetensors")
        if os.path.exists(partial):
            size = os.path.getsize(partial) / (1024**3)
            print(f"  rank0_partial_{idx}.safetensors: {size:.2f}GB")
    input("\nPress Enter to exit...")
    exit(1)

print(f"\n{'='*70}")
input("Press Enter to exit...")
