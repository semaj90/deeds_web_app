# Tensor Residency Pipeline

## Logical layers

```text
LOD0 Postgres identity/manifests
LOD1 Valkey/BitFrost hot metadata
LOD2 Arrow IPC on NVMe + OS page cache
LOD3 CPU RAM / mapped batches / centroids
LOD4 pinned host staging
LOD5 GPU-resident tiles / CAGRA / graph/reranker tensors
LOD6 kernel-private registers/shared memory
```

ACE controls LOD promotion/demotion through logical tile IDs. CUDA pointers are never durable identifiers.

## Topology4

`[som_x, som_y, authority_norm, entropy_utility_norm]` is a routing coordinate. SOM x/y may be encoded with a 2D Hilbert key for locality; authority/entropy are quantized into bins. The result is a sparse tile key, not a dense 4D allocation.

## GPU cache

Start with one stream and correctness. Then add a second copy stream / double buffer after measuring H2D latency. Keep centroid matrices resident whenever practical because they are tiny relative to the corpus.

## GPU execution ownership

- exact cosine/top-k: existing cuVS/PyTorch/cuBLAS path;
- CAGRA: ANN backend after exact parity;
- cuGraph: graph algorithm backend only;
- CUDA Graph: optional captured execution DAG after shapes stabilize;
- custom kernel/cuTile: experiment only after profiler evidence.
