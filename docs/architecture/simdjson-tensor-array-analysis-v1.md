# Native JSON, graph and tensor array analysis

Owner reuse: native parsing remains `simd-bridge/cpp/simdjson_bridge.cc`; GPU operations remain the existing LibTorch `graphCandidateGatherGPU` export. `scripts/atlas/lib/simdjson-graph-gather-v1.mjs` composes these implementations with an independent JavaScript CPU oracle. No new index, embedding producer, fusion owner, database table, persistent tensor cache or model is introduced.

## Bounded pipeline

1. Validate a fixed JSON graph with `simdJsonValidate`; round-trip `simdJsonParse` against `JSON.parse`.
2. Materialize CSR using `simdJsonToCSR`; compare rows and columns with the CPU reference. This copies/parses/materializes data, not zero-copy JSON-to-GPU.
3. Run native `graphBFS`; compare deterministic candidate ordinals against the reference.
4. Extract query numbers with `simdJsonExtractNumbers` into Float64Array; check exact correspondence to FP32 inputs. Exercise `simdJsonValidateAstSpans` with valid and invalid UTF-8 boundaries.
5. Summarize FP32 arrays: shape, element count, bytes, minimum, maximum, mean, population variance (Welford accumulation), zeros/fraction and per-row L2 norms. These statistics use CPU float64 accumulation, not PyTorch GPU reduction kernels.
6. Optional explicit GPU proof: check external NVIDIA and native runtime headroom with a 2 GiB reserve, call existing LibTorch CUDA gather/cosine/Top-K, then validate gathered rows, local Top-K indices, global ordinals and scores independently.

The frozen matrix is **4 x 768**, 3,072 FP32 elements / 12,288 bytes. It is synthetic numerical test data, not EmbeddingGemma vectors or a production corpus. The query is **1 x 768**. A dimension of 768 alone does not qualify a representation as canonical `semantic_768`.

## Commands

From `sveltekit-frontend`:

```powershell
npm run atlas:simdjson:tensor:test
npm run atlas:simdjson:tensor:cpu
npm run atlas:simdjson:tensor:mcp
npm run atlas:simdjson:tensor:gpu
```

CPU is the default. GPU mode is explicitly opt-in, never starts/stops a model, and skips dispatch if either headroom check fails. Read the GPU result status: successful CPU parity with skipped GPU is not CUDA proof. Reports are exclusively created under `docs/reports/simdjson-graph-gather-<timestamp>.json`; old artifacts remain untouched.

## MCP surface

`atlas.simdjson_tensor_metrics {}` extends the existing TRACE native diagnostics owner. It takes no caller corpus or arbitrary JSON and runs only the fixed CPU-native fixture. Its receipt includes result/checksum and cumulative process counters, not per-call GPU counters. The TRACE adapter uses its existing addon loader and this shared proof helper. Tools become discoverable only after an intentional TRACE/client refresh; registration is not deployed proof.

The `:mcp` smoke performs an in-memory MCP list/call with the real addon loaded by the existing CLI loader. It does not restart or connect to the deployed TRACE server, and does not prove the deployed server's addon-path selection.

## Qualification limits

- CPU reference checks and native CPU/CUDA fixture parity do not establish corpus lineage, ContextManifest admission, retrieval-quality gains, production readiness or authorization to edit files.
- Graph parsing, CSR construction and CPU BFS are not GNN training. No autograd, PCA/SVD fitting, learned reranker or EmbeddingGemma call is performed.
- LibTorch/ATen gather and cosine ranking are exercised through the existing native addon, not TensorRT engine inference. The addon filename does not prove TensorRT execution.
- The gather path supplies the full matrix, indices and query to the native function. There is no claim of persistent residency, pinned staging, mmap streaming or avoided host-to-device transfers.
- One cold fixture call is numerical execution evidence, not steady-state performance or a GPU speedup benchmark. Timings and memory readbacks are observations of this run only.
- No source/database/cache mutation or hidden reasoning/KV/tensor persistence occurs; receipts contain numerical summaries and checksums only.
