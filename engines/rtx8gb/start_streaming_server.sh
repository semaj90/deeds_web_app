#!/bin/bash
# RTX 8GB Streaming Inference Server Startup Script

echo "🎯 Starting RTX 8GB Streaming Inference Server"
echo "=============================================="

# Set environment variables for memory optimization
export CUDA_VISIBLE_DEVICES=0
export PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512
export TORCH_USE_CUDA_DSA=1

# Start the streaming inference server
cd /workspace/engines/rtx8gb
python3 streaming_inference.py
