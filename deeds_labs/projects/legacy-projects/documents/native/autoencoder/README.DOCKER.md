# Adaptive Bridge Docker notes

This directory contains artifacts to build the analytics bridge container that integrates with Triton and Redis for adaptive QLoRA training.

Files:
- Dockerfile.bridge - GPU-enabled image (NVIDIA PyTorch base)
- .env.bridge.example - environment variables for the bridge
- scripts/replay_analytics.py - synthetic data generator for testing
- scripts/healthcheck.sh - container healthcheck for Redis/Triton

Run locally (requires Docker Desktop with GPU support):

# build the bridge image
cd native/autoencoder
docker build -f Dockerfile.bridge -t deeds_analytics_bridge:latest .

# start stack
cd ../..
docker compose up --build

# run synthetic traffic
docker compose exec analytics-bridge python scripts/replay_analytics.py

