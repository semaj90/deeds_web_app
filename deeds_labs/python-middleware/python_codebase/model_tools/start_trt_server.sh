#!/bin/bash
# Setup and run TensorRT inference server

echo "🚀 Setting up TensorRT Inference Server..."

# Install required packages
pip install fastapi uvicorn[standard] pydantic transformers torch --quiet

# Check if engine exists
ENGINE_PATH="/workspace/python_codebase/model_tools/gemma3_270m_fp16.engine"
if [ ! -f "$ENGINE_PATH" ]; then
    echo "❌ Engine not found at $ENGINE_PATH"
    echo "Please ensure the TensorRT engine is built first"
    exit 1
fi

echo "✅ Dependencies installed"
echo "✅ Engine found at $ENGINE_PATH"

# Start the web server
echo "🌐 Starting TensorRT inference server on port 8000..."
cd /workspace/python_codebase/model_tools
python3 trt_web_server.py --host 0.0.0.0 --port 8000