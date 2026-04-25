# Phase 66 TensorRT Engine Builder for Gemma3-Legal
# Builds optimized engines for RTX 3060 Ti (SM 8.6)

#!/bin/bash

set -e

# Configuration
MODEL_NAME="gemma3-legal"
MODEL_PATH="/models/gemma3-legal"
ENGINE_DIR="/engines"
TOKENIZER_DIR="/tokenizers"

# TensorRT-LLM build parameters for RTX 3060 Ti
MAX_BATCH_SIZE=2
MAX_INPUT_LEN=1024
MAX_SEQ_LEN=2048
MAX_BEAM_WIDTH=1

# GPU-specific optimizations
GPU_ARCH="86"  # RTX 3060 Ti SM architecture
USE_GEMM_PLUGIN="auto"
USE_GPT_ATTENTION_PLUGIN="float16"
PAGED_KV_CACHE="true"
DTYPE="float16"
USE_WEIGHT_ONLY="true"
WEIGHT_ONLY_PRECISION="int4_awq"
PER_GROUP="true"
GROUP_SIZE=128
INT8_KV_CACHE="true"

echo "Building TensorRT-LLM engine for $MODEL_NAME on RTX 3060 Ti..."

# Build the engine
python3 -m tensorrt_llm.commands.build \
    --checkpoint_dir="$MODEL_PATH" \
    --output_dir="$ENGINE_DIR/$MODEL_NAME" \
    --max_batch_size=$MAX_BATCH_SIZE \
    --max_input_len=$MAX_INPUT_LEN \
    --max_seq_len=$MAX_SEQ_LEN \
    --max_beam_width=$MAX_BEAM_WIDTH \
    --use_gemm_plugin=$USE_GEMM_PLUGIN \
    --use_gpt_attention_plugin=$USE_GPT_ATTENTION_PLUGIN \
    --paged_kv_cache \
    --dtype=$DTYPE \
    --use_weight_only \
    --weight_only_precision=$WEIGHT_ONLY_PRECISION \
    --per_group \
    --group_size=$GROUP_SIZE \
    --int8_kv_cache

echo "Engine build complete. Copying tokenizer..."
cp -r "$MODEL_PATH/tokenizer" "$TOKENIZER_DIR/$MODEL_NAME/"

echo "TensorRT engine ready for inference service."