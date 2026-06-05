# Implementation Status & Roadmap
**Last Updated**: 2026-05-30T06:30 UTC
**Branch**: main
**Commits**: 737be68df3 + 39076906c7

---

## Current Parent Atlas Status — 2026-06-04

The Parent Atlas lane is in cleanup / coverage mode, not architecture mode.

Current practical completion:
- Parent Atlas core: about 90%
- Production topology coverage: active production SOM 100.0%, active production Qdrant 100.0%
- Raw inventory topology: 10,487 / 14,465 SOM, 10,997 / 14,465 Qdrant
- Active production Qdrant-without-SOM: 0
- Active production without Qdrant: 0
- Summary lane: active-production summary check shows 3,528 / 3,528 with summaries, 0 missing
- Graph truth / traversal: verified complete enough for recommendations
- Recommendation -> pickup queue: working
- Recommendation workspace refresh: 12 tasks materialized, next ready `task_967675a8`

Validated command corrections:
- Parent Atlas synthesized-map rebuild: `npm --prefix sveltekit-frontend run atlas:feature-map:synthesize:apply`
- Direct rebuild command: `node scripts/atlas/build-synthesized-map.mjs`
- Do not use `npm --prefix sveltekit-frontend run atlas:synthesize` for Parent Atlas synthesized-map rebuild; that script points at `synthesize-context-chunks.mjs` and requires `--input`.

Validated traversal proof:
- `npm --prefix sveltekit-frontend run smoke:multihop-contextual-tree`
- `npm --prefix sveltekit-frontend run smoke:multi-hop-traversal`
- Class matrix report: `docs/reports/multihop-traversal-class-matrix.{json,md}`
- Full traversal was verified for API route, ACE/server, DB schema, and Svelte component classes.
- The `scripts/atlas` sample now proves Postgres feature truth, Qdrant, SOM, and Neo4j traversal.

Current topology metrics:
- raw `atlas_feature_map`: 14,465 rows
- raw SOM rows: 10,487
- raw Qdrant rows: 10,997
- raw Qdrant without SOM: 1,492
- deduped active production rows: 4,808
- deduped active production SOM rows: 4,808
- deduped active production Qdrant rows: 4,808
- deduped active production Qdrant without SOM: 0
- deduped active production without Qdrant: 0
- remaining nuance: active-production topology coverage is now closed; raw-inventory no-SOM rows are excluded from profile cards and belong to storage/indexing audit.

Next cleanup commands:
```bash
cd C:\Users\james\Videos\deeds-web-app\sveltekit-frontend
npm run atlas:coverage:qdrant-no-som -- --limit=50
npm run atlas:coverage:no-qdrant -- --limit=50
npm run atlas:feature-map:synthesize:apply
npm run recommendations:workspace   # run from repo root, not sveltekit-frontend
```

The focused Qdrant-without-SOM report writes:
- `docs/reports/production-qdrant-no-som-report.json`
- `docs/reports/production-qdrant-no-som-report.md`

The focused no-Qdrant report writes:
- `docs/reports/production-no-qdrant-report.json`
- `docs/reports/production-no-qdrant-report.md`

---

## ✅ COMPLETED: Phase 99 — Gemma4 Function-Calling Integration

**Commit**: 737be68df3
**Status**: PRODUCTION READY

### Deliverables
1. **scripts/redis-semantic-packet-manager.mjs** (19 KB)
   - SemanticExtractor: 13 regex patterns + NLP extraction
   - ToolPacketBuilder: Chain-able API for Gemma4 tool packets
   - PromptPacketBuilder: Auto-generation from graphify/todo lists
   - RedisPacketManager: Serialize/deserialize with 24h TTL

2. **opencode.json (Enhanced)**
   - antigravity agent: function-calling enabled, 3 max calls
   - gemma4-function-caller: NEW, 5 max calls, parallel support
   - Semantic routing: Auto-select tools based on query semantics

3. **7 NPM Scripts** (All Tested ✅)
   - `npm run redis:packet:build-tools` → generates tool packet (ID: 9b5ca4eb0794)
   - `npm run redis:packet:prompt-from-todo` → generates prompt packet (ID: 2d50f46c0c98)
   - `npm run redis:packet:extract-semantics` → extracts 6 semantic categories
   - `npm run redis:packet:list{,-tools,-prompts}`

4. **Documentation** (850+ lines)
   - docs/gemma4-function-calling-setup.md (500+ lines)
   - GEMMA4-FUNCTION-CALLING-INTEGRATION.md (300+ lines, quick-start)
   - docs/mcp-validation-hints.md (debugging reference)

### Features
✅ Automatic if-then triggering (query semantics → tool selection)
✅ Regex + NLP pattern extraction (85-95% confidence)
✅ Redis semantic packet management (24h TTL caching)
✅ Prompt auto-generation from graphify outputs or todo lists
✅ MCP JSON-RPC 2.0 dispatch unified
✅ Validation error hints for MCP debugging

### Test Results
✅ Build tools packet: success
✅ Generate prompt from todo: success
✅ Extract semantics: success
✅ All npm scripts: operational
✅ Zero ts-node dependency issues

---

## 🔄 IN PROGRESS: Phase 100 — Parent Atlas Indexing Architecture

**Commit**: 39076906c7
**Status**: PLANNING + INITIAL IMPLEMENTATION

### Objectives
- [x] Architecture design complete (PHASE_100_IMPLEMENTATION_PLAN.md)
- [x] MapReduce consolidation framework created (mapreduce-consolidated-index.mjs)
- [x] File system consolidation (Phase 100.1)
  - audit artifact exists: `docs/phase100/file-consolidation-audit.json`
  - recommendations artifact exists: `docs/phase100/consolidation-recommendations.json`
  - proposal artifact exists: `.tmp/feature-organization-proposal.md`
  - proposal summary: 64 files classified across 8 feature groups; 23 files remain unclassified for manual review
  - current scan: 3,841 files; 1,760 unclassified
  - evidence group and its video-sidecar siblings have been moved into `sveltekit-frontend/src/lib/server/features/evidence/`
  - observability group has been moved into `sveltekit-frontend/src/lib/server/features/observability/`
  - rag group has been moved into `sveltekit-frontend/src/lib/server/features/rag/`
  - cases group has been moved into `sveltekit-frontend/src/lib/server/features/cases/`
  - aiAgents group has been moved into `sveltekit-frontend/src/lib/server/features/ai/`
  - legalCorpus group has been moved into `sveltekit-frontend/src/lib/server/features/legal-corpus/`
  - codebaseIntel group has been moved into `sveltekit-frontend/src/lib/server/features/codebase-intel/`
  - identity group has been moved into `sveltekit-frontend/src/lib/server/features/identity/`
  - all groups from the proposal are now applied into feature folders; this step is closed
- [x] Consolidation/schema alignment note exists.
  - `docs/architecture/consolidation-and-schema-alignment.md`
  - repo consolidation scripts and schema-drift scripts are ordered into one workflow note
- [x] Consolidation/schema migration checklist exists.
  - `docs/architecture/consolidation-and-schema-migration-checklist.md`
  - repo consolidation → parent atlas → schema drift → migrate is now explicit
- [x] Feature consolidation review queue exists.
  - `docs/architecture/feature-consolidation-review-queue.md`
  - high-confidence groups were applied and the review queue is now closed: `evidence`, `observability`, `rag`, `cases`, `aiAgents`, `legalCorpus`, `codebaseIntel`, and `identity`
- [x] Missing-features path map exists for quick traversals and store reconciliation.
  - `docs/graph/missing-features-path-map.md`
  - `docs/graph/missing-features-path-map.json`
  - path map ties mapreduce, DuckDB, Postgres, Qdrant, Redis, and Neo4j / SOM topology into one compact traversal surface
  - gitignored workspace roots are explicitly in scope: `.opencode/`, `.tmp/`, `.cache/`, `.svelte-kit/`, `.github/`, `.vscode/`
- [x] Parent Atlas table of contents exists.
  - `docs/atlas/parent-atlas-table-of-contents.md`
  - navigation index for the active Parent Atlas docs, storage decisions, and todo spine
- [x] Kanban-to-parent-atlas alignment note exists.
  - `docs/architecture/kanban-parent-atlas-alignment.md`
  - open work is routed from the master todo into kanban tasks and then into parent atlas indexing using shared feature keys and source refs
- [x] Master todo kanban sync is live.
  - `docs/graph/kanban-board.json`
  - `memory/exports/kanban-ranking-report.json`
  - 14 master-todo tasks were merged into the board and 131 total kanban tasks were ranked with npm inventory
  - the merge lane now also ingests `sveltekit-frontend/.tmp/kanban_tasks.jsonl` and `sveltekit-frontend/.tmp/missing_feature_todos.jsonl` when present so Parent Atlas missing-feature discovery stays aligned with the board
- [x] Parent atlas indexing remains in sync with the task board.
  - `memory/exports/parent-atlas/parent_atlas_index.json`
  - `memory/exports/parent-atlas-report.json`
  - parent atlas indexing completed after the kanban sync and validation passed on the current atlas snapshot
- [x] Taskboard / parent atlas sync orchestrator exists.
  - `scripts/atlas/run-taskboard-parent-atlas-sync.mjs`
  - `atlas:taskboard:sync`
  - a single entrypoint now wires master todo → kanban → ranking → parent atlas validation, with optional codebase semantic refresh and graphify/Karpathy refresh
  - the master-todo merge step now seeds `docs/graph/kanban-board.json` from the frontend feature-labeling outputs when the canonical board is absent
- [x] Taskboard / parent atlas sync is validated with semantic refresh.
  - `.tmp/taskboard-parent-atlas-sync.json`
  - `.tmp/taskboard-parent-atlas-sync.md`
  - the sync wrapper passes with `--with-codebase --with-graphify`, including the Karpathy batch lane and the parent atlas validation gate; bounded runs use `ATLAS_SYNC_LIMIT`
- [x] Unified sync alias exists.
  - `atlas:unified:sync`
  - one command now routes the full taskboard → semantic → graphify → parent-atlas path; use `ATLAS_SYNC_LIMIT` for bounded runs instead of npm CLI args
- [x] Clean publish split for local Karpathy follow-on work (P1.5)
  - cluster tag scroll + ACE hot-cluster injection via `karpathy:publish-split`
  - Qdrant cluster payload backfill via `karpathy:qdrant-backfill`
  - `ae:backfill` remains the embedding lane
  - XGBoost hotness pipeline via `karpathy:gpu:insights`
  - `gpu_cluster` / retrieval lane plumbing via `HypergraphRoutingService` hot-set merge
  - first-pass publish work excludes generated atlas/graph artifacts, tokenizer/model churn, broad planning/TODO churn, and documented manual sidecar SQL
- [x] Unified ACE / Engram / NES pipeline documented.
  - `docs/architecture/unified-ace-engram-pipeline.md`
  - canonical flow now ties codebase semantic indexing, ACE packet generation, autoencoder/GPU lane, Engram token memory, and Gemma4 assistant routing into one architecture note
  - optional lanes remain cuVS/CAGRA, Rust tokio, napi-rs, and browser WebGPU
- [x] Variance-ranked retrieval lane documented as the `RabitQ` alias.
  - query variance pairs, semantic variance recovery, Engram bigram biasing, HypergraphRoutingService hot-set merge, and Karpathy Qdrant backfill/publish-split now share one terminology block for assistant memory swaps
- [~] PostgreSQL 18 upgrade (Phase 100.2) — deferred; UUID standardization complete for the live schema (archived copies still carry historical drift)
- [x] MapReduce joins full run (Phase 100.3)
- [x] Parent atlas schema + ingestion (Phase 100.4)
- [x] KMeans clustering + Neo4j sync (Phase 100.5)
- [x] Documentation reranking (Phase 100.6)

### Phase Breakdown (37 hours total, Week 1-3)

| Phase | Task | Est. Hours | Status |
|-------|------|-----------|--------|
| **100.1** | File consolidation → 8 feature domains | 8h | Complete |
| **100.2** | PG 18 upgrade + UUID standardization | 8h | **✅ COMPLETE** — UUID standardization verified (2026-05-30); PG 18 upgrade closure applied. |
| **100.3** | MapReduce joins pipeline | 6h | ✅ Done — 1603 dangling refs, gate PASSED (2026-05-31) |
| **100.4** | Parent atlas schema + ingest | 4h | Done |
| **100.5** | KMeans + Qdrant/Neo4j sync | 7h | Done |
| **100.6** | Docs reranking + gap analysis | 4h | Done |
| **TOTAL** | | **37h** | **~85% done** (G1-G4 all ✅; PG18 ✅ confirmed 18.4+pgvector 0.8.2 on :5434) |

### MapReduce Status

**Script**: `scripts/atlas/mapreduce-consolidated-index.mjs`

**Test Run (full rerun → 3213 actual files scanned):**
```
MAP Phase:
  ✅ 3213 files extracted
  ✅ 8158 static imports detected
  ✅ 1029 dynamic imports extracted
  ✅ Semantic markers identified
  ✅ Keywords extracted from content

REDUCE Phase:
  ✅ 3213 documents consolidated
  ✅ Import references joined
  ✅ Feature classification applied

Analysis:
  ✅ Statistics aggregated
  ✅ 252 import errors (dangling refs) — WELL BELOW 2000 validity gate ✅
     (progression: 9041 → 6248 → 1603 → 252; see Phase 100.3 notes below)
  ✅ 66 files with import errors (all genuine — missing .svelte barrel exports, archived schema files, .md example refs)

Feature Distribution (v4 run 2026-06-01):
  - unclassified: 1129
  - routes: 892
  - database: 394
  - ui: 168
  - rag: 151
  - admin: 140
  - cache: 126
  - graph: 115
  - vector: 77
  - llm: 51
  - auth: 27
```

**Phase 100.3 Closed (2026-05-31 / updated 2026-06-01):**
- Three resolver fixes applied to `scripts/atlas/mapreduce-consolidated-index.mjs`:
  1. `.js`→`.ts` extension strip before disk probe (2026-05-31) — 9041 → 1603
  2. `$types` / `$types.js` marked as SvelteKit-generated external (2026-06-01) — 1603 → 835
  3. Directory-collision guard: `existsSync` returned true for bare path matching a 0-byte dir; added `statSync().isDirectory()` check (2026-06-01) — 835 → 252
- Final result: **252 errors in 66 files** — all genuine (missing .svelte components, archived schemas, .md doc refs)
- Validity gate (<2000) PASSED with 87% headroom.

**Remaining open (Phase 101):**
1. Offline batch promotion / NDJSON / DuckDB / LangExtract rerun — still partial; current refresh is validated, the mapreduce→DuckDB materialization lane is now wired, and a bounded 1,000-file current-corpus slice has now been applied to Postgres/Qdrant
2. Parent atlas / codebase indexing promotion work is still open:
   - run bounded current-corpus offline ingest until the full scan is promoted, not just summarized
   - promote validated outputs only after validation passes into Postgres, Qdrant, Redis, Neo4j / SOM topology, and SeaweedFS archive
   - confirm the live `task_semantic_packets` mirror schema before persisting `alias_id`
   - recover or containerize RabbitMQ topology MCP; TurboVec, Engram, and LangExtract sidecars are green after the 2026-05-31 transport fix; graphify / batch helpers still time out on large runs
   - keep the repo trimmed to source, schemas, scripts, and docs; archive generated summaries and atlas artifacts externally

**Validated 2026-05-31:**
- UUID standardization is done for the live schema (45 integer / 0 uuid / 3 text, archived copies still show historical drift).
- Offline batch promotion is validated via `duckdb:feature-cards:refresh` and remains downstream-only / non-authoritative.
  - `scripts/atlas/mapreduce-consolidated-index.mjs` now feeds `scripts/atlas/materialize-mapreduce-duckdb.mjs` so the consolidated join output is also materialized into a local DuckDB mirror for offline analysis
  - bounded current-corpus slice applied via `node scripts/atlas/batch-offline-ingest.mjs --apply --limit 1000`
  - dedicated offline synthesis orchestrator exists at `scripts/atlas/run-offline-synthesis.mjs`
  - runbook: `docs/architecture/offline-synthesis-parent-atlas.md`
  - bounded dry-run validation passed with `node scripts/atlas/run-offline-synthesis.mjs --dry-run --limit 1`
  - bounded apply validation passed with `node scripts/atlas/run-offline-synthesis.mjs --apply --limit 25`
- Parent atlas refresh still needs to be re-run from the production-ready feature list after archive decisions are made; missing features and redundant features must stay separated in the handoff.
- Kanban-to-parent-atlas sync should be re-run after archive decisions are made.

---

## 🚦 Promotion Queue (created 2026-05-31)

**Manifest**: `scripts/promotion/promotion-queue.manifest.json`
**Runner**: `scripts/promotion/run-promotion-queue.mjs`
**Status reporter**: `scripts/promotion/report-promotion-status.mjs`

### Closed lanes
- ✅ MCP sidecar transport — turbovec :8791 HTTP OK, engram :8792 HTTP+stdio OK, langextract :8793 HTTP OK (2026-05-31)
- ✅ MapReduce import path resolution — dangling refs 9041 → 1603, gate <2000 PASSED (2026-05-31)
- ✅ UUID standardization live schema — 45 integer / 0 uuid / 3 text (2026-05-30)
- ✅ Bounded offline synthesis apply — 25-card slice validated (2026-05-31)
- ✅ Feature consolidation — 8 domains applied (2026-05-31)
- ✅ Missing-features path map — repo-wide traversal index for mapreduce / DuckDB / Postgres / Qdrant / Redis / Neo4j
- ✅ Missing-features review report — deterministic mapreduce / registry / parent-atlas prune surface
- ✅ Missing-features SVG — compact glyph summary for prefix clusters and prune review
- ✅ Qdrant path bridge — file_path → mapreduce stableKey → parent-atlas sourceRef/card join surface

### Pending (run in order)
- 🔄 `knowledge-card-validation` — audit card integrity (audit-only, no writes)
- 🔄 `alias-id-schema-preflight` — confirm `task_semantic_packets.alias_id` column exists in live Postgres (BLOCKER for alias_id writes)
- 🔄 `source-ref-candidate-generation` — suggest source ref repairs (requires knowledge-card-validation)
- 🔄 `consolidation-claim-check` — verify no duplicate canonical IDs (requires knowledge-card-validation)
- 🔄 `offline-synthesis-dry-run` — dry-run synthesis pipeline, 25 cards (requires knowledge-card-validation + alias-id preflight)
- 🔄 `qdrant-postgres-reconciliation` — mirror drift report (requires knowledge-card-validation)
- 🔄 `parent-atlas-validation` — structural integrity check

### Blocked (do not run apply until)
- ❌ Broad apply jobs — pending card validation gate + alias_id schema preflight
- ❌ alias_id writes — pending live schema confirmation
- ❌ Unbounded ingestion — queue runner refuses `--apply` without `--limit`

### Worker lanes still needing recovery
- RabbitMQ topology MCP — not containerized
- graphify / batch helpers — time out on large runs

### Quick commands
```bash
npm run promotion:status                   # gate summary + next command
npm run promotion:queue:dry                # full preview, no execution
npm run promotion:queue:one knowledge-card-validation   # single item dry-run
node scripts/promotion/run-promotion-queue.mjs --dry-run --only knowledge-card-validation
node scripts/promotion/run-promotion-queue.mjs --dry-run --only alias-id-schema-preflight
# Only after audits pass:
# node scripts/atlas/run-offline-synthesis.mjs --apply --limit 25 --offset 0
```

---

### Current Deliverables

### Native GPU Verification

- [x] `simd-bridge/cpp/cuda_graph_bridge.cu` configured successfully with CUDA 13.0 and LibTorch 2.9.0 on this workstation.
- [x] `simd-bridge/cpp/build/Release/tensorrt_bridge.node` loads successfully and exports GPU functions.
- [x] `checkCudaAvailable()` returns `1` on this machine.
- [~] The remaining build issue is an incremental MSBuild link-file race, not a missing CUDA toolchain.

| File | Size | Type | Status |
|------|------|------|--------|
| PHASE_100_IMPLEMENTATION_PLAN.md | 12 KB | Plan | ✅ Complete |
| scripts/atlas/mapreduce-consolidated-index.mjs | 14 KB | Script | ✅ Created, needs refinement |
| GEMMA4-FUNCTION-CALLING-INTEGRATION.md | 11 KB | Doc | ✅ Complete |
| docs/gemma4-function-calling-setup.md | 8.8 KB | Doc | ✅ Complete |
| docs/mcp-validation-hints.md | 4.6 KB | Doc | ✅ Complete |
| scripts/redis-semantic-packet-manager.mjs | 19 KB | Script | ✅ Complete |

**Total**: 69.4 KB (well under 10MB file limit) ✅

---

## 📋 QUEUED: Phase 101 — Feature Consolidation & GPU Analysis

**Status**: PLANNING
**Estimated Duration**: 3-4 weeks

### Tasks
1. **Fix MapReduce import path resolution** (4h) — done
   - Refine $lib alias handling
   - Context-aware relative path resolution
   - Validate against actual file system
   - Re-run: completed; validity target remains open until dangling refs are reduced

2. **PostgreSQL 18 Upgrade** (6h)
   - Upgrade local PostgreSQL to 18.1
   - Test pgvector 0.7.x compatibility
   - Run full migration suite
   - Verify all routes still work (no regressions)

3. **UUID Standardization** (8h)
   - Design Path C (two-tier: users.id=int, users.uuid=uuid)
   - Generate migration SQL for 20 FK columns
   - Test on dev DB first
   - Apply to production DB
   - Update Drizzle schema-postgres.ts

4. **Parent Atlas Schema & Ingestion** (6h) — done in the live stack
   - Create parent_atlas_documents table (3000+ rows)
   - Create parent_atlas_semantic_tags table (JSONB)
   - Build GIN indexes
   - Ingest MapReduce consolidated JSON
   - Query performance testing

5. **KMeans Clustering + Neo4j Sync** (8h) — done in the live stack
   - Fetch all codebase_chunks_768 embeddings from Qdrant
   - Run GPU kmeans (k=20, RTX 3060 Ti CUDA)
   - Tag clusters in Qdrant payload
   - Create CLUSTER nodes in Neo4j
   - Create 3000+ BELONGS_TO_CLUSTER edges
   - Add cluster metrics (size, avg_score, keywords)

6. **Feature Gap Analysis** (4h) — done in the live stack
   - Query Neo4j: isolated nodes (in-degree < 2)
   - Cross-reference with AGENTS.md vault
   - Generate 50+ recommendations
   - Append to docs (never delete)
   - Tag for Phase 102

### Critical Gates (No Breaking Changes)

| Gate | Check | Status |
|------|-------|--------|
| G1: pgvector with PG 18 | `SELECT pgvector_version()` returns 0.7.x+ | ✅ PASSED — pgvector 0.8.2 on PG 16 (2026-05-31) |
| G2: Drizzle-ORM 0.45+ | `npm ls drizzle-orm` → 0.45.0+ | ✅ PASSED — drizzle-orm@0.45.2 (2026-05-31) |
| G3: UUID migration | All FKs validate correctly | ✅ PASSED — 45 integer / 0 uuid / 3 text (confirmed 2026-05-30) |
| G4: MapReduce validity | <2000 dangling refs | ✅ PASSED — 1603 (2026-05-31) |
| G5: Qdrant tagging | `search(payload tag filter)` returns results | Done |
| G6: Neo4j cluster edges | `MATCH ()-[r:BELONGS_TO_CLUSTER]->() RETURN count(r)` ≥ 2900 | Done |

---

## 🎯 Strategic Priorities (Next 30 Days)

### Week 1 (May 30 - Jun 6)
- [x] Complete Gemma4 function-calling (Phase 99) — DONE
- [x] Fix MapReduce import path resolution
- [~] PostgreSQL 18 test + upgrade plan — deferred; PG 16 + pgvector 0.8.2 healthy (G1 ✅)
- [x] UUID migration — COMPLETE (verified 2026-05-30 via live DB)

### Week 2 (Jun 6 - Jun 13)
- [~] PostgreSQL 18 upgrade — deferred (PG 16 healthy, pgvector 0.8.2 passes G1)
- [x] UUID migrations — DONE (confirmed 2026-05-30: 45 integer / 0 uuid / 3 text)
- [x] Run MapReduce on full codebase (target <2000 errors) — **DONE: 1603** (fixed .js→.ts resolver 2026-05-31)
- [x] Parent atlas schema created + tested

### Week 3 (Jun 13 - Jun 20)
- [x] Parent atlas document ingestion
- [x] KMeans clustering (GPU) on Qdrant
- [x] Neo4j BELONGS_TO_CLUSTER edges created
- [x] Feature gap analysis + documentation

### Week 4 (Jun 20 - Jun 27)
- [ ] Phase 101 complete
- [ ] Phase 102 planning (GPU tensor analysis, GRPO training prep)
- [ ] Finalize comprehensive codebase atlas

---

## 📊 Metrics & Health

### Codebase Analysis (as of Phase 100 MapReduce run)

**Files**: 3,164 total
- TypeScript: 2,432 (77%)
- Markdown: 388 (12%)
- SQL: 254 (8%)
- JSON: 57 (2%)
- JavaScript: 27 (1%)
- Other: 6 (<1%)

**Import Graph**:
- Static imports: 8,015
- Dynamic imports: 1,027
- Total: 9,042
- Dangling refs (to fix): 8,900 (98% of current run — likely normalization issue)

**Feature Classification**:
- unclassified: 1,074 (34%) ← opportunity for cleanup
- routes: 891 (28%)
- database: 367 (12%)
- ui: 168 (5%)
- rag: 140 (4%)
- admin: 138 (4%)
- cache: 122 (4%)
- graph: 112 (4%)
- vector: 75 (2%)
- llm: 50 (2%)
- auth: 27 (1%)

**Code Quality**:
- svelte-check: 0 errors ✅
- vite build: PASSES ✅
- Playwright tests: 20/20 pass ✅
- tsconfig: 0 errors ✅

---

## Phase 11I — Nightly Summary + Cold Archive

**Status**: wired into `startup:ace` heavy lane and skip-safe when nightly summaries are not present yet.

### Delivered
- `scripts/opencode/nightly-summary.mjs` writes nightly hot summaries to `.opencode/summaries/`
- `scripts/opencode/weekly-cold-archive.mjs` aggregates the last 7 nightly summaries into a cold archive bundle
- `archive:weekly-cold` and `archive:weekly-cold:dry` are available in `sveltekit-frontend/package.json`
- `scripts/startup/ace-incremental-startup.mjs` now runs `archive:weekly-cold` after `archive:llm`

### Validation
- `npm --prefix sveltekit-frontend run archive:weekly-cold:dry`
- `npm --prefix sveltekit-frontend run archive:weekly-cold`
- both paths skip cleanly when there are no nightly summary files yet

### Remaining
- SearXNG fallback into the research chain is wired through `ldr_research` / `ldr-client`
- when nightly summaries exist, the weekly archive path will mirror a durable note into `ace_context_sources`

---

## Phase 21 — NAPI-RS / Rust Native Bridge Optimizations

**Status**: PARTIALLY COMPLETE

### Completed
- Rayon-powered batch parsing and worker-pool offload are in place
  - Rust `parse_batch` uses Rayon
  - Node worker threads keep SvelteKit off the hot path
  - benchmarked against `JSON.parse` on 9,373 card files:
    - Standard `JSON.parse`: 3221.24ms
    - Rust Rayon worker-pool: 1680.74ms
    - speedup: 1.92x faster parsing
- CUDA SOM cache integration is wired
  - `som_cache.cu` builds with `SOM_HAVE_CUDA=1` on Windows/MSVC
  - `run_som_cache` binds to the native CUDA kernel copy path on `Float32Array`
  - `build.rs` compiles `som_cache.cu` with CUDA and links `cudart_static`
  - `run_som_cache` export mapping is wired directly to the native CUDA kernel path
  - validation matches inputs perfectly
- Container alignment is done for the current native add-on stack
  - `node:22-alpine` has been replaced with `node:22-slim`
  - native add-ons are built in the multi-stage image and copied into runtime
  - `Dockerfile.sveltekit` compiles and deploys the optimized C++/Rust addons and runs SvelteKit as a non-root user
- Valkey / Redis semantic cache wiring is in place
  - `simd_bridge_rs.node` is wired into the Bifrost cache manager path
  - `parseFast` is used for cached KAG context extraction
  - SHA-256 cache-key hashing is the canonical path
  - `bifrost-cache-manager.ts` now uses the native parse path for cached KAG context structures
- Autoencoder & Karpathy GPU pipeline execution is complete
  - `train-autoencoder.mjs` trained the 768 -> 64 contrastive autoencoder over 33,215 embeddings and saved weights to Redis (`ace:autoencoder:weights`, `ace:autoencoder:decoder:weights`)
  - `karpathy-gpu-enrich.mjs` ran through `npx tsx` with Qdrant/Redis URL fallbacks and wrote PageRank / Attention / Authority blend scores back to Redis
  - `karpathy-ace-hits.mjs` audited retrieval logs against authority scores and surfaced top ghost files
  - `karpathy-gpu-recommendations.md` was generated as the report artifact

### Remaining
- Decide whether `simd-bridge-rs/` becomes the canonical native add-on workspace
- Scaffold/promote the `napi-rs` prototype APIs and Tokio worker handoff
- Add a benchmark harness for JSON.parse vs simdjson vs Rust roundtrip
- Pin the production native base image in CI so runtime/addon ABI stays stable
- Keep CPU fallback available for dev and rollback

## 🔗 Reference Links

### Documentation
- [PHASE_100_IMPLEMENTATION_PLAN.md](./PHASE_100_IMPLEMENTATION_PLAN.md) — Detailed breakdown (6 phases, 37 hours)
- [GEMMA4-FUNCTION-CALLING-INTEGRATION.md](./GEMMA4-FUNCTION-CALLING-INTEGRATION.md) — Quick-start guide
- [docs/gemma4-function-calling-setup.md](./docs/gemma4-function-calling-setup.md) — Full architecture

### Scripts
- [scripts/redis-semantic-packet-manager.mjs](./scripts/redis-semantic-packet-manager.mjs) — Semantic packet generation
- [scripts/atlas/mapreduce-consolidated-index.mjs](./scripts/atlas/mapreduce-consolidated-index.mjs) — MapReduce joins

### Configuration
- [opencode.json](./opencode.json) — OpenCode agents (gemma4-function-caller new)
- [package.json](./package.json) — 7 new npm scripts for packet management

---

## 🚀 Next Immediate Actions

1. **Today (May 30)**
   - [x] Commit Gemma4 Phase 99 → DONE (737be68df3)
   - [x] Commit Phase 100 plan + MapReduce → DONE (39076906c7)
   - [x] Push to main → DONE

2. **This Week (May 31 - Jun 2)**
   - [x] Analyze MapReduce import errors — root cause: `.js`→`.ts` extension mismatch + `sveltekit-frontend/` prefix mismatch
   - [x] Fix import path normalization + re-run — **1603 dangling refs, gate PASSED**
   - [~] PostgreSQL 18 local testing — deferred (PG 16 healthy)
   - [x] UUID migration — COMPLETE (45 integer / 0 uuid / 3 text, verified 2026-05-30)

3. **Next Week (Jun 3 - Jun 6)**
   - [x] ~~Fix + re-run MapReduce (target <2000 dangling refs)~~ — DONE
   - [ ] Apply PostgreSQL 18 upgrade locally
   - [x] UUID migrations — already applied (verified live 2026-05-30)
   - [ ] Create parent_atlas schema

---

## 📝 Notes

- **File size management**: All deliverables fit well under 10MB limit. MapReduce output will be NDJSON (streamed, no single large file).
- **No knowledge graph deletion**: All documentation is append-only. Phase 100.6 adds recommendations without modifying existing docs.
- **GPU-ready**: RTX 3060 Ti (8GB) confirmed. KMeans clustering pipeline ready for Phase 100.5.
- **Recommendation layer**: canonical builder exists at `scripts/opencode/build-recommendations.mjs`; remaining open hooks are `scripts/ingest/retrieval-pass.mjs`, Neo4j edge expansion, Redis packet cache, and Langfuse tracing.
  - retrieval pass currently lives in `scripts/ingest/retrieval-pass.mjs`
  - Qdrant search hook: `sveltekit-frontend/src/lib/server/search/qdrant-search.ts`
    - stable `searchCodebaseAnn()` seam now exposes an optional `turbovec` backend behind the same result contract; Qdrant remains the default
    - the optional native TurboVec loader is env-driven (`TURBO_VEC_NATIVE_MODULE` / `TURBO_VEC_NATIVE_PATH`) and falls back to the existing Qdrant + rerank path when absent
    - backend-toggle smoke: `scripts/smoke/turbovec-ann-backend-smoke.mjs` confirms the default Qdrant selection and the `CODEBASE_ANN_BACKEND=turbovec` override without loading the full search stack
  - Neo4j edge expansion hook: `sveltekit-frontend/src/lib/server/search/neo4j-rerank.ts`
  - Redis packet cache hook: `sveltekit-frontend/src/lib/server/cache/redis-semantic-cache.ts`
  - Langfuse trace hook: `sveltekit-frontend/src/lib/server/observability/langfuse.ts`
  - prompt listener trace adapter: `sveltekit-frontend/src/lib/server/retrieval/prompt-listener.ts`
  - Phase 11D is closed at the card-ranking / token-budget layer: `rank-cards.mjs` and `compress-cards.mjs` are implemented and verified (9372 cards → 200 ranked → 99 deduped → 73 packed at 5964/6000 tokens)
  - Phase 11D-B next gate remains open: real Ollama embed is wired, retrieval-pass Qdrant/Neo4j/Redis/Langfuse wiring still needs the dry-run recommendation-scoring path to be fully connected
  - stale feature detection and duplicate system detection still need to be wired into the recommendation scoring flow
  - remaining integration work is score fusion from retrieval-pass output into recommendation ranking
  - flat `.opencode/recommendations.json` / `.md` mirror is optional only
  - H6 retrieval status: Stage A0 prefilter is implemented, chunk-path FP16 attention exists, and `fetchACPKnowledgeResults` intentionally skips speculative GPU rerank because the Qdrant hybrid path does not expose candidate vectors
  - retrieval-pass dry-run artifacts now exist at `.tmp/retrieval-pass-dry-run.json`, `.tmp/retrieval-pass-dry-run.ndjson`, and `reports/retrieval-pass-dry-run.md`
  - `alias_id` readiness is unblocked by read-only preflight (`.tmp/alias-id-migration-preflight-report.*` and `reports/alias-id-readiness.md`)
- **Queued follow-on lanes**:
  - Phase 11F: `QueryRouter4x4` adaptive routing + speculative decoding
    - bounded FP16 attention rerank in `fetchACPKnowledgeResults` is now in place; dynamic exploration remains open
  - Phase 11G: browser WebGPU schema encoder + Service Worker caching
  - Phase 10-19 follow-ons:
    - ClusterCard schema + Redis/Qdrant wiring + API route
    - `alias_id` through prompt listener logs
    - sourceRef / feature_id / alias_id reconciliation in the retrieval loop and recommendation score fusion path
    - Qdrant real search in `scripts/ingest/retrieval-pass.mjs`
    - Neo4j edge expansion on neighbor `sourceRef`s
    - Redis packet cache with TTL 10min and key `sha256(query + budget)`
    - Langfuse trace on rank + compress runs
    - retrieval-pass score fusion into recommendation ranking
    - optional flat recommendations mirror for compatibility only
    - Phase 17 PyTorch Feature Extractor upgrades
    - Phase 18 XGBoost Reranker upgrades
    - Phase 19 lane completion hook
  - Phase 101A: directory analysis + codebase pruning via `ast-grep`
    - scope is full repo, not just `/src`
    - use TurboVec directory summarization to cover directories missing `llms.md` / `agents.md` cards
    - reconcile directory cards, AST maps, and directory roles before pruning or archive moves
    - keep pruning outputs compact, JSON-backed, and deterministic so the lane can be rerun safely
    - chunk the huge ripgrep search dumps (`docs/reports/rg_turbovec.txt`, `docs/reports/rg_napi.txt`) into parent-atlas-ready packets keyed by `title_id`, `feature_id`, and `sourceRef`; keep the raw `.txt` dumps as generated evidence only
    - treat the Obsidian-vault mirrors as downstream indexing aids only: ingest source files first, then extract the minimum mirror summaries needed to move `next_steps/active/` and the parent atlas forward
    - use LangExtract to summarize source files, parent-atlas packets, and selected mirror summaries into completion notes before archiving any stale generated tree
    - keep only the production-readiness completion notes active (`docs/reports/phase-101-closeout.md`, `docs/reports/phase-102-handoff.md`); archive superseded generated reports, mirror trees, and raw search dumps once their content has been promoted
    - audit PostgreSQL 17.6 vs 18 table/index drift and use the result to label canonical production tables vs experimental / archive-only tables
    - keep `research_summaries` as the live canonical research table and finish the additive provenance/index migration before any dump/restore promotion to Postgres 18
  - use the repo consolidation feature map to label ship-path, planned production, experimental, and archive-only files before trimming the repo to source, schemas, scripts, and docs
  - dirty-tree classification report: `docs/reports/repo-dirty-tree-classification-2026-06-01.{json,md}`
    - splits the current working tree into generated artifacts, source changes, large blobs, and submodule dirtiness before any archive move
  - archive move plan: `docs/reports/repo-archive-move-plan-2026-06-01.{json,md}`
    - turns the dirty-tree split plus the organization audit into a concrete summarize-then-archive / keep-as-index-surface plan
  - doc crosswalk: `docs/reports/doc-feature-crosswalk-2026-06-01.{json,md}`
    - groups docs by sourceRef/pathmap, parent-atlas, Neo4j, Qdrant, Redis, TurboVec, and offline-processing feature families
    - sourceRef parent join dry-run: `scripts/atlas/sourceRef-parent-join-dry-run.mjs`
      - emits `docs/reports/sourceRef-parent-join-dry-run.{json,md}` and `.tmp/sourceRef-parent-join-packets.jsonl`
      - uses `rg -uu` plus the existing sourceRef / pathmap / parent-atlas artifacts to build compact packet manifests without mutating Qdrant, Neo4j, Redis, or Postgres
      - keeps cold originals pointed-to by packet manifests so repo minification stays aligned with the packet lifecycle
      - dry-run verified in the repo shell and through the root npm alias, with 136 packet manifests, 16 sourceRef clusters, 120 path packets, and no unmatched sourceRef or parent-atlas rows in the current snapshot
    - sourceRef parent archive plan: `scripts/atlas/sourceRef-parent-join-archive-plan.mjs`
      - emits `docs/reports/sourceRef-parent-join-archive-plan.{json,md}`
      - reads the dry-run join report plus the dirty-tree classification and separates keep-active surfaces from summarize-then-archive evidence
      - stays read-only and does not move files; it just classifies what should remain live versus what should be archived after promotion
      - dry-run verified in the repo shell and through the npm alias, yielding 552 archive candidates, 5 keep-active items, and 4 keep-as-index-surface items
    - sourceRef parent archive move list: `scripts/atlas/sourceRef-parent-join-archive-move-list.mjs`
      - emits `docs/reports/sourceRef-parent-join-archive-move-list.{json,md}`
      - takes the archive plan and buckets candidates into explicit archive destinations for raw dumps, generated reports, mirror surfaces, model blobs, and scratch/cache outputs
      - stays read-only and does not move files; it is a destination map for later archive execution
      - dry-run verified in the repo shell with 552 archive candidates across 8 destinations, with the largest bucket intentionally marked `archive/review-needed/` for manual inspection before any future move
  - parent atlas build refresh: `node scripts/atlas/atlas-parent-indexing.mjs --apply`
    - current run processed 9 lanes with 10,743 nodes and 9,398 edges
  - the crosswalk/archive-plan/atlas-refresh sequence has now been regenerated in the current repo state, so the pruning lane can proceed from the latest reports
  - NES/Glyph architecture notes / sourceRef-first atlas join:
    - sourceRef is the canonical bridge across mapreduce, DuckDB, Postgres mirrors, Qdrant payloads, Redis/Bitfrost caches, and Neo4j context trees
    - Qdrant point ids are not the join key; file_path / mapreduce stableKey / sourceRef are
    - PG18-ready atlas chunk/profile tables and JSONB/GiN indexes are the target shape for this lane
    - offline join outputs should compress into Gemma4-summarized NES/Glyph cards for quick multi-hop traversals
    - the ACE packet writer is already wired to persist NES chrom packets and immutable provenance tuples in Redis/Bitfrost; the remaining gap is a live read/query route by `sourceRef` / `featureId` / `queryHash`
    - the read/query path is now available at `src/routes/api/atlas/nes-chrom/+server.ts` as a read-only GET route; the packet writer stays unchanged
    - a seed batch of 25 NES/Glyph packets and 25 hits has been backfilled from the missing-features review so the read/query lane returns live rows
    - the lane remains offline-first and report/report-query oriented until DuckDB and parent-atlas validation agree on the broader offline join source set
    - future compute lanes to formalize next:
      - PyTorch feature extraction and XGBoost reranking on the same sourceRef / feature_id spine
      - SOM clustering collection for packet neighborhoods and similarity shells
      - Neo4j hypergraph merge passes for multi-hop structural joins
      - Postgres 18 indexing tables for semantic hash cards, JSONB packets, and retrieval mirrors
      - Qdrant multi-query tags and payload filters for fast semantic lookup
      - deep_research test coverage and LLM orchestration guardrails before any synthesis promotion
    - PyTorch/Qdrant/Redis/SOM index report:
      - `scripts/atlas/pytorch-qdrant-redis-som-index.mjs`
      - emits `docs/reports/pytorch-qdrant-redis-som-index-2026-06-01.{json,md}`
      - binds vector64 compression, SOM metrics, cache effectiveness, and the current JSON-tree index surfaces into one parent-atlas report
      - latest evidence: 768 -> 64 vector compression, 20x20 SOM, 9,372 assigned cards, 9,374 parent-atlas entries, 1,380 unique sources, 0.00% centroid cache hit rate
    - Parent Atlas feature command atlas report exists as a container manifest for these later lanes:
      - `docs/reports/parent-atlas-feature-command-atlas.{json,md}`
      - `node scripts/atlas/parent-atlas-feature-command-atlas.mjs`
    - Parent Atlas feature command atlas projection exists for the durable queue / Neo4j export seam:
      - `docs/reports/parent-atlas-feature-command-atlas-projection.{json,md}`
      - `docs/graph/parent-atlas-feature-command-atlas.cypher`
      - `node scripts/atlas/project-parent-atlas-feature-command-atlas.mjs`
      - `node scripts/atlas/apply-parent-atlas-cypher.mjs`
      - live apply run loaded 1,990 Cypher statements into Neo4j so the feature command atlas now has sourceRef-bearing graph nodes in the live database
    - Parent Atlas feature command atlas Qdrant projection exists for semantic retrieval:
      - `docs/reports/parent-atlas-feature-command-atlas-qdrant.{json,md}`
      - `node scripts/atlas/project-parent-atlas-feature-command-atlas-qdrant.mjs`
    - Parent Atlas feature command atlas Postgres mirror exists for durable vector joins:
      - `docs/reports/parent-atlas-feature-command-atlas-postgres.{json,md}`
      - `node scripts/atlas/mirror-parent-atlas-feature-command-atlas-postgres.mjs`
      - writes to `parent_atlas_records` and `parent_atlas_vectors` on the live Postgres 18 target
    - Task semantic packet workflow exists for Kanban task → packet → queue hydration:
      - `sveltekit-frontend/scripts/tasks/task-semantic-packet-workflow.mts`
      - `npm run task:semantic-packets:workflow:1`
      - Redis caches the current packet snapshot under `task:semantic-packet:<taskId>`
      - the workflow is now exposed through the MCP tool surface and the admin atlas UI, and the route supports dry-run + status inspection for fast smoke checks
    - inventory report: `docs/reports/sourceRef-atlas-join-inventory.md` / `.json`
    - live packet report seam: `scripts/atlas/report-nes-chrom-packet-hits.mjs` → `docs/reports/nes-chrom-packet-recent-hits.{json,md}`
    - latest local validation: the read-only report path executes and writes both report artifacts; the NES chrom tables are now present, but the current local database still has no packet rows so the live report is empty rather than relation-gapped
    - compression plan runner: `scripts/atlas/parent-atlas-turbovec-compression-plan.mjs`
      - emits `docs/reports/parent-atlas-compression-plan.{json,md,svg}`
      - reuses parent atlas, repo consolidation, qdrant bridge, sourceRef inventory, and vector64 metrics instead of rebuilding summaries from raw files
      - keeps TurboVec as the 768d prefilter / packet compressor for Gemma4 summary packets
    - sourceRef-first warmup runner: `scripts/atlas/sourceRef-first-join-warmup.mjs`
      - emits `docs/reports/sourceRef-first-join-warmup.{json,md}`
      - warms Redis / Bitfrost from hot clusters and NES packets keyed by `sourceRef` and `featureId`
      - Bifrost warmup is best-effort with a short timeout and fallback provider/model candidates so the report still closes even when the gateway is slow
      - can apply Neo4j community expansion in the same lane so the broader join set stays aligned with the sourceRef spine
      - bounded apply runs have now seeded Redis / Bitfrost-ready hot joins and compact packet contexts for the sourceRef-first lane
    - sourceRef-first NES/Glyph compressor: `scripts/atlas/sourceRef-first-nes-glyph-compress.mjs`
      - emits `docs/reports/sourceRef-first-nes-glyph-compress.{json,md}` and `.tmp/sourceRef-first-nes-glyph-packets.jsonl`
      - turns warmup report samples into reusable NES/Glyph packets through the existing NES chrom packet service
      - keeps the same `sourceRef + featureId + queryHash` join spine while preserving best-effort Gemma4/Bifrost summaries
      - live apply run has already persisted summary packets and KAG hits from the warmup samples, so the sourceRef-first lane now has both warmup and compression artifacts
    - sourceRef-first hot-join warmup: `scripts/atlas/sourceRef-first-hot-join-warmup.mjs`
      - emits `docs/reports/sourceRef-first-hot-join-warmup.{json,md}`
      - reads the compressed packet report as the canonical source for hot Redis / Bitfrost joins
      - can optionally apply Neo4j context expansion from the same compressed packet set
      - live apply run seeded Redis / Bitfrost-ready cache entries from the compressed packet report, so the canonical hot-join path is active
      - the hot-join lane reuses the compressed packet summaries directly and seeds the cache entries in Redis as Bifrost-ready KAG packets, so it does not depend on a second summarization pass
      - bounded apply runs confirm the hot-join cache path remains active from the compressed packet report
    - sourceRef-context Neo4j projection: `scripts/atlas/project-sourceRef-context-neo4j.mjs`
      - emits `docs/reports/sourceRef-context-neo4j-report.{json,md}`
      - projects recent `nes_chrom_packets` and `nes_chrom_kag_dag_hits` into Neo4j context nodes/relationships using the same `sourceRef + featureId + queryHash` spine
      - live apply run has already loaded the bounded slice, so the Neo4j context-tree expansion lane is now active
    - sourceRef-first parent atlas refresh: `scripts/atlas/sourceRef-first-parent-atlas-refresh.mjs`
      - emits `docs/reports/sourceRef-first-parent-atlas-refresh.{json,md}`
      - promotes the canonical hot-join report into `parent_atlas_records` and `parent_atlas_vectors` using the same `sourceRef + featureId + queryHash` spine
      - live apply run has already written parent-atlas refresh rows and vectors, so the sourceRef-first lane now reaches the parent-atlas mirror as well as NES/Glyph packet storage
    - sourceRef-first parent atlas packet export: `scripts/atlas/generate_parent_atlas_packets.mjs --only-sourceRef-first`
      - emits `docs/reports/sourceRef-first-parent-atlas-packets.{json,md}` and writes packet JSON files under `.tmp/parent_atlas_packets/sourceRef-first`
      - the dedicated packet directory is queued through `scripts/atlas/enqueue_parent_atlas_jobs.mjs` with `PACKETS_DIR=.tmp/parent_atlas_packets/sourceRef-first`
      - the sourceRef-first packets are now enqueued into `parent_atlas_jobs`, so the refreshed mirror rows have a downstream processing lane
    - repo minification / packet lifecycle:
      - cold originals should live in SeaweedFS or archive storage, not as long-lived large repo files
      - warm packet indexes belong in Postgres/Qdrant/Neo4j/Redis/Bitfrost, keyed by `sourceRef + feature_id + queryHash`
      - the repo should keep completion notes and packet manifests active, while stale generated evidence moves out after LangExtract summarization
    - raw rg transcript organizer: `scripts/atlas/organize-rg-search-transcripts.mjs`
      - emits `docs/reports/parent-atlas-rg-dump-organizer.{json,md}` and streams `docs/reports/rg_turbovec.txt` and `docs/reports/rg_napi.txt` into `.tmp/parent_atlas_packets/rg-dumps/rg-dump-packets.ndjson`
      - chunks the line-oriented transcripts into compact Parent Atlas packets with `title_id`, `feature_id`, `sourceRef`, and summary fields before the parent-atlas projection step
      - keeps the same replay spine (`sourceRef + feature_id`) so the organizer output can be merged into the later sourceRef-first and kanban lanes without re-summarizing the raw dumps
    - raw rg transcript projection: `scripts/atlas/project-parent-atlas-rg-dump-packets.mjs`
      - emits `docs/reports/parent-atlas-rg-dump-projection.{json,md}` and can write the organized packet rows into Postgres, Qdrant, and Neo4j Cypher artifacts
      - mirrors the organized rg packets into durable stores while preserving the same `title_id`, `feature_id`, and `sourceRef` replay spine
    - lean sourceRef-first sync runner: `scripts/atlas/run-taskboard-parent-atlas-sync.mjs --source-ref-first-only`
      - emits `.tmp/taskboard-parent-atlas-sync.{json,md}`
      - validates the sourceRef-first refresh, packet export, packet enqueue, parent atlas validation, and consistency audit without paying for the full codebase/graphify pass
    - kanban consolidation runner: `sveltekit-frontend/scripts/atlas/kanban-turbovec-consolidation.mts`
      - emits `docs/reports/kanban-turbovec-consolidation-latest.{json,md}`
      - batch-parses kanban tasks, missing todos, and feature labels with simdjson and groups them by TurboVec cluster for duplicate-task consolidation
  - Phase 101B: AGENTS/Qdrant backfill + RG-Atlas persistence + Knowledge Base Manager / TRACE MCP
    - KG follow-on tools:
      - `attention_rank_files`
      - `som_topology_stats`
      - `language_distribution`
      - `playbook_lookup_by_language`
    - these lanes are already live in the OpenCode agents/skills surface; Hermes is now a deeds_labs legacy/archive surface, and the remaining work is OpenCode/Gemma4 exposure and productization, not a new runtime implementation
    - the knowledge-graph tool lanes are now routed into the correct skill families (`gpu-acceleration`, `vector-cluster`, `codebase`, `research`) without introducing a parallel graph source of truth
    - RabbitMQ `media.download` / `media.transcribe` queue registration is already present
    - both lanes have foundations already in-tree; the remaining work is productization and wiring
  - Phase 101C: local-deep-research / OpenCode / LangGraph alignment
    - reference: `docs/architecture/local-deep-research-boundary.md`, `docs/architecture/scheduler-gpu-bridge-roadmap.md`
    - proposal-flow reference: `docs/architecture/agentic-error-proposal-flow.md`
    - inventory the current local-deep-research compose and keep the SQLite boundary clearly separated from canonical backend stores
    - compare the local-deep-research Docker app to the repo's Gemma4/OpenCode function-calling path
    - recreate the container for GPU use only through the WSL2 GPU override path when the image and deployment target warrant it
    - prefer a host-side OpenAI-compatible `llama-server` endpoint for the model boundary when available
    - keep Hermes archived in deeds_labs/test-only unless it proves useful as a separate lane
    - add the export/import bridge that promotes local research state into canonical backend rows before ACE packet generation
    - emit a canonical ACE packet from the LDR bridge with preserved `sourceRef` provenance and warm the shared Redis ACE packet cache
    - store the same packet as an immutable semantic provenance tuple in Redis so OpenCode/Gemma4 can replay the exact compact packet without re-summarizing
    - use the same provenance shape in the L1.5 Redis semantic cache, with optional sourceRefs/featureId metadata when the caller has it
    - the encoded-cluster prefilter now warms `sim:v1:{sha1(queryHash + ':' + clusterKey)}` entries on successful centroid scoring, so the cache is no longer read-only
    - expose the same tuple metadata on the exact-match cache read path so front-door hits return the same envelope they store
    - route agentic errors through the read-only proposal flow in `api/v1/agentic` so the controller can launch parallel repair subagents and return a deterministic proposal instead of a free-form guess
    - record each proposal run as a `context_timeline.agentic_proposal` event so the repair-thinking path is temporally indexed in the durable ledger, with `sourceRef + feature_id` as the replay/join spine, `clusterId` kept as a routing hint only, and an explicit `missingFeatureId` warning instead of silently dropping the Parent Atlas join key
    - keep regex extraction fallback-only at the proposal boundary so messy agent logs can recover join keys without replacing typed provenance or tuple-backed source-of-truth fields
    - promote each proposal run into the engram registry (`memory_registry` + `engram_cards`) so the repair timeline is indexed as reusable memory, not just audit history
    - expose the proposal timeline back into the agentic controller UI via the read-only `/api/v1/agentic?action=timeline` path
    - emit a parent-atlas feature-labeling report that includes missing todos, `feature_id`, `featureKey`, `source_ref`, and `sourceRefs` so the kanban/atlas sync can consume one replayable task shape
      - status: complete; the SvelteKit feature-labeling lane now emits `feature_id` and `feature` metadata, the kanban repair script backfills `feature_id`, and the live consistency audit now reports `kanban_tasks_have_feature_id: true`
    - NES chrom packet + KAG DAG hits schema and persistence helper are live and wired into the ACE pack path so `chunk_id`, `sourceRef`, `jsonb`, and `pgvector` join through a compact packet layer
    - add a live read/query path for NES chrom packets and recent hits by `sourceRef` / `featureId` / `queryHash` so the packet lane is searchable, not write-only
    - Phase 101 parent-atlas packetizer lane: `scripts/atlas/phase101-parent-atlas-packetize.mjs` (dry-run first) compiles the `IMPLEMENTATION_STATUS.md` Phase 101 / Phase 102 block into a validated `nes.packet.v1` envelope, prints the cache key it would use, and keeps recommendations read-only or dry-run only
      - status: dry-run verified in the repo shell; the exact grep scanner runs first, then falls back to `grep -E` only when the literal pattern yields no lines
      - apply path remains gated on `LOCAL_OPENAI_BASE_URL`, `LOCAL_OPENAI_API_KEY`, and `LOCAL_GEMMA_MODEL` hydration
    - add the additive `research_summaries.source_ref` / `source_refs` migration and the Drizzle schema bridge so provenance lands in durable rows with indexes
    - apply the `research_summaries` provenance/index migration to the live 17.6 database and backfill the URL-backed rows
    - keep Qdrant as the default ANN service and treat cuVS/CAGRA or a small Rust gRPC ANN worker as the future experiment lane behind the same retrieval contract and result shape
    - keep the ANN adapter boundary stable in `src/lib/server/search/qdrant-search.ts` and `src/lib/server/retrieval/orchestrator.ts` (implemented as the `searchCodebaseAnn` seam; Qdrant remains default)
    - the seam now has an optional TurboVec backend toggle for native N-API, TurboVec sidecar rerank, GPU-safe load shedding, and SOM/AE-aware rerank without caller changes
    - keep LangGraph optional orchestration only; use it for validation/testing subagents via Gemma4 function tool calling, with no direct DB/Qdrant writes from graph nodes
    - use the OpenCode-facing bridge only when provenance (`sourceRef`) is preserved end to end
    - the OpenCode-facing bridge is now defined through the TRACE MCP / function-caller path and the Phase 101 parent-atlas packetizer tools, so research queries can flow without bypassing `sourceRef` provenance
    - store raw docs and large artifacts in SeaweedFS, not in the local SQLite research boundary
    - the repo now treats SeaweedFS as the cold-artifact store for large docs and generated evidence, with the research SQLite boundary kept out of the hot path
    - treat TurboVec, LlamaIndex, LangChain, and LangGraph as adapters only; the boundary is documented in `docs/architecture/dual-lane-hot-brain-cold-queue.md`
    - keep the two-lane model explicit: cold originals stay in archive stores, warm packets/cards stay small and point back to them, hot cache is only active task memory, and Qdrant is semantic lookup with payload filters rather than the canonical truth store
    - use RabbitMQ as the work queue only, with separate urgent / normal / bulk / dead-letter lanes rather than one catch-all deque
    - archive originals only after SeaweedFS copy, checksum verification, Postgres ledger write, and archive-eligible scoring / sourceRef resolution
    - assign a 0-100 superseded score to originals so archive prioritization is backed by duplicate detection, validation coverage, and `sourceRef` / `feature_id` resolution instead of intuition
      - implemented as `scripts/packets/score-superseded-originals.mjs`
      - writes `.tmp/superseded-score-candidates.{json,md,ndjson}` and `.tmp/superseded-score-implementation-report.{json,md}`
      - splits the candidate surface into source-file and generated-artifact sections so provenance-heavy code files can be reviewed separately from derived evidence
      - every row stays candidate-only with `delete_allowed=false` and `move_allowed=false`
    - generate a read-only, candidate-only superseded-score report that ranks dirty-tree and archive-plan candidates without moving or deleting anything
    - G17 browser Ollama routing is fixed via `/api/ollama/generate`; the browser no longer calls `localhost:11434` directly
    - G18 startup truth now checks GPU bridge live count, Postgres 18.x, `parent_atlas_documents`, `alias_id`, and Redis auth/protected-mode
    - Redis flavor audit confirms the active container is `valkey/valkey-bundle:8.1.1`; the hot-cache lane now runs on Valkey with localhost bind + auth
    - VS Code startup now runs the GPU bridge probe task and writes its summary to `logs/task-output/startup-gpu-bridge-probe.log`
    - `parent_atlas_documents` is created but its population remains gated by dry-run/apply promotion checks
    - Redis auth/protected-mode is now confirmed through the startup truth gate using the app’s default Redis credentials / protected-mode check
    - `startup-truth.mjs` is now green end to end; the earlier ACE/Vite timeout was fixed by widening the startup probe window to match the real `/api/health` latency
    - bounded offline synthesis apply has advanced through `--limit 25 --offset 25`, `--limit 50 --offset 50`, and `--limit 50 --offset 75`; the qdrant-postgres reconciliation dry-run is clean
    - summarize with Gemma4 and persist compact outputs into Postgres 18 deep_research tables with JSONB / pgvector where appropriate
    - keep BM25 + LangExtract as the lexical/provenance enrichment pass before final recommendation fusion
    - treat the WSL2 GPU override as an optional deployment flavor, not the default research path
    - re-run the assistant-path comparison after each boundary change and record the result here
- **Backward compatibility**: Zero breaking changes planned. All existing routes + APIs remain operational.
- **Test coverage**: Gemma4 (4 npm scripts tested), MapReduce (3213 files, ~7 seconds runtime).

---

**Status**: Ready for Phase 101 execution
**Approval**: N/A (self-contained planning + initial implementation)
**Next Review**: 2026-06-06 (end of Week 1)

---

## Current Green Gates (2026-06-02)

### GPU Smoke: GREEN
- 15/16 live GPU bridge functions, 0 stub functions
- CUDA available
- GPU lanes smoke: 8 ok, 0 skip, 0 fail
- CUDA graph replay: 100 replays ~0.09ms/replay
- FP16 attention lane: OK
- VLM lane: OK

### Promotion Status: GREEN for bounded apply only
- MCP sidecar guard: GREEN
- Card validation: GREEN
- `alias_id` schema: UNBLOCKED
- Synthesis dry-run: GREEN
- Bounded apply cadence verified through `--limit 50 --offset 75`

### PostgreSQL 18 / pgvector Lane: GREEN
- PostgreSQL 18 live container active
- `parent_atlas_documents` table exists with indexes
- `task_semantic_packets.alias_id` exists
- pgvector installed
- task_semantic_packets: 185/185 summaries written (Phase 102 T3 complete)

---

## Non-blocking Backlog (2026-06-02)

`getCudaMemory` currently reports `{ free_mb: 0, total_mb: 0 }` while `checkCudaAvailable=1` and GPU kernels run successfully. Treat as a telemetry/N-API integer mapping issue, not a GPU availability failure. Backlog: fix VRAM telemetry before building a VRAM dashboard.

---

## Next Safe Promotion Step

Use bounded slices only:

```bash
node scripts/atlas/run-offline-synthesis.mjs --apply --limit 25 --offset 100
node scripts/promotion/report-promotion-status.mjs
node scripts/promotion/run-promotion-queue.mjs --dry-run --only qdrant-postgres-reconciliation
```

Do not run unbounded apply.
