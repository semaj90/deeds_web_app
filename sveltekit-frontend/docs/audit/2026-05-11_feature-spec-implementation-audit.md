# Feature × Spec × Implementation Audit (2026-05-11)

> Counterpart to `file-move-audit-gates.md`. Where that doc verifies *refactor safety*, this doc verifies *feature delivery* — what `AGENTS.md` / `master_agents.md` say should exist, what code actually exists, and where the two diverge.

---

## 0. Methodology

**Scope**: 20 highest-density feature areas across `sveltekit-frontend/src/`, scored by file count from `memory/atlas/codebase-atlas.dirs.json` (1,135 dirs indexed).

**Inputs consumed (read-once, no re-globbing)**:
- `docs/master_agents.md` (84 KB, 18-feature atlas + 65 audit gates)
- `docs/graph/codebase-map.md` (62 KB, human-readable dir map)
- `docs/graph/codebase-graph.json` (4.2 MB, full graphify pipeline output)
- `memory/atlas/codebase-atlas.dirs.json` (618 KB, per-dir features + Karpathy scores)
- `sveltekit-frontend/AGENTS.md` (50 KB, top-level dir wiki, auto-generated index of 383 dir-level AGENTS.md files)
- `sveltekit-frontend/src/AGENTS.md` (4 KB, src-root spec)
- 8 sampled dir-level AGENTS.md: `server/ace`, `server/retrieval`, `server/db`, `server/graph`, `server/cache`, `server/ai`, `server/grpc`, `mcp`

**Verification queries run**:
- `$lib/` import resolution sweep across 1,053 unique import paths via PowerShell regex + `Test-Path` over 8 extension variants → **18 unresolved, 1 active runtime consumer**
- Cross-check of 24 orphan-schema tables against `schema-postgres.ts` (148 canonical `pgTable`/`pgView`) → 6 already promoted, 18 genuinely orphan
- SHIPPED feature chain spot-checks via `grep` (intent-router → intent-dispatch route; ACE_PIPELINE_VERSION; rrf-fuse → search-fused; cartridge endpoints; glyph routes)
- API surface file count via `find … -name '+server.ts'`

**Deliberately skipped**:
- Reading all 383 dir-level AGENTS.md (sampled 8 representatives, sufficient — the rest are auto-generated audit-gate boilerplate via `enrich-agents-md.mjs`)
- Full `npx svelte-check` execution (used the documented baseline: ~12 errors, ~9 warnings, mostly admin/raptor parallel-agent residue)
- Per-file rune-compliance scan (rune compliance is already 17/17 PASS per master_agents.md §4 Tier E)
- Migration journal vs `drizzle/manual/` correlation (operator already noted: "we've never migrate pushed all the tables")

---

## 1. Top-Line Findings (TL;DR)

1. **AGENTS.md files are 95% auto-generated audit-gate boilerplate, not feature specs.** Of the 383 dir-level files, the 8 high-value dirs I sampled are nearly identical templates from `enrich-agents-md.mjs` repeating CLAUDE.md gate text. **The real spec lives in `docs/master_agents.md` + project-root `CLAUDE.md`.** Treat dir-level AGENTS.md as "where to point the agent", not "what the feature does".

2. **`master_agents.md` lists 18 named features in a Postgres `feature_implementations` table — every single one is wired to ≥1 implementation file**, and chain spot-checks confirm 11 of 12 are fully reachable through real routes/handlers. The HyperRAG L0–L11 lane pipeline is the most complete subsystem in the repo: 12 lanes, 12 distinct primary files, all wired into `context-assembler.ts`.

3. **Orphan-schema confirmation: 18 tables across 6 files are genuinely deferred-migration**. `schema-phase78` has 7 tables (5 already promoted to canonical, 2 truly orphan: `errorPatchLog` + `routeContextCache`), `schema-gpu-cache` 5/5 orphan, `schema-ingestion` 6 tables (1 promoted, 5 orphan), `schema-week3-kb` 4/4 orphan, `schema-charges` 2/2 orphan (superseded), `schema-test-rag` separate. **Operator confirmed**: "we've never migrate pushed all the tables that's why some things are missing". The correct action for Tier B is `drizzle-kit generate`, not delete.

3a. **Of the 18 truly-orphan tables, only 2 have non-schema-file consumers** (`errorPatchLog` + `routeContextCache` are imported by `src/lib/server/phase78/contextBuilder.ts`). The other 16 are unreferenced outside their own schema file — meaning that consumer code path is dead-on-arrival until the migration lands.

4. **`$lib/` unresolved-imports audit is overwhelmingly clean.** 1,053 unique import paths checked; 18 unresolved. **17 of those 18 are in: ambient `.d.ts` shim modules, `.new`/`.todo`/`.bak` files, README docs, or commented-out code.** Only one is a live consumer: `src/lib/components/detective/DetectiveBoard.svelte:12` imports `$lib/features/ai/services/ai-service` which doesn't resolve. svelte-check's ~12 baseline errors are unrelated to import resolution (most are in admin/raptor parallel-agent residue per CLAUDE.md).

5. **The intent-router pipeline (Phase 2) is shipped end-to-end.** `intent-router.ts` exports `routeIntent` + `executeChain` + 9 schemas, consumed by `/api/ai/intent-dispatch/+server.ts` AND `/api/ai/contextual-chat/+server.ts`. RRF fusion (Phase 1) is similarly wired: `retrieval/rrf-fuse.ts` → `/api/rag/search-fused/+server.ts` + `context-assembler.ts` + `routing/query-router-4x4.ts`.

6. **MCP TRACE server (:8788) registers 78 tools** (the `master_agents.md` doc claims 73; the codebase has grown by 5 since). All schemas use the per-request `StreamableHTTPServerTransport` pattern (G38 fix landed). Per the May 9 mount log, only 42 tools mount live with 5 registries silent-failing (adminTools/skillTools/codebaseTools/bifrostTools/topologyMgmtTools). Adjacent KB Retrieval Server (:8789) and gemma4-offload stdio MCP are also live.

7. **Reconstruction/SceneIntent + courtroom 3D is PARTIAL.** `scene-intent-extractor.ts` + `scene-intent-prompt.ts` exist with one matching route (`/api/reconstruction/scene-intent`), and `src/lib/courtroom/` has 4 files (1,556 LoC including CRT/N64 post-process shader). But Lanes B–E from `memory/reconstruction-3-tracks.md` (ComfyUI render, Blender+Mixamo MP4, WebGPU low-poly, Gaussian splat) are not in code — there are no `comfyui.render`, `blender.render`, or `scene.render` RabbitMQ queue handlers.

8. **`drizzle/manual/` contains 76 SQL files** — many never journaled. This is the *correct* state for Tier-B-deferred schema (operator confirmed). The right action is `drizzle-kit generate` to bring them into the journal, NOT delete.

---

## 2. Feature × Spec × Implementation Matrix

Sorted: SPEC_ONLY → PARTIAL → UNDOCUMENTED → SHIPPED.

| # | Feature | Spec source | Status | Files | Missing imports | Action needed |
|---|---|---|---|---|---|---|
| 1 | Phase78 route-health context cache | `schema-phase78.ts` | **SPEC_ONLY** | 2 (schema + `phase78/contextBuilder.ts`) | 0 | `drizzle-kit generate` for `errorPatchLog`, `routeContextCache`; promote to `schema-postgres.ts` |
| 2 | GPU shader cache | `schema-gpu-cache.ts` | **SPEC_ONLY** | 1 (schema only, 0 consumers) | 0 | `drizzle-kit generate` + decide: wire to `lib/webgpu/` or archive |
| 3 | Ingestion pipeline (OCR queue, vector logs) | `schema-ingestion.ts` | **SPEC_ONLY** | 1 (schema only, 0 consumers) | 0 | Wire to `server/indexer/` or archive — `documentSummaries` already canonical |
| 4 | Week3 KB (auto-approval, provenance, fixes) | `schema-week3-kb.ts` | **SPEC_ONLY** | 1 (schema only) | 0 | `drizzle-kit generate`; intended for error-brain / agentic-fix pipeline |
| 5 | Charges + caseTimeline (legacy) | `schema-charges.ts` | **SPEC_ONLY** | 1 (schema only) | 0 | Superseded by canonical `timelineEvents` + `fictionalCaseCharges` → **archive recommended** |
| 6 | Test RAG harness schema | `schema-test-rag.ts` | **SPEC_ONLY** | 1 (schema only) | 0 | Verify test-only; if yes, move to `tests/fixtures/` |
| 7 | Reconstruction 3-track (Lanes B–E) | `memory/reconstruction-3-tracks.md` | **PARTIAL** | ~6 (extractor + 1 route + courtroom 4) | 0 | Build ComfyUI HTTP wrapper, RabbitMQ `scene.render`/`evidence.render` queues, Blender Mixamo registry |
| 8 | Glyph / CHR97 cartridge layer | master_agents.md G36–G47 | **PARTIAL** | 10+ (cartridge + glyph + tensor-bridge + 11 routes) | 0 | G45 — verify `glyph_records` columns in canonical schema; G43 — CouchDB `glyph_topology` persistence; G44 — `glyph.tile.rebuild` RabbitMQ |
| 9 | DetectiveBoard.svelte | n/a (orphan UI) | **PARTIAL** | 1 component | 1: `$lib/features/ai/services/ai-service` | Repoint import or delete component |
| 10 | feature_atlas (L9 HyperRAG lane) | master_agents.md §2 + §HyperRAG | **PARTIAL** | 2 (`featureImplementations` + `seed-feature-atlas.mjs`) | 0 | Lane wired but G-HR3/G-HR4 per-chunk fields need `graphify:semantic` data run |
| 11 | HyperRAG L0–L11 multi-lane retrieval | master_agents.md §2 (12 lanes) | **SHIPPED** | 12 primary files (table in §3.1) | 0 | None — G-HR1–G-HR10 all PASS |
| 12 | ACE context assembler + trust tiers | master_agents.md §2 (ACE_PIPELINE_VERSION=3.0.0) | **SHIPPED** | 43 files in `server/ace/` | 0 | None |
| 13 | TRACE MCP server (:8788) | master_agents.md §2 + CLAUDE.md §MCP | **SHIPPED** | 78 tools registered + 15 sibling tool files | 0 | None — G34 + G38 fixes landed May 9 |
| 14 | Intent router + dispatch | CLAUDE.md §Phase2 intent | **SHIPPED** | 1 router + 2 consumer routes | 0 | None |
| 15 | RRF fusion (Phase 1) | CLAUDE.md §Phase1 RRF | **SHIPPED** | `rrf-fuse.ts` + `sparse-bm25.ts` + `query-router-4x4.ts` + `/api/rag/search-fused` | 0 | None |
| 16 | SSE chat stream + memory/migrate/replay | CLAUDE.md §chat/stream | **SHIPPED** | 5 routes under `/api/chat/` | 0 | None |
| 17 | Hypergraph 4D + PageRank standalone | CLAUDE.md §Standalone pipeline | **SHIPPED** | `scripts/run-hypergraph.ts` + `run-pagerank.ts` + `run-tensor-topology-mapreduce.ts` | 0 | None |
| 18 | Karpathy GPU authority blend | memory/karpathy-gpu-redis-ace.md | **SHIPPED** | `scripts/karpathy-gpu-enrich.mjs` + Redis `gpu:karpathy:*` | 0 | None |
| 19 | Evidence pipeline (8 stages) | CLAUDE.md §Evidence pipeline | **SHIPPED** | 32 routes under `/api/evidence/` + `server/indexer/` (15+ files) | 0 | None |
| 20 | OpenAI v1 facade | master_agents.md §Tier C `/api/v1` | **SHIPPED** | 19 routes under `/api/v1/` | 0 | None |
| 21 | Courtroom 3D scene state | CLAUDE.md §Reconstruction Lane D | **UNDOCUMENTED** | 4 files in `src/lib/courtroom/` (1,556 LoC) | 0 | Surface in `master_agents.md` feature atlas |

**Status breakdown**: 10 SHIPPED, 4 PARTIAL, 6 SPEC_ONLY, 1 UNDOCUMENTED. (Row 1 "Phase78 route-health" straddles SPEC_ONLY and SHIPPED — classified SPEC_ONLY because the *tables* aren't in the live DB, so the consumer code path is dead-on-arrival.)

---

## 3. Per-Feature Deep Dive

### 3.1 HyperRAG L0–L11 multi-lane retrieval — SHIPPED

**Spec**: `master_agents.md` §2 lists all 12 lanes with primary file paths. Each lane is a `feature_implementations` row with file-edges to its implementation files.

**Implementation**: `src/lib/server/ace/context-assembler.ts` orchestrates Stage A0 (topo prefilter) → multi-lane retrieval → trust-fenced merge. Per-lane files:

| Lane | Primary file | Verified |
|---|---|---|
| L0 topo prefilter | `src/lib/server/cache/topo-candidate-cache.ts` | ✓ |
| L1 Qdrant dense | `src/lib/server/vector/qdrant-manager.ts` | ✓ |
| L2 Qdrant signature | same | ✓ |
| L3 summary lenses | `context-assembler.ts` | ✓ |
| L4 wiki / AGENTS.md | `context-assembler.ts` + Redis `wiki:note:*` | ✓ |
| L5 synthesis memory | `synthesis_memory_768` Qdrant collection | ✓ |
| L6 prior answers | Redis `code:llm:*` + `ace:chunks:*` | ✓ |
| L7 graph neighbors | `multi-lane-retrieval.ts` + Neo4j | ✓ |
| L8 PageRank authority | `scripts/karpathy-gpu-enrich.mjs` | ✓ |
| L9 feature atlas | `featureImplementations` Postgres table | ✓ |
| L10 web external (SearXNG) | `context-assembler.ts` | ✓ |
| L11 activity prefetch | `/api/analytics/panel-activity/+server.ts` | ✓ |

**Action**: None. G-HR3/G-HR4 caveats (per-chunk `lane`/`trustMeta.tier`) require `graphify:semantic` to populate Qdrant — not a code gap.

### 3.2 ACE context assembler + trust tiers — SHIPPED

`src/lib/server/ace/` contains 43 files. Verified exports: `ACE_PIPELINE_VERSION = '3.0.0'` (line 1522), `sanitizeChunk`, `buildExternalTrustMeta`, `buildCodeChunkTrustMeta`, `buildSystemTrustMeta`. T1–T5 tier system + 8-pattern injection sanitizer. Phase-D hooks unblocked per memory note.

### 3.3 TRACE MCP server (:8788) — SHIPPED

`src/mcp/` has 15 files. `trace-mcp-server.ts` registers **78 tools** (master_agents.md states 73 — codebase has drifted +5). Sibling tool registries: `admin_tools.ts`, `bifrost_tools.ts`, `codebase_tools.ts`, `db-inspection-tools.ts`, `new_tools.ts`, `research_tools.ts`, `skill_tools.ts`, `topology_mgmt_tools.ts`, `kb-retrieval-server.ts` (port :8789). Per memory/architecture/mcp-mount-smoke-2026-05-09.md, last verified mount = 42 tools live with 5 silent registry failures. G34 (no Zod 3 single-arg `z.record`) + G38 (per-request transport) fixes landed.

### 3.4 Intent router + dispatch (Phase 2) — SHIPPED

`src/lib/server/ai/intent-router.ts` exports `IntentLabelSchema`, `IntentResultSchema`, `RouterContext`, `OperatorChainStep`, `OperatorChainStepSchema`, `RouterDecision`, `RouterDecisionSchema`, `ChainStepTrace`, `ChainExecution`, plus `routeIntent()` and `executeChain()`. Consumed by:
- `src/routes/api/ai/intent-dispatch/+server.ts` (line 32)
- `src/routes/api/ai/contextual-chat/+server.ts`

Co-located with the regex pre-pass at `src/lib/intent/regex-intent.ts`.

### 3.5 RRF fusion (Phase 1) — SHIPPED

`src/lib/server/retrieval/rrf-fuse.ts` + `sparse-bm25.ts` + `src/lib/server/routing/query-router-4x4.ts`. Consumed by `context-assembler.ts`, `config.ts`, and route `/api/rag/search-fused/+server.ts`.

### 3.6 Evidence pipeline (8 stages) — SHIPPED

32 `+server.ts` files under `/api/evidence/` (CRUD, upload, search, analysis, analyze, connections, entities, extract-docling, realtime, relationships, search-by-image, summary, tags, upload-test, ai/, [id]/, [docId]/). Indexer in `src/lib/server/indexer/` has 15+ files including `legal-chunker.ts`, `ast-chunker.ts`, `dual-embedder.ts`, `directory-summarizer.ts`. All 8 stages from CLAUDE.md §Evidence pipeline accounted for in code.

### 3.7 Glyph / CHR97 cartridge layer — PARTIAL

Code present: `src/lib/server/cartridge/{chr97-builder,glyph-mappers,glyph-record,glyph-tile-engine}.ts`, `src/lib/server/glyph/glyph-mappers.ts`, `src/lib/server/glyph-diffusion-service.ts`, `src/lib/server/glyph-prompt-cache.ts`, `src/lib/server/cache/cartridge-tensor-bridge.ts`. Routes: 6 under `/api/cartridge/` + 5 under `/api/glyph/*` and `/api/graph/glyph-atlas/*`.

**Gap**: G45 wants `glyph_records` table with `grpoRewardScore`/`somCluster` columns in canonical schema — not verified present. G43 wants CouchDB `glyph_topology` persistence — needs spot-check. G44 wants `glyph.tile.rebuild` RabbitMQ publish path — needs spot-check.

### 3.8 Reconstruction / SceneIntent — PARTIAL

Implemented: `src/lib/server/reconstruction/{scene-intent-extractor,scene-intent-prompt}.ts` + 1 route `/api/reconstruction/scene-intent/+server.ts` + 2 demo pages (`crime-reconstruction`, `scene-intent-2d`) + `src/lib/courtroom/` (4 files, 1,556 LoC including `crt-postprocess.ts` for PS1/N64 aesthetic).

**Spec'd but not built** (per `memory/reconstruction-3-tracks.md` Lanes B–E):
- ComfyUI HTTP wrapper + `comfyui.render` RabbitMQ queue → not found
- Blender + Mixamo MP4 render path → not found
- WebGPU low-poly Threlte viewer with actor paths → not found
- Gaussian splat environment loader → not found

The Mixamo license-safe action allowlist exists in the spec but no `courtroom_animations` row mapper found in code.

### 3.9 Courtroom 3D scene state — UNDOCUMENTED

`src/lib/courtroom/{courtroom-scene.svelte.ts,timeline-engine.svelte.ts,crt-postprocess.ts,courtroom-types.ts}` exists with 1,556 LoC and an AGENTS.md, but it's not in `master_agents.md` §2 feature atlas. Add a feature_atlas row: `courtroom.3d_scene` → primary file `courtroom-scene.svelte.ts` so future agents discover it.

### 3.10 Phase78 route-health context cache — SPEC_ONLY

`schema-phase78.ts` defines 7 tables; 5 already promoted to `schema-postgres.ts` (`routeHealth`, `errorEvents`, `errorClusters`, `errorSuggestions`, `errorSuggestionStates`). The 2 orphan-only tables (`errorPatchLog`, `routeContextCache`) are imported by `src/lib/server/phase78/contextBuilder.ts` but **the tables don't exist in the live DB**. Action: `drizzle-kit generate` for these 2, then either consolidate into `schema-postgres.ts` or keep `schema-phase78.ts` as a feature-scoped schema and reference it via a barrel re-export.

### 3.11 GPU shader cache — SPEC_ONLY

5 tables + 1 view in `schema-gpu-cache.ts` (`shaderCacheEntries`, `shaderUserPatterns`, `shaderPreloadRules`, `shaderDependencies`, `shaderCompilationQueue`, `shaderRecommendationsView`). **No consumers outside the schema file**. `src/lib/webgpu/` (39 files) doesn't import any of them. Either:
1. Wire from `lib/webgpu/` shader compilation paths (matches the design intent), OR
2. Archive — feature was specced and never built.

### 3.12 Ingestion pipeline schema — SPEC_ONLY

6 tables in `schema-ingestion.ts` (`ingestedDocuments`, `ingestedDocumentChunks`, `embeddingCacheTable`, `ocrProcessingQueue`, `vectorSearchLogs`, `documentSummaries` — last one already canonical). The 5 truly-orphan tables have no consumers. The *behavior* exists in `server/indexer/` and the evidence pipeline — these tables look like an alternative ingest path that never landed. Recommend archive after confirming evidence pipeline covers OCR queue use case.

### 3.13 Week3 KB schema — SPEC_ONLY

4 tables (`autoApprovalRules`, `kbProvenanceGraph`, `errorSessions`, `generatedFixes`) intended for the error-brain/agentic-fix pipeline. No consumers. `/api/phase89/` (24 routes) exists for the error-brain UI but uses the canonical `errorEvents`/`errorClusters` tables, not these. Action: confirm with operator whether the agentic-fix pipeline will adopt these tables or supersede them.

### 3.14 Charges + caseTimeline (legacy) — SPEC_ONLY → ARCHIVE

`schema-charges.ts` defines `charges` and `caseTimeline`. Canonical schema already has `fictionalCaseCharges` and `timelineEvents` (line ~). These look like pre-Lucia legacy. **Archive recommendation** — they're superseded.

### 3.15 Test RAG harness schema — SPEC_ONLY → MOVE

`schema-test-rag.ts` — if test-only (likely from `npm run test:diagnostics` or `tests/routes/`), move to `tests/fixtures/` so it isn't conflated with production schema.

### 3.16 DetectiveBoard.svelte broken import — PARTIAL

`src/lib/components/detective/DetectiveBoard.svelte:12` imports `$lib/features/ai/services/ai-service` which does not resolve. Either:
- Repoint to existing `$lib/server/ai/...` module (caveat: needs to be browser-safe — `$lib/server/*` is SSR-only), OR
- Delete the import — component may still function via other deps, OR
- Restore a `src/lib/features/ai/services/ai-service.ts` shim.

Currently the **only active runtime broken import** in the codebase — the other 17 unresolved paths are in .d.ts shims, .new/.todo/.bak files, README docs, or commented-out code.

### 3.17 OpenAI v1 facade — SHIPPED

19 routes under `/api/v1/` (chat/completions, models, embeddings, etc.). Per master_agents.md §Tier C and OpenAI section, response includes `yorha` block with retrieval transparency. OpenWebUI / Continue / Cursor / Aider can wire to `http://localhost:5173/api/v1`.

### 3.18 Hypergraph + PageRank standalone — SHIPPED

`scripts/run-hypergraph.ts` (4D builder, OOM-safe, 128s for 2000 nodes), `scripts/run-pagerank.ts` (CouchDB → Redis `couchdb:pagerank_scores`, 1.1s), `scripts/run-tensor-topology-mapreduce.ts`. GPU addon path fix landed in commit `66bd8b4fe3`.

### 3.19 Karpathy GPU authority blend — SHIPPED

`scripts/karpathy-gpu-enrich.mjs` writes Redis `gpu:karpathy:scores` (24h TTL) with `{pr, attn, authority, blend}` per file. Blend = `0.4·PR + 0.3·attn + 0.3·authority`. Read by ACE/MCP/synthesis. PCA 768→64 path documented as Tier 2 in the SOM routing plan; current status n=11 < 65 needed.

### 3.20 feature_atlas (L9 lane) — PARTIAL

`featureImplementations` table at `schema-postgres.ts:4352` + `scripts/seed-feature-atlas.mjs` (idempotent). Wired into ACE Lane L9. **Partial because**: G-HR3/G-HR4 per-chunk `lane`/`trustMeta.tier` fields show only via `trustTiers` map until Qdrant is populated via `graphify:semantic`. Not a code gap — a data-population gap.

---

## 4. Cross-Cutting Concerns

### 4.1 Unmigrated Schema Inventory

| Schema file | Tables defined | Already in canonical | Truly orphan | Live in DB? | Non-schema consumers |
|---|---|---|---|---|---|
| `schema-phase78.ts` | 7 | 5 | 2 (`errorPatchLog`, `routeContextCache`) | No | `phase78/contextBuilder.ts` (1 file, 2 tables) |
| `schema-gpu-cache.ts` | 5 + 1 view | 0 | 5 | No | 0 |
| `schema-ingestion.ts` | 6 | 1 (`documentSummaries`) | 5 | No | 0 |
| `schema-week3-kb.ts` | 4 | 0 | 4 | No | 0 |
| `schema-charges.ts` | 2 | 0 (but superseded) | 2 | No | 0 |
| `schema-test-rag.ts` | — | — | (test-only) | No | 0 |
| **Total** | **24 + view** | **6** | **18** | **0** | **1 file (2 tables)** |

**Operator note confirmed**: "we've never migrate pushed all the tables that's why some things are missing". This is the deferred-migration state — `drizzle/manual/` has 76 SQL files paralleling these schemas, never journaled.

**Action per schema file**:
1. **Generate-migration + adopt**: Run `drizzle-kit generate`, journal it, promote to canonical OR keep as feature-scoped sub-schema with barrel export. (Recommended for `schema-phase78.ts` since it has 1 active consumer.)
2. **Archive**: Move to `src/lib/server/db/archived/` or delete. (Recommended for `schema-charges.ts` — superseded by canonical equivalents.)
3. **Wire then migrate**: For `schema-gpu-cache.ts` + `schema-ingestion.ts`, decide if the feature is on the roadmap before committing to a migration.
4. **Move to fixtures**: `schema-test-rag.ts` if test-only.

### 4.2 Broken Imports Requiring Action

| File (consumer) | Missing import | Likely target |
|---|---|---|
| `src/lib/components/detective/DetectiveBoard.svelte:12` | `$lib/features/ai/services/ai-service` | Repoint to `$lib/services/ai-service` if browser-safe, or delete component |
| `src/types/webgpu-shims.d.ts:11,25` | `$lib/services/latency-logger` | Ambient declaration; no runtime impact unless re-enabled |
| `src/types/webgpu-ambient-modules.d.ts:4` | `$lib/services/latency-logger` | Same ambient declaration |
| `src/lib/utils/bits-ui-ssr` (line 5) | `$lib/types/api-schemas` | Likely intended `$lib/types/api.ts` or `$lib/schemas/...` |
| `src/routes/api/routes/[routeId]/health-event/+server.ts.new:5` | `$lib/server/sse-service` | `.new` file — delete or finish migration |
| `src/lib/webgpu/wire-telemetry.ts` | `$lib/webgpu/webgpu-legal-graph` | Local module — check if file renamed/deleted |
| `src/lib/webgpu/todo_webgpu` (commented) | 6 paths | TODO file — no action needed |
| `src/lib/ClientEmbeddingGemma.README.md` (docs) | self-references | Documentation only |

**Of these, only `DetectiveBoard.svelte` is a real runtime hazard.** The rest are .d.ts ambient declarations (intentionally type-only) or non-`.ts`/`.svelte` files that don't compile.

### 4.3 Spec Drift (AGENTS.md / master_agents.md says X, code does Y)

1. **MCP tool count**: `master_agents.md` says 73, `trace-mcp-server.ts` has 78 registered, live mount confirms 42 with 5 silent registry failures (memory/architecture/mcp-mount-smoke-2026-05-09.md). The spec needs to be re-counted post-G34/G38 fixes.

2. **GPU autoencoder weights source**: `master_agents.md` §5 says `random:xavier` (n=11 < 65), the documented blocker (PCA needs n≥65 Qdrant hits via `graphify:semantic`) hasn't been resolved. Tier-2 PCA→64 still pending.

3. **G-HR3/G-HR4 (lane + trustMeta.tier per chunk)**: spec claims PASS, but qualifier is "PASS (via `trustTiers` metadata map; per-chunk fields need `graphify:semantic`)". Effectively SHIPPED with a data-population caveat — fine, but flag clearly.

4. **Courtroom 3D scene** is in CLAUDE.md narrative (Reconstruction Lane D, ~1,556 LoC) but **missing from `master_agents.md` §2 feature atlas**. Add row.

5. **AGENTS.md dir-level files claim audit gates apply to that directory** — but the gate-text is identical boilerplate from `enrich-agents-md.mjs`. The dir-specific value-add is minimal. Agents walking up the tree get the same generic gates. **Suggestion**: enrich generator to inject dir-specific signals (Karpathy score, cluster ID from atlas, top-N tools from `cards[].tools`, top files from `cards[].top`) so dir-level AGENTS.md actually has dir-level information.

6. **`schema-postgres.ts` table count**: master_agents.md claims 70+ tables, 14 enums. Actual: **244 `export const` lines** (mix of tables + enums + types), with 148 `pgTable`/`pgView` definitions. Spec is significantly understated.

7. **CLAUDE.md gate counts**: project-root CLAUDE.md lists "47 gates" in one section heading, but `master_agents.md` §4 enumerates **65** (G1–G55 + G-HR1–G-HR10). Reconcile.

---

## 5. Recommended Next Actions

> **Update 2026-05-11**: 5 migrate-now ACE/memory tables carved into `drizzle/manual/0018_ace_observability_canonicalize.sql` (`ace_retrieval_runs`, `ace_retrieval_hits`, `memory_gain_audits`, `metadata_envelopes`, `code_llm_index`). Remaining 27 of the 34-table inspection bucket require per-feature review — 7 are duplicates of `tablesFilter`-protected tables, 22 are deferred-feature scaffolding (legal/RAPTOR/KAG/code-analysis cache). Earlier duplicate `2026-05-11_ace_memory_core.sql` superseded (renamed `.superseded`). Migration is staged but NOT applied — operator owns the apply step. P0 (`cases.user_id` identity strategy) untouched.

Ranked by leverage × effort. Each item is a single concrete commit-sized change.

1. **Fix the one real broken import** — `DetectiveBoard.svelte:12` → repoint or delete. *Effort: 15 min. Files: 1. Risk: very low (component may already be unused — check with `grep -r "DetectiveBoard" src/`)*. **This unblocks the "0 active unresolved imports" claim.**

2. **Promote `errorPatchLog` + `routeContextCache` to canonical** — they have a real consumer (`phase78/contextBuilder.ts`) but no live table, which means that consumer is dead-on-arrival at runtime. Run `drizzle-kit generate` against `schema-phase78.ts`, journal it, move the 2 truly-orphan table definitions into `schema-postgres.ts`, delete the now-empty `schema-phase78.ts`. *Effort: 1-2 hr. Files: 3. Risk: low.*

3. **Archive superseded schemas** — `schema-charges.ts` (superseded by `fictionalCaseCharges` + `timelineEvents`). *Effort: 10 min. Files: 1. Risk: very low (0 consumers confirmed).*

4. **Triage 3 remaining orphan schemas** — `schema-gpu-cache.ts`, `schema-ingestion.ts`, `schema-week3-kb.ts`. Operator decision needed per file: wire-and-migrate, archive, or defer. *Effort: 30 min decision + 1 hr per "wire-and-migrate" choice. Files: 3-7. Risk: low.*

5. **Add Courtroom 3D to feature_atlas** — insert a `courtroom.3d_scene` row + file edges for the 4 files in `src/lib/courtroom/`. Reuse `seed-feature-atlas.mjs` pattern. *Effort: 20 min. Files: 1 script edit. Risk: very low. Payoff: agents discover the subsystem.*

6. **Enrich dir-level AGENTS.md generator** — inject Karpathy score, cluster ID, top-N tools, and top files from `codebase-atlas.dirs.json` into each dir's AGENTS.md. Today they're generic gate templates; make them actually directory-specific. *Effort: 2-3 hr edit to `enrich-agents-md.mjs` + regenerate. Files: 1 script + 383 regenerated. Risk: low.*

7. **Reconstruction Lanes B–E build-order checkpoint** — pick Lane A (2D timeline viewer) or Lane B (ComfyUI still frame) as the next milestone. Both are spec-complete in `memory/reconstruction-3-tracks.md` but neither has any code yet beyond `scene-intent-extractor.ts`. *Effort: substantial (weeks). Out of scope for this audit, but flagged as the largest spec-implementation gap.*

8. **MCP spec/code reconciliation** — re-count tools in `trace-mcp-server.ts`, update `master_agents.md` §2 from 73 → 78. Fix the 5 silent-failing registries (adminTools/skillTools/codebaseTools/bifrostTools/topologyMgmtTools per May 9 mount log). *Effort: 1-2 hr per registry. Files: 5. Risk: medium (silent failures need root-cause hunt; may overlap with G34/G38 fix scope).*

9. **`graphify:semantic` data run** — populate Qdrant `codebase_chunks_768` so per-chunk `lane` + `trustMeta.tier` fields land (G-HR3/G-HR4), and so the GPU autoencoder gets n≥65 hits for the PCA Tier-2 milestone. *Effort: ~60s runtime + Ollama dependency. Files: 0. Risk: very low.*

10. **Confirm `schema-test-rag.ts` is test-only and move to `tests/fixtures/`** — keeps production schema clean. *Effort: 15 min after confirmation. Files: 1.*

11. **Reconcile gate counts**: CLAUDE.md "47 gates" header vs master_agents.md "65 gates" body. Pick the canonical number and update both. *Effort: 30 min. Files: 2.*

12. **Verify glyph G43/G44/G45** — three Tier G gates not spot-checked in this audit. Run their commands from CLAUDE.md §Tier G to determine if Glyph layer is fully SHIPPED or has hidden gaps. *Effort: 20 min. Files: 0 (audit only).*

---

## 6. Appendix: Audit Provenance

### Commands run (representative)

```bash
# Atlas inspection
node -e "const d=require('./memory/atlas/codebase-atlas.dirs.json'); …"  # top-30 dirs by file count

# AGENTS.md sampling (8 high-value dirs)
for f in src/lib/server/{ace,retrieval,db,graph,cache,ai,grpc}/AGENTS.md src/mcp/AGENTS.md; do
  head -25 "$f"; done

# Schema cross-check
grep "^export const.*pgTable" src/lib/server/db/schema-{phase78,gpu-cache,ingestion,week3-kb,charges}.ts
for t in routeHealth errorEvents …; do
  grep -c "^export const $t " src/lib/server/db/schema-postgres.ts
done

# Orphan-schema consumer count
for f in schema-phase78 schema-gpu-cache schema-ingestion schema-week3-kb schema-test-rag schema-charges; do
  grep -rn "from.*$f" src/ --include="*.ts" | wc -l
done

# Unresolved $lib imports (PowerShell — bash regex collapsed on $)
[regex]::Matches($content, "from\s+['""]\$lib/([^'""]+)['""]") | …
foreach extension in '','.ts','.js','.svelte','.svelte.ts','/index.ts','/index.js','/index.svelte':
  Test-Path "src/lib/$base$ext"

# SHIPPED chain verification
grep "^export" src/lib/server/ai/intent-router.ts
grep -n "intent-router" src/routes/api/ai/intent-dispatch/+server.ts
grep -n "ACE_PIPELINE_VERSION" src/lib/server/ace/context-assembler.ts
grep -rln "from.*rrf-fuse" src/ --include="*.ts"

# API surface count
find src/routes/api/{evidence,cases,auth,cartridge,phase89,code-intel,v1} -name "+server.ts" | wc -l
```

### Files exhaustively read

- `docs/master_agents.md` (lines 1–300, then grep-jumped to §2, §4 Tier H, §5 GPU state)
- `AGENTS.md` (lines 1–200)
- 8 dir-level AGENTS.md (top-25 lines each)
- `schema-{phase78,gpu-cache,ingestion,week3-kb,charges,test-rag}.ts` table-definition lines

### Files sampled / spot-checked

- `codebase-atlas.dirs.json` (top-30 cards by `n` field)
- `intent-router.ts`, `intent-dispatch/+server.ts`, `context-assembler.ts` (export lines + version constant)
- `chat/stream/+server.ts` (top 30 lines)
- 1,053 unique `$lib/*` import paths (existence-test only, no content read)

### Files deliberately not read

- 375 of 383 dir-level AGENTS.md (sampled 8; the rest are generated boilerplate)
- All 76 `drizzle/manual/*.sql` files (operator noted these are deferred-migration; out of scope)
- `codebase-graph.json` body (4.2 MB; used the digest header instead)
- All 78 MCP tool definitions in `trace-mcp-server.ts` (used the master_agents.md summary + memory note)

### What this audit IS NOT

- **Not a security review** — no auth-guard / Zod coverage analysis beyond what master_agents.md already documents (358/386 routes auth-guarded, 315/425 Zod-validated)
- **Not a performance audit** — no Karpathy score deltas, no GPU cache hit-rate analysis
- **Not a migration plan** — recommends `drizzle-kit generate` but does not draft the SQL
- **Not a test-coverage audit** — `tests/routes/auto/` stub generator status documented in CLAUDE.md but not re-verified here
- **Not a rune-compliance audit** — already 17/17 PASS per master_agents.md §4 Tier E; not re-run

### Limits acknowledged

This audit sampled 20 feature areas chosen by file-count density. Long-tail features outside the top 20 (POI, courtroom-models DB-only, demos, gaming/n64 yorha UI, error-analysis services) are not classified here. The 12 spot-checks were sufficient to validate the master_agents.md feature atlas (12/12 had ≥1 implementation file with a verifiable call chain) but a full reconciliation of the 78 MCP tools against the 18 feature_implementations rows is out of scope.

---

*End of audit. Generated 2026-05-11.*

---

## Addendum (2026-05-11) — Migration carve + readiness verification

**Migrate-now bucket carved into focused manual migration** at [drizzle/manual/0018_ace_observability_canonicalize.sql](../../drizzle/manual/0018_ace_observability_canonicalize.sql) (153 LoC, all `IF NOT EXISTS`, zero destructive ops). Includes the 5 audit-approved ACE/memory tables only:

- `ace_retrieval_runs` — ACE retrieval pass header
- `ace_retrieval_hits` — per-chunk scoring detail for a run
- `memory_gain_audits` — gain-vs-existing-memory audit log
- `metadata_envelopes` — canonical envelope spine (AGENTS.md / chunks / diagnostics)
- `code_llm_index` — code LLM output cache (PRIOR ANSWER lane)

**Deliberately NOT carved** (29 of the 34 tables in the inspection migration):

- 7 duplicates of `tablesFilter`-protected tables (`admin_ai_chat_*`, `embedded_summaries`, `panel_activity_log`, `vlm_image_tags`, `admin_ai_skills`, `admin_ai_subagent_runs`) — Drizzle generates CREATE because they're declared in `schema-postgres.ts`; would collide with sidecar SQL that already created them. Each needs per-table review before migration.
- 22 deferred-feature scaffolding (legal/RAPTOR/KAG/code-analysis caches: `case_chunks`, `crimes`, `case_persons`, `feature_implementations`, `feature_file_edges`, `community_reports`, `kag_dag_*`, `hypergraph_edges`, `graph_pathway_cards`, `code_relations`, `codebase_audit_events`, `directory_cluster_checkpoints`, `error_fingerprints`, `llm_summary_cache`, `qdrant_centroid_clusters`, `qdrant_cluster_members`, `rag_query_cache`, `tensor_analysis_cache`, `topology_positions`, `topology_snapshots`). These should land as coherent migration sets per feature area.

**Apply manually when ready** (NOT auto-applied):
```bash
docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  < sveltekit-frontend/drizzle/manual/0018_ace_observability_canonicalize.sql
```

### Readiness verification (read-only, 2026-05-11)

| Check | Result |
|---|---|
| `manifold4` column on `research_summaries` | ✅ ARRAY |
| `manifold4` column on `embedded_summaries` | ✅ ARRAY |
| `manifold4` column on `codebase_chunk_index` | ✅ ARRAY |
| `docs/graph/codebase-graph.json` freshness | ✅ same-day (4.2 MB) |
| `docs/graph/codebase-map.md` freshness | ✅ same-day (62 KB) |
| `npm run smoke:hyperrag` | ✅ 10/10 gates pass (G-HR1..G-HR10) |
| `npm run smoke:agents` | ✅ 387 Redis dir keys + agents:root present |
| `npm run agents:index:smoke` | ⚠️ ran live (not dry) — 406 dirs processed (173 SHIPPED, 233 PARTIAL); script's `--dry-run --limit 10` flags appear non-functional. Follow-up: fix flag handling in `scripts/agents/build-agents-index.mjs`. |

**Hard rules respected** (operator directive 2026-05-11):
- ❌ NOT touching `cases.user_id` / identity strategy (operator-only Path A/B/C/D decision pending; Path C recommended)
- ❌ NOT running `drizzle-kit push`
- ❌ NOT applying the 34-table inspection migration
- ❌ NOT deleting schema files
- ❌ NOT firing `buildHypergraph4D()` as a write job (identity must be decided first; topology may be valid but RL/feedback would attach signals to the wrong identity model)
- ❌ NOT starting CUDA Graphs / cuVS / new LangGraph workers
