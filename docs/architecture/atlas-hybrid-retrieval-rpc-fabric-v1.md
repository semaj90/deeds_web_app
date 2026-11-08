# Parent Atlas Hybrid Retrieval & Compute Architecture

> **Authoritative Specification (2026-11-07)**  
> PostgreSQL 18 Canonical Truth · Native C++/Rust N-API Addons · Inter-Process RPC Sidecars · RTX GPU Challenger Compute

---

## 1. Core Principles: N-API vs. RPC vs. Sidecars

```mermaid
flowchart TD
    subgraph InProcess ["In-Process Runtime: SvelteKit 2 Server (Node.js 20+)"]
        A["SvelteKit 2 API Routes / Server Hooks"] -->|C-ABI Call| B["N-API Native Addon (tensorrt_bridge.node)"]
        B -->|AVX2 SIMD Validate/Minify| C["simdjson-bridge.ts\n(In-engine validation + V8 materialization)"]
        B -->|Cache-Coherent Stride| D["AlignedKeyframeChunk64B Radix/Morton Sorter\n(simd-bridge/cpp/spatial_packet_synthesizer.cpp)"]
        B -->|Explicit Buffer Contract| E["256-Bit Occupancy / 4-Bit Nibble Packing"]
    end

    subgraph Datastore ["PostgreSQL 18 (Canonical Storage & Lineage)"]
        A -->|Drizzle ORM / pg Pool| F["codebase_chunk_index (halfvec 768)"]
        A -->|Drizzle ORM / pg Pool| G["kanban_tasks & kanban_task_dependencies"]
        A -->|Drizzle ORM / pg Pool| H["atlas_representations & atlas_artifacts"]
        A -.->|Staging Only (Not Canonical)| J["public.atlas_concept_tie_v2 (Physical Table Present)"]
    end

    subgraph Sidecars ["Inter-Process Sidecars (Network / gRPC / HTTP RPC)"]
        A -->|HTTP / JSON RPC| K[":8095 Miniforge NLP Sidecar\n(Tree-sitter CST + AST-grep + Domain Extraction)"]
        A -->|gRPC / HTTP :8100| L[":8100 Go Retrieval Service\n(Read-only streaming across pgvector & Qdrant)"]
        A -->|MessagePack RPC :8098| M[":8098 WSL2 RAPIDS / cuVS Sidecar\n(cuVS Brute Force / CAGRA ANN + cuML KMeans)"]
    end

    subgraph PythonCompute ["Python Numerical Pipeline (PyTorch ATen / Polars / RTX 3060 Ti)"]
        N["polars_nes_dag_recommender.py\n(Columnar Kahn DAG topological ordering)"]
        O["pytorch_aten_spatial_keyframes.py\n(ATen 64-byte keyframe & K-Means clustering)"]
        P["synthesize-lowrank-task-rpc-v1.py\n(MRL low-rank slicing & Feature-Row RPC packet)"]
        Q["prove-rtx-mlp-kmeans-umap-domain-dspy-v1.py\n(RTX 3060 Ti Contextual MLP + Spherical Adaptive KMeans + Graph UMAP + DSPy Bridge)"]
    end
```

### What is N-API? Is N-API like an API?
* **No, N-API (Node-API) is not an HTTP or REST API.** It is the official **C ABI (Application Binary Interface) for Node.js native addons** (`node_api.h`).
* A C++ or Rust addon (`tensorrt_bridge.node`) compiles to a native dynamic library and links directly into the Node.js V8 process.
* **Zero-Copy Contract**:
  * Zero-copy between C++ and SvelteKit is **possible, but not automatic**.
  * It requires an explicit buffer contract, ownership, and lifetime management (`napi_create_external_arraybuffer` with a `napi_finalize` callback hook, or preallocated memory arenas).
  * Node.js documentation guarantees that externally backed buffers remain valid only if the underlying native memory is kept alive until the finalizer fires.
* **Where it lives**:
  * [`simd-bridge/cpp/spatial_packet_synthesizer.cpp`](file:///c:/Users/james/Videos/deeds-web-app/simd-bridge/cpp/spatial_packet_synthesizer.cpp) (64-byte aligned Morton radix sort).
  * [`sveltekit-frontend/src/lib/server/gpu/simdjson-bridge.ts`](file:///c:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/server/gpu/simdjson-bridge.ts) (AVX2 SIMD JSON validation and minification).

---

## 2. Four Verified Architectural Clarifications

| Area | Verified Architectural Interpretation | Implementation Contract |
| :--- | :--- | :--- |
| **Node-API** | **Zero-copy requires an explicit buffer lifecycle contract.** It is not automatic. The underlying pointer must remain pinned and valid until `napi_finalize` triggers. | Use `napi_create_external_arraybuffer` with `pool_finalizer()` in `binding.cc`. |
| **simdjson** | **Native minification + validation, then V8 materialization.** `simdjson-bridge.ts` parses and validates in native C++, then calls `JSON.parse` in JS. Numeric extractions across N-API explicitly allocate typed buffers. | Native parser validates structure before V8 allocates objects; no unbounded string concatenation. |
| **PyTorch API** | **`torch::from_blob()` is C++ LibTorch only.** In Python, CPU buffer sharing uses `torch.frombuffer()`. Transferring to GPU (`.to("cuda")`) is an explicit device allocation/copy, not zero-copy IPC. | Production decoders must check native little-endian byteorder, payload byte length, 64-byte pointer alignment, and SHA-256 digest. |
| **Representation Naming** | **Disambiguate `EMBEDDINGGEMMA_MRL` from `LEARNED_LATENT`.** `semantic_768` $\to$ `semantic_mrl_128` is a direct prefix truncation. `latent_64` / `latent_256` are learned autoencoder outputs (`nested_semantic_autoencoder_v3_full01.pt`). | Reject attempts to relabel a direct MRL prefix slice as an autoencoder-derived latent vector. |

---

## 3. Representation Registry Contract (`canonical-candidate-v1.ts`)

The Parent Atlas candidate registry strictly distinguishes between two representation families:

```
Family 1: EMBEDDINGGEMMA_MRL (Cosine-distance, MRL prefix slices)
  ├── semantic_768        (768-D Canonical Dense Vector, projection: NONE)
  ├── semantic_mrl_512    (512-D Prefix Truncation)
  ├── semantic_mrl_256    (256-D Prefix Truncation)
  └── semantic_mrl_128    (128-D Prefix Truncation)

Family 2: LEARNED_LATENT (Autoencoder-derived, Normalized)
  ├── latent_256          (256-D LEARNED_AUTOENCODER from semantic_768)
  ├── latent_64           (64-D LEARNED_AUTOENCODER from semantic_768)
  └── latent_128          (128-D NESTED_PREFIX_L2_RENORMALIZE from latent_256)
```

> [!IMPORTANT]
> When slicing an embedding vector directly, the resulting representation is an **MRL prefix slice** (`semantic_mrl_*`), **never** `latent_64`. `latent_64` requires execution through the trained Phase 16 checkpoint (`python/checkpoints/nested_semantic_autoencoder_v3_full01.pt`).

---

## 4. Physical Database State vs. Migration Metadata

A physical query on the live PostgreSQL 18 instance (`legal_ai_db`) established the distinction between migration status and physical table existence:

```sql
BEGIN READ ONLY;
SELECT to_regclass('public.atlas_concept_tie_v2') AS concept_tie_table,
       to_regclass('public.atlas_spatial_keyframes_v1') AS spatial_keyframes_table;
ROLLBACK;
```

* **`public.atlas_concept_tie_v2`**: **Physically exists** with 7 indexes (`atlas_concept_tie_v2_pkey`, `atlas_concept_tie_v2_lane_idx`, `atlas_concept_tie_v2_concept_idx`, `atlas_concept_tie_v2_change_idx`, `atlas_concept_tie_v2_task_id_concept_id_tie_lane_key`, `atlas_concept_tie_v2_proposal_gin`, `atlas_concept_tie_v2_unknown_gin`).
* **`public.atlas_spatial_keyframes_v1`**: **`null`** (does not physically exist; it is an unapplied staging migration in `sidecar-migrations.json`).
* **Authority Gate**: Physical table existence does **not** confer canonical authority. `canonicalAuthority` remains `false` until revision lineage and admission predicates pass.

---

## 5. Binary Stride Contract: 64-Byte Keyframe Layout

Aligned between [`simd-bridge/cpp/spatial_packet_synthesizer.cpp`](file:///c:/Users/james/Videos/deeds-web-app/simd-bridge/cpp/spatial_packet_synthesizer.cpp) and [`scripts/spatial/pytorch_aten_spatial_keyframes.py`](file:///c:/Users/james/Videos/deeds-web-app/scripts/spatial/pytorch_aten_spatial_keyframes.py):

```cpp
#pragma pack(push, 1)
struct AlignedKeyframeChunk64B {
    uint32_t morton_code;       // 0..3: 4B  30-bit Morton index for radix sorting
    uint16_t slot_index;        // 4..5: 2B  Target slot in 256-element N64 arena
    uint16_t cluster_id;        // 6..7: 2B  Unsupervised K-Means Top-K assignment
    float position[3];          // 8..19: 12B X, Y, Z coordinates
    float rot_6d[6];            // 20..43: 24B Continuous 6D rotation
    float scale[3];             // 44..55: 12B Cartesian scale
    uint32_t flags;             // 56..59: 4B  Provenance and classification flags
    uint32_t reserved;          // 60..63: 4B  Padding alignment (sizeof == 64)
};
#pragma pack(pop)
static_assert(sizeof(AlignedKeyframeChunk64B) == 64, "Chunk must be exactly 64 bytes");
```

### Safe Python Tensor Decoder Pattern
```python
import sys
import hashlib
import torch

def decode_f32_rows(payload: bytes, rows: int, cols: int, expect_sha256: str = None, device: str = "cpu"):
    if sys.byteorder != "little":
        raise ValueError("UNSUPPORTED_ENDIANNESS: Expected little-endian")
    expected_len = rows * cols * 4
    if len(payload) != expected_len:
        raise ValueError(f"INVALID_PAYLOAD_LENGTH: expected {expected_len}, got {len(payload)}")
    if expect_sha256:
        actual_sha = "sha256:" + hashlib.sha256(payload).hexdigest()
        if actual_sha != expect_sha256:
            raise ValueError(f"CHECKSUM_MISMATCH: expected {expect_sha256}, got {actual_sha}")
    
    # Zero-copy CPU buffer sharing
    cpu = torch.frombuffer(payload, dtype=torch.float32).reshape(rows, cols)
    # Explicit device transfer (never assume zero-copy IPC to CUDA)
    if device != "cpu" and torch.cuda.is_available():
        return cpu.to(device)
    return cpu
```

---

## 6. Verification Commands

```bash
# 1. Feature-Row RPC packet & Result Envelope Vitest suite (11/11 tests pass)
cd sveltekit-frontend && npx vitest run src/lib/server/atlas/transport/feature-row-rpc-packet-v1.test.ts

# 2. PyTorch ATen 64-byte keyframe stride, Morton radix sort, and safe decoder
py -3.13 scripts/spatial/pytorch_aten_spatial_keyframes.py

# 3. OpenSpec Low-Rank RPC synthesis (6,527 tasks processed in ~1.2s)
py -3.13 scripts/atlas/synthesize-lowrank-task-rpc-v1.py

# 4. OpenSpec Low-Rank RPC packet checksum and binary readback validation
node scripts/atlas/verify-lowrank-task-rpc-v1.mjs

# 5. Read-only PostgreSQL 18 physical table and index inventory
node .tmp/atlas/check-table-regclass-v1.mjs

# 6. TASK-01 6,527-Cohort Identity Crosswalk against 13,619-Task OpenSpec Workboard
node scripts/atlas/build-cohort-6527-crosswalk-v1.mjs && node --test scripts/atlas/build-cohort-6527-crosswalk-v1.test.mjs

# 7. RTX 3060 Ti PyTorch Contextual MLP + Spherical Adaptive KMeans + Graph-Regularized UMAP + DSPy Bridge
py -3.13 scripts/atlas/prove-rtx-mlp-kmeans-umap-domain-dspy-v1.py
py -3.13 -m unittest scripts/atlas/test_rtx_mlp_kmeans_umap_domain_dspy_v1.py -v

# 8. Hardened 10-Stage Final Integration Gate Runner
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/atlas/run-final-integration-gate.ps1
```

---

## 7. RTX 3060 Ti (SM 8.6) Bounded Tensor Challenger & TASK-01 Crosswalk Reconciliation

| Subsystem | Verified Contract | Provenance / Safety Invariant |
| :--- | :--- | :--- |
| **TASK-01 Cohort Crosswalk** ([`build-cohort-6527-crosswalk-v1.mjs`](file:///c:/Users/james/Videos/deeds-web-app/scripts/atlas/build-cohort-6527-crosswalk-v1.mjs)) | Reconciles all `6,527` binary cohort ordinals (`0..6526`) against the `13,619`-task OpenSpec workboard (`8,014` completed) using canonical NS-8 `<change>#<16-hex-sha256>` keys (`0` synthetic `task:ordinal:*` IDs minted). | `3,312` active occupancy bits represent `final_score > 0.50` routing threshold (`ROUTED_ACTIVE`), **never** task completion (`6,526` OPEN vs `1` CHECKED on disk). |
| **Synthetic Vector Labeling** ([`openspec-lowrank-task-rpc-receipt-v1.json`](file:///c:/Users/james/Videos/deeds-web-app/docs/reports/openspec-lowrank-task-rpc-receipt-v1.json)) | Rehearsal 64-D vectors seeded from `md5(task_id)` are explicitly labeled `representationFamily: "SYNTHETIC_TEST_VECTOR"` (`retrievalEligible: false`). | Must never be upserted into production `pgvector` (`codebase_chunk_index`) or Qdrant `content` lanes. |
| **Contextual MLP Domain Head** ([`prove-rtx-mlp-kmeans-umap-domain-dspy-v1.py`](file:///c:/Users/james/Videos/deeds-web-app/scripts/atlas/prove-rtx-mlp-kmeans-umap-domain-dspy-v1.py)) | `Linear(82->64)+LN+SiLU -> Linear(64->32)+LN+SiLU -> Linear(32->10)` + residual lexical projection across the 10 NES LUT domains (`auth`, `ui`, `retrieval`, `network`, `database`, `cache`, `agent`, `graph`, `ml`, `general`). | `PROPOSAL_ONLY` (`canonicalAuthority: false`). Weak lexical agreement (`0.99648`) is recorded strictly as a non-accuracy diagnostic per `CLASSIFICATION-GATE-01`. |
| **Spherical Adaptive KMeans** ([`prove-rtx-mlp-kmeans-umap-domain-dspy-v1.py`](file:///c:/Users/james/Videos/deeds-web-app/scripts/atlas/prove-rtx-mlp-kmeans-umap-domain-dspy-v1.py)) | PyTorch ATen cosine KMeans++ over the fused 96-D (`64-D + 32-D MLP`) space across $K \in \{16, 32, 47, 64\}$ with top-2 centroid margin (`cos1 - cos2`) and empty-cluster guards (`0` empty clusters across all $K$). | Compares $K=47$ against the 47 deterministic Louvain Graph RAG communities (`kag_prefill_router_v1.py`) while selecting $K=64$ by composite cohesion/margin score (`0.39849`). |
| **Graph-Regularized Spectral UMAP** ([`prove-rtx-mlp-kmeans-umap-domain-dspy-v1.py`](file:///c:/Users/james/Videos/deeds-web-app/scripts/atlas/prove-rtx-mlp-kmeans-umap-domain-dspy-v1.py)) | Tiled 128-row kNN affinity construction + Louvain community homophily bonus (`+0.15`), truncated SVD spectral init, and 25-epoch attractive/repulsive SGD in PyTorch ATen (`cuda:0`), emitting 3D coordinates and 30-bit Morton codes. | Peak GPU tensor allocation is strictly bounded at **`80.712 MiB`** (`<= 96.0 MiB` cap), leaving `:8090` `llama-server.exe` (Ornith 1.5 9B) completely undisturbed. |
| **Quaternion & `rot_6d` SO(3) Kinematics** ([`prove-rtx-mlp-kmeans-umap-domain-dspy-v1.py`](file:///c:/Users/james/Videos/deeds-web-app/scripts/atlas/prove-rtx-mlp-kmeans-umap-domain-dspy-v1.py)) | `compute_quaternion_and_rot6d_aten` computes shortest-arc Hamilton quaternions $q = [x,y,z,w]$ from each task's 3D UMAP vector to its adaptive cluster centroid and maps them to Zhou et al. continuous 6D SO(3) columns (`AlignedKeyframeChunk64B.rot_6d[6]`, bytes `20..43`). | Unit norm error $\le 2 \times 10^{-7}$ and SO(3) column orthogonality error $\le 2 \times 10^{-7}$, matching [`rest-pose-retarget-v1.ts`](file:///c:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/character-animation/rest-pose-retarget-v1.ts). |
| **Valkey Centroid Cache Descriptors** ([`centroid-cache-key-contract-v1.mjs`](file:///c:/Users/james/Videos/deeds-web-app/scripts/atlas/lib/centroid-cache-key-contract-v1.mjs)) | `build_valkey_centroid_descriptors_v1` emits `64` KMeans centroid keys (`atlas:centroid:v1:kmeans:fs...:m...:k000..k063`) and `10` domain centroid keys (`atlas:centroid:v1:domain:fs...:m...:auth..general`). | Strictly `PROPOSAL_ONLY` (`valkeyWritesPerformed: 0`, `canonicalAuthority: false`) until `assertSafeToPublishCentroidsV1` admission passes. |
| **YaRN Context Scaling, Ornith 1.5 SSM & cuTile KV-Cache Swap FSM** ([`cutile_kv_block_swap.py`](file:///c:/Users/james/Videos/deeds-web-app/python/atlas_compute/cutile_kv_block_swap.py)) | Evaluates YaRN RoPE context scaling ($4\text{K} \to 32\text{K}$, $s=8.0$, $\sqrt{1/T}=1.207944$, $T_{\text{attn}}=0.68534$) and steps the 5-state cuTile/MIRAS KV-Cache Swap FSM (`S0_BIFROST_LOOKUP` $\to$ `S1_TURBOVEC_PREFILTER` $\to$ `S2_MMAP_HOST_STAGE` $\to$ `S3_CUTILE_BLOCK_INSERT` $\to$ `S4_MIRAS_EVICT_OR_PERSIST`). | Copies `16` LoD-4 KV pages via non-blocking DMA and persists high-surprise blocks ($\|\nabla_M \mathcal{L}\| = 0.82 > \tau$) in host mmap while never persisting KV cache or hidden thoughts to canonical stores. |
| **DSPy Graph RAG Helper Bridge** ([`parent_atlas_dspy_community.py`](file:///c:/Users/james/Videos/deeds-web-app/python/parent_atlas_dspy_community.py)) | Emits `DomainGraphRagDspyProposalV1` envelopes for the 6 configured communities (`1, 6, 9, 10, 21, 32`) + top unrouted communities, verified by `CommunityEvidenceV1.build` and `validate_community_label_output_v1`. | Fails closed (`ValueError: community label cited unknown evidence refs`) if any cited `source_ref` falls outside the frozen community allowlist. |

