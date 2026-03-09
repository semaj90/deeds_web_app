#!/bin/bash
# Build TensorRT-LLM Engines from GGUF for RTX 3060 Ti
# FP16 + INT4, VRAM-aware, single-GPU

set -e

# ==== CONFIG ====
GGUF_PATH="/mnt/c/Users/james/Videos/deeds-web-app/gemma3Q4_K_M/mohf16-Q4_K_M.gguf"
ENGINE_DIR="/home/james/gemma3_engine_trt"
GPU_ID=0
MAX_BATCH=4
MAX_INPUT_LEN=2048
MAX_SEQ_LEN=4096

# Activate TensorRT environment
source ~/trt_env_310/bin/activate

mkdir -p "$ENGINE_DIR"

echo "=== Building FP16 Engine ==="
trtllm-build \
    --checkpoint_dir "$GGUF_PATH" \
    --output_dir "$ENGINE_DIR/fp16" \
    --gpt_attention_plugin float16 \
    --gemm_plugin float16 \
    --context_fmha enable \
    --remove_input_padding enable \
    --reduce_fusion enable \
    --max_batch_size $MAX_BATCH \
    --max_input_len $MAX_INPUT_LEN \
    --max_seq_len $MAX_SEQ_LEN

echo "=== Building INT4 Engine ==="
trtllm-build \
    --checkpoint_dir "$GGUF_PATH" \
    --output_dir "$ENGINE_DIR/int4" \
    --int4 \
    --gpt_attention_plugin float16 \
    --gemm_plugin float16 \
    --context_fmha enable \
    --remove_input_padding enable \
    --reduce_fusion enable \
    --max_batch_size $MAX_BATCH \
    --max_input_len $MAX_INPUT_LEN \
    --max_seq_len $MAX_SEQ_LEN

echo "✅ Engines built successfully at $ENGINE_DIR"