#!/bin/bash
# Build TensorRT engine for Gemma3 model

set -e

echo "=== Building Gemma3 TensorRT Engine ==="

# Configuration
CHECKPOINT_DIR="/home/james/gemma3_trt_ready"
OUTPUT_DIR="/home/james/gemma3_trt_engine"
MODEL_DIR="/home/james/gemma3-4b-it"

# Create output directory
mkdir -p $OUTPUT_DIR

# Check if we have the checkpoint
if [ ! -f "$CHECKPOINT_DIR/rank0.safetensors" ]; then
    echo "Error: Checkpoint not found at $CHECKPOINT_DIR/rank0.safetensors"
    exit 1
fi

# Use the clean environment
source /home/james/trt_clean_env/bin/activate 2>/dev/null || {
    echo "Creating new clean environment..."
    python3.10 -m venv /home/james/trt_clean_env
    source /home/james/trt_clean_env/bin/activate
    pip install --upgrade pip
}

# Check if TensorRT-LLM is installed
python -c "import tensorrt_llm" 2>/dev/null || {
    echo "Installing TensorRT-LLM..."
    # Use cached wheel if available
    if [ -f "/home/james/trt_wheels/tensorrt_llm-1.1.0rc5-cp310-cp310-linux_x86_64.whl" ]; then
        pip install /home/james/trt_wheels/tensorrt_llm-1.1.0rc5-cp310-cp310-linux_x86_64.whl
    else
        pip install tensorrt-llm --extra-index-url https://pypi.nvidia.com
    fi
}

# Build the engine using trtllm-build
echo "Building TensorRT engine..."
trtllm-build \
    --checkpoint_dir $CHECKPOINT_DIR \
    --output_dir $OUTPUT_DIR \
    --gemm_plugin float16 \
    --max_batch_size 8 \
    --max_input_len 2048 \
    --max_output_len 2048 \
    --max_beam_width 1 \
    --use_custom_all_reduce disable \
    --workers 1 \
    --use_paged_context_fmha enable \
    --use_fused_mlp enable \
    --strongly_typed \
    2>&1 | tee $OUTPUT_DIR/build.log

# Verify the engine was created
if [ -f "$OUTPUT_DIR/rank0.engine" ]; then
    echo "✅ TensorRT engine built successfully!"
    ls -lah $OUTPUT_DIR/
else
    echo "❌ Engine build failed. Check $OUTPUT_DIR/build.log for details"
    exit 1
fi

echo "=== Build Complete ==="
echo "Engine location: $OUTPUT_DIR/rank0.engine"