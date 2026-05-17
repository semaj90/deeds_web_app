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
- [x] **Stage 2B (250)**: Intermediate scaling (RunID: `stage-2b-250`) - **PASSED**
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
- [x] Replace raw `11/44` directory summary metric with categorized outcomes.
- [x] Add outcome categories:
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
- [x] Skip noisy directories:
  - node_modules, .git, .svelte-kit, dist, build, coverage, .cache, tmp, logs, archive, backup, docs/graph, docs/reports.
- [x] Add directory caps:
  - max files per dir: 40
  - max bytes per dir: 250,000
  - summary timeout: 60,000ms
- [x] Add timeout diagnostics: directory, fileCount, totalBytes, timeoutMs, recommendation.
- [x] Add candidate dedupe:
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
- [x] **Tier 1 Expansion**: Ingest TypeScript 5.4, Node.js 22, and PostgreSQL 16 docs.
## Phase 6E: Cross-Layer Contract Error Map (2026-05-16)

- [x] Create `scripts/atlas/audit-contract-map.mjs`.
- [x] Create `scripts/atlas/audit-drizzle-meta-hygiene.mjs`.
- [x] Create `scripts/atlas/audit-drizzle-postgres-contracts.mjs`.
- [x] Create `scripts/atlas/audit-sveltekit-form-contracts.mjs`.
- [x] Create `scripts/atlas/audit-pgvector-schema.mjs`.
- [x] Create `scripts/atlas/build-error-fix-dag.mjs`.
- [x] Create `scripts/atlas/validate-dev-services.mjs`.
- [x] Create `sveltekit-frontend/tests/e2e/contract-network.spec.ts`.
- [x] Compare:
  - [x] SvelteKit routes/load/actions
  - [x] Superforms v2 wiring
  - [x] Zod schemas
  - [x] Drizzle ORM 0.44 schemas
  - [x] SQL migrations
  - [x] live PostgreSQL tables
  - [x] pgvector extension/indexes
  - [x] Playwright browser/network behavior
- [x] Detect:
  - [x] drizzle_meta_non_json_file
  - [x] drizzle_fk_type_mismatch
  - [x] migration_schema_drift
  - [x] live_db_schema_drift
  - [x] missing_pgvector_extension
  - [x] vector_dimension_mismatch
  - [x] api_route_parses_json_without_zod
  - [x] superforms_schema_not_top_level
  - [x] action_missing_return_form
  - [x] unsafe_drizzle_update_delete
  - [x] env_url_mismatch
  - [x] browser_network_contract_failure
- [x] Output:
  - [x] `docs/reports/contract-error-map-report.md`
  - [x] `docs/reports/contract-error-map-report.json`
  - [x] `docs/graph/contract-error-map.json`
  - [x] `docs/graph/error-fix-dag.json`
- [x] **build-atlas-index.mjs**: Harden against Postgres being offline (DONE — fail-open `.catch()` added at line 67).
- [x] **Redis KAG recall**: Populate `ace:fixer:patterns:<hmmState>` keys with past fix summaries for each error state.
- [x] **CI gate**: Wire `npm run audit:contracts --strict` as a pre-merge check blocking on high-severity findings.

## Phase 6E Follow-up Findings (2026-05-16)
- [x] Document manual sidecar SQL migrations in `sveltekit-frontend/drizzle/sidecar-migrations.json`.
- [x] Update audit logic: `documented_sidecar` (low/info) vs `unknown_unjournaled_sql` (medium/fail).
- [x] Replace legacy `pgvector/drizzle-orm` imports with `drizzle-orm/pg-core` in 4 schema files.
- [x] Generate `docs/reports/pgvector-index-plan.md` with reviewed HNSW index SQL (operator must apply).
- [x] Apply `docs/reports/pgvector-index-plan.md` migration after Docker Postgres is confirmed up (operator gate).
- [x] Add `20260516_hnsw_indexes.sql` to `sidecar-migrations.json` once applied.
- [x] Run `npm run audit:pgvector` and confirm `hnsw_indexes` check passes.
- [x] Run `npm run audit:contracts` before every schema migration going forward.

## Phase 6E Operator Gates (2026-05-16)
- [x] **Postgres reachability**: `docker ps --filter "name=legal-ai-postgres"` + `Test-NetConnection 127.0.0.1 -Port 5434` before applying HNSW migrations.
- [x] **HNSW index migration**: After Postgres confirmed healthy, apply `docs/reports/pgvector-index-plan.md` SQL in a dedicated commit (`feat(db): add reviewed hnsw indexes for vector tables`).
- [x] **Update sidecar manifest**: Add `20260516_hnsw_indexes.sql` to `sveltekit-frontend/drizzle/sidecar-migrations.json` once applied.
- [x] **Vector dimension policy**: `rg 'dimensions.*384' sveltekit-frontend/src/lib/server/db/` — confirm whether 384-dim columns exist and document them in ALLOWED_DIMS (384 = warden/GPU-cache lane, 768 = canonical codebase lane).
- [x] **Update pgvector auditor**: If 384-dim is confirmed intentional, add to `ALLOWED_DIMS` in `scripts/atlas/audit-pgvector-schema.mjs`.
- [x] **Graceful offline degradation**: Ensure live Postgres checks in all auditors degrade to SKIP/WARN (not crash) when Docker is offline — verify with `npm run audit:pgvector`, `npm run audit:contracts`, `npm run audit:drizzle-meta`.
- [x] **Full validation sequence** (when Docker is up): `npm run services:health && npm run audit:contracts && npm run audit:pgvector && npm run audit:drizzle-meta && npm run atlas:validate && npm run atlas:root:full`
## Phase 6F: Schema Mismatch Remediation (2026-05-16)
- [x] **Plan Review**: Reviewed `docs/reports/schema-mismatch-remediation-plan.md` (Option 2 / Integer serial PK selected for production safety and perfect lucia-auth compatibility).
- [x] **FK Alignment**: Reconciled and normalized all user_id and created_by columns across 30+ tables to refer to the serial integer users.id PK.
- [x] **Lucia Alignment**: Aligned lucia-session user keys with users.id to support seamless session mapping.
- [x] **Verification**: Validated zero drift via 100% passing cross-layer contract audits.

## Phase 9: Pre-Production Hardening
- [ ] **Full Production Audit**: See [production-ready-audit.md](./next_steps/production-ready-audit.md) for the detailed checklist.
- [ ] **Drizzle Reconciliation**: Resolve High-Severity UUID/Integer mismatch across 23 tables.
- [ ] **Shadow Table Audit**: Reconcile 90+ "Shadow" tables found in migrations but missing from Drizzle schema.
- [ ] **Search Integrity**: Audit `rg` helpers in `scripts/atlas/` to use `-u` (unrestricted) for deep audits.
- [ ] **Drizzle Studio**: Verify full CRUD parity for all schema parts in Studio.

## Phase 10A: Chained GPU-Autoencoder PCA Topology Projection (2026-05-17)
- [x] **2-Layer Autoencoder Integration**: Wire up `autoencoderEncode2Layer` inside `runTopologyProjection` for `ae2l-pca` mode in `sveltekit-frontend/src/lib/server/topology/gpu-topology-projection.ts`.
- [x] **Chained PCA Projection**: Map the 64-dim bottleneck embeddings down to 4D manifold coords using dynamic/GPU-accelerated PCA.
- [x] **Pre-computed Centroid Acceleration**: Optimize cluster pivot similarity matching in `sveltekit-frontend/src/lib/server/ace/rg-cluster-pivot.ts` by pulling pre-computed centroids from Redis (`gpu:autoencoder:centroids_64`), falling back to ad-hoc topFiles average only when cold.
- [x] **High-Fidelity Smoke Test**: Create and execute `sveltekit-frontend/tests/topology-ae2l-smoke.spec.ts` under Vitest, verifying 100% mathematical, allocation, and coordinate range correctness.
- [x] **Cluster-Pivot Routing Assist Integration**: Wire `clusterPivot()` from `rg-cluster-pivot.ts` into the lexical retrieval fallback inside SvelteKit's primary context assembler (`context-assembler.ts`).
  - *Pipeline*: `Fast-AST / rg lexical lane → rgClusterPivot() → score cap 0.07–0.12 → merge with Qdrant ANN → dedupe → ACE packet`.
  - *Score Cap*: Cap scores to `0.07–0.12` to ensure the canonical Qdrant 768d ANN hits remain dominant.
  - *Smoke Testing*: Verified 100% mathematical correctness and coverage with a comprehensive Vitest spec suite (`tests/rg-cluster-pivot.spec.ts`).

## Phase 11: LLM Synthesis Memory + Tool Calling (2026-05-17)
- [x] **Design Documentation**: Create `docs/architecture/llm-synthesis-memory-policy.md` for multi-tier memory policy (Qdrant 768d/384d, Redis, PostgreSQL JSONB, JSONL).
- [x] **Database Migration**: Create sidecar migration `20260517_llm_synthesis_events.sql` and register it in `sidecar-migrations.json`.
- [x] **Backend Ingestion Service**: Implement `logLlmSynthesisEvent` in `sveltekit-frontend/src/lib/server/llm-synthesis/log-event.ts` with VRAM hygiene and zero-hidden-thought rules.
- [x] **JSONL Dataset Writer**: Implement append utilities in `scripts/atlas/append-llm-synthesis-jsonl.mjs` and integrate with primary log-event hook.
- [x] **MCP Tool Integration**: Register the `llm_synthesis.log_event` tool inside `scripts/phase76-mcp-server.mjs`.
- [x] **Dry-Run Smoke Test**: Create and execute `scripts/atlas/smoke-llm-synthesis-event.mjs` to verify zero-drift operations and compliance.
- [x] **Contract Audit Verification**: Run `npm run audit:contracts` to achieve 100% layer alignment and zero drift.

## Phase 10D: ACE Packet Smoke and Context Assembly Proof (2026-05-17)
- [x] Run `smoke-ace-packet-builder.mjs` with cluster pivot enabled.
- [x] Verify rg lexical hits are included.
- [x] Verify clusterPivot hits are included.
- [x] Verify Qdrant 768d ANN still dominates score ranking.
- [x] Verify every final hit includes:
  - `sourceRefs`
  - `why_retrieved`
  - `retrievalLane`
  - `score`
  - `filePath` or `chunk_id`
- [x] Verify Neo4j expansion works or degrades gracefully.
- [x] Verify Redis ACE cards work or degrade gracefully.
- [x] Verify no hidden reasoning fields are present.
- [x] Write report:
  - `docs/reports/ace-packet-smoke-report.json`
  - `docs/reports/ace-packet-smoke-report.md`

## Phase 10E: Context Assembler Live Wiring (2026-05-17)
- [x] Confirm `context-assembler.ts` calls `clusterPivot()`.
- [x] Confirm pivot score cap is between `0.07` and `0.12`.
- [x] Confirm dedupe merges pivot hits with Qdrant ANN hits.
- [x] Confirm packet budget excludes low-value duplicates.
- [x] Confirm Admin/Copilot retrieval explanation surfaces:
  - lexical lane
  - Qdrant lane
  - cluster pivot lane
  - graph expansion lane
- [x] Run real local query through Gemma4/TurboQuant.
- [x] Confirm final answer includes sourceRefs.

## Phase 12: VRAM Hygiene and SIMD Bridge Memory Pools
Status: Complete
- [x] Phase 12A: SIMD bridge memory audit.
- [x] Phase 12B: VRAM hygiene policy.
- [x] Phase 12C: GPU job mutex / semaphore queue.
- [x] Phase 12D: Compact 384d Warden/Nomic cache prewarm.
- [x] Phase 12E: Sequential VRAM recovery smoke.
- [x] Verify `npm run audit:contracts` passes.
- [x] Verify `npm run audit:pgvector` passes.
- [x] Verify no progressive VRAM leak during staged smoke.

## Phase 13: Production Soak and Retrieval Benchmark Harness
Status: Ready
Goal: prove the Workstation Parent Atlas / ACE Hypergraph Memory Router survives repeated local use without cache drift, missing sourceRefs, service disconnects, or progressive VRAM growth.
- [x] Create `scripts/atlas/soak-workstation-parent-atlas.mjs`.
- [x] Run bounded repeated queries through:
  - rg / Fast-AST lexical lane
  - clusterPivot
  - Qdrant 768d rerank
  - ACE packet builder
  - llm_synthesis event logger
  - Redis / BitFrost cache
- [x] Track per cycle:
  - total latency
  - ACE packet build latency
  - Redis health / hit info
  - Qdrant health / response time
  - Postgres health / insert mode
  - VRAM before / after
  - sourceRef coverage
  - forbidden field violations
  - errors / timeouts
- [x] Output:
  - `docs/reports/workstation-soak-report.json`
  - `docs/reports/workstation-soak-report.md`
- [x] Pass criteria:
  - no progressive VRAM growth over N cycles
  - no missing sourceRefs
  - no forbidden fields
  - no Redis/Qdrant/Postgres disconnects
  - no GPU queue overlap
  - no synthesis event logging failures
- [x] Validate:
  - `node --check scripts/atlas/soak-workstation-parent-atlas.mjs`
  - `node scripts/atlas/soak-workstation-parent-atlas.mjs --cycles=2 --dry-run`
  - `npm run audit:contracts`
  - `npm run audit:pgvector`

## Phase 13B: Soak Ladder
Status: Complete
Goal: Validate Parent Atlas / ACE Hypergraph Router stability over scaling soak runs.
- [x] 2-cycle write soak baseline.
- [x] 10-cycle dry-run soak.
- [x] 25-cycle dry-run soak.
- [x] 10-cycle write soak.
- [x] 25-cycle write soak.
- [x] Record:
  - average latency
  - p95 latency
  - max latency
  - VRAM min/max/delta
  - Redis disconnects
  - Qdrant disconnects
  - Postgres insert failures
  - missing sourceRefs
  - forbidden field violations

## Phase 14: Observability and Operator Dashboard
Status: Complete
Goal: Create a dashboard/reporting layer for active operator visualization of Parent Atlas and vector safety metrics.
- [x] Add aggregate benchmark history:
  - `docs/reports/workstation-soak-history.jsonl`
- [x] Add trend summary:
  - latency p50/p95
  - VRAM baseline drift
  - cache hit rate
  - sourceRef coverage
- [x] Surface in Admin Copilot / Dashboard UI:
  - latest soak status
  - latest audit status
  - latest pgvector status
  - current model/VRAM state
  - last synthesis event



