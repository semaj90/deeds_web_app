# EmbeddingGemma MRL and Alignment Audit

Status: read-only source/model-contract review. No migration, index, vector, cache, renderer, or GPU change was made. `canonicalAuthority: false`.

## Canonical state found in the root repository

- `semantic_768` is the canonical EmbeddingGemma representation.
- MRL reference views are 512, 256, and 128 dimensions. The shared projection helper truncates and L2-renormalizes each view.
- `latent_256`, `latent_128`, and `latent_64` are separately typed learned/projection views. `latent_64` is not the same representation as a native EmbeddingGemma MRL-64 slice.
- 384 dimensions are migration/replay-only; new runtime routing and writes are disabled.
- A previously supplied browser design named `N64KagEngine.svelte` is not present at the proposed route in this worktree. The pasted component is therefore a proposal, not a repository implementation.

## Corrections to the supplied alignment claims

1. **The 384-D line calculation is inconsistent.** `48 × u32 = 192 bytes`, which is 3 × 64-byte cache lines when the starting address is aligned, not 1.5. It is 6 × 32-byte AVX2 vectors or 3 × 64-byte AVX-512 vectors. For FP32 384-D, the row is 1,536 bytes (24 cache lines); for FP16 it is 768 bytes (12 lines). Actual row/page alignment still depends on storage layout.
2. **One-cache-line MRL-128 requires four-bit packing.** D/2 gives 64 bytes only for a custom 4-bit-per-component encoding. `halfvec(128)` is 256 bytes plus pgvector's header; FP32 is 512 bytes. Neither is one 64-byte line. Quantized bytes are not interchangeable with semantic vectors and need their own quantization scale/zero-point, representation ID, checksum, and recall test.
3. **MRL-64 is not a supported reference width.** EmbeddingGemma documents the recommended MRL slices as 768/512/256/128. A 64-D learned latent may be evaluated as its own representation; do not label it MRL or treat the first 64 coordinates as validated retrieval embeddings without a frozen recall evaluation.
4. **Power-of-two dimensions do not guarantee physical alignment.** Cache-line fetches, NVMe page layout, PostgreSQL tuple placement, WebGPU buffer-offset alignment, SIMD width, and embedding dimension are separate constraints. A 64-byte item size alone does not establish aligned base addresses or zero-copy behavior.
5. **Changing a column typmod does not reconstruct discarded coordinates.** If any stored 384-D vectors exist, converting the column to 768 dimensions cannot recover the missing suffix. Re-embed from eligible source text under the pinned model/prompt revision, or keep an explicitly separate legacy representation. Do not run the pasted `ALTER TABLE`.
6. **The proposed gate is not a sound cosine early-exit bound.** The sample accumulates products of unsigned nibbles, uses a hand-picked threshold, and then reports a winning term from a synthetic row index. It does not compute normalized semantic similarity or prove that pruned candidates cannot win. It is a shader demo fixture, not a retrieval result. `cacheHitCount += ROWS_PER_BANK` is also a counter assignment, not cache telemetry.
7. **The proposed index needs workload proof and the exact owner/schema.** pgvector supports `subvector(halfvec, ...)` and expression HNSW indexes, but HNSW trades memory/build time for approximate search and does not make 6x more rows fit shared_buffers. The example's `kag_hypernodes.embedding_fp16` owner and stored dimension were not verified here. Use a separate scratch expression-index experiment against the actual canonical vector source, then compare recall, latency, index size, and planner behavior before proposing an additive migration.

## Corrected raw storage arithmetic

| Dimension | 4-bit packed payload | `halfvec` payload (2 bytes/value) | FP32 payload | 64-byte lines for 4-bit payload |
|---:|---:|---:|---:|---:|
| 768 | 384 B | 1,536 B | 3,072 B | 6 |
| 512 | 256 B | 1,024 B | 2,048 B | 4 |
| 384 (legacy) | 192 B | 768 B | 1,536 B | 3 |
| 256 | 128 B | 512 B | 1,024 B | 2 |
| 128 | 64 B | 256 B | 512 B | 1 |
| 64 (learned latent only unless evaluated) | 32 B | 128 B | 256 B | 0.5 |

The arithmetic excludes pgvector headers, row/page overhead, index entries, Valkey key/value/allocator overhead, cache duplication, and database/HNSW working memory. Any centroid count derived from a “64M-bit” budget is a raw payload ceiling, not a production capacity. The current Valkey helper stores JSON float arrays, so nibble-payload counts do not describe the current cache representation.

## Safe next sequence

1. Keep canonical `semantic_768`; use the existing normalized 512/256/128 shadow views.
2. Run the existing frozen MRL fanout evaluation and record recall/latency per dimension. Do not count the 64-D learned latent as an MRL slice.
3. If useful, test one 256-D or 128-D pgvector expression index in an isolated PostgreSQL scratch database, with the exact source/revision and a rollback/readback receipt. No live DDL.
4. Evaluate 4-bit nibble packing separately from MRL truncation; compare decode error and top-k recall against the float view.
5. Only then implement a real WebGPU/CPU cartridge path with actual corpus rows, query embeddings, calibrated score math, dynamic stride, device limits, fallback parity, disposal, and measured GPU/CPU timings.

## Evidence and limits

Root owners inspected: `docs/reports/embeddinggemma-dimension-policy-v1.json`, `sveltekit-frontend/src/lib/server/embeddings/embeddinggemma-canonical-contract-v1.ts`, `sveltekit-frontend/src/lib/server/vector/embeddinggemma-prefix384.ts`, `python/atlas_compute/mrl_gpu_fanout_evaluation_v1.py`, `scripts/atlas/prove-embeddinggemma-mrl-runtime.mjs`, and `sveltekit-frontend/drizzle/manual/20261031_pgvector_mrl_latent_kmeans_knn.sql`. The proposed engine path was checked and is absent. This audit did not run the MRL evaluation, query PostgreSQL, or inspect a live GPU kernel.
