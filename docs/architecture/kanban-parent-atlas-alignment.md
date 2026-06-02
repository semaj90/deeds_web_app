# Kanban and Parent Atlas Alignment

This note connects feature-task generation to parent atlas indexing so task
tracking and repository indexing share one dependency map.

## Order of operations

1. Derive open tasks from `MASTER-FEATURE-TODO-2026-05-20.md`.
2. Reconcile those tasks against real files, scripts, and npm commands.
3. Resolve missing feature IDs and source references.
4. Rank the tasks by architecture, testing, and completion weight.
5. Merge the ranked tasks into the kanban board.
6. Feed the same feature keys into parent atlas indexing.
7. Sync the parent atlas outputs into the atlas registry and validation lane.
8. Keep schema migration blocked until the repo move plan is approved.
9. Optionally refresh the semantic feature map and graphify/Karpathy lane first so the taskboard reflects current Qdrant, Redis, and Bitfrost-aligned signals.

Current state:

- The master todo now emits kanban tasks with `feature_id`, `featureKey`, `source_ref`, and `sourceRefs`.
- The feature-labeling lane now also emits `missing_feature_todos.jsonl` plus a parent-atlas report so missing work is visible before it reaches the board.
- The kanban merge lane now ingests the frontend feature-labeling outputs from `sveltekit-frontend/.tmp/kanban_tasks.jsonl` and `sveltekit-frontend/.tmp/missing_feature_todos.jsonl`, and seeds `docs/graph/kanban-board.json` when the board file is not present yet.
- The board merge path updates existing tasks instead of skipping them.
- The TurboVec consolidation lane now batch-parses the kanban, feature-label, and missing-todo JSONL inputs, then groups them by feature family and TurboVec cluster so duplicate open work can be collapsed before board review.
- The raw `rg_turbovec.txt` and `rg_napi.txt` transcript organizer now streams those search dumps into compact Parent Atlas packets with `title_id`, `feature_id`, `sourceRef`, and summary fields before parent atlas indexing.
- The raw transcript projection lane now mirrors those packets into Postgres/Qdrant/Neo4j artifacts so the dump-derived rows become durable and queryable, not just organized.
- The Obsidian-vault mirrors under `docs/obsidian-vault/Files/` are a derived indexing surface, not canonical source; ingest them after source files and generated packets, then use the resulting summaries to advance `next_steps/active/` without re-indexing the whole mirror tree.
- LangExtract should summarize the active source files, parent-atlas packets, and selected mirror summaries into short completion notes before any archive move; the parent atlas keeps the durable joins, while the mirror tree remains an input surface only.
- The ranked board is written to `docs/graph/kanban-board.json` and mirrored into the ranking report.
- Parent atlas indexing now ingests the current card set and validation passes after the kanban sync.
- The optional semantic refresh lane is now wired through a single orchestrator and has been validated with the graphify/Karpathy path.
- The graphify/Karpathy lane feeds the same Qdrant, Redis, and Bitfrost-aligned signals that the feature graph consumes.

## Task generation scripts

- `scripts/atlas/consolidate-master-todo-to-kanban.mjs`
  - parses the master todo and emits kanban tasks
  - resolves file and npm-script references
  - can merge into `docs/graph/kanban-board.json`
  - also ingests the frontend feature-labeling outputs (`.tmp/kanban_tasks.jsonl`, `.tmp/missing_feature_todos.jsonl`) so the kanban board stays aligned with the Parent Atlas missing-feature lane

- `scripts/atlas/resolve-kanban-gaps.mjs`
  - repairs missing `feature_id` and `source_ref` fields
  - keeps the task queue usable for ranking and atlas sync

- `scripts/atlas/rank-kanban-and-npm-inventory.mjs`
  - ranks tasks with testing and architecture weight
  - inventories npm dependencies for documentation and review planning

- `scripts/atlas/ingest-codebase-tasker.mjs`
  - turns codebase feature maps into kanban tasks
  - keeps task cards tied to real repo paths

- `scripts/atlas/feature_labelling.mjs`
  - labels source files, emits task candidates, and writes the missing-todo parent atlas report

- `scripts/atlas/generate-next-moves-report.mjs`
  - synthesizes the ranked task board into next-step recommendations

- `scripts/atlas/chr97-emit-kanban-tasks.mjs`
  - converts CHR97 outputs into kanban tasks
  - can merge the result into the board

- `scripts/atlas/run-taskboard-parent-atlas-sync.mjs`
  - orchestrates the taskboard sync and optional semantic / graphify refresh
  - keeps the parent atlas validation gate in the same execution path
  - single-command alias: `atlas:unified:sync`
  - optional limit via `ATLAS_SYNC_LIMIT=10` to avoid npm CLI arg warnings
  - optional `--with-turbovec` lane runs `npm --prefix sveltekit-frontend run atlas:kanban:turbovec-consolidation`
  - optional `--with-rg-dumps` lane runs `scripts/atlas/organize-rg-search-transcripts.mjs` to stream the raw search dumps into Parent Atlas packets
  - the same `--with-rg-dumps` lane now also runs `scripts/atlas/project-parent-atlas-rg-dump-packets.mjs` to project those packets into the durable mirrors

## Parent atlas scripts

The same feature keys then feed the parent atlas lane:

- `scripts/atlas-parent-indexing.mjs`
- `scripts/atlas/mapreduce-consolidated-index.mjs`
- `scripts/atlas/build-all-lanes-parent-atlas.mjs`
- `scripts/atlas/validate-parent-atlas.mjs`
- `scripts/atlas/audit-parent-atlas-consistency.mjs`

## Semantic / Graphify / Cache lane

When the taskboard needs a fresh semantic spine, these are the supporting lanes:

- `scripts/atlas/build-codebase-feature-map.mjs`
  - codebase semantic feature extraction
  - source for Qdrant, Redis, MCP, and route classification

- `scripts/atlas/build-feature-graph.mjs`
  - unified feature graph across Qdrant, Redis, Neo4j, ACE, and Bitfrost-like cache surfaces

- `scripts/graphify/graphify-batch-karpathy-analysis.mjs`
  - Karpathy batch synthesis over the feature graph

- `scripts/atlas/karpathy-gpu-enrich.mjs`
  - GPU authority blending for the Karpathy batch lane
  - self-contained scorer import so the lane runs under plain Node

## Shared dependency rule

- Kanban tasks are the review surface.
- Parent atlas is the indexed execution surface.
- The master todo is the source of open work.
- No schema migration should start until the move plan is approved and the
  kanban/atlas sync is stable.
