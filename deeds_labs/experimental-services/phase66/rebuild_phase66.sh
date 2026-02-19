#!/usr/bin/env bash
set -e

echo "🔻 Stopping old phase66 container..."
docker compose stop phase66-tensorrt-llm || true

echo "🗑 Removing old container..."
docker compose rm -f phase66-tensorrt-llm || true

echo "🔄 Rebuilding TensorRT-LLM container..."
docker compose build phase66-tensorrt-llm

echo "🚀 Starting new container..."
docker compose up -d phase66-tensorrt-llm

echo "⏳ Waiting for container to initialize..."
sleep 8

echo "📤 Copying model ONNX into container..."
docker cp ./models/gemma/model.onnx phase66-tensorrt-llm:/workspace/models/gemma/model.onnx

echo "⚙️ Exporting FP16 ONNX..."
docker exec phase66-tensorrt-llm python3 /workspace/export_fp16.py

echo "🛠 Building TensorRT FP16 Engine..."
docker exec phase66-tensorrt-llm bash /workspace/build_trt_fp16.sh

echo "💡 Killing old embedding server (if running)..."
docker exec phase66-tensorrt-llm bash -c "pkill -f embedding_service_cuda.py || true"

echo "🔥 Starting new QUIC-ready EmbeddingGemma server..."
docker exec -d phase66-tensorrt-llm bash /workspace/run_embedding_server.sh

echo "🎉 Phase66 rebuild complete."
echo "📡 EmbeddingGemma CUDA server running on http://localhost:8090"