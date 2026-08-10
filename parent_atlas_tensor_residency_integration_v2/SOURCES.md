# Primary-source implementation notes

The bundle was designed against current official documentation as of August 2026:

- Apache Arrow IPC: file vs stream, random-access RecordBatch file reader/writer, memory-mapped/zero-copy behavior when no transformation such as compression is required.
- Apache Arrow columnar format: columnar buffers, random-access file footer, shared-memory-friendly layout.
- cuVS brute-force: exact KNN over CUDA-array matrices, float32/float16, cosine support.
- cuVS CAGRA: GPU graph ANN, current Python build/search API and HNSW interoperability.
- RAPIDS cuML KMeans: GPU KMeans with CUDA-array/host inputs and persisted cluster centers/labels.
- RAPIDS cuGraph: graph algorithms remain a separate graph-topology lane.
- Valkey client-side caching: tracking/invalidation and cache invalidation rules.

Keep versions in your OpenSpec/runtime receipts because cuVS/RAPIDS serialization and APIs can change across releases.


## v2 design references

- NVIDIA DLSS developer documentation: used only for the neural-LOD/promote-known-fidelity analogy; Atlas does not use DLSS as a retrieval algorithm.
- MeshNet (AAAI 2019): recorded as a 3D-mesh representation reference only; not adopted as an Atlas topology owner.
- VAE literature / AEVB: used to classify stochastic latent sampling as research-only relative to deterministic AE routing.
