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
