"""
Windows script to merge Gemma3 TensorRT checkpoint shards into rank0.safetensors
Run with: python merge_gemma3_shards.py
"""
import os
import gc
from safetensors.torch import load_file, save_file

# WSL path accessible from Windows
CHECKPOINT_DIR = r"\wsl$\Ubuntu\home\james\gemma3_trtllm_checkpoint"
OUTPUT_FILE = os.path.join(CHECKPOINT_DIR, "rank0.safetensors")

print("=" * 60)
print("Gemma3 Checkpoint Shard Merger for Windows")
print("=" * 60)
print(f"\nCheckpoint directory: {CHECKPOINT_DIR}")
print(f"Output file: rank0.safetensors")

# Check if directory exists
if not os.path.exists(CHECKPOINT_DIR):
    print(f"\n❌ ERROR: Checkpoint directory not found!")
    print(f"   Make sure WSL is running and path is correct.")
    input("Press Enter to exit...")
    exit(1)

# Load and merge all shards
merged = {}
total_size_gb = 0

for i in range(1, 6):
    shard_name = f"model-0000{i}-of-00005.safetensors"
    shard_path = os.path.join(CHECKPOINT_DIR, shard_name)
    
    if not os.path.exists(shard_path):
        print(f"\n❌ ERROR: {shard_name} not found!")
        continue
    
    shard_size = os.path.getsize(shard_path) / (1024**3)
    total_size_gb += shard_size
    
    print(f"\n[{i}/5] Loading {shard_name} ({shard_size:.2f}GB)...", end=" ")
    
    try:
        weights = load_file(shard_path)
        print(f"{len(weights)} tensors")
        
        # Add to merged dict
        merged.update(weights)
        print(f"      Total tensors so far: {len(merged)}")
        
        # Free memory
        del weights
        gc.collect()
        
    except Exception as e:
        print(f"\n❌ ERROR loading shard: {e}")
        input("Press Enter to exit...")
        exit(1)

print(f"\n{'='*60}")
print(f"Merge complete: {len(merged)} total tensors from {total_size_gb:.2f}GB")
print(f"{'='*60}")

# Save merged checkpoint
print(f"\nSaving rank0.safetensors...", end=" ")
try:
    save_file(merged, OUTPUT_FILE)
    output_size = os.path.getsize(OUTPUT_FILE) / (1024**3)
    print(f"✅ DONE!")
    print(f"\n{'='*60}")
    print(f"✅ SUCCESS!")
    print(f"{'='*60}")
    print(f"Output: {OUTPUT_FILE}")
    print(f"Size: {output_size:.2f}GB")
    print(f"Tensors: {len(merged)}")
    print(f"\nNext step: Build TensorRT engine in WSL with:")
    print(f"  trtllm-build --checkpoint_dir=/home/james/gemma3_trtllm_checkpoint \\")
    print(f"    --output_dir=/home/james/gemma3_engine_int8 \\")
    print(f"    --max_batch_size=2 --max_input_len=2048 --max_seq_len=4096")
    
except Exception as e:
    print(f"\n❌ ERROR saving: {e}")
    input("Press Enter to exit...")
    exit(1)

print(f"\n{'='*60}")
input("Press Enter to exit...")
