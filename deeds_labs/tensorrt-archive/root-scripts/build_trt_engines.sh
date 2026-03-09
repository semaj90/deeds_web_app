#!/bin/bash
set -euo pipefail

# ==============================
# TENSORRT ENGINE BUILD SCRIPT
# Uses existing rank0.safetensors (19.8GB)
# ==============================

CHECKPOINT_DIR="./gemma3_trt_checkpoint"
ENGINE_DIR="./gemma3_engines"
MAX_SEQ_LEN=4096
BATCH_SIZE=4

echo "🚀 TensorRT Engine Builder"
echo "==========================="
echo "📂 Checkpoint: $CHECKPOINT_DIR"
echo "📂 Output: $ENGINE_DIR"
echo ""

# ==============================
# STEP 1: Verify input files
# ==============================
echo "🔍 Verifying input files..."

if [ ! -f "$CHECKPOINT_DIR/rank0.safetensors" ]; then
    echo "❌ rank0.safetensors not found at $CHECKPOINT_DIR/rank0.safetensors"
    exit 1
fi

RANK0_SIZE=$(stat -c%s "$CHECKPOINT_DIR/rank0.safetensors" 2>/dev/null || stat -f%z "$CHECKPOINT_DIR/rank0.safetensors")
RANK0_GB=$((RANK0_SIZE / 1024 / 1024 / 1024))
echo "✅ rank0.safetensors found: ${RANK0_GB}GB"

# Copy config if missing
if [ ! -f "$CHECKPOINT_DIR/config.json" ]; then
    echo "📋 Copying config.json from source..."
    if [ -f "./model_unsloth_hf_f16/config.json" ]; then
        cp "./model_unsloth_hf_f16/config.json" "$CHECKPOINT_DIR/"
        echo "✅ Config copied"
    else
        echo "❌ Config file not found in model_unsloth_hf_f16/"
        exit 1
    fi
else
    echo "✅ config.json already present"
fi

# ==============================
# STEP 2: Create output directory
# ==============================
mkdir -p "$ENGINE_DIR"
echo "✅ Output directory created"

# ==============================
# STEP 3: Check TensorRT-LLM
# ==============================
echo "🔍 Checking TensorRT-LLM installation..."

# Try to find trtllm-build in various locations
TRTLLM_BUILD=""
if command -v trtllm-build &> /dev/null; then
    TRTLLM_BUILD="trtllm-build"
    echo "✅ Found trtllm-build in PATH"
elif [ -f "/usr/local/bin/trtllm-build" ]; then
    TRTLLM_BUILD="/usr/local/bin/trtllm-build"
    echo "✅ Found trtllm-build at /usr/local/bin/"
elif [ -f "$HOME/trt_env_310/bin/trtllm-build" ]; then
    TRTLLM_BUILD="$HOME/trt_env_310/bin/trtllm-build"
    echo "✅ Found trtllm-build in trt_env_310"
else
    echo "❌ trtllm-build not found. Please install TensorRT-LLM:"
    echo "   pip install tensorrt-llm --extra-index-url https://pypi.nvidia.com"
    exit 1
fi

# ==============================
# STEP 4: Build TensorRT engine
# ==============================
echo ""
echo "🚀 Building TensorRT .plan engine files..."
echo "⏱️ This may take 30-60 minutes for Gemma3..."
echo ""

$TRTLLM_BUILD \
    --checkpoint_dir "$CHECKPOINT_DIR" \
    --output_dir "$ENGINE_DIR" \
    --max_batch_size $BATCH_SIZE \
    --max_input_len 2048 \
    --max_seq_len $MAX_SEQ_LEN \
    --gemm_plugin float16 \
    --gpt_attention_plugin float16 \
    --remove_input_padding enable \
    --log_level info

# ==============================
# STEP 5: Verification
# ==============================
echo ""
echo "🔍 Verifying engine build..."

if [ -f "$ENGINE_DIR/config.json" ]; then
    echo "✅ config.json created"
else
    echo "❌ config.json missing"
    exit 1
fi

# Check for engine files
ENGINE_FILES=$(find "$ENGINE_DIR" -name "*.engine" -o -name "*.plan" 2>/dev/null | wc -l)
if [ "$ENGINE_FILES" -gt 0 ]; then
    echo "✅ $ENGINE_FILES engine file(s) created"
    ls -lh "$ENGINE_DIR"/*.engine "$ENGINE_DIR"/*.plan 2>/dev/null || true
else
    echo "❌ No .engine or .plan files found"
    exit 1
fi

echo ""
echo "🎉 TensorRT engine build complete!"
echo "📂 Engine directory: $ENGINE_DIR"
echo "🚀 Ready for 2-10x faster legal AI inference!"
echo "==========================="