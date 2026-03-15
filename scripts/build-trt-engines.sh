#!/bin/bash
#
# Build TensorRT-LLM INT4 engines for Gemma3 12B Legal
#
# Prerequisites:
# - Docker with NVIDIA Container Toolkit installed
# - Downloaded artifacts from Google Colab:
#   - trt_artifacts/text_only_model/  (~21GB, extracted text decoder)
#   - trt_artifacts/onnx/siglip_vision.onnx  (~1.5GB)
#   - trt_artifacts/onnx/gemma_projector.onnx  (~50MB)
#
# Usage:
#   ./scripts/build-trt-engines.sh
#
# Output:
#   engines/gemma3_12b_int4/rank0.engine  (~6.5GB)
#   engines/siglip_vision.engine          (~1.5GB)
#   engines/gemma_projector.engine        (~50MB)

set -e

# Configuration
DOCKER_IMAGE="legal-ai-tensorrt-llm:latest"
ARTIFACTS_DIR="./trt_artifacts"
ENGINES_DIR="./engines"
MAX_BATCH_SIZE=4
MAX_INPUT_LEN=2048
MAX_SEQ_LEN=4096

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║        TensorRT-LLM Engine Builder for Gemma3 12B Legal       ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"

# Check prerequisites
echo -e "\n${YELLOW}[1/6] Checking prerequisites...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker not found. Please install Docker.${NC}"
    exit 1
fi

if ! docker info 2>/dev/null | grep -q "nvidia"; then
    echo -e "${YELLOW}Warning: NVIDIA Container Toolkit may not be installed.${NC}"
    echo "Run: docker run --gpus all nvidia/cuda:12.0-base nvidia-smi"
fi

if [ ! -d "$ARTIFACTS_DIR/text_only_model" ]; then
    echo -e "${RED}Error: Text model not found at $ARTIFACTS_DIR/text_only_model${NC}"
    echo "Please download Colab artifacts from Google Drive first."
    exit 1
fi

if [ ! -f "$ARTIFACTS_DIR/onnx/siglip_vision.onnx" ]; then
    echo -e "${YELLOW}Warning: SigLIP ONNX not found. Vision encoder will be skipped.${NC}"
fi

# Create output directory
mkdir -p "$ENGINES_DIR"

# Stop Ollama if running (needs full VRAM for build)
echo -e "\n${YELLOW}[2/6] Freeing GPU VRAM...${NC}"
if pgrep -x "ollama" > /dev/null; then
    echo "Stopping Ollama to free VRAM..."
    pkill ollama 2>/dev/null || true
    sleep 3
fi

# Display current VRAM
nvidia-smi --query-gpu=memory.used,memory.free,memory.total --format=csv,noheader

# Build INT4 text engine
echo -e "\n${YELLOW}[3/6] Building Gemma3 12B INT4 text engine...${NC}"
echo "This takes ~30 minutes on RTX 3060 Ti"

docker run --gpus all --rm -it \
    -v "$(pwd)/$ARTIFACTS_DIR/text_only_model:/models/text_only:ro" \
    -v "$(pwd)/$ENGINES_DIR:/models/engines" \
    "$DOCKER_IMAGE" bash -c "
    set -e

    echo '>>> Converting to INT4 checkpoint...'
    python3 examples/gemma/convert_checkpoint.py \
        --ckpt-type hf \
        --model-dir /models/text_only \
        --use-weight-only-with-precision int4 \
        --dtype bfloat16 \
        --world-size 1 \
        --output-model-dir /models/int4_checkpoint

    echo '>>> Building TensorRT engine...'
    trtllm-build \
        --checkpoint_dir /models/int4_checkpoint \
        --gemm_plugin auto \
        --gpt_attention_plugin auto \
        --max_batch_size $MAX_BATCH_SIZE \
        --max_input_len $MAX_INPUT_LEN \
        --max_seq_len $MAX_SEQ_LEN \
        --output_dir /models/engines/gemma3_12b_int4

    echo '>>> Engine build complete!'
    ls -lh /models/engines/gemma3_12b_int4/
"

# Build SigLIP vision engine
if [ -f "$ARTIFACTS_DIR/onnx/siglip_vision.onnx" ]; then
    echo -e "\n${YELLOW}[4/6] Building SigLIP vision encoder engine...${NC}"

    docker run --gpus all --rm -it \
        -v "$(pwd)/$ARTIFACTS_DIR/onnx:/models/onnx:ro" \
        -v "$(pwd)/$ENGINES_DIR:/models/engines" \
        "$DOCKER_IMAGE" bash -c "
        trtexec --onnx=/models/onnx/siglip_vision.onnx \
            --saveEngine=/models/engines/siglip_vision.engine \
            --fp16 \
            --optShapes=pixel_values:1x3x384x384 \
            --maxShapes=pixel_values:4x3x384x384
    "
else
    echo -e "\n${YELLOW}[4/6] Skipping SigLIP (ONNX not found)${NC}"
fi

# Build projector engine
if [ -f "$ARTIFACTS_DIR/onnx/gemma_projector.onnx" ]; then
    echo -e "\n${YELLOW}[5/6] Building projector engine...${NC}"

    docker run --gpus all --rm -it \
        -v "$(pwd)/$ARTIFACTS_DIR/onnx:/models/onnx:ro" \
        -v "$(pwd)/$ENGINES_DIR:/models/engines" \
        "$DOCKER_IMAGE" bash -c "
        trtexec --onnx=/models/onnx/gemma_projector.onnx \
            --saveEngine=/models/engines/gemma_projector.engine \
            --fp16
    "
else
    echo -e "\n${YELLOW}[5/6] Skipping projector (ONNX not found)${NC}"
fi

# Verify outputs
echo -e "\n${YELLOW}[6/6] Verifying engine files...${NC}"

if [ -f "$ENGINES_DIR/gemma3_12b_int4/rank0.engine" ]; then
    echo -e "${GREEN}✓ Text engine: $(ls -lh $ENGINES_DIR/gemma3_12b_int4/rank0.engine | awk '{print $5}')${NC}"
else
    echo -e "${RED}✗ Text engine not found!${NC}"
fi

if [ -f "$ENGINES_DIR/siglip_vision.engine" ]; then
    echo -e "${GREEN}✓ Vision engine: $(ls -lh $ENGINES_DIR/siglip_vision.engine | awk '{print $5}')${NC}"
fi

if [ -f "$ENGINES_DIR/gemma_projector.engine" ]; then
    echo -e "${GREEN}✓ Projector engine: $(ls -lh $ENGINES_DIR/gemma_projector.engine | awk '{print $5}')${NC}"
fi

echo -e "\n${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    Build Complete!                            ║${NC}"
echo -e "${GREEN}║                                                               ║${NC}"
echo -e "${GREEN}║  Next: Run ./scripts/start-triton.sh to start inference      ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
