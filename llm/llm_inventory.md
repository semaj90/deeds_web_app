# llm inventory

## Top-level map

- Main app: `sveltekit-frontend/`
- Shared docs and operational notes: repo root, `docs/`, `memory/`, `next_steps/`
- App-specific source: `sveltekit-frontend/src/`
- Repo-root indexing matters: the atlas should cover `docker/`, `.github/`, `services/`, `simd-bridge/`, `drizzle/`, `scripts/`, and other non-frontend roots too.

## Repo size

- Total tracked files: `16,980`
- Largest roots: `sveltekit-frontend/` (`10,765`), `scripts/` (`5,530`), root files (`159`)
- Smaller but important roots: `next_steps/` (`130`), `simd-bridge/` (`53`), `drizzle/` (`44`), `docs/` (`43`), `docker/` (`32`), `services/` (`22`), `llm/` (`7`)

## Verified stack markers

- Language: TypeScript + Svelte 5 runes
- UI: SvelteKit, Bits UI, UnoCSS
- Data: PostgreSQL, Drizzle, pgvector, Redis, Qdrant
- Agent / retrieval: MCP, ACE, KAG, llms.txt-style docs

## Language mix

- Markdown: `6,234`
- TypeScript: `5,059`
- Svelte: `892`
- JS family (`.js` + `.mjs` + `.cjs`): `753`
- SQL: `282`
- JSON: `272`
- PowerShell: `211`
- Python: `130`
- Shell: `64`

## Package roots

- `package.json`
- `sveltekit-frontend/package.json`
- `sveltekit-frontend/src/mcp/zod-to-json-schema-bridge/package.json`
- `vscode-extension/package.json`
- `simd-bridge/rust/hmm-repair/package.json`
- `simd-bridge/rust/graph-engine/package.json`

## High-signal paths

- `sveltekit-frontend/src/routes/` — route handlers and pages
- `sveltekit-frontend/src/lib/` — app logic, UI, stores, server helpers
- `sveltekit-frontend/scripts/` — generators, smoke tests, audits, and repair scripts
- `sveltekit-frontend/tests/` — Vitest and Playwright coverage
- `drizzle/` — SQL migrations and schema assets
- `services/` — standalone service packages
- `docs/` and `memory/` — narrative docs and agent memory
- `docker/`, `.github/`, `simd-bridge/`, `scripts/`, and repo-root config files — deployment, native bridges, and workspace wiring

## What to count here

- file counts per major directory
- package and library inventory
- language mix
- notable feature areas and entrypoints

## Notes

- Keep this page factual and brief.
- Update counts when a directory scan or generator changes the repo shape.
