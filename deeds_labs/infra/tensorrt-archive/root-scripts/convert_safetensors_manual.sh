#!/bin/bash
# Manual safetensor to TensorRT .plan conversion commands
# Run these step by step in WSL

echo "🚀 Manual Gemma3 Safetensor to TensorRT Conversion"
echo "=================================================="

# Step 1: Activate TensorRT environment
echo "Step 1: Activate TensorRT environment"
echo "Command: source ~/trt_env_310/bin/activate"
echo ""

# Step 2: Convert safetensors to rank0.safetensors
echo "Step 2: Convert safetensors (run after activating environment)"
cat << 'PYTHON_SCRIPT'
python << 'EOF'
import os
from pathlib import Path
from safetensors.torch import load_file, save_file
import shutil

# Setup directories
model_dir = '/mnt/c/Users/james/Videos/deeds-web-app/model_unsloth_hf_f16'
output_dir = '/mnt/c/Users/james/Videos/deeds-web-app/gemma3_trt_checkpoint'
engine_dir = '/mnt/c/Users/james/Videos/deeds-web-app/gemma3_engines'

Path(output_dir).mkdir(exist_ok=True)
Path(engine_dir).mkdir(exist_ok=True)

print(f'📂 Source: {model_dir}')
print(f'📂 TRT Checkpoint: {output_dir}')
print(f'📂 Engine Output: {engine_dir}')

# Find real safetensor files (not symlinks)
shard_files = []
for f in os.listdir(model_dir):
    if f.endswith('.safetensors') and 'model-' in f:
        path = os.path.join(model_dir, f)
        if not os.path.islink(path):
            shard_files.append(f)

print(f'📦 Found {len(shard_files)} safetensor files')

# Combine all shards
combined_weights = {}
for shard_file in sorted(shard_files):
    shard_path = os.path.join(model_dir, shard_file)
    print(f'⏳ Loading {shard_file}...')

    weights = load_file(shard_path)
    combined_weights.update(weights)
    print(f'   ✅ {len(weights)} tensors loaded')

# Save combined weights
rank0_file = os.path.join(output_dir, 'rank0.safetensors')
print(f'💾 Saving {len(combined_weights)} tensors as rank0.safetensors...')
save_file(combined_weights, rank0_file)

size_gb = os.path.getsize(rank0_file) / (1024**3)
print(f'✅ Combined file saved: {size_gb:.1f}GB')

# Copy config
config_src = os.path.join(model_dir, 'config.json')
config_dst = os.path.join(output_dir, 'config.json')
shutil.copy2(config_src, config_dst)
print('✅ Config.json copied')

print('🎉 Safetensor combination complete!')
print(f'📍 Checkpoint ready: {output_dir}')
EOF
PYTHON_SCRIPT

echo ""
echo "Step 3: Build TensorRT engine"
echo "Command:"
cat << 'BUILD_CMD'
trtllm-build \
  --checkpoint_dir /mnt/c/Users/james/Videos/deeds-web-app/gemma3_trt_checkpoint \
  --output_dir /mnt/c/Users/james/Videos/deeds-web-app/gemma3_engines \
  --max_batch_size 4 \
  --max_input_len 2048 \
  --max_seq_len 4096 \
  --gemm_plugin float16 \
  --gpt_attention_plugin float16 \
  --remove_input_padding enable \
  --log_level info
BUILD_CMD

echo ""
echo "Expected result: .plan engine files in gemma3_engines/ directory"
echo "This process may take 30-60 minutes depending on hardware"