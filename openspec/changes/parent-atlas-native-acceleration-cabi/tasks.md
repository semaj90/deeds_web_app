# Tasks — Parent Atlas Native Acceleration C ABI

**Current handoff (2026-09-28)** — P0.1 has an additive, fixture-proven discriminated identity schema. The legacy envelope/hydration route remains unchanged: the live read-only identity census found zero exact symbol/packet matches and stable-file identity owner tables are empty, so P0.2/P0.4 remain blocked; do not infer identity or semantic authority. P1.1–P1.7 are complete at their bounded evidence levels. P2.2 now has the additive request/CSR C ABI, optional LibTorch `torch::mm` backend, fail-closed vendor-free stub, bounded workspace checks, and passing CPU fixtures in both builds; graph CUDA execution is not claimed. P2.3 has a deterministic CPU reference and fixture plus same-fixture NetworkX 3.6.1 parity (maximum absolute error `1.69e-13`, tolerance `1e-10`); Neo4j GDS parity remains open. P2.4 has a combined cosine/top-K N-API export with an out-of-tree CUDA build and four-vector counter-plus-parity canary; workload-scale behavior remains open. No graph result has been promoted or persisted. Canonical identity hydration remains independently blocked.
- **Current status (2026-09-27)**: P1.1–P1.7 are complete as classification, metadata, execution-counter, bounded parity, runtime bridge classification, CUDA memory-query, and reporting gates. Fourteen deterministic operation fixtures passed on the explicit out-of-tree CUDA/LibTorch addon; CUDA branch counters were observed for 11 GPU operations. `graphSimilarity`/`graphSimilarityHalf` and `computeCaseEmbedding` are CPU-owned numerical paths, not CUDA kernels. Startup probe now requires metadata, branch counter, and numerical parity for `CUDA_LIVE`; batch cosine passed that gate and graph similarity reported `CPU_FALLBACK`. CMake's `SIMD_HAVE_CUBLAS` metadata macro is now read correctly and the rebuilt addon reports cuBLAS available. `getCudaMemory` now delegates to the existing `.cu` runtime-info owner and returned 5,855 MiB free / 8,191 MiB total in the bounded read-only probe. The P1.7 contract and parity reports record exact addon identity, all 39 export classes, and operation-level tolerances. This remains fixture-scoped proof, not full-workload parity, broad CUDA liveness, or representation promotion. Error/OOM fallback counters remain unforced.

Statuses: PASS | FAIL | PARTIAL_PROVEN | FIXTURE_PROVEN | NOT_PROVEN | NOT_APPLICABLE.
No CUDA/cuBLAS/cuDNN/TensorRT/cuVS/CAGRA/cuGraph capability may be reported PASS from imports, exports, array shapes, or process exit alone.

## P0 — Identity hydration (blocks everything downstream)

- [x] P0.1 Add discriminated identity contract in `feature-envelope.ts`: `identity_kind: 'symbol'|'file'|'chunk'`; symbol ⇒ `stable_symbol_id`+`symbol_version_id` non-null; file/chunk ⇒ explicitly null + `stable_file_id` required. `FeatureEnvelopeIdentityV1Schema` is additive and fixture-proven; the legacy envelope shape stays compatible until P0.2 supplies canonical hydration identity and P0.4 proves route parity. Focused identity tests passed.
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

- [x] P1.1 Rewrite `scripts/startup-gpu-bridge-probe.mjs` classifications: MISSING_EXPORT / NO_LIBTORCH_STUB / CPU_FALLBACK / SHAPE_VALID / NOT_PROVEN / CALL_FAILED / NUMERICAL_MISMATCH / SKIPPED_EXTERNAL_PROOF; same addon resolver as `libtorch-bridge.ts`; record path + SHA-256 + mtime + build variant; missing exports counted explicitly; no "covered by smoke" promotion
  - **Verified 2026-09-27 (code + pure fixtures)**: probe and application bridge now share `native-addon-paths.mjs`; shape-only results count as `SHAPE_VALID`, never live; backend labels require explicit metadata/counters/parity; skipped external evidence is explicit and is not invoked/promoted. Addon identity metadata and missing-export counts remain in the probe receipt. Classification/resolver fixtures pass 5/5. Probe was not run, so no live addon/GPU claim is made.
  - **Session 195 status**: ❌ CRITICAL CORRECTION. Shape-only classification is NOT truthful. isLive() proves SHAPE_VALID, NOT CUDA execution. Honest result: 15 CALL_OR_SHAPE_SUCCEEDED (classify as SHAPE_VALID or NOT_PROVEN until counters/parity available), 1 SKIPPED_EXTERNAL_PROOF, 0 CUDA_LIVE PROVEN. Probe output must distinguish shape validity from backend execution. Requires: branch execution counters (P1.3+), numerical parity fixtures (P1.4+) before CUDA_LIVE promotion.
- [x] P1.2 Add native `getBackendInfo()` (addon version, build commit/type, LibTorch ver, CUDA compile+runtime, device, compute capability, cuBLAS/cuDNN/TensorRT presence, per-export backend)
  - **Session 195 status**: ⚠️ INCOMPLETE. GetBackendInfoWrapper() source added to binding.cc; NOT YET COMPILED OR TESTED. Missing: build type detection, CUDA runtime version (not __CUDA_ARCH__), device identity (cudaGetDevice), cuDNN/TensorRT presence detection, per-operation backend map. __CUDA_ARCH__ is compile-time constant (device SM architecture), NOT runtime device info. Needs proper .cu translation unit with cudaGetDeviceProperties, cudaMemGetInfo, cudaRuntimeGetVersion. Classification: SOURCE_IMPLEMENTED, BUILD_NOT_PROVEN, EXPORT_NOT_PROVEN, RUNTIME_VALUES_NOT_VALIDATED.
  - **Verified 2026-09-27 (CPU + CUDA compile; read-only metadata)**: `getBackendInfo()` now reports build identity/type, LibTorch version, CUDA compile/runtime/driver versions, device, compute capability, memory, cuBLAS/cuDNN/TensorRT presence, and a per-export backend class from the allowed design vocabulary. All 37 exports include a classification basis and `execution_observed=false`; future unmapped exports fail closed as `unavailable`. CPU-only and CUDA-enabled builds both compiled out of tree. CPU add-on readback classified the no-LibTorch stubs and six stub calls returned errors instead of silent success. CUDA-enabled add-on readback reported CUDA 13.0, NVIDIA GeForce RTX 3060 Ti, compute capability 8.6, and 37/37 classified exports. No exported CUDA/LibTorch computation was invoked; counters/parity remain P1.3/P1.4. CMake's CUDA architecture fallback now defaults to SM 8.6 before CUDA language initialization while preserving explicit caller values.
- [x] P1.3 Add native execution counters inside CUDA/LibTorch branches + `getExecutionCounters()` (cuda_execution / cpu_fallback / stub_invocation / cuda_error_fallback / oom_fallback). **Verified 2026-09-27:** atomic counters are incremented in implementation branches (not N-API wrappers); getter snapshots without mutation and reset is separate. `scripts/gpu/probe-native-execution-counters.mjs` passed against out-of-tree CPU-fallback and CUDA/LibTorch addons: CPU branch produced `[1,0]` scores with `cpu_fallback=1`; no-LibTorch PageRank failed closed with `stub_invocation=1`; CUDA batch cosine produced `[1,0]` with `cuda_execution=1`. `cuda_error_fallback` and `oom_fallback` paths are instrumented but not forced. This is not a parity receipt; P1.4 remains open. No datastore writes.
- [x] P1.4 Create `scripts/gpu/prove-native-gpu-numerical-parity.mjs` — verified 14 deterministic operation cases against independent scalar oracles on the explicit out-of-tree CUDA/LibTorch addon. CUDA branch counters were nonzero for all requested LibTorch GPU ops; graph-similarity variants and `computeCaseEmbedding` are correctly recorded as CPU-owned. Max observed absolute errors were below `3e-5`; the fixture is deliberately tiny and does not prove workload-scale or representation parity. CPU no-LibTorch stubs were not counted as numerical proof. No datastore writes or model calls.
- [x] P1.5 Mark `graphSimilarity` = CPU_FALLBACK explicitly in bridge + probe; prove `batchCosineSimilarity` CUDA/cuBLAS via counters + parity (not shape). **Verified 2026-09-27:** bridge skips native graph similarity unless per-export metadata positively declares CUDA; current graph and half-graph exports resolve to the CPU oracle. Startup probe ran against the out-of-tree CUDA/LibTorch addon: graph similarity was `CPU_FALLBACK` with matching CPU oracle; batch cosine was `CUDA_LIVE`, parity `MATCH`, `cuda_execution=1`, `cpu_fallback=0`; rebuilt metadata reports `cublas_available=1` after correcting the CMake macro check. No database/cache/model writes.
- [x] P1.6 Fix `getCudaMemory`: use the existing `.cu` `atlasGetCudaRuntimeInfo` owner for `cudaMemGetInfo` instead of the `__CUDACC__`-guarded LibTorch C++ shim. **Verified 2026-09-27:** rebuilt the out-of-tree CUDA/LibTorch addon; read-only startup probe returned `rc=0`, free VRAM 5,820 MiB, total VRAM 8,191 MiB. CPU/no-CUDA behavior remains fail-closed. No datastore writes.
- [x] P1.7 Reports: `docs/reports/native-addon-contract-audit.{json,md}`, `docs/reports/native-gpu-numerical-parity.{json,md}`. **Verified 2026-09-27:** reports capture the 39-export backend census and the 14-operation bounded parity receipt, including exact addon SHA, per-export classes, CUDA counter evidence, CPU-owned operations, and scope limitations. JSON receipts parse; strict OpenSpec validation passes. No datastore writes or model calls.

## P2 — C ABI core + adapter extraction

- [x] P2.1 Create `native/atlas_core/include/atlas_core.h` (opaque handles, status/backend/metric enums, context options, execution receipt; zero vendor types) + `atlas_core.cpp`. **Verified 2026-09-27:** standalone CMake static library builds without vendor/store dependencies; a C translation-unit smoke test covers ABI versioning, context lifecycle, receipt initialization, and status reporting. No compute kernel is claimed.
- [x] P2.2 Implement `atlas_similarity_graph_build` → CSR (`threshold`, `max_neighbors_per_row`; no dense n×n default) using normalize + `torch::mm`. **Verified 2026-09-28:** added strict v1 C ABI validation and module-owned CSR outputs; optional LibTorch backend normalizes inputs, uses row-block `torch::mm`, applies inclusive threshold/top-k with deterministic ordinal tie breaks, and rejects invalid rows before output allocation. Vendor-free build returns `NOT_IMPLEMENTED` with empty outputs. CTest passed in vendor-free and optional LibTorch Release builds; CPU fixture covers directionality, self-edge exclusion, ties, zero-k offsets, and invalid vectors. CUDA execution remains unproven; no datastore writes.
- [ ] P2.3 Implement `atlas_pagerank` on CSR with CPU reference; parity vs NetworkX AND Neo4j GDS on one shared fixture (dangling policy, normalization, orientation documented). **Progress 2026-09-28:** the CPU C ABI reference and directed weighted CSR semantics are implemented; Debug/Release fixtures pass analytic dangling-node scores, max-iteration reporting, and malformed CSR rejection. A read-only same-fixture comparison against NetworkX 3.6.1 passed (3 nodes, 2 edges, 23 native iterations, maximum absolute score error `1.685596107137144e-13`, tolerance `1e-10`); Neo4j GDS parity was not called. Keep this task open until GDS parity is proven on the same fixture.
- [x] P2.4 Add `batchCosineTopK` N-API export (scores stay on device through top-k; returns indices + scores + backend). **Verified 2026-09-28:** the additive export normalizes query/corpus, runs `torch::mm` and `torch::topk` before copying only selected indices/scores to host, and reports `cuda_cublas` vs `cpu`; typed-array/dimension validation and implementation-side execution counters are included. Fresh out-of-tree CUDA/LibTorch and vendor-free CPU Release builds passed. The four-vector canary returned indices `[1,2]`, scores `[1,0.8]` in both configurations; CUDA counted one `cuda_execution`, CPU counted one `cpu_fallback`, and both rejected wrong typed-array, NaN, and `k>n` inputs. This is a tiny fixture, not workload-scale retrieval proof; no datastore writes or model calls.
- [ ] P2.5 Refactor `simd-bridge/cpp` into an N-API adapter of `atlas_core` (typed-array validation + bounded scheduler + Promise only; no JSON in hot path)
- [x] P2.6 Execution receipt schema (versioned) + MessagePack encode/decode (`atlas_receipt_*_msgpack`, `atlas_buffer_t`); receipts stored separately from canonical envelopes. **Verified 2026-09-27:** added deterministic `atlas.execution-receipt.v1` MessagePack encode/decode over the existing execution-only receipt, using the module-owned buffer API. Decoder requires the exact ten-field ordered profile, validates enum/boolean ranges and rejects malformed/trailing input without partially mutating the output. C ABI round-trip/malformed/reserved-field fixtures pass in Debug and Release; emitted bytes decode with `@msgpack/msgpack` when 64-bit values use BigInt mode. This adds no canonical-envelope fields and performs no persistence or datastore writes.
- [ ] P2.7 FP16 lane proof: FP32↔FP16 top-k overlap, max score error, NaN/Inf-free, stable cutoff ordering (RTX 3060 Ti Tensor Cores). **Progress 2026-09-28:** out-of-tree RTX 3060 Ti canary compared 64×768 vectors at k=10; exact FP32/FP16 order matched (10/10), all scores were finite, max absolute score error was `3.7109851837158203e-4`, cutoff margin was `9.999990463256836e-3`, and both implementation counters reported CUDA execution with no fallback. Tensor Core instruction-level proof remains open: Nsight Compute returned `ERR_NVGPUCTRPERM` for hardware performance-counter access. Do not claim Tensor Core utilization from FP16 inputs/backend labels alone.
- [ ] P2.8 CUDA graph capture/replay limited to fixed-shape repeat workloads (1×768·768×4096 cosine pages); no multi-stream until single-stream contracts proven

## P3 — cuVS / RAPIDS / remote boundary

- [ ] P3.1 Implement `atlas_knn_exact` via cuVS brute_force (replace `cuvs_bridge.cc` stub) — exact oracle; validated vs NumPy oracle first
- [ ] P3.2 Benchmark lanes vs the exact oracle: Qdrant HNSW recall, CAGRA (`atlas_cagra_build/search`), TurboVec (optional backend) — recall@k, rank overlap, distortion, memory, build/search latency, filter correctness

## Workstation status note — 2026-08-13

This acceleration lane was not deleted. CUDA, LibTorch, TensorRT, RAPIDS/cuVS/cuGraph, and CAGRA sources remain available, with the dedicated RAPIDS sidecar and `docker/cuvs-grpc/` retained. The active 8095 AST container is intentionally lightweight and currently reports PyTorch/cuVS/cuGraph/CuPy/CAGRA unavailable. Treat this as `DEFERRED_CAPABILITY`, not `DELETED` or production failure.

Promotion remains benchmark- and runtime-proof-gated: Python 3.14, multi-threading, simdjson, TensorRT, and GPU ANN integration must not be promoted from source presence or import shape alone.
- [ ] P3.3 Author `proto/parentatlas/acceleration/v1/atlas.proto` (Metric, TensorRef, SearchRequest with workspace/representation revisions, NeighborBatch packed, ExecutionReceipt, AtlasVectorService: ExactSearch/CagraSearch); gRPC C++ callback API, deadlines mandatory
- [ ] P3.4 Offline projection jobs via Python worker (cuML KMeans/PCA/IncrementalPCA, cuGraph pagerank/louvain/leiden/wcc/k_core/jaccard) — consuming the `tools/agentic-research` WSL env; identity always joined back to Postgres
- [ ] P3.5 GPU row manifest before any vector export: Qdrant point ID ↔ Postgres canonical identity ↔ content_hash ↔ representation_revision (immutable)
- [ ] P3.6 Report: `docs/reports/parent-atlas-acceleration-integration.{json,md}`

## P4 — Consumers (contracts only in this change)

- [ ] P4.1 SvelteKit browser WebGPU visualization consumes projection endpoints only (layouts, heatmaps, PageRank exploration); document non-authority contract
- [x] P4.2 Unreal plugin contract: gRPC client of AtlasVectorService, Slate/UMG rendering, no store access (contract doc, no implementation). **Verified 2026-09-27:** `docs/architecture/parent-atlas-unreal-client-contract-v1.md` records the client/service boundary, revision validation ownership, deadlines/cancellation, bounded presentation payloads, and no store access. DESIGN_ONLY_NOT_IMPLEMENTED; P3.3 owns the still-missing protobuf/service contract; no Unreal build or RPC was performed.
- [x] P4.3 Native Dawn viewer as separate target spec (`atlas_dawn_viewer.exe` + `atlas_core.dll`); never linked into `tensorrt_bridge.node`. **Verified 2026-09-27:** `docs/architecture/parent-atlas-native-dawn-viewer-contract-v1.md` defines the separate target, read-only projection boundary, revision labeling, ABI/buffer ownership, and deferred service dependency. DESIGN_ONLY_NOT_IMPLEMENTED; no Dawn build, RPC, store connection, or rendering proof is claimed.
- [x] P4.4 MCP tools for Ornith/Gemma4: `atlas.backend_info`, `atlas.exact_topk_oracle` (fixture-bounded), `atlas.parity_report` — every result carries execution receipt; agents never touch gRPC/stores directly. **Verified 2026-09-28:** TRACE MCP registration exposes only these bounded diagnostics; an in-memory MCP `tools/list` + `tools/call` exchange returned `PARITY_MATCH` from a fixed CPU fixture with checksum receipt and `writesPerformed=false`, `modelCallsPerformed=false`, `canonicalAuthority=false`. Native-addon/CUDA execution and live TRACE handshake are not claimed.

## P2b — Contract amendments (2026-08-04 review)

- [x] P2b.1 Explicit buffer ownership in `atlas_core.h`: allocator/deallocator pairs; every buffer freed by the allocating module; versioned structs (`struct_size` first member or version tag). **Verified 2026-09-27:** versioned `atlas_buffer_t` alloc/free API is module-owned; C smoke test verified allocation, release, reset, and idempotent empty release.
- [x] P2b.2 Representation contract binding: index build + compute requests carry representation_id, revision, dims, dtype, normalization, metric, model id+hash; mismatch (e.g. latent_64 query vs semantic_768 index) rejected pre-compute with receipt reason. **Verified 2026-09-27:** the versioned C ABI defines index-build/compute request envelopes and a pre-compute validator for representation ID/revision, dimensions, dtype, normalization, metric, and optional paired model ID/SHA-256. The C receipt reports specific invalid/mismatch reasons; C-compiled fixture tests cover valid requests and each comparison axis. This proves the request contract/guard only; index and compute operations remain unimplemented and no GPU/native compute or store writes occurred.
- [x] P2b.3 Compute-only core audit: no PostgreSQL/Qdrant/Redis/Neo4j/Kafka/HTTP/store-filesystem dependency linked into atlas_core. **Verified 2026-09-27:** standalone `native/atlas_core/CMakeLists.txt` builds only the core static library and C ABI test; source/include scan found no store, network, or vendor SDK dependencies. This is a source/build-boundary audit, not a binary-wide deployment audit.
- [x] P2b.4 Probe classes extended: `NOT_IMPLEMENTED`, `LIBTORCH_CPU`, and `NOT_PROVEN` are explicit outcomes; binary presence, implementation linkage, symbol loading, and branch execution remain independent claims. **Verified 2026-09-27:** `buildNativeProbeEvidenceClaims()` preserves unknown implementation linkage, derives branch execution only from complete CPU/CUDA counters, and leaves unattempted or incomplete-counter cases unknown. Six focused tests pass. No native addon or GPU probe was executed in this proof.

## P4b — Ontology-linked tuple layer (2026-08-04 addition)

- [x] P4b.1 Define the tuple envelope type as a shared JSON Schema + Zod contract. **Verified 2026-09-27:** `@atlas/semantic-contracts` now exports `EvidenceTupleV1Schema`/`createEvidenceTupleV1` and publishes `schemas/evidence-tuple-v1.schema.json`. `event_id` is SHA-256 over canonical envelope fields; `raw_sha256` independently identifies the exact evidence span. The schema rejects malformed digests, unknown fields, unsafe/invalid byte ranges, and tampered event IDs. Three focused tests pass and the package TypeScript project compiles. This is contract proof only; no source span was read, indexed, persisted, or promoted.
- [x] P4b.2 Generator: raw evidence (logs, receipts, tool output) -> tuple, byte-offset addressed (not line numbers -- logs rotate/append). **Verified 2026-09-27:** `createEvidenceTupleFromRawSpanV1` accepts caller-supplied claim fields plus source bytes and an explicit byte range, verifies the span is valid UTF-8, hashes the exact bytes, and emits the content-addressed envelope. It does not infer claims, access files, or persist/index output. Four focused tests pass, including multibyte UTF-8 byte-offset, range, and split-codepoint rejection cases.
- [ ] P4b.3 KAG indexing of tuples with mandatory evidence-pointer resolution on retrieval
- [x] P4b.4 Document clearly: this layer is token-reduction/retrieval-indexing only, never conflated with RTK (shell-output compaction) or native GPU acceleration (this same OpenSpec's core subject). **Verified 2026-09-27:** `design.md` explicitly separates execution receipts from ontology tuples, states that the tuple layer reduces agent/tool-output rereads rather than model compute, and forbids describing it as KV/weight/inference acceleration. No runtime behavior is implied by this documentation gate.

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
- [x] Find Gemma4Invoker callers — current source exposes `getGemma4Invoker()` and its singleton, but repository search found no production import/call site; only `scripts/atlas/smoke-phase4-ace.mts` probes the export dynamically. Centroid compression is instead invoked from `ollama.ts::bifrostChat` and receives `options.valkey`; this caller discovery does not prove Valkey is supplied by production callers or establish token savings. Keep the adjacent Valkey wiring and end-to-end measurement tasks open.
- [x] Wire Valkey instance from caller context — `gemma4-codeintel.ts::callGemma4WithAceContext` passes `getRedis()` to `bifrostChat({ valkey })` on the non-structured-format branch; `ollama.ts::bifrostChat` passes that client to the read-only `compressionPipeline`. This is source-level wiring only; it does not prove centroid hits, production caller reachability, or token savings.
- [ ] Test end-to-end, verify 30-40% token reduction — remains unproven; the centroid keys were previously observed empty, and this turn made no cache reads, model calls, or inference requests.

**Expected Impact**: 4.8K → 3K-3.5K tokens (30-40% savings)

**Note**: Valkey centroid keys don't exist yet (confirmed empty). Layer active when centroid cache is populated.

---

## P5 — Session 188 operational next steps (2026-08-04 handoff)

Native/GPU startup reliability (adjacent to this spec's proof-gate discipline):
- [x] launch-turboquant.ps1: model_alias verification in health check (87f4a96540)
- [x] dev-gpu-runtime.mjs: always delegate to launcher, don't trust bare /health (58663ad3d1)
- [x] dev-gpu-runtime.mjs: duplicate llama-server.exe process detection + VRAM advisory (246e06f011)
- [x] Deduplicate `isMiniforgeNlpRunning` (port 8095) — defined identically in both
      `ace-incremental-startup.mjs` and `dev-gpu-runtime.mjs`; extract to a shared module. **Verified 2026-09-27:** both startup paths import `startup/miniforge-nlp-health.mjs`; the shared probe preserves the 2-second timeout and exact health/model check. Six focused Node assertions pass for healthy identity, custom/default port, HTTP error, malformed JSON, wrong service identity, and rejected fetch. All three startup modules pass `node --check`; no service was contacted by the fixtures.
- [ ] Full 47-gate deep audit (G1-G55 + backend infra 17-gate) — deferred this session for
      context budget; graph index (`docs/graph/codebase-graph.json`) is stale, needs
      `npm run graphify:daily` before a real run

P0 blockers (unchanged from packet-key-grain-audit-2026-08-04.md — still need operator input):
- [ ] Packet grain decision: CHUNK_OCCURRENCE recommended by operator (2026-08-04) —
      discriminated schema is now present (P0.1); production adoption still depends on
      canonical join/hydration and remains a separate decision.
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
- [ ] CANONICAL-IDENTITY-V1 POINTER (2026-09-21): canonical object identity (symbol/file/chunk discriminants, mandatory workspaceRevision + sourceRevision, no 'unknown'/latest-row inference, representation/execution/transport ids and CandidateOrdinal are NOT canonical identity) is owned by `CANONICAL-IDENTITY-V1-SPEC-01` in `openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md`. This change SHALL reference that contract and not define its own identity rules; it may add representation-, execution-, feature-, cache-, transport- or projection-specific identities only. Pointer only; no scope change here. Spec status: SPEC_DRAFT (not signed off).
