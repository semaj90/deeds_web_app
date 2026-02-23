#!/bin/bash
# Phase 70 TensorRT-LLM Startup Script
# Builds engine if needed, then starts service

set -e

echo "🚀 Starting Phase 70 TensorRT-LLM Service..."

# Build engine if it doesn't exist
if [ ! -d "/engines/gemma3-legal" ] || [ -z "$(ls -A /engines/gemma3-legal)" ]; then
    echo "🔨 Building TensorRT engine..."
    cd /app/tensor_services/engine-builder
    python3 build_engine.py
else
    echo "✔ TensorRT engine already exists"
fi

# Start the service
echo "🌐 Starting FastAPI service..."
cd /app
exec python3 python-services/tensorrt_llm_service.py