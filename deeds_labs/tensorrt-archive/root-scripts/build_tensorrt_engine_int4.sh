#!/bin/bash
# Build TensorRT-LLM engine for Gemma3 12B with INT4 AWQ quantization
# Optimized for RTX 3060 Ti (8GB VRAM)

echo "🚀 Building TensorRT-LLM Engine for Gemma3 12B (INT4 AWQ)"
echo "======================================================="

CHECKPOINT_DIR="/workspace/engines/gemma3-legal-production/checkpoint"
ENGINE_DIR="/workspace/engines/gemma3-legal-production/engine_int4"
BUILD_CONFIG="/workspace/tensorrt_build/input/build_config_int4.json"

echo "Using checkpoint: $CHECKPOINT_DIR"
echo "Output engine: $ENGINE_DIR"
echo "Build config: $BUILD_CONFIG"

# Create engine directory
mkdir -p "$ENGINE_DIR"

# Build the engine
python3 -m tensorrt_llm.commands.build \
    --checkpoint_dir "$CHECKPOINT_DIR" \
    --output_dir "$ENGINE_DIR" \
    --build_config "$BUILD_CONFIG"

if [ $? -eq 0 ]; then
    echo "✅ TensorRT engine built successfully!"
    echo "Engine location: $ENGINE_DIR"
else
    echo "❌ Engine build failed!"
    exit 1
fi