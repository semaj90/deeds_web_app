---
type: architecture
title: Parent Atlas Selection Receipt and Model Boundaries
id: architecture/parent-atlas-selection-receipt-and-model-boundaries-v1
status: active
owners:
  - legal-ai-team
source_refs:
  - sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-row-v1.ts
  - sveltekit-frontend/src/lib/server/atlas/tensors/tensor-artifact-contract.ts
  - sveltekit-frontend/src/lib/server/atlas/retrieval/topk-algorithm-tournament.ts
  - sveltekit-frontend/src/lib/server/atlas/graph/context-manifest-v2.ts
  - python/parent_atlas_ontology/models.py
  - docs/.okf/research/deltanet-swiglu/deltanet-swiglu-primary-papers-v1/index.md
related:
  - pipeline/retrieval-ranking-synthesis
  - system/hyperrag
---

# Selection receipt and model boundaries

## Purpose

Bind routing, candidate ranking, evidence tuples, execution phase/gate, and ACE context selection without creating a second canonical identity owner. PostgreSQL and the existing packet/source contracts remain authoritative. This document is a design boundary, not a claim that a complete production receipt already exists.

## Receipt contents to bind

A selection receipt should identify:

- Query/run identity and immutable query/input checksum.
- Candidate feature snapshot ID/revision and checksum, plus ordinal-map checksum.
- Routing manifest ID/revision and digest when routing is used; omit it when no routing decision occurred.
- Top-K policy/implementation/parameter revisions, `k`, deterministic tie-break rule, and ordered canonical candidate IDs with scores and logical lane provenance.
- Candidate-to-packet/source bindings and their source, workspace, representation, and feature revisions; preserve rejected/ambiguous candidates with explicit reasons.
- Ontology tuple IDs, participants, relation revision, and evidence references only when those tuples support the selected evidence.
- OpenSpec task/phase/gate references as execution metadata, not as source identity.
- Resulting ContextManifest V2 identity checksum and admission status. A manifest checksum does not itself prove source authority; current-source admission remains a separate gate.

Routing IDs describe a routing decision/artifact, not a packet or source. Candidate ordinals are snapshot-local and must resolve through the exact ordinal map; they are never stable canonical IDs. A candidate matrix's `laneMask` is provenance, not permission to cast multiple votes for the same logical semantic lane.

## Retrieval/model boundary

`semantic_768` remains the canonical dense retrieval representation. KMeans/SOM/manifold routing is advisory. Top-K executors compare or shortlist candidates; multiple executors for one logical semantic lane do not create additional fusion votes. ContextManifest assembly accepts only candidates that pass the existing identity and source-evidence gates.

DeltaNet is an attention/memory architecture family; SwiGLU is a gated feed-forward activation. Neither is a packet field, retrieval representation, routing algorithm, or conversion from hidden states to `semantic_768`. The two are independent concepts and may coexist in a model. The local Ornith architecture evidence is recorded separately in the neural-prefill ledger; paper references below explain terms and do not establish which model implementation is loaded.

## Primary references and local corpus

The bounded research corpus under `docs/.okf/research/deltanet-swiglu/` stores fetched metadata/excerpts and checksums for:

- Yang et al., [Gated Delta Networks: Improving Mamba2 with Delta Rule](https://arxiv.org/abs/2412.06464), arXiv:2412.06464 — gated delta-rule recurrent/linear attention and hybrid attention architectures.
- Shazeer, [GLU Variants Improve Transformer](https://arxiv.org/abs/2002.05202), arXiv:2002.05202 — gated feed-forward variants including SwiGLU.

Fetched records are reference-only observations. The corpus does not grant model, source, retrieval, or production admission, and does not republish full paper text.
