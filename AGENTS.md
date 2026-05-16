# AGENTS.md — Deeds Web App

> Legal-AI platform: SvelteKit 2 + Svelte 5 (runes) + Bits UI v2 + Drizzle + pgvector + Qdrant + Redis + Ollama + LibTorch GPU.

## Critical constraints

- Svelte 5 runes only: no `export let`, `$:`, `on:click`, or `<slot>`; use `$state`, `$derived`, `$props`, `onclick`, and snippets.
- Bits UI uses namespace imports from `bits-ui`; prefer the `child` snippet pattern.
- Drizzle server code should come from `$lib/server/db/client`, keep `.js` import extensions, and use migrate flows rather than `drizzle-kit push` on live data.
- GET API routes should keep a stable JSON shape even on failure.
- Zod-validate every `request.json()` payload.
- Use `env.server.ts` for service URLs; do not hardcode `localhost` in app code.
- **Engram Memory (Lane -1)**: Low-trust pre-routing hints. MUST NOT store hidden thoughts, raw tensors, or model cache.
- **Port 8888**: Reserved for SeaweedFS Filer. Do NOT bind SearXNG to 8888; use port 8889 (SEARXNG_PORT=8889).

## Docs Ingestion Governance
- **Official Docs First**: Prioritize official documentation over third-party tutorials or blog posts.
- **SourceRefs Required**: Every synthesized fact or code suggestion must include valid `sourceRefs` to the local Docs Atlas.
- **External Unverified**: All external web results are marked `external_unverified` until promoted by an operator or validated against the codebase.
- **No Direct Promotion**: Do not promote web search results directly to the canonical knowledge base without verification.
- **No Hidden Reasoning**: Do not store `hiddenThoughts`, `chainOfThought`, or `kv_cache` in the Docs Atlas or browser outputs.
- **Multi-Lane Retrieval**: Retrieval should always combine `local_code` (Parent Atlas) and `official_docs` (Programming Docs Atlas).
- **External Collection**: Use `external_programming_docs_768` in Qdrant for technical documentation.
- **Trust Hierarchy**: `local_code` (Authoritative) > `official_docs` (High Trust) > `external_unverified` (Web/Low Trust).


## Commands

- `cd sveltekit-frontend && npm ci`
- `cd sveltekit-frontend && npm run dev`
- `cd sveltekit-frontend && npm run check`
- `cd sveltekit-frontend && npm run test:run`
- `cd sveltekit-frontend && npm run agents:write`

## Repo map

- `sveltekit-frontend/` is the main app root.
- `simd-bridge/` holds the native bridge code.
- `services/` holds standalone services.
- `docker/` holds compose/runtime stacks.
- `drizzle/` holds migrations and schema assets.
- `scripts/` and `docs/` contain repo-level tooling and documentation.

## Agent context

- The repo-local wiki lives in `llm/`.
- `llm/llm_timeline.md` is append-only and must never lose prior entries.
- When updating `llm/`, add a new timestamped note instead of rewriting history; keep the index and timeline in sync.
- Prefer `llm/llm.md` plus the nearest `AGENTS.md` for agentic context; treat `llm/` as the repo's `llms.txt`-style ingest hub for ACE packet injection, 4D topology lookup, and Gemma4 tool-calling.
- Do not create new directory `AGENTS.md` files just to mirror docs; use `llm/` pages for durable repo-wide context and add directory files only when a subtree already depends on them.

## Gotchas

- User IDs are mixed across tables; check schema before querying.
- SeaweedFS is the primary S3 gateway; ignore MinIO stubs.
- UnoCSS is the styling baseline; do not assume default Tailwind classes exist.
