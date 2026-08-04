# OpenSpec: Parent Atlas Native Acceleration — C ABI Core + Adapter Boundaries

## Why

The native lane is currently one monolithic N-API addon (`tensorrt_bridge.node`) that mixes LibTorch, stubs, CPU fallbacks, simdjson, and a cuVS placeholder behind identical-looking exports. Verified live (2026-08-04):

- `simd-bridge/cpp/cuvs_bridge.cc` — **stub**: `compressEmbedding` returns `true`, no cuVS call (`TODO: Actual cuVS IVF-PQ Quantization logic would hook in here`)
- `simd-bridge/cpp/libtorch_stubs.cc` — `graphSimilarity`/`graphSimilarityHalf` return `-99` (NO_LIBTORCH sentinel)
- `simd-bridge/cpp/graph_fallback_stubs.cpp` — CPU O(n²·d) cosine loop variant; a successful JS probe proves **export liveness only**, not CUDA/cuBLAS execution
- `batchCosineSimilarity` (`pytorch_graph.cc`) is the one lane that genuinely reaches cuBLAS via `torch::mm` on CUDA tensors — the correct 1×d · d×n reranking shape
- `scripts/startup-gpu-bridge-probe.mjs` classifies "addon loaded + function returns array" as live — evidence laundering by the Agent Execution Integrity rules

Meanwhile new consumers are arriving that must NOT become retrieval authorities: SvelteKit browser WebGPU visualization, a future Unreal Engine game-UI client, native Dawn workbench, Ornith/Gemma4 MCP tool calling. Without a boundary contract, each consumer grows its own path into the addon or the stores.

## What this proves / decides

- **One C ABI core, several adapters.** `atlas_core` exposes opaque handles (`atlas_context_t`, `atlas_cuvs_index_t`, `atlas_turbovec_index_t`), `atlas_status_t` errors, and `atlas_execution_receipt_t` telemetry. The public header contains no Napi, torch, raft, nlohmann, grpc, or Unreal types. N-API, gRPC, and Unreal are consumers of the core — never dependencies inside it. (Same pattern cuVS itself uses: C library, official C API with `cuvsResources_t`, language wrappers on top.)
- **Graph similarity splits into three operations** with distinct contracts: `atlas_knn_exact` (query→corpus top-k, cuVS brute-force oracle), `atlas_cagra_build/search` (approximate ANN), `atlas_similarity_graph_build` (bounded sparse CSR candidate graph — never a dense n×n matrix by default).
- **PageRank consumes CSR, not JSON.** All four implementations (CPU reference, LibTorch, cuGraph, Neo4j GDS writeback) sit behind one CSR contract with an equivalence proof: same directed graph, edge-weight interpretation, dangling-node policy, damping, initial vector, tolerance, normalization.
- **Format ownership**: JSON = config/diagnostics/audit/HTTP (never embedding matrices); MessagePack = local event packets, compact receipts, Redis values (never the primary gRPC payload); Protobuf/gRPC = remote worker boundary with `TensorRef` (storage URI + offset + shape + dtype + content_hash) instead of `repeated float` for large tensors; hot numeric payloads = typed arrays / DLPack / Arrow IPC / mmap.
- **Visualization clients are not retrieval authorities.** Browser WebGPU (SvelteKit) and Unreal/Slate/UMG render projections; native Dawn is a separate target (`atlas_dawn_viewer.exe`), never compiled into `tensorrt_bridge.node`. No client-side result replaces server-side workspace-revision validation.
- **Ownership boundaries stand**: PostgreSQL = canonical identity/revision; Qdrant HNSW = online ANN; cuVS brute-force = exact oracle; CAGRA = experimental GPU ANN; LibTorch/cuBLAS = bounded online reranking; cuML/cuGraph = offline projection jobs; Redis = derived caches; Neo4j GDS = persisted graph analysis; HyperGraphRAG = multi-participant traversal. No projection store or GPU result manufactures canonical identity.
- **Proof-first**: no capability is reported live without backend metadata + native execution counters + numerical parity against an independent oracle.

## Identity-hydration correction (P0, supersedes session-188 hotfix)

Session 188 unblocked `search-unified` by making six envelope identity fields `.nullable()` (commit `63a91eeca5`). That restored packets but is a stopgap: it declares "identity absent" globally valid. This change replaces it with a **discriminated identity contract** — `identity_kind: 'symbol' | 'file' | 'chunk'` where symbol envelopes require `stable_symbol_id`/`symbol_version_id` non-null, file/chunk envelopes require them explicitly null with `stable_file_id` present — plus a canonical join to the symbol-tree identity source in hydration (the current SQL selects only `codebase_chunk_index`; the "optional atlas_packets join" comment has no matching join). Typed hydration counters (`canonical_row_matched`, `envelope_validated`, `missing_stable_symbol`, `missing_stable_file`, `schema_revision_rejected`, `representation_rejected`) replace the single `envelope_build_failed` counter.

## Live code paths this change touches

`simd-bridge/cpp/*` (binding.cc, pytorch_graph.cc, cuvs_bridge.cc, libtorch_stubs.cc, graph_fallback_stubs.cpp), `sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts`, `scripts/startup-gpu-bridge-probe.mjs`, `sveltekit-frontend/src/lib/server/retrieval/{hydrate-candidates,feature-envelope,search-runtime,canonical-rerank-executor}.ts`, `src/mcp/server.ts` + TRACE MCP registry (Ornith/Gemma4 tool surface), `.vscode/tasks.json` GPU tasks.

## Non-goals

- No Unreal plugin implementation in this change (contract + proto only)
- No Dawn compilation into the Node addon, ever
- No production Bitfrost warming / Qdrant migration (separate lanes)
- No replacement of Qdrant as online ANN
