# Parent Atlas Consolidation Inventory — File Mapping & Organization

**Date**: 2026-06-14  
**Status**: Cataloging existing code for package structure  
**Target**: 4-package architecture

---

## 📦 Planned Package Structure

```
deeds-web-app/
├── packages/
│   ├── parent-atlas-core/              # Identity, schemas, contracts
│   │   ├── src/
│   │   │   ├── identity/               # Lineage chain, packet types
│   │   │   ├── schemas/                # Zod + Drizzle types
│   │   │   ├── adapters/               # Postgres/Qdrant/Neo4j mirrors
│   │   │   └── index.ts                # Public API
│   │   └── package.json
│   │
│   ├── parent-atlas-ingest/            # Repo scanning, AST, packets
│   │   ├── src/
│   │   │   ├── scanner/                # Directory walker, gitignore
│   │   │   ├── parser/                 # Rust N-API bridge
│   │   │   ├── ast/                    # Symbol extraction
│   │   │   ├── pipeline/               # Ingest orchestration
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── parent-atlas-retrieval/         # Bifrost, TurboVec, GPU
│   │   ├── src/
│   │   │   ├── bifrost/                # L1/L2 caching
│   │   │   ├── turbovec/               # Prefilter + reranking
│   │   │   ├── gpu/                    # LibTorch N-API
│   │   │   ├── pipeline/               # Retrieval orchestration
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── parent-atlas-opencode/          # CLI plugin for OpenCode
│       ├── skills/
│       │   ├── atlas-search/SKILL.md
│       │   ├── atlas-analyze/SKILL.md
│       │   └── atlas-gpu-stats/SKILL.md
│       ├── src/
│       │   ├── commands/
│       │   └── index.ts
│       └── package.json
│
└── sveltekit-frontend/                 # Consumes packages
    ├── src/routes/api/atlas/           # API endpoints
    └── src/lib/
        └── server/
            └── atlas-client.ts         # Package consumer
```

---

## 🗂️ Existing Files Inventory

### Core Identity & Schema Files

**Location**: `src/lib/server/vector/` and `src/lib/server/db/`

| File | Lines | Purpose | → Package |
|------|-------|---------|-----------|
| `turbovec-contract.ts` | 51 | Identity + metadata schema | `parent-atlas-core/src/schemas/` |
| `turbovec-contract.test.ts` | 85 | Schema validation tests | `parent-atlas-core/tests/` |
| `atlas-feature-map.ts` | — | Feature → label mapping (Drizzle) | `parent-atlas-core/src/schemas/` |

**Action**: Copy → `packages/parent-atlas-core/src/schemas/identity.ts`

---

### Bifrost Semantic Cache (Retrieval Stage 1)

**Location**: `src/lib/server/ai/` + `src/lib/server/cache/`

| File | Lines | Purpose | → Package |
|------|-------|---------|-----------|
| `bifrost-provider.ts` | 14 | Vercel AI SDK wrapper | `parent-atlas-retrieval/src/bifrost/` |
| `bifrost-cache-manager.ts` | 180 | L1/L2 cache orchestration | `parent-atlas-retrieval/src/bifrost/` |
| `bifrost-som-prefilter.ts` | 110 | SOM cluster prefilter | `parent-atlas-retrieval/src/bifrost/` |
| `bifrost-trace.ts` | 86 | Trace logging | `parent-atlas-retrieval/src/bifrost/` |

**Tests**: `tests/bifrost-semantic-cache.spec.ts` (120 LoC)  
**Action**: Merge into `parent-atlas-retrieval/src/bifrost/index.ts` + `cache.ts`

---

### TurboVec (Retrieval Stage 2-3)

**Location**: `src/lib/server/retrieval/` + `src/lib/server/search/` + `src/lib/server/vector/`

| File | Lines | Purpose | → Package |
|------|-------|---------|-----------|
| `turbovec-prefilter.ts` | 110 | Cluster routing | `parent-atlas-retrieval/src/turbovec/prefilter.ts` |
| `turbovec-rerank.ts` | 150 | 4-signal reranking | `parent-atlas-retrieval/src/turbovec/rerank.ts` |
| `turbovec-search.ts` | — | Search integration | `parent-atlas-retrieval/src/turbovec/search.ts` |
| `turbovec-ingest-sidecar.ts` | — | Ingest bridge | `parent-atlas-ingest/src/sidecar.ts` |
| `turbovec-cuda-client.ts` | 95 | gRPC client | `parent-atlas-retrieval/src/turbovec/cuda-client.ts` |
| `turbovec_cuda_pb.d.ts` | 200 | Proto types | `parent-atlas-retrieval/src/turbovec/proto.d.ts` |

**Tests**: `turbovec-contract.test.ts` (85 LoC)  
**Action**: Create `parent-atlas-retrieval/src/turbovec/` with full pipeline

---

### LibTorch N-API GPU Bridge (Retrieval Stage 4)

**Location**: `src/lib/server/gpu/`

| File | Lines | Purpose | → Package |
|------|-------|---------|-----------|
| `libtorch-bridge.ts` | 450 | GPU similarity + clustering | `parent-atlas-retrieval/src/gpu/libtorch.ts` |
| `simdjson-bridge.ts` | — | Rust SIMD parser bridge | `parent-atlas-retrieval/src/gpu/simdjson.ts` |
| `cuda-bridge.ts` | — | CUDA memory management | `parent-atlas-retrieval/src/gpu/cuda.ts` |
| `gpu-pipeline.ts` | — | GPU task orchestration | `parent-atlas-retrieval/src/gpu/pipeline.ts` |
| `gpu-monitor.ts` | — | Real-time monitoring | `parent-atlas-retrieval/src/gpu/monitor.ts` |

**Tests**: GPU memory safety, determinism checks  
**Binary**: `simd-bridge/cpp/build/Release/tensorrt_bridge.node` (299 KB)  
**Action**: Preserve N-API binary in `packages/parent-atlas-retrieval/native/`

---

### Rust SIMD Parser N-API (Retrieval Stage 5)

**Location**: `simd-bridge/rust-simdjson/`

| File | Lines | Purpose | → Package |
|------|-------|---------|-----------|
| `src/lib.rs` | 180 | simd-json wrapper | Reference in `parent-atlas-retrieval/src/gpu/parser.ts` |
| `build.rs` | — | N-API build config | Move to `packages/parent-atlas-retrieval/build.rs` |
| `target/release/simd_bridge_rs.node` | — | Compiled binary | Copy to `packages/parent-atlas-retrieval/native/` |

**Action**: Import as N-API dependency (don't duplicate source)

---

### GPU Compute Files (WebGPU + CUDA)

**Location**: `src/lib/gpu/` (client) + `src/lib/server/gpu/` (server)

| File | Lines | Purpose | Consolidate? | → Package |
|------|-------|---------|--------------|-----------|
| `gpu-compute-pipeline.ts` | — | Compute orchestration | ✅ Yes | `parent-atlas-retrieval/src/gpu/` |
| `gpu-embedding-bridge.ts` | — | Embedding → GPU | ✅ Yes | `parent-atlas-retrieval/src/gpu/` |
| `gpu-search-reranker.ts` | — | GPU reranking | ✅ Yes | `parent-atlas-retrieval/src/turbovec/` |
| `gpu-job-queue.ts` | — | Async task management | ✅ Yes | `parent-atlas-retrieval/src/gpu/` |
| `gpu-monitor.ts` | — | Health monitoring | ✅ Yes | `parent-atlas-retrieval/src/gpu/monitor.ts` |
| `autoencoder-bridge.ts` | — | AE 768→64 | ✅ Yes | `parent-atlas-retrieval/src/gpu/autoencoder.ts` |
| `pytorch-graph.ts` | — | PyTorch SOM/clustering | ✅ Yes | `parent-atlas-retrieval/src/gpu/pytorch.ts` |
| `webgpu-pagerank.ts` | — | GPU PageRank (browser) | 🔄 Keep local | `sveltekit-frontend/src/lib/gpu/` |
| `nes-memory-architecture.ts` | — | NES memory contract | 🔄 Shared | `parent-atlas-core/src/memory/` |
| `global-gpu-manager.ts` | — | Singleton manager | ✅ Yes | `parent-atlas-retrieval/src/gpu/manager.ts` |

---

### Retrieval Pipeline Files

**Location**: `src/lib/server/retrieval/`

| File | Lines | Purpose | Consolidate? | → Package |
|------|-------|---------|--------------|-----------|
| `orchestrator.ts` | — | Retrieval routing | ✅ Yes | `parent-atlas-retrieval/src/pipeline/orchestrator.ts` |
| `gpu-reranker.ts` | — | GPU reranking wrapper | ✅ Yes | `parent-atlas-retrieval/src/turbovec/gpu-reranker.ts` |
| `cluster-aware-reranker.ts` | — | Cluster-based reranking | ✅ Yes | `parent-atlas-retrieval/src/turbovec/cluster-reranker.ts` |
| `authority-chain.ts` | — | Karpathy authority scoring | ✅ Yes | `parent-atlas-retrieval/src/turbovec/authority.ts` |
| `authority-chain.ts` | — | Langfuse trace integration | 🔄 Keep | `sveltekit-frontend/src/lib/server/` |
| `boosted-reranker.ts` | — | Multi-signal reranking | ✅ Yes | `parent-atlas-retrieval/src/turbovec/boosted.ts` |
| `topological-search.ts` | — | Neo4j topology search | ✅ Yes | `parent-atlas-retrieval/src/neo4j/` |
| `cold-storage-retrieval-service.ts` | — | SeaweedFS integration | ✅ Yes | `parent-atlas-core/src/adapters/cold-storage.ts` |
| `centroid-cache.ts` | — | Redis centroid cache | ✅ Yes | `parent-atlas-retrieval/src/cache/centroids.ts` |
| `hyperrag-fusion-service.ts` | — | HyperRAG orchestration | ✅ Yes | `parent-atlas-retrieval/src/hyperrag/` |
| `hyperrag-packet-rpc.ts` | — | Packet RPC protocol | ✅ Yes | `parent-atlas-retrieval/src/hyperrag/packet-rpc.ts` |
| `context-buffer.ts` | — | Context assembly | ✅ Yes | `parent-atlas-retrieval/src/pipeline/context-buffer.ts` |
| `summary-lenses.ts` | — | Summary rendering | 🔄 Keep local | `sveltekit-frontend/src/lib/server/` |
| `concept-extraction-tool.ts` | — | Entity/concept extraction | 🔄 Keep local | `sveltekit-frontend/src/lib/server/` |
| `routing-explanation.ts` | — | Routing audit trails | 🔄 Keep local | `sveltekit-frontend/src/lib/server/` |

---

### Search & Index Files

**Location**: `src/lib/server/search/`

| File | Lines | Purpose | Consolidate? | → Package |
|------|-------|---------|--------------|-----------|
| `turbovec-search.ts` | — | TurboVec search wrapper | ✅ Yes | `parent-atlas-retrieval/src/turbovec/search.ts` |
| `qdrant-search.ts` | — | Qdrant client wrapper | ✅ Yes | `parent-atlas-retrieval/src/qdrant/search.ts` |
| `codebase-ann-backend.ts` | — | ANN backend orchestration | ✅ Yes | `parent-atlas-retrieval/src/qdrant/backend.ts` |
| `bm25-search.ts` | — | Sparse keyword search | ✅ Yes | `parent-atlas-retrieval/src/sparse/bm25.ts` |

---

### API Routes (Consumer)

**Location**: `src/routes/api/`

| Route | Purpose | Will use | → Keep as |
|-------|---------|----------|-----------|
| `/api/atlas/search` | Query pipeline | `parent-atlas-retrieval` | SvelteKit route |
| `/api/atlas/lineage` | Identity verification | `parent-atlas-core` | SvelteKit route |
| `/api/atlas/gpu-stats` | GPU monitoring | `parent-atlas-retrieval/gpu` | SvelteKit route |
| `/api/atlas/cluster-summary` | SOM summaries | `parent-atlas-core` | SvelteKit route |
| `/api/health/gpu` | GPU health | `parent-atlas-retrieval/gpu` | SvelteKit route |
| `/api/audit/gpu` | GPU audit | `parent-atlas-retrieval/gpu` | SvelteKit route |

---

## 📋 Consolidation Checklist

### Phase A: Create Package Scaffolds ✅

```bash
# Create package directories
mkdir -p packages/parent-atlas-{core,ingest,retrieval,opencode}/{src,tests}

# Create root package.json files for each
# Copy tsconfig.json, .eslintrc, etc. from monorepo config
```

### Phase B: Copy Bifrost Files (Retrieval Stage 1) 🔄

```bash
# Copy to parent-atlas-retrieval/src/bifrost/
cp src/lib/server/ai/bifrost-provider.ts packages/parent-atlas-retrieval/src/bifrost/
cp src/lib/server/ai/bifrost-cache-manager.ts packages/parent-atlas-retrieval/src/bifrost/
cp src/lib/server/cache/bifrost-som-prefilter.ts packages/parent-atlas-retrieval/src/bifrost/
cp src/lib/server/retrieval/bifrost-trace.ts packages/parent-atlas-retrieval/src/bifrost/trace.ts

# Create index.ts that exports public API
# Merge into single bifrost module
```

### Phase C: Copy TurboVec Files (Retrieval Stage 2-3) 🔄

```bash
# Create directory
mkdir -p packages/parent-atlas-retrieval/src/turbovec

# Copy core files
cp src/lib/server/retrieval/turbovec-prefilter.ts packages/parent-atlas-retrieval/src/turbovec/
cp src/lib/server/retrieval/turbovec-rerank.ts packages/parent-atlas-retrieval/src/turbovec/
cp src/lib/server/search/turbovec-search.ts packages/parent-atlas-retrieval/src/turbovec/
cp src/lib/server/grpc/turbovec-cuda-client.ts packages/parent-atlas-retrieval/src/turbovec/
cp src/lib/generated/proto/turbovec_cuda_pb.d.ts packages/parent-atlas-retrieval/src/turbovec/proto.d.ts

# Merge reranking + cluster-aware-reranker + boosted-reranker into unified module
```

### Phase D: Copy LibTorch + Rust SIMD (Retrieval Stage 4-5) 🔄

```bash
# Copy GPU bridges
cp src/lib/server/gpu/libtorch-bridge.ts packages/parent-atlas-retrieval/src/gpu/
cp src/lib/server/gpu/simdjson-bridge.ts packages/parent-atlas-retrieval/src/gpu/
cp src/lib/server/gpu/cuda-bridge.ts packages/parent-atlas-retrieval/src/gpu/

# Copy N-API binary
cp simd-bridge/cpp/build/Release/tensorrt_bridge.node packages/parent-atlas-retrieval/native/

# Reference Rust source (don't copy — it's a separate build)
# simd-bridge/rust-simdjson/src/lib.rs is external dependency

# Create wrapper that loads binaries
```

### Phase E: Copy Identity & Schema (Core) 🔄

```bash
# Create core schema package
mkdir -p packages/parent-atlas-core/src/{schemas,adapters,memory}

# Copy identity-related files
cp src/lib/server/vector/turbovec-contract.ts packages/parent-atlas-core/src/schemas/
cp src/lib/server/vector/turbovec-contract.test.ts packages/parent-atlas-core/tests/

# Create Parent Atlas packet schema (Zod)
# Create Postgres canonical schema (Drizzle inference)
```

### Phase F: Copy Adapters (Core) 🔄

```bash
# Postgres adapter
cp src/lib/server/db/schema/atlas-feature-map.ts packages/parent-atlas-core/src/adapters/

# Qdrant adapter
# Neo4j adapter
# Redis adapter
# CouchDB adapter
# SeaweedFS cold storage adapter
```

### Phase G: Create OpenCode Plugin 🔄

```bash
# Skill definitions
mkdir -p packages/parent-atlas-opencode/skills/{search,analyze,gpu-stats}
cat > packages/parent-atlas-opencode/skills/search/SKILL.md << 'EOF'
# Parent Atlas GPU Search

## Usage
@atlas search "query" --top-k 10 --rerank-model glyph

## Tools
- atlas.search
EOF

# CLI commands (TypeScript)
mkdir -p packages/parent-atlas-opencode/src/commands
# Commands: atlas:search, atlas:analyze, atlas:gpu-stats
```

### Phase H: Wire SvelteKit Consumer Routes 🔄

```bash
# Update imports to use packages
# src/routes/api/atlas/search/+server.ts
import { retrievePacketsGPU } from '@deeds/parent-atlas-retrieval';
import { verifyLineage } from '@deeds/parent-atlas-core';

# Create high-level API client
cp src/lib/server/atlas-client.ts packages/parent-atlas-retrieval/src/
```

---

## 🔗 Import Consolidation Map

### Before (Scattered)
```typescript
import { bifrostChat } from '$lib/server/ai/bifrost-provider.ts';
import { turbovecPrefilter } from '$lib/server/retrieval/turbovec-prefilter.ts';
import { batchCosineSimilarity } from '$lib/server/gpu/libtorch-bridge.ts';
import { fastJsonParse } from '$lib/server/gpu/simdjson-bridge.ts';
```

### After (Consolidated)
```typescript
import { 
  bifrostChat,
  retrievePacketsGPU,
  turbovecPrefilter,
  turbovecRerank,
  batchCosineSimilarity,
  fastJsonParse,
  getMemoryPressure
} from '@deeds/parent-atlas-retrieval';

import {
  verifyLineage,
  ParentAtlasPacketResult,
  IDENTITY_CONTRACT
} from '@deeds/parent-atlas-core';
```

---

## 📦 Package Dependencies

### parent-atlas-core
- `@deeds/parent-atlas-core` (root package)
- Exports: Identity contract, schemas, adapters
- No GPU dependencies
- Dependencies: Zod, drizzle-orm, postgres

### parent-atlas-retrieval
- `@deeds/parent-atlas-retrieval`
- Exports: Bifrost, TurboVec, GPU pipeline, search
- GPU dependencies: N-API binaries (tensorrt_bridge.node)
- Dependencies: `@deeds/parent-atlas-core`, ioredis, qdrant-js, napi/node

### parent-atlas-opencode
- `@deeds/parent-atlas-opencode`
- Exports: CLI commands, skills
- Dependencies: `@deeds/parent-atlas-core`, `@deeds/parent-atlas-retrieval`

### parent-atlas-ingest (Future)
- `@deeds/parent-atlas-ingest`
- Ingest scanning, AST parsing, packet generation
- Dependencies: `@deeds/parent-atlas-core`, `@deeds/parent-atlas-retrieval`

---

## ✅ Success Criteria

**Phase A-B Complete**: ✅
- [ ] All 4 packages have directory structure
- [ ] Each package has `package.json`, `tsconfig.json`
- [ ] Bifrost files copied + merged

**Phase C-E Complete**: ✅
- [ ] TurboVec + GPU files copied
- [ ] Core schemas + adapters in place
- [ ] N-API binaries in `native/`

**Phase F-G Complete**: ✅
- [ ] OpenCode plugin structure ready
- [ ] Skills + commands defined

**Phase H Complete**: ✅
- [ ] SvelteKit routes import from packages
- [ ] No `$lib/` imports for GPU acceleration code
- [ ] All types properly exported

**Final**: ✅
- [ ] `npm run build` succeeds in all packages
- [ ] `npm run test` passes all tests
- [ ] SvelteKit dev server starts without errors
- [ ] `/api/atlas/*` routes functional
- [ ] `claude code --opencode parent-atlas` loads plugins

---

## 📅 Timeline

**Week 1** (Phase A-B):
- Create package scaffolds
- Copy + merge Bifrost files
- Verify imports work

**Week 1-2** (Phase C-E):
- Copy TurboVec + GPU files
- Create core schemas + adapters
- Refactor N-API binary loading

**Week 2** (Phase F-G):
- Build OpenCode plugin structure
- Define CLI commands + skills

**Week 2-3** (Phase H):
- Wire SvelteKit consumer routes
- Update all imports
- Run smoke tests

**Week 3** (Final):
- Publish npm packages (private org: @deeds/*)
- Documentation + benchmarks
- OpenCode CLI plugin live

**Target Ship**: 2026-06-30 ✅
