#!/bin/bash
# Build EmbeddingGemma FP16 TensorRT Engine using trtexec
# This script handles asymmetric quantization by using FP16 precision

set -e

echo "🔥 Building EmbeddingGemma FP16 TensorRT Engine"
echo "==============================================="

MODEL_DIR="/workspace/models/embeddinggemma_300m_onnx"
ONNX_PATH="${MODEL_DIR}/model.onnx"
ENGINE_PATH="/workspace/models/embeddinggemma_300m_fp16.engine"

# Check if ONNX model exists
if [ ! -f "$ONNX_PATH" ]; then
    echo "❌ ONNX model not found: $ONNX_PATH"
    exit 1
fi

echo "📁 Model directory: $MODEL_DIR"
echo "📄 ONNX model: $ONNX_PATH"
echo "🎯 Engine output: $ENGINE_PATH"

# Build FP16 engine with trtexec
echo "🚀 Running trtexec to build FP16 engine..."
trtexec \
    --onnx="$ONNX_PATH" \
    --saveEngine="$ENGINE_PATH" \
    --minShapes=input_ids:1x1 \
    --optShapes=input_ids:1x128 \
    --maxShapes=input_ids:1x512 \
    --fp16 \
    --workspace=2048 \
    --verbose

# Verify engine was created
if [ -f "$ENGINE_PATH" ]; then
    ENGINE_SIZE=$(stat -c%s "$ENGINE_PATH" 2>/dev/null || stat -f%z "$ENGINE_PATH" 2>/dev/null || echo "unknown")
    ENGINE_SIZE_MB=$((ENGINE_SIZE / 1024 / 1024))
    echo "✅ Engine built successfully!"
    echo "📊 Engine size: ${ENGINE_SIZE_MB} MB"
    echo "🎯 Engine path: $ENGINE_PATH"
else
    echo "❌ Engine build failed - no output file created"
    exit 1
fi

echo "🎉 EmbeddingGemma FP16 TensorRT engine ready!"