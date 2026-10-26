## ADDED Requirements

### Requirement: Vector compatibility is representation-qualified
The system SHALL identify a vector representation by its model/producer revision, recipe, dimensions, dtype, normalization, and metric contract. Dimension alone MUST NOT establish compatibility or authorize routing, merging, relabeling, or promotion.

#### Scenario: Equal dimensions from different encoders
- **WHEN** two vectors have equal dimensions but their model or recipe identities differ or are unknown
- **THEN** the system keeps them in distinct representation families and blocks cross-space comparison or relabeling.

#### Scenario: Legacy representation lacks provenance
- **WHEN** a 384-dimensional legacy vector lacks a proven producer or source-revision binding
- **THEN** it is classified as retained but unqualified and is excluded from canonical evidence promotion.

### Requirement: Legacy retirement is caller- and recovery-gated
The system SHALL NOT retire a persistent 384-dimensional representation until its active readers and writers are inventoried, replacement behavior is validated on a revision-qualified cohort, and an approved recovery/archival plan exists.

#### Scenario: Static text match without runtime reachability
- **WHEN** a 384 reference is found only in a fixture, historical artifact, or documentation
- **THEN** the audit records that classification and does not claim an active production dependency.

#### Scenario: Active consumer remains unresolved
- **WHEN** a persistent 384 representation has an unresolved active caller or no proven replacement
- **THEN** retirement remains blocked and existing artifacts are preserved.
