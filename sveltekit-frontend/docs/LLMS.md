# AGENTS.md — `sveltekit-frontend/docs`

## Purpose

Documented planning and architecture notes that should be visible to the repo's existing AGENTS indexing pipeline.

## Index targets

- `agents_master_stack_checklist.md`
- `agents_master_stack_checklist.build.md`
- `agents_master_stack_checklist.dev.md`
- `agents_master_stack_checklist.test.md`
- `agents_master_stack_checklist.prod.md`
- `AGENTS.md`

## Fields

- `name`: stable slug for the note or checklist family
- `title`: human-readable heading
- `description`: one-line purpose statement
- `env`: `dev`, `test`, `prod`, or `all`

## Path mapping

- Prefer explicit path mapping notes for static imports, dynamic imports, and runtime-resolved module paths.
- Capture Karpathy-derived runtime traces as file-path references, not as free-form prose.
- Include SvelteKit 2, TypeScript, `drizzle-orm`, and related indexing signals where they matter for cross-file lookup.

## Checklist

- [ ] Keep docs entries short and machine-parseable.
- [ ] Preserve `name / title / description / env` fields in every new planning note.
- [ ] Record static and dynamic import paths when a note depends on code behavior.
- [ ] Keep this directory visible to `npm run index:codebase:fast && npm run agents:write`.

## Summary

This directory contains human-facing index notes that should still be machine-discoverable. The goal is to keep the docs aligned with the same walk-up and path mapping behavior used by the rest of the codebase index.

<!-- ingest: 2026-05-30T02:17:10.013Z -->
- ingested_nodes: 18742 from C:\Users\james\Videos\deeds-web-app\.opencode\cards

<!-- atlas-append:0bf81df426b5:2026-05-30T16:27:00.892Z -->
## Atlas Activity — 2026-05-30T16:27:00.892Z

- **Parent atlas rebuild**: 10,732 nodes / 9,378 edges across 8 lanes
- **Redis cache**: 10,732 nodes warmed (24h TTL)
- **CouchDB archive**: 11,136 docs durably persisted
- **This directory**: no tasks or fixes in current run

<!-- /atlas-append:0bf81df426b5 -->

