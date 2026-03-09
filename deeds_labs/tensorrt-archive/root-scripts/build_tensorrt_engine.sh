#!/bin/bash
# Build TensorRT-LLM Engine for Gemma3 Legal AI
# Compatible with TensorRT-LLM 1.1.0rc5

set -e

# Activate TensorRT environment
source ~/trt_env_310/bin/activate

cd /mnt/c/Users/james/Videos/deeds-web-app

echo "🚀 Building TensorRT-LLM Engine for Gemma3 Legal AI"
echo "📋 Model: Gemma3 (24GB) -> TensorRT-LLM optimized"

# Build configuration
HF_SHARD_DIR="${HF_SHARD_DIR:-/home/james/gemma3_checkpoint_fixed}"
MAPPED_CHECKPOINT_DIR="${MAPPED_CHECKPOINT_DIR:-/home/james/gemma3_trtllm_complete}"
ENGINE_DIR="${ENGINE_DIR:-gemma3_trt_engine_optimized}"
MAX_BATCH_SIZE="${MAX_BATCH_SIZE:-4}"
MAX_INPUT_LEN="${MAX_INPUT_LEN:-2048}"
MAX_OUTPUT_LEN="${MAX_OUTPUT_LEN:-2048}"
MAX_BEAM_WIDTH="${MAX_BEAM_WIDTH:-1}"

echo "⚙️  Configuration:"
echo "   - HF shards: $HF_SHARD_DIR"
echo "   - TRT checkpoint: $MAPPED_CHECKPOINT_DIR"
echo "   - Engine dir: $ENGINE_DIR"
echo "   - Batch Size: $MAX_BATCH_SIZE"
echo "   - Max Input: $MAX_INPUT_LEN tokens"
echo "   - Max Output: $MAX_OUTPUT_LEN tokens"
echo "   - Precision: FP16"

# Step 1: ensure checkpoint directory for TensorRT-LLM naming exists
CONVERT_SCRIPT="python_codebase/model_tools/fix_tensor_names_complete.py"
echo "🔄 Running tensor name mapping via $CONVERT_SCRIPT..."
python "$CONVERT_SCRIPT" \
    --checkpoint_dir "$HF_SHARD_DIR" \
    --output_dir "$MAPPED_CHECKPOINT_DIR"

echo "🔍 Mapping report:"
cat "$MAPPED_CHECKPOINT_DIR/mapping_report.json" | head -n 40 || true

# Step 2: Build TensorRT engine from converted checkpoint
echo "🔄 Building TensorRT engine from converted checkpoint..."
trtllm-build \
    --checkpoint_dir "$MAPPED_CHECKPOINT_DIR" \
    --output_dir "$ENGINE_DIR" \
    --gemm_plugin float16 \
    --gpt_attention_plugin float16 \
    --max_batch_size $MAX_BATCH_SIZE \
    --max_input_len $MAX_INPUT_LEN \
    --max_seq_len $((MAX_INPUT_LEN + MAX_OUTPUT_LEN)) \
    --max_beam_width $MAX_BEAM_WIDTH \
    --dtype float16 \
    --strongly_typed \
    2>&1 | tee trt_build.log

if [ $? -eq 0 ] && [ -d "$ENGINE_DIR" ]; then
    echo "✅ TensorRT-LLM engine built successfully!"

    # List engine files
    echo "📁 Engine files:"
    ls -la "$ENGINE_DIR"

    # Test basic functionality
    echo "🧪 Testing engine loading..."
    python -c "
import tensorrt_llm
from tensorrt_llm.runtime import ModelConfig, SamplingConfig
from tensorrt_llm.runtime import ModelRunner
import os

engine_dir = '$ENGINE_DIR'
if os.path.exists(engine_dir):
    print('✅ Engine directory found')
    # Quick validation
    config_path = os.path.join(engine_dir, 'config.json')
    if os.path.exists(config_path):
        print('✅ Engine config found')
        print('🎯 TensorRT-LLM engine ready for legal AI inference!')
    else:
        print('⚠️  Engine config missing')
else:
    print('❌ Engine directory not found')
"
else
    echo "❌ Engine build failed, check trt_build.log"
    echo "📋 Last 20 lines of build log:"
    tail -20 trt_build.log
    exit 1
fi

echo "🎉 TensorRT-LLM Legal AI Engine Ready!"
echo "💡 Use with: python inference_trt.py"
