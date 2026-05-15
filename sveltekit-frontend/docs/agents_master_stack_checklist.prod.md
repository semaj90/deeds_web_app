# Prod Checklist

name: agents_master_stack_checklist.prod
title: Prod Checklist
description: Production runtime dependency and boundary checklist.
env: prod

Purpose: keep runtime images small, pinned, and explicit about service boundaries.

## Required packages
- `@sveltejs/kit`, `svelte`, `vite`, `typescript`
- `bits-ui`, `@unocss/core`, `@unocss/preset-uno`, `@unocss/vite`
- `@modelcontextprotocol/sdk`, `@qdrant/js-client-rest`, `ioredis`, `ollama`, `pg`
- `docling-parse`, `ultralytics`, `opencv-python-headless`, `openai-whisper`, `transformers`, `torch`, `safetensors`

## Checklist
- [ ] Pin runtime versions for app, Python services, and native addons.
- [ ] Document required env vars for every external service.
- [ ] Keep optional integrations behind a feature boundary or fail-open path.
- [ ] Exclude `dev-only` packages from production images.
- [ ] Reuse base layers for heavy ML packages.

Production should ship only what live traffic needs. Anything extra should either be feature-flagged or moved into a sidecar service.
