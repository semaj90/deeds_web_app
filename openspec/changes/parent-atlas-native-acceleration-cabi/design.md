# Design — Parent Atlas C ABI Core + Adapters

## Architecture

```
                    ┌──────────────────────────────────────────┐
                    │  Parent Atlas Core (C ABI, atlas_core.dll)│
                    │  opaque handles · resources · indexes ·   │
                    │  status codes · execution receipts        │
                    └───────┬──────────┬──────────┬────────────┘
                            │          │          │
              ┌─────────────┴──┐  ┌────┴─────┐  ┌─┴──────────────┐
              │ N-API adapter  │  │ gRPC      │  │ Unreal plugin  │
              │ (tensorrt_     │  │ adapter   │  │ (C++ client)   │
              │  bridge.node)  │  │ (C++ svc) │  │                │
              └───────┬────────┘  └────┬──────┘  └───────┬────────┘
                      │                │                 │
              Node/SvelteKit      Protobuf msgs     Slate/UMG UI
              worker/server       remote workers
                      │
              browser UI · SvelteKit WebGPU (visualization only)
```

## File layout

```
native/atlas_core/include/atlas_core.h        ← public C ABI (no C++/vendor types)
native/atlas_core/src/atlas_core.cpp          ← context, receipts, status messages
native/atlas_core/src/atlas_cuvs.cpp          ← brute-force + CAGRA (cuvsResources_t)
native/atlas_core/src/atlas_pagerank.cpp      ← CSR PageRank (CPU ref + CUDA)
native/atlas_core/src/atlas_turbovec.cpp      ← optional compressed backend
native/atlas_core/src/atlas_cuda_mem.cu       ← cudaMemGetInfo in a real .cu TU
                                                 (fixes __CUDACC__-guarded zero-memory bug)
simd-bridge/cpp/                              ← existing addon becomes the N-API ADAPTER
proto/parentatlas/acceleration/v1/atlas.proto ← gRPC boundary (TensorRef, receipts)
```

## C ABI essentials (from the header contract)

- Opaque: `atlas_context_t`, `atlas_cuvs_index_t`, `atlas_turbovec_index_t`
- `atlas_status_t`: OK / INVALID_ARGUMENT / DIMENSION_MISMATCH / QUEUE_FULL / CUDA_UNAVAILABLE / CUDA_ERROR / OUT_OF_MEMORY / NOT_IMPLEMENTED / INTERNAL_ERROR
- `atlas_backend_t`: CPU / LIBTORCH_CUDA / CUVS_BRUTE_FORCE / CUVS_CAGRA / CUGRAPH / TURBOVEC / WEBGPU
- `atlas_metric_t`: INNER_PRODUCT / COSINE / SQUARED_L2
- `atlas_execution_receipt_t`: operation_id, backend, status, queue_wait_ns, execution_ns, h2d/d2h bytes, used_cpu_fallback — returned by EVERY compute call
- `atlas_context_options_t`: cuda_device, stream_count, queue_capacity, memory_limit_bytes (bounded scheduler is core-owned)
- Windows export: `ATLAS_API` = `__declspec(dllexport/dllimport)` under `ATLAS_CORE_BUILD`

## Three graph-similarity operations (replaces ambiguous `graphSimilarity`)

| Op | Contract | Backend | Job |
|---|---|---|---|
| `atlas_knn_exact` | `atlas_knn_request_t` (queries q×d, corpus n×d, top_k, metric) → indices/distances | cuVS brute_force | exact reference oracle; query→corpus without materializing pairwise matrix |
| `atlas_cagra_build/search` | build opts (graph_degree, intermediate_graph_degree, metric) → index handle → search | cuVS CAGRA | GPU ANN benchmark lane |
| `atlas_similarity_graph_build` | `atlas_pairwise_request_t` (threshold, max_neighbors_per_row) → `atlas_csr_graph_t` | LibTorch/CUDA | bounded sparse candidate↔candidate edges only; never dense n×n by default (n=10K dense ≈ 400 MB FP32) |

## PageRank CSR contract

`atlas_pagerank(ctx, csr_graph, {damping, tolerance, max_iterations}) → {scores, iterations, final_residual, converged} + receipt`.
Four implementations behind one contract: CPU reference (fixtures) / native CUDA or LibTorch (bounded) / cuGraph (large projections) / Neo4j GDS (persisted authority, writeback only). Equivalence proof required across all: identical graph orientation, edge-weight semantics, dangling policy, damping, init vector, tolerance, normalization. No JSON adjacency into cuGraph or N-API.

## Format ownership

| Format | Owns | Never |
|---|---|---|
| JSON (simdjson for C++ reads) | config, diagnostics, audit reports, human receipts, SvelteKit HTTP | embedding matrices (`vectorsFile` ref instead of inline arrays) |
| MessagePack | local event packets, compact receipts (`atlas_receipt_encode/decode_msgpack` + `atlas_buffer_t`), Redis values, replay packets | primary gRPC payload |
| Protobuf/gRPC | remote workers, Unreal↔Atlas, streaming/cancellation/deadlines; `TensorRef{storage_uri, offset_bytes, length_bytes, shape, dtype, content_hash}`; `NeighborBatch` packed repeated; `ExecutionReceipt` | millions of floats in `repeated float` |
| Typed arrays / DLPack / Arrow / mmap | hot numeric payloads at every boundary | — |

gRPC C++ uses the callback API (recommended async interface), deadlines on every call, one read + one write in flight per stream.

## N-API adapter surface (typed arrays only, no JSON in hot path)

```ts
interface AtlasNativeAddon {
  exactTopK(q: Float32Array, qN: number, corpus: Float32Array, cN: number, dim: number, k: number, metric: number):
    Promise<{ indices: BigInt64Array; distances: Float32Array; receipt: NativeReceipt }>;
  cagraBuild(corpus: Float32Array, rows: number, dim: number, opts: CagraOptions): Promise<bigint>;
  cagraSearch(handle: bigint, q: Float32Array, qN: number, k: number): Promise<…>;
  similarityGraph(v: Float32Array, rows: number, dim: number, threshold: number, maxNeighbors: number):
    Promise<{ rowOffsets: BigUint64Array; columnIndices: Uint32Array; weights: Float32Array }>;
  pageRank(rowOffsets: BigUint64Array, columnIndices: Uint32Array, weights: Float32Array, nodeCount: number, opts: PageRankOptions): Promise<…>;
  batchCosineTopK(q: Float32Array, corpus: Float32Array, n: number, dim: number, k: number):
    Promise<{ indices: Int32Array; scores: Float32Array; backend: 'cuda_cublas' | 'cpu' }>; // scores stay on device until top-k
  getBackendInfo(): BackendInfo;       // read-only, see proof gates
  getExecutionCounters(): Counters;    // native-branch counters, see proof gates
}
```

Adapter responsibilities ONLY: validate typed arrays, retain/copy input, submit to bounded scheduler, call C ABI, resolve Promise, build typed-array output.

### N-API concurrency primitives (C/C++ docs)

- C: `napi_create_async_work` / `napi_queue_async_work` (libuv thread pool), `napi_create_threadsafe_function` for worker→JS callbacks — nodejs.org/api/n-api.html §"Asynchronous thread-safe function calls" and §"Simple asynchronous operations"
- C++ (node-addon-api): `Napi::AsyncWorker`, `Napi::AsyncProgressWorker`, `Napi::ThreadSafeFunction` / `Napi::TypedThreadSafeFunction` — github.com/nodejs/node-addon-api `doc/async_worker.md`, `doc/typed_threadsafe_function.md`
- Rules: never block the libuv pool with long CUDA syncs (dedicate a native thread + TSFN); one bounded queue (`queue_capacity` in `atlas_context_options_t`) with `ATLAS_QUEUE_FULL` backpressure instead of unbounded promise fan-out; `torch::cuda::synchronize()` inside the worker thread, never on the JS thread.

## LibTorch (PyTorch C++) placement

Online bounded reranking (128–4096 candidates) stays in-process via N-API: `normalize` → `torch::mm` (dispatches to cuBLAS GEMM on CUDA tensors) → `torch::topk`. Offline exact KNN + graph jobs go to the Python worker (cuVS/RAPIDS via WSL conda env, already installed per `tools/agentic-research`). Relevant ops: `mm/matmul, topk, sort, normalize, softmax, pca_lowrank, svd_lowrank, cdist, index_select, gather, cuda::synchronize`.

## Visualization clients

- **Browser WebGPU (SvelteKit)**: `navigator.gpu` — Chrome ships the implementation; do NOT compile Dawn into SvelteKit. Owns: force-directed layouts, heatmaps, client filtering, visual PageRank exploration. Never canonical (client hardware/state varies; embedding exposure; no revision validation).
- **Native Dawn**: separate target `atlas_dawn_viewer.exe` linking `webgpu.h` (D3D12 on Windows) against `atlas_core.dll`. Never part of `tensorrt_bridge.node`.
- **Unreal Engine**: C++ gRPC client of `AtlasVectorService`; Slate/UMG renders `NeighborBatch`/receipt projections. Game UI is a consumer with deadlines + streaming, zero store access.

## Ornith / Gemma4 / MCP tool-calling alignment

Gemma4 (and Ornith agent flows) call named TRACE MCP tools only — never gRPC, Qdrant, Neo4j, or Postgres directly (existing hard rule). New capability lands as MCP tools wrapping the SvelteKit server which calls the N-API adapter: `atlas.exact_topk_oracle` (fixture-bounded), `atlas.backend_info`, `atlas.parity_report`. Every tool result carries the execution receipt so agent claims about GPU execution are evidence-backed (Agent Execution Integrity: claims require tool evidence).

## Proof gates (no capability reported live without all three)

1. **Backend metadata** — `getBackendInfo()`: addon version, build commit/type, LibTorch version, CUDA compile+runtime availability, runtime version, device name, compute capability, cuBLAS/cuDNN/TensorRT presence or explicit NOT_PRESENT, per-export backend ∈ {cuda_kernel, libtorch_cuda, cpu_fallback, no_libtorch_stub, unavailable}. TensorRT availability is never inferred from the addon filename.
2. **Execution counters** — incremented inside actual CUDA/LibTorch-CUDA branches (not the N-API wrapper), distinguishing cuda_execution / cpu_fallback / stub_invocation / cuda_error_fallback / oom_fallback; `getExecutionCounters()` read-only; every fixture proves the expected branch incremented after reset.
3. **Numerical parity** — deterministic fixtures vs independent CPU/Python oracles (NumPy/CuPy/NetworkX): max abs error, max rel error, top-k overlap, finite counts, elapsed, reported backend. FP16 lanes additionally prove FP32↔FP16 top-k overlap, max score error, no NaN/Inf, stable ordering at the cutoff.

Probe classifications (`scripts/startup-gpu-bridge-probe.mjs`): MISSING_EXPORT / NO_LIBTORCH_STUB / CPU_FALLBACK / CUDA_LIVE / CALL_FAILED / NUMERICAL_MISMATCH / SKIPPED_EXTERNAL_PROOF. Probe records absolute addon path, SHA-256, mtime, build variant, and uses the same resolver as `libtorch-bridge.ts`. Current truthful statuses: `GRAPH_SIMILARITY_CUDA: NOT_USED` (CPU fallback), `BATCH_COSINE_CUBLAS: LIKELY_LIVE (needs counter proof)`, `CUVS_*: NOT_IMPLEMENTED (stub)`.

## Execution receipts (retrieval acceleration)

Versioned schema, stored separately from canonical feature envelopes: operation_id, function, backend, addon SHA, representation_id+revision, workspace_id+revision, source_revision, input/output dims, candidate count, dtype, duration, fallback_reason, numerical_proof_version. MessagePack in Redis, JSON in audit reports.

## TurboVec placement

Optional backend behind `atlas_turbovec_build/search` (bits_per_dimension, block_size, metric, retain_norms). Public "TurboVec" descriptions do not prove parity with this repo's TurboQuant lane — treat as unverified until benchmarked against the cuVS brute-force oracle alongside CAGRA and Qdrant HNSW: recall@k, rank overlap, distance distortion, memory, build/search latency, filter correctness.

## RTX 3060 Ti envelope (from RESEARCH-GRPC-GPJSON-COUCHDB-CACHE-ARCHITECTURE.md)

8 GB VRAM shared across llama-server + embeddings + this lane; 360 GB/s bandwidth bounds large batches; SM 8.6. Consequences: bounded scheduler with `memory_limit_bytes` is mandatory; `getCudaMemory` must be fixed (move `cudaMemGetInfo` to a `.cu` TU — currently `__CUDACC__`-guarded so MSVC C++ TUs report availability with zero memory values); dense pairwise graphs stay capped by `max_neighbors_per_row`.

## Ontology-linked tuples (compressed evidence layer)

A separate layer from execution receipts: receipts describe *what a native call did*; ontology tuples describe *what an agent should know without re-reading the raw log*. Both are evidence, neither replaces raw storage, and neither is a local-LLM acceleration mechanism — RTK-style shell-output compaction, ontology tuples, and native GPU acceleration are three unrelated axes and must not be conflated in documentation or agent-facing claims.

```
event_id     sha256:...                          content-addressed
subject      hydrate_candidates
predicate    sql_binding_failed
object       "ANY() received tuple, not array literal"
session_id   188b
source_path  docs/reports/npm-dev-session-188b.log
byte_start   1234567
byte_end     1234920
raw_sha256   sha256:...                          hash of the referenced span
severity     error
```

Rules:
- Tuples are generated FROM raw evidence (logs, receipts, tool output) after the fact — never the primary write target.
- `source_path` + `byte_start`/`byte_end` MUST resolve to the exact original span; `raw_sha256` lets a reader detect drift if the source file rotates or truncates.
- Byte offsets, not line numbers, are the addressing unit — line numbers shift under log rotation/HMR appends (learned the hard way this session: a `canonical_join_missing` line-number reference went stale within the same log file after later requests appended more lines).
- KAG graph retrieval MAY index tuples for fast lookup; retrieval of a tuple MUST offer the evidence pointer, not just the compressed claim.
- Never describe this layer as: quantizing Ornith, modifying KV cache, compressing GGUF weights, or accelerating llama-server inference. It is a token-reduction/retrieval-indexing aid at the tool-output boundary, the same conceptual layer as RTK's shell-output compaction — not a model or inference optimization.
