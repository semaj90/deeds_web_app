#!/bin/bash
set -e

echo "💥 Killing old embedding servers..."
pkill -f embedding_service_cuda.py || true

echo "🚀 Starting EmbeddingGemma FastAPI server..."
python3 /workspace/python-services/embedding_service_cuda.py --port 8090 &