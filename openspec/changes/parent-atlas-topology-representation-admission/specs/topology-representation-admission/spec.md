# Topology representation admission

## ADDED Requirements

### Requirement: Topology representations remain derived artifacts
Topology, latent, centroid, and graph projections MUST bind to an admitted source population and revision-qualified input artifact before promotion.

#### Scenario: A topology artifact is proposed
- **WHEN** a topology representation is produced
- **THEN** it records its input population, source or workspace revision, algorithm revision, and artifact checksum.

#### Scenario: Admission inputs are incomplete
- **WHEN** the source population or revision binding is missing
- **THEN** the artifact remains diagnostic or blocked and cannot become canonical identity.

### Requirement: Representation artifact digests and parent revisions are verifiable

`RepresentationArtifactV1` MUST seal its complete descriptor with the canonical hash owner.
When a family contains both a parent and child artifact, the child's input representation revision,
input digest, and input population checksum MUST match the parent's representation revision, output
digest, and output population checksum. Family members MUST agree on workspace/source revisions and
candidate/ordinal coordinates.

#### Scenario: A descriptor field is changed after sealing
- **WHEN** an artifact field changes without rebuilding its seal
- **THEN** artifact digest verification rejects it.

#### Scenario: A child is bound to an old parent output
- **WHEN** the child's parent revision or input checksum differs from the included parent artifact
- **THEN** family binding fails closed.

### Requirement: Representation families remain distinct

The system MUST distinguish semantic embeddings and their MRL derivatives,
autoencoder latents, deterministic projections, cluster assignments, and
topology coordinates by their existing representation/artifact contracts.
Dimension equality MUST NOT imply representation equivalence. Semantic MRL
identifiers MUST come from the existing vector manifest. The current AE
candidate's `latent_*` names MUST NOT be treated as proof of compatibility
with historical persisted `latent_*` artifacts: the historical v3 checkpoint
has a 256-D bottleneck with prefix-derived 128/64 views, while the untrained
candidate definition learns 256/128 and derives 64 from 128. Separate producer
and representation revisions plus registry/alias reconciliation are required
before candidate outputs can be admitted.

#### Scenario: Two families share a dimension
- **WHEN** a semantic MRL vector and an autoencoder latent have the same number
  of dimensions
- **THEN** validation rejects using one as the other's input, identity, or ANN
  query representation.

#### Scenario: Historical and candidate autoencoder artifacts share a name
- **WHEN** an artifact is identified only by `latent_256`, `latent_128`, or
  `latent_64` without a matching producer and representation revision
- **THEN** it remains diagnostic and cannot be admitted as candidate output.

#### Scenario: A compact or topology coordinate is presented as identity
- **WHEN** a cluster ordinal, topology coordinate, CandidateOrdinal, or
  residency tier is used as a canonical candidate identity
- **THEN** admission fails and the canonical identity owner remains unchanged.

### Requirement: Clustering and topology remain revision-bound projections

KMeans/SOM assignments and topology coordinates MUST bind to a frozen
candidate snapshot, CandidateOrdinalMap revision/checksum, exact input
representation revision, and algorithm/model revision. They MUST remain
non-canonical routing or analysis projections. `evidenceDepth` describes
evidence expansion, ACE `residencyTier` describes physical cache residency,
and model execution state remains separate; no additional LOD axis may be
introduced by this change.

#### Scenario: A clustering run uses a changed candidate population
- **WHEN** the candidate snapshot or ordinal map differs from the assignment
  manifest
- **THEN** assignments are stale and cannot participate in routing admission.

#### Scenario: Residency changes without representation changes
- **WHEN** an artifact moves between cache tiers
- **THEN** its representation identity and revision remain unchanged, while
  residency metadata is updated by its existing owner.
