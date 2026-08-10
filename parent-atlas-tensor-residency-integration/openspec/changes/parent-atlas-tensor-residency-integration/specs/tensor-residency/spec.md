# Tensor Residency Specification

## Invariant TR-1 — canonical identity

`packet_key` remains canonical. Tensor tile IDs, Arrow row offsets, Qdrant/HNSW IDs, CAGRA internal IDs, CUDA pointers, SOM coordinates, and visualization glyph IDs are derived identifiers only.

## Invariant TR-2 — artifact lineage

Every bulk numeric artifact SHALL record artifact type, workspace/source revision, representation ID/revision when applicable, schema version, dtype, shape, byte length, content hash, producer, producer revision, and creation time.

## Invariant TR-3 — sparse topology

`TopologyCoordinate4 = [som_x, som_y, authority_norm, entropy_utility_norm]` is stored as an `N x 4` table plus a sparse tile directory. A dense `X × Y × A × E` allocation is forbidden unless an experiment proves density and value.

## Invariant TR-4 — cache ownership

ACE chooses logical residency. Valkey/BitFrost stores metadata and invalidation state. CUDA/PyTorch allocators own physical GPU memory. No cache layer may mint semantic identity.

## Invariant TR-5 — ANN hierarchy

HNSW internal levels and CAGRA graph structure are implementation details. Atlas LOD levels are explicit application policy and SHALL NOT be inferred from HNSW layer number.

## Invariant TR-6 — exact-before-approximate

An approximate index may be evaluated only against the same-matrix exact oracle with frozen representation revision.
