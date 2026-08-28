# Change Proposal: Parent Atlas Topology Representation Admission

## Why

Parent Atlas now has a proven canonical `semantic_768` retrieval-to-context
canary. Topology representations were previously described as a nested
`semantic_768 -> latent_128 -> latent_64` chain, which incorrectly makes
optional topology work a prerequisite for semantic retrieval.

## What Changes

- Define independent, revisioned topology representation branches.
- Treat `rff_128` as an external deterministic projection from `semantic_768`.
- Reserve `ae_latent_128` until a real learned producer exists.
- Record the current learned autoencoder branch as `semantic_768 -> hidden_256
  -> ae_latent_64`.
- Bind SOM, manifold, bitmap, Qdrant, cuVS, and fan-out artifacts to canonical
  candidate and representation revisions.
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
2. `rff_128`, `ae_latent_128`, and `ae_latent_64` have distinct identities.
3. SOM assignments bind to one input artifact and revision.
4. `ManifoldPca4V1` and `Topology4DCoordinateV1` are not conflated.
5. PostgreSQL eligibility exactly matches the compiled ordinal bitmap.
6. Qdrant and cuVS filters have zero false-positive ordinal admissions.
7. Topology fan-out is bounded and readback-proven.
8. Failure leaves the canonical semantic retrieval path green and reports
   topology as unavailable or challenger-only.
