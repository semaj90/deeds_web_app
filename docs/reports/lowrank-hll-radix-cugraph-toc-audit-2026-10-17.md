# Low-Rank PCA/SVD, HLL, Radix Sort Top-K, `nx-cugraph` CUDA 13 & `_toc` NES LUT ACE Audit (`LOWRANK-HLL-RADIX-CUGRAPH-TOC-AUDIT-01`)

- **Generated At**: `2026-10-17T20:05:36.901Z`
- **`npm run dev:gpu` Command**: `node scripts/startup/dev-gpu-runtime.mjs`
- **Recommended Startup Logging**: `cd sveltekit-frontend && npm run dev:gpu 2>&1 | Tee-Object -FilePath ../logs/dev-gpu-startup.log`
- **LangExtract Python FastAPI Sidecar (`:8095/health`)**: `reachable=true` (`HTTP 200`)

## 1. Gate Summary
- `DEV_GPU_SCRIPT_VERIFIED`: **PASS**
- `SIDECAR_8095_LANGEXTRACT_HEALTH`: **PASS**
- `AST_GREP_SVELTE_EXTRACTION_VERIFIED`: **PASS**
- `OKF_SCHEMA_TO_NES_LUT_ACE_PACKET_VERIFIED`: **PASS**
- `OKF_SVELTEKIT_VS_LLMS_TXT_COMPARISON_VERIFIED`: **PASS**
- `DOMAIN_LINKED_LIST_BATCH_GEMM_VERIFIED`: **PASS**
- `EMBEDDINGGEMMA_SIMDJSON_OAK_PYTHON_TUPLES_LOGGED`: **PASS**
- `HLL_CARDINALITY_SKETCH_BOUNDED`: **PASS**
- `RADIX_SORT_TOPK_DETERMINISTIC`: **PASS**
- `LOW_RANK_768_TO_64_VALID`: **PASS**
- `NES_LUT_ACE_TOC_PACKET_VALID`: **PASS**
- `NX_CUGRAPH_CUDA13_MATRIX_DOCUMENTED`: **PASS**
- `SUBSYSTEM_OWNERSHIP_INVENTORY_COMPLETE`: **PASS**

## 2. Read-Only Subsystem Ownership & Gap Inventory (No Duplicate Owners)
| Subsystem | Canonical Owner | Status | Boundary Rule |
|---|---|---|---|
| **Phase 72 AST & Route Graph** | `static/phase72/route-ast-graph.json + 8095 Tree-sitter/AST-grep sidecar` | `APPLY_PROVEN` | 8095 owns CST/AST spans; resolveRouteFields normalizes routePath/filePath without promoting filesystem-only routes. |
| **Phase 66 RAG / HyperGraphRAG** | `SearchRuntime + PostgreSQL 18 (semantic_768) + Qdrant projection` | `PARTIAL_PROVEN` | PostgreSQL 18 owns packet/chunk identity and content_embedding_768; HyperGraphRAG consumes revision-bound tuples without adding a second RRF vote. |
| **NetworkX CPU Oracle & nx-cugraph GPU Backend** | `NetworkX (CPU parity oracle) + WSL2 nx-cugraph-cu13 (:8098 lane)` | `FIXTURE_PROVEN` | PageRank and Louvain communities are derived structural traversal projections; never create CandidateOrdinal or identity. |
| **EmbeddingGemma 768-d & Contextual ACE JSON Tuples -> PyTorch ATen** | `embeddinggemma:latest (:11434 GPU query / :11435 CPU backfill) + CandidateFeatureMatrixV1` | `APPLY_PROVEN` | ACE JSON packets provide revision-bound key-value tuples mapped via CandidateOrdinalMapV1 into ATen float32 feature matrices. |
| **XGBoost Stage-2 Reranker & Low-Rank PCA/SVD (768 -> 64)** | `Stage-2 Feature Matrix Reranker (shadow/bounded candidate rescore)` | `SHADOW_ONLY` | Rescores bounded top-K candidates only after deterministic filter + ANN retrieval; never mutates canonical Postgres stores. |
| **gRPC Go Retrieval Executor** | `services/go-retrieval (StreamCodebase / StreamEvidence)` | `PARTIAL_PROVEN` | Read-only progressive streaming executor; SearchRuntime owns cross-executor normalization and final RRF. |
| **OaK 2026 / RL / DSPy-GEPA / RLM / Agent Patterns (Paperclip, Hermes)** | `LangGraph / Shadow Evaluation & KernelDagCandidate Gate` | `SHADOW_ONLY` | Allowed in shadow/dry-run evaluation only; durable mutations require verified claim -> KernelDagCandidate -> schema/lineage admission -> bounded apply script. |

## 3. `.svelte` `ast-grep`, `.okf` Schema (`docs/.okf`), Ornith 1.5 + `:8095` LangExtract & OaK Python Tuples
- **`.svelte` `ast-grep` Symbols Extracted**: `["import:svelte","refreshCatalog","routes","snippet:routeRow","totalCount"]`
- **NDJSON Error Stream**: `logs/error-stream-embeddinggemma-oak-v1.ndjson` (`totalEventsLogged=7`, `uniqueFilesEstimatedHll=7`)
- **Sample OaK Python Tuple**: `("file:scripts/workers/legal-chunk-embed-worker.mjs", "oak:curie:emb-chunk-worker-01", "0x01", "OPTION[embeddinggemma_768_chunk_gate]", 0.6753, 64, "implements")`

## 4. HyperLogLog (`HLL`) + LSD Radix Sort Top-K Pagination (`file_path`)
- **HLL Sketch ($p=10, m=1024$)**: exact=`237`, estimated=`238`, relativeError=`0.42%`
- **Radix Sort Top-K Descending Order**: `27 (admin/+page.svelte) -> 16 (demos/+page.svelte) -> 14 (all-routes/+page.server.ts) -> 4 (search/+server.ts)`

## 5. `nx-cugraph` (`cugraph-cu13`) & NVIDIA CUDA 13 / `cuTile` / `TensorRT-RTX` Matrix
- **Install**: `conda install -c rapidsai -c conda-forge nx-cugraph cuda-version=13.3` or `pip install nx-cugraph-cu13 --extra-index-url https://pypi.nvidia.com`
- **Zero-Code-Change Backend**: `NETWORKX_AUTOMATIC_BACKENDS=cugraph`
- **CUDA 13 `cuTile` & `TensorRT-RTX`**: Tile-based virtual ISA coexisting with SIMT thread blocks; compiler maps tile operations to Tensor Cores and shared-memory TMA. Strict CUDA 13 major/minor parity required for TensorRT-RTX engine serialization (FP4/FP8/BF16/INT4 WoQ on RTX).

## 6. BitFrost Redis/Valkey 7-Day TTL (`604,800s`) + `_toc` NES LUT ACE Packet
- **Redis Key**: `ace:packet:audit-2026-10-17` | **Centroid LRU Key**: `bitfrost:centroid:lru:cuml-kmeans-k16-c03` | **TTL**: `604800s (7 days)`
- **Packet Checksum**: `sha256:54225f1dd0eacd8ccd715c6929567f0f0a07195c7b42cd0f04865072c9618f37`
