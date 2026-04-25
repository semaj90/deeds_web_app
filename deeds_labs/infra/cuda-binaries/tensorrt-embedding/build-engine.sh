#!/bin/bash

# Build TensorRT engine for EmbeddingGemma using Docker

set -e

IMAGE="nvcr.io/nvidia/tensorrt-llm:0.8.0"
MODEL_DIR="embeddinggemma-001"
ENGINE_DIR="engine"

# Run Docker container to build the engine
docker run --gpus all --rm -v "$(pwd)":/workspace -w /workspace $IMAGE bash -c "
    echo 'Installing dependencies...'
    pip install transformers huggingface_hub

    echo 'Downloading EmbeddingGemma model...'
    git lfs install
    git clone https://huggingface.co/google/$MODEL_DIR || echo 'Model already exists'

    echo 'Building TensorRT engine...'
    python -c \"
import tensorrt_llm
from tensorrt_llm import LLM, BuildConfig

# For embedding model, we need to configure appropriately
# This is a simplified example; adjust for EmbeddingGemma specifics
model = LLM(
    model='$MODEL_DIR',
    build_config=BuildConfig(
        max_batch_size=1,
        max_input_len=512,
        max_output_len=1,  # Embedding output
        dtype='float16'
    )
)
model.save('$ENGINE_DIR')
\"

    echo 'Engine built successfully'
"

echo "TensorRT engine built in $ENGINE_DIR"
echo "Copy the .plan file to your trt_runner directory"