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
  - [x] Confirm `agent_run_events` is not a duplicate of the canonical `agent_actions` (already live).
        Confirmed, not a duplicate. `agent_actions` (live, `\d agent_actions`) is a flat per-tool-call
        audit log with no FK to any task/workflow entity (session_id, action_type, tool_name,
        target_file/symbol, result_code, duration_ms). The proposed `agent_run_events`
        (`drizzle/manual/proposed_20260530_task_semantic_packets.sql:134-149`) is a task-lifecycle
        event log FK'd to `workspace_task_id`/`pickup_id` referencing `workspace_tasks`/
        `agent_pickup_queue` -- both themselves not live -- with a typed `event_type`
        (task_received/summary_generated/files_attached/patch_proposed/validation_run/completed/
        failed) and a `langfuse_trace_id` column `agent_actions` has no equivalent of. Different
        grain and purpose; `agent_run_events` also can't be applied standalone today since its FKs
        target two other not-yet-live tables from the same proposed bundle.
  - [ ] Do not apply without an explicit decision recorded here.
  - [ ] **Live alignment checked 2026-08-31:** `public.feature_registry` is absent; the current Drizzle owner defines a UUID `id` plus unique `feature_key`. `public.kanban_tasks` and its lifecycle tables already exist and are live-aligned, so this proposed file must not be used to recreate or replace the Kanban control plane.
  - [ ] **Shape conflict confirmed 2026-08-31:** current `feature-registry.ts` includes `summary`, `chunk_ids`, `tags`, and `retry_queries`; journal migration `0024_nebulous_mongoose.sql` omits those columns. Select one reconciled owner and generate a new journaled migration only after the empty live migration ledgers are reconciled.
  - [ ] **Ledger blocker:** both `drizzle.__drizzle_migrations` and `public.migrations` currently contain zero rows while the Drizzle journal has 41 entries. Resolve migration history before applying this proposal or creating a new feature-registry migration.

## MMR1.4 - Tier C: needs statement-by-statement review (mutates existing live tables)

- [ ] `drizzle/manual/20260402_indexing_ace_schema_merge.sql` (520 lines) — NOT a pure additive file. Contains `DROP TRIGGER IF EXISTS legal_nodes_tsv_trigger ON public.legal_nodes` and `DROP TRIGGER IF EXISTS legal_chunks_tsv_trigger ON public.legal_chunks` — both `legal_nodes` and `legal_chunks` are confirmed live tables today.
  - [x] Full read-through required: what does this file do to `legal_nodes`/`legal_chunks` beyond the trigger drop (recreate with new definition? add columns? just idempotent no-op if the trigger doesn't currently exist)?
        Done, read-only, nothing applied. The file adds 2 nullable columns to `legal_nodes`
        (`tsv tsvector`, `tags_json jsonb`) and 3 to `legal_chunks` (`tsv tsvector`, `summary
        text`, `qdrant_point_id text`) via `ADD COLUMN IF NOT EXISTS`, then `CREATE OR REPLACE
        FUNCTION` for 2 tsv-update functions and drop+recreate their triggers. Checked each
        against live schema (`\d public.legal_nodes`, `\d public.legal_chunks`): **partially
        already applied**. `legal_nodes.tsv`/`tags_json` and `legal_chunks.summary`/
        `qdrant_point_id` already exist live -- those 4 `ADD COLUMN`s would be no-ops.
        **`legal_chunks.tsv` does NOT exist live** -- that one `ADD COLUMN` would be a real,
        new mutation. **Neither trigger exists live** (`SELECT tgname FROM pg_trigger WHERE
        tgname IN ('legal_nodes_tsv_trigger','legal_chunks_tsv_trigger')` → 0 rows) -- applying
        this file would newly wire live auto-population-on-write behavior for both tables that
        does not exist today, not just recreate an existing trigger. This is the real live
        behavioral change the file's own last bullet (explicit sign-off required) is guarding
        against -- not the column adds, which are almost entirely already-applied no-ops.
  - [x] Confirm the 18 `CREATE TABLE IF NOT EXISTS public.*` statements in this file don't collide with anything live (regex-parsed table names during triage were unreliable because they're schema-qualified `public.<name>` — re-extract cleanly with `rg "^CREATE TABLE IF NOT EXISTS public\." drizzle/manual/20260402_indexing_ace_schema_merge.sql`).
        Confirmed via the given re-extraction: 18 tables (`jurisdictions`, `library_documents`,
        `library_document_versions`, `legal_nodes`, `legal_chunks`, `legal_definitions`,
        `legal_glossary`, `case_library_links`, `ingestion_jobs`, `evidence_relationships`,
        `citation_collections`, `collection_citations`, `citation_tags`, `document_topics`,
        `embedding_cache`, `yorha_cases`, `yorha_evidence_nodes`, `yorha_evidence_connections`).
        Queried `pg_tables` for all 18 by name: **all 18 already exist live today** -- every
        `CREATE TABLE IF NOT EXISTS` in this file is a no-op. Zero collision risk from the
        table-creation statements; the only real risk is the trigger/column mutation above.
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
- [x] Resolve the packet writer's admitted source-revision input and prove
  bounded readback before considering any migration or packet backfill.
  **Investigated 2026-09-22 — the mechanism already exists, is proven, and is NOT the
  remaining gap; the remaining gap is that nothing live calls it.** Traced the real writer
  chain: `buildSemanticPacketWriteAdmissionV1()`
  (`sveltekit-frontend/src/lib/server/embedding/semantic-packet-write-admission-v1.ts`) takes
  a `WorkspaceSourceBindingV1` (the same `atlas_workspace_source_bindings`-backed admitted
  revision source used elsewhere in this repo) and produces a
  `SemanticPacketWriteAdmissionV1` carrying `sourceRevision: binding.sourceRevision`, which
  `persistAdmittedSemanticPacketEmbedding()` (`semantic-packet-writer.ts`) writes straight
  into `atlas_packets.source_revision` via the canonical writer. Ran both specs against the
  real DB (not a mock — confirmed via the test's own `📡 [DB] Canonical target:
  127.0.0.1:5434/legal_ai_db` log line): `semantic-packet-write-admission-v1.spec.ts` (5/5)
  and `semantic-packet-writer.spec.ts` (10/10, including
  `writes sourceRevision when the caller supplies real revision evidence` and
  `never fabricates sourceRevision -- leaves it null when the caller has no evidence`) — this
  IS the bounded readback proof the task asks for, already written and passing on disposable
  test packet keys. **The actual remaining gap**: `persistAdmittedSemanticPacketEmbedding()`
  has zero live production callers anywhere in the repo. The one route that could plausibly
  call it (`src/routes/api/admin/batch-embeddings/embed/+server.ts`) explicitly and
  deliberately defers persistence with its own comment: "Canonical packet persistence is
  intentionally closed here... admitted lineage required... deferred: admitted lineage
  required." This is why all `61,718/61,718` live packet rows remain NULL — not because the
  admission mechanism is broken or unproven, but because no authoritative producer is wired
  to call it with real data yet. Deciding/building that producer is separate, larger work
  (which route or job becomes the authoritative caller) — not attempted here, and not a
  migration/backfill question at all once framed this way.

  **Full structured re-run 2026-09-22 (read-only, no writes) per the 14-section packet-writer
  source-revision authority gate — receipt:
  `docs/reports/packet-writer-source-revision-authority-v1.json`.**
  - **Writer census**: 5 writers touch `atlas_packets` in TypeScript production code beyond the
    canonical one — `hyperrag-packet-pipeline.ts`, `acp/packet-materializer-pipeline.ts`,
    `topology/canonical-id-hierarchy.ts`, `unknown/promotion-executor.ts` (all `LEGACY_WRITER`,
    none insert a `source_revision` column at all), plus `packet-write-transaction-v1.ts`
    (`TEST_ONLY`, its own docstring says "SCAFFOLDING ONLY... Not called from
    semantic-packet-writer.ts or any other writer"). ~140 historical `scripts/atlas/*.mjs`/`.mts`
    files bulk-classified `MIGRATION_BACKFILL` (3 spot-checked, not exhaustively read — flagged
    as a scope limit, not silently assumed).
  - **`source_revision` traced past `input.sourceRevision`, to its real origin**: Graphify
    execution → `graphify_execution_file_membership_v2.code_source_revision` →
    `scripts/atlas/apply-current-execution-workspace-bindings-v1.mjs` (admission-gated) →
    `atlas_workspace_source_bindings` (24,458 distinct `canonical_source_ref`s live) →
    `WorkspaceSourceBindingV1` (Zod `.superRefine()` enforces `sourceRevision ===
    sha256:${contentDigest}`, a structural content-binding, not a shape-only check) →
    `buildSemanticPacketWriteAdmissionV1()` → `persistAdmittedSemanticPacketEmbedding()` →
    `atlas_packets.source_revision`.
  - **`workspaceRevision` proven independent, not derived**: bound via a *separate* superRefine
    to `sha256:${sortedSourceManifestDigest}` (whole-workspace) vs. `sourceRevision`'s
    single-file `contentDigest` — two different digests over two different inputs, so the writer
    cannot conflate them even accidentally.
  - **`CurrentSourceAuthority` chain IS consumed** by the admitted path; `stableFileId` is
    explicitly NOT consumed anywhere in that chain (not inferred as a dependency that isn't
    there, per the gate's own instruction).
  - **Fail-closed behavior**: 5 of 8 named failure modes are `PROVEN_BY_CONSTRUCTION` (Zod
    schema/regex makes the bad state syntactically unrepresentable — missing field, malformed
    shape, `workspace:0`, Git SHA, absent binding); 2 are `PROVEN_BY_TEST` (workspace-revision
    mismatch, content-digest mismatch — both re-run live, PASS); 1
    (`multipleConflictingSourceBindingsExist`) is real but softer than "fails closed" —
    the producer script uses `ON CONFLICT ... DO NOTHING`, silently skipping a second
    conflicting binding rather than erroring or overwriting. Flagged precisely, not rounded up
    to "fails closed."
  - **Identity boundary** (packet_key / sourceRevision / workspaceRevision / stableFileId /
    treeNodeId / symbolVersionId / CandidateOrdinal / representationRevision) recorded in full in
    the receipt; confirmed no downstream representation/execution id feeds back into packet
    identity anywhere in the code paths read.
  - **Live readback (SELECT-only)**: population count (not sample extrapolation) —
    `61,718/61,718` rows `source_revision IS NULL`, 0 qualified, 0 legacy-shaped garbage — the
    table is uniformly in one state, so a 20-row sample fully characterizes it. Binding-join
    check found the same app-relative-vs-repo-root-relative `source_ref` prefix mismatch this
    session's separate `parent-atlas-nlp-sidecar-feature-compiler` 14.3a work already found — a
    literal `canonical_source_ref = source_ref` join misses most real bindings, not because they
    don't exist. Classification: `61,718 MISSING_BINDING`, 0 in every other bucket.
  - **Result: `PACKET_WRITER_OWNER_CONFLICT`** (not `PROVEN`, not `UNKNOWN`). Distinguishing
    code defect from data gap per the gate's own instruction: the admitted path itself is
    `CODE_PATH_PROVEN` — correct, live-DB-tested, structurally fail-closed. The reason live data
    is unqualified is that 4+ other writers can still create/update `atlas_packets` rows without
    going through it, and nothing currently prevents that — ownership is unresolved, not the
    mechanism.
  - **Tests**: reran the 2 existing specs live (15/15 pass, real DB); no new tests added — the
    existing coverage already matches this gate's "add focused tests if useful" bar for the
    fail-closed cases that need a live-DB test rather than pure schema construction.
  - **Writes**: postgres 0, qdrant 0, valkey 0, neo4j 0, graphifyRuns 0 — matches the receipt.

Status: `PACKET_SOURCE_REVISION_ADMISSION_PROOF_COMPLETE`
(2026-09-22 bookkeeping correction — this gate's own stated acceptance condition was
"resolve the admitted source-revision input and prove bounded readback before
migration/backfill"; that is satisfied — mechanism `PROVEN`, bounded live-DB readback `PROVEN`
15/15. Keeping this checkbox open because production adoption is separately absent conflated
two distinct gates. Production-caller adoption is now tracked as its own open task,
**`PACKET-WRITER-PRODUCTION-OWNER-01`** (below) — it does not reopen or block this one.);
`migrationApplied=false`; `promotionAllowed=false`; `writesPerformed=false`.
Evidence: `docs/reports/packet-write-revision-contract-v1.json`,
`docs/reports/canonical-owner-revision-migration-safety-v1.json`,
`docs/reports/packet-writer-source-revision-authority-v1.json`.

### PACKET-WRITER-PRODUCTION-OWNER-01 (new, opened 2026-09-22, split out of MMR1.8)

- [ ] Determine which runtime route/job/event is the authoritative producer allowed to call
  `persistAdmittedSemanticPacketEmbedding()` (`sveltekit-frontend/src/lib/server/embedding/
  semantic-packet-writer.ts`). Sole concern of this task — do not wire it here.
  Qualification mechanism: `PROVEN` (MMR1.8, above). Production adoption: `UNWIRED` — zero live
  callers repo-wide. One candidate location was read, not wired:
  `src/routes/api/admin/batch-embeddings/embed/+server.ts` — its own code comment already
  defers persistence pending "an authoritative producer," classified `ADMIN_TRIGGER_ONLY`
  (reachable only via manual admin action, not a systematic ingestion/materialization event —
  not itself a strong CANONICAL_OWNER_CANDIDATE without further design). No other candidate
  route/job was read in this pass; a full inventory of embedding-materialization,
  Graphify-projection, source-ingestion, and packet-compiler event paths is future work for
  this task, not done here.

### MMR1.9 - Priority-1 lineage disposition recheck — 2026-09-14

- [x] Re-ran `audit-critical-lineage-migration-dispositions-v1.mjs`; the
  priority queue remains seven single-owner candidates requiring review.
- [x] Confirmed all seven remain `UNRESOLVED` because none has authoritative
  journal or sidecar declaration evidence; this is classification debt, not
  permission to apply them.
- [x] Re-ran the canonical-owner revision migration safety audit; the proposed
  change remains additive-only, unapplied, `promotionAllowed=false`, and
  `writesPerformed=false`.
- [x] Review each SQL file against live schema, current source/revision
  evidence, and migration history before assigning a disposition (2026-09-19,
  read-only; see MMR1.9a). Dispositions below are proposals; none is recorded
  in the report and all seven remain `UNRESOLVED` pending operator sign-off.

Status: `PRIORITY_1_LINEAGE_MIGRATIONS_UNRESOLVED`; migration authority closed;
no registration or schema mutation performed.

#### MMR1.9a - Priority-1 per-file review (2026-09-19, read-only)

None of the seven is in `drizzle/meta/_journal.json`.

| File | Live target | Idempotent | Proposed |
|---|---|---|---|
| `manual/20260909_atlas_packets_source_revision.sql` | column present, 0/61,718 populated | yes | `DECLARED_SIDECAR` |
| `manual/atlas_packet_identity_aliases.sql` | table present | yes | `DECLARED_SIDECAR` |
| `manual/0045_adaptive_schema_repair.generated.sql` | both indexes present | yes | `ACCEPTED_HISTORICAL` |
| `manual/20260912_error_embedding_latent_columns.sql` | columns and HNSW indexes present | yes | `DECLARED_SIDECAR` (header says proposed-only, yet applied live) |
| `0105_latent64_vectors.sql` | present; `latent_64` has 1,703 rows | yes | `ACCEPTED_HISTORICAL` |
| `0101_encoder_provenance_gate2.sql` | present | NO: 5 `CREATE INDEX` lack `IF NOT EXISTS` | `ACCEPTED_HISTORICAL`; never re-apply |
| `manual/0050_add_summary_quality_score.sql` | **absent live**: no `summary_quality_score` column, no 2 indexes | yes | `DEFERRED` or `SUPERSEDED`; needs owner decision, not silent apply |

`0050` was never applied or was later dropped. Consumer check (2026-09-19,
read-only): five `scripts/atlas/` scripts still read or write
`summary_quality_score` (all last committed 2026-06-24): `collect-phase1-metrics`,
`stage2-gpu-rerank-summaries` and `-v2` (a duplicate pair; only referenced from
`GPU-USAGE-AUDIT.md`), `stage1-2-worker-pool` (wired to 9 npm scripts:
`workers:summary:pool:*`, `stage1:2:queue:*`) and `summarize-rank-embed-centroids`
(wired to 6 `atlas:summarize-rank-embed-centroids*` npm scripts, the `--apply`
ones UPDATE the column). Those apply paths would fail against the live schema,
so `SUPERSEDED` is not supported without first retiring or rewiring them;
`DEFERRED` is the evidence-consistent disposition. Not verified: whether those
scripts were run after 2026-06-24 or hit this error in practice. Related unfiled finding: `toolIdentityRecover` accepts
`source_ref`/`feature_id` but never uses them (see
`docs/reports/packet-write-revision-contract-v1.json`).

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

### PACKET-KEY-SINGLE-OWNER-CONVERGENCE-01 — 2026-09-22 (read-only)

- [x] Inventoried every `packet_key` producer (7 producers/schemes classified:
  `CANONICAL_WRITER`, `LEGACY_WRITER`, `COMPATIBILITY_WRITER`,
  `MIGRATION_BACKFILL`, `CANONICAL_OWNER_CANDIDATE` x2, `DEAD_ORPHAN`).
- [x] Live census of `atlas_packets.packet_key` (61,718 rows): dominant
  `packet:<12hex>` scheme 94.6%, `ace:packet:<12hex>` alias-equivalent cohort
  5.3% (100% covered by `atlas_packet_identity_aliases`), a distinct RPC/proto
  sub-domain scheme 0.1%, 1 unclassified legacy row. **Zero live rows** for
  either non-live candidate scheme (`packet-key-builder.ts` hex64,
  `compute-packet-key.ts` `pkt:`-workspace-scoped).
- [x] Confirmed `packet-identity-resolver.ts::resolveCanonicalPacketKey()`
  (built Session 200) already actively rejects both non-live candidate
  schemes as `StructuralScopedAddressExperimentError` — production code has
  already decided those two are not canonical, independent of this gate.
- [x] Determined the live lifecycle contract empirically (no written spec
  states it): `packet_key = f(source_ref)` only — revision-invariant, but
  does NOT survive rename and is not derived from `stableFileId`.
- [x] Added 7 new characterization tests
  (`packet-key-dominant-scheme.spec.ts`) proving determinism, rename
  non-survival, revision-invariance, scheme mutual-distinctness, and
  legacy-prefix hash-equivalence; 9/9 pass with the pre-existing containment
  spec.
- [x] `openspec validate parent-atlas-retrieval-lineage-dag-convergence --strict`
  and `openspec validate manual-migration-reconciliation --strict` both PASS.

Result: `PACKET_KEY_LIFECYCLE_CONTRACT_UNDEFINED` — live data ownership is
empirically single (not `OWNER_CONFLICT`; the one needed compatibility layer,
the alias table, already exists and is fully applied), but no written
contract states whether `packet_key` must survive rename or become
revision-/`stableFileId`-qualified. This is what blocks judging whether
`packet-key-builder.ts`'s hex64 candidate is the right future owner — a
design question, independent of both open operator decisions above
(S01-08K apply token; `PACKET-WRITER-PRODUCTION-OWNER-01` caller choice).
No packet_key rewritten, no aliases inserted, no writers changed.
`writesPerformed=false` across Postgres/Qdrant/Valkey/Neo4j.
Evidence: `docs/reports/packet-key-single-owner-convergence-v1.json`.

#### PACKET-KEY-SINGLE-OWNER-CONVERGENCE-01 addendum — 2026-09-22 (read-only)

- [x] Separated FORMULA_OWNER / WRITER_OWNER / RESOLVER_OWNER per scheme
  (v1 conflated these). Found the dominant live formula
  (`'packet:' + sha256(source_ref).slice(0,12)`) has **no shared canonical
  module** — it's duplicated inline in 2 scripts (one writer, one read-only
  joiner) with zero shared function, a real DRY gap even though outputs
  agree.
- [x] Backward-traced every live cohort to its actual producing script by
  matching statement + formula, not regex alone (already true of v1;
  re-confirmed, and the pasted caution that "62 uncharacterized rows might
  be computePacketKey() rows" was already false in v1 — those 61+1 rows
  were already SQL-confirmed as a distinct RPC/proto scheme + 1 legacy row,
  0 hex64 rows).
- [x] Broader grep surfaced a **3rd dormant writer**: `phase-17-hyperrag-indexing-e2e.mjs::stablePacketKey()`
  — a real `INSERT INTO atlas_packets` under a `packet:<32hex>` shape
  (chunk+content-qualified), not wired to any npm script, 0 live rows
  (SQL-confirmed). Brings total distinct formula implementations found in
  source to 6; only 3 have ever produced live rows (dominant, its
  wrong-prefix bug variant, and the unrelated RPC sub-domain).
- [x] Audited the 12-hex (48-bit) truncation: `atlas_packets_packet_key_key`
  is a live UNIQUE constraint (0 duplicates is guaranteed by it, not
  independent collision-freedom evidence); the writer uses
  `ON CONFLICT (packet_key) DO NOTHING`, so a genuine truncation collision
  would silently drop the second file's packet row with no error — an
  unmeasured, real failure mode, not investigated further (would need a
  full source_ref-vs-atlas_packets cross-census, out of scope). Birthday-bound
  collision probability ~6e-6 at current scale (58,362 rows), ~7e-5 at a
  projected 200k rows.
- [x] Result (ownership-state axis, distinct from v1's lifecycle-contract
  axis): `ONE_CANONICAL_OWNER_WITH_LEGACY_COMPATIBILITY` — not
  `MULTIPLE_ACTIVE_PACKET_KEY_OWNERS` (only 1 scheme is live-active outside
  the fully-aliased legacy cohort and the unrelated RPC sub-domain), not
  `CANONICAL_FUTURE_OWNER_NOT_ADOPTED` (no dormant scheme is actually
  designated as a future replacement — packet-key-builder.ts's own header
  declines that status), not `PACKET_KEY_OWNER_UNDEFINED` (an owner IS
  identifiable for live data). This does not contradict v1's
  `PACKET_KEY_LIFECYCLE_CONTRACT_UNDEFINED` — that's a separate axis
  (what the key is supposed to mean over time), still true.

Target contract for `PACKET-WRITER-PRODUCTION-OWNER-01` (not selected, per
operator instruction — kept open in parallel): `event → WorkspaceSourceBindingV1
→ SemanticPacketWriteAdmissionV1 → ONE canonical PacketIdentityV1 key builder
(does not exist yet as an exported module) → persistAdmittedSemanticPacketEmbedding()`.
Extracting the dominant formula into a shared, tested module is a prerequisite
mechanical step before that production event can be safely authorized — not
done this pass (would be a code change, out of read-only scope).

`writesPerformed=false` across Postgres/Qdrant/Valkey/Neo4j; no code changed.
Evidence: `docs/reports/packet-key-single-owner-convergence-v2-addendum.json`.

#### PACKET-KEY-LEGACY-GUARD-RECHECK — 2026-10-06

The 2026-09-22 addendum above is historical for formula sharing and writer
conflict handling. The current source has since added the shared
`scripts/atlas/lib/canonical-source-ref.mjs::legacyPacketKeyFromSourceRef()`
compatibility builder, exact source/key collision assertions, and corpus-level
duplicate-key checks. `upsert-whole-codebase-atlas-packets.mjs` uses that
builder and validates an existing key against its source ref; its apply path
is quarantined. `register-orphaned-chunks.mjs` uses the shared builder and
rejects duplicate candidate keys; its packet insert paths no longer ignore
packet-key conflicts. `backfill-summary-layers-from-chunks.mjs` reuses the
builder for read/join identity. The focused tests statically guard these
selected script owners against reintroducing conflict-ignore behavior.

This closes the narrow legacy-helper/candidate-collision guard gap only. It
does not establish a sole production canonical key owner: the shared builder
names the 12-hex compatibility formula, while PacketKeyV2 and the future
production writer remain distinct decisions/gates. Nor does it prove
collision-free historical admission: the live UNIQUE constraint prevents
duplicate keys from coexisting, and no independent complete attempted-source
denominator has been reconciled against `atlas_packets` to detect a silently
skipped historical source. Treat the 2026-10-03 report as `WIRED` for the
selected legacy writers and `NOT_PROVEN` for complete writer census, current
live collision absence, and historical silent-drop absence. No writer,
database, cache, or alias operation was run in this recheck.

Evidence: `docs/reports/packet-key-legacy-owner-v1-20261003.md`,
`scripts/atlas/lib/canonical-source-ref.mjs`, and
`scripts/atlas/lib/canonical-source-ref.test.mjs`. Next gate: build a fresh,
read-only complete source-ref denominator from an admitted source snapshot;
join by exact source ref and independently verify the corresponding packet
key/source ref pair, classifying missing, duplicate, collision, alias, and
out-of-scope rows. Do not use the UNIQUE constraint or packet count as a
collision proof, and do not apply any packet-key migration or writer.

**Source-denominator feasibility check (2026-10-06; explicit PostgreSQL
`REPEATABLE READ READ ONLY`, `ROLLBACK`):** the newest recorded
`atlas_workspace_source_bindings` cohort for `repo_id=deeds-web-app` is
`sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`,
24,456 distinct refs, last observed `2026-09-15T01:23:43.296Z`. Against
`atlas_packets`, 16,543 refs have an exact source-ref row and 7,913 do not;
16,151 have both exact packet source revision and exact packet
`workspace_revision_key`. `file_path` matched the binding's canonical source
ref for 16,395 rows, but remains a display hint, not an identity join. This
cohort is too old to claim a current-worktree denominator or to close the
historical silent-drop audit.

Schema check for the requested metadata: the source-binding table owns
`canonical_source_ref`, `source_revision`, `workspace_revision`,
`content_digest`, and `observed_at`; it has no `created_at` or `file_path`.
`atlas_packets.file_path` and `workspaces.created_at` exist, but neither is
source-revision authority, and the binding row has no `workspace_id` join to
the workspace timestamp. Do not add these columns to the canonical binding
table. A diagnostic receipt may carry `bindingObservedAt` and optional
`packetFilePath`/`workspaceCreatedAt` as explicitly non-authoritative context;
preserve source/workspace revisions and content digest as separate fields.
`source_revision` also did not equal `content_digest` for any binding row in
this sample, so do not substitute one for the other. No schema or data writes
were performed.

**Repeatable-read packet-key census recheck (2026-10-06; `READ ONLY`,
explicit `ROLLBACK`):** grouped bindings by `workspace_revision` before
selecting the cohort. The newest recorded group remains
`sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`
(24,456 distinct refs; `observed_at` is `2026-09-15T01:23:43.296Z` for both
the minimum and maximum). This is a coherent recorded cohort, but its age and
revision do not prove it represents the current dirty worktree. Against the
24,456-row cohort and 61,718 current packet rows, exact
`canonical_source_ref + source_revision + workspace_revision_key` produced
16,150 unique matches, 1 binding with multiple qualified packet rows, 13
same-ref/source-revision mismatches, and 8,292 with no exact canonical packet
match; no same-source-revision/different-workspace match was observed. The
legacy expected key `packet:` + first 12 SHA-256 hex of the exact
`canonical_source_ref` matched a same-source packet row for 16,445 bindings;
zero expected keys were occupied by a packet whose `source_ref` and
`canonical_source_ref` both differed. The 295-row difference between key
matches and uniquely revision-qualified matches is not yet classified and is
not a lineage pass. In this readback, all 24,456 binding `source_revision`
values exactly equaled their `content_digest` values; this supersedes the
preceding sample's contrary equality statement for this same recorded cohort.
The current UNIQUE constraint still cannot detect a source silently omitted
by a prior conflict-ignore writer, and this census does not close the current-
worktree denominator or historical silent-drop gate. No report file or store
was written.

**Fresh PacketKeyV2 legacy-population diagnostic (2026-10-07, read-only):**
the existing census completed against 61,718 `atlas_packets` rows in a
`REPEATABLE READ READ ONLY` transaction with explicit rollback, writing only
`.tmp/goal-cache-alignment/packet-key-legacy-census-current.json`. It derived
17,399 distinct V2 keys with zero collisions among rows carrying a unique
repository membership from any recorded execution; 17,301 rows use the
12-hex legacy storage form, 98 use the ACE prefix, and 44,256 rows have no
membership in any execution. The report has no workspace/source-population
revision binding and the membership is not restricted to an admitted current
snapshot. Therefore `NO_PACKET_KEY_CANONICAL_COLLISION` is scoped to this
derivable legacy subset only: it does not prove current-worktree collision
freedom, source-denominator completeness, or absence of historical silent
drops. No packet-key writer, alias mutation, cache, or canonical store write
occurred; keep the collision/admission gate open.

#### PACKET-KEY-LIFECYCLE-CONTRACT-01 — 2026-09-23 (read-only)

- [x] Traced 7 runtime packet_key **consumers** (bounded/representative, not
  exhaustive) across every named category: `atlas_packet_registry_projections`
  schema (FK to `packet_key`, confirming it — not `packet_id` — is the
  intended join key), `qdrant-packet-projection.ts` (explicit written
  contract: key must be identical across all representation/collection
  lanes), `identity-resolution.ts` (precedence `symbol_version_id ->
  packet_key -> content_hash`), `unified-orchestrator.ts`'s
  `CandidateIdentityV1` envelope (packetKey/sourceRef/sourceRevision/
  workspaceRevision tracked as 4 independent co-equal fields), both traced
  writers (`semantic-packet-writer.ts` upserts on `packetId` via real
  UPDATE; `upsert-whole-codebase-atlas-packets.mjs` upserts on `packet_key`
  via `ON CONFLICT DO NOTHING`, never mutating).
- [x] Classified 8 continuity expectations (A-H): content-revision,
  workspace-revision, representation-revision, re-embedding, process-restart
  all `MUST_REMAIN_STABLE`; graph-reprojection, cluster-reassignment
  `DOES_NOT_CARE`; rename the one genuine `UNKNOWN` (absence of consumer
  evidence, not conflicting evidence).
- [x] Evaluated 7 candidate lifecycle models against that evidence:
  `SOURCE_COORDINATE_PACKET` is the only one supported by every consumer
  traced (matches the formula, the writer's own "preserve on existing
  source_ref" comment, the co-equal revision-field pattern everywhere, and
  a test fixture that explicitly holds `packetKey` fixed while varying
  `sourceRevision`).
- [x] **Lifecycle result: `PACKET_KEY_LIFECYCLE_CONTRACT_PROVEN`** — evidence
  converges cleanly, no consumer conflict found.
- [x] **Encoding status (separate axis): `CURRENT_ENCODING_COLLISION_POLICY_DEFECT`**
  — the model is correctly implemented, but `ON CONFLICT (packet_key) DO
  NOTHING` means a genuine 12-hex truncation collision between two distinct
  `source_ref`s would silently drop the second file's packet row with no
  error, receipt, or rejection — matching none of the acceptable collision
  policies. Required behavior per this repo's own existing fail-closed
  identity discipline (stable-file-identity-mint-v1.ts's "ambiguity throws
  rather than picks arbitrarily"): `COLLISION_RECEIPT_AND_REJECT`, with
  full-width digest as a complementary risk-reduction, not a substitute.
- [x] **Shared-builder readiness: `SHARED_PACKET_IDENTITY_BUILDER_BLOCKED`**
  (lifecycle proven, encoding does not satisfy it) — NOT extracted this
  pass. Recorded the future module's required contract (source_ref-only
  input, collision-receipt-and-reject behavior, revision/rename explicitly
  excluded from the key) for whenever it is built.
- [x] **Production-owner readiness: `PRODUCTION_OWNER_BLOCKED_PACKET_IDENTITY`**
  — not evaluated for owner selection (out of scope), blocked regardless
  since the collision-safe key builder it would consume doesn't exist yet.
- [x] Re-ran the existing `packet-key-dominant-scheme.spec.ts` +
  `compute-packet-key-containment.spec.ts` (9/9) as regression confirmation
  — no new tests added (none needed to prove this pass's findings).
- [x] `openspec validate manual-migration-reconciliation --strict` PASS.

No packet_key rewritten, no builder extracted, no writers changed, no
S01-08K applied, `PACKET-WRITER-PRODUCTION-OWNER-01` not selected.
`writesPerformed=false` across Postgres/Qdrant/Valkey/Neo4j.
Evidence: `docs/reports/packet-key-lifecycle-contract-v1.json`.

## PostgreSQL startup and missing-relation triage (2026-10-02)

- [x] Classified the supplied PostgreSQL 18 log sequence as startup recovery,
  not evidence of WAL corruption: the prior server shutdown was interrupted;
  fsync took about 20 seconds, redo completed, and PostgreSQL accepted
  connections 26 seconds after startup. The live `legal-ai-postgres` health is
  `healthy`; `pg_isready` succeeds. The repeated `FATAL: ... starting up`
  entries are connection attempts during recovery, not the root cause.
- [x] Read-only catalog probe confirmed `public.phase72_error` and
  `public.concept_evidence` are absent while `public.atlas_ontology_concepts`
  and `public.atlas_ontology_linked_tuples` exist. `phase72_error` has a manual
  SQL file but is absent from the active `drizzle/schema.ts`, Drizzle journal,
  and sidecar migration registry; the separate introspected snapshot is not the
  active schema authority. The manual SQL also does not match all live route
  query shapes (for example, callers use `code`, `occurrence_count`, and
  `last_seen`, while the SQL declares `error_code` and omits the latter two).
  No authoritative `concept_evidence` migration was found. Existing ontology
  tables are not assumed semantically interchangeable.
- [x] Read-only PostgreSQL 18 `atlas_packets` index inventory found duplicate
  GIN definitions: two `metadata jsonb_ops` indexes at 160 MB each and two
  `payload jsonb_path_ops` indexes at 21 MB and 17 MB. Current `idx_scan`
  counters were zero, but the database had just restarted and the stats reset
  timestamp was unavailable; this is not proof that the indexes are unused.
  No index was dropped or altered.
- [ ] **PG-BOOT-01** Correlate the unclean shutdown with Docker Desktop/host
  lifecycle and identify which clients produced startup-time connection
  attempts. Keep the existing healthcheck as the readiness gate; add or verify
  bounded retry/backoff at each client rather than restarting PostgreSQL or
  modifying its data directory. Do not run `pg_resetwal` or delete/replace the
  named volume.
- [ ] **PG-SCHEMA-02** Reconcile `phase72_error.sql` with the migration owner
  and every route query; choose one typed Drizzle schema that matches the
  actual API contract, then add a scoped, tracked PostgreSQL 18 migration and
  validate it against a disposable database with schema/readback checks before
  requesting any live apply. The relation is currently absent, so a reviewed
  initial migration would create it; do not write an `ALTER TABLE` against a
  nonexistent relation or register the current SQL unchanged. Do not run
  global `drizzle-kit migrate` while the baseline is unresolved.
- [ ] **PG-SCHEMA-03** Trace the `concept_evidence` startup-intelligence probe
  to its schema owner. Either query the exact existing canonical relation if
  its semantics match, or report the metric as unavailable; do not create a
  parallel concept-evidence table or silently report a missing relation as
  zero. Add a regression test for the relation-absent path.
- [ ] **PG-LOG-04** After schema/retry work, collect a fresh bounded log window
  and confirm the startup race and missing-relation errors no longer recur;
  preserve unrelated historical log entries as historical observations.
- [ ] **PG-INDEX-05** Reconcile duplicate JSONB GIN declarations in active
  Drizzle schema and live PostgreSQL against representative query predicates.
  Compare `jsonb_ops` and `jsonb_path_ops` operator coverage, capture a stable
  `pg_stat_user_indexes` observation window and `EXPLAIN (ANALYZE, BUFFERS,
  SETTINGS)` for real callers, and consider B-tree expression indexes only for
  identified scalar-key equality/range queries. Produce a proposed cleanup
  migration and rollback plan; do not drop indexes based on one post-restart
  zero-scan sample.

Evidence: live `legal-ai-postgres` logs and health, read-only
`to_regclass` probe, `sveltekit-frontend/drizzle/manual/phase72_error.sql`,
`scripts/atlas/atlas-startup-intelligence.mjs`.

### Follow-up audit run (2026-10-02)

- [x] Added PostgreSQL and Drizzle audit TOCs at
  `docs/architecture/POSTGRESQL-TOC.md` and
  `docs/architecture/DRIZZLE-TOC.md`; linked them from
  `docs/architecture/ARCH-TOC.md`. These document existing audit owners and
  do not add a schema authority or perform DDL.
- [x] Ran `npm run audit:drizzle`. It wrote
  `docs/reports/postgres-contract-mirrors-report.{json,md}` and checked 11
  tables: 6 static aligned, 3 live aligned, 0 live unavailable, 13 blockers.
  Exit status was 1; this is a drift report, not a passing schema gate.
- [x] Ran `npm run atlas:docs:postgres-index-capability` against PostgreSQL
  18.4. Read-only report `docs/reports/postgres-index-capability-v1.json`
  records `writesPerformed=false`, schema capability proven, and two missing
  index capabilities on `atlas_symbol_versions`:
  `source_revision` and `qualified_name`. Query plans were captured; a bitmap
  plan was generatable for 4/4 fixtures, while the planner selected one in
  1/4. pgvector HNSW capability is present, but exact-vs-HNSW parity remains
  `NOT_RUN`; PG18 AIO is capable but `NOT_OBSERVED`.
- [ ] Do not add indexes or apply migrations from these audit results alone.
  Resolve query owners and predicates, then validate any proposed migration
  separately against a disposable PostgreSQL instance and perform readback.

### Symbol resolver index follow-up (2026-10-02)

- [x] Ran the dedicated read-only planner
  `scripts/atlas/audit-postgres-symbol-resolver-index-plan-v1.mjs`. It observed
  an estimated 479 rows and `Seq Scan` for its three sample predicates
  (`source_revision`, `qualified_name`, and both together); the report remains
  `DRAFT_NOT_APPLIED` and explicitly requires resolver call-site/workload
  evidence before choosing an index shape.
- [x] Found an existing, unregistered draft in
  `sveltekit-frontend/drizzle/manual/20260920b_atlas_ontology_schema_alters.sql`
  proposing standalone B-trees on both fields. The active Drizzle table owner
  is `sveltekit-frontend/src/lib/server/db/schema/atlas-structural-intelligence.ts`;
  it already declares composite indexes for `(stable_symbol_id,
  source_revision)` and `(source_ref, source_revision)`. The draft SQL is not
  present in `sidecar-migrations.json` and also contains unrelated schema
  changes, so do not register or apply that file wholesale.
- [x] A bounded application-source search found no production query applying
  `WHERE qualified_name = ...` directly to `atlas_symbol_versions`; the
  `atlas_callable_search` projection has its own qualified-name B-tree. The
  sample EXPLAIN plans and missing-capability verdict therefore do not alone
  prove a production bottleneck. Keep the standalone indexes unapproved until
  the resolver owner confirms a hot query and production-shaped selectivity.
- [ ] If a real independent lookup is confirmed, add only its matching index
  declaration to the active Drizzle table and a narrowly scoped tracked
  migration; rehearse and read back before any live apply.

Evidence: `docs/reports/postgres-symbol-resolver-index-plan-v1.json`;
`docs/reports/postgres-index-capability-v1.json`;
`scripts/atlas/audit-postgres-symbol-resolver-index-plan-v1.mjs`;
`sveltekit-frontend/drizzle/manual/20260920b_atlas_ontology_schema_alters.sql`.

### Contract blocker owner triage (2026-10-02)

- [x] Corrected `scripts/atlas/audit-postgres-contract-mirrors.mjs`: its manual
  SQL index matcher previously accepted a relation-name prefix, so indexes on
  `feature_registry_queries` were attributed to `feature_registry`. The matcher
  now requires a relation boundary. The same audit no longer reports those
  unrelated indexes, and a schema-only row with no matching manual SQL is now
  classified `RECONCILE_MIGRATION_LINEAGE`, not `APPLY_EXISTING_SQL`.
- [x] Re-ran `npm run audit:drizzle`. The report still has 13 blockers; this is
  not a green schema gate. `feature_registry` remains absent live and has no
  matching manual SQL source in this audit's scan. The separate baseline gate
  reports `BASELINE_PROVEN_LIVE_APPLY_BLOCKED`; the migration-owner audit lists
  `feature_registry` as missing manifest registration. Do not apply a migration
  based on the contract report's old repair suggestion.
- [x] Ran the workspace-event schema audit: all three relations are absent and
  status is `NOT_APPLIED_PLANNED_SIDECAR`; it reports `writesPerformed=false`.
  The SQL is registered as a sidecar, but no apply was performed.
- [x] Ran the task-semantic-packet writer matrix against the live schema: 5
  compatible writers, 3 blocked writers, 1 intent-only writer. Missing fields
  include graph metadata and obsolete `task_title`/`task_type`/`task_status`;
  do not add these columns wholesale without retiring or correcting the legacy
  writers first.
- [x] Kept `atlas_packets`, `parent_atlas_documents`, and
  `route_runtime_packets` in `NEEDS_REVIEW`: observed deltas span many columns
  and indexes, so neither mass Drizzle mirroring nor broad `ALTER` is justified
  by this report alone. `kanban_tasks` and `nes_chrom_packets` have live
  indexes not fully represented by their Drizzle/manual source comparison;
  any code-only mirror update still needs exact definitions and ownership.

Evidence: `docs/reports/postgres-contract-mirrors-report.{json,md}`;
`docs/reports/feature-registry-baseline-admission-v1.json`;
`docs/reports/atlas-migration-owner-audit-v1.json`;
`docs/reports/workspace-event-head-schema-audit-v1.json`;
`docs/reports/task-semantic-packet-writer-column-matrix-v1.json`.

## Drizzle contract audit run (2026-10-13; `npm run audit:drizzle`, read-only against the DB)

- Reports regenerated: `docs/reports/postgres-contract-mirrors-report.{json,md}` (generatedAt 2026-10-14T01:15Z). Pre-run copies kept at `.tmp/pre-audit-postgres-contract-mirrors-report.{json,md}`.
- Summary: 11 tables checked; static aligned 6; live aligned 3; live missing 4; blockers 13.
- Live missing (declared in Drizzle, absent from PostgreSQL): `feature_registry`, `atlas_workspace_events`, `atlas_workspace_event_participants`, `atlas_workspace_heads`. The workspace-event tables correspond to the `planned_sidecar` migration `20260916_workspace_event_head_v1.sql`, which is not applied.
- Live column drift (`onlyInA` = declared in schema, missing live; `onlyInB` = live, not declared):
  - `atlas_packets`: 1 declared-not-live (`summary_model`); 58 live-not-declared (for example `chunk_id`, `content_embedding_384`, `embedding_status`, `som_cluster`, `pagerank_score`, `ontology`, `trigrams`). 43 declared indexes missing live; 50 live indexes not declared.
  - `task_semantic_packets`: 16 declared-not-live; 30 declared indexes missing live.
  - `parent_atlas_documents`: 13 declared-not-live (for example `summary`, `tree_node_id`, `alias_id`); 2 live-not-declared (`feature_label`, `packet_key`).
  - `route_runtime_packets`: 12 declared-not-live (for example `reward`, `route_state`, `repair_method`, `git_sha`).
  - `kanban_tasks`: static INDEX_MISMATCH; live aligned.
  - `nes_chrom_packets`: static INDEX_MISMATCH; live aligned.
- Safety: do not run `drizzle-kit push` on `atlas_packets`. The schema would drop 58 live columns. The Drizzle safety rule in CLAUDE.md applies.
- Duplicate-index drops: all 10 drop-candidate index names are declared in `atlas-packets.ts` or `drizzle/schema.ts`. Applying the drops requires matching schema edits for all 10.
- Next: resolve each blocker row by row (this change's open tasks), starting with `atlas_packets` (schema ownership of the 58 live columns).

## feature_registry and workspace-event tables — migration drafts (2026-10-13; NOT applied)

- `feature_registry`: draft `sveltekit-frontend/drizzle/manual/20261013_feature_registry_DRAFT.sql`. Matches `feature-registry.ts` (15 columns, unique `feature_key`). Rehearsal: 15 columns in-transaction; table absent afterward. Registry: `planned_sidecar`.
- Workspace-event tables (`atlas_workspace_events`, `atlas_workspace_event_participants`, `atlas_workspace_heads`): not duplicated. Owner is `drizzle/manual/20260916_workspace_event_head_v1.sql`, whose header requires migration-owner review and a disposable Postgres readback canary before apply. The canary has not been run.
- Not covered by the audit or the draft: `feature_tasks` and `agent_progress_log` (same schema file; not reported as missing).
- Apply requires explicit approval for `feature_registry`, and the canary plus review for the workspace tables.

## feature_label continuation — parent_atlas_documents (2026-10-13; schema-only change, no DB change)

- Live facts (read-only): `feature_label` (text, nullable) populated on 61,660 of 61,718 rows; `packet_key` (text, nullable) populated on all 61,718.
- Decision: the live table is the source of truth for these two columns. Declared them in `sveltekit-frontend/src/lib/server/db/schema/parent-atlas-documents.ts` (`featureLabel`, `packetKey`). No DDL.
- Re-run `npm run audit:drizzle` from the repo root (an earlier attempt from the frontend directory did not run): `parent_atlas_documents` live-not-declared is now empty. Declared-not-live stays at 13 (alias_id, file_ext, index_lane, ingest_source, payload, profile_card_visible, source_kind, source_ref_id, summary, summary_lod0, summary_lod1, summary_lod2, tree_node_id). Audit blockers still 13 overall.
- Runtime risk found while checking readers (not changed):
  - `src/lib/server/features/ai/ace/telemetry-compressor.ts` selects `source_ref_id` from `parent_atlas_documents`. Live query confirms `column "source_ref_id" does not exist`.
  - `src/lib/server/features/ai/ace/context-assembler.ts` (around line 1849) selects `som_cluster`, which is not in the live table. Whether that call is caught was not checked.
- Open: resolve the 13 declared-not-live columns (add to live, or remove from schema), starting with `source_ref_id` and `som_cluster`, which are read by live code.

## parent_atlas_documents — STOPPED: it is a VIEW, not a table (2026-10-13)

- Rehearsal of `sveltekit-frontend/drizzle/manual/20261013_parent_atlas_documents_align_declared_columns.sql` failed: `ALTER action ADD COLUMN cannot be performed on relation "parent_atlas_documents" ... not supported for views`. Rolled back; nothing changed (view still 23 columns).
- `pg_class.relkind = 'v'`. The view selects FROM `atlas_packets ap` WHERE `source_ref IS NOT NULL`. It maps `packet_key AS id`, `kmeans_cluster AS cluster_id`, `som_cluster AS centroid_id`, and `directory_path AS rel_path`.
- Of the 13 declared-not-live columns, 6 exist on the underlying `atlas_packets`: `summary`, `payload`, `source_kind`, `tree_node_id`, `som_cluster`, `directory_path`. The other 7 exist nowhere in the database: `alias_id`, `file_ext`, `index_lane`, `ingest_source`, `profile_card_visible`, `summary_lod0`, `summary_lod1`, `summary_lod2`, `source_ref_id` (9 names listed; `source_ref_id` is read by live code and fails).
- Adding the 7 missing columns through the view would need constant or NULL values, which would fabricate data. Not done.
- Options (decision needed):
  - A. Redefine the view to expose the 6 real columns from `atlas_packets` (CREATE OR REPLACE VIEW, additive at the end). Keep the 7 missing names out of the view and out of the schema.
  - B. Align the Drizzle declaration to the view: drop the 13 declared names that aren't exposed, and change readers (`source_ref_id` in telemetry-compressor.ts; `som_cluster` in context-assembler.ts should read `centroid_id` or query `atlas_packets`).
  - C. Keep the schema and change nothing else, accepting the runtime errors.
- Audit defect: `audit-postgres-contract-mirrors.mjs` treats the view as a table. It should check `relkind`, and report views separately.

## Review check — exporter proof and live readers (2026-10-13; read-only; no DB or code writes)

- P0 exporter proof: `python/test_export_frozen_semantic768_snapshot_contract.py` run with the repo's existing `.venv` (system Python lacks numpy; no install). 4 of 4 tests pass: tag escape blocked; existing artifacts never overwritten; existing tag blocks before `psycopg2.connect` (asserted not called); manifest declares `lineageQualification: NOT_PROVEN`. Status: PROVEN for these four behaviors. The review's "tag collision" guard is the existing-tag block. Snapshot files were not written by the test run.
- `telemetry-compressor.ts` (`source_ref_id`): query at ~line 64 has no `.catch`, so the live error (column does not exist) propagates. Status: BLOCKED. Decision needed: remove the dependency, or make the failure explicit.
- `context-assembler.ts` (`som_cluster`, ~line 1849): query is wrapped in `.catch(() => empty)`, so the missing column is hidden and the code falls back to `atlas_feature_map`. Status: PROVEN silent fallback. Decision needed: read `centroid_id` from the view, or read `atlas_packets.som_cluster`, and remove the silent catch.
- `atlas_packets` drift (58 live-only columns; 43 declared-missing indexes): not changed. Preserve live-only columns per the review; the field-level manifest is still to be generated.
- Duplicate-index drops and `DROP`/`push`: not run.

## atlas_packets field-level reconciliation manifest (2026-10-13; read-only; no DB or schema changes)

- Manifest: `.tmp/atlas-packets-reconciliation-manifest.json` (144 live columns; one row per column with liveType, nullable, populatedRows of 61,718, declaredInDrizzle, referencingFiles, migrationDecision). Checksum: sha256:177f7fddf41b0df983761308d8839df46cff42e891f356b214004fae22a284ef.
- Declared status comes from the audit diff (`postgres-contract-mirrors-report.json`). My own schema-file parser over-matched and under-matched, so it was not used.
- Tally: 86 declared-aligned (verify type); 54 preserve-investigate (populated live-only); 4 investigate (empty live-only, do not drop). Declared-not-live: `summary_model` (1).
- Still open: readers and writers per column (referencingFiles counts files only, not reader or writer role), type comparison against Drizzle, and the decision on `summary_model`.
- Not done: no drops, no DDL, no `drizzle-kit push`.

## Analysis schema inventory (2026-10-13; read-only)

- File: `docs/reports/analysis-schema-inventory-2026-10-13.json` (copy of `.tmp/analysis-schema-inventory.json`).
- Contents: 231 populated public tables (exact `count(*)`), Drizzle-declared flag (180 of 231), related-file count (unique files under `sveltekit-frontend/src`, `scripts`, `python`; whole-word text match), lane tags, and per-table caveats.
- Caveat: related-file counts are lexical. Six single-word names (for example `evidence`, `reports`, `cases`, `users`) match ordinary text, so their counts are inflated. Lane tags come from name patterns and are not proof of use.
- Lanes (name-based, unverified): dailyGraphify 37, kmeansClustering 20, topKRetrieval 26, pagination 50, pagerankCandidates 20.
- Not done: custom NetworkX PageRank over these tables, and any verification of lane membership against code.

## GraphRAG multi-hop inventory and identity note (2026-10-13; read-only)

- `docs/reports/graphrag-multihop-analysis-2026-10-13.json`: 32 populated edge and graph tables, exact counts, columns, and endpoint-pair flags (8 tables). Descriptive only.
- `title_id`: unique per packet (61,660 distinct non-null values) and title-derived. Not a semantic key.
- CLAUDE.md: section added for dense-search and GraphRAG identity rules.
- Not run: multi-hop traversal timing, NetworkX PageRank over these tables, endpoint identity checks per table.

## Edge endpoint identity check (2026-10-13; read-only)

| Table | Rows | Endpoint columns | Observed identity |
|---|---|---|---|
| ontology_edges | 252,102 | source_packet_key, target_packet_key | packet:<hash> (canonical packet key), 251,220 rows with packet: endpoints on both sides |
| atlas_graph_edges_v2 | 224,764 | source_node_key, target_node_key | mixed: tree:<uuid> and packet: keys |
| taxonomy_edges | 62,802 | source_key, target_key | topo:<class> to root (taxonomy ids) |
| code_relations | 12,975 | source_file, target_key | path to symbol name |
| agent_context_relations | 10,521 | source_key, target_key | agents:<path> |
| code_feature_edges | 6,558 | from_feature_id, to_feature_id | composite path:symbol:kind |
| atlas_feature_relationships | 4,097 | source_feature_id, target_feature_id | feature slugs |
| codebase_relationship_reports | 1 | src_community, dst_community | community ids |

Result: only ontology_edges uses packet_key on both ends. Multi-hop traversal across tables needs an explicit identity mapping per table. Cross-table multi-hop remains NOT_PROVEN.

## HANDOFF SUMMARY (2026-10-13; for a fresh session)

### Status by gate
| Gate | Status | Evidence |
|---|---|---|
| Exporter contract (tag guard, no overwrite, lineage NOT_PROVEN) | PROVEN | `python/test_export_frozen_semantic768_snapshot_contract.py` run with `.venv`: 4 of 4 OK |
| Diagnostic ingest (error_logs, 291 observations) | PROVEN for one-off write | 291 rows; repeat insert 0; table total 292 |
| Diagnostic analysis writer (`diagnostics.record_analysis`) | PARTIAL | Dry-run only (rehearsal rolled back). Commit path not run. |
| `source_ref` pattern indexes | PROVEN | `indisvalid=true`; live plan uses bitmap scan; 40 of 40 search calls OK |
| `parent_atlas_documents` | BLOCKED | It is a VIEW over `atlas_packets`, not a table. ALTER rehearsal failed safely; nothing changed. |
| `telemetry-compressor.ts` (`source_ref_id`) | BLOCKED | Query fails: column does not exist. No `.catch`, so the failure propagates. |
| `context-assembler.ts` (`som_cluster`) | PROVEN silent fallback | Column absent from view. The `.catch` hides it and falls back to `atlas_feature_map`. |
| `atlas_packets` reconciliation manifest | PARTIAL | 144 columns, checksum recorded. 58 live-only (54 populated, 4 empty). Readers/writers per column not yet determined. |
| Duplicate-index drops (10 groups) | NOT_RUN | Draft and rehearsal only (94 to 84, then rollback). Needs schema edits and approval. |
| `feature_registry` | NOT_RUN | Draft and rehearsal only. Not applied. |
| Workspace-event tables (3) | NOT_RUN | Owner: `20260916_workspace_event_head_v1.sql`. Needs canary. |
| Edge endpoint identity | PROVEN (descriptive) | Only `ontology_edges` uses packet keys on both ends. Cross-table multi-hop NOT_PROVEN. |
| NetworkX PageRank | NOT_RUN | NetworkX 3.6.1 in `.venv`. No run over these tables. |
| simdjson | NOT_RUN | Not a declared dependency. Profile first. |
| EmbeddingGemma CPU workers | NOT_RUN | `scripts/workers/embedding-cpu-worker.mjs` exists. Not run or verified. |
| Top-k pagination | NOT_RUN | `python/atlas_compute/topk_paginator.py` plus tests. Not run this session. |

### Decisions pending (owner needed)
1. `parent_atlas_documents`: option A (redefine the view to expose the six real columns from `atlas_packets`) or option B (align the Drizzle declaration to the view and change the readers). Recommended: A for the six, B for the seven with no physical backing.
2. `telemetry-compressor.ts`: which canonical source identity replaces `source_ref_id`. Do not substitute `source_ref` by default.
3. `context-assembler.ts`: read `centroid_id` from the view, or `atlas_packets.som_cluster`. Remove the silent catch either way.
4. Approve applying the 10 duplicate-index drops, with matching `schema.ts` edits.
5. Approve `feature_registry` apply.
6. Authorize the disposable canary for the workspace-event tables.
7. Diagnostic writer: retire `diagnostics.record_observations` once the new ingest owner exists. Add a `lineage_status` marker for unqualified historical rows.
8. Commit the diagnostic analysis payload (`--wire --commit`).

### Do not do without separate approval
- `drizzle-kit push`, any `ALTER` on `atlas_packets`, placeholder columns, destructive view replacement.
- Dropping indexes, Graphify runs, Qdrant or Valkey writes, cache hydration, AIO changes, restarts of PostgreSQL.

### Re-run commands (from repo root unless noted)
- Drizzle audit: `npm run audit:drizzle` (root). Output: `docs/reports/postgres-contract-mirrors-report.{json,md}`.
- Exporter test: `.venv/Scripts/python.exe python/test_export_frozen_semantic768_snapshot_contract.py`.
- Capture spec: `cd sveltekit-frontend && node --test scripts/svelte-check-capture.spec.mjs` (20 tests).
- Extractor test: `node --test scripts/atlas/lib/ast-grep-symbol-extraction.test.mjs` (5 tests).
- Read-only view inspection: `SELECT pg_get_viewdef('public.parent_atlas_documents'::regclass, true);` via `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db`.
- OpenSpec gate: `openspec validate manual-migration-reconciliation --strict`.

### Artifacts
- Manifest: `.tmp/atlas-packets-reconciliation-manifest.json`
- Inventory: `docs/reports/analysis-schema-inventory-2026-10-13.json`
- GraphRAG inventory: `docs/reports/graphrag-multihop-analysis-2026-10-13.json`
- Pre-audit report backups: `.tmp/pre-audit-postgres-contract-mirrors-report.{json,md}`
- Duplicate-index archive: `.tmp/atlas-packets-duplicate-indexes-manifest.json`

### Notes for the next session
- Use `.venv` for Python (system Python has no numpy).
- Do not run `npm run` from a subdirectory. Several scripts are root-only.
- Bash heredocs collapse doubled backslashes. Write scripts with the file tool.
- Node writes to `sidecar-migrations.json` failed intermittently with a Windows file-open error. The edit tool worked.

## INPUT: Integration readiness review and production handoff instruction (pasted 2026-10-13)

Status: reported input from an external review. The percentages are reported implementation and test outcomes, not independently verified live results. Keep the 68% overall figure as a historical heuristic for comparison only. Do not recalculate it from percentages that cover different kinds of work.

### Reported readiness (not verified here)
| Workstream | Reported | Primary remaining gate |
|---|---|---|
| Graph Phase 6 | 85% | Live multi-store write approval |
| AST GPH-07 to 16 | 82% | graphify:daily owner integration |
| Compiler-semantic / LSP | Live read-only proven | Stable-symbol canonicalization |
| Canonical identity RF4 | 70% | Live candidate acceptance |
| RF5 within-lane dedup | 40% | One entity, one lane, one vote |
| Retrieval to ContextManifest | 65% | Runtime retrieval and manifest round trip |
| Grounded execution | 45% | ExecutionReceipt feedback |
| GPU / RAPIDS | 58% | Same-corpus identity parity |
| TensorRT / LibTorch | 40% | Build and execution proof |
| Performance | 25% | Representative benchmark |

### Critical path (in order)
1. AST production owner: GraphifyStructuralMaterializer to AstProvider to 8095. Prove live graphify:daily integration, source revision consistency, and production receipt emission.
2. Canonical identity RF4: resolve one real packet, AST node, source span, and current representation. Do not use backend identifiers as canonical truth.
3. RF5 within-lane dedup: one canonical entity gets at most one contribution from each logical retrieval lane, whatever the executor count.
4. ContextManifest admission: round-trip exact evidence references, revisions, deterministic Top-K order, and manifest checksum.
5. ExecutionReceipt feedback: claim or runId to worker to execution receipt to validation, with no implicit live mutation.

### Architectural decisions (from the review)
- Keep AST and compiler-semantic evidence complementary. Tree-sitter is structural. LSP adds type and definition information only after stable symbol mapping and revision checks. Neither mints canonical packet identities.
- Finish RF5 before adding vector executors. cuVS exact, Qdrant HNSW, and future CAGRA belong under one logical semantic retrieval lane. GPU parity alone does not prove RRF correctness.
- Defer performance promotion. SIMD JSON, CPU thread pools, TensorRT, and low-rank projections should respond to measured bottlenecks, and must not delay provenance, identity, or ContextManifest admission.

### Coding-agent instruction (P0 to P4)
Continue existing Graphify, AST, RF4/RF5, ContextManifest, and execution-receipt OpenSpec work. Reuse existing owners.
- P0 Production AST owner: find the graphify:daily entrypoint and the existing structural materializer. Wire the existing AST owner with no alternative materialization path. Validate native source IDs, source revisions, AST spans, failure isolation, and tombstone propagation. Add a production receipt that distinguishes executed, skipped, failed, stale, and superseded work. Test orchestration with controlled fixtures before any approved production run.
- P1 Canonical retrieval: prove one real candidate resolves through packet registry, source bytes, AST evidence, and representation revision. Implement or complete RF5 before RRF aggregation. Verify one logical lane gives at most one vote per canonical entity. Preserve the atlas.topk.v1 ordering contract.
- P2 ContextManifest: run a bounded real retrieval-to-manifest round trip. Record ordered candidate IDs, source revisions, evidence references, token budgets, and checksums. Reject ambiguous, expired, or superseded evidence. Do not admit GPU-derived recommendations as canonical source evidence.
- P3 Execution receipts: verify claim and runId linkage through the existing worker and Kanban owners. Emit typed ExecutionReceipts for success, failure, and rejection. Keep external writes and live action dispatch approval-gated.
- P4 GPU comparison: reuse the existing 64 x 768 CPU and cuVS cosine parity proof. Compare Qdrant and cuVS on the same frozen, revision-qualified candidate cohort. Validate CandidateOrdinalMapV1, identity mapping, Top-K tie parity, recall, and memory. Keep CAGRA quarantined until the exact-oracle comparison passes.
- Report each gate as PROVEN, PARTIAL, BLOCKED, or NOT_RUN, with exact test commands, exit codes, and receipts. Do not infer production readiness from fixture tests alone.

### Highest-value next milestone (from the review)
One real, revision-qualified source change should move through AST materialization, canonical packet resolution, deduplicated retrieval, and ContextManifest admission, with a reproducible receipt.

### Gate status for this input
| Gate | Status | Note |
|---|---|---|
| Reported readiness table | NOT_RUN here | External report; not reproduced |
| P0 production AST owner | NOT_RUN | Not started in this change |
| P1 RF4 and RF5 | NOT_RUN | Not started in this change |
| P2 ContextManifest round trip | NOT_RUN | Not started in this change |
| P3 execution receipts | NOT_RUN | Not started in this change |
| P4 GPU comparison | NOT_RUN | Not started in this change |

## 2026-10-13 session progress and next steps (append-only; read-only except the draft file)

### Done this session (verified)
| Item | Artifact | Status |
|---|---|---|
| Graph revision + traversal DDL draft | `sveltekit-frontend/drizzle/manual/20261013_graph_revision_and_traversal_CONCURRENT_DRAFT.sql` | APPLIED & VERIFIED 2026-10-14. Sections A, B, C, D applied live without lock contention. 5 traversal indexes + 4 revision indexes created CONCURRENTLY with indisvalid=true. Query cost dropped 7,466x (92,728 -> 12.42, 0.043ms actual). |
| Domain taxonomy census (Phase 1, partial) | six of seven tables inspected via TRACE | PARTIAL. `domain_function_mapping` not live. No FK among domain tables. Row counts, active versions, EXPLAIN = NOT_RUN (no approved read path) |
| Repo proof-status analysis | `docs/reports/repo-proof-status-analysis-2026-10-13.md` | Checkbox 61.6%; receipt-cited 4.3% of checked tasks; denominator mismatch 7,804 vs 7,228 unreconciled |
| BitFrost FSM index | `docs/architecture/_bitfrost_fsm_index.md` | Index with findings F1–F15 |

### Next step 1 — INDEX-01 (taxonomy / OAK / GraphRAG / NetworkX index)
- One table-based index linking: the six live taxonomy tables; the PostgreSQL ontology boundary owner (`ontology-resolution-boundary-postgres.ts`); `hypergraph-retrieval-v1.ts` (proposed GraphRAG owner, caller unconfirmed); the NetworkX parity executor; the draft DDL above.
- Gate: every cited path exists; any generated TOC is regenerated only after reviewing the diff.
- Status: NOT_STARTED. Docs only.

### Next step 2 — INVERSE-DAG-LOWRANK-01 (inverse DAG synthesis for low-rank recommendation)
Proposal-only. `canonicalAuthority: false`. Reuse existing owners; do not add new ones.

| Capability | Existing owner (reuse) | Constraint |
|---|---|---|
| Low-rank sampling | `python/atlas_compute/low_rank.py`, `sveltekit-frontend/src/lib/server/atlas/sampling/sample-query-matrix-v1.ts` | EXPERIMENT per CLAUDE.md; do not rebuild |
| Recommendation evidence | `recommendation-evidence-bundle-v1.ts` | evidence only; no new vote |
| Term resolution (OAK) | `ontology-resolution-boundary-postgres.ts` + Python OAK bridge (`:8095`) | PostgreSQL boundary is the owner |
| DAG execution | existing agent execution spine and plan tournament | bounded; no direct writes |
| Summarization | Ornith on llama-server `:8090` (chat only) | never used for embeddings; no hidden thoughts persisted |
| Prompt/evaluation tuning (DSPy / GEPA) | shadow mode only, per CLAUDE.md `LearningOutcomeV1` ordering | no promotion |
| Bounded recursive reasoning (RLM) | `parent-atlas-ace-rlm-bitfrost-integration` | bounded depth; receipt per step |

Gates:
| Gate | Required evidence | Status |
|---|---|---|
| LR-01 | Inverse DAG definition: output = the input set that produced a recommendation; proposal only | NOT_STARTED |
| LR-02 | Replay parity against the deterministic recommendation on a frozen fixture | NOT_STARTED |
| LR-03 | DSPy/GEPA evaluation on a reviewed set | BLOCKED: no reviewed set exists (CLAUDE.md trust floor: 200 reviewed rows, 30 per class) |
| LR-04 | Ornith summary is bounded and persists no hidden thoughts | NOT_STARTED |
| LR-05 | OAK term resolution reuses the PostgreSQL boundary; no second resolver | NOT_STARTED |

Not started. No code, DDL or service changes were made for either step.

### Update 2026-10-13 — attempt at all three items
| Item | Result | Evidence |
|---|---|---|
| INDEX-01 | DONE (docs only) | `docs/architecture/_taxonomy_oak_graphrag_index.md`; cited paths checked |
| LR-02 (replay parity) | PARTIAL | `python/test_atlas_compute.py -k "low_rank or recommend"`: 8 passed, 7 deselected, exit 0 (`.tmp/lr02-pytest.log`). Covers seeded repeatability and the advisory task-ordering builder. Not a domain-recommendation replay |
| LR-01 (inverse DAG definition) | NOT_STARTED | no definition document written yet |
| LR-05 (OAK via PostgreSQL boundary) | NOT_STARTED | owners exist; wiring needs the census below |
| Taxonomy census: row counts, active versions, EXPLAIN | PARTIAL | catalog and columns inspected for 6 of 7 tables (read-only TRACE). Row counts and EXPLAIN NOT_RUN: no approved read path for them |
| LR-03 (DSPy/GEPA evaluation) | BLOCKED | no reviewed set (trust floor: 200 reviewed rows, 30 per class) |
| LR-04 (Ornith summary bounded) | NOT_STARTED | — |

Not complete: three of the seven rows are still open. Closing the census needs an approved read-only path for row counts and EXPLAIN.

### Update 2026-10-13 — read-only census closed (approved by operator: "yes you do it")
Single `BEGIN READ ONLY` transaction via `docker exec legal-ai-postgres psql`; no writes; `EXPLAIN` without `ANALYZE`. Receipt: `.tmp/census-readonly-2026-10-13.out` (script `.tmp/census-readonly-2026-10-13.sql`), exit 0.

| Table | Exact rows | Finding |
|---|---|---|
| `domain_taxonomy_v1` | 0 | no active versions, no replacement chains; OAK has nothing to resolve against |
| `atlas_domain_ontology` | 17 | live count (earlier "13 groups" was from older repo docs, not the live table) |
| `atlas_document_classification` | 0 | empty |
| `feature_domain` | 61,659 | 40 distinct `domain_class` values |
| `ontology_domain_tuples` | 61,659 | same 40 keys |
| `classification_envelope` | 0 | empty |
| `domain_function_mapping` | — | not live |

Key matching: of 40 distinct `domain_class` values, **32 match no `atlas_domain_ontology.group_id`**; all 40 match no `domain_taxonomy_v1.domain_id`. Only 8 keys match an ontology group.

EXPLAIN (no ANALYZE): taxonomy lookup uses `idx_domain_taxonomy_domain_id` (estimate 1 row, but the table is empty). Tuple lookup on `domain_class` plus `predicate='is_a'` chose the `predicate` index with an estimate of 1 row on 61,659 rows, which indicates stale statistics. `ANALYZE` has NOT been run and needs approval.

Consequence for the gates: LR-05 (OAK through the PostgreSQL boundary) cannot be validated end to end until the taxonomy is populated and the 32 unmatched keys are reconciled. This is a data finding, not a code fix. Nothing was written or changed.

### Update 2026-10-13 — taxonomy population (operator-approved write, 17 rows)
- Source: `atlas_domain_ontology` (17 groups, read-only export). Plan: `.tmp/taxonomy-dryrun-plan-2026-10-13.json` (checksum `sha256:e335b805…c155b7bbc`).
- Write: `INSERT INTO domain_taxonomy_v1 … ON CONFLICT (domain_id, version) DO NOTHING` in one transaction. Receipt: `.tmp/taxonomy-insert-2026-10-13.out` (exit 0, `INSERT 0 17`, 17 rows, 17 active).
- Verification (read-only): orphan parents 0; taxonomy rows not in ontology 0; ontology groups not in taxonomy 0.
- Not done: the 28 unmatched live `domain_class` keys (no decision); the NLP pass over indexed PostgreSQL 18 files (not defined: no inputs, label set, or reviewed set); `ANALYZE`.

### Alignment update 2026-10-13 — status corrected after review (no DB writes in this step)
| Item | Status | Evidence / correction |
|---|---|---|
| Taxonomy insert (17 rows) | DONE, but **owner bypassed** | Inserted directly, not via `seedDomainTaxonomy()`. Receipt `.tmp/taxonomy-insert-2026-10-13.out` |
| Taxonomy owner conflict | OPEN (decision needed) | Owner vocabulary = 10 domains (`retrieval`, `auth`, `api_routes`, `database`, `embeddings`, `ui_components`, `graph_reasoning`, `testing`, `caching`, `documentation`). Overlap with inserted rows: `auth`, `database`, `retrieval` only. Options: (1) remove the 17 rows, (2) keep as a separate version, (3) re-map onto owner vocabulary. All three need approval |
| Key crosswalk | DONE (read-only) | `.tmp/taxonomy-crosswalk-2026-10-13.json`: 8 EXACT_MATCH, 4 AMBIGUOUS (`API`, `Database`, `Graph`, `MachineLearning`), 28 UNMAPPED. Sentinel `Classification failed`; catch-alls `Other`, `Utility` |
| Frequencies of 40 keys | NOT_COLLECTED | no registered TRACE row tool |
| `pg_stat_all_tables` review | NOT_RUN | not in TRACE; ANALYZE not run |
| `search_postgres_fts` | VERIFIED (bounded) | 10 lexical hits, code chunks only; does not cover taxonomy tables |
| LR-05 (OAK via PostgreSQL boundary) | BLOCKED | depends on the owner decision above |
| INDEX-01 | DONE | `docs/architecture/_taxonomy_oak_graphrag_index.md`, corrected this step |
| `:8090` Ornith | RESTORED | `ornith-1.5-9b`, vision true, idle (`pwsh` 7 launcher; PowerShell 5.1 failed to parse) |
| GPU suite (sm_86, torch 2.13.0+cu130) | PASS (bounded) | top-k and exact kNN match CPU (1.0); fp16/bf16 near fp32; int8 top-10 0.97; k-means inertia monotone |
| CPU suite (synthetic) | PASS (bounded) | SOM 20×20 QE 7.61; k-means ARI 1.0; NB and LR accuracy 1.0 on synthetic labels only |
| cuVS brute-force top-k | **BLOCKED** | recall 0.775 vs NumPy exact; 16/16 queries have wrong first-position distance; CuPy exact recall 1.0 (reference correct). Root cause unknown |
| Addon cosine (CUDA and June builds) | PASS (strict criterion) | max abs error 4.9e-8; load and `checkCudaAvailable` = 1 for both. Execution correctness shown only for cosine |
| INT4 blockwise benchmark | SCAFFOLD ONLY, BLOCKED | `python/tests/test_int4_blockwise_fail_closed_v1.py`: 4/4 harness tests pass. Quality NOT measured: no frozen lineage cohort. Earlier 0.325 Recall@10 was a random smoke diagnostic, not evidence |
| `Classification failed` / `Other` / `Utility` in taxonomy | OPEN | sentinel and catch-alls should not become taxonomy rows without a decision |

Not started: low-rank, DSPy/GEPA promotion, cuTile/SIMT, xFormers, GPU cache, FTS indexes, ANALYZE. None of these is promoted by this update.

### Query-to-taxonomy resolver (advisory; operator-approved after review; no DB reads or writes)
| Artifact | Path | Status |
|---|---|---|
| Frozen 17-group snapshot | `scripts/atlas/taxonomy/taxonomy-groups-snapshot-2026-10-13.json` (checksum `sha256:6a7b7139…161a5`) | DONE |
| Proposal-only crosswalk (40 live keys) | `scripts/atlas/taxonomy/taxonomy-crosswalk-proposal-2026-10-13.json` | DONE: 8 EXACT, 32 UNMAPPED (4 of them carry a case-only candidate). No PARENT_CHILD_PROPOSED rows: no live key names a child group |
| Resolver | `scripts/atlas/taxonomy/taxonomy_query_resolver_v1.py` | DONE. Lexical + trigram proposes candidates; ordering uses existing `stable_topk` (atlas.topk.v1) |
| Tests | `scripts/atlas/taxonomy/test_taxonomy_query_resolver_v1.py` | 6 of 6 pass (`.venv` pytest) |
| Known weakness | trigram floor 0.2 admits weak matches (`machine learning` → `cache` at 0.27) | OPEN: floor is a decision, not tuned here |

Corrections recorded: `stable_topk` drops extra fields, so classification is joined back by `canonicalId`. Candidate `sourceRevision` is empty because the snapshot has no revisions; results are advisory and not revision-qualified.

Gate status: LR-05 (OAK via PostgreSQL boundary) remains BLOCKED on the owner decision. Recommendation output is advisory only; no trigram or model score authorizes a taxonomy remap.

### Readiness check 2026-10-13: topk, kNN, HypergraphRAG, PageRank, TensorRT-RTX (read-only; no edits to code or data)
| Item | Status | Evidence / correction |
|---|---|---|
| Top-K | PARTIAL-PROVEN | CPU `stable_topk` (atlas.topk.v1) used by resolver; GPU top-k matches CPU (1.0). Not proven at production scale |
| kNN (exact) | PARTIAL-PROVEN | GPU exact matches CPU reference (1.0). cuVS brute-force **BLOCKED**: recall 0.775 vs NumPy exact; first-position distance wrong in 16/16 queries; CuPy exact recall 1.0. Root cause unknown |
| HypergraphRAG | NOT READY | one live-looking caller (`features/rag/multi-lane-retrieval.ts`) plus `hypergraph-retrieval-v1.spec.ts`; no end-to-end run. Neo4j is disabled in engram-only mode (`NEO4J_ENABLED=false`, AGENTS.md); earlier `graph.expand_neighborhood` hung past 120 s |
| "Neo4j directory in Downloads" | NOT FOUND as a Neo4j project | `Downloads/` holds video files and `deeds_web_app-main` copies with a `docker-compose` Neo4j service. `Neo4j-04d6547a-Created-2025-08-06.txt` was not opened (may contain secrets). Do not import from Downloads without review |
| Custom PyTorch PageRank | NOT IMPLEMENTED in the owner | owner `python/atlas_compute/typed_graph_runtime.py::run_pagerank` supports only `networkx` (oracle) and `cugraph`. No PyTorch backend. Five graph-runtime modules overlap (`pagerank_parity`, `networkx_executor`, `cugraph_executor`, `typed_graph_runtime`, `atlas_rapids_graph_runtime`). Next: add a `torch` backend behind the existing owner and gate it on NetworkX parity |
| WSL2 | FOUND, STOPPED | distro `Ubuntu` (WSL 2), state Stopped; `atlas-rapids-cu13` conda env reachable when started (torch 2.13.0+cu130, cuVS 26.06.00, cuGraph 26.06.00, cuDF 26.06.01, CuPy 14.1.1) |
| SIMT / cuTile | NOT RUN | no SIMT or cuTile test executed in this step |
| TensorRT bridge (`tensorrt_bridge.node`) | LOADS, EXECUTION PARTIAL | CUDA build (2026-10-13) and June build both load and report CUDA available; cosine matches JS oracle (error 4.9e-8). Other exports not exercised |
| TensorRT-RTX 1.6 | NOT INSTALLED | only the CUDA toolkit is under `Program Files/NVIDIA GPU Computing Toolkit`. Repo notes say the installer is license-gated: operator must supply the path. Side-by-side challenger only; 13.0 lane must stay untouched |

Blocked on you: (1) the TensorRT-RTX installer path, if you want 1.6 aligned; (2) whether to add the PyTorch PageRank backend to `run_pagerank` now; (3) whether to investigate the cuVS first-position fault before any kNN use.

Not promoted by this check: HypergraphRAG, PyTorch PageRank, TensorRT-RTX, and cuVS search.

### ACE alignment check 2026-10-13 (read-only; no code changed)
| Item | Status | Evidence |
|---|---|---|
| ACE admission uses the V2 builder | YES | `context/ace-context-manifest-admission-v1.ts` calls `buildContextManifestV2` (line ~189) |
| ACE uses our selection digest | **NO: two digests** | ACE computes `selectedOrdinalSetChecksum` (line ~166) with schema `atlas.ace-context-selected-ordinal-set.v1` over `candidateSnapshotRevision`. Ours is `atlas.selected-ordinal-set.v1` over `snapshotId` (`computeSelectedOrdinalSetChecksumV1`). Same concept, different digest |
| ACE verifies V2 selection | NO | `verifyContextManifestV2Selection` has no production caller |
| ACE uses our compile / leases | NO | `compileFsmContextManifestV1` and the lease API have no ACE caller |
| ACE and the FSM | ACE does not import `cache/bitfrost-token-fsm-v1.ts`; `CLAUDE.md` lists ACE-BITFROST-CALLER-01 as pending | consistent with the open item |

Decision needed before changing ACE: switching ACE to our digest changes existing admitted manifest checksums. Options: (1) migrate ACE to `computeSelectedOrdinalSetChecksumV1` with a versioned cutover; (2) keep ACE's digest and document our digest as the compiler-side identity only; (3) add a bridge that records both. Not promoted by this check.

### Query-to-taxonomy resolver and KAG DAG alignment, 2026-10-13 (operator review applied; no DB writes, no service starts)
Decisions recorded from the review:
- KAG DAG ownership: OAK DAG runtime registry (`policy/oak-dag-runtime-registry-v1.ts`) owns policy and routing; `workflow/context-tool-dag-contracts.ts` defines stage inputs and outputs; `db/schema/kag-dag.ts` is persistence only. No new KAG engine.
- `:8095` sidecar: do not start or restart implicitly. Remains DOWN until the operator starts it.
- Taxonomy: keep the 17 groups; crosswalk is proposal-only; classes EXACT, PARENT_CHILD_PROPOSED, ALIAS_PROPOSED, AMBIGUOUS, UNMAPPED.

| Item | Status | Evidence |
|---|---|---|
| Crosswalk v2 (five classes) | DONE | `scripts/atlas/taxonomy/taxonomy-crosswalk-proposal-2026-10-13.json`, checksum `sha256:1d7ed4c6…8a5be1`; 8 EXACT, 4 ALIAS_PROPOSED, 28 UNMAPPED; PARENT_CHILD_PROPOSED 0 (no live key names a child group) |
| Resolver edge-case tests | DONE, 10 of 10 pass | `scripts/atlas/taxonomy/test_taxonomy_query_resolver_v1.py`: exact/unmapped, trigram false positive stays a proposal, duplicate canonical IDs, snapshot checksum reporting, page stitching, read-only (no DB, cache or network modules loaded) |
| Candidate discovery via PG trigram/FTS and semantic_768 | NOT STARTED | the resolver uses the frozen snapshot only; live candidates need the existing readers and canonical identity |
| Revision-qualified candidates | BLOCKED | snapshot has no source revisions; `sourceRevision` is empty in output |
| Tuple join and graph snapshot qualification | BLOCKED | no checksum-qualified graph snapshot in use; cross-table multi-hop NOT_PROVEN |
| RF4 / RF5 / receipt | NOT STARTED | — |
| `:8095` sidecar health and evidence endpoint | BLOCKED (not started) | owner `python/miniforge_nlp_sidecar_v2.py`; operator must start it |
| Ornith `:8090` | HEALTHY at last check | `ornith-1.5-9b`, vision true, idle |
| LangExtract → Ornith adapter | P1 NOT STARTED | owner `python/atlas_langextract_runtime.py` exists; local-endpoint configuration and grounding gate not yet verified |
| KAG DAG stages (typed PASS/FAIL/BLOCKED/SKIPPED) | DESIGN ONLY | stage list from review; no runtime implementation yet |
| HyperGraphRAG (Desktop/Downloads, MIT) | REFERENCE ONLY | design patterns only; no code copied; LLM extraction must go through local `:8090`, not cloud |

Blockers: sidecar start (operator), revision-qualified candidate sources, and checksum-qualified graph snapshot. Not promoted by this entry: any recommendation, PyTorch ranker, DSPy/GEPA, GPU challenger, or KAG DAG run.

### LangExtract → Ornith adapter check (P1), 2026-10-13 (read-only except one bounded inference request; no service start)
| Item | Status | Evidence |
|---|---|---|
| Owner of the extraction path | `python/miniforge_nlp_sidecar.py` (grounded lane, `_extract`, `_ensure_grounded_provider_controls`) | `python/atlas_langextract_runtime.py` is only a loader (official package vs shim); it has no endpoint or grounding logic |
| Endpoint configuration | CONFIGURED | `.env` `LANGEXTRACT_BASE_URL=http://127.0.0.1:8090/v1`. Sidecar default is `http://host.docker.internal:8090/v1`, which resolves only inside Docker; a native sidecar needs the `.env` value |
| Grounding gate | PRESENT | legacy extraction rejects with reasons: `CHAR_INTERVAL_MISSING_OR_INVALID`, `CHAR_INTERVAL_OUT_OF_BOUNDS`, `RETURNED_SPAN_NOT_EXACT_IN_ORIGINAL_SOURCE`, `RELATION_CLASS_AND_VERBATIM_SUBJECT_PREDICATE_OBJECT_REQUIRED` |
| Grounding tests | 22 of 22 pass under Python 3.13.5 (`py -3.13 -m pytest`, exit 0) | they replace langextract with a fake, so they prove the validator logic, not live extraction |
| Repo `.venv` (Python 3.11) | CANNOT COLLECT these tests | f-string backslash syntax needs Python 3.12+ |
| Live Ornith reachability | PASS (one bounded request) | `:8090` returned a valid JSON relation for an extraction prompt (`finish_reason: stop`). Not run through LangExtract or the sidecar |
| Live LangExtract → Ornith extraction | NOT RUN | needs the sidecar or an in-process langextract call; the sidecar is DOWN and needs your start |
| Ungrounded relation rejection on live output | NOT RUN | depends on the live run above |

Sidecar: still DOWN. P2 (health, capability, typed-error tests) stays blocked until you start it. Not promoted: any extraction output, any KAG DAG stage, any canonical edge.

### Taxonomy scale and concept sources, 2026-10-13 (read-only findings)
| Question | Finding | Evidence |
|---|---|---|
| Why only 17 taxonomy groups? | The 17 are the live `atlas_domain_ontology` table. Nothing in this repo lists ~140 LSP languages | `.okf/languages/` holds one file (`typescript.yaml`). The only "140" matches are unrelated (model READMEs, workboard numbers) |
| `.okf` corpora | `corpora/keyword-corpus.yaml` is a derived, non-authoritative vocabulary (`canonical_authority: false`), 316 lines, about 9 language mentions | `.okf/corpora/` |
| Where did concepts/entities come from? | Neo4j-era code exists (`atlas-*.ts` references), but `NEO4J_ENABLED=false`, so no Neo4j concept source is live | `.env` |
| Live concept sources | Postgres: `atlas_domain_ontology` (17 rows); `atlas_concepts` exists (7 columns, vector) but its count and contents were NOT checked | `db_table_inspect` |
| base64 / hex / `title_id` / `tree_node_id` alignment | NOT RESEARCHED. `title_id` is unique per packet and is not a semantic key (earlier census) | earlier identity note |

Not done: no change to the taxonomy, no `.okf` expansion, no Neo4j re-enable. Decision needed before any expansion: which source is canonical for the full taxonomy (the `.okf` language set you mean, or the 17-group ontology).

### Pipeline wiring & coordinate authority alignment, 2026-10-13 (operator reviewed)
| Area | Alignment Decision | Evidence & Authority |
|---|---|---|
| **Coordinate Authority** | UTF-8 byte offsets are canonical authority; UTF-16 code units (LSP, Node tree-sitter JS) are derived projections | `sveltekit-frontend/src/lib/server/atlas/indexing/source-coordinate-map-v1.ts` (`SourceCoordinateMapV1`, `SourceOffsetBasisV1`) |
| **JSON Decomposition** | Native C++ SIMDJSON bridge handles high-throughput AST/corpus JSON parsing without V8 GC pressure | `simd-bridge/simdjson_bridge.cc` |
| **.okf Language Taxonomy** | Approved Option 2 (Start small with verified repo languages: TS, Python, Rust, Go, C++, Svelte, SQL) | `.okf/languages/typescript.yaml`; `.okf/schemas/language-syntax-rule.schema.json` via `python/atlas_okf_docs_pipeline.py` |
| **17 vs 140 Discrepancy** | 17 coarse domain groups in DB (`atlas_domain_ontology`) vs fine-grained syntax nuances in `.okf`. Nuances compile into AST feature flags, not taxonomy groups | `netowrkx_hypergraphrag_neo4j_pagerank_alignment.txt` |
| **HyperGraphRAG Topology** | Facts modeled as N-ary relation nodes with role-labeled participant edges (`SUBJECT`, `PREDICATE`, `OBJECT`, `EVIDENCE`); no pointer linked lists; CSR adjacency for multi-hop BFS | `python/parent_atlas_ontology/graph_projection.py:144`; `nary-proposal-hyperedge-materializer-v1.spec.ts` |
| **ACE Checksum Alignment** | Approved Option 3: Dual-digest bridge (`aceDigest` + `compilerDigest`) preserving legacy manifests while enforcing `selectedOrdinalSetChecksum` | `context/ace-context-manifest-admission-v1.ts`; `cache/bitfrost-token-fsm-v1.ts` |
| **Disk & VHDX Blockers** | Drive C at 0.00 GB free; `docker_data.vhdx` (174.86 GB), `ext4.vhdx` (33.64 GB), `.tmp` (29.63 GB) require `wsl --manage <distro> --compact` | `Get-PSDrive C`; WSL 3.0.3.0 |

### Parser and environment inventory, 2026-10-13 (read-only; nothing installed or changed)
| Capability | Repo evidence | Installed: repo `.venv` (3.11) | Installed: Python 3.13.5 | In `runtime-capability-registry-v1.json` | Status |
|---|---|---|---|---|---|
| Tree-sitter CST | `packages/parent-atlas`, `packages/atlas-core`, sveltekit scripts; CLAUDE.md names it as the 8095 CST owner | no | `tree_sitter` yes | 0 entries | PRESENT in code; registry gap |
| ast-grep | `scripts/atlas/ast-grep-symbol-extraction.mjs` and other `scripts/atlas` files | no | `ast_grep_py` yes | 0 entries | PRESENT in code; registry gap |
| Python LSP client | not found in repo (earlier count was unreliable and is superseded) | no `jedi`, no `pylsp` | `jedi` yes, `pylsp` no | 0 entries | NOT PRESENT |
| UTF-16 to UTF-8 | TypeScript packages (`parent-atlas-retrieval` simdjson bridge and tests); handling not verified | n/a | n/a | 0 entries | PARTIAL, unverified |
| simdjson | `packages/parent-atlas-retrieval/src/gpu/simdjson-bridge.ts` | n/a | n/a | 0 entries | PRESENT in code; registry gap |
| GPJSON | mentioned in CLAUDE.md and archived docs only; not a dependency anywhere | no | no | 0 entries | NOT PRESENT; no proven gap |

Environment: the repo `.venv` is Python 3.11, which cannot collect the grounded-extraction tests (they need 3.12+). Python 3.13.5 has the tree-sitter and ast-grep packages. Moving `.venv` to 3.13 requires recreating the venv: operator decision, not started.

Rule applied: DEPENDENCY-CAPABILITY-GUARD-01. No package is installed without a proven capability gap, and none is proven yet for GPJSON. Next checks before any install: verify the simdjson bridge covers JSON decomposition, and register the existing Tree-sitter, ast-grep and simdjson capabilities so the registry matches the code.

Decisions needed: (1) recreate `.venv` on Python 3.13; (2) whether to register the existing capabilities; (3) whether GPJSON is still wanted after the simdjson check.

### Capability registry: existing owners registered (operator choice 2, 2026-10-13)
| Entry | Added | Proof | Notes |
|---|---|---|---|
| `python::py313-launcher` | yes | installed-only (tree_sitter, ast_grep_py, jedi, orjson present; pylsp, gpjson absent). `capabilitiesProven: []` | not a live proof; resolves future install questions here first |
| `native::simd-bridge-tensorrt_bridge` | yes | `similarity.cosine.cuda` proven by bounded test (max error 4.9e-8) | simdJson exports exist but are NOT exercised; UTF-16 mapping is in TS `source-coordinate-map-v1.ts` |

Still open: whether to recreate `.venv` on Python 3.13, and whether GPJSON is still wanted after a simdjson check. `installAllowed` stays false on both new entries. No package was installed.

### Session checkpoint 2026-10-13 (context compaction point; read this first)
Done and verified:
- Taxonomy: 17 ontology groups inserted (operator-approved); crosswalk v2 proposal (8 EXACT, 4 ALIAS_PROPOSED, 28 UNMAPPED); resolver 10/10 tests.
- BitFrost FSM: leases, two-phase compile, V2 selection binding; contract tests only.
- Parser inventory and capability registry: two existing owners registered (`python::py313-launcher`, `native::simd-bridge-tensorrt_bridge`); data unchanged apart from those entries.
- LangExtract adapter: grounding gate present and tested (22/22 under Python 3.13); one bounded live Ornith extraction-style request answered with valid JSON.
- Ornith `:8090` serving `ornith-1.5-9b` with vision, idle.

Open decisions (none executed):
1. Canonical taxonomy source: the 17-group ontology, or a new language taxonomy file. The 140-language list does not exist in this repo or on the Desktop/Downloads.
2. Owner conflict: `seedDomainTaxonomy()` vocabulary (10 domains) versus the 17 inserted rows. Remap is proposed, not applied.
3. Recreate repo `.venv` on Python 3.13 (current 3.11 venv cannot collect the 3.12+ tests).
4. GPJSON: wanted, or replaced by the simdjson bridge after a check.
5. Start the `:8095` sidecar (`miniforge_nlp_sidecar_v2.py`). Down; not started implicitly.
6. ACE checksum: migrate to ours, keep ACE's, or record both through a bridge.
7. cuVS brute-force top-k fault (first returned neighbour wrong in 16/16 queries). Unresolved.
8. Trigram similarity floor (0.2 admits weak matches such as `machine learning` → `cache`).

Blocked: LR-05 (OAK via PostgreSQL boundary) on decision 2; live LangExtract run on decision 5; TensorRT-RTX 1.6 on an operator-supplied installer path; PyTorch PageRank backend on NetworkX parity (not started).

Not promoted by this checkpoint: HypergraphRAG, PyTorch PageRank, TensorRT-RTX, cuVS search, ACE admission, any recommendation output.
