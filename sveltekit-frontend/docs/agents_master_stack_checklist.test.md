# Test Checklist

name: agents_master_stack_checklist.test
title: Test Checklist
description: Contract, smoke, and packaging regression coverage.
env: test

Purpose: protect API contracts, packaging boundaries, and external service integrations.

## Required packages
- `vitest`, `svelte-check`, `tsx`
- `@modelcontextprotocol/sdk`, `@qdrant/js-client-rest`, `ioredis`, `pg`

## Checklist
- [ ] Keep tests under the configured Vitest include paths.
- [ ] Cover auth, validation, and degraded response shapes.
- [ ] Add image/build smokes for Python service containers.
- [ ] Keep one smoke for each critical external integration.
- [ ] Validate that optional sidecar packages fail gracefully when missing.

Testing should catch both code regressions and packaging regressions. The current stack needs contract tests for the app and smoke tests for the heavy service images.
