# Parent Atlas semantic_512 canonicalization — proof sequence

Operator correction (2026-08-19): the persisted EmbeddingGemma test corpus that actually exists is 512-dimensional; a production/canonical 768-dimensional Qdrant corpus was not created. Do not promote an assumed 768 store merely because EmbeddingGemma's native output is 768.

## Frozen representation contract

```text
EmbeddingGemma native output (768)
        |
        | MRL prefix [0:512] + L2 re-normalize
        v
semantic_512                 CANONICAL PERSISTED SEMANTIC REPRESENTATION
        |
        +--> Qdrant codebase_chunks_512 / cosine        online ANN candidate executor
        +--> cuVS brute_force / cosine                  exact bounded oracle
        |
        +--> Autoencoder 512 -> 256 -> 64
                         |
                         v
                     latent_64                          ROUTING ONLY
                         |
                         +--> cuML KMeans (seeded)
                         +--> routing centroids/cluster IDs
                         +--> codebase_topology_64_v2
```

Candidate buckets `32/64/128/256/512` are row counts and are unrelated to semantic vector dimensionality.

## Identity rules

- PostgreSQL owns packet/source/revision identity.
- Qdrant point IDs, KNN row ordinals, KMeans labels, and latent vectors never mint identity.
- `packet_key` + `source_revision` are mandatory for exact-KNN and autoencoder training admission.
- `tree_node_id` is conditional structural evidence and may be null until its Tree-sitter/GIS owner resolves it; never fabricate it.
- `feature_label` is derived classification evidence and may be null; KNN/KMeans/PageRank never produce it.
- Every `latent_64` row must cite `source_representation_id=semantic_512` and `autoencoder_revision`.
- Every KMeans assignment must cite the latent/AE revision plus algorithm revision and fixed random seed.

## Proof gates

- [x] S512-0 — Representation semantics frozen: persisted canonical `semantic_512`, model-native dimension recorded separately as 768.
- [x] S512-1 — Query projection implemented: first 512 EmbeddingGemma dimensions + explicit L2 re-normalization.
- [x] S512-2 — Qdrant bounded scorer targets existing `codebase_chunks_512` unnamed cosine collection and joins only by `packet_key`.
- [x] S512-3 — cuVS exact endpoint implemented with explicit `metric="cosine"`; legacy 768/sqeuclidean smoke endpoint remains separate.
- [x] S512-4 — SvelteKit synthesis can exact-rerank the same bounded Qdrant rows on cuVS; fails open when identity/GPU is unavailable.
- [x] S512-5 — Autoencoder trainer implemented as `512 -> 256 -> 64`, emitting model digest, identity checksum, validation loss, peak VRAM, and revisioned latent NDJSON.
- [x] S512-6 — cuML KMeans executor implemented over `latent_64`, with explicit `random_state`, algorithm revision, centroids, inertia, and identity-preserving assignments.
- [x] S512-7 — Separate rebuildable `codebase_topology_64_v2` routing projection materializer implemented; it never mutates semantic_512 evidence.
- [x] S512-8 — Routed-topK evaluation endpoint implemented; reports Recall@K against full semantic_512 cuVS exact oracle and fails open to full exact corpus when routing is too narrow.
- [ ] S512-9 — Reconcile/backfill canonical identity payload on the real `codebase_chunks_512` corpus from PostgreSQL. Must be dry-run first, classify ambiguous/conflicting rows, and preserve rollback receipt before apply.
- [ ] S512-10 — Execute live semantic_512 Qdrant smoke: collection dimension=512, cosine, nonzero rows, packet_key/source_revision coverage reported.
- [ ] S512-11 — Execute live cuVS cosine proof on real revision-qualified 512 rows and compare exact top-K with Qdrant HNSW Recall@K.
- [ ] S512-12 — Train AE on the admitted real 512 corpus; reject if validation/neighborhood metrics fail threshold.
- [ ] S512-13 — Compare AE-64 against deterministic PCA-64 baseline on exact-neighbor Recall@K/MRR/NDCG and routing latency.
- [ ] S512-14 — Fit seeded KMeans, materialize routing projection, and measure cluster-route Recall@K against full 512 exact oracle.
- [ ] S512-15 — Promote routing only if it reduces candidate work without breaching retrieval recall budget; otherwise keep latent/KMeans reference-only.
- [ ] S512-16 — Exact promotion proves source span + Tree-sitter structural identity + compiler-semantic evidence before LLM synthesis.
- [ ] S512-17 — Reconcile older 384/768 documentation and enums only after runtime proof; do not break broad consumers with an unproven rename.

## Promotion invariant

```text
Qdrant ANN candidate
      |
      v
cuVS semantic_512 exact cosine
      |
      +-- optional latent_64/KMeans routing feature
      +-- BM25 lexical feature
      +-- AST/compiler feature
      +-- PageRank/PPR graph feature
      v
CandidateFeatureMatrix
      v
exact source/AST/type promotion
      v
ContextManifestV1
```

No derived executor gets an independent RRF vote merely because it uses a different backend.
