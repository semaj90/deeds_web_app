# `atlas-corpus-lib` (`v0.1.0`)

> **Parent Atlas High-Performance Python & C++20 Core Library**  
> Pinned structural observation contracts, NES 64-bit taxonomy registries, 24-byte SIMT feature tiles, 128-byte TurboVec LOD quantization, Arrow IPC streaming, and binary pgvector deserialization.

---

## 1. Distribution Wheel Location & Artifact Details

The platform wheel was compiled and packaged using Python 3.14 in the WSL2 `atlas-rapids-cu13` conda environment with a C++20 pybind11 native core (`_atlas_native_core`).

* **File Path (Linux/WSL)**:  
  `/mnt/c/Users/james/Videos/deeds-web-app/python/atlas_corpus_lib/dist/atlas_corpus_lib-0.1.0-cp314-cp314-linux_x86_64.whl`
* **File Path (Windows)**:  
  `C:\Users\james\Videos\deeds-web-app\python\atlas_corpus_lib\dist\atlas_corpus_lib-0.1.0-cp314-cp314-linux_x86_64.whl`
* **File Size**: `131,336 bytes` (~131 KB)
* **SHA-256 Digest**:  
  `903d1c40bed86dae24b0347ffb56658d1c5e634e7dce1873c4f7858e02ca6b9e`
* **Target Python ABI**: `cp314-cp314-linux_x86_64` (glibc $\ge$ 2.38, C++20)

### Installation

Inside the target Python 3.14 container or WSL environment:

```bash
# Direct install with pinned dependencies
pip install --no-deps /mnt/c/Users/james/Videos/deeds-web-app/python/atlas_corpus_lib/dist/atlas_corpus_lib-0.1.0-cp314-cp314-linux_x86_64.whl
```

To build and package from source:
```bash
cd python/atlas_corpus_lib
/home/james/miniforge3/envs/atlas-rapids-cu13/bin/python setup.py bdist_wheel
```

---

## 2. Core Capabilities & Architecture

```text
                  +----------------------------------------------+
                  |           Tree-sitter / AST-grep             |
                  |     (:8095 NLP Sidecar, provenance-v2)       |
                  +----------------------------------------------+
                                         |
                                         v  JSON: atlas.ast.evidence.v1
                  +----------------------------------------------+
                  |              atlas-corpus-lib                |
                  |                                              |
                  |  * UTF-8 byte span verification              |
                  |  * 64-bit NES taxonomy mask (9 dom, 16 sym)  |
                  |  * 24-byte AtlasFeatureRow SIMT packing      |
                  |  * 128-byte TurboVec LOD texture blocks      |
                  |  * PyArrow 24.0.0 IPC batch encoder/decoder  |
                  |  * Deterministic FSM detect router (NUL stop)|
                  |  * Zero-copy torch.frombuffer CPU tensor     |
                  +----------------------------------------------+
                                         |
                       +-----------------+-----------------+
                       |                                   |
                       v                                   v
        +-----------------------------+     +-----------------------------+
        |   Valkey L2 Proposal Cache  |     |   PostgreSQL 18 Lineage     |
        |  (pa:tile:proposal:{run_id})|     |  (Readback cursor via :5434)|
        +-----------------------------+     +-----------------------------+
```

### Module Breakdown

1. **`structural_observation_v1` & `ast_chunker_helpers`**:
   - Ingests raw parser outputs from `:8095` (`schema: "atlas.ast.evidence.v1"`).
   - Strictly enforces UTF-8 byte offsets against caller-provided source bytes and SHA-256 digests.
   - Prevents character-count corruption by distinguishing UTF-8 byte spans (`start_byte`, `end_byte`) from LSP UTF-16 code units (`start_character_utf16`, `end_character_utf16`).
   - Marks all ingested observations as non-canonical `authority: "PROPOSAL_ONLY"`.

2. **`nes_taxonomy_registry` & `gpu_feature_tile_builder`**:
   - **NES Taxonomy**: Enforces 9 system domain IDs (`SEARCH_RETRIEVAL`, `DATABASE_POSTGRES`, `UI_SVELTEKIT`, `REASONING_SYNTHESIS`, `GPU_RAPIDS_CUVS`, `PROTOBUF_WIRE`, `MEMORY_REGISTRY_L1_L2`, `LINEAGE_EVIDENCE_PROVENANCE`, `GRAPH_STRUCTURAL_TOPOLOGY`) and 16 symbol kinds.
   - **64-bit Hot Feature Palette**: 62 bits assigned (`IS_DEFINITION`, `EXPORTED`, `ASYNC`, `MUTATES_STATE`, etc.) computed via `compute_feature_mask_from_labels()`.
   - **24-byte `AtlasFeatureRow` ABI**: Packed via `<IHHIIIHH` (4B candidate_ordinal, 2B domain_id, 2B symbol_kind, 4B feature_mask_hi, 4B feature_mask_lo, 4B som_bmu_id, 2B kmeans_cluster_id, 2B flags).
   - Verified at **1,476M rows/s** candidate filter speed with 100% bit-exact parity against scalar reference logic.

3. **`lod_blob_streamer` & `arrow_tile_stream`**:
   - **128-byte LOD Texture Blocks**: Encodes 16B sign bitmask (LOD0) + 32B 2-bit quantization (LOD1) + 64B 4-bit quantization (LOD2) + 16B quantization envelope.
   - **Arrow IPC**: Decodes binary streaming batches to `[N, 128]` `torch.uint8` CPU tensors via `torch.frombuffer()` without intermediate allocation copies.
   - **CandidateOrdinalMapV1**: Immutable candidate ordering linking packet keys, source references, and spans to integer ordinals.

4. **`rfc_topic_router`**:
   - Deterministic finite-state automaton (FSM) requiring an explicit `"detect"` entry condition and terminating strictly at NUL (`\0`) sentinels.
   - Eliminates regex backtracking and denial-of-service risks during raw file scanning.

5. **`pgvector_binary`**:
   - Fast, in-memory decoder for PostgreSQL `vector` binary format (big-endian 3,076-byte payload for 768-D float32 vectors).
   - Validates IEEE 754 float finiteness and endianness without requiring database network connections.

---

## 3. Integration with FastAPI `:8095` Sidecar

### Architectural Boundaries
* Port `:8095` (`provenance-v2`) is an **unprivileged structural observation engine** (Tree-sitter, AST-grep, and Ornith-1.5-9b).
* `:8095` **must never** perform direct writes or updates to PostgreSQL 18, Qdrant, or Valkey.
* Outputs must be packaged into version-bound `LodTileArrowRecordV1` or `AtlasGpuFeatureTileV1` proposal objects before passing to the ACE Context Editor or SearchRuntime.

### Recommended FastAPI Integration Pattern

To serve high-density candidate proposals directly from the `:8095` sidecar without canonical promotion:

```python
# In FastAPI sidecar route handler (e.g., /v1/proposals/tiles)
from fastapi import APIRouter, Response, HTTPException
from pydantic import BaseModel
import pyarrow as pa
from atlas_corpus_lib import (
    build_source_bound_observation_from_8095_chunk,
    build_ast_index_payload_v1,
    assemble_gpu_feature_tile,
    FeatureCandidateInputV1,
    compute_feature_mask_from_labels,
    encode_lod_tiles_arrow_ipc,
)

router = APIRouter(prefix="/v1/proposals", tags=["proposals"])

@router.post("/assemble-tile")
async def assemble_feature_tile_endpoint(payload: dict):
    """
    Transforms raw Tree-sitter evidence chunks into a 24-byte SIMT feature tile.
    Returns: Binary categorical and numeric buffers + ordinal mapping.
    """
    try:
        candidates = []
        for idx, item in enumerate(payload.get("items", [])):
            mask_hi, mask_lo = compute_feature_mask_from_labels(item.get("labels", []))
            candidates.append(FeatureCandidateInputV1(
                candidate_ordinal=idx,
                source_ref=item["source_ref"],
                source_revision=item["source_revision"],
                domain_id=item["domain_id"],
                symbol_kind=item["symbol_kind"],
                feature_mask_hi=mask_hi,
                feature_mask_lo=mask_lo,
                som_bmu_id=item.get("som_bmu_id", 0),
                kmeans_cluster_id=item.get("kmeans_cluster_id", 0),
                flags=0,
                numeric_features=[0.0] * 16, # 16 float32 coordinates
            ))
            
        tile_result = assemble_gpu_feature_tile(
            candidates=candidates,
            workspace_revision=payload["workspace_revision"],
            representation_revision="semantic_768_v1"
        )
        
        return {
            "schema": "atlas.gpu-feature-tile-receipt.v1",
            "candidate_count": tile_result.candidate_count,
            "categorical_sha256": tile_result.categorical_sha256,
            "numeric_sha256": tile_result.numeric_sha256,
            "ordinal_map": tile_result.ordinal_map,
            "authority": "PROPOSAL_ONLY"
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
```

---

## 4. Agentic Error Fixing Workflow

When modifying codebase artifacts or addressing system anomalies, all agents and automation pipelines must adhere strictly to the **5-Step Verified Error Fixing Gate**:

```text
+-------------------+
|  1. Verified Claim| -> Grounded AST span, exact byte digest, stack trace
+-------------------+
          |
          v
+-------------------+
|2. KernelDagCandidate| -> Explicit task DAG node, preconditions, rollbacks
+-------------------+
          |
          v
+-------------------+
| 3. Authorization  | -> Lineage check, tournament token, real schema columns
+-------------------+
          |
          v
+-------------------+
|4. Bounded Apply   | -> --dry-run preflight, transaction boundary (50-5000 rows)
+-------------------+
          |
          v
+-------------------+
| 5. Readback Audit | -> Zero-trust binary cursor / CTest re-verification
+-------------------+
```

1. **Step 1: Verified Claim**
   - Ground diagnosis with an exact reproducible symptom, file path, UTF-8 byte range, and SHA-256 source hash.
   - *Constraint*: Speculation or imaginary root causes are forbidden.

2. **Step 2: KernelDagCandidate**
   - Package the proposed change into a formal candidate DAG node.
   - Define exact input dependencies, required environmental variables, and rollback steps.

3. **Step 3: Schema / Lineage / Authorization Admission**
   - Check mutations against verified database schema constraints.
   - *Example*: Never query `packet_key` on `codebase_chunk_index` (use `id`, `chunk_id`, `relative_path`).
   - Mutation requires an active tournament admission receipt (`workspace-revision-tournament-admission-v1.json`).

4. **Step 4: Bounded Execution**
   - Always execute `--dry-run` or validation flags first.
   - Enforce bounded execution: batch rows in chunks between 50 and 5,000; enforce strict timeouts.

5. **Step 5: Independent Readback**
   - Validate post-state using an independent reader (e.g., PostgreSQL binary cursor or CTest suite).
   - Verify zero corruption, byte-level consistency, and publish a signed JSON completion receipt.

---

## 5. Verification Commands

Run the full Python test suite in the target environment:

```bash
wsl -d Ubuntu -u james -- env PYTHONPATH=/mnt/c/Users/james/Videos/deeds-web-app/python/atlas_corpus_lib \
  /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python -m unittest discover \
  -s /mnt/c/Users/james/Videos/deeds-web-app/python/atlas_corpus_lib/tests -v
```

Execute C++20 CTest suite and SIMT kernel benchmarks:

```bash
wsl -d Ubuntu -u james -- ctest --test-dir /mnt/c/Users/james/Videos/deeds-web-app/packages/atlas-native-core/build --output-on-failure
wsl -d Ubuntu -u james -- /mnt/c/Users/james/Videos/deeds-web-app/packages/atlas-native-core/build/gpu_feature_tile_smoke
```
