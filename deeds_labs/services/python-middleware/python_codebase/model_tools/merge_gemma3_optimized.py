"""
Optimized Gemma3 merge with progress bar and fast tensor copying
"""
import os
import gc
from safetensors import safe_open
from safetensors.torch import save_file
from tqdm import tqdm
import torch

CHECKPOINT_DIR = r"\wsl.localhost\Ubuntu\home\james\gemma3_trtllm_checkpoint"

print("=" * 60)
print("Gemma3 Optimized Merge (Progress Bar)")
print("=" * 60)

if not os.path.exists(CHECKPOINT_DIR):
    print(f"\nCheckpoint not found: {CHECKPOINT_DIR}")
    CHECKPOINT_DIR = input("Enter path: ").strip()

OUTPUT_FILE = os.path.join(CHECKPOINT_DIR, "rank0.safetensors")

# Enable GPU if available for faster tensor operations
device = "cuda" if torch.cuda.is_available() else "cpu"
if device == "cuda":
    print(f"\n🚀 GPU detected - using CUDA for faster processing")
else:
    print(f"\n📊 Using CPU (no GPU detected)")

print(f"\nCheckpoint: {CHECKPOINT_DIR}\n")

# Step 1: Count total tensors
print("Counting tensors...")
total_tensors = 0
shard_info = []

for i in range(1, 6):
    shard_name = f"model-0000{i}-of-00005.safetensors"
    shard_path = os.path.join(CHECKPOINT_DIR, shard_name)
    
    if not os.path.exists(shard_path):
        continue
    
    with safe_open(shard_path, framework="pt", device="cpu") as f:
        num_tensors = len(f.keys())
        total_tensors += num_tensors
        shard_info.append((shard_name, shard_path, num_tensors))

print(f"Total: {total_tensors} tensors across {len(shard_info)} shards\n")

# Step 2: Merge with progress bar
merged = {}

with tqdm(total=total_tensors, desc="Merging", unit="tensor", ncols=80) as pbar:
    for shard_name, shard_path, num_tensors in shard_info:
        pbar.set_description(f"Shard {shard_name[:15]}")
        
        with safe_open(shard_path, framework="pt", device="cpu") as f:
            for key in f.keys():
                tensor = f.get_tensor(key)
                # Keep on CPU to save VRAM for TensorRT build
                merged[key] = tensor
                pbar.update(1)
        
        gc.collect()

# Step 3: Save with status
print("\nSaving rank0.safetensors (22GB)...")
print("⏳ This takes 2-5 minutes - please wait...\n")

# Show progress hint
import time
start_time = time.time()

try:
    save_file(merged, OUTPUT_FILE)
    elapsed = time.time() - start_time
    output_size = os.path.getsize(OUTPUT_FILE) / (1024**3)
    
    print(f"\n{'='*60}")
    print(f"✅ SUCCESS!")
    print(f"{'='*60}")
    print(f"File: rank0.safetensors")
    print(f"Size: {output_size:.2f}GB")
    print(f"Tensors: {len(merged)}")
    print(f"Time: {elapsed:.1f} seconds")
    print(f"\n🎉 Ready for TensorRT engine build!")
    
except Exception as e:
    print(f"\n❌ ERROR: {e}")
    input("\nPress Enter to exit...")
    exit(1)

print(f"\n{'='*60}")
input("Press Enter to exit...")
