# Phase 89 Stats and Runtime Error Priority

Date: 2026-10-18

## Finding

`GET /api/phase89/stats` queried `kg_nodes.kind`, `kg_edges`, and `error_embeddings`, which do not match the preserved schema. The schema uses `kg_nodes.node_type`, `cpg_edges`, `phase89_import_edges`, and `raw_error_embeddings`.

## Changes

- Updated the stats query to the preserved table and column names, and kept one stable response shape for success, authorization failure, and database failure.
- Added a read-only runtime-error priority lane to the Daily Graphify admin dashboard. It groups recent `error_events` into stable fingerprints and ranks them by severity, recurrence, and recency; operators can view Top 10 or Top 100.
- Kept runtime reports diagnostic-only. They do not create Kanban tasks, promote Graphify evidence, or authorize execution.

## Verification

- Focused Vitest: 4 tests passed across the stats route and priority projection.
- Read-only PostgreSQL execution: the corrected stats query and ranking query executed successfully; the 30-day window contained 85 grouped error patterns at verification time.
- `git diff --check` passed for the changed route and dashboard files.
- `npm run check` was started but interrupted after prolonged high-memory activity; it is not a passing check. No dev server or other user process was stopped.
- No Graphify crawl, task write, or durable database mutation was performed.

## OpenSpec Source Index Follow-up

- Refreshed the diagnostic census: 13,865 task rows across 132 changes; 5,612 unchecked source locators; `promotionEligible=false` because identity/evidence conflicts remain.
- Corrected importer snapshot identity to hash the workspace revision plus deterministic source-row manifest. Volatile census metadata no longer collides with an immutable snapshot key.
- Final bounded import: `SOURCE_INDEX_READBACK_PROVEN`, snapshot `sha256:c4ec05f56564f692e75607db2f32907751f38e77205747ce8abf4820b00f6d6f`, 5,612 source refs, 0 invalid. Independent `BEGIN READ ONLY` readback confirmed 5,612 stored and distinct refs: 3,010 declared IDs, 2,400 derived IDs, and 202 ambiguous IDs.
- The separate executable Kanban row count remains 166. No task promotion or workflow dispatch occurred. The census remains diagnostic-only, not proof that every task is safe to execute.
- Dry-run, apply, and readback artifacts are under `.tmp/atlas-goal-continuation-20261019/source-index-final/` (gitignored).
