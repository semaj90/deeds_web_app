## Why

Operator (2026-08-22) reported detailed work on two concurrent agent branches — `agent/fanout-proof-db-readiness-20260822` (fixes two real defects blocking the Graphify FANOUT revision-owner proof) and `agent/ace-centroid-alignment-20260822` (fixes real centroid/routing-tier schema drift and adds a versioned Valkey cache envelope) — and asked for independent review plus continued implementation. This session verified both branches directly against their actual diffs (not just the operator's prose) in isolated detached worktrees, ran every step the operator's own text described as safe/read-only, and records the results here.

## Verification method

Both branches exist on `origin` (`agent/fanout-proof-db-readiness-20260822`, `agent/ace-centroid-alignment-20260822`). Checked out each into an isolated `git worktree add --detach` copy (deliberately not touching the shared primary working directory, which has ~159 files under concurrent modification by other active agent processes this session — see `inference-wiring-deep-audit-aug22` task 5.9 for the established pattern). `node_modules` and `.svelte-kit` were reused via NTFS junctions from the main checkout rather than reinstalling, to keep verification fast without mutating either the main tree or the worktree's own git state.

## Findings — `agent/fanout-proof-db-readiness-20260822`

**Diffstat**: 3 files changed, 15 insertions, 402 deletions (5 commits ahead of `main`, 0 behind) — matches the operator's "3 commits ahead, 0 behind, three changed files" claim closely (commit count differs slightly, likely due to squashing/merge commits, file count and scope match exactly).

1. **`drizzle/manual/20260822_graphify_revision_authority_v2.sql` — confirmed genuinely broken SQL, confirmed fixed.** Direct diff read shows the pre-fix version had a `DO $$ ... END $$;` block that closed early after the `content_hash_sha256_v2` constraint, followed by a **bare `IF NOT EXISTS (...) THEN ... END IF;` sitting outside any `DO` block** — not valid standalone SQL (only valid inside PL/pgSQL). Also had duplicate/orphaned `COMMENT ON` statements and one truly orphaned string literal sitting between two `COMMENT ON` calls. The fix merges everything into one valid `DO` block owning all five constraints, no destructive DDL added or removed (confirmed: no `DROP`/`DELETE`/`TRUNCATE`/`UPDATE` present in either version).
2. **`scripts/atlas/materialize-graphify-source-inventory.mts` — confirmed genuinely merge-corrupted, confirmed fixed.** `git show main:...` confirms the pre-fix file was 324 lines. Post-fix it is exactly 3 lines: a shebang, a docstring comment, and `import './materialize-graphify-source-inventory-v3.mts';` — a clean compatibility shim, matching the operator's description exactly.
3. **`scripts/atlas/prove-graphify-revision-owner-v2.mts` — confirmed, small and correct.** `WRITER_RELATIVE` repointed from the (now-shim) `materialize-graphify-source-inventory.mts` to `materialize-graphify-source-inventory-v3.mts` directly, so the independent proof script inspects the real writer instead of the compat wrapper. Two log-message strings updated to say "V3" for clarity. No logic change beyond the path.

**Read-only verification run this session**: `npx tsx scripts/atlas/materialize-graphify-source-inventory-v3.mts --source sveltekit-frontend/src/lib/server/atlas/indexing/code-revision-authority-v1.ts` (no `--apply` — confirmed by direct code read that DB writes are gated behind `apply && ATLAS_GRAPHIFY_SOURCE_INVENTORY_APPLY==='1' && ATLAS_NON_PRODUCTION_DATABASE==='1'`, none of which this invocation set, so the entire `if(apply){...}` DB-write block at the bottom of the script was structurally unreachable). **Result: [FILL IN AFTER BACKGROUND RUN COMPLETES — see tasks.md 1.4]**.

## Findings — `agent/ace-centroid-alignment-20260822`

**Diffstat**: 8 files changed, 498 insertions, 99 deletions (11 commits ahead of `main`, 0 behind) — matches the operator's "9 commits ahead, 0 behind, eight changed files" closely.

1. **Removed two duplicate migration files — confirmed genuinely redundant, confirmed safe to remove.** `drizzle/manual/codebase_chunk_index_routing_tier_columns.sql` and `drizzle/manual/route_runtime_packets_raw_column.sql` (both applied to live Postgres by *this session*, earlier today, per this session's own prior record in `inference-wiring-deep-audit-aug22`) are confirmed genuine duplicates: `drizzle/manual/20260516_storage_tier_routing.sql` (dated May 16, pre-existing) already adds `centroid_id uuid REFERENCES centroid_registry(id)`, `compressed_embedding vector(64)`, `reconstruction_error real`, and `routing_tier varchar(10)` as `ADD COLUMN IF NOT EXISTS` — verified via direct grep of that file's content. Since both the removed duplicates and the May migration are idempotent (`IF NOT EXISTS`), no live data or schema state is affected by removing the duplicate *files* — this is pure git-history cleanup, not a database change.
2. **`schema/search-analytics.ts` — confirmed a real, live type-mismatch bug fix.** Pre-fix: `compressedEmbedding` was fully commented out with the wrong dimension (128, not 64), and `centroidId: integer('centroid_id')` — but the actual live column (per the May migration) is `uuid`, not `integer`. Post-fix: `compressedEmbedding: vector('compressed_embedding', { dimensions: 64 })` (uncommented, correct dimension) and `centroidId: uuid('centroid_id')` (correct type), plus a new `routingTier: varchar('routing_tier', { length: 10 }).default('cold')` field that didn't exist in the Drizzle schema at all before. This was a genuine Drizzle-schema-vs-live-Postgres type drift, now fixed.
3. **New `centroid-cache-contract-v1.ts` + versioned Valkey envelope wiring in `centroid-cache.ts`** — not independently re-derived line-by-line this pass (time-boxed), but validated via the branch's own static audit script (see below) and its own spec test (both run successfully this session).

**Verification runs this session** (both from the isolated worktree, both genuinely passed):
- `node scripts/atlas/audit-ace-storage-runtime-alignment.mjs` — a pure static file-content audit (no DB connection). **Result: 35/35 checks passed**, `"pass": true`. Covers file existence, migration column ownership, Drizzle schema type correctness, duplicate-file absence, Redis/Valkey single-owner delegation, and centroid-cache contract/envelope wiring.
- `npx vitest run src/lib/server/retrieval/centroid-cache-contract-v1.spec.ts` — **5/5 tests passed**.
- **Correction to the operator's proposed command**: the operator's suggested second spec file, `src/lib/server/atlas/retrieval/semantic-storage-boundary-v1.spec.ts`, **does not exist anywhere on this branch** (confirmed via `find` across the full worktree). Either a naming mismatch, a file from a different/future branch, or a typo in the operator's proposed command — flagged, not chased further.

## Non-Goals

- This proposal does not merge either branch into `main`. Both remain on their own `agent/*` branches, unmodified by this review.
- Does not proceed to the disposable-Postgres-on-55432 migration progression (schema clone → migration apply → canary → full apply → rollback proof) described in the operator's fanout-proof plan — that's a real infrastructure action (Docker container creation, live migration application even if to a disposable DB) with enough steps and failure surface that it's tracked as its own follow-up task, not done inline with this review.
- Does not run the real `:8090` ACE chat replay described as the ace-centroid-alignment branch's next runtime gate — same reasoning, tracked as follow-up.
- Does not touch `LEGACY_TRACE_CANDIDATE_IDENTITY_BLOCKED` / `CANONICAL_TRAINING_CORPUS_BLOCKED` (owned by the concurrent, separate trace-candidate-fabric work already tracked elsewhere this session).

## Impact

- **Code affected**: none — this is a review-only pass. Both `agent/*` branches are unmodified.
- **Confidence**: both branches' core described defects and fixes are independently verified accurate, not just operator-asserted. One inaccuracy found and corrected (a nonexistent proposed test file path). Both branches appear safe to merge from a correctness standpoint (no destructive DDL, no live-data-touching change, static+unit verification passing) — the merge decision itself is out of scope here.
