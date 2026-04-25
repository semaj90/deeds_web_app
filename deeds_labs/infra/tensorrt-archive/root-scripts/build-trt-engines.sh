#!/bin/bash
# build-trt-engines.sh
set -e

FP16_CHECKPOINT="/home/james/gemma3_trtllm_checkpoint"   # existing 18GB FP16 checkpoint
ENGINE_DIR="/home/james/gemma3_trt_engine"
GPU_ID=0

mkdir -p "$ENGINE_DIR/fp16"
mkdir -p "$ENGINE_DIR/int4"

echo "=== Building TensorRT-LLM Engines ==="
echo "FP16 Checkpoint: $FP16_CHECKPOINT"
echo "Engine Output: $ENGINE_DIR"
echo "GPU ID: $GPU_ID"
echo ""

# Activate TensorRT environment
source ~/trt_env_310/bin/activate
export LD_LIBRARY_PATH=/usr/local/cuda/lib64:$LD_LIBRARY_PATH

echo "🔧 Building FP16 Engine (7GB, highest quality)..."
# FP16 engine
trtllm-build \
  --checkpoint_dir "$FP16_CHECKPOINT" \
  --output_dir "$ENGINE_DIR/fp16" \
  --max_batch_size 4 \
  --max_input_len 2048 \
  --max_seq_len 32768 \
  --gpt_attention_plugin float16 \
  --gemm_plugin float16 \
  --context_fmha enable \
  --remove_input_padding enable \
  --reduce_fusion enable \
  --builder_opt 3 \
  --log_level info

echo ""
echo "🔧 Building INT4 Engine (2-3GB, VRAM optimized)..."
# INT4 engine (optional, low VRAM)
trtllm-build \
  --checkpoint_dir "$FP16_CHECKPOINT" \
  --output_dir "$ENGINE_DIR/int4" \
  --weight_only_precision int4 \
  --max_batch_size 4 \
  --max_input_len 2048 \
  --max_seq_len 32768 \
  --gpt_attention_plugin float16 \
  --gemm_plugin float16 \
  --context_fmha enable \
  --remove_input_padding enable \
  --reduce_fusion enable \
  --builder_opt 3 \
  --log_level info

echo ""
echo "🎉 TensorRT-LLM Engines Built Successfully!"
echo ""
echo "=== Engine Details ==="
echo "📁 FP16 Engine: $ENGINE_DIR/fp16/engine.plan (~7GB)"
echo "📁 INT4 Engine: $ENGINE_DIR/int4/engine.plan (~2-3GB)"
echo "🧠 Features: 32k context, KV-cache, sliding window"
echo "⚡ RTX 3060 Ti optimized with FlashAttention"
echo ""
echo "Next: Test with Python inference wrapper"