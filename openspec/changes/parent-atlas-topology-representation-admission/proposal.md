# Change Proposal: Parent Atlas Topology Representation Admission

## Why

Parent Atlas has a bounded `semantic_768` retrieval-to-context canary. That
does not prove corpus-wide representation admission. Historical proposal text
incorrectly conflated semantic MRL outputs, autoencoder latents, clustering,
topology coordinates, and residency; this change separates those contracts.

## What Changes

- Keep `semantic_768` canonical and use the existing vector-manifest IDs
  `semantic_mrl_512`, `semantic_mrl_256`, and `semantic_mrl_128` for semantic
  MRL outputs.
- Distinguish the current, untrained AE candidate definition
  (`semantic_768 -> latent_256 -> latent_128 -> latent_64`) from historical
  persisted `latent_*` artifacts, whose v3 checkpoint used a 256-D bottleneck
  and prefix-derived 128/64 views. Matching names do not establish matching
  lineage; candidate artifacts require their own producer/representation
  revisions and registry reconciliation before admission.
- Keep deterministic projections (`rff_128`, `manifold_pca_4`), KMeans/SOM
  assignments, and topology coordinates as distinct derived artifact families.
- Bind SOM, manifold, clustering, bitmap, Qdrant, cuVS, and fan-out artifacts
  to canonical candidates and exact input revisions.
- Keep `evidenceDepth`, ACE `residencyTier`, and model execution state
  independent; do not introduce another LOD ladder.
- Keep PostgreSQL as eligibility authority and Qdrant/cuVS as executors.
- Keep topology failure from blocking exact `semantic_768` retrieval or
  `ContextManifestV1`.

## Non-Goals

- No replacement of `semantic_768`.
- No Qdrant-side RFF generation.
- No second production RRF owner in Qdrant.
- No CouchDB or SOM authority over CandidateOrdinal eligibility.
- No topology writes until artifact and parity receipts pass.

## Acceptance Gates

1. Representation definitions and artifacts are distinct and content-bound.
2. Same-dimensional MRL and AE vectors cannot be interchanged or cross-queried.
3. SOM/KMeans assignments bind to one frozen candidate snapshot and input
   representation revision; assignments are not vectors or identities.
4. `ManifoldPca4V1` and `Topology4DCoordinateV1` are not conflated.
5. Residency and model execution state are not representation families.
6. PostgreSQL eligibility exactly matches the compiled ordinal bitmap.
7. Qdrant and cuVS filters have zero false-positive ordinal admissions.
8. Topology fan-out is bounded and readback-proven.
9. Failure leaves the canonical semantic retrieval path green and reports
   topology as unavailable or challenger-only.
