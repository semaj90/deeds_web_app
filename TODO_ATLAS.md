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

### 2. Karpathy Synthesis Mode (GPU Enabled, Scoped Limits) - **NEXT**
- [ ] **Constraints**: Limit to 25-100 files per run on RTX 3060 Ti.
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
