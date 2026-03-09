#!/bin/bash
# build-tensorrt-docker.sh: Build TensorRT-LLM engines and Go runner in Docker

set -e

echo "🚀 Building TensorRT-LLM Engine Builder and Go Runner in Docker"

# Build the Docker image
docker build -f Dockerfile.tensorrt-builder -t legal-ai-tensorrt-builder .

echo "✅ Docker image built: legal-ai-tensorrt-builder"

# Optional: Run the container to test
if [ "$1" = "run" ]; then
    echo "🏃 Running container..."
    docker run --rm --gpus all -it legal-ai-tensorrt-builder
fi

echo "🎉 Build complete. Use 'docker run --rm --gpus all legal-ai-tensorrt-builder' to run."