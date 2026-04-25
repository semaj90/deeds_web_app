#!/bin/bash
set -e

echo "📦 Creating venv inside TensorRT-LLM container..."

python3.12 -m venv /app/venv
source /app/venv/bin/activate

pip install --upgrade pip setuptools wheel

pip install --upgrade \
    transformers \
    optimum \
    onnx \
    onnxruntime-gpu \
    onnxruntime \
    huggingface_hub \
    sentencepiece \
    onnxruntime-tools

echo "🔥 TensorRT-LLM venv ready!"