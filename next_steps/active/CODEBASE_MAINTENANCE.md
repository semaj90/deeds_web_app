# Codebase Maintenance — Consolidated

**Created**: April 19, 2026 (consolidated from 4 source files)
**Status**: ACTIVE — Tier 1-3 consolidation done, remaining items medium-priority

---

## 1. Directory Consolidation (Tiers 4-5 Remaining)

**Tiers 1-3 COMPLETE** (Apr 19): 14 dead dirs eliminated, 4 overlapping pairs merged, svelte-check 0 errors.

### Tier 4: Fold ~20 1-file server/ dirs (Medium Risk)
Single-file server directories that could merge into neighboring dirs. Requires import rewrites.
**Effort**: Medium. **Risk**: Import path changes across multiple consumers.

### Tier 5: Fold ~13 1-file component/ dirs (Low Priority)
Single-file component directories. Conventional in Svelte — low value to consolidate.
**Effort**: Low. **Priority**: Low.

---

## 2. N-API / C++ AST Graph Audit (Reference Checklist)

Cross-language wiring audit for architecture visibility. Not a runtime dependency — a tooling program.

### Questions to Answer
1. Which TS routes depend on graph/GPU/native acceleration?
2. Which Node.js modules call native boundaries?
3. Which C++ files export N-API entrypoints?
4. Which native paths require CUDA/LibTorch, where are CPU fallbacks?
5. Where are exceptions swallowed or health checks faked?

### Audit Sections (All Unchecked)
- [ ] **TypeScript Route Graph** — enumerate routes under `/api/graph/`, `/api/error-brain/`, `/api/ai/` (GPU), `/api/health/` (capabilities)
- [ ] **Service Graph** — map TS service → store → fallback chains
- [ ] **N-API Boundary Audit** — verify every `createRequire()` consumer, fallback paths
- [ ] **C++ Export Graph** — enumerate N-API entrypoints in `simd-bridge/cpp/`, `src/native/`
- [ ] **CUDA Fallback Matrix** — verify every GPU function has CPU fallback
- [ ] **Silent Failure Audit** — find swallowed exceptions in native bridge code

### Known Native Files
- `simd-bridge/cpp/` — tensorrt_bridge.node (simdjson + LibTorch + TensorRT)
- `src/native/libtorch_inference.cc` — InferenceAddon (forward, getErrorCount, exportErrors)
- 7 GPU functions exported: kmeansWithCentroids, trainSOM, pageRankGPU, attentionScoreGPU, rewardScoreGPU, batchCosineSimilarity, simdJsonParse

---

## 3. deeds_labs/ Archival (GitHub Push)

**Problem**: `deeds_labs/` is gitignored — 17,900+ archived files invisible to version control. Local disk loss = permanent loss.

### Steps
```bash
cd deeds_labs/
git init
git add .
git commit -m "Initial archive: 17,900+ files from deeds-web-app cleanup sessions"
gh repo create semaj90/deeds-labs --private --source=. --push
```

### Contents
- 30+ archived `src/lib/` directories
- 312 corrupted service files
- Phase 99 corrupted .svelte files (83)
- Dead microservices (Python, Go, Docker)
- 610+ archived .md documentation files
- Svelte 4 pre-migration components

---

## 4. Granite-Docling Integration (Phase 3+ Deferred)

**Phases 1-3 COMPLETE**: Ollama API wired, DocTags-aware chunking, Qdrant payload enrichment, PRIMARY enrichment pipeline.

### Remaining
- [x] Wire Granite-Docling as evidence pipeline Stage 2 fallback (before Tesseract OCR) — DONE: `api/evidence/upload/+server.ts` lines 598-640 (scanned PDFs + images), verified Apr 19, 2026
- [x] Promote Granite-Docling to PRIMARY structural enrichment on ALL PDF+image uploads — DONE Apr 20, 2026: always-run enrichment pass + Gemma4 VLM reranking + Qdrant tagged indexing (`docling_enriched`, `docling_quality_score`, `docling_vlm_sections`)
- [ ] Evaluate retirement of standalone Docling Python service (port 8085) in favor of Ollama-native (DEFERRED — Docling service still first-choice when available)

---

## Consolidated From

- `ALL_ROUTES_DIRECTORY_CONSOLIDATION.md`
- `TS_NAPI_CPP_AST_GRAPH_AUDIT_CHECKLIST_2026-03-31.md`
- `DEEDS_LABS_ARCHIVAL.md`
- `GRANITE_DOCLING_258M_INTEGRATION_2026-04-05.md`