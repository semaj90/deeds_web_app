# Repo Consolidation Feature Map

## Purpose
Turn the current schema/runtime audit into a prune-ready labeling set so the repo can be reduced to production-ready source, schemas, scripts, and docs.

## Canonical Production Tables
- `research_summaries`
  - live in `legal_ai_db`
  - now has provenance fields:
    - `source_ref`
    - `source_refs`
  - now has query/index support for:
    - `source_ref` btree
    - `source_refs` GIN
    - `entity_tags` GIN
    - `output_meta` GIN
    - `embedding` HNSW
  - durable status: production path

## Production-Ready Code Paths
- `sveltekit-frontend/src/lib/server/analytics/ldr-ace-bridge.ts`
  - bridges local-deep-research into ACE packets and durable rows
  - preserves provenance through `sourceRefs`
- `sveltekit-frontend/src/lib/server/features/cases/research-summaries-db.ts`
  - query/persist layer for the durable research table
- `sveltekit-frontend/src/lib/server/db/schema-postgres.ts`
  - canonical Drizzle model for live schema
- `sveltekit-frontend/src/lib/server/cache/ace-packet-cache.ts`
  - ACE packet hot cache
- `sveltekit-frontend/src/lib/server/search/qdrant-search.ts`
  - default ANN adapter seam

## Planned Production, Not Yet Live
- `task_semantic_packets`
- `summary_cards`
- `glyph_records`
- `card_source_refs`
- `atlas_profile_cards`
- `atlas_feature_profiles`
- `atlas_dependency_edges`
- `atlas_hot_keyword_clusters`
- `atlas_retrieval_events`
- `local-deep-research` export/import bridge completion
- Postgres 18 dump/restore promotion once drift checks are green

## Experimental / Keep Out of Ship Set
- `local-deep-research` SQLite boundary
- cuVS / CAGRA swap lane
- WSL2 GPU override path when not required for the active deployment
- backup trees
- `.tmp`
- `.cache`
- `.svelte-kit`
- archive snapshots under `drizzle/archived/`
- generated scratch reports and working copies

## Archive Candidates
- old feature atlas snapshots that have been superseded by the live `research_summaries` / ACE packet flow
- redundant generated reports once their content has been promoted into canonical docs
- archived migration folders that are not part of current production schema evolution
- backup directories and report dumps outside the active toolchain

## LangExtract Summarization Rule
- Use LangExtract to turn source files, parent-atlas packets, and selected mirror summaries into short completion notes before any archive move.
- Promote the summarized result into the active completion notes first, then move the stale generated evidence out of the ship set.
- Do not treat the mirror tree as canonical input for archive decisions once the summary has been promoted into docs or reports.

## Keep Active
- `docs/reports/phase-101-closeout.md`
- `docs/reports/phase-102-handoff.md`
- `docs/architecture/kanban-parent-atlas-alignment.md`
- `docs/architecture/scheduler-gpu-bridge-roadmap.md`
- `docs/reports/repo-dirty-tree-classification-2026-06-01.md`
- `docs/reports/doc-feature-crosswalk-2026-06-01.md`

These are the production-readiness completion notes. They stay in the active set so the repo always has one short, current summary of what is done, what is deferred, and what is next.

## Labeling Rules
1. If a file writes or reads live canonical rows, keep it in ship-path.
2. If a file defines the future schema but is not live yet, keep it as planned production.
3. If a file exists only for experimentation, benchmarking, or alternate backends, keep it experimental.
4. If a file is a backup, snapshot, or duplicate report, move it to archive only after its content is promoted elsewhere.
5. If a generated tree still contains useful evidence, summarize it with LangExtract and parent atlas first, then archive the raw source dump.

## Next Actions
1. Use this map to classify the full repo tree during pruning.
2. Keep production-ready source, schemas, scripts, and docs only in the active ship set.
3. Move archive candidates out of the active set after atlas and kanban sync land on the production-ready feature list.
4. Keep completion notes in the active set and archive old generated material only after its content is promoted into those notes or into canonical docs/reports.
5. Re-run `docs/reports/repo-dirty-tree-classification-2026-06-01.{md,json}` before any archive move so generated artifacts, source changes, large blobs, and submodule dirtiness stay separated.
6. Review `docs/reports/repo-archive-move-plan-2026-06-01.{md,json}` to decide which generated artifacts should be summarized, archived, externalized, or kept as downstream index surfaces.
7. Use `docs/reports/doc-feature-crosswalk-2026-06-01.{md,json}` as the doc-to-feature pathmap for quick multi-hop traversal across sourceRef, parent atlas, Neo4j, Qdrant, Redis, and offline-processing surfaces.
