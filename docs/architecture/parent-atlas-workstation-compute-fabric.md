# Parent Atlas Workstation Compute Fabric Architecture

> **Target Hardware:** NVIDIA GeForce RTX 3060 Ti (8 GiB VRAM) + Multi-core Host CPU  
> **Schema:** `atlas.compute-fabric.v1`  
> **Operating Pattern:** CPU Reference → Batch Staging → GPU Challenger → Validated Artifact → SearchRuntime / DAG  
> **Canonical Truth:** PostgreSQL 18.4 (`legal_ai_db`)

---

## 1. Division of Responsibility Matrix

| Technology | Responsibility | Execution Environment | Best Workloads |
|---|---|---|---|
| **PostgreSQL 18** | Canonical Truth & Ledger | Native Windows (`:5434`) | Durable identity, source revisions, FTS GIN, `content_embedding_768` pgvector HNSW. |
| **DuckDB** | Batch Analytics & Staging | Native Node / Python (`packages/atlas-duckdb`) | Parquet/JSONL scans, Arrow record batches, metadata joins, ordinal compilation. |
| **NetworkX** | CPU Graph Reference Oracle | Python 3 (`python/`) | Graph correctness reference, BFS, PageRank, topological sorting, parity baselines. |
| **cuGraph** | GPU Graph Challenger | WSL2 RAPIDS (`atlas-rapids-cu13`) | Batched PageRank, multi-hop neighborhood expansion, Louvain/Leiden communities. |
| **cuML** | GPU ML Executor | WSL2 RAPIDS (`atlas-rapids-cu13`) | KMeans clustering, PCA/TruncatedSVD dimensionality reduction (768 → 256/128/64). |
| **PyTorch / ATen** | Tensor Ops & Rerankers | Native / WSL2 PyTorch | Feature matrices, MLP rerankers, masked cosine similarity, supervised learning. |
| **cuBLAS / cuBLASLt** | Dense Linear Algebra | CUDA C++ / PyTorch ATen | Dense GEMM ($QX^T$), linear projections ($XW$), batched low-rank reconstruction ($UV^T$). |
| **cuVS** | GPU Vector Search | WSL2 RAPIDS / CUDA C-ABI | Exact Top-K brute-force oracle and CAGRA graph ANN challenger. |
| **Ornith 1.5-9b** | Synthesis & Tool-Use Agent | `llama-server.exe` (`:8090`) | Bounded prompt synthesis, JSON structured outputs, function tool calling. |

### 1.1 Canonical vector authority and projected retrieval order

PostgreSQL 18 owns canonical packet/chunk identity, source and workspace revisions, eligibility, evidence, and the designated `semantic_768` storage target (`codebase_chunk_index.content_embedding_768`). The target column's existence does **not** prove a unique production embedding writer or complete row-level representation provenance; keep that writer gate open until independently qualified.

`pgvector` is the canonical dense representation/query surface, not a requirement that every request synchronously execute a PostgreSQL vector scan before any other executor runs. Qdrant, Neo4j/GraphV2, cuVS, and other executors are candidate-nomination/projection lanes. Their IDs, scores, ordinals, and graph topology cannot establish canonical identity or eligibility. Every candidate—including PostgreSQL-produced candidates—must be requalified against canonical packet/chunk/source/workspace and representation evidence before admission to fusion.

The request contract is:

```text
canonical request snapshot + revisions
  → PostgreSQL identity/eligibility and semantic_768 authority
  → bounded candidate nominations (pgvector and/or rebuildable Qdrant / graph projections)
  → revision-qualified graph expansion (where available)
  → PostgreSQL hydration and exact candidate requalification
  → SearchRuntime normalization, same-lane deduplication, and one RRF fusion
  → final Top-K → ACE / ContextManifest admission
```

Executors may run in parallel when the request contract permits; this is not a mandated serial network-call order. The authority order is strict: projected results cannot bypass PostgreSQL qualification, and multiple executors for one logical semantic lane receive one RRF vote. Graph expansion nominates bounded candidates; it does not prove a current graph or create a second fusion owner. Live projection parity, full lineage, and the complete SearchRuntime-to-ContextManifest path remain separate proof gates.

---

## 2. Workstation VRAM Budgeting & Coexistence (8 GiB Ceiling)

The RTX 3060 Ti has **8,192 MiB** of physical VRAM. Active occupancy is strictly governed:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        8 GiB Physical VRAM Budget                      │
├───────────────────────────────────────────────────────┬────────────────┤
│ Active llama-server.exe (:8090, ornith-1.5-9b)        │ Free / Headroom│
│ Weights: ~5,200 MiB (Q5_K_M / Q4_K_M)                 │ ~1,200 MiB     │
│ Context & KV cache: ~1,700 MiB (8k context)           │                │
│ Total active occupancy: ~6,900 MiB                    │                │
└───────────────────────────────────────────────────────┴────────────────┘
```

### VRAM Coexistence Rules:
1. **Lightweight Online Operations (< 1 GiB)**:
   - Small PyTorch query-chunk similarity GEMMs ($32 \times 768$ by $10,000 \times 768 \approx 29.3\text{ MiB}$) can run directly on CUDA alongside Ornith.
2. **Heavy Batch Operations (KMeans, Full Graph PageRank, SVD Basis Recomputation)**:
   - Must coordinate with Ornith:
     1. Drain pending requests via `/slots` idle check.
     2. Gracefully unload or stop Ornith using the graceful task (`GPU: Prepare cuVS KMeans`).
     3. Execute WSL2 RAPIDS job using `/home/james/miniforge3/envs/atlas-rapids-cu13/bin/python`.
     4. Restart Ornith (`TurboQuant: Start`).
   - **Hard Rule**: **NEVER `taskkill /IM llama-server.exe`**.

---

## 3. High-Value GEMM & Matrix Operations

For a frozen cohort of $N = 10,000$ source-qualified chunks and $B = 32$ query vectors:
$$\mathbf{X} \in \mathbb{R}^{10000 \times 768}, \quad \mathbf{Q} \in \mathbb{R}^{32 \times 768}$$

Cosine similarity reduces to dense GEMM over unit-normalized rows:
$$\mathbf{S} = \mathbf{Q} \mathbf{X}^T \in \mathbb{R}^{32 \times 10000}$$

| Operation | Mathematical Form | Primary Executor | Fallback Executor |
|---|---|---|---|
| **Semantic Similarity** | $\mathbf{S} = \mathbf{Q} \mathbf{X}^T$ | PyTorch CUDA / cuBLAS | PyTorch CPU / NumPy |
| **Dimension Projection (768 $\to$ 256/64)** | $\mathbf{Z} = \mathbf{X} \mathbf{W}$ | cuBLASLt / PyTorch | PyTorch CPU SVD Basis |
| **Feature Transformation** | $\mathbf{H} = \mathbf{F} \mathbf{W}_1$ | PyTorch | CPU ListMLE Baseline |
| **MLP Reranker Scoring** | $\hat{\mathbf{y}} = \sigma(\mathbf{H} \mathbf{W}_2)$ | PyTorch ATen | Scikit-learn / XGBoost |
| **Sparse Graph Propagation** | $\mathbf{Z}_G = \mathbf{A} \mathbf{X}$ | SciPy CSR / cuGraph SpMM | NetworkX CPU Traversal |
| **Low-Rank Reconstruction** | $\tilde{\mathbf{X}} = \mathbf{U} \mathbf{V}^T$ | PyTorch / cuBLASLt | SVD CPU Truncated |

---

## 4. Production Integration Checklist & Proof Gates

- [x] **`DUCKDB-BATCH-01`**: Deterministic Arrow/Parquet extraction with schema & identity readback (`docs/reports/duckdb-batch-extract-receipt.json`, 5,000 rows, 30,109 rows/s, ZSTD Parquet).
- [x] **`TENSOR-GEMM-01`**: PyTorch FP32 CPU vs CUDA numerical parity on bounded candidate batches (`docs/reports/tensor-gemm-parity-receipt.json`, max diff $1.4156 \times 10^{-7}$, 271.15x speedup, 39.39 MiB VRAM).
- [ ] **`CUBLASLT-01`**: Benchmarked cuBLASLt dense GEMM vs PyTorch default with measured transfer efficiency.
- [ ] **`GRAPH-CSR-01`**: Stable node-to-ordinal mapping and CSR adjacency compiled from verified reference edges (`CALLS`, `IMPORTS`, `REFERENCES`).
- [ ] **`CUGRAPH-PARITY-01`**: NetworkX CPU vs WSL2 cuGraph PageRank numerical parity on current graph cohort.
- [ ] **`CUML-CLUSTER-01`**: cuML KMeans and TruncatedSVD reproducibility against CPU SciPy/Scikit-learn baselines.
- [ ] **`VECTOR-TOPK-01`**: Exact-search reference oracle with deterministic tie-breaking and automatic CPU fallback.
- [ ] **`DAG-COMPUTE-01`**: ContextManifest-to-DAG execution with memory bounding, zero unauthorized writes, and append-only receipts.

---

## 5. Visual Element Rendering, HTML5 Semantic DOM & N-ary Hyperedge Governance

### 5.1 OpenSpec Ownership (`openspec/changes/visual-element-rendering/`)
To avoid polluting `svelte-a11y-warning-remediation` with 3D/WebGPU/DOM-splitter concerns, visual and template surfaces are governed under `openspec/changes/visual-element-rendering/`:
- **Vertex Skinning (`VER-01`)**: `sveltekit-frontend/src/lib/courtroom/courtroom-scene.svelte.ts` (browser/worker skeletal animation and bone weight invariants).
- **Pixel & Bitmap Encoding (`VER-02`)**: `texture-streaming.ts` and `N64TextureLODSystem.ts` (CPU reference parity and Phase 14 byte budgets: 2 KB active / 40 KB total).
- **Template Elements, Handlers & Runes (`VER-03`)**: `scripts/atlas/svelte-dom-splitter-v1.mjs`, `scripts/atlas/svelte-rune-crosscheck-v1.mjs`, `scripts/atlas/svelte-handler-crosscheck-v1.mjs`, and `scripts/graphify/lib/svelte-ast-extractor.mjs` (proven across 10 components: 50 runes, 27 handlers, 0 span or count mismatches).
- **HTML5 Designs (`VER-04`)**: Defined concretely as **HTML5 Custom Elements / Semantic DOM & Canvas/WebGPU Viewport Surfaces**—the extracted template element hierarchy (`phase3b2-semantic-splitter-pipeline.mjs`, `svelte-dom-splitter-v1.mjs`), `data-*` / ARIA attribute contracts (`svelte-a11y-warning-remediation`), and `<canvas>`/WebGPU surfaces bridged by `courtroom-scene.svelte.ts`, `texture-streaming.ts`, and `src/lib/server/ocr/hybrid.ts`, styled via UnoCSS tokens (`sveltekit-frontend/uno.config.ts`) and Bits UI v2 primitives.

### 5.2 Single-Owner Revision-Qualified Identity & N-ary Hyperedges
- **Sidecar Coordinate Digest (`python/miniforge_nlp_sidecar.py`)**:
-  - `_mint_revision_qualified_tree_node_id` derives a sidecar proposal ID as `tn_v1_<32hex>` when a source revision is known; `_build_ast_units` still emits a fallback digest when revision is `unknown`. `AstUnit.canonical_authority` is always `false`; neither form is canonical PostgreSQL identity.
  - `strict_utf8_to_utf16_offset` fails closed on invalid byte boundaries. Keep `svelte/compiler` as the Svelte structural owner; do not compile a Svelte grammar DLL to replace the existing template/rune/handler path.
  - `mint_sorted_hyperedge_id` defines sorted/deduplicated-member hashing, but no caller was found in the audited sidecar source. It does not prove edge construction or persistence.
- **Existing N-ary persistence owners (no new table authorized)**:
  - The repository already defines `atlas_hyperedges` / `atlas_hyperedge_members`, plus the separate `hypergraph_edges` / `hypergraph_edge_members` event store. A new `atlas_hypergraph_edges` table would duplicate ownership; map any needed contract to an existing owner before proposing schema changes.
  - No `proposed_20261015_atlas_hypergraph_edges_spec.sql` file exists at the referenced path. No migration was applied. PostgreSQL writes remain gated.
- **Auto-Mode Classifier Gate (`sveltekit-frontend/src/lib/server/retrieval/auto-mode-classifier-gate.ts`)**:
  - Wires `resolveValidDagHits` and `rankDenseDagHits` (`karpathy-dag-subhelpers.ts`) to reject stale/unrevisioned DAG hits (`STALE_OR_MISSING_SOURCE_REVISION`). Its current `hyperedgeMatchCount: number` input is not an edge receipt and is not bound to the admitted source revisions; `HYPERGRAPH_NARY` selection is therefore fixture behavior, not verified production routing.

### 5.3 PageRank count scope (reported live audit; receipt reconciliation pending)
- The reported `atlas_graph_authority_scores` total is **212,398 rows** with **3,353 distinct `pagerank_raw` values**.
- The reported **1,761-row** value came from a filtered Phase 7 snapshot, not the full table. These numbers have different cohort scopes and must not be presented as competing table totals.
- The source query, filter predicate, snapshot revision, and checksummed receipt for both counts still need to be attached before either count is treated as independently reverified. Neither total alone proves graph authority quality or promotion eligibility.

### 5.4 Hyperedge schema reuse (live SELECT-only census, 2026-10-16)
- Do **not** create a third hyperedge table. The existing `atlas_hyperedges` and `atlas_hyperedge_members` already hold 62,802 edges and 125,604 member rows; the separate `hypergraph_edges` pair serves event/context records.
- The audited Atlas taxonomy cohort is strictly binary: all 62,802 edges have arity 2 (`CONCEPT_PART_OF` or `CONCEPT_BROADER_THAN`). `atlas_ontology_tuples` is empty. Therefore this census does not prove code N-ary hyperedges or justify routing code queries to an N-ary lane.
- Receipt: `.tmp/atlas/hypergraph-census-for-table-decision.json` (SHA-256 `6350d8d29c078c332d04024926f25def97c2016d99f3280468edf5b9a30a3198`). It is SELECT-only, uses separate statements rather than a repeatable-read snapshot, and reports `CENSUS_COMPLETE_CURRENTNESS_UNPROVEN`; its data revision is `taxonomy-edges-v1-2026-05-08` / `git:0084288f26`.
- Next schema work, if justified by a concrete N-ary producer/consumer, should extend and qualify an existing owner. First prove member roles, revision/checksum lineage, and currentness; do not infer that an array+GIN schema is required from a bitmap-scan analogy.

### 5.5 Graph retrieval currentness refresh (read-only, 2026-10-17)
- A fresh census of the existing `atlas_hyperedges` owner again finds 62,802 edges and 125,604 members, all binary `CONCEPT_PART_OF` / `CONCEPT_BROADER_THAN`; `atlas_ontology_tuples` remains empty. The rows bind to graph revision `taxonomy-edges-v1-2026-05-08` and workspace label `git:0084288f26`; the census did not prove either is the current admitted workspace. `source_revision` is non-null on 62,802 rows, but format/current packet parity is not established by that count. `currentBindingProven=false`.
- Receipt `.tmp/atlas/hypergraph-arity-current-20261017.json`, `mode=READ_ONLY`, `status=CENSUS_COMPLETE_CURRENTNESS_UNPROVEN`, `writesPerformed=false`. It was generated through the existing census helper with a scratch output path.
- SearchRuntime wiring is present: `expandGraphCandidates()` calls the strict KAG code-hyperedge quick-hop reader and the GraphV2 fanout reader before fusion; the KAG reader restricts code expansion to an explicit code-relation allowlist and arity >=3. Existing SearchRuntime fixtures prove a mocked N-ary candidate can reach hydration and final Top-K. This is code/fixture evidence only; the live tables contain no current code N-ary edge cohort, and GraphV2 snapshot admission, production fanout, PageRank qualification, and ContextManifest remain unproven.
- Do not add another hyperedge table or duplicate SearchRuntime connector. The next implementation gate is to produce source-bound code facts through an existing AST/API-contract owner and prove packet/source/revision readback before the existing reader can return live candidates.

