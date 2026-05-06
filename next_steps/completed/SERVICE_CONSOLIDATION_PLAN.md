# Service File Consolidation Plan

**Date**: February 7, 2026
**Status**: Ready for Review
**Impact**: Reduce 519 service files → ~50 core services (90% reduction)

---

## 🎯 Priority 1: Critical Duplicates (Execute First)

### 1. Ollama Services (20 → 3 files)

**Keep:**
- `ollama-service.ts` (19.8KB) - Main service
- `ollama-config-service.ts` (7.3KB) - Configuration
- `get-ollama-endpoint.ts` (0.9KB) - Endpoint resolver

**Archive to `_archive/ollama/`:**
- `ollama-suggestions-service.fixed.ts` (duplicate of ollama-suggestions-service.ts)
- `ollamaService.ts` (duplicate casing)
- `ollamaEmbeddingService.ts` (merge into ollama-service.ts)
- All other 14 files (specialized variants to consolidate)

**Reason**: Multiple implementations doing the same thing.

### 2. Caching Services (8 → 2 files)

**Keep:**
- `caching-service.ts` (18.4KB) - Main implementation
- `comprehensive-caching-architecture.ts` (41.0KB) - Advanced features

**Archive:**
- `caching-service-stub.ts` (0.9KB) - Empty stub
- `enhanced-caching-service.ts` (0.2KB) - Nearly empty
- All "revolutionary" and "optimizer" variants (merge best features into main)

**Reason**: 6 files are either stubs or duplicates.

### 3. Go Microservice Clients (2 → 1 file)

**Keep:**
- `go-microservice-client.ts` (14.0KB) - More comprehensive

**Archive:**
- `go-microservices-client.ts` (10.4KB) - Redundant plural version

**Action**: Rename `go-microservice-client.ts` → `goMicroservice.ts` for consistency

---

## 🎯 Priority 2: Major Consolidation

### 4. GPU Services (49 → 5 files)

**Core Services to Keep:**
```
gpu/
  ├── gpu-service-orchestrator.ts       (17.1KB) - Main coordinator
  ├── gpu-cache-integration.ts          (NEW - merge 8 cache files)
  ├── webgpu-accelerator.ts             (4.6KB) - WebGPU operations
  ├── gpu-shader-cache.ts               (NEW - merge 3 shader files)
  └── gpu-metrics-collector.ts          (placeholder - needs implementation)
```

**Archive 44 files** including:
- All `nes-gpu-*`, `webgpu-som-*`, `flashattention-*` variants
- Duplicate bridges (`gpu-integration-bridge.ts`, `webasm-gpu-bridge.ts`)
- Specialized pipelines (merge into orchestrator)

**Reason**: 90% overlap in functionality.

### 5. Vector Services (29 → 3 files)

**Keep:**
```
vector/
  ├── unified-vector-orchestrator.ts    (16.9KB) - Main service
  ├── vector-embedding-service.ts       (19.5KB) - Embedding operations
  └── pgvector-semantic-search.ts       (13.2KB) - PostgreSQL integration
```

**Archive 26 files** including all database-specific wrappers (Redis, Qdrant duplicates).

### 6. RAG Services (29 → 3 files)

**Keep:**
```
rag/
  ├── enhanced-rag-self-organizing.ts   (46.0KB) - Most comprehensive
  ├── rag-knowledge-pipeline.ts         (19.6KB) - Knowledge graph ops
  └── cached-rag-service.ts             (24.1KB) - Caching layer
```

**Archive 26 files** including all "enhanced", "hybrid", "unified" variants.

---

## 🎯 Priority 3: AI & Embedding Services

### 7. AI Services (45 → 4 files)

**Keep:**
```
ai/
  ├── legal-ai-acceleration-pipeline.ts (34.2KB) - Main pipeline
  ├── crewai-service.ts                 (18.2KB) - Crew AI orchestration
  ├── qlora-training-service.ts         (15.6KB) - Training
  └── ai-recommendation-engine.ts       (10.1KB) - Recommendations
```

**Archive 41 files**.

### 8. Embedding Services (14 → 2 files)

**Keep:**
- `vector-embedding-service.ts` (19.5KB)
- `nomic-embedding-service.ts` (14.6KB)

**Archive 12 files**.

---

## 📋 Implementation Steps

### Phase 1: Quick Wins (1 hour)
```bash
# 1. Archive obvious duplicates
mkdir -p sveltekit-frontend/src/lib/services/_archive/{ollama,caching,gpu,vector,rag,ai}

# 2. Move stub/empty files
mv sveltekit-frontend/src/lib/services/caching-service-stub.ts sveltekit-frontend/src/lib/services/_archive/caching/
mv sveltekit-frontend/src/lib/services/enhanced-caching-service.ts sveltekit-frontend/src/lib/services/_archive/caching/

# 3. Consolidate Go microservice
# (Rename and update imports)

# 4. Run tests to verify no breakage
npm run test
```

### Phase 2: Major Consolidation (2-3 hours)
- Merge best features from each category into core files
- Update all imports across codebase
- Archive redundant files

### Phase 3: Verification (30 min)
- Run full type check
- Test all routes
- Update documentation

---

## 🎯 Expected Results

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Total Services | 519 | ~50 | 90% reduction |
| Build Time | Slow | Fast | 50%+ faster |
| Type Check Time | Timeout | <2 min | No timeouts |
| Maintenance | Nightmare | Manageable | 10x easier |

---

## ⚠️ Risk Mitigation

1. **Git Safety**: All changes on feature branch
2. **Backups**: Archive files, don't delete
3. **Testing**: Run tests after each phase
4. **Rollback**: Keep old files in `_archive/` for 30 days

---

## 🚀 Ready to Execute?

Run: `bash implement-consolidation.sh phase1`