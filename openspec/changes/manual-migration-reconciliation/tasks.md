# OpenSpec: Manual Migration Reconciliation Tasks

## MMR1.1 - Applied this session (record only)

- [x] `drizzle/manual/workflow_orchestration_tables.sql` — applied 2026-08-05. Creates `workflow_runs`, `workflow_tasks`, `workflow_outbox`, `workflow_approvals`. Pure `CREATE TABLE IF NOT EXISTS`, no drops. Fixed the `npm run dev:gpu` outbox-publisher error loop.
- [x] `drizzle/manual/0051_atlas_topology_eval_times.sql` — applied 2026-08-05. Creates `atlas_topology_eval_times`. Pure `CREATE TABLE IF NOT EXISTS`, no drops. Fixed the `atlas:phase16:som:apply` telemetry-write error.
- [x] Validation commands (already run, both PASS):
  - `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\dt" | grep -iE "workflow_"` → 4/4 tables present
  - `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\dt" | grep atlas_topology_eval_times` → present
  - `cd sveltekit-frontend && npm run atlas:phase16:som:apply` → completed clean, no `does not exist` error

## MMR1.2 - Tier A: safe additive sweep (pure `CREATE TABLE IF NOT EXISTS`, no name collisions found)

For each file: confirm target table(s) still missing, apply via `docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < <file>`, re-verify with `\dt`.

- [ ] `drizzle/manual/0000_create_embeddings_if_missing.sql` → `embeddings`
- [ ] `drizzle/manual/0007_court_opinions.sql` → `court_opinions`
- [ ] `drizzle/manual/0034_split_atlas_packets_ledgers.sql` → `atlas_codebase_packets`, `atlas_feature_packets`
- [ ] `drizzle/manual/0048_topology_vector_storage_lookup.sql` → `atlas_topology_evidence`, `atlas_topology_scores`, `atlas_vector_lookup`, `atlas_centroid_lookup`
- [ ] `drizzle/manual/0051_atlas_identity_ledger.sql` → `atlas_identity_ledger`
- [ ] `drizzle/manual/20260420_web_search_index.sql` → `web_search_index`
- [ ] `drizzle/manual/20260421_ast_graph_tables.sql` → `ast_nodes`, `ast_edges`, `ast_file_features`
- [ ] `drizzle/manual/20260507_retrieval_acceleration.sql` → `retrieval_rank_cache`, `llm_summaries`, `tool_call_stats`
- [ ] `drizzle/manual/20260607_route_packet_rewards.sql` → `route_packet_rewards`, `route_token_map`, `route_packet_source_refs`
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
