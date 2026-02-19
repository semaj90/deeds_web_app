"""
Windows script to merge Gemma3 TensorRT checkpoint shards into rank0.safetensors
"""
import os
import gc
from safetensors.torch import load_file, save_file

# Try multiple path formats for WSL
possible_paths = [
    r"\wsl.localhost\Ubuntu\home\james\gemma3_trtllm_checkpoint",
    r"\wsl$\Ubuntu\home\james\gemma3_trtllm_checkpoint",
    r"C:\Users\james\gemma3_trtllm_checkpoint"
]

CHECKPOINT_DIR = None
for path in possible_paths:
    if os.path.exists(path):
        CHECKPOINT_DIR = path
        break

if CHECKPOINT_DIR is None:
    print("=" * 60)
    print("ERROR: Cannot find checkpoint directory!")
    print("=" * 60)
    print("\nTried these paths:")
    for p in possible_paths:
        print(f"  {p}")
    print("\nPlease manually enter the path:")
    CHECKPOINT_DIR = input("Path: ").strip()
    
    if not os.path.exists(CHECKPOINT_DIR):
        print(f"\nERROR: Path not found: {CHECKPOINT_DIR}")
        input("Press Enter to exit...")
        exit(1)

OUTPUT_FILE = os.path.join(CHECKPOINT_DIR, "rank0.safetensors")

print("=" * 60)
print("Gemma3 Checkpoint Shard Merger")
print("=" * 60)
print(f"\nCheckpoint: {CHECKPOINT_DIR}")
print(f"Output: rank0.safetensors\n")

# Load and merge all shards
merged = {}
total_size_gb = 0

for i in range(1, 6):
    shard_name = f"model-0000{i}-of-00005.safetensors"
    shard_path = os.path.join(CHECKPOINT_DIR, shard_name)
    
    if not os.path.exists(shard_path):
        print(f"\nERROR: {shard_name} not found!")
        continue
    
    shard_size = os.path.getsize(shard_path) / (1024**3)
    total_size_gb += shard_size
    
    print(f"[{i}/5] Loading {shard_name} ({shard_size:.2f}GB)...", end=" ", flush=True)
    
    try:
        weights = load_file(shard_path)
        print(f"{len(weights)} tensors")
        
        merged.update(weights)
        print(f"      Total: {len(merged)} tensors")
        
        del weights
        gc.collect()
        
    except Exception as e:
        print(f"\nERROR: {e}")
        input("Press Enter to exit...")
        exit(1)

print(f"\n{'='*60}")
print(f"Loaded {len(merged)} tensors from {total_size_gb:.2f}GB")
print(f"{'='*60}")

# Save merged checkpoint
print(f"\nSaving rank0.safetensors...", flush=True)
try:
    save_file(merged, OUTPUT_FILE)
    output_size = os.path.getsize(OUTPUT_FILE) / (1024**3)
    
    print(f"\n{'='*60}")
    print(f"SUCCESS!")
    print(f"{'='*60}")
    print(f"File: {OUTPUT_FILE}")
    print(f"Size: {output_size:.2f}GB")
    print(f"Tensors: {len(merged)}")
    
except Exception as e:
    print(f"\nERROR: {e}")
    input("Press Enter to exit...")
    exit(1)

print(f"\n{'='*60}")
input("Press Enter to exit...")
