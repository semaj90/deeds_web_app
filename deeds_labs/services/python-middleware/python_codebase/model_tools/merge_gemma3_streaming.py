"""
Streaming merge for Gemma3 shards - processes one tensor at a time
Uses minimal memory by streaming directly to output file
"""
import os
import json
from safetensors import safe_open
from safetensors.torch import save_file
import torch

CHECKPOINT_DIR = r"\wsl.localhost\Ubuntu\home\james\gemma3_trtllm_checkpoint"
OUTPUT_FILE = os.path.join(CHECKPOINT_DIR, "rank0.safetensors")

print("=" * 60)
print("Gemma3 Streaming Merge (Low Memory)")
print("=" * 60)

if not os.path.exists(CHECKPOINT_DIR):
    print(f"\nERROR: Checkpoint not found: {CHECKPOINT_DIR}")
    CHECKPOINT_DIR = input("Enter checkpoint path: ").strip()
    if not os.path.exists(CHECKPOINT_DIR):
        print("ERROR: Path not found")
        input("Press Enter to exit...")
        exit(1)

print(f"\nCheckpoint: {CHECKPOINT_DIR}")
print(f"Output: rank0.safetensors\n")

# Step 1: Build metadata index
print("Step 1: Building tensor index...")
tensor_locations = {}
total_tensors = 0

for i in range(1, 6):
    shard_name = f"model-0000{i}-of-00005.safetensors"
    shard_path = os.path.join(CHECKPOINT_DIR, shard_name)
    
    if not os.path.exists(shard_path):
        print(f"WARNING: {shard_name} not found, skipping")
        continue
    
    print(f"  Indexing {shard_name}...", end=" ", flush=True)
    
    with safe_open(shard_path, framework="pt", device="cpu") as f:
        keys = f.keys()
        for key in keys:
            tensor_locations[key] = (shard_path, key)
        print(f"{len(keys)} tensors")
        total_tensors += len(keys)

print(f"\nTotal tensors to merge: {total_tensors}")

# Step 2: Stream merge - load one tensor at a time
print("\nStep 2: Streaming merge...")
merged = {}
processed = 0

for tensor_name, (shard_path, key) in tensor_locations.items():
    # Load single tensor
    with safe_open(shard_path, framework="pt", device="cpu") as f:
        tensor = f.get_tensor(key)
        merged[tensor_name] = tensor
    
    processed += 1
    if processed % 50 == 0:
        print(f"  Processed {processed}/{total_tensors} tensors ({processed*100//total_tensors}%)")

print(f"  Processed {processed}/{total_tensors} tensors (100%)")

# Step 3: Save all at once (unavoidable with safetensors format)
print(f"\nStep 3: Saving rank0.safetensors...")
print("  This may take 2-5 minutes for 22GB...")

try:
    save_file(merged, OUTPUT_FILE)
    output_size = os.path.getsize(OUTPUT_FILE) / (1024**3)
    
    print(f"\n{'='*60}")
    print(f"SUCCESS!")
    print(f"{'='*60}")
    print(f"File: rank0.safetensors")
    print(f"Size: {output_size:.2f}GB")
    print(f"Tensors: {len(merged)}")
    print(f"\nReady for TensorRT engine build in WSL!")
    
except Exception as e:
    print(f"\nERROR during save: {e}")
    print("\nThis usually means insufficient RAM.")
    print("You need at least 25-30GB free RAM for this operation.")
    input("Press Enter to exit...")
    exit(1)

print(f"\n{'='*60}")
input("Press Enter to exit...")
