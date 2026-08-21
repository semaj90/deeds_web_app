# Parent Atlas LOD snapshot + GPU bridge hardening — 2026-08-21

Branch: `agent/lod-snapshot-gpu-hardening-20260821`

## Scope

This tranche is intentionally non-promoting. It does not write Postgres, Qdrant, Valkey, Neo4j, TurboVec, or CAGRA state.

## Implemented

### SemanticSnapshotV1 Arrow/mmap gate

`python/atlas_compute/semantic_snapshot_freeze.py` now preserves the existing v2 `.npy` contract and adds a stricter `atlas.semantic-snapshot.v1` path when an Arrow IPC artifact is requested.

Promotion requirements:

- `semantic_768`, dimension 768, float32
- deterministic canonical ordering
- row identity checksum
- canonical order checksum
- source revision checksum
- real `workspace_revision` supplied by the caller
- `representation_revision`
- deterministic `ordinal_map_revision` (derived from canonical ordered IDs when not explicitly supplied)
- unique non-null `source_ref`
- Arrow IPC fixed-size list[768]
- artifact SHA-256 + byte count
- Arrow memory-map reopen and schema/metadata round-trip

The strict Arrow path fails closed on duplicate `source_ref` or missing workspace revision.

CLI: `python/prove_semantic_snapshot_arrow.py`

### Duplicate source-ref audit

`scripts/atlas/audit-semantic-snapshot-duplicate-source-ref.mjs` performs SELECT-only inspection of the existing 5k 768 DuckDB snapshot and reports the exact duplicate groups and packet keys.

### CUDA memory telemetry

`simd-bridge/cpp/libtorch_graph_impl.cpp` no longer uses `__CUDACC__` as the runtime-query capability test. That file is a C++ translation unit, while CMake already supplies `SIMD_HAVE_CUDA` and links `CUDA::cudart`. The implementation now calls `cudaMemGetInfo()` when the linked CUDA runtime is present and returns an error instead of a false-success `0/0` measurement when it is not.

Runtime proof: `node scripts/atlas/prove-gpu-memory-telemetry.mjs`

A rebuild of `tensorrt_bridge.node` is required before this source fix can be runtime-proven.

### Native bridge export ownership

`node scripts/atlas/audit-gpu-bridge-export-ownership.mjs`

Classifies exported functions into CUDA runtime, LibTorch tensor, LibTorch FP16, custom CUDA primitive, CPU SIMD/control-plane, cuVS experimental bridge, and unclassified categories. The addon filename is explicitly not treated as evidence that every export is TensorRT-backed.

### FP16 cosine parity

`node scripts/atlas/prove-gpu-fp16-cosine-parity.mjs`

Uses deterministic 768-dimensional data and compares native FP32 cosine results with `batchCosineSimilarity_fp16` using predeclared thresholds for max/mean absolute error and Recall@10/50. The proof explicitly does not authorize production promotion.

## Additional finding

The native FP16 N-API wrapper accepts `batchCosineSimilarity_fp16(query, corpus, n, dim)`. The TypeScript `NativeAddon` declaration and at least one legacy GPU rerank path describe/call a different argument order. This is a real app-boundary mismatch and should be repaired in a separate focused patch before live FP16 adoption. The parity proof calls the native signature directly so the kernel can be evaluated independently of that app-layer defect.

## Still blocked

`SemanticSnapshotV1` is not promoted from the current 5k candidate until:

1. the existing duplicate `source_ref` is audited/resolved or explicitly reclassified by identity policy;
2. the producer supplies the real workspace revision and per-row source revisions;
3. the strict Arrow CLI is run successfully and its checksums/mmap readback pass.

GPU telemetry remains source-fixed but runtime-unproven until the addon is rebuilt and the strict telemetry proof returns non-zero total VRAM.

FP16 remains evaluation-only until numeric parity passes locally and the TypeScript/native signature mismatch is repaired.

## Safe local commands

```powershell
node scripts/atlas/audit-semantic-snapshot-duplicate-source-ref.mjs
python -m unittest python/test_semantic_snapshot_freeze.py

# Rebuild the existing native addon using the workstation's established CMake preset/build command, then:
node scripts/atlas/prove-gpu-memory-telemetry.mjs
node scripts/atlas/audit-gpu-bridge-export-ownership.mjs
node scripts/atlas/prove-gpu-fp16-cosine-parity.mjs
```

Arrow promotion, once a revision-qualified NDJSON input exists:

```powershell
python python/prove_semantic_snapshot_arrow.py `
  --input <revision-qualified-semantic-768.ndjson> `
  --output-dir .tmp/atlas-semantic-snapshot-v1 `
  --workspace-revision <real-workspace-revision> `
  --snapshot-revision <snapshot-revision> `
  --representation-revision embeddinggemma-full768-v1 `
  --producer-revision <producer-revision>
```
