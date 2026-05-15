# Build Checklist

name: agents_master_stack_checklist.build
title: Build Checklist
description: Reproducible build and image-layer guidance.
env: prod

Purpose: keep image builds reproducible, compressed, and split between app runtime and heavy ML sidecars.

## Required packages
- `@sveltejs/kit`, `svelte`, `vite`, `typescript`, `@sveltejs/vite-plugin-svelte`
- `docling-parse`, `ultralytics`, `opencv-python-headless`, `openai-whisper`, `transformers`, `torch`, `safetensors`

## Checklist
- [ ] Pin Node and lockfile versions.
- [ ] Keep Dockerfile system deps explicit for Python images.
- [ ] Cache large Python wheels.
- [ ] Move optional ML workloads into sidecars when possible.
- [ ] Keep `prod-only` packages out of dev images unless a smoke needs them.

Build cost is dominated by large wheels and repeated layer invalidation. The safest compression strategy is to isolate heavy ML packages and reuse layers aggressively.
