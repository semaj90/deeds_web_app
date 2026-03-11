# Directory Audit — March 10, 2026

## Summary

| Metric | Before | After |
|--------|--------|-------|
| Root .md files (sveltekit-frontend/) | **660** | **7** |
| Root directories (sveltekit-frontend/) | **60+** | **20** |
| Root directories (project root) | **72** | **48** |
| Files archived this session | **23,880+** | → `deeds_labs/archive-2026-03-10/` |
| svelte-check | 0 errors, 0 warnings | 0 errors, 0 warnings |
| vite build | PASS | PASS |

---

## Active Root Directories (Project Root)

### Core Application
| Directory | Purpose | Status |
|-----------|---------|--------|
| `sveltekit-frontend/` | SvelteKit 2 + Svelte 5 main application | **ACTIVE** |
| `go-microservice/` | Go gRPC embedding server (:50051), QUIC bridge (:4434) | **ACTIVE** |
| `simd-bridge/` | LibTorch/CUDA N-API addon (tensorrt_bridge.node) | **ACTIVE** |
| `docker/` | Docker Compose configs for all services | **ACTIVE** |
| `drizzle/` | DB migrations (manual + generated) | **ACTIVE** |
| `scripts/` | Build/test/deploy scripts | **ACTIVE** |

### AI/ML Models & Data
| Directory | Purpose | Status |
|-----------|---------|--------|
| `libtorch-win-shared-with-deps-2.9.0+cu130/` | LibTorch 2.9.0 CUDA DLLs (cuBLAS, cuDNN, 35 DLLs) | **CRITICAL** |
| `tensorrt_py310_env/` | Python 3.10 venv: PyTorch 2.9.1+cu126, transformers, langextract, langchain, crewai | **ACTIVE** |
| `gemma3Q4_K_M/` | Gemma3 12B Q4_K_M model weights | **DATA** |
| `granite-docling-258M/` | IBM Docling 258M model weights | **DATA** |
| `ollama_models/` | Ollama model storage | **DATA** |
| `onnx/` | ONNX model files | **DATA** |
| `models/` | Additional model files | **DATA** |

### Python Workers
| Directory | Purpose | Status |
|-----------|---------|--------|
| `python/` | Python utility scripts | **ACTIVE** |
| `python-workers/` | Background Python workers (langextract, analysis) | **ACTIVE** |
| `hmm-topic-service/` | HMM bigram topic modeling service | **ACTIVE** |
| `ocr_pipeline/` | Tesseract OCR pipeline scripts | **ACTIVE** |

### Infrastructure Configs
| Directory | Purpose | Status |
|-----------|---------|--------|
| `neo4j-community-5.23.0-windows/` | Neo4j graph DB installation | **ACTIVE** |
| `neo4j-community-5.23.0/` | Neo4j (Linux) installation | **KEEP** |
| `nginx/` | Nginx reverse proxy config | **ACTIVE** |
| `redis/` | Redis configuration | **ACTIVE** |
| `qdrant/` | Qdrant vector DB config | **ACTIVE** |
| `qdrant-windows/` | Qdrant Windows binary | **ACTIVE** |
| `pgvector-precompiled/` | pgvector extension binaries | **ACTIVE** |
| `minio/` | MinIO server config | **ACTIVE** |
| `minio-data/` | MinIO data directory (evidence files) | **DATA** |
| `storage/` | Local file storage | **DATA** |
| `ssl/` | SSL certificates | **ACTIVE** |
| `proto/` | Protobuf definitions | **ACTIVE** |

### Planning & Docs
| Directory | Purpose | Status |
|-----------|---------|--------|
| `next_steps/` | Planning documents | **KEEP** |
| `deeds_labs/` | Archive destination (legacy projects + this session's archives) | **ARCHIVE** |
| `deeds-web-app/` | Nested project copy (historical) | **REVIEW** |

### Hidden/Tooling
| Directory | Purpose | Status |
|-----------|---------|--------|
| `.claude/` | Claude Code project memory | **ACTIVE** |
| `.github/` | GitHub Actions/configs | **ACTIVE** |
| `.githooks/` | Git hooks | **ACTIVE** |
| `.vscode/` | VS Code workspace settings | **ACTIVE** |
| `.cache/`, `.error-brain/`, `.pytest_cache/` | Cache/debug data | **TRANSIENT** |
| `.python311/`, `.venv/` | Python virtual envs | **ACTIVE** |
| `.rag-metrics/`, `.roo/`, `.scripts/` | Utility data | **KEEP** |

---

## Active Directories (sveltekit-frontend/)

| Directory | Purpose | Status |
|-----------|---------|--------|
| `src/` | Main source code (routes, lib, components) | **ACTIVE** |
| `static/` | Static assets (ONNX models, ORT WASM, fonts) | **ACTIVE** |
| `build/` | Vite build output | **GENERATED** |
| `scripts/` | Test scripts, utilities | **ACTIVE** |
| `tests/` | Playwright tests | **ACTIVE** |
| `test/` | pdf-parse test fixture (build dependency) | **REQUIRED** |
| `drizzle/` | DB migrations | **ACTIVE** |
| `docs_readme/` | Organized documentation | **ACTIVE** |
| `next_steps/` | Planning docs | **KEEP** |
| `public/` | Public assets | **ACTIVE** |
| `vite-plugins/` | Custom Vite plugins | **ACTIVE** |
| `proto/` | Protobuf definitions | **ACTIVE** |
| `.agent/` | Agentic workflow configs | **ACTIVE** |
| `.github/`, `.husky/`, `.kiro/`, `.claude/`, `.vscode/` | Tooling | **ACTIVE** |

---

## Remaining Root .md Files (sveltekit-frontend/)

| File | Purpose | Status |
|------|---------|--------|
| `README.md` | Project readme | **KEEP** |
| `CLAUDE.md` | Claude project instructions (critical) | **KEEP** |
| `claude.md` | Alternate Claude instructions | **KEEP** |
| `copilot.md` | GitHub Copilot instructions | **KEEP** |
| `gemini.md` | Gemini instructions | **KEEP** |
| `CODEBASE_MAP.md` | Comprehensive codebase reference | **KEEP** |
| `INFERENCE_ARCHITECTURE.md` | GPU inference pipeline reference | **KEEP** |
| `YOLO_EVIDENCE_PIPELINE.md` | Evidence upload + YOLO pipeline map | **KEEP** |

---

## Organized .md Files (docs_readme/)

| Subdirectory | Files | Contents |
|--------------|-------|----------|
| `docs_readme/gpu/` | 4 | cuda-audit-recommendations, GPU_BUFFER_POOL_ARCHITECTURE, GPU_INFRASTRUCTURE_ROADMAP, libtorch-gpu-bridge |
| `docs_readme/pipeline/` | 3 | EVIDENCE_PIPELINE_VERIFICATION, PIPELINE_STATUS, CACHE_INVALIDATION |
| `docs_readme/codebase-audit/` | 6 | CODEBASE_ANALYSIS_REPORT, CODEBASE_CONSOLIDATION_AUDIT, CODEBASE_WIRING_CHART, codebase-indexing-next-steps, STUB_RANKING_REPORT, LIBRARY_CLEANUP_PLAN |
| `docs_readme/integration/` | 9 | AI_SUMMARY_MODAL_INTEGRATION, CANONICAL_ROUTES, CITATION_ARCHITECTURE, MIGRATION_REVIEW, ML_ANALYTICS_IMPLEMENTATION_PLAN, REPORT_ROUTES_TEST_SUMMARY, REPORT_SCHEMA_NOTES, VOICE_CHAT_INTEGRATION, WIRING_CHART |
| `docs_readme/organized-markdown-docs/` | existing | enhanced-rag-best-practices (rewritten) + others |

---

## Archive Contents (deeds_labs/archive-2026-03-10/)

| Bucket | Files | Contents |
|--------|-------|----------|
| `bucket-a-generated/` | 4,761 | reports/ (4,761 generated report files) |
| `bucket-b-shadow/` | 5 | proto/ (shadow of root proto/) |
| `bucket-c-stale/` | 9,336 | src_fixed (1,245), _archived (3,063), archives (2,550), backups (1,932), archived-shims (2), .phase72-backups (450), .svelte5-fix-backups (13), .vite-concurrent (76), .error-brain (1), .dry-run-previews (4) |
| `root-stale/` | 3,164 | 35 directories: legal-ai-*, gpu-inference-worker, trt_*, temp-services, node-cluster, microservices, backup, archives, tools, training-datasets, unocss-main, etc. |
| `stale-md-files/` | 636 | 610 PHASE*/ACE*/SESSION* files + 26 recent session summaries |

**Total archived this session: ~17,902 files**

---

## Python Environment: tensorrt_py310_env

Key packages (Python 3.10.18):
- **PyTorch 2.9.1+cu126** — CUDA GPU training/inference
- **transformers 4.57.1** — HuggingFace model loading
- **langextract 1.0.9** — Legal text section extraction
- **langchain 1.2.3** + langchain-ollama + langgraph — LLM orchestration
- **crewai 1.6.1** — Multi-agent orchestration
- **sentence-transformers 5.1.2** — Embedding models
- **onnxruntime 1.23.2** — ONNX inference runtime
- **opencv-python 4.12.0** — Image processing
- **pytesseract 0.3.13** — OCR integration
- **qdrant-client 1.15.1** — Vector DB client
- **neo4j 6.0.3** — Graph DB client
- **cupy-cuda12x 13.6.0** — GPU array operations

---

## GPU Pipeline (Verified Working)

| Component | File | Status |
|-----------|------|--------|
| LibTorch N-API addon | `simd-bridge/cpp/build/Release/tensorrt_bridge.node` | **CUDA=1, 3 functions verified** |
| LibTorch bridge | `src/lib/server/gpu/libtorch-bridge.ts` | **Production-ready** |
| CUDA bridge | `src/lib/server/gpu/cuda-bridge.ts` | **Real wrapper (stubs removed)** |
| Background analyzer | `src/lib/server/gpu/background-analyzer.ts` | **NEW: fire-and-forget GPU analysis** |
| GPU arbiter | `src/lib/server/inference/gpu-arbiter.ts` | **Redis VRAM lease mutex** |
| Inference router | `src/lib/server/inference/inference-router.ts` | **TRT→Ollama fallback** |
| TRT VLM endpoint | `src/routes/api/ai/tensorrt/vlm/+server.ts` | **Wired: Ollama multimodal fallback** |
| TRT Stream endpoint | `src/routes/api/ai/tensorrt/stream/+server.ts` | **Wired: Ollama SSE fallback** |
| GPU compute API | `src/routes/api/gpu/compute/+server.ts` | **Working: similarity, cluster, weighted_embedding** |
| WebGPU pipeline | `src/lib/gpu/gpu-compute-pipeline.ts` | **14 WGSL kernels, buffer pool** |
| Evidence GPU analysis | Evidence upload Stage 9 | **NEW: triggerEvidenceGpuAnalysis()** |

---

## Changes Made This Session

### New Files
- `src/lib/server/gpu/background-analyzer.ts` — GPU background evidence analysis (Stage 9)

### Modified Files
- `src/routes/api/evidence/upload/+server.ts` — Added Stage 9 GPU trigger
- `src/routes/api/ai/tensorrt/vlm/+server.ts` — Added Ollama VLM fallback
- `src/routes/api/ai/tensorrt/stream/+server.ts` — Added Ollama SSE fallback
- `src/lib/server/gpu/cuda-bridge.ts` — Added background-analyzer re-exports
- `docs_readme/organized-markdown-docs/deeds-web-app/enhanced-rag-best-practices.md` — Complete rewrite

### Archived
- 610 stale .md files → `deeds_labs/archive-2026-03-10/stale-md-files/`
- 26 recent session summaries → same
- 35+ root-level stale directories → `deeds_labs/archive-2026-03-10/root-stale/`
- Bucket A (reports, 4,761 files) → `deeds_labs/archive-2026-03-10/bucket-a-generated/`
- Bucket C (_archived, archives, backups, src_fixed, etc., 9,336 files) → `deeds_labs/archive-2026-03-10/bucket-c-stale/`

### Verification
- svelte-check: **0 errors, 0 warnings**
- vite build: **PASS** (exit 0)
- LibTorch addon: **CUDA=1, all 3 functions verified**
