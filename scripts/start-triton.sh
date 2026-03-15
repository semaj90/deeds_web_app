#!/bin/bash
#
# Triton Inference Server orchestrator for Legal AI
#
# Prerequisites:
# - Built TRT engines in ./engines/
# - Docker with NVIDIA Container Toolkit
#
# Usage:
#   ./scripts/start-triton.sh          # Start server
#   ./scripts/start-triton.sh stop     # Stop server
#   ./scripts/start-triton.sh restart  # Restart server
#   ./scripts/start-triton.sh health   # Check health
#   ./scripts/start-triton.sh logs     # Tail logs

set -e

# Configuration
TRITON_IMAGE="nvcr.io/nvidia/tritonserver:24.11-trtllm-python-py3"
CONTAINER_NAME="legal-ai-triton"
MODEL_REPO="./model_repository"
ENGINES_DIR="./engines"

HTTP_PORT=8099
GRPC_PORT=8098
METRICS_PORT=8097

VRAM_MIN_MB=3000  # Minimum 3GB free to start

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Functions
check_gpu_memory() {
    local free_mb=$(nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits | head -1)
    echo "$free_mb"
}

wait_for_health() {
    local max_attempts=60
    local attempt=0

    echo -e "${YELLOW}Waiting for Triton to be ready...${NC}"

    while [ $attempt -lt $max_attempts ]; do
        if curl -s "http://localhost:$HTTP_PORT/v2/health/ready" | grep -q "true\|ready"; then
            echo -e "${GREEN}✓ Triton is ready!${NC}"
            return 0
        fi

        attempt=$((attempt + 1))
        printf "."
        sleep 2
    done

    echo -e "\n${RED}✗ Triton failed to start within 2 minutes${NC}"
    return 1
}

show_model_status() {
    echo -e "\n${CYAN}Loaded Models:${NC}"
    curl -s "http://localhost:$HTTP_PORT/v2/models" | python3 -m json.tool 2>/dev/null || echo "(none yet)"

    echo -e "\n${CYAN}GPU Memory:${NC}"
    nvidia-smi --query-gpu=name,memory.used,memory.free,utilization.gpu --format=csv
}

create_model_repository() {
    echo -e "${YELLOW}Creating model repository structure...${NC}"

    mkdir -p "$MODEL_REPO/gemma3_legal/1"
    mkdir -p "$MODEL_REPO/siglip_vision/1"
    mkdir -p "$MODEL_REPO/gemma_projector/1"

    # Gemma3 Legal config
    cat > "$MODEL_REPO/gemma3_legal/config.pbtxt" <<EOF
name: "gemma3_legal"
backend: "tensorrtllm"
max_batch_size: 4

input [
  {
    name: "input_ids"
    data_type: TYPE_INT32
    dims: [ -1 ]
  },
  {
    name: "input_lengths"
    data_type: TYPE_INT32
    dims: [ 1 ]
  },
  {
    name: "request_output_len"
    data_type: TYPE_INT32
    dims: [ 1 ]
  }
]

output [
  {
    name: "output_ids"
    data_type: TYPE_INT32
    dims: [ -1 ]
  }
]

parameters {
  key: "gpt_model_path"
  value: { string_value: "/engines/gemma3_12b_int4" }
}

parameters {
  key: "batch_scheduler_policy"
  value: { string_value: "guaranteed_no_evict" }
}

instance_group [
  {
    count: 1
    kind: KIND_GPU
    gpus: [ 0 ]
  }
]
EOF

    # SigLIP Vision config (if engine exists)
    if [ -f "$ENGINES_DIR/siglip_vision.engine" ]; then
        cat > "$MODEL_REPO/siglip_vision/config.pbtxt" <<EOF
name: "siglip_vision"
platform: "tensorrt_plan"
max_batch_size: 4

input [
  {
    name: "pixel_values"
    data_type: TYPE_FP16
    dims: [ 3, 384, 384 ]
  }
]

output [
  {
    name: "last_hidden_state"
    data_type: TYPE_FP16
    dims: [ 577, 1152 ]
  }
]

instance_group [
  {
    count: 1
    kind: KIND_GPU
    gpus: [ 0 ]
  }
]
EOF
        cp "$ENGINES_DIR/siglip_vision.engine" "$MODEL_REPO/siglip_vision/1/model.plan"
    fi

    # Projector config (if engine exists)
    if [ -f "$ENGINES_DIR/gemma_projector.engine" ]; then
        cat > "$MODEL_REPO/gemma_projector/config.pbtxt" <<EOF
name: "gemma_projector"
platform: "tensorrt_plan"
max_batch_size: 4

input [
  {
    name: "vision_embeds"
    data_type: TYPE_FP16
    dims: [ -1, 1152 ]
  }
]

output [
  {
    name: "projected_embeds"
    data_type: TYPE_FP16
    dims: [ -1, 3584 ]
  }
]

instance_group [
  {
    count: 1
    kind: KIND_GPU
    gpus: [ 0 ]
  }
]
EOF
        cp "$ENGINES_DIR/gemma_projector.engine" "$MODEL_REPO/gemma_projector/1/model.plan"
    fi

    echo -e "${GREEN}✓ Model repository created at $MODEL_REPO${NC}"
}

start_server() {
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║           Starting Triton Inference Server                    ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"

    # Check VRAM
    local free_mb=$(check_gpu_memory)
    echo -e "\n${CYAN}GPU VRAM: ${free_mb}MB free${NC}"

    if [ "$free_mb" -lt "$VRAM_MIN_MB" ]; then
        echo -e "${YELLOW}Warning: Low VRAM. Stopping Ollama...${NC}"
        pkill ollama 2>/dev/null || true
        sleep 3
        free_mb=$(check_gpu_memory)
    fi

    # Check engines
    if [ ! -f "$ENGINES_DIR/gemma3_12b_int4/rank0.engine" ]; then
        echo -e "${RED}Error: TRT engine not found at $ENGINES_DIR/gemma3_12b_int4/${NC}"
        echo "Run ./scripts/build-trt-engines.sh first"
        exit 1
    fi

    # Stop existing container
    docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

    # Create model repository
    create_model_repository

    # Start Triton
    echo -e "\n${YELLOW}Starting Triton container...${NC}"

    docker run -d --gpus all \
        --name "$CONTAINER_NAME" \
        --shm-size=2g \
        -p "$HTTP_PORT:8000" \
        -p "$GRPC_PORT:8001" \
        -p "$METRICS_PORT:8002" \
        -v "$(pwd)/$MODEL_REPO:/models" \
        -v "$(pwd)/$ENGINES_DIR:/engines:ro" \
        "$TRITON_IMAGE" \
        tritonserver \
            --model-repository=/models \
            --strict-model-config=true \
            --log-verbose=1 \
            --log-info=true \
            --exit-on-error=false

    # Wait for ready
    if wait_for_health; then
        show_model_status

        echo -e "\n${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║  Triton server started successfully!                          ║${NC}"
        echo -e "${GREEN}║                                                               ║${NC}"
        echo -e "${GREEN}║  HTTP:    http://localhost:$HTTP_PORT                              ║${NC}"
        echo -e "${GREEN}║  gRPC:    localhost:$GRPC_PORT                                     ║${NC}"
        echo -e "${GREEN}║  Metrics: http://localhost:$METRICS_PORT/metrics                   ║${NC}"
        echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    else
        echo -e "\n${RED}Server failed to start. Check logs:${NC}"
        docker logs --tail 50 "$CONTAINER_NAME"
        exit 1
    fi
}

stop_server() {
    echo -e "${YELLOW}Stopping Triton server...${NC}"
    docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
    echo -e "${GREEN}✓ Stopped${NC}"
}

show_health() {
    echo -e "\n${CYAN}═══ Triton Health Check ═══${NC}\n"

    # Container status
    if docker ps --filter "name=$CONTAINER_NAME" --format "{{.Status}}" | grep -q "Up"; then
        echo -e "${GREEN}✓ Container: Running${NC}"
    else
        echo -e "${RED}✗ Container: Not running${NC}"
        return 1
    fi

    # HTTP health
    if curl -s "http://localhost:$HTTP_PORT/v2/health/ready" | grep -q "true\|ready"; then
        echo -e "${GREEN}✓ HTTP endpoint: Ready${NC}"
    else
        echo -e "${RED}✗ HTTP endpoint: Not ready${NC}"
    fi

    # Model status
    show_model_status

    echo ""
}

show_logs() {
    docker logs -f "$CONTAINER_NAME"
}

# Main
case "${1:-start}" in
    start)
        start_server
        ;;
    stop)
        stop_server
        ;;
    restart)
        stop_server
        sleep 2
        start_server
        ;;
    health)
        show_health
        ;;
    logs)
        show_logs
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|health|logs}"
        exit 1
        ;;
esac
