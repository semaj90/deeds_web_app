"""
Concurrent multithreaded Gemma3 merge with progress bar
Uses thread pool to load shards in parallel
"""
import os
import gc
from safetensors import safe_open
from safetensors.torch import save_file
from tqdm import tqdm
import torch
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import OrderedDict

CHECKPOINT_DIR = r"\wsl.localhost\Ubuntu\home\james\gemma3_trtllm_checkpoint"

print("=" * 70)
print("Gemma3 Concurrent Merge (Multithreaded + Progress Bar + GPU)")
print("=" * 70)

if not os.path.exists(CHECKPOINT_DIR):
    print(f"\nCheckpoint not found: {CHECKPOINT_DIR}")
    CHECKPOINT_DIR = input("Enter path: ").strip()

OUTPUT_FILE = os.path.join(CHECKPOINT_DIR, "rank0.safetensors")

# Check GPU
device = "cuda" if torch.cuda.is_available() else "cpu"
if device == "cuda":
    gpu_name = torch.cuda.get_device_name(0)
    print(f"\n🚀 GPU: {gpu_name}")
else:
    print(f"\n📊 CPU mode (no GPU)")

print(f"Checkpoint: {CHECKPOINT_DIR}\n")

# Find all shards
shards = []
for i in range(1, 6):
    shard_name = f"model-0000{i}-of-00005.safetensors"
    shard_path = os.path.join(CHECKPOINT_DIR, shard_name)
    if os.path.exists(shard_path):
        size_gb = os.path.getsize(shard_path) / (1024**3)
        shards.append((shard_name, shard_path, size_gb))

print(f"Found {len(shards)} shards:\n")
for name, path, size in shards:
    print(f"  {name}: {size:.2f}GB")

total_size = sum(s[2] for s in shards)
print(f"\nTotal: {total_size:.2f}GB\n")

# Concurrent loading function
def load_shard(shard_info):
    shard_name, shard_path, size_gb = shard_info
    tensors = {}
    
    with safe_open(shard_path, framework="pt", device="cpu") as f:
        for key in f.keys():
            tensors[key] = f.get_tensor(key)
    
    return shard_name, tensors, len(tensors)

# Load shards concurrently with thread pool
print("Loading shards (multithreaded)...")
merged = OrderedDict()
total_tensors = 0

with ThreadPoolExecutor(max_workers=3) as executor:
    futures = {executor.submit(load_shard, shard): shard for shard in shards}
    
    with tqdm(total=len(shards), desc="Loading shards", unit="shard") as pbar:
        for future in as_completed(futures):
            shard_name, tensors, count = future.result()
            merged.update(tensors)
            total_tensors += count
            pbar.set_postfix({"tensors": total_tensors})
            pbar.update(1)
            del tensors
            gc.collect()

print(f"\n✅ Loaded {total_tensors} tensors from {total_size:.2f}GB")

# Save
print(f"\nSaving rank0.safetensors ({total_size:.2f}GB)...")
print("⏳ Writing to disk (2-5 minutes)...\n")

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
    print(f"Speed: {output_size/elapsed:.2f} GB/s")
    
except Exception as e:
    print(f"\n❌ ERROR: {e}")
    input("Press Enter to exit...")
    exit(1)

print(f"\n{'='*70}")
input("Press Enter to exit...")
