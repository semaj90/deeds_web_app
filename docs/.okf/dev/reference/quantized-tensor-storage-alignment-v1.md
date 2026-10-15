# Quantized tensor storage and executor alignment V1

Status: implementation guidance and manifest validation only. No PostgreSQL DDL, index, GPU run, TurboVec wheel build, or gRPC wire change was made.

## Quantization-aware representation validation

The existing `PacketRepresentationManifestV1` already binds packet/source/workspace/representation revisions, codec, shape, byte strides, length, and SHA-256. Raw INT8 previously had no quantization semantics. The validator now requires:

- `scheme: symmetric-per-tensor-int8`
- finite positive `scale`, `zeroPoint: 0`, and source dtype (`float32` or `float16`)
- a SHA-256 checksum for the calibration cohort
- exact signed-byte payload length and content digest through the existing readback verifier

The decoding contract is `x ≈ scale * q` for signed `q ∈ [-128,127]`. This validates metadata and byte identity; it does not prove numerical fidelity or retrieval quality. Those need a frozen PyTorch FP32 reference cohort, dequantized error metrics, and Recall@K parity. FP16 remains a distinct floating-point codec, not INT8 quantization.

## PyTorch alignment

Treat PyTorch tensors as runtime objects, not persistent PostgreSQL values. Keep canonical `semantic_768` FP32 unchanged. For a quantized representation, load and verify the immutable artifact and its manifest first, then either use an explicitly supported quantized operator or dequantize with the manifest scale into the intended PyTorch dtype/device. Record device, PyTorch/CUDA versions, dtype, shape/strides, source and representation revisions, and output digest. Do not claim zero-copy across process, Windows/WSL, or GPU boundaries without ownership/lifetime proof.

## PostgreSQL 18 storage and indexes

- `bytea` is suitable for bounded opaque artifact bytes and exact byte readback; it is not a vector similarity index. Prefer the existing representation/artifact owner and metadata references rather than adding a second embedding table.
- Use B-tree/unique/FK indexes for exact packet, representation, revision, and digest metadata lookups. Do not B-tree-index large binary payloads.
- Use the existing `tsvector` + GIN / pg_search owner for lexical text retrieval. FTS is not applicable to opaque tensor bytes.
- Use pgvector HNSW/IVFFlat only for a typed vector column and its supported distance/operator class. A raw INT8 `bytea` column cannot be searched as a vector without a separately defined decoding/quantized operator path.
- BRIN is a possible space-saving choice only for very large tables whose indexed scalar correlates with physical row order (for example, append-time ranges). It is not a default for packet identity or arbitrary representation IDs.
- Bitmap heap/index scans are PostgreSQL planner strategies; AIO is I/O execution behavior. Neither is a table/index type to add for this feature. Compare plans with read-only `EXPLAIN (ANALYZE, BUFFERS, SETTINGS)` on representative queries before proposing indexes.

## TurboVec and gRPC

The checked-in TurboVec Python extension accepts contiguous NumPy `float32` arrays at its binding boundary and performs its own 2–4-bit index quantization internally. It is not a PyTorch tensor binding and does not accept this manifest's raw INT8 representation as a direct input. Any adapter must explicitly produce a contiguous FP32 batch, preserve a revision-qualified ordinal-to-packet map, and compare results against the exact oracle; do not treat TurboVec's internal codes as canonical stored bytes.

The existing gRPC embedding/GPU proto messages use `repeated float` for vectors, so that wire path is FP32-value transport, not a raw INT8 tensor codec or zero-copy path. Keep it as-is for compatibility. A future compressed transport should send a revision-bound artifact reference plus explicit dtype/shape/scale/checksum metadata, or a separately versioned `bytes` field with a defined codec; never reinterpret the existing float fields.

## Index selection quick rule

| Data | Search purpose | Candidate access path |
|---|---|---|
| Packet/representation IDs and revision metadata | Exact lookup/join | B-tree / unique / FK |
| Searchable text | Lexical matching | Existing `tsvector` + GIN or pg_search |
| Canonical dense semantic vector | Similarity | Existing pgvector owner/index |
| INT8/raw binary artifact | Immutable readback | Metadata lookup + bounded `bytea` read; verify digest |
| Append-correlated timestamp/sequence | Range pruning at large scale | Consider BRIN only after plan/physical-correlation measurement |

No new table, migration, or index is implied by this contract.
