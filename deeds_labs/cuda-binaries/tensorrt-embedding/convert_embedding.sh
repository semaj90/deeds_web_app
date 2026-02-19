#!/bin/bash

# TensorRT Embedding Conversion Script for embeddinggemma
# Assumes TensorRT-LLM container is available or uses local Python

set -e

WORKSPACE_DIR="$(pwd)"
MODEL_NAME="google/embeddinggemma-001"
MODEL_DIR="${WORKSPACE_DIR}/models/${MODEL_NAME}"
ENGINE_DIR="${WORKSPACE_DIR}/engines"

# Check if using Docker or local
if command -v docker &> /dev/null && docker ps -a | grep -q tensorrt-llm; then
    echo "Using existing TensorRT-LLM container..."
    CONTAINER_ID=$(docker ps -a | grep tensorrt-llm | head -1 | awk '{print $1}')
    docker start $CONTAINER_ID
    docker exec -it $CONTAINER_ID bash -c "
        cd /workspace &&
        if [ ! -d models/google/embeddinggemma-001 ]; then
            echo 'Cloning model...' &&
            pip install transformers huggingface_hub &&
            git lfs install &&
            git clone https://huggingface.co/${MODEL_NAME} models/${MODEL_NAME}
        else
            echo 'Model already exists'
        fi &&
        python -c 'import tensorrt_llm; print(\"TensorRT-LLM OK\")' &&
        echo 'Building TensorRT engine...' &&
        python -m tensorrt_llm.commands.build \\
            --checkpoint_dir models/${MODEL_NAME} \\
            --output_dir engines/embeddinggemma \\
            --dtype float16 \\
            --max_batch_size 1 \\
            --max_input_len 512 \\
            --max_seq_len 512 \\
            --use_gemm_plugin float16 \\
            --use_gpt_attention_plugin float16 \\
            --paged_kv_cache \\
            --remove_input_padding
    "
else
    echo "No TensorRT-LLM container found. Using local Python..."
    if python -c "import tensorrt_llm" 2>/dev/null; then
        echo "TensorRT-LLM available locally"
        # Assume model is downloaded
        python -m tensorrt_llm.commands.build \
            --checkpoint_dir ${MODEL_DIR} \
            --output_dir ${ENGINE_DIR}/embeddinggemma \
            --dtype float16 \
            --max_batch_size 1 \
            --max_input_len 512 \
            --max_seq_len 512 \
            --use_gemm_plugin float16 \
            --use_gpt_attention_plugin float16 \
            --paged_kv_cache \
            --remove_input_padding
    else
        echo "TensorRT-LLM not available. Please install or use Docker."
        exit 1
    fi
fi

echo "TensorRT engine built successfully at ${ENGINE_DIR}/embeddinggemma"