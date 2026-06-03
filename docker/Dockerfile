# Dockerfile
# ----------------------------------------------------------------------------------
# Stage 1: Base image (Start from the official, verified TRT-LLM image)
FROM nvcr.io/nvidia/tensorrt-llm/release:latest AS base

# Stage 2: Install required system packages (build-essential, rustc, cargo)
# We use one RUN command to keep this in one cache layer
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    rustc \
    cargo \
    && rm -rf /var/lib/apt/lists/*

# Stage 3: Install Python dependencies (CRITICAL FIX for Conv1D error)
# This layer caches the specific transformers version (4.31.0)
RUN python -m pip install --no-cache-dir --no-deps \
    'transformers==4.31.0' \
    safetensors \
    numpy

# Final image will be based on this, with all permanent dependencies installed.
# ----------------------------------------------------------------------------------