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
