# Codebase Categorization Manifest

## Overview
- **Total tracked files**: 18,679
- **Unique first-level entries**: 1,933
- **Active app (sveltekit-frontend/)**: 12,105 files
- **Everything else**: 6,574 files (dead weight, experiments, logs, archives)

---

## BUCKET 1: STAY — SvelteKit 2 App (Active Frontend + Backend)
> **12,105 files** — The production app. Do not touch.

| Path | Files | Notes |
|------|-------|-------|
| `sveltekit-frontend/` | 12,105 | Full SvelteKit 2 app (routes, lib, server, tests, config) |

---

## BUCKET 2: STAY — Essential Root Config
> **~25 files** — Required for monorepo, CI, Docker, IDE.

| File/Dir | Notes |
|----------|-------|
| `.gitignore` | Git config |
| `.gitattributes` | Git config |
| `.githooks/` (5 files) | Pre-commit hooks |
| `.github/` (6 files) | CI/CD workflows |
| `.vscode/` (5 files) | IDE settings |
| `package.json` | Root package |
| `tsconfig.json` | Root TS config |
| `go.mod` | Go module (for langextract-go submodule) |
| `Makefile` | Build targets |
| `README.md` | Project readme |
| `LICENSE` | License file |
| `CLAUDE.md` | Claude instructions |
| `.claude/` | Claude config |
| `.dockerignore` | Docker ignore |
| `Dockerfile` | Main Dockerfile |
| `docker-compose.yml` | Main compose |
| `docker-compose.deeds.yml` | Deeds-specific compose |
| `drizzle.config.ts` | Drizzle ORM config |
| `drizzle/` (18 files) | DB migrations |
| `playwright.config.ts` | Playwright config |
| `playwright-global-setup.ts` | Playwright setup |
| `tests/` (25 files) | Root-level Playwright tests |
| `test-results/` (1 file) | Test results metadata |
| `langextract-go` | Git submodule (reference) |
| `proto/` (78 files) | gRPC proto definitions (active/ + archived/) |

---

## BUCKET 3: → `deeds_lab/go-services` — Go Microservices (Experiments)
> **~175 files** — Go services that were experimental, not integrated into SvelteKit app.

| Path | Files | Notes |
|------|-------|-------|
| `go-services/` | 58 | Multiple Go microservices |
| `go-enhanced-rag-service/` | 26 | Enhanced RAG in Go |
| `go-glyph-engine/` | 8 | Glyph engine experiment |
| `go-inference-service/` | 5 | Go inference service |
| `go-tensorrt-runner/` | 5 | TensorRT runner in Go |
| `go-gateway/` | 1 | Gateway entry |
| `go-file-processor/` | 1 | File processor |
| `go-log-processor/` | 1 | Log processor |
| `go-chat-service/` | 1 | Chat service |
| `cmd/` | 20 | Go CLI commands |
| `pkg/` | 42 | Go packages |
| `internal/` | 13 | Go internal packages |
| `rpc/` | 3 | Go RPC definitions |
| `legal-gateway/` | 7 | Legal gateway service |
| `yorha-governor/` | 34 | Yorha governor service |
| `grpc-shim/` | 1 | gRPC shim |
| Root Go files | ~5 | `main.go`, `integration-orchestrator.go`, `gpu_orchestrator_ucb_test.go`, `tensorrt-bridge-service.go`, `gemma3_cuda_service.go` |

---

## BUCKET 4: → `deeds_lab/python-middleware` — Python Services
> **~1,160 files** — Python codebases, ML pipelines, OCR, training, GPU.

| Path | Files | Notes |
|------|-------|-------|
| `python_codebase/` | 1,071 | Main Python codebase |
| `python-services/` | 55 | Python microservices |
| `python/` | 9 | Python scripts |
| `backend/` | 368 | Python FastAPI backend |
| `python-gpu-worker/` | 1 | GPU worker |
| `python-gpu-ocr-service/` | 1 | OCR service |
| `python-microservice/` | 1 | Generic microservice |
| Root Python files | ~30 | `*.py` scripts (see below) |

**Root Python files → `deeds_lab/python-middleware/scripts/`:**
`add_lm_head_alias.py`, `advanced-ai-api.py`, `build_embeddinggemma_trt.py`, `chr97_image_processor.py`, `clickhouse-mirror.py`, `debug_import.py`, `debug_onnx_export.py`, `download_gemma3_text.py`, `export_gemma3_final.py`, `fp8_quantize.py`, `gemma3_cuda_inference.py`, `gemma3_cuda_service.py`, `gemma3_onnx_export.py`, `gemma3_production_service.py`, `gemma3_tensorrt_inference.py`, `gemma3_vlm_web_search_service.py`, `hf_to_trt_gemma3_rank0.py`, `hf_to_trt_gemma3_rank0.from_container.py`, `int8_smoothquant.py`, `langextract.py`, `manifold_demo.py`, `merge_hf_shards_to_rank0.py`, `optimum_export.py`, `production-advanced-ai.py`, `setup_chr97_database.py`, `setup_minio.py`, `simple_server.py`, `start_server.py`, `test_*.py` (all root Python tests), `TODO_SVELTE5_LSP_DOCLING.py`, `trt_build_ui.py`, `ultra_minimal.py`, `validate_*.py`

---

## BUCKET 5: → `deeds_lab/ocr` — OCR Pipeline
> **~5 files** — OCR-related services and scripts.

| Path | Files | Notes |
|------|-------|-------|
| `ocr_pipeline/` | 1 | OCR pipeline config |
| `ocr-service/` | 1 | OCR service (in `deeds_lab/python-middleware` overlap) |
| `granite-docling-258M/` | 1 | Granite docling model ref |
| `granite-docling-worker/` | 1 | Granite docling worker (in python-middleware overlap) |
| Root OCR files | ~2 | `OCR_STACK.md`, `OCR-Tensor-Processing-Implementation-Summary.txt` |

*Note: Main OCR code is now in `sveltekit-frontend/src/lib/server/ocr/` (stays).*

---

## BUCKET 6: → `deeds_lab/cuda-binaries` — CUDA / C++ / RTX / TensorRT
> **~80 files** — GPU build scripts, CUDA kernels, C++ projects, TRT engine builders.

### Directories:
| Path | Files | Notes |
|------|-------|-------|
| `cuda_vision/` | 10 | CUDA vision kernels |
| `cmake-cuda-qlora-trainer/` | 6 | CMake CUDA QLoRA trainer |
| `cpp-ast-exporter/` | 27 | C++ AST exporter |
| `cpp-legal-autoencoder/` | 1 | C++ legal autoencoder |
| `simd-bridge/` | 16 | SIMD bridge (C/WASM) |
| `tensorrt-infer/` | 14 | TensorRT inference |
| `tensorrt-embedding/` | 4 | TensorRT embedding |
| `tensorrt-smoketest/` | 2 | TensorRT smoke tests |
| `cuda-http-service/` | 1 | CUDA HTTP service |
| `cuda-mock-gateway/` | 2 | CUDA mock gateway |
| `flatbuffers/` | 1 | FlatBuffers schema |
| `wasm/` | 4 | WASM modules |
| `trtllm_patch/` | 1 | TRT-LLM patch |

### Root CUDA/C++ files → `deeds_lab/cuda-binaries/scripts/`:
`BUILD.bat`, `build.ps1`, `BUILD-CUDA.bat`, `BUILD-CUDA-GRPC-SYSTEM.bat`, `BUILD-CUDA-SHORT.bat`, `BUILD-CLANG.bat`, `BUILD-CLANG-CUDA.bat`, `BUILD-MINGW.bat`, `BUILD-MSVC.bat`, `BUILD-SIMD-GPU.bat`, `BUILD-SIMD-INDEXER.bat`, `BUILD-TENSOR-SYSTEM.bat`, `BUILD-WITH-CUDA-12.8.bat`, `BUILD-WITH-LLVM.bat`, `build-flashattention.bat`, `build-pgvector.bat`, `build-wasm.cjs`, `build-wasm-bridge.bat`, `build-wasm-stack.bat`, `build-simple.bat`, `BUILD-AND-FIX-ALL.bat`, `BUILD-AND-RUN-GPU.bat`, `BUILD-GO.ps1`, `BUILD-GPU-DEMO-ONLY.bat`, `build-go-server.bat`, `build-go-services.ps1`, `build-gpu-pipeline.bat`, `build-legal-ai.ps1`, `build-legal-ai-fixed.ps1`, `q4km-flashattention-plugin.cu`, `trt_fast_runner.cpp`, `CMakePresets.json`, `compile_commands.json`, `reconfigure-cmake.bat`

### Root TensorRT/engine build scripts → `deeds_lab/cuda-binaries/scripts/`:
`build_embeddinggemma_fp16_trtexec.sh`, `build_engine_from_text_only.sh`, `build_engine_simple.sh`, `build_gemma.sh`, `build_gemma_trt.sh`, `build_gemma3_trt_engine.sh`, `build_optimized_gemma3_engine.sh`, `build_simple_optimized_engine.sh`, `build_tensorrt_engine.sh`, `build_tensorrt_engine_int4.bat`, `build_tensorrt_engine_int4.sh`, `build_trt_engine.sh`, `build_trt_engines.sh`, `build_trt_gemma3.bat`, `build-all-three-engines.sh`, `build-all-three-engines-optimized.sh`, `build-both-engines.sh`, `build-gemma3-engines-fixed.sh`, `build-plan-engine.sh`, `build-tensorrt-engine.sh`, `build-tensorrt-engines.sh`, `build-tensorrt-from-gguf.sh`, `build-tensorrt-optimized.sh`, `build-trt-engines.sh`, `rebuild-engines-cuda128.sh`, `create_text_only_and_build_engine.sh`, `create_working_checkpoint.sh`, `convert_unsloth_to_trt.py`, `convert_safetensors_manual.sh`, `convert_quantized_with_reference.sh`, `convert_gguf_to_trt_engine.sh`, `direct_gguf_to_engine.sh`, `quantize_and_build.sh`

---

## BUCKET 7: → `deeds_lab/minio` — MinIO Config/Data
> **~2 files** — MinIO configuration.

| Path | Files | Notes |
|------|-------|-------|
| `minio/` | 1 | MinIO config |
| Root MinIO files | ~3 | `start-minio-startup.bat`, `quick-minio-setup.ps1`, `setup_minio.py` |

*Note: MinIO integration code lives in sveltekit-frontend (stays).*

---

## BUCKET 8: → `deeds_lab/law-data` — PDFs, Legal Data, DB Dumps
> **~50 files** — Law PDFs, Qdrant snapshots, database dumps, sample data.

| Path | Files | Notes |
|------|-------|-------|
| `lawpdfs/` | 36 | Legal PDF documents |
| `vector-backup-2025-07-24T*/` | 10 | Qdrant vector backup |
| `sample-data/` | 1 | Sample data dir |
| `qdrant/` | 1 | Qdrant config |
| Root files | ~15 | See below |

**Root law data files:**
`complaint.pdf`, `download_complaint (2).pdf`, `sample-patent-application.txt`, `legal_ai_db_phase78_baseline.dump`, `legal_ai_db_phase78_20251207_141217.dump`, `legal_ai_db_backup.sql`, `legal_vector_db_512.json`, `legal_calibration_data.json`, `embedding_adapter_512.pkl`, `dump.rdb`, `manifold_export.json`

**Root SQL schema/seed files:**
`schema.sql`, `basic-schema.sql`, `database-schema.sql`, `database-schema-phase2-s-a.sql`, `schema_codebase.sql`, `init.sql`, `init-db.sql`, `init-pgvector.sql`, `init-rag.sql`, `seed-vector-data.sql`, `seed-demo-users.sql`, `create-vector-extension.sql`, `create-evidence-connections.sql`, `create-basic-schema.sql`, `setup-postgres.sql`, `setup-legal-ai-db.sql`, `setup-legal-ai-db-simple.sql`, `setup-extensions.sql`, `setup-complete-ai-system.sql`, `setup-postgres-vector-integration.sql`, `enhanced_bitmap_hmm_som_schema.sql`, `optimize-case-embeddings.sql`, `test-similarity-search.sql`, `check-database.sql`, `change-password.sql`, `fix-login-direct.sql`, `fix-db-auth.sql`, `database-indexes-optimization.sql`, `database-indexes-optimization-fixed.sql`, `pgvector-512dim-integration.sql`, `neo4j-legal-schema.cypher`

---

## BUCKET 9: → `deeds_lab/typescript-experiments` — Standalone TS/Node Services
> **~100 files** — Non-SvelteKit TypeScript services and experiments.

| Path | Files | Notes |
|------|-------|-------|
| `src/` | 238 | Old src/ (pre-SvelteKit, non-active) |
| `ai-chat-standalone/` | 2 | Standalone AI chat |
| `ai-summarized-documents/` | 6 | AI summary service |
| `advanced-ai-integration/` | 10 | Advanced AI integration |
| `embedding-service/` | 1 | Embedding service |
| `evidence-service/` | 1 | Evidence service |
| `ingestion-service/` | 1 | Ingestion service |
| `reranker-service/` | 1 | Reranker service |
| `langchain-rag-service/` | 2 | LangChain RAG |
| `sse-rag-service/` | 2 | SSE RAG service |
| `unified-rag-service/` | 3 | Unified RAG service |
| `node-ai-worker/` | 1 | Node AI worker |
| `node-cluster/` | 1 | Node cluster |
| `cyber-elephant/` | 12 | Cyber elephant project |
| `vscode-llm-extension/` | 1 | VS Code extension |
| `ts-ast-autofixer/` | 5 | TS AST auto-fixer |
| `sveltekit-evidence/` | 32 | SvelteKit evidence (separate app) |
| `sveltekit-app/` | 1 | Old SvelteKit app |
| `SvelteKit Frontend/` | 5 | Old SvelteKit frontend copy |
| `svelte_ui/` | 6 | Old Svelte UI |
| `frontend/` | 3 | Old frontend |
| `sveltekit-optimizations/` | 1 | Optimizations notes |
| `webgpu-redis-starter-repo/` | 29 | WebGPU Redis starter |
| `xstate/` | 1 | XState experiment |

**Root TS/JS experiment files → `deeds_lab/typescript-experiments/scripts/`:**
`gateway.js`, `worker.js`, `embedder_server.js`, `start-production.js`, `start-development.js`, `smoke_test.js`, `frontend-usage-example.ts`, `client-side-worker-orchestrator.ts`, `client-side-gemma-wasm.ts`, `mcp-search-server.ts`, `xstate-gpu-memory-orchestration.ts`, `multi-dimensional-image-cache.ts`, `enhanced-neo4j-search-integration.ts`, `revolutionary-integration-complete.ts`, `rag-query-implementation.ts`, `moogle-127-1-compression-deployment.ts`, `vite-config-simd-update.ts`, `temp-ollama-restored.ts`, `fetch-latest-docs.ts`, `fetch-docs-output.js`, `SVELTE5_DRIZZLE_EXAMPLES.ts`, `test-worker-api.ts`, `test-enhanced-search.ts`, `benchmark-wasm-simd.js`, `vitest.config.ts`

---

## BUCKET 10: → `deeds_lab/infrastructure` — Docker, Redis, Monitoring, Config
> **~120 files** — Docker variants, Redis configs, monitoring, deployment scripts.

### Docker variants (60+ files):
`docker-compose.*.yml` (all variants EXCEPT `docker-compose.yml` and `docker-compose.deeds.yml` which STAY)
`Dockerfile.*` (all variants EXCEPT main `Dockerfile` which STAYS)

**Full list of docker-compose variants to move:**
`docker-compose.yaml`, `docker-compose-vector-384.yml`, `docker-compose-phase72.yml`, `docker-compose-phase70.yml`, `docker-compose-pgvector-gpu.yml`, `docker-compose-full-stack-384.yml`, `docker-compose-backup.yml`, `docker-compose.workers.yml`, `docker-compose.unified.yml`, `docker-compose.triton.yml`, `docker-compose.test.yml`, `docker-compose.tensorrt.yml`, `docker-compose.sveltekit-simple.yml`, `docker-compose.sveltekit.yml`, `docker-compose.redis-postgres.yml`, `docker-compose.quic-tensorrt.yml`, `docker-compose.quic.yml`, `docker-compose.qlora.yml`, `docker-compose.production.yml`, `docker-compose.phase-h.yml`, `docker-compose.phase78-vlm-stack.yml`, `docker-compose.phase76.yml`, `docker-compose.phase75-standalone.yml`, `docker-compose.phase72.yml`, `docker-compose.phase71.yml`, `docker-compose.phase66-full.yml`, `docker-compose.phase66.yml`, `docker-compose.override.yml.disabled`, `docker-compose.ollama-fix.yml`, `docker-compose.multimodal-retriever.yml`, `docker-compose.middleware.yml`, `docker-compose.legal-stack.yml`, `docker-compose.legal-ai-optimized.yml`, `docker-compose.legal-ai.yml`, `docker-compose.langfuse.yml`, `docker-compose.integrated-gpu-stack.yml`, `docker-compose.grpc.yml`, `docker-compose.gpu-rag-full-stack.yml`, `docker-compose.gpu.yml`, `docker-compose.generated.yml`, `docker-compose.fixed.yml`, `docker-compose.existing-stack.yml`, `docker-compose.embeddings.yml`, `docker-compose.elk.yml`, `docker-compose.dynamic.yml`, `docker-compose.dev.yml`, `docker-compose.detected.yml`, `docker-compose.ai-stack.yml`, `docker-compose.agentic.yml`, `neo4j-docker-compose.yml`

**Dockerfile variants to move:**
`Dockerfile.worker`, `Dockerfile.web`, `Dockerfile.trtllm.fixed`, `Dockerfile.trtllm`, `Dockerfile.triton-ubuntu22`, `Dockerfile.tensorrt-builder`, `Dockerfile.tensorrt`, `Dockerfile.sveltekit`, `Dockerfile.rag`, `Dockerfile.quic`, `Dockerfile.pytorch`, `Dockerfile.production`, `Dockerfile.phase66`, `Dockerfile.ocr`, `Dockerfile.monitor`, `Dockerfile.lang`, `Dockerfile.gpu-optimized`, `Dockerfile.gpu-clustering`, `Dockerfile.flashattention-simple`, `Dockerfile.flashattention-cuda128`, `Dockerfile.flashattention`, `Dockerfile.dev`, `Dockerfile.cuda13-optimized`, `Dockerfile.clickhouse-mirror`, `Dockerfile.cached-nvidia`, `Dockerfile.cached-legal`, `Dockerfile.ai-patch`

### Infrastructure directories:
| Path | Files | Notes |
|------|-------|-------|
| `docker/` | 11 | Docker configs |
| `docker-scripts/` | 2 | Docker scripts |
| `monitoring/` | 8 | Monitoring configs |
| `redis/` | 1 | Redis config |
| `redis-windows/` | 6 | Redis Windows binaries |
| `redis-windows-latest/` | 7 | Redis latest Windows |
| `redis-latest/` | 6 | Redis latest |
| `nginx/` | 2 | Nginx configs |
| `elk-stack/` | 2 | ELK stack configs |
| `logstash/` | 2 | Logstash configs |
| `clickhouse-init/` | 1 | ClickHouse init |
| `ssl/` | 1 | SSL certs |
| `config/` | 1 | Config dir |
| `database/` | 9 | Database scripts |

### Root infrastructure files:
`Caddyfile`, `Caddyfile.*` (7 variants), `rabbitmq.conf`, `redis.conf`, `redis-4005.conf`, `litellm_config.yaml`, `codegen.yml`, `envoy-quic.yaml`, `qdrant-local-config.yaml`, `triton-model-config.yaml`, `native-services.conf`, `server.env.example`, `.npmrc`, `ecosystem.*.config.cjs` (3 files), `mcp-tasks.json`, `mcp-multicore-config.json`, `low-memory-vscode.json`

### Root deployment/start/stop scripts → `deeds_lab/infrastructure/scripts/`:
All `start-*.bat`, `start-*.sh`, `start-*.ps1`, `START-*.bat`, `START-*.ps1` files (~60 files)
All `stop-*`, `deploy-*`, `run-*` files (~30 files)
`LEGAL.AI.bat`, `UNIFIED-LEGAL-AI-ORCHESTRATOR.bat`, `DEMO-COMPLETE-LEGAL-AI.bat`, `COMPLETE-LEGAL-AI-WIRE-UP.ps1`, `COMPLETE-LEGAL-AI-SETUP-NATIVE.bat`, `COMPLETE-BUILD-AND-SETUP.ps1`, `PROD-BUILD.bat`, `RESET-AND-BUILD.bat`, `START-PRODUCTION-OPTIMIZED.bat`, `START-PRODUCTION-LEGAL-AI.bat`, `DEPLOY-WINDOWS-PRODUCTION.bat`, `FINAL-SYSTEM-STATUS.bat`, `RUN-DOCKER-BUILD.bat`

---

## BUCKET 11: → `deeds_lab/ml-training` — ML/Training/Models
> **~50 files** — Model training, fine-tuning, model configs.

| Path | Files | Notes |
|------|-------|-------|
| `training/` | 4 | Training scripts |
| `ml-pipeline/` | 7 | ML pipeline |
| `gemma_reranker/` | 3 | Gemma reranker |
| `gemma3-12b-finetuned-fp16/` | 4 | Gemma3 fine-tuned model ref |
| `starter-gemma/` | 3 | Starter Gemma |
| `custom_model/` | 2 | Custom model config |
| `local-models/` | 6 | Local model configs |
| `onnx_models/` | 3 | ONNX model configs |
| `Ollama/` | 30 | Ollama model configs |

### Root model files:
All `Modelfile*` variants (~16 files), `Gemma3-Legal-Modelfile`, `Gemma3-Legal-Enhanced-Modelfile-v2`, `gemma3840.patch`

---

## BUCKET 12: → `deeds_lab/experimental-services` — Misc Experimental Services
> **~120 files** — Various experimental micro-services and tools.

| Path | Files | Notes |
|------|-------|-------|
| `archived-services/` | 25 | Already archived |
| `archived-go-duplicates/` | 2 | Go duplicates |
| `production-pipeline/` | 14 | Production pipeline |
| `ingestion-phase66/` | 24 | Phase 66 ingestion |
| `ingestion/` | 2 | Ingestion base |
| `ingestion-watcher/` | 1 | Ingestion watcher |
| `phase66/` | 8 | Phase 66 service |
| `phase72/` | 4 | Phase 72 service |
| `phase72-ast-reduction/` | 7 | AST reduction |
| `phase-74-ingestion/` | 5 | Phase 74 ingestion |
| `phase14/` | 2 | Phase 14 |
| `quarantined-routes/` | 13 | Quarantined routes |
| `quic-services/` | 4 | QUIC services |
| `quic-nats-bridge/` | 2 | QUIC-NATS bridge |
| `nats-bridge-http/` | 2 | NATS HTTP bridge |
| `security-orchestrator/` | 6 | Security orchestrator |
| `message-queue/` | 4 | Message queue |
| `load-tester/` | 4 | Load tester |
| `smoke-test/` | 2 | Smoke test |
| `mcp-servers/` | 14 | MCP servers |
| `mcp/` | 3 | MCP base |
| `mcp-svelte-docs/` | 3 | MCP Svelte docs |
| `mcp-playwright-auditor/` | 4 | MCP Playwright auditor |
| `langextract/` | 4 | Language extraction |
| `rust-services/` | 4 | Rust services |
| `chr97-runtime/` | 12 | CHR97 runtime |
| `graph_authority/` | 1 | Graph authority |
| `gpu/` | 1 | GPU config |
| `yolo-sam-legal-pipeline/` | 6 | YOLO-SAM pipeline |
| `api-gateway/` | 3 | API gateway |
| `endpoints/` | 2 | Endpoints |
| `rag/` | 3 | RAG base |
| `db/` | 3 | DB scripts |
| `chat/` | 1 | Chat service |

---

## BUCKET 13: → UNTRACK (git rm --cached, add to .gitignore) — Session Notes / Logs
> **~900+ files** — Session notes, error logs, status reports. Keep on disk, remove from git.

### Session/Phase markdown files (~500+):
All `SESSION_*.md`, `PHASE_*.md`, `PHASE[0-9]*.md` files
All `QUICK_START_*.md`, `START_HERE*.md`, `READY_*.md`, `DO_THIS_*.md`
All `*_COMPLETE*.md`, `*_SUMMARY*.md`, `*_STATUS*.md`, `*_PROGRESS*.md`
All `IMPLEMENTATION_*.md`, `DEPLOYMENT_*.md`, `EXECUTION_*.md`
All `PROSECUTOR_*.md`, `NES_COMMAND_CENTER_*.md`, `EVIDENCE_PIPELINE_*.md`
All `ERROR_*.md` (session notes, not code), `TESTING_*.md`, `DOCUMENTATION_*.md`
All `ACE_*.md`, `AGENTIC_*.md`, `AI_*.md` (guides/summaries, not code)
All `SVELTE5_*.md`, `SVELTE_CHECK_*.md`
All `TASK_*.md`, `TASK3_*.md`
All `CONTEXTUAL_CHAT_*.md`, `CACHE_*.md`, `FEATURE_*.md`
All `WEEK*.md`, `PR_*.md`, `GITHUB_*.md`
All `SPEC_*.md`, `ROUTE_*.md`, `ROUTES_MAP.md`

### Error/build logs (~160+ files):
All `*.txt` files that are logs: `tsc_*.txt`, `tsc-output*.txt`, `ts_errors*.txt`, `vite-full-log.txt`, `conversion_log.txt`, `top100.txt`, `test.txt`
All dated session logs: `10_1_25*.txt`, `10_2_25*.txt`, `10_3_25*.txt`, `10_4_25*.txt`, `7pmclaude_*.txt`, `9_30_25*.txt`, `913*.txt`, `915*.txt`, `921*.txt`, `927*.txt`, `929*.txt`, `930*.txt`
Misc text notes: `apparch*.txt`, `nextsteps*.txt`, `summarynextsteps*.txt`, `todolist*.txt`, `todogpu*.txt`

### Screenshots/images (untrack, keep on disk):
`zero-errors-verification.png`, `ai-chat-*.png`, `commandcenter.png`, `componentscreen.png`, `context-switching-test.png`, `evidenceboard.png`, `fugitivedex.png`, `homepage*.png`, `nes_modal_routes.png`, `screen*.png`, `Screenshot*.png`

### Old reports/analysis (untrack):
`playwright-report/` (1 file), `reports/` (11 files), `test-reports/` (2 files)

### Misc untrack:
`commas-previews/` (19 files), `context7-docs/` (45 files), `documents/` (650 files), `.kiro/` (510 files), `svelte-check-errors-index/` (5 files), `codemod-plans/` (1 file), `checkpoints/` (exists on disk, may have tracked files)

---

## BUCKET 14: → UNTRACK — Misc Root Files (Stale/One-off)
> **~300 files** — Stale config, one-off scripts, analysis outputs.

### JSON test/analysis outputs:
All `test-*.json` files (~15), `ai-integration-test-results.json`, `benchmark-results-*.json`, `phase44c-stats.json`, `PHASE2_FIX_RESULTS.json`, `PHASE3_FILE_INVENTORY.json`, `response.json`, `svelte-check-errors.json`, `svelte5-diagnostics.json`, `svelte-errors-categorized.json`, `svelte-errors.ndjson`, `svelte-top100.json`, `go-binaries-report.json`, `docker-containers-backup.json`, `ROUTE_MAP_EXPORT.json`, `ENGINE_BUILD_BASELINE.json`, `qdrant-collection.json`, `temp_config.json`, `sample_vector.json`, `test_results.json`

### One-off fix/analyze scripts:
All `fix-*.mjs`, `fix-*.cjs`, `fix-*.sh`, `fix-*.ps1` files (~35 files)
All `analyze-*.mjs`, `analyze-*.sh` files (~5 files)
`parse-errors.js`, `parse-errors.cjs`, `locate-ai-chat.js`, `consolidate-stores-audit.js`, `go-consolidation-analysis.mjs`

### One-off test scripts:
All root `test-*.mjs`, `test-*.js`, `test-*.bat`, `test-*.sh`, `test-*.ps1` files (~90 files)

### Old setup/install scripts:
All `setup-*.sh`, `setup-*.sql`, `setup-*.ps1`, `setup_*.py`, `setup_*.bat` files (~15 files)
All `install-*.ps1`, `install-*.bat` files (~4 files)
All `run-*.bat`, `run-*.sh`, `run-*.ps1` files (~12 files)

### Stale config files:
`uno.config.js`, `uno.config.ts` (real config is in sveltekit-frontend/), `svelte.config.js`, `svelte.config.cjs` (real config is in sveltekit-frontend/), `drizzle.introspect.config.ts`, `tsconfig.temp-check.json`, `tsconfig.tsbuildinfo`, `playwright.config.js` (real config is in sveltekit-frontend/)

### Misc one-off files:
`.agent`, `.air.toml`, `.air-gpu.toml`, `.air-rag.toml`, `.clangd`, `.eslintignore`, `.prettierignore`, `.prettierrc`, `.python-version`, `.qdrant-initialized`, `.roo`, `.rooignore`, `.roomodes`, `.scripts/` (7 files), `.svelte-errors-top.json`, `.tsc_full_output.txt`, `.tsc_output.txt`, `.wslconfig`
`=1.26.0`, `=4.12.2`, `=4.40.0`, `0`, `n`, `n'`, `Host`, `stop`, `Memory`, `Extension`, `Issues`, `TensorRT-LLM`, `G1U_ORCHESTRATOR_README`
`0001-Fix-AiAssistant-*.patch`, `a.cjs`, `copilot.md`, `gemini.md`
`deeds-web-app.code-workspace`, `deeds-w232eb-app.code-workspace`
`cookies.txt`, `cookies_login.txt`, `temp_gpg_key`, `nvidia-container-toolkit.list`
`backup-20250908-114207.sql`
`demo-html-extract.html`, `evidence-canvas-test.html`, `n64-texture-streaming-demo.html`, `production-dashboard.html`, `tmp_demo_*.html`
`demo.chr97`, `demo-file-merger.mjs`
`requirements-*.txt` (3 files), `svelte-complete.txt`, `svelte-complete (1).txt - Shortcut.lnk`

---

## BUCKET 15: → UNTRACK — Directories Already Dead
> These directories serve no active purpose. Keep on disk, untrack from git.

| Path | Files | Why Dead |
|------|-------|----------|
| `.kiro/` | 510 | AI agent config (stale) |
| `documents/` | 650 | Document archive |
| `context7-docs/` | 45 | Context7 reference docs |
| `context7/` | 1 | Context7 base |
| `pgvector-install/` | 44 | pgvector build artifacts |
| `protoc-install/` | 13 | protoc build artifacts |
| `proto-backup/` | 5 | Proto backup |
| `protos/` | 1 | Old protos dir |
| `archive/` | 2 | Generic archive |
| `old-scripts/` | 2 | Old scripts |
| `tmp/` | 6 | Temp files |
| `tmux/` | 2 | Tmux configs |
| `dev/` | 2 | Dev configs |
| `data/` | 1 | Data dir |
| `datasets/` | 1 | Datasets dir |
| `cache/` | 2 | Cache files |
| `ace_runs/` | 2 | ACE run logs |
| `todolist_2025-08-04T05-23-51/` | 2 | Old todo |
| `sql/` | 10 | SQL scripts (superseded by drizzle/) |
| `migrations/` | 5 | Old migrations (superseded by drizzle/) |
| `tools/` | 36 | Tool scripts |
| `scripts/` | 559 | Scripts dir (PARTIAL — keep `scripts/tests/`, untrack rest) |
| `docs/` | 157 | Docs (keep essential, untrack bulk) |
| `jstests/` | 4 | JS tests (old) |
| `q4km_test_results/` | 1 | Q4KM results |
| `perf/` | 1 | Perf dir |
| `PERFORMANCE_FIXES_DOCUMENTATION/` | 1 | Perf docs |
| `error-analysis/` | 1 | Error analysis |
| `svelte-check-errors-index/` | 5 | Old error index |
| `commas-previews/` | 19 | Preview files |
| `deeds_labs/` | 1 | Old labs stub |
| `bin/` | 1 | Binary |
| `snapshots/` | 1 | Snapshot |
| `weekly-cleanup/` | 1 | Cleanup script |

---

## Summary Table

| Bucket | Destination | Est. Files | Action |
|--------|------------|------------|--------|
| 1. SvelteKit 2 App | STAY | 12,105 | No change |
| 2. Essential Root Config | STAY | ~25 | No change |
| 3. Go Services | → `deeds_lab/go-services` | ~175 | Move repo |
| 4. Python Middleware | → `deeds_lab/python-middleware` | ~1,160 | Move repo |
| 5. OCR Pipeline | → `deeds_lab/ocr` | ~5 | Move repo |
| 6. CUDA/C++/RTX | → `deeds_lab/cuda-binaries` | ~80 | Move repo |
| 7. MinIO Config | → `deeds_lab/minio` | ~5 | Move repo |
| 8. Law Data/PDFs | → `deeds_lab/law-data` | ~50 | Move repo |
| 9. TS Experiments | → `deeds_lab/typescript-experiments` | ~100 | Move repo |
| 10. Infrastructure | → `deeds_lab/infrastructure` | ~120 | Move repo |
| 11. ML/Training | → `deeds_lab/ml-training` | ~50 | Move repo |
| 12. Experimental Svc | → `deeds_lab/experimental-services` | ~120 | Move repo |
| 13. Session Notes/Logs | UNTRACK | ~900+ | `git rm --cached` + `.gitignore` |
| 14. Misc Root Files | UNTRACK | ~300 | `git rm --cached` + `.gitignore` |
| 15. Dead Directories | UNTRACK | ~800+ | `git rm --cached` + `.gitignore` |
| **TOTAL** | | **~18,679** | |

---

## Execution Plan

### Phase 1: Review & Approve
- User reviews this manifest
- Adjusts any bucket assignments
- Confirms which items to move vs untrack

### Phase 2: `git rm --cached` (Untrack Only)
- Buckets 13, 14, 15 → `git rm --cached` (removes from git, keeps on disk)
- Update `.gitignore` with patterns for untracked items

### Phase 3: Move to `deeds_lab` Repo
- Buckets 3-12 → physically move files to `deeds_lab` repo
- `git rm` from this repo (removes from git AND disk since files move)
- `git add` in `deeds_lab` repo

### Phase 4: Verify
- Run `svelte-check` (should still be 0/0)
- Run Playwright tests (should still pass)
- Verify `sveltekit-frontend/` untouched
- Verify essential root config untouched

### Result
- This repo: ~12,130 tracked files (SvelteKit app + essential config)
- `deeds_lab` repo: ~1,865 files (organized experiments)
- Untracked (on disk only): ~4,700 files (notes, logs, dead weight)
