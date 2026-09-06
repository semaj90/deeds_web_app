# AGENTS.md — sveltekit-frontend

> SvelteKit 2 + Svelte 5 (runes) + bits-ui v2 + UnoCSS + Drizzle + pgvector + Qdrant + Redis + Ollama + LibTorch GPU.

## What changed here (2026-09-05)

This file used to be a 1.16MB / 4,542-line generated "Full Repository Index," always injected
into ambient context by OpenCode's directory walk-up convention (any file literally named
`AGENTS.md`) on every session with a CWD under this directory. That content is stale (generated
2026-05-15, its own `npm run agents:write` regen command no longer exists) and is preserved,
not deleted, at `docs/reports/sveltekit-frontend-full-repository-index-v1.md` — retrievable via
`rg`/ACE selection on demand, per this repo's archive-not-delete convention.

Per-directory `AGENTS.md` files elsewhere under `src/` are unaffected — agents still walk up
from any file to the nearest one; only this root-level file changed.

## Critical constraints (this subtree)

- Svelte 5 runes only: no `export let`, `$:`, `on:click`, or `<slot>`; use `$state`, `$derived`,
  `$props`, `onclick`, and snippets.
- Bits UI v2: namespace imports from `bits-ui`, prefer the `child` snippet pattern over `asChild`.
- Drizzle server code: import from `$lib/server/db/client`, keep `.js` import extensions, use
  `drizzle-kit migrate` (never `push`) against live data.
- GET API routes return a stable JSON shape even on failure (same top-level keys, empty defaults).
- Zod-validate every `request.json()` payload.
- Use `env.server.ts` for service URLs; never hardcode `localhost` in app code.
- Never persist `hiddenThoughts`, `chainOfThought`, `kv_cache`, or raw tensor state to any store.

## Search first — never load a whole generated file

```bash
rg -l "keyword"                    # find files containing keyword
rg "keyword" src/ --type ts        # search TypeScript files
```

Only `Read` a file if `rg` confirms it contains what you need — including the relocated full
index above; grep it, don't load it whole.

## Reference

- Root `AGENTS.md` (workspace root) — response rules, Parent Atlas ownership/retrieval fabric,
  LangGraph and retrieval boundaries.
- `../CLAUDE.md` and `./CLAUDE.md` — full project instructions.
- `docs/reports/sveltekit-frontend-full-repository-index-v1.md` — the relocated generated index
  (directory tree map, per-dir KAG slugs, audit-gate snapshot) — stale, retrieval-only, not a
  live operating contract.
