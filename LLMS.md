# AGENTS.md — Deeds Web App

> Legal-AI platform: SvelteKit 2 + Svelte 5 (runes) + Bits-UI v2 + Drizzle + pgvector + Qdrant + Redis + Ollama + LibTorch GPU.
> **Note: This file is hand-maintained to keep it compact and high-signal (<10KB).**

## 🚨 Critical Tech Stack Constraints (Read First!)

- **Svelte 5 Runes ONLY**: No `export let`, `$:`, `on:click`, or `<slot>`. Use `$state`, `$derived`, `$props`, `onclick`, and snippets.
- **Bits-UI v2**: Use namespace imports (e.g., `import { Dialog } from "bits-ui"`). Use `child` snippet for transitions, NOT `asChild`.
- **Drizzle Safety**: 
  - Always import from `$lib/server/db/client` (Pool).
  - Use `.js` extensions in imports.
  - NEVER use `drizzle-kit push` on live DBs. Use `generate` -> `migrate`.
- **API Response Contract**: Every GET API route MUST return a consistent JSON shape even on error (empty defaults, not just `{error}`).
- **Auth & Validation**: 
  - Auth check: `if (!locals.user) return json({...defaults, error: 'Unauthorized'}, {status: 401})`.
  - Body validation: Every `request.json()` MUST be validated with Zod.
- **Environment**: Use `env.server.ts` for all service URLs. Never hardcode `localhost`.

## 🛠 Essential Developer Commands

```bash
cd sveltekit-frontend
npm run dev                # Dev server (DEV_BYPASS_AUTH enabled)
npx svelte-check           # Required before every commit
npx vitest run             # Unit tests
npm run agents:write       # Regenerates per-dir docs (use --root-only for speed)
```

## 🏗 Repo Architecture

- `sveltekit-frontend/`: Main app (SvelteKit + Svelte 5).
- `simd-bridge/cpp/`: C++ addon for LibTorch/CUDA & SIMD JSON.
- `go-microservice/`: gRPC retrieval services (:50051-50057).
- `docker/`: Compose stacks for Redis, PG, Qdrant, RabbitMQ.

## 🧭 Navigation & Context

- **Directory Wiki**: See `sveltekit-frontend/AGENTS.md` for a high-level jump table.
- **Per-Dir Context**: Most `src/` subdirectories have their own `AGENTS.md` with local rules/tools.
- **Full Guide**: See `CLAUDE.md` for the canonical 600-line developer guide.

## ⚠️ Known Gotchas

- **User IDs**: Mixed types (INT, UUID, TEXT) across tables. Check schema before querying.
- **Storage**: SeaweedFS (:8333) is the primary S3 gateway; ignore MinIO stubs.
- **UnoCSS**: Do NOT use standard Tailwind classes unless defined in `uno.config.js`.
- **Engram Memory (Lane -1)**: Low-trust pre-routing hints. MUST NOT store hidden thoughts, raw tensors, or model cache. Boosting (0.05) is restricted to debug/workflow profiles and requires `accepted: true`.
- **Port Reservation**: Port 8888 is reserved for SeaweedFS Filer. SearXNG is relocated to port 8889.


---
*This file is protected from auto-generation overwrites.*


<!-- ingest: 2026-05-30T02:17:10.013Z -->
- ingested_nodes: 18742 from C:\Users\james\Videos\deeds-web-app\.opencode\cards


[2026-05-30T04:39:26.319Z] Phase19 CSV export and archive-preview generated (dry-run)