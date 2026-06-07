# AGENTS.md — Deeds Web App

> Legal-AI platform: SvelteKit 2 + Svelte 5 (runes) + Bits UI v2 + Drizzle + pgvector + Qdrant + Redis + Ollama + LibTorch GPU.

## Response rules

- Answer directly and concisely. Do not plan aloud before answering.
- For short/simple inputs, respond immediately — do not run audits or checklists unless explicitly asked.
- Use `rg` (ripgrep) to search before opening files. Never load an entire `.md` into context.

## Search first — never read whole files

Before opening any file, search with `rg` (ripgrep):
```bash
rg -l "keyword"                    # find files containing keyword
rg "keyword" src/ --type ts        # search TypeScript files
rg --no-ignore "keyword"           # include gitignored files (NES/CHROM packets)
```
Only `Read` a file if `rg` confirms it contains what you need. Never load an entire `.md` into context to find one fact.

## Critical constraints

- Svelte 5 runes only: no `export let`, `$:`, `on:click`, or `<slot>`; use `$state`, `$derived`, `$props`, `onclick`, and snippets.
- Bits UI uses namespace imports from `bits-ui`; prefer the `child` snippet pattern.
- Drizzle server code: `$lib/server/db/client`, keep `.js` import extensions, use `migrate` not `drizzle-kit push` on live data.
- GET API routes must return stable JSON shape even on failure (same top-level keys, empty defaults).
- Zod-validate every `request.json()` payload.
- Use `env.server.ts` for service URLs; do not hardcode `localhost` in app code.
- **Port 8888**: Reserved for SeaweedFS Filer. Do NOT bind SearXNG to 8888; use 8889.
- **No hidden thoughts**: Do not persist `hiddenThoughts`, `chainOfThought`, `kv_cache`, or `tensor` to any store.

## Repo map

- `sveltekit-frontend/` — main app root
- `simd-bridge/` — native N-API bridge (LibTorch/simdjson)
- `services/` — standalone Go/Python services
- `docker/` — compose/runtime stacks
- `drizzle/` — migrations and schema assets
- `scripts/` — repo-level tooling
- `docs/` — architecture docs and reports

## Commands

```bash
cd sveltekit-frontend && npm ci
cd sveltekit-frontend && npm run dev
cd sveltekit-frontend && npm run check
cd sveltekit-frontend && npm run test:run
npm run audit:contracts          # full 8-layer audit
npm run audit:drizzle            # Drizzle ↔ Postgres drift
npm run services:health          # TCP health gate
```

## Engram-only mode (current)

```
ENGRAM_ONLY=true  REDIS_ENABLED=false  QDRANT_ENABLED=false
NEO4J_ENABLED=false  GRAPHIFY_STARTUP_ENABLED=false
```

Startup does NOT require Redis/Qdrant/Neo4j. Engram MCP at `:8792` is the only required memory lane.

## Gotchas

- User IDs are mixed across tables; check schema before querying.
- SeaweedFS is the primary S3 gateway; ignore MinIO stubs.
- UnoCSS is the styling baseline; do not assume default Tailwind classes exist.
- `drizzle/meta/` must contain only JSON snapshot/journal files — no `.md` or `.txt`.
- Sidecar migrations in `drizzle/` that are not in `_journal.json` must be listed in `drizzle/sidecar-migrations.json`.

## Reference docs (load on demand, not at startup)

- `docs/architecture/` — layer boundaries, retrieval lanes, trace/karpathy rules
- `docs/ai-os/` — OpenCode context window, MCP atlas, skill routing
- `memory/` — architecture references, session history
- `CLAUDE.md` — full project instructions (loaded separately)
