# Parent Atlas Comprehensive Report: IVFFlat Mechanics, Vector Index Architecture, L2 Authorization (`ACTOR-WORKSPACE-GRANT-02`), and Headroom v0.41.0 CCR Verification

**Date**: 2026-10-24  
**Scope**: Vector ANN Indexing (`IVFFlat` vs `HNSW` vs `cuVS K-Means`), WSL2/Windows Network Namespace Audit (`:8787` vs `:8090`), Headroom v0.41.0 CCR Reversible Compression Smoke Proof, `ACTOR-WORKSPACE-GRANT-02` L2 `FeatureRow` Composition, and `:8095` PyTorch NLP Sidecar Verification.

---

## Part I: How `IVFFlat` (Inverted File Flat) Works & How Parent Atlas Uses It

### 1. Mathematical & Structural Mechanics of `IVFFlat`

An **Inverted File Flat (`IVFFlat`)** index accelerates Approximate Nearest Neighbor (ANN) search over $D$-dimensional vectors ($\mathbf{x} \in \mathbb{R}^{768}$) by partitioning the vector space into Voronoi cells before storing raw vectors inside inverted lists.

```
Index Build Phase (K-Means Voronoi Partitioning)
═══════════════════════════════════════════════════════════════════════════
All Vectors X = {x_1, ..., x_N} in R^768
       │
       ▼  Run K-Means clustering with k = lists (nlist)
Centroids C = {c_1, c_2, ..., c_{lists}}
       │
       ▼  Assign each vector x_i to nearest centroid: argmin_j d(x_i, c_j)
Inverted Posting Lists:
  List 1 (c_1) ──► [ (id_4, raw float32[768]), (id_19, raw float32[768]), ... ]
  List 2 (c_2) ──► [ (id_1, raw float32[768]), (id_88, raw float32[768]), ... ]
  ...
  List k (c_k) ──► [ (id_7, raw float32[768]), (id_42, raw float32[768]), ... ]

Query Phase (Centroid Routing + Flat Scan over `probes` Buckets)
═══════════════════════════════════════════════════════════════════════════
Query Vector q in R^768
       │
       ▼  Step 1: Compute distance d(q, c_j) against all `lists` centroids
Select top `probes` (nprobe) closest centroids
       │
       ▼  Step 2: Scan ONLY the raw uncompressed vectors in those `probes` lists
Return Top-K exact distances from the probed buckets
```

#### Step-by-Step Breakdown
1. **Build-Time Clustering (`Inverted File — IVF`)**:
   - During `CREATE INDEX ... USING ivfflat`, pgvector runs **K-means clustering** across the existing table rows to partition the space into `lists` ($k = \text{nlist}$) Voronoi regions, each represented by a centroid $\mathbf{c}_j \in \mathbb{R}^{768}$.
   - Every vector $\mathbf{x}_i$ is assigned to its nearest centroid:
     $$\text{cluster}(\mathbf{x}_i) = \arg\min_{j \in \{1, \dots, \text{lists}\}} d(\mathbf{x}_i, \mathbf{c}_j)$$
2. **Uncompressed Posting Lists (`Flat Storage`)**:
   - Unlike `IVFPQ` (Product Quantization) or `IVFSQ` (Scalar Quantization), **"Flat"** means that inside each cluster's inverted list, vectors are stored in their **raw, unquantized 32-bit floating-point representation** (`vector(768)` = $768 \times 4 = 3,072\text{ bytes}$).
   - Because vectors are uncompressed inside each bucket, distance calculations ($\text{cosine } \texttt{<=>}$, $L_2 \text{ } \texttt{<->}$, or inner product $\texttt{<\#>}$) within the selected buckets suffer **zero quantization distortion**.
3. **Query-Time Lookup (`lists` vs `probes`)**:
   - Instead of an $O(N \cdot D)$ sequential scan over all $N$ rows, the query engine performs:
     $$\text{Cost}_{\text{IVFFlat}} \approx O\left(\text{lists} \cdot D + \frac{\text{probes}}{\text{lists}} \cdot N \cdot D\right)$$
   - For example, with $N = 100,000$ rows, $\text{lists} = 100$, and $\text{probes} = 3$, the query evaluates $100$ centroid distances plus $\approx 3,000$ flat vector distances—a **$\approx 32\times$ reduction** in floating-point operations.
4. **Tuning `lists` and `probes`**:
   - **`lists` (`nlist`, build-time parameter)**:
     - For $N < 1,000,000$: $\text{lists} \approx \frac{N}{1,000}$.
     - For $N \ge 1,000,000$: $\text{lists} \approx \sqrt{N}$.
   - **`ivfflat.probes` (`nprobe`, query-time session parameter)**:
     - Configured via `SET LOCAL ivfflat.probes = 10;`.
     - Default is `1` (fastest, lowest recall). Increasing `probes` searches adjacent Voronoi cells to recover vectors sitting near a cluster boundary. Setting $\text{probes} = \text{lists}$ degrades to an exact brute-force scan.

---

### 2. Why Parent Atlas Migrated Canonical Postgres to `HNSW` While Preserving IVF/K-Means Concepts in GPU Routing

| Dimension | `pgvector` `IVFFlat` | `pgvector` / Qdrant `HNSW` | `:8095` / `:8098` `cuVS K-Means` + Centroid Prefilter |
| :--- | :--- | :--- | :--- |
| **Data Structure** | Voronoi centroids + flat posting lists | Multi-layer navigable small-world proximity graph | GPU-trained K-Means centroids + topology (`topo_class`) tags |
| **Build Speed & RAM** | Fast build; low RAM overhead | Slower build (`ef_construction=200`, `m=16`); higher RAM | Fast GPU training (`train-turbovec-kmeans.mjs` / RAPIDS) |
| **Dynamic Inserts / Drift** | **Static centroids**: inserting new data without `REINDEX` causes centroid drift & recall decay | **Dynamic**: graph updates incrementally as rows are inserted | Rebuildable non-canonical projection; never owns identity |
| **Empty-Table Hazard** | Building `IVFFlat` on an empty table creates degenerate centroids | Safe to create on empty tables (`CREATE INDEX CONCURRENTLY`) | Trained only on frozen snapshots |
| **Role in Parent Atlas** | Legacy migration SQL (`0001_vector_search.sql`, `006_optimize_vector_indexing.sql`) | **Active ANN index** (`20260323_pgvector_hnsw_indexes.sql`, `20261017_codebase_chunk_index_hnsw.sql`, `qdrant-hnsw`) | **Step 1 Retrieval Policy**: Centroid/cluster prefiltering & ML reranking feature on `:8095` |

In Parent Atlas:
1. **Canonical Storage (`PostgreSQL 18`)**: Owns `codebase_chunk_index.content_embedding_768` (`semantic_768`, 768-D, cosine distance `<=>`), indexed with **HNSW (`m = 16, ef_construction = 200`)** so incremental ingestion does not suffer from `IVFFlat` centroid drift.
2. **Retrieval Policy (`AGENTS.md` Enforced Order)**:
   - **Step 1 (Filter First / IVF-style Centroid & Payload Routing)**: Payload conditions, `topo_class`, and K-Means cluster prefiltering narrow the candidate space—performing the exact same geometric role as `IVFFlat` centroid probing (`probes`), while `:8095` (`miniforge-nlp-sidecar`) uses `cuVS_kmeans` cluster affinity as a low-rank feature alongside Naive Bayes, Logistic Regression, XGBoost, and PageRank.
   - **Step 2 (Approximate Geometry)**: Qdrant HNSW (`codebase_chunks_768`) / quantized traversal.
   - **Step 3 (Bounded Exact Rescore)**: Exact distance rescoring over the bounded candidate ordinal set (`CandidateOrdinalMapV1`), just like `IVFFlat`'s flat exact evaluation inside the probed buckets.

---

## Part II: Completed Integration & Verification Report (2026-10-24)

### 1. WSL2 & Headroom v0.41.0 Network Boundary Audit (`:8787` vs `:8090`)

#### Namespace Isolation Matrix
| Endpoint | From Windows Host | From WSL2 Ubuntu | Process / Binding Owner |
| :--- | :--- | :--- | :--- |
| `http://127.0.0.1:8787/livez` | `Connection refused` | **HTTP 200 OK** (`headroom-proxy v0.41.0`) | Bound to WSL2 loopback (`headroom` in `atlas-rapids-cu13` miniforge env) |
| `http://127.0.0.1:8090/v1/models` | **HTTP 200 OK** (`ornith-1.5-9b`) | `Connection refused` | Bound to Windows host loopback (`llama-server.exe`) |

- **No Silent `0.0.0.0` Rebinding**: Neither daemon was rebound to `0.0.0.0`. Under WSL2 NAT mode, Windows loopback and WSL2 loopback occupy distinct network namespaces.
- **Disambiguation of "Headroom" Surfaces**:
  1. **Official Headroom v0.41.0 (`:8787` WSL2)**: CCR context compression proxy (`tree_sitter`, `code_aware`, `smart_crusher`, `magika` loaded and active; `kompress` in passthrough mode).
  2. **Historical `headroom-proxy.mjs` (`:8795`)**: Custom Node.js proxy script.
  3. **`RuntimeHeadroomV1`**: Observational telemetry contract for GPU/VRAM/Valkey resource headroom.
- **Startup Script Enhancement (`scripts/launch-turboquant.ps1`)**:
  - Updated `Test-HeadroomProxyHealth` (lines 114–150) to probe Windows host loopback (`http://127.0.0.1:8787/livez`) first and automatically fall back to WSL2 Ubuntu loopback (`wsl -d Ubuntu -u james bash -c "curl -sS -m 2 http://127.0.0.1:8787/livez"`), reporting the exact `Namespace` (`Windows-Host-Loopback` vs `WSL2-Ubuntu-Loopback`).

---

### 2. Headroom v0.41.0 CCR Smoke Verification (`scripts/test-headroom-ccr-smoke.py`)

#### Why Earlier `/v1/compress` Probes Returned `ccr_hashes: []`
1. Inspection of Headroom v0.41.0's `POST /v1/compress` handler (`headroom/proxy/handlers/openai.py`) established that `/v1/compress` defaults to `_no_ccr_pipeline()` (marker-free mode) unless `"config": {"mode": "ccr"}` is explicitly supplied in the JSON request body.
2. For uniform JSON object arrays where $\ge 80\%$ of keys are shared (`compaction_core_field_fraction = 0.8`), `SmartCrusher` applies lossless **TOON** tabular CSV-schema compaction (`[N]{col1:type,...}`), which drops zero rows and needs no CCR retrieval marker. When lossy row-drop occurs under `"config": {"mode": "ccr"}`, both `code_aware` and `smart_crusher` emit reversible CCR hashes backed by `/home/james/.headroom/ccr_store.db`.

#### Frozen Non-Authoritative Fixture Results (`config.mode = "ccr"`)
- **Token Compression**:
  - `tokens_before`: `11,736`
  - `tokens_after`: `3,136`
  - `tokens_saved`: **`8,600` tokens** (`compression_ratio`: `0.2672`, **73.28% reduction**)
  - `transforms_applied`: `["router:protected:system_message", "router:code_aware:0.53", "router:smart_crusher:0.03"]`
- **CCR Reversible Retrieval (`GET /v1/retrieve/{hash}`)**:
  1. **Code-Aware Tree-Sitter AST (`b3df3352432ed4f38c765afe`)**:
     - Recovered all `18,250` bytes with **100% exact SHA-256 parity** (`b3df3352432ed4f38c765afe331c436ee8f6a4c47a1a5b0adc22e63293b4bf49`, `exactCodeChecksumMatch: true`).
  2. **SmartCrusher JSON Array (`839c4bd65713`)**:
     - Recovered all 99 items with **exact semantic JSON array equality** (`jsonSemanticArrayEqual: true`), while raw byte length changed (`20,493` → `20,296` bytes, `exactJsonRawByteChecksumMatch: false`) because Rust `SmartCrusher` stashes compact canonical JSON (`separators=(",", ":")`).
- **Canonical Evidence Guardrail**:
  - Because `SmartCrusher` re-serializes JSON whitespace, CCR-compressed or CCR-retrieved text is **never** eligible as replacement canonical byte/span evidence (`replacementCanonicalEvidence: false`, `canonicalAuthority: false`).

---

### 3. `ACTOR-WORKSPACE-GRANT-02` & L2 `FeatureRow` Promotion Gate

#### Authorization Contract & Provider (`sveltekit-frontend/src/lib/server/atlas/authorization/actor-workspace-grant-v1.ts`)
Implemented and tested all 7 mandatory access-control and lineage boundary cases:
1. **Cross-Actor Isolation**: Same source, different actor → Deny (`WORKSPACE_NOT_PERMITTED`).
2. **Cross-Repository Isolation**: Same actor, different repository (`repoId`) → Deny (`WORKSPACE_NOT_PERMITTED`).
3. **Revocation Enforcement**: Revoked grant (`revoked: true`) even with matching revision → Deny (`GRANT_REVOKED`).
4. **Segment-Boundary Prefix Collision Prevention**: Permitted prefix `src/a` denies `src/admin/secret.ts` (`SOURCE_REF_OUT_OF_SCOPE`).
5. **Symlink & Relative Path Normalization**: Added `VerifyAccessOptions.sourceNormalizer` and `defaultNormalizeRelativeSourceRef` so `./src//lib/...` and symlinked paths (`symlinks/atlas/...`) normalize through the source owner before scope evaluation.
6. **Cache Freshness & Fail-Closed Revalidation**: Added `AuthoritativeCachedGrantProvider` with TTL expiration, upstream authority revalidation, and fail-closed `STALE_GRANT_CACHE` denial when upstream is unreachable or returns a revoked grant.
7. **Legacy NES Lineage Blocking**: Added `verifyCandidateEvidenceAdmissionV1` so valid workspace grants still refuse canonical promotion when candidate lineage is unresolved (`NES_LEGACY_LINEAGE_BLOCKED`, `summaryUpsertAllowed: false`).

#### L2 `FeatureRow` Composition (`sveltekit-frontend/src/lib/server/atlas/integration/candidate-feature-to-feature-row-v1.ts`)
- Integrated `workspaceAdmission` validation directly into `promoteCandidateFeatureRowV1` and exported `promoteAuthorizedCandidateFeatureRowV1` to compose `verifyActorWorkspaceAccessV1` + `verifyCandidateEvidenceAdmissionV1` + `promoteCandidateFeatureRowV1` in a single fail-closed pipeline.
- All 1,992 `atlas_feature_map.packet_id` (`nes:...`) rows remain classified as `LEGACY_NES_PROJECTION` (`NES_LEGACY_LINEAGE_BLOCKED`).

---

### 4. PyTorch NLP Sidecar (`:8095`) & Test Suite Verification

- **`:8095` PyTorch NLP Sidecar (`miniforge-nlp-sidecar.spec.ts` — 15/15 Passing)**:
  - Verified query routing (`intent-logistic-v1`, `domain-logistic-v1`, `intent-naive-bayes-v1`), low-rank recommendation/reranking (`xgboost`, `naive_bayes`, `cuVS_kmeans`), and PageRank centrality enrichment on `:8095`.
- **Port `:5434` PostgreSQL & `http://localhost:5173/`**:
  - Resolved `wslrelay.exe` port-5434 interception, verified the session join query (`demo@legal-ai.local`, role `admin`), and confirmed `http://localhost:5173/` loads with **HTTP 200 OK** and zero console errors.
- **Test Summary**:
  - `worktree-lease-grant-provider-v1.spec.ts`: **4/4 passed**
  - `actor-workspace-grant-v1.spec.ts`: **11/11 passed**
  - `candidate-feature-to-feature-row-v1.test.ts`: **21/21 passed**
  - `feature-row-description-join-v1.spec.ts`: **5/5 passed**
  - `headroom-ccr-client-v1.spec.ts`: **4/4 passed**
  - `atlas-semantic-tools.spec.ts`: **10/10 passed**
  - `miniforge-nlp-sidecar.spec.ts`: **15/15 passed**
  - Full combined authorization, promotion, CCR, and semantic tool suites: **50/50 passed**.
  - OpenSpec validation: `npx openspec validate parent-atlas-compute-rank-cache-eval-dspy-gepa --strict` → **valid**.

---

## Part III: Port Disambiguation (`:8787` vs `:8795` vs `:8090` vs `:8095`) & Netflix-Style Recommendation Funnel

### 1. Port Authority Matrix

| Port | Service Name | Runtime / Namespace | Role & Authority Boundary |
| :--- | :--- | :--- | :--- |
| **`:8787`** | **Official Headroom v0.41.0 (`headroom-ai`)** | **WSL2 Ubuntu Loopback** (`atlas-rapids-cu13` Python/Rust) | **AST & JSON Context Compressor (CCR)**: Exposes `/v1/compress`, `/v1/retrieve/{hash}`, and `/livez`. Uses Tree-sitter (`code_aware`), Rust `smart_crusher`, TOON tabular compaction, and reversible SQLite CCR hashes (`ccr_store.db`). Non-canonical (`replacementCanonicalEvidence: false`). |
| **`:8795`** | **Custom Atlas Memory Proxy** (`scripts/headroom-proxy.mjs`) | **Windows Host Loopback** (Node.js) | **Session Memory & Turn Trimmer**: Sits between OpenCode/Cline and `:8090` (`UPSTREAM_URL=http://127.0.0.1:8090`). Injects `.headroom-memory.json` operational facts, trims older chat turns at 80% of the 12,000-token budget, and preserves the ACE task packet verbatim. |
| **`:8090`** | **Ornith LLM Server (`llama-server.exe`)** | **Windows Host Loopback** (CUDA GPU) | **Synthesis & Tool-Calling Model**: Serves `ornith-1.5-9b` (`-c 65536 -ngl 99 -fa 1 --cache-type-k q8_0 --cache-type-v q8_0`). Consumes the bounded, authorized, compressed prompt. |
| **`:8095`** | **PyTorch NLP & Low-Rank Recommendation Sidecar** | **WSL2 Ubuntu Loopback** (Miniforge PyTorch) | **Netflix-Style Ranking & Clustering Sidecar**: Runs query classification (`intent-logistic-v1`, `domain-logistic-v1`, `intent-naive-bayes-v1`), `cuVS_kmeans` cluster affinity routing, `xgboost` / low-rank scoring, and `pagerank` centrality. |

### 2. End-to-End Funnel: `IVFFlat`/K-Means Routing → `:8095` Low-Rank Recommendations → `:8787` CCR Compression → `:8090` Ornith

```text
Stage 1: Candidate Generation & L2 Authorization Gate
  • PostgreSQL 18 (semantic_768 HNSW) + Qdrant (:6333) + K-Means centroid prefilter
  • Enforces ACTOR-WORKSPACE-GRANT-02 (promoteAuthorizedCandidateFeatureRowV1)
        │
        ▼
Stage 2: Netflix-Style Low-Rank & ML Reranking (:8095 PyTorch NLP Sidecar)
  • Scores bounded candidates via Logistic Regression, Naive Bayes,
    XGBoost, cuVS K-Means cluster affinity, and PageRank centrality
  • Emits ranked FeatureRowV1 / ACE Context Cards
        │
        ▼
Stage 3: Reversible Context Compression (:8787 Headroom v0.41.0 CCR)
  • POST http://127.0.0.1:8787/v1/compress with {"config": {"mode": "ccr"}}
  • Compresses code/JSON context (~73% token reduction) and emits ccr_hashes
  • Reversible via GET http://127.0.0.1:8787/v1/retrieve/{hash}
        │
        ▼
Stage 4: Memory Injection (:8795) & LLM Synthesis (:8090 Ornith)
  • :8795 (optional Node proxy) injects .headroom-memory.json facts
  • :8090 (llama-server.exe ornith-1.5-9b) synthesizes final grounded answer
```

