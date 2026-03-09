#!/usr/bin/env bash
set -e

# Triton Inference Server Launcher for Gemma3 Legal AI
# Uses native Triton HTTP/gRPC endpoints instead of custom FastAPI wrapper

MODEL_REPO="/home/james/triton_models"
ENGINE_DIR="/home/james/gemma3_engine_rtx3060ti"
TRITON_PORT=8000
GRPC_PORT=8001

echo "🚀 Starting Triton Inference Server for Gemma3 Legal AI"
echo "📂 Model repository: $MODEL_REPO"
echo "🌐 HTTP port: $TRITON_PORT"
echo "⚡ gRPC port: $GRPC_PORT"

# Check if TensorRT engine exists
if [ ! -d "$ENGINE_DIR" ] || [ -z "$(find "$ENGINE_DIR" -name "*.plan" 2>/dev/null)" ]; then
    echo "❌ TensorRT engine not found at: $ENGINE_DIR"
    echo "   Run ./build_gemma_trt.sh first to build the engine"
    exit 1
fi

# Create Triton model repository structure
echo "📁 Setting up Triton model repository..."
mkdir -p "$MODEL_REPO/gemma3_legal/1"

# Create model configuration for Triton
cat > "$MODEL_REPO/gemma3_legal/config.pbtxt" << EOF
name: "gemma3_legal"
backend: "tensorrt"
max_batch_size: 4
version_policy: { all { }}

input [
  {
    name: "input_ids"
    data_type: TYPE_INT32
    dims: [-1, -1]
  },
  {
    name: "input_lengths"
    data_type: TYPE_INT32
    dims: [-1]
  },
  {
    name: "request_output_len"
    data_type: TYPE_INT32
    dims: [-1]
  }
]

output [
  {
    name: "output_ids"
    data_type: TYPE_INT32
    dims: [-1, -1]
  },
  {
    name: "sequence_length"
    data_type: TYPE_INT32
    dims: [-1]
  }
]

instance_group [
  {
    count: 1
    kind: KIND_GPU
    gpus: [0]
  }
]

dynamic_batching {
  max_queue_delay_microseconds: 100
}
EOF

# Copy TensorRT engine to model repository
echo "📦 Copying TensorRT engine files..."
cp -r "$ENGINE_DIR"/* "$MODEL_REPO/gemma3_legal/1/"

# Verify model structure
echo "✅ Model repository structure:"
tree "$MODEL_REPO" 2>/dev/null || find "$MODEL_REPO" -type f | head -10

# Check if Triton server is available
if ! command -v tritonserver &> /dev/null; then
    echo "❌ tritonserver not found in PATH"
    echo "   Install Triton Inference Server:"
    echo "   docker pull nvcr.io/nvidia/tritonserver:23.10-py3"
    echo "   Or install locally: pip install tritonclient[all]"
    exit 1
fi

# Start Triton server
echo ""
echo "🚀 Starting Triton Inference Server..."
echo "   Model repository: $MODEL_REPO"
echo "   HTTP endpoint: http://localhost:$TRITON_PORT"
echo "   gRPC endpoint: localhost:$GRPC_PORT"
echo ""

tritonserver \
    --model-repository="$MODEL_REPO" \
    --http-port=$TRITON_PORT \
    --grpc-port=$GRPC_PORT \
    --metrics-port=8002 \
    --log-verbose=1 \
    --strict-model-config=false \
    --strict-readiness=false \
    --allow-http=true \
    --allow-grpc=true \
    --allow-metrics=true

echo ""
echo "🎉 Triton server started successfully!"
echo "📍 Available endpoints:"
echo "   Health: GET http://localhost:$TRITON_PORT/v2/health/ready"
echo "   Models: GET http://localhost:$TRITON_PORT/v2/models"
echo "   Infer:  POST http://localhost:$TRITON_PORT/v2/models/gemma3_legal/infer"
echo ""
echo "🔗 SvelteKit integration ready at: http://localhost:5173/chat"