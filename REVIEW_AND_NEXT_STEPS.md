# Parent Atlas — Current State and Next Steps
Date: 2026-08-23

## Current state

### Runtime / operator guidance
- Active guidance has been reconciled to canonical 768-dimensional retrieval and `codebase_chunks_768`.
- Active Valkey naming has replaced old Redis operator names.
- Live runtime checks reported healthy Postgres, Qdrant, embedding, RabbitMQ, SeaweedFS, Neo4j, Valkey, and retrieval services.
- Legacy Redis, CouchDB, anonymous proof, and old Qdrant/cache volumes were removed after owner and mount checks; active Valkey/Qdrant volumes were preserved.
- Docker image and build-cache cleanup is complete; no pending storage cleanup remains in this review.

### Graphify revision authority
- The Graphify v2 migration has been hardened to additive-only DDL:
  - CREATE TABLE IF NOT EXISTS
  - ADD COLUMN IF NOT EXISTS
  - ADD CONSTRAINT ... NOT VALID
  - CREATE INDEX IF NOT EXISTS
- DROP / DELETE / TRUNCATE / UPDATE-backfill / ON DELETE CASCADE are prohibited for this tranche.
- FANOUT remains blocked until migration preflight, controlled writer/readback, and independent revision-owner proof succeed.

### Deep audit / D9
- `scripts/deep-audit-ast.mjs` imports `{ glob }` from `glob`.
- The current `sveltekit-frontend` install reports `glob@10.5.0` as extraneous, and named `glob` exports are available.
- The reproducibility gap is dependency declaration/lockfile ownership; the prior glob-7 API diagnosis is stale and was not reproduced in this review.
- Also note the script currently parses `--gate=<value>`; use `--gate=D9` unless its argument parser is hardened.
- D9 completed read-only on 2026-08-23: 18,618 targets processed, 7,415 verifier candidates, and 11,203 classified false positives or special references. The triage pass reports 7,348 real candidates, led by vendored/tooling trees and `sveltekit-frontend/src/lib/server`. These remain review candidates; no files were deleted or archived.
## Recommended next sequence

1. **Do not bulk-upgrade `glob` yet.**
   The repo contains many glob call sites. Upgrading the package globally could create a broad migration surface.

2. **Resolve the direct `glob` dependency before changing audit code.**
   Confirm the intended package manager, declare a compatible direct dependency for `sveltekit-frontend`, reinstall cleanly, and rerun D9. Do not add a compatibility adapter until a clean install reproduces an API mismatch.

3. **Harden the gate argument parser.**
   Accept both:
   - `--gate=D9`
   - `--gate D9`

4. **Add one focused npm entry only if desired.**
   Suggested:
   `audit:d9 = node scripts/deep-audit-ast.mjs --gate=D9`
   Do not copy the large `.docker-build/package.json` script set back into live `package.json`; that snapshot is divergent.

5. **Run D9 proof.**
   - run the read-only Graphify readiness check; refresh only after an explicit review of mutation scope
   - run the D9 audit
   - inspect `triage-d9-orphans.mjs`
   - classify findings before deleting anything
   - no orphan deletion in the first proof pass

6. **Then return to the Graphify revision-owner gate.**
   Run:
   - additive-only migration static audit
   - read-only DB preflight
   - revision-owner canary
   - rolled-back writer/readback
   - optional bounded non-production persistence
   Only after `REVISION_OWNER_PROVEN` should snapshot/Qdrant lineage and FANOUT proceed.

7. **Keep storage cleanup separate.**
   Storage cleanup was completed separately; the active Qdrant production/snapshot and Valkey volumes remain preserved.

## Revision-owner gate result

- Additive migration safety: `GRAPHIFY_REVISION_MIGRATION_ADDITIVE_ONLY_PROVEN` (read-only; no canonical write attempted).
- Database preflight: `GRAPHIFY_REVISION_MIGRATION_PREFLIGHT_COMPATIBLE`; `graphify_runs` and `graphify_files` are present with the v2 revision columns and no base-schema conflicts.
- Revision-owner canary initially exposed a stale contract check; it now matches v2 and passes schema compatibility with `REVISION_OWNER_TABLE_READY_NO_SAMPLE_ROWS`. No source rows exist, so `durableOwnerBound=false` and `fanoutMayConsumeAsCanonical=false` remain correct.
- Source-inventory dry run initially timed out because it launched Git subprocesses per file. The materializer now uses bulk `ls-tree` and `diff` lookups; the rerun completed read-only in about 32 seconds with 23,166 manifest sources, `canonicalWriteAttempted=false`, and `graphMayConsumeWorkspaceRevision=false`. Do not apply FANOUT or delete/archive D9 candidates based on the current evidence.
- Focused authority fixtures pass: 3 test files and 10 tests covering the writer, write plan, and revision-owner contracts.
- Read-only observer completed with 23,169 bound sources and 89 skipped; the writer preflight correctly stopped because no existing graphify_runs workspace UUID is available. prove-graphify-revision-owner-v2.mts reports REVISION_OWNER_READY_FOR_CONTROLLED_CANARY, persistedMatchingRows=0, and CONTROLLED_PERSISTENCE_CANARY_NOT_PROVEN.
- The writer harness now requires ATLAS_NON_PRODUCTION_DATABASE=1 for apply and a separate commit confirmation for any durable commit.
## Suggested D9 commands

```powershell
cd C:\Users\james\Videos\deeds-web-app\sveltekit-frontend

# verify inputs without writes
npm run atlas:graphify:daily:readiness

# only after explicit mutation review, refresh Graphify separately

# after compatibility patch
node scripts/deep-audit-ast.mjs --gate=D9

# then triage only; do not delete
node scripts/triage-d9-orphans.mjs
```

## Promotion boundaries

Do not call any of these complete yet:
- D9 orphan verification
- Graphify revision authority
- snapshot revision alignment
- Qdrant lineage alignment
- FANOUT-01

The immediate smallest safe engineering step is declaring/verifying the direct `glob` dependency plus D9 argument-parser hardening.
## BM25 Graphify index control

- Existing codebase_chunk_index.search_vector and idx_codebase_chunk_bm25_search remain the lexical document lane; PostgreSQL 18 bitmap scans operate on that GIN index.
- Added manual migration sveltekit-frontend/drizzle/manual/20260823_graphify_bm25_index_control_v1.sql for graphify_bm25_index_runs and graphify_bm25_index_candidates.
- Added read-only planner sveltekit-frontend/scripts/atlas/plan-graphify-bm25-index.mjs; current result is BM25_CONTROL_PLANE_MIGRATION_REQUIRED because the manual migration is unapplied.
- index_run_id is ULID; workflow_id remains stable logical identity; graphify_run_id remains the existing UUID execution identity.
- No hourly schedule is installed yet. Apply and prove the control-plane migration first, then add the external worker/pg_cron schedule.
