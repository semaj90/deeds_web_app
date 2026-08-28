# Change Proposal: Parent Atlas Neural Pre-Fill Encoder

## Why

Parent Atlas has a canonical `semantic_768` representation, an existing
`latent_128`/`latent_64` residency design, AST/lexical extraction, domain and
ontology contracts, SOM routing, XGBoost ranking, and GPU bridge surfaces.
The missing piece is a learned encoder placed after semantic/RFF candidate
fan-out, so compressed vectors serve cache and reranking rather than replacing
the canonical query representation.

The current Phase 5 bridge still performs a deterministic simulated
`768 -> 64` reduction. That output must not be promoted as learned neural
state, used to rebuild production indexes, or treated as evidence of GPU
inference.

## What Changes

- Define an independent learned autoencoder branch from `semantic_768` to
  the currently implemented `ae_latent_64` path (`768 -> 256 -> 64`), while
  reserving `ae_latent_128` for a separately versioned future producer.
- Add a read-only NLP pre-fill stage over daily Graphify indexed files:
  AST-grep symbols, lexical terms, domain labels, ontology tuples, structural
  graph features, and provenance revisions.
- Train and evaluate the encoder in the WSL2 RAPIDS/PyTorch environment,
  retaining CPU reference output and deterministic manifests.
- Load the promoted model through the existing LibTorch/N-API bridge for RTX
  inference.
- Run Go retrieval/EmbeddingGemma `semantic_768`, Qdrant RFF/semantic fan-out,
  and RRF fusion first. Encode only the bounded candidate set to `latent_128`
  for warm cache/rerank and optionally to `latent_64` for hot routing.
- Project latent vectors to rebuildable Qdrant/cuVS/Valkey/SOM artifacts only
  after reconstruction, identity, recall, and parity gates pass.
- Feed latent and derived features to XGBoost ranking/domain heads. Logistic
  regression and Naive Bayes remain baselines, not encoder implementations.
- Assemble ACE pre-fill packets from canonical evidence plus derived features;
  generated synthesis remains downstream of evidence selection.

## Canonical Ownership

- PostgreSQL owns source identity, embedding provenance, model receipts, and
  promoted derived rows.
- `semantic_768` remains the canonical dense representation.
- `latent_64` is derived routing/index state and is never canonical identity.
- Qdrant, cuVS, Valkey, SOM, NetworkX/cuGraph, and ACE packets are rebuildable
  projections.
- LibTorch owns local learned-model inference; cuVS owns ANN/index execution,
  not neural compression training.
- `.okf` owns domain/ontology vocabulary and validation metadata; it does not
  become a model-label authority without evidence and revision references.

## Non-Goals

- Do not replace `semantic_768` with `latent_64` before recall and quality gates.
- Do not use IVF-PQ `pq_dim` as a learned latent representation.
- Do not generate `latent_128` directly from an unverified Qdrant scroll or
  provisional fold/tanh transform.
- Do not use `latent_128` to create the initial semantic query. Query
  embedding remains EmbeddingGemma `semantic_768`; `latent_128` begins after
  fan-out.
- Do not train from Qdrant-only rows without canonical identity joins.
- Do not write Qdrant, Valkey, Neo4j, or PostgreSQL projections during dry-run,
  model evaluation, or failed parity states.
- Do not allow ontology IDs, domain IDs, community IDs, or SOM neuron IDs to
  become continuous autoencoder input dimensions.

## Initial Acceptance Gates

1. Canonical `semantic_768` input coverage and identity join are proven.
2. `.okf` domain/ontology entries validate with provenance, trust, lifecycle,
   and revision fields.
3. NLP pre-fill output is deterministic and source-revisioned.
4. Autoencoder weights and normalization manifest are reproducible.
5. Reconstruction cosine similarity and latent nearest-neighbor recall meet
   explicit thresholds on a held-out source/workspace split.
6. LibTorch CPU and RTX inference agree within the recorded tolerance.
7. XGBoost GPU execution is proven separately from encoder inference.
8. Latent projection and ACE pre-fill pass identity, revision, and replay
   checks before any bounded apply.

## Current Representation Correction (2026-08-28)

The original nested `semantic_768 -> latent_128 -> latent_64` wording is not
the active architecture and must not be used as a dependency. `semantic_768`
is the canonical retrieval representation and is independently proven by the
15-candidate canary and exact retrieval replay.

Derived representations are independent challenger branches:

```text
semantic_768
  ├── rff_128       deterministic external projection; optional challenger
  ├── ae_latent_128 reserved future learned producer; not currently available
  └── ae_latent_64  current learned branch: 768 -> 256 -> 64
```

RFF generation belongs to a revisioned Atlas projection producer. Qdrant may
store/search the resulting vector but does not generate it. RRF remains owned
by SearchRuntime; Qdrant-native fusion is benchmark/parity-only.

Topology representations are downstream of the canonical retrieval path and
cannot block `semantic_768 -> ContextManifestV1`. They are governed by the
separate `parent-atlas-topology-representation-admission` change.
