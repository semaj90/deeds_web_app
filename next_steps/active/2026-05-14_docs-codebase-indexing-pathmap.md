# Docs Codebase Indexing + Path Map

> Captured 2026-05-14 after splitting the stack checklist into focused docs and adding `sveltekit-frontend/docs/AGENTS.md`.

## Goal

Wire the new docs into the existing codebase indexing pipeline so they are discoverable by the same AGENTS / Karpathy / path-mapping surface used for source files.

## What to index

- `sveltekit-frontend/docs/agents_master_stack_checklist.md`
- `sveltekit-frontend/docs/agents_master_stack_checklist.build.md`
- `sveltekit-frontend/docs/agents_master_stack_checklist.dev.md`
- `sveltekit-frontend/docs/agents_master_stack_checklist.test.md`
- `sveltekit-frontend/docs/agents_master_stack_checklist.prod.md`
- `sveltekit-frontend/docs/AGENTS.md`

## Path mapping signals

- Static imports: `@sveltejs/kit`, `svelte`, `vite`, `typescript`, `drizzle-orm`
- Dynamic imports: runtime `import()` paths used by indexing and validation scripts
- Runtime traces: Karpathy/GPU indexing outputs that resolve to file paths, not prose
- Cross-file anchors: `src/routes`, `src/lib/server/db`, `src/lib/server/retrieval`, `src/mcp`

## Checklist

- [ ] Ensure the docs directory stays visible to `npm run index:codebase:fast`.
- [ ] Keep `sveltekit-frontend/docs/AGENTS.md` as the walk-up entry for docs.
- [ ] Preserve `name / title / description / env` fields in doc notes.
- [ ] Add explicit static and dynamic import path references where the docs mention code behavior.
- [ ] Feed Karpathy-derived path mappings into the same index surface as the rest of the repo.

## Store roles

Postgres = truth
Qdrant = dense retrieval
Neo4j = graph topology
Redis = hot ACE cache
CouchDB = stitched wiki/MapReduce
DuckDB = local reconciliation analytics
SurrealDB = research spike only

## Summary

The docs should be indexed through the existing pipeline, not a parallel system. SurrealDB stays documented as a research card only while the current store split remains the production answer.
