#!/bin/bash
# Build Gemma3 12B INT4 AWQ TensorRT Engine — inside Docker container
# Target: RTX 3060 Ti (8GB VRAM)
#
# Prerequisites:
#   - Docker with NVIDIA Container Toolkit
#   - Safetensors in tensorrt_build/input/ (922 tensors, 18.1GB)
#   - GPU available (nvidia-smi must work inside container)
#
# Usage:
#   ./scripts/build-trt-engine-in-container.sh [--build-only|--convert-only|--engine-only]

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTAINER_NAME="legal-ai-trtllm-builder"
IMAGE_NAME="legal-ai-trtllm:latest"
MODEL_INPUT_DIR="$REPO_ROOT/tensorrt_build/input"
ENGINE_OUTPUT_DIR="$REPO_ROOT/engines/gemma3_12b_int4"

echo "============================================="
echo "Gemma3 12B INT4 TRT Engine Builder"
echo "============================================="
echo "Repo root:    $REPO_ROOT"
echo "Input dir:    $MODEL_INPUT_DIR"
echo "Output dir:   $ENGINE_OUTPUT_DIR"
echo ""

# ──────────────────────────────────────────────
# Step 1: Build the Docker image
# ──────────────────────────────────────────────
build_image() {
    echo ">>> Step 1: Building Docker image..."
    docker build \
        -f "$REPO_ROOT/Dockerfile.trtllm" \
        -t "$IMAGE_NAME" \
        "$REPO_ROOT"
    echo ">>> Image built: $IMAGE_NAME"
}

# ──────────────────────────────────────────────
# Step 2: Start container with GPU
# ──────────────────────────────────────────────
start_container() {
    echo ">>> Step 2: Starting container with GPU..."

    # Remove old container if exists
    docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

    # Create output dir on host
    mkdir -p "$ENGINE_OUTPUT_DIR"

    # Start with GPU access and model volume mounts
    docker run -d \
        --gpus all \
        --name "$CONTAINER_NAME" \
        -v "$MODEL_INPUT_DIR:/models/input:ro" \
        -v "$ENGINE_OUTPUT_DIR:/models/engine_int4" \
        "$IMAGE_NAME" \
        sleep infinity

    echo ">>> Container started: $CONTAINER_NAME"

    # Verify GPU access
    echo ">>> Verifying GPU access..."
    docker exec "$CONTAINER_NAME" nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
    echo ""
}

# ──────────────────────────────────────────────
# Step 3: Validate safetensors
# ──────────────────────────────────────────────
validate_safetensors() {
    echo ">>> Step 3: Validating safetensors..."
    docker exec "$CONTAINER_NAME" python3 /app/validate_safetensors.py
    echo ""
}

# ──────────────────────────────────────────────
# Step 4: Convert HF → TRT-LLM checkpoint format
# ──────────────────────────────────────────────
convert_checkpoint() {
    echo ">>> Step 4: Converting HF tensors → TRT-LLM format..."
    echo "    Remapping language_model.* → transformer.*"
    echo "    Fusing Q/K/V attention weights per layer"

    # Find the safetensors file
    docker exec "$CONTAINER_NAME" bash -c '
        SF_FILE=$(find /models/input -name "*.safetensors" -type f | head -1)
        if [ -z "$SF_FILE" ]; then
            echo "ERROR: No .safetensors file found in /models/input/"
            exit 1
        fi
        echo "Found: $SF_FILE"

        # Create checkpoint output dir
        mkdir -p /models/checkpoint

        # Copy config files
        cp /models/input/config.json /models/checkpoint/config.json 2>/dev/null || true

        # Run the HF → TRT-LLM rank converter
        python3 /app/hf_to_trt_gemma3_rank0.py \
            --src /models/input \
            --dst /models/checkpoint \
            --src_name "$(basename $SF_FILE)" \
            --dst_name rank0.safetensors
    '

    echo ">>> Checkpoint conversion complete"
    echo ""
}

# ──────────────────────────────────────────────
# Step 5: Build INT4 AWQ TensorRT engine
# ──────────────────────────────────────────────
build_engine() {
    echo ">>> Step 5: Building INT4 TensorRT engine..."
    echo "    This may take 15-30 minutes on RTX 3060 Ti"

    docker exec "$CONTAINER_NAME" bash -c '
        cd /workspace/tensorrt-llm 2>/dev/null || cd /app

        # Try trtllm-build (TRT-LLM v0.18+)
        if command -v trtllm-build &> /dev/null; then
            echo "Using trtllm-build..."
            trtllm-build \
                --checkpoint_dir /models/checkpoint \
                --output_dir /models/engine_int4 \
                --dtype float16 \
                --max_batch_size 4 \
                --max_input_len 2048 \
                --max_seq_len 4096 \
                --gpt_attention_plugin float16 \
                --gemm_plugin float16 \
                --context_fmha enable \
                --remove_input_padding enable \
                --reduce_fusion enable \
                --gemma
        else
            echo "Using python3 -m tensorrt_llm.commands.build..."
            python3 -m tensorrt_llm.commands.build \
                --checkpoint_dir /models/checkpoint \
                --output_dir /models/engine_int4 \
                --build_config /models/input/build_config_int4.json
        fi
    '

    echo ">>> Engine build complete"
    echo ""
}

# ──────────────────────────────────────────────
# Step 6: Verify engine
# ──────────────────────────────────────────────
verify_engine() {
    echo ">>> Step 6: Verifying engine..."

    docker exec "$CONTAINER_NAME" bash -c '
        echo "Engine files:"
        ls -lh /models/engine_int4/

        python3 -c "
import tensorrt_llm
import os
engine_dir = \"/models/engine_int4\"
files = os.listdir(engine_dir)
print(f\"Engine directory contains: {files}\")
engine_files = [f for f in files if f.endswith(\".engine\")]
if engine_files:
    size_mb = os.path.getsize(os.path.join(engine_dir, engine_files[0])) / (1024*1024)
    print(f\"Engine file: {engine_files[0]} ({size_mb:.1f} MB)\")
    print(\"Engine build SUCCESSFUL\")
else:
    print(\"WARNING: No .engine file found\")
"
    '

    echo ""
    echo ">>> Engine files on host:"
    ls -lh "$ENGINE_OUTPUT_DIR/" 2>/dev/null || echo "  (empty)"
    echo ""
}

# ──────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────
MODE="${1:-all}"

case "$MODE" in
    --build-only)
        build_image
        ;;
    --convert-only)
        convert_checkpoint
        ;;
    --engine-only)
        build_engine
        verify_engine
        ;;
    *)
        build_image
        start_container
        validate_safetensors
        convert_checkpoint
        build_engine
        verify_engine

        echo "============================================="
        echo "BUILD COMPLETE"
        echo "============================================="
        echo "Engine at: $ENGINE_OUTPUT_DIR/"
        echo ""
        echo "Next steps:"
        echo "  1. docker compose -f docker-compose.triton.yml up"
        echo "  2. curl http://localhost:8099/v2/models/gemma3_legal/ready"
        echo ""
        echo "To clean up the builder container:"
        echo "  docker rm -f $CONTAINER_NAME"
        ;;
esac
