# Tasks — Parent Atlas Native Acceleration C ABI

Statuses: PASS | FAIL | PARTIAL_PROVEN | FIXTURE_PROVEN | NOT_PROVEN | NOT_APPLICABLE.
No CUDA/cuBLAS/cuDNN/TensorRT/cuVS/CAGRA/cuGraph capability may be reported PASS from imports, exports, array shapes, or process exit alone.

## P0 — Identity hydration (blocks everything downstream)

- [ ] P0.1 Replace session-188 global-nullable hotfix with discriminated identity contract in `feature-envelope.ts`: `identity_kind: 'symbol'|'file'|'chunk'`; symbol ⇒ `stable_symbol_id`+`symbol_version_id` non-null; file/chunk ⇒ explicitly null + `stable_file_id` required
- [ ] P0.2 Add canonical identity join in `hydrate-candidates.ts` (symbol-tree / atlas_packets source — current SQL selects only `codebase_chunk_index`; the "optional atlas_packets join" comment has no join)
- [ ] P0.3 Replace `envelope_build_failed` with typed counters: `canonical_row_matched`, `canonical_identity_resolved`, `envelope_validated`, `missing_stable_symbol`, `missing_stable_file`, `schema_revision_rejected`, `representation_rejected`; increment row-match BEFORE envelope construction
- [ ] P0.4 Prove `search-unified?q=test&topK=3` still returns hydrated packets under the discriminated contract (regression fixtures for symbol / file / chunk candidates)

## ARCHITECTURE: DUAL-TRACK PARALLELIZATION (Session 196 Correction)

**CRITICAL**: Do NOT put all of P0 ahead of every GPU task.

**Track A (Windows N-API Addon Truth)**: P1.1–P1.10 — independent of P0
**Track B (WSL2 RAPIDS Verification)**: P3.1–P3.11, P3a–P3c — independent of P0

P0 (Identity hydration) blocks: lane-specific canonical proofs, production persistence.
P0 does NOT block: backend benchmarking with frozen fixture, Windows addon classification, WSL2 RAPIDS verification.

---

## P1 — Windows N-API Addon Truth (TRUTHFUL CLASSIFICATION)

- [ ] P1.1 Rewrite `scripts/startup-gpu-bridge-probe.mjs` classifications: MISSING_EXPORT / NO_LIBTORCH_STUB / CPU_FALLBACK / SHAPE_VALID / NOT_PROVEN / CALL_FAILED / NUMERICAL_MISMATCH / SKIPPED_EXTERNAL_PROOF; same addon resolver as `libtorch-bridge.ts`; record path + SHA-256 + mtime + build variant; missing exports counted explicitly; no "covered by smoke" promotion
  - **Session 195 status**: ❌ CRITICAL CORRECTION. Shape-only classification is NOT truthful. isLive() proves SHAPE_VALID, NOT CUDA execution. Honest result: 15 CALL_OR_SHAPE_SUCCEEDED (classify as SHAPE_VALID or NOT_PROVEN until counters/parity available), 1 SKIPPED_EXTERNAL_PROOF, 0 CUDA_LIVE PROVEN. Probe output must distinguish shape validity from backend execution. Requires: branch execution counters (P1.3+), numerical parity fixtures (P1.4+) before CUDA_LIVE promotion.
- [ ] P1.2 Add native `getBackendInfo()` (addon version, build commit/type, LibTorch ver, CUDA compile+runtime, device, compute capability, cuBLAS/cuDNN/TensorRT presence, per-export backend)
  - **Session 195 status**: ⚠️ INCOMPLETE. GetBackendInfoWrapper() source added to binding.cc; NOT YET COMPILED OR TESTED. Missing: build type detection, CUDA runtime version (not __CUDA_ARCH__), device identity (cudaGetDevice), cuDNN/TensorRT presence detection, per-operation backend map. __CUDA_ARCH__ is compile-time constant (device SM architecture), NOT runtime device info. Needs proper .cu translation unit with cudaGetDeviceProperties, cudaMemGetInfo, cudaRuntimeGetVersion. Classification: SOURCE_IMPLEMENTED, BUILD_NOT_PROVEN, EXPORT_NOT_PROVEN, RUNTIME_VALUES_NOT_VALIDATED.
- [ ] P1.3 Add native execution counters inside CUDA/LibTorch branches + `getExecutionCounters()` (cuda_execution / cpu_fallback / stub_invocation / cuda_error_fallback / oom_fallback)
- [ ] P1.4 Create `scripts/gpu/prove-native-gpu-numerical-parity.mjs` — deterministic fixtures vs CPU/Python oracles for: batchCosineSimilarity, graphSimilarity(+Half), softmaxGPU, topKIndicesGPU, attentionScoreGPU, rewardScoreGPU, pageRankGPU, kmeansWithCentroids, pcaProject, autoencoderEncode/Decode, computeCaseEmbedding, trainSOM
- [ ] P1.5 Mark `graphSimilarity` = CPU_FALLBACK explicitly in bridge + probe; prove `batchCosineSimilarity` CUDA/cuBLAS via counters + parity (not shape)
- [ ] P1.6 Fix `getCudaMemory`: move `cudaMemGetInfo` into a `.cu` translation unit (currently `__CUDACC__`-guarded → zero values from MSVC C++ TU)
- [ ] P1.7 Reports: `docs/reports/native-addon-contract-audit.{json,md}`, `docs/reports/native-gpu-numerical-parity.{json,md}`

## P2 — C ABI core + adapter extraction

- [ ] P2.1 Create `native/atlas_core/include/atlas_core.h` (opaque handles, status/backend/metric enums, context options, execution receipt; zero vendor types) + `atlas_core.cpp`
- [ ] P2.2 Implement `atlas_similarity_graph_build` → CSR (`threshold`, `max_neighbors_per_row`; no dense n×n default) using normalize + `torch::mm`
- [ ] P2.3 Implement `atlas_pagerank` on CSR with CPU reference; parity vs NetworkX AND Neo4j GDS on one shared fixture (dangling policy, normalization, orientation documented)
- [ ] P2.4 Add `batchCosineTopK` N-API export (scores stay on device through top-k; returns indices + scores + backend)
- [ ] P2.5 Refactor `simd-bridge/cpp` into an N-API adapter of `atlas_core` (typed-array validation + bounded scheduler + Promise only; no JSON in hot path)
- [ ] P2.6 Execution receipt schema (versioned) + MessagePack encode/decode (`atlas_receipt_*_msgpack`, `atlas_buffer_t`); receipts stored separately from canonical envelopes
- [ ] P2.7 FP16 lane proof: FP32↔FP16 top-k overlap, max score error, NaN/Inf-free, stable cutoff ordering (RTX 3060 Ti Tensor Cores)
- [ ] P2.8 CUDA graph capture/replay limited to fixed-shape repeat workloads (1×768·768×4096 cosine pages); no multi-stream until single-stream contracts proven

## P3 — cuVS / RAPIDS / remote boundary

- [ ] P3.1 Implement `atlas_knn_exact` via cuVS brute_force (replace `cuvs_bridge.cc` stub) — exact oracle; validated vs NumPy oracle first
- [ ] P3.2 Benchmark lanes vs the exact oracle: Qdrant HNSW recall, CAGRA (`atlas_cagra_build/search`), TurboVec (optional backend) — recall@k, rank overlap, distortion, memory, build/search latency, filter correctness
- [ ] P3.3 Author `proto/parentatlas/acceleration/v1/atlas.proto` (Metric, TensorRef, SearchRequest with workspace/representation revisions, NeighborBatch packed, ExecutionReceipt, AtlasVectorService: ExactSearch/CagraSearch); gRPC C++ callback API, deadlines mandatory
- [ ] P3.4 Offline projection jobs via Python worker (cuML KMeans/PCA/IncrementalPCA, cuGraph pagerank/louvain/leiden/wcc/k_core/jaccard) — consuming the `tools/agentic-research` WSL env; identity always joined back to Postgres
- [ ] P3.5 GPU row manifest before any vector export: Qdrant point ID ↔ Postgres canonical identity ↔ content_hash ↔ representation_revision (immutable)
- [ ] P3.6 Report: `docs/reports/parent-atlas-acceleration-integration.{json,md}`

## P4 — Consumers (contracts only in this change)

- [ ] P4.1 SvelteKit browser WebGPU visualization consumes projection endpoints only (layouts, heatmaps, PageRank exploration); document non-authority contract
- [ ] P4.2 Unreal plugin contract: gRPC client of AtlasVectorService, Slate/UMG rendering, no store access (contract doc, no implementation)
- [ ] P4.3 Native Dawn viewer as separate target spec (`atlas_dawn_viewer.exe` + `atlas_core.dll`); never linked into `tensorrt_bridge.node`
- [ ] P4.4 MCP tools for Ornith/Gemma4: `atlas.backend_info`, `atlas.exact_topk_oracle` (fixture-bounded), `atlas.parity_report` — every result carries execution receipt; agents never touch gRPC/stores directly

## P2b — Contract amendments (2026-08-04 review)

- [ ] P2b.1 Explicit buffer ownership in `atlas_core.h`: allocator/deallocator pairs; every buffer freed by the allocating module; versioned structs (`struct_size` first member or version tag)
- [ ] P2b.2 Representation contract binding: index build + compute requests carry representation_id, revision, dims, dtype, normalization, metric, model id+hash; mismatch (e.g. latent_64 query vs semantic_768 index) rejected pre-compute with receipt reason
- [ ] P2b.3 Compute-only core audit: no PostgreSQL/Qdrant/Redis/Neo4j/Kafka/HTTP/store-filesystem dependency linked into atlas_core
- [ ] P2b.4 Probe classes extended: NOT_IMPLEMENTED, LIBTORCH_CPU, NOT_PROVEN added; implementation-linked / symbol-loaded / binary-present / branch-executed tracked as separate claims

## P4b — Ontology-linked tuple layer (2026-08-04 addition)

- [ ] P4b.1 Define the tuple envelope type (event_id/subject/predicate/object/session_id/source_path/byte_start/byte_end/raw_sha256/severity) as a shared schema
- [ ] P4b.2 Generator: raw evidence (logs, receipts, tool output) -> tuple, byte-offset addressed (not line numbers -- logs rotate/append)
- [ ] P4b.3 KAG indexing of tuples with mandatory evidence-pointer resolution on retrieval
- [ ] P4b.4 Document clearly: this layer is token-reduction/retrieval-indexing only, never conflated with RTK (shell-output compaction) or native GPU acceleration (this same OpenSpec's core subject)

## P5b — Session 188C llama-server Startup Contract (FROZEN — 2026-08-04)

**Status**: ✅ LOCKED | **Root Cause**: `--skip-chat-parsing` broke tool parsing | **Fix**: Deleted from launcher

### Canonical State (Do Not Change)
- [x] Model: `gemma4-legal-iq4xs-direct.gguf`
- [x] Chat template: `configs/templates/custom_pub_chat_template_gemma4.jinja`
- [x] Reasoning: off, format=deepseek, budget=0
- [x] KV cache: q8_0/q8_0 (stock), no turbo* by default
- [x] Chat parsing: **ALWAYS ON** (skip-chat-parsing conditional DELETED)
- [x] 3-point validation: PASS (clean streaming, tool calls, model identity)

### Launcher Change (COMMITTED)
- File: `scripts/launch-turboquant.ps1` lines 1057-1065
- Change: Deleted conditional `if ($skipChatParsing)...` block
- Now: Hardcoded `Chat parsing: using llama-server template validation (NOT SKIPPED)`

### Recovery Steps (If Broken)
1. `taskkill /F /IM llama-server.exe`
2. Grep: `rg "skip.chat.parsing"` (must return 0)
3. Start: `npm run turbo:start`
4. Validate: `docs/STARTUP-CONTRACT-LLAMA-RECOVERY.md` (3-point tests)

### Documentation (FROZEN)
- `docs/STARTUP-CONTRACT-LLAMA-RECOVERY.md` — full spec + validation tests
- `docs/SESSION-188C-HANDOFF.md` — immediate next steps
- `CLAUDE.md` — canonical startup contract (project + global)

## P5c — Session 191 Centroid Compression Wiring (IMPLEMENTED — 2026-08-05)

**Status**: ✅ CODE WRITTEN | Ready for Session 192 caller wiring + testing

**Implementation**:
- Created: `src/lib/server/ace/centroid-compression.ts` — extractFeatureIds, getCentroidCompression, compressContext, end-to-end pipeline
- Modified: `src/lib/server/ace/gemma4-invocation-768.ts` — invoke() accepts Valkey, compresses before LLM
- Memory: `SESSION-191-CENTROID-COMPRESSION-WIRED.md` (complete handoff)

**What's Done**:
- [x] Extract feature IDs from ACE context
- [x] Fetch centroid summaries from Valkey (3 key patterns tried)
- [x] Replace candidates with cached summaries
- [x] Graceful fallback if Valkey unavailable
- [x] Logging for compression monitoring

**What's Pending (Session 192)**:
- [ ] Find Gemma4Invoker callers (usage pattern unclear — singleton or method wrappers)
- [ ] Wire Valkey instance from caller context
- [ ] Test end-to-end, verify 30-40% token reduction

**Expected Impact**: 4.8K → 3K-3.5K tokens (30-40% savings)

**Note**: Valkey centroid keys don't exist yet (confirmed empty). Layer active when centroid cache is populated.

---

## P5 — Session 188 operational next steps (2026-08-04 handoff)

Native/GPU startup reliability (adjacent to this spec's proof-gate discipline):
- [x] launch-turboquant.ps1: model_alias verification in health check (87f4a96540)
- [x] dev-gpu-runtime.mjs: always delegate to launcher, don't trust bare /health (58663ad3d1)
- [x] dev-gpu-runtime.mjs: duplicate llama-server.exe process detection + VRAM advisory (246e06f011)
- [ ] Deduplicate `isMiniforgeNlpRunning` (port 8095) — defined identically in both
      `ace-incremental-startup.mjs` and `dev-gpu-runtime.mjs`; extract to a shared module
- [ ] Full 47-gate deep audit (G1-G55 + backend infra 17-gate) — deferred this session for
      context budget; graph index (`docs/graph/codebase-graph.json`) is stale, needs
      `npm run graphify:daily` before a real run

P0 blockers (unchanged from packet-key-grain-audit-2026-08-04.md — still need operator input):
- [ ] Packet grain decision: CHUNK_OCCURRENCE recommended by operator (2026-08-04) —
      not yet implemented as the discriminated identity contract (P0.1)
- [ ] Trace `scripts/atlas/backfill-unified-id-hierarchy.mjs`'s `randomUUID()` chunk_id
      into an actual call site/cron trigger — leading hypothesis for the duplicate-row
      defect, not yet confirmed end-to-end (see duplicate-writer-inventory-2026-08-04.md)
- [ ] True-duplicate classification: compare full occurrence tuple (source_ref +
      source_revision + span + chunker_revision + content_hash), not just source_ref count

GPU lane (unblocked, ready to run — PyTorch<->cuVS exact parity PASSED 2026-08-04):
- [ ] Qdrant ANN recall vs the proven exact oracle (per-named-vector: content/error/signature)
- [ ] CAGRA benchmark vs the same oracle, at 2k -> 10k -> 52,380 scale
- [ ] Warmup-correct performance measurement (5 warmup + 20 measured, CUDA sync, separate
      transfer vs compute time) — this session's timing numbers were not warmup-corrected
