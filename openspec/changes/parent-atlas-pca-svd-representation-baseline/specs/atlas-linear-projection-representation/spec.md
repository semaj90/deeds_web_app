## ADDED Requirements

### Requirement: PCA/SVD basis must be a real, verifiably-correct decomposition
The system SHALL compute any PCA/SVD projection basis using a real linear-algebra implementation
(eigendecomposition of the covariance matrix, or an equivalent library-provided SVD), never a
random-vector approximation.

#### Scenario: Basis correctness check
- **WHEN** a PCA/SVD basis is fit
- **THEN** the top component must align with the direction of maximum variance in a synthetic
  fixture with known ground-truth variance structure, verified in a test before the basis is
  trusted against real embeddings

### Requirement: Evaluation reuses the existing comparison harness
The system SHALL evaluate any PCA/SVD-derived representation using the existing
`compare_representations()` function in `python/atlas_compute/representation_compare.py`, not a
new or duplicated comparison implementation.

#### Scenario: No duplicate evaluation harness
- **WHEN** implementing PCA/SVD evaluation
- **THEN** the implementation imports and calls `compare_representations()` rather than
  reimplementing neighborhood-overlap or distance-correlation metrics

### Requirement: Baseline-oracle framing before permanent-lane framing
The system SHALL treat the first PCA/SVD representation as a comparison baseline against the
existing autoencoder-latent lanes before any decision is made to promote it to a standing,
query-time retrieval lane.

#### Scenario: No premature promotion
- **WHEN** the PCA/SVD representation is first produced
- **THEN** it is registered with `lifecycle_status: 'CANDIDATE'` (per the `atlas_representations`
  registry's own enum) and not promoted to `ACTIVE` without a documented comparison result
