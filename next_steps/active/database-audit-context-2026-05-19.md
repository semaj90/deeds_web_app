# Database Audit Context — 2026-05-19

Use this as the short seed for follow-up turns.

## Verified status

- `npm run db:studio` starts at `https://local.drizzle.studio`.
- Studio relation extraction fails on `Invalid relation "personsOfInterest" for table "cases"` in `casesRelations`.
- Live Postgres `public` table count is `269`.
- `npm run manifold4:backfill` is dry-run by default with no args; latest run processed `50,594` rows and wrote no Qdrant payloads.
- `npm run graph:export:jsonl:no-neo4j` succeeded and wrote `sveltekit-frontend/logs/graph-export-1779226205282.jsonl` with `50` Karpathy-scored nodes.
- `npm run audit:contracts` passed with `5` low stale-migration findings from documented sidecars.
- `npm run audit:drizzle-meta` passed.
- `npm run audit:pgvector` passed.
- `npm run audit:forms` now passes after adding explicit body validation to `/api/admin/grpo/flush` and `/api/vlm/switch-mode`.
- `npm run services:health:strict` does not resolve in this environment; `npm run services:health` hits `/api/v1/health/cuda` but returns the app shell HTML instead of a machine-readable health payload.

## Main feature domains

- Auth/session and user identity
- Cases, persons of interest, and evidence
- Legal corpus, RAG, and retrieval
- Embeddings, Qdrant, and pgvector search
- Graph/KAG/Cartridge/CHR97 topology
- Courtroom media and reconstruction tooling
- Workspaces, canvas, and notes
- Diagnostics, LLM synthesis, and audit logs

## Current blockers / gaps

- Relation extraction ambiguity around `cases` ↔ `personsOfInterest`.
- Stale duplicate schema fork at `src/lib/db/schema.ts` with placeholder Zod schemas.
- Sidecar migration bookkeeping still has low-severity stale-migration warnings.
- Service-health output is not yet a clean machine-readable JSON contract.

## Docs cues used for the summary

- PostgreSQL DDL / schemas: tables, constraints, partitions, schemas, and dependency tracking.
- TypeScript: static typechecker, handbook structure, and compile-time safety as the first line of defense.
- SvelteKit 2: SSR/CSR/prerender modes, routing, and app structure.
- Playwright: runner, configuration, HTML reports, and UI mode for reproducible test verification.

## Gemma4 prompt seed

Summarize the live database and schema into feature domains, identify what is production-ready, list the remaining gaps and risks, and break the work into subagents or subtasks by domain. Prioritize schema drift, validation gaps, and runtime-health issues.

## Suggested subtask split

- Drizzle/schema: relation cleanup, migration hygiene, drift checks.
- Evidence pipeline: upload, OCR, embedding, and vector storage.
- Search/RAG: Qdrant, pgvector, Bifrost, and retrieval expansion.
- Graph/KAG: cartridges, topology, and codebase graph summaries.
- Routes/forms: API validation and Playwright coverage.
- Health/ops: service probes, Drizzle Studio, and runtime readiness.