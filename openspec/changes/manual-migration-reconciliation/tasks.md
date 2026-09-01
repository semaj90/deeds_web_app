# OpenSpec: Manual Migration Reconciliation Tasks

## MMR1.0 - Current safe boundary (2026-08-31)

- [x] Read-only integrity audit completed: the Drizzle journal has 41 entries, the live Drizzle/public migration ledgers are empty, 66 root SQL files are outside the journal, and 41 journal hashes/live rows are unresolved.
- [x] No safe automated baseline/reconciliation owner was found. The existing integrity script is diagnostic; `--fix-hashes`, migration-row registration, loose-SQL moves, and migration apply remain mutating actions.
- [ ] Produce an explicit migration inventory and baseline decision (accepted history, applied-outside-Drizzle history, deferred proposals, and canonical owner) before changing either ledger or applying `feature_registry`.
- [ ] Keep `public.feature_registry` absent and `feature-registry.ts` unapplied until the baseline decision and shape reconciliation are approved.
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
- [ ] **Open adapter gap checked 2026-08-31:** active route/service code still queries `agent_pickup_queue` (`src/routes/api/tasks/packets/workflow/+server.ts`, `src/lib/server/tasks/semantic-packets.ts`) and the legacy packet script publishes `agent_pickup_queue:ready`. The table is absent, so these callers require an explicit Kanban/workflow adapter or a fail-closed deprecation path before apply mode is considered usable.
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
- [ ] `drizzle/manual/0034_split_atlas_packets_ledgers.sql` → `atlas_codebase_packets`,
  `atlas_feature_packets` — **file does not exist.** Live check: `atlas_codebase_packets` does not
  exist; **`atlas_feature_packets` DOES exist live** — so half of this migration's intended effect
  already happened through some other path (not this file, since the file itself is absent). Root
  CLAUDE.md's June 28 2026 schema-mismatch note called both tables "missing" at that time; only one
  of the two has since appeared. Worth checking what created `atlas_feature_packets` before assuming
  this ledger entry is fully stale — it may be partially superseded, not simply wrong.
- [ ] `drizzle/manual/0048_topology_vector_storage_lookup.sql` → `atlas_topology_evidence`,
  `atlas_topology_scores`, `atlas_vector_lookup`, `atlas_centroid_lookup` — **file does not exist**;
  none of the 4 target tables exist live either. Fully stale or fully superseded by a different
  design — not investigated further this pass.
- [ ] `drizzle/manual/20260420_web_search_index.sql` → `web_search_index` — **file does not
  exist**; table does not exist live either. Note: a *different*, real, wired web-research system
  was found elsewhere this session (`src/lib/server/research/web-research-ingester.ts`, Qdrant
  collection `chunks_web_search`) — this ledger entry may simply predate that design and be
  superseded by it, not a genuine gap. Worth closing as superseded rather than executing.
- [ ] `drizzle/manual/20260421_ast_graph_tables.sql` → `ast_nodes`, `ast_edges`,
  `ast_file_features` — **file does not exist**; none of the 3 target tables exist live under
  these exact names, though this session found real, live `atlas_ast_nodes` (note the `atlas_`
  prefix — a different, actually-populated table) via the `SYMBOL_SEMANTIC_768` investigation
  above. Likely superseded by the `atlas_*` naming generation, not a real gap — not confirmed.
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

- [ ] `drizzle/manual/20260606_missing_tables.sql` (204 lines) → creates `error_brain_analysis`, `error_brain_diffs`, `error_cluster`, `evidence_items`, `evidence_media_assets`, `evidence_transcript_segments`, `evidence_processing_jobs`, `evidence_frames`, `ingested_documents`, `web_pages`, `web_embeddings`, `web_crawl_jobs`, `user_analytics`, `ai_chat_sessions`.
  - [ ] Confirm `evidence_items`/`evidence_media_assets`/`evidence_frames` are not a duplicate of the canonical `evidence` table (already live) under a different naming scheme — check `src/lib/server/db/schema-postgres.ts` evidence pipeline (8-stage flow documented in CLAUDE.md) for which name is actually wired to `/api/evidence/upload`.
  - [ ] Confirm `ai_chat_sessions` is not a duplicate of the canonical `admin_ai_chat_sessions` (already live).
  - [ ] If genuinely additive (new concepts, not drift): apply. If duplicate: do not apply — file a follow-up to delete/archive the stale sidecar SQL instead (per Archival Rules, don't delete outright — move to `deeds_labs/archive/` with manifest entry).
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
