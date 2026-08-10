# Parent Atlas Tensor Residency Integration

Drop-in integration bundle for Parent Atlas after Patch H / GA7 reached runtime-smoke proof.

This bundle does **not** replace canonical owners. It adds contracts and experimental/runtime adapters around them:

- **Postgres** — canonical lineage, tensor artifact manifests, tile directory metadata.
- **Apache Arrow IPC** — bulk numeric artifacts (`semantic_768`, feature matrices, centroids, topology tables, n-ary incidence tables).
- **Valkey / BitFrost** — hot metadata, route hints, tile residency hints, invalidation; never canonical tensor truth.
- **ACE** — logical residency/promotion/demotion policy.
- **Qdrant HNSW / cuVS CAGRA / cuVS brute force** — ANN/exact retrieval backends; no new semantic identity owner.
- **cuGraph / Neo4j GDS** — graph algorithms; no coupling to HNSW internal layers.
- **simdjson** — CPU control-plane JSON parser only.
- **CUDA / PyTorch / cuVS** — numeric execution after data is materialized.

## Core data model

A rank-1 tensor of shape `[5]` is a 5-component vector in `R^5`, for example:

```text
[entropy, ast_signal, domain_fit, authority, execution_utility]
```

A `2 x 5` matrix may project it to 2D. A covector may score it to one scalar. A derived 4D topology coordinate is separate:

```text
TopologyCoordinate4 = [som_x, som_y, authority_norm, entropy_utility_norm]
```

It is a routing/cache coordinate, **not** `semantic_768` and not a physical GPU address.

## Cold → hot path

```text
Postgres manifest
    ↓
Arrow IPC file on NVMe
    ↓ memory map / OS page cache
Arrow RecordBatch
    ↓ selected tile
Pinned host staging
    ↓ async H2D
GPU tile cache
    ↓
exact GEMM / cuVS / CAGRA / cuGraph / reranker
```

## Safe integration order

1. Apply the SQL migration through your existing migration mechanism.
2. Add TypeScript contracts without changing current retrieval/graph owners.
3. Install Python extras only in the WSL2 RAPIDS environment.
4. Produce one Arrow feature-matrix artifact and one tile directory.
5. Verify artifact hashes and tile keys.
6. Prove Arrow → pinned host → GPU tile → exact cosine parity.
7. Only then wire ACE/Valkey residency hints.
8. Only then test CAGRA/KMeans adapters.
9. Keep n-ary incidence and visualization experimental until evaluation.

See `INTEGRATION_ORDER.md` and the OpenSpec change for the full gate ladder.
