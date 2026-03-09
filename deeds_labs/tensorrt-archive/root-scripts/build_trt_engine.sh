#!/usr/bin/env bash
set -e

# Activate environment
source ~/trt_env_310/bin/activate
export LD_LIBRARY_PATH=/usr/local/cuda/lib64:$LD_LIBRARY_PATH

# Paths
CHECKPOINT_DIR="/home/james/gemma3_trt_checkpoint"
ENGINE_DIR="/home/james/gemma3_engine"
GPU_ID=0

mkdir -p "$ENGINE_DIR"

echo "🔹 Building TensorRT engine from checkpoint ..."
trtllm-build \
    --checkpoint_dir "$CHECKPOINT_DIR" \
    --output_dir "$ENGINE_DIR" \
    --gpt_attention_plugin float16 \
    --gemm_plugin float16 \
    --context_fmha enable \
    --remove_input_padding enable \
    --reduce_fusion enable \
    --device_id $GPU_ID

echo "✅ Engine built in $ENGINE_DIR"