# OpenSpec: Manual Migration Reconciliation Tasks

## MMR1.0 - Current safe boundary (2026-08-31)

- [x] Read-only integrity audit completed: the Drizzle journal has 41 entries, the live Drizzle/public migration ledgers are empty, 66 root SQL files are outside the journal, and 41 journal hashes/live rows are unresolved.
- [x] No safe automated baseline/reconciliation owner was found. The existing integrity script is diagnostic; `--fix-hashes`, migration-row registration, loose-SQL moves, and migration apply remain mutating actions.
- [x] Produce an explicit migration inventory and baseline decision (accepted history, applied-outside-Drizzle history, deferred proposals, and canonical owner) before changing either ledger or applying `feature_registry`. Read-only receipt: `docs/reports/migration-baseline-decision-v1.json`; unresolved owners remain apply-blocking.
- [x] Keep `public.feature_registry` absent and `feature-registry.ts` unapplied until the baseline decision and shape reconciliation are approved. The baseline receipt records `feature_registry` as proposed-only and `writesPerformed=false`.
- [x] Extended `scripts/atlas/audit-atlas-migration-owners.mjs` to include `feature_registry`; the refreshed audit correctly reports `MISSING_MANIFEST_REGISTRATION` instead of omitting this unresolved owner.
- [x] Corrected that audit's repository-path resolution and quoted-table parser; `feature_registry` SQL now resolves to the real competing definitions and reports no missing expected columns, while remaining unapplied and unregistered.
- [x] Re-ran live schema drift inspection: snapshot expects 369 tables, live PostgreSQL has 526, with 159 blocking differences. This confirms that global `drizzle-kit migrate`/ledger repair is unsafe; reconciliation must remain scoped and baseline-driven.
- [ ] Register the selected feature-registry owner in the sidecar/journal decision record only after the migration baseline and schema shape are approved.
- [x] Recorded a non-applied owner decision: current `feature-registry.ts` is the proposed shape owner; `0024_nebulous_mongoose.sql` is historical/incomplete relative to it; `proposed_20260530_task_semantic_packets.sql` remains an unapproved competing proposal. See `docs/reports/feature-registry-owner-decision-v1.json`.
- [x] Confirmed the proposed task-semantic SQL must not be applied as a bundle: `task_semantic_packets` is live under another owner; `agent_pickup_queue` is absent from the live catalog and remains proposal-only, while `workspace_tasks`, `task_file_links`, and `task_cluster_links` remain proposal-only pending dedup review.
- [x] Compared `agent_run_events` with live event surfaces; no exact table exists, but `agent_actions`, `tool_call_events`, `trace_events`, and `workflow_action_receipts` already provide overlapping event ownership. Treat `agent_run_events` as a semantic-mapping decision, not an additive migration.
- [x] Recorded field-level mapping and rejected a duplicate table for now. `trace_events` is the closest generic event owner; task/pickup linkage remains unresolved. See `docs/reports/agent-run-events-owner-mapping-v1.json`.
- [x] Verified linkage types are not interchangeable: workflow runs use UUIDs, active task packets use integer workspace-task relationships, and pickup rows mix text task IDs with integer workspace-task IDs. No lossless direct bridge to the proposed event schema exists yet.
- [x] Found the closest existing event owner: live `kanban_task_events` already carries `task_id`, `run_id`, `event_type`, `payload`, and `created_at`. Prefer it over creating `agent_run_events`; unresolved pickup/agent/trace fields require an approved correlation contract.
- [ ] **BLOCKED_NEEDS_OPERATOR_SIGNOFF — runtime behavior confirmed precisely 2026-09-14 (refines the 2026-08-31 entry, not just re-checked):** `docker exec legal-ai-postgres psql ... -c "SELECT 1 FROM information_schema.tables WHERE table_name='agent_pickup_queue'..."` returns zero rows — confirmed still absent live. Read each of the 3 named call sites directly, not assumed:
  - `src/routes/api/tasks/packets/workflow/+server.ts::loadNextQueuedTask()` (line ~90-119) — raw `sql\`...FROM agent_pickup_queue q...\`` with **no existence guard of its own**. Reached by GET with no `taskId`/`queueId`, and by POST `action:'claim'` (always). Both call sites are wrapped only by the route's generic top-level `try { ... } catch (error) { return json({ok:false,...}, {status:500}) }` — a real Postgres `relation "agent_pickup_queue" does not exist` error is masked into a generic 500, not a silent no-op and not an uncaught crash.
  - `src/lib/server/tasks/semantic-packets.ts::enqueueAgentPickup()` (line ~732-804) — the `existingQueue` `db.select().from(agentPickupQueue)...` (line ~752-758) has **zero try/catch**. The nearby `insert` try/catch (line ~767-803) only special-cases a `lane`-column error message and re-throws everything else via `else { throw error; }`. Called from `runTaskSemanticPacketLifecycle()` (line 854-866, no try/catch of its own), itself called from this same route's POST `run` action (non-dryRun) — again masked only by that route's outer generic 500 catch.
  - `scripts/atlas/create-agent-pickup-packets.mjs` (line 63-81) — **this one is already fail-closed, correctly**: before any query (when not `--dry-run`), it runs an `information_schema.tables` existence check for `workspace_tasks`/`task_semantic_packets`/`agent_pickup_queue` and `throw`s an explicit `LEGACY_PICKUP_APPLY_BLOCKED: required legacy tables are absent: ...; use the approved Kanban/workflow adapter instead` if any are missing. This contradicts the 2026-08-31 entry's framing that this script "publishes `agent_pickup_queue:ready`" unguarded — it does, but only after passing its own guard, so it never reaches the Redis publish with a missing table.
  - **Net finding**: 2 of 3 call sites (the live HTTP route + its service module) have no adapter and no fail-closed guard — they degrade to a masked generic 500 rather than a clear diagnostic. Only the standalone legacy script already guards correctly. The real remaining decision is product/architecture, not further investigation: (a) add the same `information_schema` existence-guard pattern already proven in `create-agent-pickup-packets.mjs` to `loadNextQueuedTask()` and `enqueueAgentPickup()` so they fail with a clear diagnostic instead of a masked 500, or (b) deprecate this route's `claim`/`run` actions entirely in favor of the live Kanban surface (`kanban_task_events`, already identified above as the preferred event owner), or (c) build the real Kanban/workflow adapter and finally apply the sidecar table. This needs the operator's product call, not another investigation pass.
- [x] Correlation payload contract verified with the isolated lane test: 2/2 tests passed, including passthrough event fields and rejection of malformed reserved correlation values.
- [x] Schema export audit confirms `feature_registry` is reachable from the Drizzle entrypoint but absent from the last snapshot; the wider export graph also has 23 duplicate table declarations and 7 duplicate enum declarations. Keep migration generation blocked until duplicate ownership is reconciled.
- [x] Scoped duplicate review is clean for the migration neighborhood: `feature_registry`, `feature_tasks`, `agent_progress_log`, Kanban tables, and `task_semantic_packets` each have one dedicated Drizzle declaration. `agent_pickup_queue` has proposal/sidecar declarations but no live table; treat it as an unresolved adapter decision, not a live owner. The remaining duplicate declarations are unrelated legacy schema surfaces.
- [x] Drizzle configuration review confirms `feature_registry` is not excluded by `tablesFilter`; it is an intended schema surface. The current snapshot contains it, while `_journal.json` stops at `0040_kanban_task_lifecycle`, so the immediate issue is snapshot/journal continuity and live-baseline drift—not schema export omission.
- [x] Snapshot comparison corrected the prior interpretation: both `0040_snapshot.json` and `0041_snapshot.json` contain `feature_registry` and Kanban tables, but `0041.prevId` does not equal `0040.id` and no journal entry references `0041`. Treat `0041` as an orphaned/unproven snapshot artifact until its provenance is resolved; do not migrate from it directly.
- [x] Git provenance resolved: committed `0041_snapshot.json` had the valid `0040` predecessor, while the working-tree version changed its ID and added `semantic_embedding_cache_v2` without a journal entry. The working-tree snapshot is a generated variant; preserve it for review but do not use it as migration authority.
- [x] Corrected the owner audit so `drizzle/manual/proposed_20260530_task_semantic_packets.sql` is reported as an excluded competing definition rather than an owner input for `feature_registry`; the live table remains absent and the migration remains blocked pending baseline approval.
- [x] Re-ran the Drizzle/PostgreSQL contract audit: 8 tables checked, 3 statically aligned, 3 live aligned, 1 live table missing, and 10 historical/static/live blockers remain. Migration-integrity audit still fails four gates (`no loose SQL`, journal entries, hash integrity, latest-applied match); no ledger repair or migration apply is authorized.
- [x] Re-ran the pre-apply guard: `PRE_APPLY_BLOCKED` with `ledgerCount=0`, `liveKnownObjectCount=4`, journal last `0040_kanban_task_lifecycle`, and a fresh live-schema receipt. This confirms `drizzle-kit migrate` must remain blocked until ownership/baseline reconciliation is approved.
- [x] Git-history check refined the proposal status: `drizzle/manual/proposed_20260530_task_semantic_packets.sql` is present in an older committed snapshot, but no live-table or migration-ledger evidence shows it was accepted or applied. Keep it classified as historically committed but operationally unapproved, and continue excluding it from ownership comparisons.
- [x] **Re-verified 2026-09-01 before any feature-registry apply:** live PostgreSQL schema inspection succeeded (526 tables), but the migration-integrity audit remains `FAIL` with four blockers: 66 loose root SQL files, 41 journal entries without live ledger rows, 41 hash mismatches, and live migration max id `0` versus journal count `41`. `feature_registry` remains absent and `MISSING_MANIFEST_REGISTRATION`; do not run global `drizzle-kit migrate`, `--fix-hashes`, or ledger repair until the baseline decision is approved.
- [x] **Scoped baseline recheck 2026-09-01:** the proposed disposable-baseline scripts were not present in this checkout, so no disposable PostgreSQL proof was claimed. The actual read-only `scripts/atlas/audit-atlas-migration-owners.mjs` ran against live PostgreSQL successfully: `feature_registry` remains `MISSING_MANIFEST_REGISTRATION`; the other reported owners are classified by the audit as aligned, sidecar-unapplied, or superseded. Keep the feature-registry baseline unresolved and do not substitute this audit for a disposable migration proof.
- [x] **Disposable feature-registry proof 2026-09-01:** used the locally available `pgvector/pgvector:pg18` image with an auto-removed container. Applied `0024_nebulous_mongoose.sql` and `0025_yellow_tony_stark.sql` after creating only the minimal `saved_citations` prerequisite, then read back all `15` `feature_registry` columns and its primary-key/unique-key indexes. Result: `DISPOSABLE_POSTGRES_PROVEN`. No live database, migration ledger, or production schema was changed. Receipt: `docs/reports/feature-registry-disposable-proof-v1.json`.
- [x] **Contract-mirror recheck 2026-09-01:** `npm run audit:drizzle` completed read-only with `8` tables checked, `3` statically aligned, `3` live aligned, and `0` live-unavailable. This refreshes evidence only; `feature_registry` remains absent from the live owner audit and no migration is authorized.
- [x] **Baseline admission gate 2026-09-01:** added and ran `scripts/atlas/feature-registry-baseline-gate.mjs`. It combines the disposable SQL proof, owner decision, live owner audit, and contract-mirror evidence into `BASELINE_PROVEN_LIVE_APPLY_BLOCKED`. The gate is evidence admission only and explicitly forbids `drizzle-kit migrate`, ledger repair, and live feature-registry apply.

## MMR1.1 - Applied this session (record only)

- [x] `drizzle/manual/workflow_orchestration_tables.sql` — applied 2026-08-05. Creates `workflow_runs`, `workflow_tasks`, `workflow_outbox`, `workflow_approvals`. Pure `CREATE TABLE IF NOT EXISTS`, no drops. Fixed the `npm run dev:gpu` outbox-publisher error loop.
- [x] `drizzle/manual/0051_atlas_topology_eval_times.sql` — applied 2026-08-05. Creates `atlas_topology_eval_times`. Pure `CREATE TABLE IF NOT EXISTS`, no drops. Fixed the `atlas:phase16:som:apply` telemetry-write error.
- [x] Validation commands (already run, both PASS):
  - `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\dt" | grep -iE "workflow_"` → 4/4 tables present
  - `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\dt" | grep atlas_topology_eval_times` → present
  - `cd sveltekit-frontend && npm run atlas:phase16:som:apply` → completed clean, no `does not exist` error

## MMR1.2 - Tier A: safe additive sweep (pure `CREATE TABLE IF NOT EXISTS`, no name collisions found)

For each file: confirm target table(s) still missing, apply via `docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < <file>`, re-verify with `\dt`.

- [x] `drizzle/manual/0051_atlas_identity_ledger.sql` → `atlas_identity_ledger` — **applied
  2026-08-31.** File existed, is purely additive (`CREATE TABLE IF NOT EXISTS` + 4 indexes +
  comments, no DROP/ALTER of any existing table) — read in full before applying. `docker exec -i
  legal-ai-postgres psql ... < 0051_atlas_identity_ledger.sql` → `CREATE TABLE`, `CREATE INDEX` x4,
  `COMMENT` x6, all succeeded. Verified live via `\d atlas_identity_ledger` — table exists with all
  13 columns and 5 indexes exactly as declared. Caveat: `scripts/atlas/verify-store-parity.mjs` (the
  only script referencing this table) mentions it only in a doc comment, not in an actual query —
  creating the table clears the schema prerequisite but does not by itself make store-parity
  verification live; that script needs its own wiring pass to actually read/write this table.
- [ ] `drizzle/manual/0000_create_embeddings_if_missing.sql` → `embeddings` — **file does not
  exist** (checked 2026-08-31, `ls drizzle/manual/` has no match for this name or any name-drifted
  variant). `embeddings` table also does not exist live. This ledger entry cannot be executed as
  written — the source SQL was never committed, already archived elsewhere, or the entry is simply
  stale. Not resolved: whether this capability is covered by another table/migration already.
- [ ] `drizzle/manual/0007_court_opinions.sql` → `court_opinions` — **file does not exist.**
  `court_opinions` table also does not exist live. Same stale-entry situation as above.
- [x] **SUPERSEDED (resolved 2026-09-14, not merely re-checked):** `drizzle/manual/0034_split_atlas_packets_ledgers.sql`
  → `atlas_codebase_packets`, `atlas_feature_packets`. `git grep -l "atlas_feature_packets"` found the
  real creator: `sveltekit-frontend/drizzle/0035_create_atlas_feature_packets.sql` — a proper
  **journaled** (non-manual) Drizzle migration, tag `0035_dusty_baron_zemo`, dated 2026-07-21, present
  in `drizzle/meta/_journal.json`, backed by real Drizzle schema
  `src/lib/server/db/schema/atlas-feature-packets.ts`. This is a completely different migration file
  from the missing manual `0034_*` entry — `atlas_feature_packets` was never created by the file this
  ledger names, it was created through the proper journaled path instead. `atlas_codebase_packets`
  reconfirmed still absent live (`information_schema.tables` query, zero rows, 2026-09-14). Root
  CLAUDE.md's June 28 2026 note calling both tables "missing" is now stale on `atlas_feature_packets`
  specifically (confirmed live and journaled), accurate on `atlas_codebase_packets`. Disposition:
  the manual `0034_*` entry is **fully superseded** by the journaled `0035_*` migration for the
  feature-packets half; the codebase-packets half remains a genuine, still-open gap but is not this
  file's problem to fix (no source SQL exists for it under any name). No further action on this
  specific ledger entry — do not write a replacement `atlas_codebase_packets` migration under this
  task without a fresh design decision on whether that capability is still wanted at all.
- [ ] `drizzle/manual/0048_topology_vector_storage_lookup.sql` → `atlas_topology_evidence`,
  `atlas_topology_scores`, `atlas_vector_lookup`, `atlas_centroid_lookup` — **file does not exist**;
  none of the 4 target tables exist live either. Fully stale or fully superseded by a different
  design — not investigated further this pass.
- [x] **SUPERSEDED (confirmed 2026-09-14, not just noted):** `drizzle/manual/20260420_web_search_index.sql`
  → `web_search_index` — file confirmed absent; `web_search_index` table reconfirmed absent live
  (`information_schema.tables`, zero rows). Confirmed the replacement is real and wired, not
  speculative: `src/lib/server/research/web-research-ingester.ts` declares
  `RESEARCH_COLLECTION = 'chunks_web_search'` (768-dim Qdrant, Cosine/HNSW) and has **16 real
  consumers** across the tree (`grep` for the module path), including two live HTTP routes
  (`src/routes/api/research/search/+server.ts`, `src/routes/api/research/ingest/+server.ts`) and
  an MCP server registration (`src/mcp/server.ts`) — genuinely wired, not dead scaffolding.
  Disposition: this manual migration entry is fully superseded by the Qdrant-based web-research
  design; do not write a `web_search_index` Postgres table under this task.
- [x] **SUPERSEDED (confirmed 2026-09-14, not just "likely"):** `drizzle/manual/20260421_ast_graph_tables.sql`
  → `ast_nodes`, `ast_edges`, `ast_file_features` — file confirmed absent; reconfirmed live that all
  3 exact-name tables are absent (`information_schema.tables`, zero rows each). Confirmed
  `atlas_ast_nodes` is real, live, and populated (`SELECT count(*)` → 11,223 rows), with 5 real
  consumers (`grep`): `src/lib/server/atlas/integration/atlas-ast-evidence-reader-v1.ts` (+ its
  spec), `src/lib/server/atlas/policy/oak-dag-ast-evidence-handler-v1.spec.ts`,
  `src/lib/server/atlas/indexing/revision-owner-proof-v1.spec.ts`, and the schema declaration
  `src/lib/server/db/schema/atlas-ast-nodes.ts`. This is the genuine, wired, current AST-identity
  owner under the `atlas_*` naming generation. Disposition: this manual migration entry is fully
  superseded — do not create `ast_nodes`/`ast_edges`/`ast_file_features` under this task.
- [ ] `drizzle/manual/20260507_retrieval_acceleration.sql` → `retrieval_rank_cache`,
  `llm_summaries`, `tool_call_stats` — **file does not exist**; none of the 3 target tables exist
  live either. Not investigated further.
- [ ] `drizzle/manual/20260607_route_packet_rewards.sql` → `route_packet_rewards`,
  `route_token_map`, `route_packet_source_refs` — **file does not exist**; none of the 3 target
  tables exist live either. Not investigated further.

**Pattern across all 8 remaining Tier A entries (2026-08-31 finding)**: every single one of them
cites a source SQL file that is not present anywhere in `drizzle/manual/` under its stated name or
any obvious name-drifted variant (checked via `ls` + grep, not assumed). This ledger's own
instruction ("For each file: confirm target table(s) still missing, apply via `docker exec ...`")
is unexecutable for 8/9 entries as literally written — there is no file to apply. Checked `docs/archive-manifest.json` and grepped `deeds_labs/archive/` for all 8 filenames — **zero
matches in either.** They were not archived through this repo's own archive-not-delete convention.
Combined with 4/8 of their target-table sets having at least one already-live table under a
different name (`atlas_feature_packets`, real `atlas_ast_nodes` vs. planned `ast_nodes`, and a
superseding live web-research system for the `web_search_index` entry), the most likely explanation
is that this ledger predates a naming/design pivot (the `atlas_*` prefix convention, the
`research/`-based web-search redesign) and was never updated after — not that 8 real migration
files were silently deleted. **This entire Tier A section needs a stale-entry sweep, not further
apply attempts** — re-confirm each entry against current design intent before either writing a
fresh migration or closing the entry as superseded.
- [ ] Validation command per file:
  - `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -tAc "SELECT 1 FROM information_schema.tables WHERE table_name='<table>' AND table_schema='public'"`

## MMR1.3 - Tier B: needs dedup review before applying (possible naming drift vs. existing canonical tables)

Per CLAUDE.md Consolidation Sweep Rule: audit canonical vs. duplicate before patching. Do not apply until each listed table is confirmed as a genuinely new concept, not a parallel/legacy name for something that already exists.

- [ ] `drizzle/manual/20260606_missing_tables.sql` (204 lines, found at repo-root `drizzle/manual/`
  — note there are TWO `drizzle/manual/` directories in this repo, one at root and one under
  `sveltekit-frontend/`; this file lives only in the root one) → creates `error_brain_analysis`,
  `error_brain_diffs`, `error_cluster`, `evidence_items`, `evidence_media_assets`,
  `evidence_transcript_segments`, `evidence_processing_jobs`, `evidence_frames`,
  `ingested_documents`, `web_pages`, `web_embeddings`, `web_crawl_jobs`, `user_analytics`,
  `ai_chat_sessions`.
  - [x] **Live-existence sweep done 2026-09-14:** `error_brain_analysis` and `error_cluster`
    already exist live (created via some other path — not this file, since applying this file
    wholesale was never attempted per the ledger's own record). The other 12 target tables are
    confirmed absent live (`information_schema.tables`, zero rows each, checked individually).
  - [x] **Confirmed `evidence_items`/`evidence_media_assets`/`evidence_frames` are naming-drift
    duplicates, not new concepts (real evidence, not inference):** `grep` of
    `src/routes/api/evidence/upload/+server.ts` (the actual live upload endpoint) shows it calls
    `.insert(evidence)` — the canonical, already-live `evidence` table — not `evidence_items`.
    `evidence_items` and its siblings have zero wiring to the real upload path. Disposition:
    duplicate direction confirmed for `evidence_items` specifically; do not apply it. The finer
    question of whether `evidence_media_assets`/`evidence_transcript_segments`/`evidence_frames`
    represent genuinely new sub-concepts (media/transcript/frame extraction as separate rows from
    the `evidence` row itself, which would make them legitimately additive rather than duplicate)
    was not resolved — needs a read of `evidence`'s actual JSONB columns to see if that data
    already lives there before deciding those three specifically.
  - [x] **Confirmed `ai_chat_sessions` is a naming-drift duplicate of `admin_ai_chat_sessions`:**
    `grep` found 2 real consumers of `admin_ai_chat_sessions` (`src/lib/server/features/ai/admin/ai-chat-service.ts`,
    `src/lib/server/db/schema/admin-chat.ts`) — genuinely wired and live. No evidence anywhere of a
    distinct purpose for `ai_chat_sessions`. Disposition: duplicate confirmed, do not apply.
  - [ ] **BLOCKED_NEEDS_OPERATOR_SIGNOFF:** whether to apply the file for the genuinely-not-yet-
    disproven-duplicate subset (`error_brain_diffs`, `evidence_processing_jobs`,
    `ingested_documents`, `web_pages`, `web_embeddings`, `web_crawl_jobs`, `user_analytics`, plus
    the unresolved `evidence_media_assets`/`evidence_transcript_segments`/`evidence_frames` trio)
    is a real product decision — this file cannot be applied as one atomic statement now that 2
    of its 14 target tables (`evidence_items`, `ai_chat_sessions`) are confirmed duplicates that
    must be excluded. Applying the remainder requires either hand-splitting the file or an
    explicit decision to keep it as one bundle and skip the 2 confirmed-duplicate `CREATE TABLE`
    statements manually. Not something to decide unilaterally.
- [ ] `drizzle/manual/proposed_20260530_task_semantic_packets.sql` (153 lines) → creates `feature_registry`, `workspace_tasks`, `task_semantic_packets`, `task_file_links`, `task_cluster_links`, `agent_pickup_queue`, `agent_run_events`.
  - [ ] Filename is literally prefixed `proposed_` — confirm with repo history / commit log whether this was ever accepted, or is still an open proposal.
  - [ ] Confirm `agent_run_events` is not a duplicate of the canonical `agent_actions` (already live).
  - [ ] Do not apply without an explicit decision recorded here.
  - [ ] **Live alignment checked 2026-08-31:** `public.feature_registry` is absent; the current Drizzle owner defines a UUID `id` plus unique `feature_key`. `public.kanban_tasks` and its lifecycle tables already exist and are live-aligned, so this proposed file must not be used to recreate or replace the Kanban control plane.
  - [ ] **Shape conflict confirmed 2026-08-31:** current `feature-registry.ts` includes `summary`, `chunk_ids`, `tags`, and `retry_queries`; journal migration `0024_nebulous_mongoose.sql` omits those columns. Select one reconciled owner and generate a new journaled migration only after the empty live migration ledgers are reconciled.
  - [ ] **Ledger blocker:** both `drizzle.__drizzle_migrations` and `public.migrations` currently contain zero rows while the Drizzle journal has 41 entries. Resolve migration history before applying this proposal or creating a new feature-registry migration.

## MMR1.4 - Tier C: needs statement-by-statement review (mutates existing live tables)

- [ ] `drizzle/manual/20260402_indexing_ace_schema_merge.sql` (520 lines) — NOT a pure additive file. Contains `DROP TRIGGER IF EXISTS legal_nodes_tsv_trigger ON public.legal_nodes` and `DROP TRIGGER IF EXISTS legal_chunks_tsv_trigger ON public.legal_chunks` — both `legal_nodes` and `legal_chunks` are confirmed live tables today.
  - [ ] Full read-through required: what does this file do to `legal_nodes`/`legal_chunks` beyond the trigger drop (recreate with new definition? add columns? just idempotent no-op if the trigger doesn't currently exist)?
  - [ ] Confirm the 18 `CREATE TABLE IF NOT EXISTS public.*` statements in this file don't collide with anything live (regex-parsed table names during triage were unreliable because they're schema-qualified `public.<name>` — re-extract cleanly with `rg "^CREATE TABLE IF NOT EXISTS public\." drizzle/manual/20260402_indexing_ace_schema_merge.sql`).
  - [ ] Per Drizzle Safety Rule: review generated/manual SQL before journaling or applying — do this against a throwaway DB snapshot or `legal-ai-postgres18-test` sidecar container first, not directly against `legal_ai_db`.
  - [ ] Only apply after explicit sign-off — this file is the one candidate in the set that can affect data already in production tables, not just add new empty ones.

## MMR1.5 - Final sweep verification

- [ ] Re-run the full sweep and confirm the only remaining `MISSING` rows are ones explicitly deferred by MMR1.3/MMR1.4 decisions, not accidental skips:
  ```bash
  cd deeds-web-app
  for f in drizzle/manual/*.sql; do
    tbl=$(grep -oE "CREATE TABLE IF NOT EXISTS [a-zA-Z0-9_.]+" "$f" | head -1 | awk '{print $NF}')
    [ -n "$tbl" ] && docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -tAc \
      "SELECT '$f: ' || CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name=split_part('$tbl','.',-1) AND table_schema='public') THEN 'OK' ELSE 'MISSING' END"
  done
  ```
- [ ] Update this tasks.md with final APPLIED / DEFERRED / REJECTED status per file before archiving the change.

## MMR1.6 - Read-only portfolio inventory recheck (2026-09-14)

- [x] Ran `scripts/atlas/audit-migration-inventory-classification-v1.mjs`.
- [x] Confirmed the inventory covers `473` SQL files, `41` journal entries,
  and `64` sidecar declarations without performing writes.
- [x] Confirmed current classification counts: `41` journaled canonical,
  `34` declared sidecar, `74` accepted historical, `2` deferred, and `322`
  unresolved.
- [x] Preserved `unresolvedCurrentOwners=322` as a real baseline blocker;
  unresolved lineage-domain files remain first in the review order.
- [ ] Resolve lineage/structural/semantic migration ownership row-by-row;
  do not apply a global migration command or infer ownership from row count.

Status: `MIGRATION_INVENTORY_READONLY_COMPLETE_UNRESOLVED_OWNERS_REMAIN`;
writesPerformed=false; schema apply unauthorized.

### Migration inventory recheck — 2026-09-14

- [x] Re-ran the read-only inventory after the current lineage audits.
- [x] Counts remain stable: `473` SQL files, `41` journal entries, `64`
  sidecar entries, and `322` unresolved owners.
- [x] Preserved the review order: lineage (`51`), structural (`15`), semantic
  (`49`), then downstream domains; no migration was applied.
- [ ] Resolve each current owner from live schema and migration evidence before
  permitting any registration or schema operation.

Status: `READONLY_RECHECK_STABLE_UNRESOLVED`; `writesPerformed=false`.
Evidence: `docs/reports/migration-inventory-classification-v1.json`.

Evidence: `docs/reports/migration-inventory-classification-v1.json`.

Next gate: `LINEAGE_MIGRATION_ROW_CLASSIFICATION_REQUIRED`.

## MMR1.7 - Wave 0 blocker implementation plan (2026-09-14)

The current read-only inventory is stable, but it is not an authorization to
register or apply any SQL. The next work is row-level classification in
dependency order, with live catalog evidence and an explicit disposition for
every file:

1. **Lineage first (`51` unresolved files).** Reconcile files referencing
   `atlas_packets`, `atlas_packet_chunk_lineage`, `codebase_chunk_index`,
   `graphify_executions`, `graphify_execution_files`, and `graphify_files`
   against the admitted snapshot/execution owner. A file is not current merely
   because its tables exist live; its revision namespace, writer, and migration
   history must be identified.
2. **Structural (`15`) and semantic (`49`) next.** Compare symbol/AST,
   embedding, and representation surfaces against the same source/packet/chunk
   authority. Keep `semantic_768` and symbol registries blocked when the
   current cohort is not revision-qualified.
3. **Feature (`35`) and ontology (`12`) after lineage.** Classify feature,
   domain, and ontology SQL as canonical, derived, historical, or deferred;
   do not create a second owner for existing live tables.
4. **Projection (`84`) and other domains (`75`) last.** Keep Qdrant,
   Neo4j/cuGraph, Valkey, cache, and generated-artifact SQL derived and
   non-authoritative until the source/revision spine is closed.

Required row disposition fields remain: `path`, location, journal/sidecar
evidence, live readback, owner, schema surfaces, classification, reason, and
blocking status. The gate passes only when `unresolvedCurrentOwners=0`,
`duplicateCurrentOwners=0`, and every current owner has a recorded migration
authority. Until then, `feature_registry` remains unregistered/unapplied and
no global migration command is permitted.

Current receipt: `docs/reports/migration-inventory-classification-v1.json`.
Status: `W0_MIGRATION_CLASSIFICATION_PLANNED_UNRESOLVED_OWNERS=322`;
`writesPerformed=false`; schema apply unauthorized.

Next safe gate: classify the `51` unresolved lineage files against the live
catalog and current source/execution receipts, then rerun the inventory.

### MMR1.7 read-only critical-lineage disposition recheck — 2026-09-14

- [x] Ran `scripts/atlas/audit-critical-lineage-migration-dispositions-v1.mjs`
  from the current inventory and live-readback evidence.
- [x] Enumerated `58` critical lineage files without applying or registering
  any migration.
- [x] Classified the current review queue as `47`
  `MULTIPLE_OWNER_CANDIDATES_REVIEW_REQUIRED` and `11`
  `SINGLE_OWNER_CANDIDATE_REVIEW_REQUIRED`.
- [ ] Resolve the owner of each critical file from authoritative migration,
  live-schema, and source/revision evidence; a candidate count is not an
  approval and no global migration command is allowed.

Status: `CRITICAL_LINEAGE_DISPOSITIONS_ENUMERATED_OWNER_REVIEW_REQUIRED`;
`migrationAuthorized=false`; `writesPerformed=false`.
Evidence: `docs/reports/critical-lineage-migration-dispositions-v1.json`.
Next gate: review the seven priority-1 critical rows first, then rerun both
the disposition and full inventory audits.

Priority-1 review queue (classification only; no apply or registration):

- `0101_encoder_provenance_gate2.sql`
- `0105_latent64_vectors.sql`
- `manual/0045_adaptive_schema_repair.generated.sql`
- `manual/0050_add_summary_quality_score.sql`
- `manual/20260909_atlas_packets_source_revision.sql`
- `manual/20260912_error_embedding_latent_columns.sql`
- `manual/atlas_packet_identity_aliases.sql`

For each row, the review must prove the SQL owner, whether the live target
already exists, whether the journal/sidecar evidence is authoritative, and
whether the change touches current lineage. A row may be classified
`ACCEPTED_HISTORICAL`, `DECLARED_SIDECAR`, `JOURNALED_CANONICAL`,
`DEFERRED`, `SUPERSEDED`, or `DUPLICATE` only after that evidence is attached;
otherwise it remains `UNRESOLVED`. The current disposition report shows all
seven as single-owner candidates requiring review, not as safe-to-apply work.

### MMR1.8 - Priority-1 packet-revision evidence recheck (2026-09-14)

- [x] Read the live packet revision axes through
  `scripts/atlas/audit-atlas-packets-revision-columns-v1.mjs`.
- [x] Confirmed `atlas_packets.source_revision` exists as nullable `text`,
  while all `61,718/61,718` live packet rows have it `NULL`.
- [x] Confirmed `workspace_revision` and `representation_revision` are legacy
  integer fields with zero-valued live observations; they are not substitutes
  for the admitted snapshot/source revision contract.
- [x] Confirmed the canonical-owner revision migration is additive-only,
  unapplied, and promotion-blocked by
  `audit-canonical-owner-revision-migration-safety-v1.mjs`.
- [ ] Resolve the packet writer's admitted source-revision input and prove
  bounded readback before considering any migration or packet backfill.

Status: `PACKET_REVISION_AXIS_PRESENT_SOURCE_REVISION_UNPOPULATED`;
`migrationApplied=false`; `promotionAllowed=false`; `writesPerformed=false`.
Evidence: `docs/reports/packet-write-revision-contract-v1.json`,
`docs/reports/canonical-owner-revision-migration-safety-v1.json`.

### MMR1.9 - Priority-1 lineage disposition recheck — 2026-09-14

- [x] Re-ran `audit-critical-lineage-migration-dispositions-v1.mjs`; the
  priority queue remains seven single-owner candidates requiring review.
- [x] Confirmed all seven remain `UNRESOLVED` because none has authoritative
  journal or sidecar declaration evidence; this is classification debt, not
  permission to apply them.
- [x] Re-ran the canonical-owner revision migration safety audit; the proposed
  change remains additive-only, unapplied, `promotionAllowed=false`, and
  `writesPerformed=false`.
- [ ] Review each SQL file against live schema, current source/revision
  evidence, and migration history before assigning a disposition.

Status: `PRIORITY_1_LINEAGE_MIGRATIONS_UNRESOLVED`; migration authority closed;
no registration or schema mutation performed.

Evidence: `docs/reports/critical-lineage-migration-dispositions-v1.json`,
`docs/reports/canonical-owner-revision-migration-safety-v1.json`.

### MMR1.10 - Legacy task-link consumer schema blocker — 2026-09-14

- [x] Ran the bounded read-only `sync-task-cluster-links.mjs` probe against the
  configured live database; PostgreSQL and Redis were reachable.
- [x] Confirmed `public.workspace_tasks` and `public.task_cluster_links` are absent,
  while `public.task_semantic_packets` is present.
- [x] Confirmed the migration inventory already classifies `workspace_tasks`,
  `task_file_links`, and `task_cluster_links` as proposal-only surfaces pending
  ownership/deduplication review.
- [x] Hardened the consumer to stop before linking when required tables are absent;
  it must not silently substitute `atlas_tasks` or apply the proposal SQL.
- [ ] Decide whether a reconciled task-link surface is needed at all, and if so,
  assign one approved owner and prove its schema against the live Kanban/task model.

Status: `LEGACY_TASK_LINK_SURFACE_ABSENT_PROPOSAL_ONLY`; migration and linking remain
unauthorized; `writesPerformed=false`.
Evidence: bounded dry-run output `SCHEMA_SURFACE_UNAVAILABLE` and
`docs/reports/migration-inventory-classification-v1.json`.
