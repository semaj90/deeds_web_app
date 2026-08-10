# ACE Neural LOD / Residency Contract

## Rule

The DLSS analogy applies only to *promotion scheduling*: a cheap, known representation may predict which high-fidelity representation to load. Atlas must not synthesize canonical `semantic_768` truth from a generative guess.

## Fidelity ladder

- COLD: Arrow IPC / NVMe; optionally latent128 or quantized derived artifacts.
- MMAPPED: Arrow buffers mapped into process address space.
- WARM: packet summaries, Valkey/BitFrost pointers, CPU centroids and mapped batches.
- PINNED: selected host batches staged for async H2D.
- GPU_RESIDENT: FP16/FP32 active tiles and ANN/reranker tensors.
- IN_USE: current kernel/search/rerank inputs.

A deterministic AE may provide `semantic_768 -> latent_128 -> reconstructed_768` for routing/reconstruction diagnostics. A VAE is research-only until uncertainty-aware routing is evaluated; sampled vectors never replace canonical embeddings.

## Reranker cache

Cache keys include query hash, candidate-set hash, representation revision, feature revision, reranker revision, model revision, and precision. Cache candidate tensors separately from result scores.
