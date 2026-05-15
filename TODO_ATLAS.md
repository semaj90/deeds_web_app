# TODO: Parent Atlas Pipeline Hardening & Memory Optimization

## Phase 0: Pre-Scale Safety Gate
- [x] **Commit Milestone**: Commit the canary-proven safety layer (RunID: `run_1778883133370`).
- [ ] **Network Health**:
    - [ ] Confirm SearXNG moved to port 8889.
    - [ ] Confirm SeaweedFS Filer remains on port 8888.
- [ ] **Validation Pass**:
    - [ ] `npm run atlas:manifest:validate` passes.
    - [ ] `npm run atlas:root:full` dry-run passes.
- [ ] **Operating Mode**: Confirm `ATLAS_SKIP_LLM`, `ATLAS_SKIP_EMBEDDINGS`, and `ATLAS_SKIP_GPU` are enabled for datastore writes.

## Phase 1: Production Scaling (Safe Write Mode)
- [ ] **Stage 1: Scale 500** (RunID: `atlas-scale-500-001`)
    - [ ] `npm run atlas:manifest:create`
    - [ ] Run writes (Redis → CouchDB → Neo4j → Qdrant → Engram)
- [ ] **Stage 2: Scale 2000** (RunID: `atlas-scale-2000-001`)
- [ ] **Stage 3: Scale 5000**
- [ ] **Stage 4: Full Workspace Batch** (~32,135 payloads)

## Phase 2: Operating Profiles & Hardware Safety
### 1. Safe Atlas Write Mode (High RAM, No GPU)
- [ ] **VRAM Safety**: LLM/Embedding stack disabled to prevent OOM during massive DB I/O.
- [ ] **Node Tuning**: `$env:NODE_OPTIONS="--max-old-space-size=8192"`

### 2. Karpathy Synthesis Mode (GPU Enabled, Scoped Limits)
- [ ] **Constraints**: Limit to 25-100 files per run on RTX 3060 Ti.
- [ ] **Gemma4 Profile**: 4B–9B quants, 4k–8k context; avoid 27B full offload on 8GB VRAM.

### 3. Docker Infrastructure (Recommended Limits for 20GB RAM)
- [ ] **Qdrant**: `mem_limit: 3g`
- [ ] **Neo4j**: `mem_limit: 6g` (Heap: 2G/4G, PageCache: 1G)
- [ ] **Postgres**: `mem_limit: 2g`
- [ ] **CouchDB / Redis**: `mem_limit: 1g` each

## Phase 3: Memory Optimization
### 1. Qdrant / TurboVEC
- [ ] **On-Disk HNSW Index**: Set `on_disk: true` for the canonical `codebase_chunks_768` collection to reduce RAM pressure.
- [ ] **Experimental Binary Quantization**: Test on secondary collections (`codebase_chunks_64d`, `glyph_atlas`) only; keep 768d canonical for high-fidelity recall.

### 2. Pipeline Streaming
- [ ] **JSONStream Integration**: Refactor `index-repo-root.mjs` to stream the 400MB+ codebase graph.

---
**Verified Status**: Canary Batch Successful (RunID: `run_1778883133370`)
**Hardware Reality (RTX 3060 Ti 8GB)**:
- Atlas Writes: Safe with RAM allocation (16-32GB).
- LLM Synthesis: Requires small models/scoped batches.
- Big Bang Synthesis: Not realistic; use lane-by-lane ingestion.
