# Dev Checklist

name: agents_master_stack_checklist.dev
title: Dev Checklist
description: Local development and tooling dependencies.
env: dev

Purpose: keep local development fast, explicit, and close to production behavior.

## Required packages
- `@sveltejs/kit`, `svelte`, `vite`, `typescript`, `@sveltejs/vite-plugin-svelte`
- `bits-ui`, `@unocss/core`, `@unocss/preset-uno`, `@unocss/vite`
- `svelte-check`, `vitest`, `eslint`, `prettier`, `tsx`

## Checklist
- [ ] Keep `npm run dev` and `npm run dev:full` working.
- [ ] Keep `svelte-check`, `vitest`, `eslint`, and `prettier` runnable locally.
- [ ] Document local service endpoints for Postgres, Redis, Qdrant, SeaweedFS S3, and Ollama.
- [ ] Keep dev bypasses isolated from production code paths.
- [ ] Include `dev-only` packages in local installs.

Development should optimize for feedback loop speed without hiding runtime differences. If a dependency only exists for local tooling, it belongs here and nowhere else.
