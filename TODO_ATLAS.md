# TODO: Parent Atlas Pipeline Hardening & Memory Optimization

## Phase 0: Pre-Scale Safety Gate
- [x] **Commit Milestone**: Commit the canary-proven safety layer (RunID: `run_1778883133370`).
- [x] **Network Health**: SearXNG (8889), SeaweedFS (8888).
- [x] **Validation Pass**: Manifest validation and dry-run parity passed.
- [x] **Operating Mode**: `ATLAS_SKIP_LLM`, `ATLAS_SKIP_EMBEDDINGS`, and `ATLAS_SKIP_GPU` verified.

## Phase 1: Production Scaling (Safe Write Mode)
- [x] **Stage 1: Scale 500** (RunID: `atlas-scale-500-001`) - **PASSED**
- [x] **Stage 2: Scale 2000** (RunID: `atlas-scale-2000-001`) - **PASSED**
- [x] **Stage 3: Scale 5000** (RunID: `atlas-scale-5000-001`) - **PASSED**
- [x] **Stage 4: Full Workspace Batch** (RunID: `atlas-scale-10000-001`) - **PASSED**
- [x] **Stage 5: Full Monorepo Sweep** (RunID: `atlas-full-payload-sweep-004`) - **PASSED**
    - [x] **Neo4j Optimized**: Batching (500-1000) reduced runtime to 11.5s.
    - [x] **Qdrant Recovery**: Syntax error resolved; 2,253 point sets patched.
    - [x] **Parity Validation**: `npm run atlas:validate` returns missing=0.

## Phase 2: Operating Profiles & Hardware Safety
### 1. Safe Atlas Write Mode (High RAM, No GPU) - **STABLE**
- [x] **VRAM Safety**: LLM/Embedding stack disabled.
- [x] **Node Tuning**: `$env:NODE_OPTIONS="--max-old-space-size=8192"`

### 2. Karpathy Synthesis Mode (GPU Enabled, Scoped Limits) - **IN PROGRESS**
- [x] **Canary (25)**: Karpathy synthesis canary over parent atlas passed.
- [x] **Stage 2A (100)**: Gradual scaling (RunID: `stage-2a-100`) - **PASSED**
- [ ] **Stage 2B (250)**: Intermediate scaling (Next step).
- [ ] **Stage 2C (500)**: Final scaling phase.
- [ ] **Gemma4 Profile**: 4B–9B quants, 4k–8k context.

### 3. Docker Infrastructure (Recommended Limits for 20GB RAM)
- [x] **Qdrant**: `mem_limit: 3g`
- [x] **Neo4j**: `mem_limit: 6g`
- [x] **Postgres**: `mem_limit: 2g`
- [x] **CouchDB / Redis**: `mem_limit: 1g` each

## Phase 3: Memory Optimization
### 1. Qdrant / TurboVEC
- [ ] **On-Disk HNSW Index**: Set `on_disk: true` for the canonical `codebase_chunks_768`.
- [ ] **Experimental Binary Quantization**: Test on secondary collections.

### 2. Pipeline Streaming
- [ ] **JSONStream Integration**: Refactor `index-repo-root.mjs` to stream the 400MB+ codebase graph.

---
**Verified Status**: Full Monorepo Sweep Successful (RunID: `atlas-full-payload-sweep-004`)
**Hardware Reality (RTX 3060 Ti 8GB)**:
- Atlas Writes: Optimized via batching (10k+ nodes/edges in <15s).
- LLM Synthesis: Requires small models/scoped batches.
- Big Bang Synthesis: Not realistic; use lane-by-lane ingestion.
- **GPU Offload Ladder (RTX 3060 Ti 8GB)**:
    - `TURBO_NGL=20` (Safe, low VRAM)
    - `TURBO_NGL=28` (Stable)
    - `TURBO_NGL=35` (**Recommended Default**)
    - `TURBO_NGL=45` (Pushing limits)
    - `TURBO_NGL=99` (Only if VRAM is stable / small model)

## Phase 2A.1: Directory Summary Quality Gate
- [ ] Replace raw `11/44` directory summary metric with categorized outcomes.
- [ ] Add outcome categories:
  - summarized
  - skipped_generated_dir
  - skipped_archive_or_log
  - skipped_too_many_files
  - skipped_too_many_bytes
  - no_qdrant_points
  - no_source_files
  - timeout
  - cache_unchanged
  - summary_failed
- [ ] Skip noisy directories:
  - node_modules, .git, .svelte-kit, dist, build, coverage, .cache, tmp, logs, archive, backup, docs/graph, docs/reports.
- [ ] Add directory caps:
  - max files per dir: 40
  - max bytes per dir: 250,000
  - summary timeout: 60,000ms
- [ ] Add timeout diagnostics: directory, fileCount, totalBytes, timeoutMs, recommendation.
- [ ] Add candidate dedupe:
  - max chunks per file: 3–5
  - max files per directory: 10–20
  - max candidates per cluster: 25–50

## Phase 2D: Karpathy Synthesis Reporting
- [ ] Create `docs/graph/karpathy-synthesis-scale-report.json`.
- [ ] Track each synthesis run: runId, limit, candidates, qdrantHits, summariesWritten, directoriesConsidered, directoryOutcomes, glyphAtlasUpserts, Redis cards, GPU peak VRAM, forbiddenFields, atlasValidate, rootDryRun.
- [ ] Commit report after each successful stage: 100, 250, 500.

## Phase 3B: Rollback / Cleanup Safety
- [ ] Add Qdrant payload patch rollback report.
- [ ] Add Neo4j delete-by-runId or delete-by-snapshot command.
- [ ] Add CouchDB stale document cleanup plan.
- [ ] Add Redis SCAN-based cleanup script for a runId.
- [ ] Add `atlas:rollback:dry-run`.

## Phase 3: Post-Synthesis Quality Review (RunID: `stage-2c-500`)
- [ ] **Authority Audit**: Verify PageRank scores in Neo4j align with perceived file importance.
- [ ] **Summary Verification**: Inspect `docs/graph/repo-neo4j-graphrag-report.json` for synthesis drift.
- [ ] **Embedding Parity**: Ensure Qdrant `codebase_chunks_768` payloads contain accurate `sourceRefs`.

## Phase 4: Admin Copilot UI Integration
- [x] **Provenance Display**: Show Qdrant `sourceRefs` and Neo4j graph paths in search results.
- [ ] **Cluster Visualization**: Integrate 4D manifold cluster aliases into the UI.
- [ ] **Direct Edit**: Enable operators to promote/demote synthesis trust tiers.
- [x] **Multi-Lane Retrieval**: Surface Local + External docs with trust markers.
- [x] **Action Suggestions**: Integrated `trace.command_suggest` into the chat panel.

## Phase 5: Neo4j Enhanced Synthesis + Feature Command Atlas
- [ ] **Feature Registry**: Reconcile core architectural features with code-based evidence.
- [ ] **Command Mapping**: Bridge features to safe, allowlisted MCP commands.
- [ ] **Synthetic Evidence**: Generate concept cards for undocumented local patterns.

## Phase 6: Programming Docs Atlas
- [x] **Registry**: Tier 1/2 sources defined in `programming-doc-sources.json`.
- [x] **Ingestion Plane**: Crawl/Normalize/Chunk/Index scripts created.
- [x] **Data Lake**: Initialize `external_programming_docs_768` in Qdrant.
- [x] **Crawl (Canary)**: Execute dry-run for SvelteKit 2.
- [x] **Concept Graph**: Project nodes/edges into Neo4j.
- [x] **Gap Report**: Generate first `programming-doc-feature-gap-report.json`.
- [x] **MCP Surface**: `trace.docs_search` and `trace.docs_compare_feature` added.
- [x] **Product Integration**: Surface external sourceRefs in Admin Copilot.
- [x] **Governance**: Versioned sources and `external_unverified` tagging enforced.

## Phase 7: Knowledge-Base Retrieval Flow
- [ ] **Multi-Lane Retrieval**: Combine Parent Atlas (Local) + Docs Atlas (External) + Web (Unverified).
- [ ] **Reranking**: Use PageRank and Feature Authority to boost canonical sources.
- [ ] **Synthesis**: Gemma4 generates answers only after `sourceRefs` are collected.

## Phase 8: Immediate Next Steps
- [x] **Validate Infrastructure**: `node scripts/atlas/validate-model-endpoints.mjs`.
- [x] **Neo4j Commit**: Run the write-enabled projection for SvelteKit canary data.
- [x] **Drizzle Crawl**: Start Tier 1 expansion with Drizzle ORM docs.
- [ ] **Tier 1 Expansion**: Ingest TypeScript 5.4, Node.js 22, and PostgreSQL 16 docs.
## Phase 6E: Cross-Layer Contract Audit (2026-05-16)
- [x] **Orchestrator**: `scripts/atlas/audit-contract-map.mjs` — 8-layer cross-layer contract auditor.
- [x] **Service Health Gate**: `scripts/atlas/validate-dev-services.mjs` — TCP probe for all 10 dev services.
- [x] **Drizzle/Postgres Contract**: `scripts/atlas/audit-drizzle-postgres-contracts.mjs` — schema drift, FK mismatch, unsafe writes.
- [x] **pgvector Audit**: `scripts/atlas/audit-pgvector-schema.mjs` — extension, HNSW indexes, dim validation.
- [x] **Drizzle Meta Hygiene**: `scripts/atlas/audit-drizzle-meta-hygiene.mjs` — non-JSON file detector + `--fix` mover.
- [x] **Form Contracts**: `scripts/atlas/audit-sveltekit-form-contracts.mjs` — Superforms v2, Zod, SSR safety.
- [x] **Error-Fix DAG**: `scripts/atlas/build-error-fix-dag.mjs` — KAG recall + HMM state topological fix order.
- [x] **Playwright E2E**: `sveltekit-frontend/tests/e2e/contract-network.spec.ts` — API shape, CORS, SSE, 500-error gate.
- [ ] **build-atlas-index.mjs**: Harden against Postgres being offline (DONE — fail-open `.catch()` added at line 67).
- [ ] **Redis KAG recall**: Populate `ace:fixer:patterns:<hmmState>` keys with past fix summaries for each error state.
- [ ] **CI gate**: Wire `npm run audit:contracts --strict` as a pre-merge check blocking on high-severity findings.

## Phase 6E Follow-up Findings (2026-05-16)
- [x] Document manual sidecar SQL migrations in `sveltekit-frontend/drizzle/sidecar-migrations.json`.
- [x] Update audit logic: `documented_sidecar` (low/info) vs `unknown_unjournaled_sql` (medium/fail).
- [x] Replace legacy `pgvector/drizzle-orm` imports with `drizzle-orm/pg-core` in 4 schema files.
- [x] Generate `docs/reports/pgvector-index-plan.md` with reviewed HNSW index SQL (operator must apply).
- [ ] Apply `docs/reports/pgvector-index-plan.md` migration after Docker Postgres is confirmed up (operator gate).
- [ ] Add `20260516_hnsw_indexes.sql` to `sidecar-migrations.json` once applied.
- [ ] Run `npm run audit:pgvector` and confirm `hnsw_indexes` check passes.
- [ ] Run `npm run audit:contracts` before every schema migration going forward.

## Phase 6E Operator Gates (2026-05-16)
- [ ] **Postgres reachability**: `docker ps --filter "name=legal-ai-postgres"` + `Test-NetConnection 127.0.0.1 -Port 5434` before applying HNSW migrations.
- [ ] **HNSW index migration**: After Postgres confirmed healthy, apply `docs/reports/pgvector-index-plan.md` SQL in a dedicated commit (`feat(db): add reviewed hnsw indexes for vector tables`).
- [ ] **Update sidecar manifest**: Add `20260516_hnsw_indexes.sql` to `sveltekit-frontend/drizzle/sidecar-migrations.json` once applied.
- [ ] **Vector dimension policy**: `rg 'dimensions.*384' sveltekit-frontend/src/lib/server/db/` — confirm whether 384-dim columns exist and document them in ALLOWED_DIMS (384 = warden/GPU-cache lane, 768 = canonical codebase lane).
- [ ] **Update pgvector auditor**: If 384-dim is confirmed intentional, add to `ALLOWED_DIMS` in `scripts/atlas/audit-pgvector-schema.mjs`.
- [ ] **Graceful offline degradation**: Ensure live Postgres checks in all auditors degrade to SKIP/WARN (not crash) when Docker is offline — verify with `npm run audit:pgvector`, `npm run audit:contracts`, `npm run audit:drizzle-meta`.
- [ ] **Full validation sequence** (when Docker is up): `npm run services:health && npm run audit:contracts && npm run audit:pgvector && npm run audit:drizzle-meta && npm run atlas:validate && npm run atlas:root:full`
