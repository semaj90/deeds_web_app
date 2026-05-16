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

What you’re missing
1. Phase 2B / 2C synthesis gates

You have:

25 passed
100 passed
250 pending
500 pending

Add explicit pass/fail criteria for each synthesis batch:

[ ] atlas:validate passes
[ ] atlas:root:full passes
[ ] no forbidden fields persisted
[ ] GPU does not OOM
[ ] summaries include sourceRefs
[ ] Qdrant glyph/context upserts succeed
[ ] Redis summary cards stay small
[ ] Engram remains low_hint only
[ ] report written to docs/graph/karpathy-synthesis-scale-report.json
2. Directory summary miss classification

This is the biggest missing item from your TODO.

You already saw:

directory summary dry-run: 11 / 44

Add this:

## Phase 2A.1: Directory Summary Quality
- [ ] Classify every directory summary target:
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
- [ ] Skip noisy directories: docs/graph, logs, archives, backups, .cache, dist, build, coverage, .svelte-kit.
- [ ] Add caps: max files per dir, max bytes per dir, max chunks per file.
- [ ] Replace raw 11/44 metric with categorized outcome report.

Without that, you will not know whether synthesis quality is improving or just skipping unknown stuff.

3. Candidate dedupe and scoring policy

Add:

## Phase 2A.2: Candidate Quality
- [ ] Cap chunks per file: 3–5.
- [ ] Cap files per directory: 10–20.
- [ ] Cap candidates per cluster: 25–50.
- [ ] Persist candidate quality report:
  - path
  - qdrantPointId
  - stable_key / file_path
  - pagerank
  - graphAuthority
  - qdrantScore
  - attentionScore
  - finalScore
  - clusterAlias
  - sourceRefs

And define your score blend:

finalScore =
  0.40 * attentionScore
+ 0.25 * graphAuthority
+ 0.20 * qdrantScore
+ 0.10 * clusterActivity
+ 0.05 * engramHint
4. Qdrant collection safety

You mention on-disk HNSW, but add a rollback/copy safety step:

## Phase 3.1: Qdrant Safety
- [ ] Snapshot/export Qdrant collection metadata before changing HNSW/quantization settings.
- [ ] Apply on_disk HNSW only after backup/snapshot.
- [ ] Keep codebase_chunks_768 as canonical high-fidelity recall.
- [ ] Apply binary quantization only to derived collections first:
  - codebase_chunks_64d
  - glyph_atlas
  - task_distillates
5. Neo4j rollback and constraints audit

Neo4j is optimized now, but add:

## Phase 3.2: Neo4j Safety
- [ ] Export constraint/index list after optimization.
- [ ] Add rollback-by-runId or rollback-by-snapshot script.
- [ ] Add graph count report:
  - labels
  - relationship types
  - orphan nodes
  - duplicate IDs
6. CouchDB view/index health

Add:

## Phase 3.3: CouchDB MapReduce Health
- [ ] Verify all views exist:
  - by_type
  - by_workspace
  - by_cluster
  - by_feature
  - by_route
  - by_tag
  - by_updated_at
  - stale_docs
- [ ] Add stale document cleanup plan.
- [ ] Add deterministic _id conflict report.
7. Redis memory / TTL policy

Redis could quietly grow.

Add:

## Phase 3.4: Redis Cache Policy
- [ ] Define TTLs for rebuildable cards.
- [ ] Keep permanent only:
  - critical cluster aliases
  - small Engram low_hint cards
  - essential ACE feature cards
- [ ] Add Redis memory report using SCAN, not KEYS.
- [ ] Add eviction policy check.
8. Karpathy synthesis report

Add a separate Phase 2 report file:

docs/graph/karpathy-synthesis-scale-report.json

Track:

{
  "runId": "karpathy-stage-2b-250",
  "limit": 250,
  "candidates": 250,
  "summariesWritten": 0,
  "directoriesConsidered": 0,
  "directoriesSummarized": 0,
  "directoriesSkipped": {},
  "qdrantHits": 0,
  "neo4jGdsNodes": 0,
  "gpuUsed": true,
  "gpuPeakVramMb": null,
  "forbiddenFields": 0,
  "atlasValidate": "passed",
  "rootDryRun": "passed"
}
9. Legal-AI product wiring

Your TODO stops at infrastructure. Add a product bridge:

## Phase 4: Legal-AI Product Wiring
- [ ] Wire HyperRAG/Parent Atlas into Admin Copilot retrieval explanation UI.
- [ ] Surface:
  - graph paths
  - cluster aliases
  - Engram hints used
  - sourceRefs
  - trust tier
- [ ] Add CrimeAnalysisService plan-only mode:
  - what happened
  - who is involved
  - why / motive hypotheses
  - how / mechanism
  - evidence gaps
  - next documents needed
- [ ] Ensure legal outputs separate:
  - facts
  - claims
  - inferences
  - unknowns
  - citations/sourceRefs
Updated TODO section to add

Paste this into TODO_ATLAS.md:

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
  - node_modules
  - .git
  - .svelte-kit
  - dist
  - build
  - coverage
  - .cache
  - tmp
  - logs
  - archive / archives
  - backup / backups
  - docs/graph
  - docs/reports
- [ ] Add directory caps:
  - max files per dir: 40
  - max bytes per dir: 250000
  - summary timeout: 60000ms
- [ ] Add timeout diagnostics:
  - directory
  - fileCount
  - totalBytes
  - timeoutMs
  - recommendation
- [ ] Add candidate dedupe:
  - max chunks per file: 3–5
  - max files per directory: 10–20
  - max candidates per cluster: 25–50
## Phase 2D: Karpathy Synthesis Reporting
- [ ] Create `docs/graph/karpathy-synthesis-scale-report.json`.
- [ ] Track each synthesis run:
  - runId
  - limit
  - candidates
  - qdrantHits
  - summariesWritten
  - directoriesConsidered
  - directoryOutcomes
  - glyphAtlasUpserts
  - Redis cards written
  - GPU peak VRAM
  - forbiddenFields
  - atlasValidate status
  - rootDryRun status
- [ ] Commit report after each successful stage:
  - 100
  - 250
  - 500
## Phase 3B: Rollback / Cleanup Safety
- [ ] Add Qdrant payload patch rollback report.
- [ ] Add Neo4j delete-by-runId or delete-by-snapshot command.
- [ ] Add CouchDB stale document cleanup plan.
- [ ] Add Redis SCAN-based cleanup script for a runId.
- [ ] Add `atlas:rollback:dry-run`.
## Phase 4: Legal-AI Product Integration
- [ ] Surface Parent Atlas provenance in Admin Copilot.
- [ ] Show:
  - Qdrant sourceRefs
  - Neo4j graph paths
  - cluster aliases
  - Engram low_hint usage
  - trust tier
  - retrieval lane breakdown
- [ ] Add CrimeAnalysisService plan-only mode.
- [ ] Separate facts, allegations, inferences, unknowns, and sourceRefs.
Codex prompt
You are working in:
C:\Users\james\Videos\deeds-web-app
## Phase 2A.0: Canonical Path Identity Gate
- [ ] Add shared path helpers used by both `neo4j-graph-enrich.mjs` and `karpathy-gpu-enrich.mjs`:
  - `normalizeRepoPath(value)`
  - `getPayloadPath(payload)`
  - `getNeo4jPath(record)`
  - `qdrantPathVariants(path)`
- [ ] Make `normalizeRepoPath()` idempotent:
  - normalize `\` to `/`
  - remove `file:` and `stable:` prefixes
  - remove leading `./`
  - remove `deeds-web-app/` and `sveltekit-frontend/` prefixes
  - collapse duplicate slashes
  - do **not** force `src/` prefix
- [ ] Support all path aliases:
  - `file_path`
  - `filePath`
  - `relativePath`
  - `relative_path`
  - `path`
  - `source_path`
  - `source`
  - `file`
  - `filepath`
  - `stable_key`
  - `stableKey`
- [ ] Update `fetchEmbeddingsBatch()` to query Qdrant using all path aliases.
- [ ] Include both path variants:
  - `src/lib/server/db/connections.ts`
  - `sveltekit-frontend/src/lib/server/db/connections.ts`
- [ ] Add path audit diagnostics:
  - raw path
  - `stableKey`
  - `file_path`
  - normalized path
  - Qdrant variants
  - hit/miss reason
- [ ] Add self-test using:
  - `src/lib/server/db/connections.ts`
  - `sveltekit-frontend/src/lib/server/db/connections.ts`
  - `./src/lib/server/db/connections.ts`
  - `src\\lib\\server\\db\\connections.ts`
  - `file:src/lib/server/db/connections.ts`
  - `stable:src/lib/server/db/connections.ts`
  - `scripts/atlas/project-neo4j-graphrag.mjs`


## Task: Finish the missing TODO_ATLAS hardening for Phase 2 Karpathy Synthesis and Phase 3 memory optimization, context:
Phase 1 Parent Atlas Safe Write Mode is complete:
- Stage 5 Full Monorepo Sweep passed.
- RunID: atlas-full-payload-sweep-004.
- Redis, CouchDB, Neo4j, Qdrant, and Engram are synchronized.
- atlas:validate returns missing=0.
- atlas:root:full dry-run parity passes.
- Neo4j batching reduced projection of ~69k edges to ~11.5 seconds.
- Qdrant path alias bug was fixed.
- Phase 2A 100-candidate synthesis passed, but directory summary reporting still shows an unclear 11/44 hit rate.

Rules:
- Do not rollback Phase 1 ingestion.
- Do not run full 32k synthesis.
- Do not increase summary timeout globally as the first fix.
- Do not store hiddenThoughts, chainOfThought, reasoning_content, kv_cache, tensor, cudaPointer, rope, raw reasoning, or raw vectors in browser output.
- Keep Engram low_hint only.
- Keep synthesis batches small.
- Keep codebase_chunks_768 as canonical high-fidelity recall.
- Binary quantization is experimental and only for derived collections.
- GPU use must stay scoped to synthesis batches.

Implement:
1. Update TODO_ATLAS.md with missing phases:
   - Phase 2A.1 Directory Summary Quality Gate
   - Phase 2D Karpathy Synthesis Reporting
   - Phase 3B Rollback / Cleanup Safety
   - Phase 4 Legal-AI Product Integration

2. Update scripts/graphify/graphify-cluster-summaries.mjs:
   - Classify every directory target outcome:
     summarized
     skipped_generated_dir
     skipped_archive_or_log
     skipped_too_many_files
     skipped_too_many_bytes
     no_qdrant_points
     no_source_files
     timeout
     cache_unchanged
     summary_failed
   - Add skip filters:
     node_modules, .git, .svelte-kit, dist, build, coverage, .cache, tmp, logs, archives, backups, docs/graph, docs/reports.
   - Add caps:
     --max-files-per-dir=40
     --max-bytes-per-dir=250000
     --summary-timeout-ms=60000
   - Add timeout diagnostics:
     directory, fileCount, totalBytes, timeoutMs, recommendation.
   - Add progress logging:
     current/total, summarized, skipped, failed, rate, ETA.

3. Add candidate dedupe to the Karpathy synthesis path:
   - max chunks per file: 3–5
   - max files per directory: 10–20
   - max candidates per cluster: 25–50
   - ensure candidate records include:
     path, qdrantPointId, stable_key/file_path, pagerank, graphAuthority, qdrantScore, attentionScore, finalScore, clusterAlias, sourceRefs.

4. Add `docs/graph/karpathy-synthesis-scale-report.json`.
   Track:
   - runId
   - limit
   - candidates
   - qdrantHits
   - summariesWritten
   - directoriesConsidered
   - directoryOutcomes
   - glyphAtlasUpserts
   - redisCardsWritten
   - gpuPeakVramMb
   - forbiddenFields
   - atlasValidate
   - rootDryRun

5. Add rollback/cleanup dry-run scripts or TODO stubs:
   - scripts/atlas/rollback-atlas-run.mjs
   - supports --runId and --dry-run
   - reports what would be removed from Redis/CouchDB/Neo4j/Qdrant.

6. Add product integration notes:
   - docs/architecture/legal-ai-parent-atlas-product-integration.md
   - explain Admin Copilot retrieval provenance:
     Qdrant sourceRefs
     Neo4j graph paths
     cluster aliases
     Engram low_hint usage
     trust tier
     lane breakdown
   - explain CrimeAnalysisService plan-only mode:
     facts
     allegations
     inferences
     unknowns
     sourceRefs

Validation:
- node --check passes for edited scripts.
- Stage 2A rerun:
  node scripts/graphify/graphify-batch-karpathy-analysis.mjs --limit=100 --progress-every=10 --force
- 11/44 is replaced by a categorized directory outcome report.
- Generated/log/archive directories are skipped intentionally.
- Source directories are summarized or fail with actionable reasons.
- Qdrant candidate lookup remains fast.
- atlas:validate passes.
- atlas:root:full passes.
- forbiddenFields=0.
- Engram remains low_hint only.

Return:
- files changed
- commands run
- tests passed/failed/skipped
- blockers
- next commit message

Recommended commit:

fix(graphify): classify directory summary misses and add synthesis scale reporting

Then:

docs(atlas): extend TODO with rollback and legal product integration phases

Bottom line: your TODO is strong. The biggest missing operational item is turning 11/44 into an explainable categorized outcome report, then tracking synthesis stages in their own report file.