# Full Codebase Deep Audit — March 22, 2026

## Audit Methodology
- **7 parallel agents** scanning concurrently across all codebase layers
- **Transitive dependency chain tracing** (G0 gate) — not just direct imports
- **Production value scoring** — Pipeline Enhancement (0-3) + Production Use (0-3) + Existing Infra (0-3) + Uniqueness (0-3) = max 12
- **Gate system** — G0 (transitive dep?) → G1 (compiles?) → G2 (unique?) → G3 (value?) → G4 (integration point?) → G5 (effort?) → G6 (fully wired?)

---

## Executive Summary

| Layer | Files Audited | Active | Orphan/Dead | Dead % | Key Finding |
|-------|---------------|--------|-------------|--------|-------------|
| **Server TS** | 51 top-level | 29 wired + 7 transitive | 15 orphan | 29% | 5 HIGH-VALUE orphans (score 8-12) |
| **Components** | 598 | 576 (96.3%) | 22 orphan | 3.7% | 7 high-value orphans, 2 Phase 99 corrupted |
| **Workers/Machines** | 16 + 7 | 6 wired + 3 active | 7 dead + 3 orphan | 44% | RabbitMQ consumers never started |
| **API Routes** | 49 sampled | 30 wired + 3 internal | 16 orphan | 33% | error-brain depends on corrupted services |
| **JS/CJS/MJS scripts** | 199 | 7 configs | 185 dead + 4 relocate | 95% | Massive script pollution in source tree |
| **Barrel index.ts** | 72 | 25 active + 9 semi | 22 zombie | 31% | 22 barrels re-export archived components |
| **Stores .svelte.ts** | 19 | 18 active | 1 orphan | 5% | form.svelte.ts superseded by Superforms |
| **CSS/SCSS** | 21 | 3 active | 16 orphan + 2 legacy | 86% | app.postcss has 2 broken @imports |
| **HTML** | 16 | 2 active | 13 orphan | 81% | Test HTML artifacts |
| **Config files** | 35 | 15 active | 8 orphan + 8 legacy | 46% | 7 stale tsconfigs, tailwind.config.js conflict |
| **Env files** | 17 | 5 active | 5 legacy + 7 review | 29% | Phase-specific .env files |
| **SQL migrations** | ~84 | ~57 active | 14 orphan | 17% | 5 migrations with DROP statements |
| **Proto** | 66+ | 11 active | 33 root dupes + 6 empty .pb.go | 59% | Root protos duplicate archived/ |
| **Go** | 1 active + ~90 archived | 0 running | 1 semi-orphan | 100% | quic-server.go cannot build |
| **C++/CUDA** | 13 source + 6 build | 12 active | 1 dead (main.cu) | 7% | SIMD bridge fully wired, 10 GPU functions |
| **TOTAL** | **~1,260+** | **~800** | **~430** | **~34%** | |

---

## TIER 0: Immediate Fixes (< 30 min, Zero Risk)

### 0.1 Fix Broken CSS Imports in app.postcss (P0 — BUILD NOISE)

`src/app.postcss` (imported by `+layout.svelte`) has 2 dead `@import` lines:
```postcss
@import './lib/styles/professional-theme.css';   /* FILE DOES NOT EXIST */
@import './lib/styles/golden-ratio-utilities.css'; /* FILE DOES NOT EXIST */
```
**Fix**: Remove both lines. Silent build failures.

### 0.2 Delete tailwind.config.js (P0 — IDE CONFLICT)

`tailwind.config.js` causes VS Code Tailwind extension to activate and conflict with UnoCSS. Project uses UnoCSS exclusively. No Tailwind deps in package.json.

### 0.3 Delete sveltekit-frontend/main.cu (TRIVIAL)

60-line "WardenNet" CUDA demo with no build system, no imports, no consumers. Functional CUDA smoketest at `scripts/cuda_smoketest/main.cu`.

### 0.4 Delete 6 Empty .pb.go Files (TRIVIAL)

`proto/{embed,events,gpu_service,gpu_service_grpc,ingest,ingest_grpc,tensor,tensor_grpc}.pb.go` — all 0 bytes, never generated.

---

## TIER 1: Critical Actions (This Week)

### 1.1 Wire High-Value Server Orphans (5 files, Score 8-12)

These represent 767 lines of production-quality code addressing the platform's biggest infrastructure gaps:

| File | Score | Lines | What It Solves | Wiring Target |
|------|-------|-------|----------------|---------------|
| `llm-router.ts` | **12** | 293 | No centralized LLM provider routing — 20+ routes independently import Ollama with no fallback | Import in `/api/ai/chat`, `/api/sse/chat` as drop-in for `callOllamaChat()`. Adds TRT→Ollama→Gemini fallback chain |
| `errors.ts` | **11** | 196 | No structured error handling — 267 routes use ad-hoc `JSON.stringify({ error })` | Import `AuthError` in auth guards, `formatErrorResponse()` in catch blocks. 7 typed error classes + ERROR_CODES |
| `redis-streams.ts` | **11** | 151 | No SSE crash recovery — connection drop loses all tokens | `produceTokenChunk()` in `/api/sse/chat`, `readTokenStream()` in new `/api/chat/replay` endpoint |
| `timeouts.ts` | **10** | 25 | Hardcoded timeout magic numbers everywhere | Replace scattered `setTimeout(fn, 30000)` with `TIMEOUTS.USER_FACING` etc. Zero-risk constants module |
| `law-mapping.ts` | **8** | 102 | No jurisdiction normalization for legal data | Import in `/api/citations`, statute routes for state/title code resolution (50 states + 10 legal codes) |

### 1.2 Wire High-Value Component Orphans (7 files, Score 6-9)

| Component | Score | Lines | Integration Point | Effort |
|-----------|-------|-------|-------------------|--------|
| `legal/IngestionProgress.svelte` | **9** | 116 | `/library/[documentId]`, `/evidence/upload` | 15 min |
| `ai/ThinkingStyleToggle.svelte` | **8** | 206 | `/terminal`, `/ai-dashboard` | 15 min |
| `legal/LibrarySidebar.svelte` | **8** | 63 | `/library/+layout.svelte` (has `showSidebar={true}` with no content!) | 10 min |
| `cases/CaseListItem.svelte` | **7** | 187 | `/cases`, `/active-cases` | 15 min |
| `dashboard/StatsCard.svelte` | **7** | 177 | `/dashboard`, `/command-center` | 15 min |
| `case/CaseDetailPage.svelte` | **6** | 271 | `/cases/[id]` (verify APIs first) | 20 min |
| `legal/ReaderPane.svelte` | **6** | 67 | `/library/[documentId]/reader` | 10 min |

**Archive 12 redundant/corrupted orphan components** (1,330+ lines dead weight):
- 4 superseded POI components: `FilterPanel`, `PersonCard`, `PersonList`, `PersonForm`
- 4 redundant YoRHa components: `EvidenceGrid`, `YoRHaNavigation`, `YoRHaNotification`, `YoRHaDataGrid`
- 2 Phase 99 corrupted: `RecursiveEvidenceNode`, `LegalAIDashboard`
- 1 semi-corrupted: `canvas/ReportNode`
- 1 Svelte 4: `forms/EvidenceForm` (defer rewrite unless needed)

### 1.3 Start RabbitMQ Consumers (CRITICAL GAP)

7 queue consumers exist but `createDefaultRegistry().startAll()` is never called from `hooks.server.ts`. Messages published to all 7 queues (`cache.invalidate`, `document.embed`, `evidence.process`, `vector.index`, `chat.context`, `analytics.track`, `codebase.index`) are never consumed.

**Fix**: Add `createDefaultRegistry().startAll()` to `hooks.server.ts` server init.

### 1.4 Fix docker-compose.test.yml Broken Reference

```yaml
go-embedding-grpc:
  build:
    context: ./go-microservice          # DIRECTORY DOES NOT EXIST (archived)
    dockerfile: Dockerfile.embedding    # FILE DOES NOT EXIST
```
**Fix**: Remove `go-embedding-grpc` service from docker-compose.test.yml.

### 1.5 pgvector Iterative Scanning (HIGHEST SEARCH IMPACT)

pgvector 0.8 adds `hnsw.iterative_scan` — fixes filtered vector search accuracy. 9x faster + 100x more relevant filtered searches.

```sql
SET hnsw.iterative_scan = relaxed_order;
SET hnsw.max_scan_tuples = 40000;
```

### 1.6 Ollama Structured Output Migration (4 files)

| File | Current | After |
|------|---------|-------|
| `server/analysis/entity-extraction.ts` | `format: "json"` | `format: zodToJsonSchema(entitySchema)` |
| `server/nlp/analyzer.ts` | `format: "json"` | `format: zodToJsonSchema(analysisSchema)` |
| `routes/api/nlp/sentiment/+server.ts` | `format: "json"` | `format: zodToJsonSchema(sentimentSchema)` |
| `server/ace/self-prompt.ts` | `format: "json"` | `format: zodToJsonSchema(evalSchema)` |

---

## TIER 2: High-Value Cleanup (Next 1-2 Sessions)

### 2.1 Archive 185 Dead JS/MJS Scripts (LARGEST CLEANUP)

The single biggest source of codebase clutter:

| Category | Count | Location | Examples |
|----------|-------|----------|---------|
| Root fix-*.mjs scripts | 21 | `sveltekit-frontend/` | `fix-arrow-functions.mjs`, `fix-svelte5-syntax.mjs`, `fix-batch-1000.mjs` |
| Root test-*.mjs scripts | 35 | `sveltekit-frontend/` | `test-all-api-endpoints.mjs`, `test-upload-pipeline.mjs` |
| Root analysis/check scripts | 15 | `sveltekit-frontend/` | `analyze-top-errors.mjs`, `check-schema.mjs`, `cascade-check.mjs` |
| Root dead configs | 4 | `sveltekit-frontend/` | `tailwind.config.js`, `prettier.config.mjs`, `.eslintrc.minimal.cjs`, `esbuild-plugin-skip-respond.mjs` |
| Root dead launchers | 3 | `sveltekit-frontend/` | `start-worker.js`, `start-dev-with-env.js`, `start-dev-quic-simple.js` |
| src/lib/utils/*.mjs | 93 | `src/lib/utils/` | `ULTIMATE-FINAL-FIX.mjs`, `agentic-orchestrator.mjs`, `comprehensive-optimization-checker.mjs` |
| src/ misc .mjs | 4 | `src/scripts/`, `src/lib/components/ui/` | `migrate-enhanced-bits.mjs`, `refactor-ui-components.mjs` |
| Empty files (0 bytes) | 10+ | Various | `db-seed.mjs`, `start-legal-ai-worker.mjs`, `system-test.cjs` |

**Target**: `deeds_labs/dead-scripts/` archive. All have 0 package.json references and 0 imports.

### 2.2 Archive 22 Zombie Barrel Files

These re-export modules that nothing imports through:

| Barrel | Exports | Why Dead |
|--------|---------|----------|
| `components/ui/layout/index.ts` | Golden ratio constants | Components archived, constants unused |
| `components/ui/modern/index.ts` | Type interfaces + CSS helpers | Components archived |
| `components/ui/modular/index.ts` | FileUpload + types | FileUpload never imported |
| `components/ui/core/index.ts` | Label, TextareaCore | Nobody imports `$lib/components/ui/core` |
| `components/ui/wrappers/bits/index.ts` | Nothing (empty) | Literally empty barrel |
| `components/ui/enhanced/index.ts` | Helper functions | Only dead .mjs fix scripts reference |
| `components/ui/enhanced-bits/index.ts` | 1 Button export | Only dead codemods reference |
| `components/ui/bits/index.ts` | bits-ui re-exports | All consumers import bits-ui directly |
| `components/ui/form/index.ts` | 6 Form aliases | Nobody imports `$lib/components/ui/form` |
| `components/ui/EvidenceCard/index.ts` | EvidenceCard | Never imported via barrel |
| `components/ui/StatsCard/index.ts` | StatsCard | Never imported via barrel |
| `components/ui/QuickActionButton/index.ts` | QuickActionButton | Never imported via barrel |
| `components/ui/select/index.ts` | Select components | Routes use bits-ui directly |
| `components/Dialog/index.ts` | Dialog wrapper | Wrong path, real at ui/dialog/ |
| `components/ai/CaseScoringDashboard/index.ts` | Component | Consumers import .svelte directly |
| `components/ai/PatternDetectionInterface/index.ts` | Component | No consumers at all |
| `components/subcomponents/index.ts` | Sub-components | No consumers |
| `server/pgai/index.ts` | 3 analysis functions | Entire pgai module dead |
| `server/agent/tools/index.ts` | 6 detective tools | MCP uses direct imports |
| `stores/machines/index.ts` | 4 XState machines | All machine imports bypass barrel |
| `utils/syntax-repair/index.ts` | Multi-pass processor | Phase 99 tool, never called |
| `utils/syntax-repair/patterns/index.ts` | Pattern definitions | Sub-barrel of dead module |

### 2.3 Archive 16 Orphan CSS Files

All theme CSS has been consolidated into `app.html` inline `<style>` + UnoCSS config:

```
src/app.css, src/appcopy.css, src/app.enhanced.css
src/styles/courthouse-theme.css, src/styles/nier-harvard-theme.css
src/styles/nier-theme.css, src/styles/yorha.css, src/styles/variables.scss
static/theme.css, static/fonts/{fonts,ibm-plex-sans,inter,jetbrains-mono,ms-gothic,press-start-2p}.css
src/lib/components/ui/gaming/n64/N64Theme.css, ui/gaming/ps1.css
src/lib/components/yorha/ps1.css
```

### 2.4 Archive 13 Orphan HTML Files

Test artifacts — only `app.html` and `static/offline.html` are active:

```
index.html (AssemblyScript test), test-auto-login.html, tmp_index_127.html,
vision-test.html, test-evidence-board.html, public/autosuggest-test.html,
static/avatar-test.html, static/enhanced-bits-test.html, static/font-test.html,
static/legal-ai-demo.html, static/test-evidence-processing.html,
static/test-lawpdfs-upload.html, static/test-worker.html, static/yorha-harvard-test.html
```

### 2.5 Archive 7 Stale tsconfig Variants

None referenced by any script, tool, or CI pipeline:

```
tsconfig.strict.json, tsconfig-optimized.json, tsconfig.chat.json,
tsconfig.orchestrator.json, tsconfig.development.json, tsconfig.kag-subset.json,
src/lib/utils/tsconfig.cjs.json
```

### 2.6 Archive Legacy Env and Config Files

**Env files** (superseded by current .env + .env.local + .env.production):
```
.env.phase14, .env.phase72, .env.phase79, .env.phase87, .env.384-production
```

**Config files**:
- `drizzle.introspect.config.ts` — deprecated `driver: 'postgres'`, wrong schema path
- `smoke.config.ts` — empty file (1 line)
- `playwright.config.js` — JS duplicate of `.ts` version

### 2.7 Archive 12 Dead Component Orphans

Move to `deeds_labs/lib-dead-directories/components-orphans/`:
```
FilterPanel.svelte (422), PersonCard.svelte (381), PersonList.svelte (103),
PersonForm.svelte (424), EvidenceGrid.svelte (388), YoRHaNavigation.svelte (191),
YoRHaNotification.svelte (110), YoRHaDataGrid.svelte (96), POICard.svelte (160),
ReportNode.svelte (88), RecursiveEvidenceNode.svelte (218), LegalAIDashboard.svelte (182)
```

### 2.8 Clean Proto Directory

- Move 33 root-level `proto/*.proto` into `proto/archived/` (already have copies there)
- Move `proto/gpu/`, `proto/ingest/`, `proto/embed/` generated Go code to `deeds_labs/`

---

## TIER 3: Consolidation (Next 3-4 Sessions)

### 3.1 Medium-Value Server Orphans (Score 5-7) — Assess and Wire

| File | Score | Lines | Gap | Blocker |
|------|-------|-------|-----|---------|
| `z-schemas.ts` | 7 | 25 | Shared Zod UUID/CUID schemas for 140 unvalidated routes | Only consumer is orphan itself. Needs direct route adoption |
| `logger.ts` | 7 | 126 | Structured error logging with Redis persistence | Depends on orphan `errors.ts` — wire that first |
| `document-processor.ts` | 7 | 186 | Multi-engine doc processor (Docling + OCR) | OCR fallback returns mock data. Needs real implementation |
| `knowledge-cache.ts` | 6 | 215 | Knowledge base Redis cache | Creates own Redis connection (should use singleton). Merge unique features into `cache.ts` |
| `vlm-document-analyzer.ts` | 6 | 275 | VLM legal document analysis | BROKEN — imports non-existent symbols from `ollama-service.ts`. Needs rewrite |
| `lokiHybridStore.ts` | 6 | 564 | Multi-backend sync engine | Uses OpenAI embeddings (wrong provider), heavy deps. Extract Redis pub/sub pattern only |

### 3.2 Server Files Safe to Archive (Score 0-4)

| File | Score | Reason |
|------|-------|--------|
| `database.ts` | 0 | 5-line re-export shim. Canonical import is `$lib/server/db/client` |
| `rabbitmq-service.ts` | 0 | 48-line stub with `console.log` no-ops. Real: `queue/rabbitmq-manager-fixed.ts` |
| `redis-service.ts` | 2 | 60-line thin wrapper. Superseded by `cache.ts` (dual-tier, 15+ consumers) |
| `evidence-processing.ts` | 3 | XState machine with all `console.log` stubs. Superseded by real 9-stage pipeline |
| `docling.ts` | 4 | Only consumer is orphan `document-processor.ts`. Dead chain |

### 3.3 Store Consolidation

| Action | From | To | Effort |
|--------|------|----|--------|
| ARCHIVE | `form.svelte.ts` (213 lines) | N/A — Superforms v2 handles all forms | 5 min |

### 3.4 9 Semi-Active Barrels (Low Priority)

These barrels exist but all consumers bypass them via direct imports:
```
components/cases/, components/detective/, components/ai/, components/yorha/,
components/shells/, components/dashboard/, components/recommendations/,
components/editor/, features/evidence-command-center/
```
Not urgent — they add minor maintenance burden but don't break anything.

### 3.5 API Route Cleanup

**4 error-brain routes** depend on corrupted `$lib/services/error-analysis/` (blanket-excluded):
- `/api/error-brain/analyze`, `/api/error-brain/search`, `/api/error-brain/trends`, `/api/error-brain/batch`
- These routes will 500 at runtime. Either restore the service or archive the routes.

### 3.6 QUIC Server Decision

`quic-server.go` (348 lines) at project root:
- No `go.mod` (can't build)
- nil-encoder bug on line 214
- 11 TS files reference QUIC ports but all fall back to HTTP

**Options**: (A) Add go.mod + fix bug + wire to docker-compose, or (B) Archive to `deeds_labs/` and remove QUIC env config.

---

## TIER 4: Feature Enhancements (Backlog)

### 4.1 Dependency Upgrades

| Dependency | Enhancement | Priority |
|-----------|-------------|----------|
| Qdrant v1.16 | Asymmetric 2-bit quantization (24x compression), ACORN filtered search | HIGH |
| pgvector 0.8+ | Iterative scanning for filtered HNSW | HIGH |
| Drizzle ORM | `check()` constraints, materialized views | MED |
| bits-ui | Calendar/DatePicker for timeline filtering | LOW |

### 4.2 SQL Migration Review

5 Drizzle auto-generated migrations contain DROP statements (likely already applied but dangerous to re-run):
- `0001_nice_omega_sentinel.sql` — DROP COLUMN "name" on users
- `0001_abandoned_satana.sql` — DROP COLUMN "password_hash" + "name" on users
- `0001_dry_dragon_man.sql` — DROP COLUMN "name" on users
- `0001_add_evidence_schema.sql` — DROP TABLE evidence CASCADE
- `0003_powerful_nebula.sql` — 7 DROP COLUMNs across documents + evidence

**Action**: Add `-- APPLIED, DO NOT RE-RUN` header comments to prevent accidents.

---

## SIMD Bridge Status (Fully Active)

The C++/CUDA addon is the only non-JS compute layer and is fully wired:

**10 N-API Functions exported by `tensorrt_bridge.node`:**

| Function | Source | CUDA? | Purpose |
|----------|--------|-------|---------|
| `bridgeSIMD(json)` | tensor_bridge.cc | SOM kernel | JSON floats → SOM cache GPU op |
| `checkCudaAvailable()` | libtorch_graph.cc | Detection | Returns 1 (CUDA) or 0 (CPU) |
| `graphSimilarity(emb, n, dim)` | libtorch_graph.cc | LibTorch | n×n cosine similarity matrix |
| `clusterEmbeddings(emb, n, dim, k, iters)` | libtorch_graph.cc | LibTorch | k-means clustering |
| `computeCaseEmbedding(w, emb, n, dim)` | libtorch_graph.cc | LibTorch | Weighted embedding aggregation |
| `lstmAdd(a, b, n)` | lstm_gpu.cu | CUDA kernel | Elementwise vector add |
| `dotProduct(a, b, n)` | lstm_gpu.cu | CUDA kernel | Parallel-reduction dot product |
| `scale(in, scalar, n)` | lstm_gpu.cu | CUDA kernel | Vector scalar multiply |
| `relu(in, n)` | lstm_gpu.cu | CUDA kernel | ReLU activation |
| `somCache(in, n)` | som_cache.cu | CUDA kernel | SOM cache transfer |

**TS Consumer Chain**: `tensorrt_bridge.node` → `libtorch-bridge.ts` → `cuda-bridge.ts` → `/api/gpu/compute` + `/api/health/gpu` + `background-analyzer.ts` (Stage 9)

---

## Transitive Dependencies (7 files — SAFE, DO NOT ARCHIVE)

These have 0 direct route imports but are imported by files that DO reach routes:

| File | Chain to Route |
|------|---------------|
| `config.ts` | → `vector/qdrant-manager.ts` → 5+ RAG/knowledge routes |
| `db-shim.ts` | → `db/pg.ts` → `api/evidence/search`, `queue-worker.ts` |
| `embedding-cache.ts` | → `embedding/embed.ts` → 6+ embedding routes |
| `embedding-cache-service.ts` | → `embedding/embed.ts` → same chain |
| `keyword-extractor.ts` | → `llm/contextual-chat.ts` → `api/ai/contextual-chat` |
| `ollama-service.ts` | → `keyword-extractor.ts` → routes (3-line re-export barrel) |
| `redisPubSub.ts` | → `CollaborativeEvidenceCanvas.svelte` → `cases/[id]/board` |

---

## Codebase Health Metrics

### Current State (Pre-Cleanup)

| Metric | Value |
|--------|-------|
| Total files audited | ~1,260+ |
| Active/wired files | ~800 (63%) |
| Dead/orphan files | ~430 (34%) |
| Transitive deps (safe) | 7 |
| Unknown/partial | ~23 (2%) |

### After Tier 0-2 Cleanup (Projected)

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Dead JS/MJS scripts | 185 | 0 | **-185** |
| Zombie barrels | 22 | 0 | **-22** |
| Orphan CSS | 16 | 0 | **-16** |
| Orphan HTML | 13 | 0 | **-13** |
| Stale configs | 15 | 0 | **-15** |
| Empty proto files | 6 | 0 | **-6** |
| Duplicate protos | 33 | 0 | **-33** |
| Legacy env files | 5 | 0 | **-5** |
| Dead server files | 5 | 0 | **-5** |
| **Total files removed** | — | — | **~300** |
| **Codebase dead %** | 34% | ~10% | **-24%** |

### After Full Cleanup (Tiers 0-3)

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| **Total files removed** | — | — | **~330** |
| **Codebase dead %** | 34% | ~7% | **-27%** |
| High-value orphans wired | 0 | 5 | **+5** |

### Infrastructure Integration

| System | Status | Coverage |
|--------|--------|----------|
| Evidence Pipeline (9-stage) | PRODUCTION | 95% (2 corrupted workers) |
| RAG (retrieval + ranking + LLM) | PRODUCTION | 100% |
| Cache (Loki/IDB/mem/Redis) | PRODUCTION | 100% |
| Vector Search (dense+sparse) | PRODUCTION | 100% |
| Message Queue (RabbitMQ) | BROKEN | 7 queues, 0 consumers running |
| LLM Inference | PRODUCTION | 90% (no fallback chain) |
| C++/CUDA GPU Compute | PRODUCTION | 10/10 N-API functions verified |
| WebGPU/WASM Client AI | PRODUCTION | 8/8 files integrated |
| gRPC Transport | CONDITIONAL | 6 protos, disabled by default |
| QUIC Transport | BROKEN | quic-server.go can't build |

---

## Implementation Order

```
Immediate (Tier 0 — Zero Risk, < 30 min):
  0.1 Remove 2 broken @import from app.postcss           [P0, 2 min]
  0.2 Delete tailwind.config.js                           [P0, 1 min]
  0.3 Delete sveltekit-frontend/main.cu                   [P0, 1 min]
  0.4 Delete 6 empty .pb.go files                         [P0, 1 min]

Week 1 (Tier 1 — Critical):
  1.1 Wire 5 high-value server orphans (score 8-12)       [P0, 3-4h]
  1.2 Wire 7 high-value component orphans (score 6-9)     [P0, 1.5h]
  1.3 Start RabbitMQ consumers in hooks.server.ts         [P0, 30 min]
  1.4 Fix docker-compose.test.yml broken Go ref           [P0, 5 min]
  1.5 pgvector iterative scanning                         [P0, 30 min]
  1.6 Ollama structured output migration (4 files)        [P1, 1-2h]

Week 2 (Tier 2 — High-Value Cleanup):
  2.1 Archive 185 dead JS/MJS scripts                     [P1, 1h]
  2.2 Archive 22 zombie barrels                           [P1, 30 min]
  2.3 Archive 16 orphan CSS files                         [P1, 15 min]
  2.4 Archive 13 orphan HTML files                        [P1, 15 min]
  2.5 Archive 7 stale tsconfigs                           [P1, 10 min]
  2.6 Archive legacy env/config files                     [P1, 10 min]
  2.7 Archive 12 dead component orphans                   [P1, 10 min]
  2.8 Clean proto directory                               [P1, 15 min]

Week 3-4 (Tier 3 — Consolidation):
  3.1 Assess 6 medium-value server orphans (score 5-7)    [P2, 2h]
  3.2 Archive 5 dead server files (score 0-4)             [P2, 15 min]
  3.3 Archive orphan store (form.svelte.ts)               [P2, 5 min]
  3.4 Evaluate 9 semi-active barrels                      [P2, 1h]
  3.5 Fix or archive 4 error-brain API routes             [P2, 1h]
  3.6 QUIC server decision (build or archive)             [P2, 30 min]

Backlog (Tier 4 — Enhancements):
  4.1 Dependency upgrades (Qdrant, pgvector, Drizzle)     [P3, 2-3h]
  4.2 SQL migration safety headers                        [P3, 15 min]
```

**Total cleanup effort: ~15-20 hours across 3-4 sessions**
**Expected outcome: Codebase dead weight drops from 34% to ~7%**

---

## Audit Agent Details

| Agent | Scope | Files Scanned | Duration | Key Findings |
|-------|-------|---------------|----------|-------------|
| Server TS | 51 top-level `src/lib/server/*.ts` | 51 | ~2 min | 5 high-value orphans, 7 transitive deps, 4 infra gaps |
| Workers/Machines | Workers + XState machines | 23 | ~2 min | RabbitMQ consumers never started (CRITICAL) |
| API Routes | Sampled 49 routes | 49 | ~2 min | 16 orphaned, 4 depend on corrupted services |
| JS/CJS/MJS/Barrels | 199 scripts + 72 barrels + 19 stores | 290 | ~7 min | 185 dead scripts, 22 zombie barrels |
| CSS/HTML/SQL/Config | 21 CSS + 16 HTML + 84 SQL + 52 config | 173 | ~2 min | Broken app.postcss, 5 dangerous SQL migrations |
| Go/C++/C | Go + SIMD bridge + CUDA + proto | 80+ | ~2 min | quic-server unbuildable, SIMD fully active |
| Components | All 598 .svelte components | 598 | ~10 min | 22 orphans (7 high-value, 12 archive, 2 Phase 99 corrupted) |

*Generated: March 22, 2026 — 7 parallel audit agents*
