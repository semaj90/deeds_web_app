# Tasks

- [ ] T0 ownership audit completed; no duplicate canonical runtime owner introduced.
- [ ] T1 Postgres artifact/tile migration applied through existing migration owner.
- [ ] T2 one Arrow `feature_matrix_5` artifact created and hash-verified.
- [ ] T2b one Arrow `semantic_768` fixture/artifact created and representation lineage frozen.
- [ ] T2c centroid artifact produced and remains small/hot.
- [ ] T3 Arrow-selected tile → pinned host → GPU exact cosine/top-k parity proven.
- [ ] T4 ACE state transitions proven with deterministic eviction ordering.
- [ ] T5 Valkey/BitFrost revision-qualified metadata keys + invalidation policy proven.
- [ ] T6 cuVS brute-force same-matrix parity proven.
- [ ] T6b CAGRA measured against brute-force; recall and latency recorded.
- [ ] T6c RAPIDS KMeans centroids/labels persisted with artifact lineage.
- [ ] T7 CPU worker staging bounded at four workers and measured.
- [ ] T8 unordered packet/chunk assembly deterministic under shuffled completion.
- [ ] T9 n-ary incidence artifact emitted as sparse membership data, not dense adjacency.
- [ ] T10 visualization consumes derived topology/LOD state only.

## Stop conditions

Stop rather than promote if any of the following is unresolved:

- representation revision ambiguity;
- artifact hash mismatch;
- stale graph/workspace/source revision;
- exact GPU parity failure;
- duplicate semantic vote;
- GPU memory pressure without deterministic demotion;
- n-ary event order confused with DAG execution order.


## Token/latent/LOD extension

- [ ] T11 TokenFeatureMap round-trip preserves native tokenizer IDs while attaching Atlas feature/ontology/engram metadata.
- [ ] T12 deterministic AE `semantic_768 -> latent_128 -> reconstruction` artifact is checkpoint-hash/revision qualified and never replaces canonical semantic_768.
- [ ] T12b VAE remains `RESEARCH_ONLY`; sampled latents cannot be persisted as canonical embeddings.
- [ ] T13 RuntimePolicyManifest owns KMeans/SOM/ANN/ACE/reranker hyperparameters; arbitrary GPU tiles cannot silently mutate policy.
- [ ] T14 TopologyTileTree proves culling/prefetch behavior only; HNSW/CAGRA remain ANN owners.
- [ ] T15 reranker cache key includes query + candidate-set + representation + feature + model + reranker revisions.
- [ ] T16 ACE LOD promotion proves known-representation promotion (cold/mmap/pinned/GPU) without generative semantic synthesis.
- [ ] T17 one-active + one-prefetch GPU tile double-buffer smoke measured before increasing concurrency.
- [ ] T18 visualization consumes shared residency events/job progress; browser Service Worker remains browser/offline only.
