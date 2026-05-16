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

## Phase 4: Legal-AI Product Integration
- [ ] Surface Parent Atlas provenance in Admin Copilot.
- [ ] Show: Qdrant sourceRefs, Neo4j graph paths, cluster aliases, Engram low_hint, trust tier, lane breakdown.
- [ ] Add CrimeAnalysisService plan-only mode.
- [ ] Separate facts, allegations, inferences, unknowns, and sourceRefs.