# Integration Order

## Gate T0 — ownership check

Do not create a second canonical RRF, graph runner, embedding writer, packet identity writer, Valkey client owner, or GPU sidecar owner.

Classify every existing overlap as `CANONICAL_OWNER`, `BACKEND`, `ADAPTER`, `EXPERIMENT`, `COMPATIBILITY`, or `DEAD`.

## Gate T1 — metadata migration

Apply `migrations/20260810_parent_atlas_tensor_artifacts.sql` through the repository's existing Postgres migration path.

The migration adds only derived-artifact metadata:

- `atlas_tensor_artifacts`
- `atlas_tensor_tiles`
- `atlas_tensor_tile_members`
- `atlas_tensor_residency_events`

It does not modify `atlas_packets` identity.

## Gate T2 — Arrow artifact proof

Create:

- one `feature_matrix_5` Arrow IPC file;
- one `semantic_768` Arrow IPC file or a small test fixture;
- one `centroids_768` artifact;
- one tile directory manifest.

Freeze content hash, artifact revision, representation revision, schema version, shape, dtype, and byte length.

## Gate T3 — exact GPU tile parity

Read one tile through Arrow, stage it, move it to GPU, compute exact cosine/top-k, and compare to the existing exact oracle.

No CAGRA promotion before this passes.

## Gate T4 — ACE residency

Enable the logical cache state machine only after T3:

`COLD → MMAPPED → PINNED → GPU_RESIDENT → IN_USE → DEMOTED`.

ACE chooses the logical tile. CUDA allocators choose physical addresses.

## Gate T5 — Valkey / BitFrost hints

Mirror only small metadata: tile manifests, hot candidate IDs, centroid IDs, residency state, score summaries, invalidation versions.

Use revision-qualified keys. Flush local cache if invalidation tracking is lost.

## Gate T6 — RAPIDS adapters

Prove, in order:

1. cuVS brute-force parity;
2. CAGRA recall/latency against brute-force;
3. cuML KMeans artifact lineage;
4. cuGraph operations only through existing graph-analysis ownership.

## Gate T7 — four-worker CPU staging

Use up to four CPU workers for parsing, Arrow batch selection, decompression where needed, hashing, and staging preparation. Do not run four simultaneous GPU-heavy jobs on an 8 GB device by default.

## Gate T8 — packet assembly

Adopt revision-qualified unordered assembly. Completion order is never semantic order. Optional gRPC/protobuf is an adapter; QUIC is a design principle, not a required transport migration.

## Gate T9 — visualization

Render NES/PS2-style glyph/LOD state as a derived operator/debug view. Never write visualization coordinates back as semantic identity.


## Neural LOD extension order

1. Prove `TokenFeatureMap` deterministic round-trip without changing model token IDs.
2. Load a frozen deterministic AE checkpoint and emit `latent_128` + reconstruction error.
3. Keep VAE helpers disabled/research-only.
4. Wire `RuntimePolicyManifest`; do not read hyperparameters from data tiles.
5. Wire reranker cache with revision-qualified query/candidate keys.
6. Use `TopologyTileTree` only to predict candidate TileKeys for ACE.
7. Prove one active GPU tile + one asynchronously prefetched tile before raising residency.
8. Emit residency/job events to the NES/CHR visualization without giving the UI ownership of cache state.
