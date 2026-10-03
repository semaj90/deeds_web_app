# KMeans assignment artifact

## ADDED Requirements

### Requirement: KMeans assignments bind exact candidates and inputs

Each `KMeansAssignmentV1` MUST bind one canonical candidate identity and in-range ordinal to a
candidate snapshot, `CandidateOrdinalMapV1` checksum, workspace/source revisions, named input
representation and artifact checksum, algorithm revision, parameter checksum, centroid identity
and checksum, and deterministic assignment checksum. Assignments MUST declare
`canonicalAuthority: false`; they MUST NOT be used for retrieval admission or cache residency
before the PostgreSQL/Qdrant identity and vector parity gates pass.

#### Scenario: An assignment is built from a frozen input tuple
- **WHEN** all candidate, ordinal-map, source/workspace, representation, algorithm, parameter, and centroid fields are present
- **THEN** the builder emits a deterministic checksum-sealed assignment
- **AND** changing any bound field invalidates the checksum

#### Scenario: Candidate ordinal or lineage is invalid
- **WHEN** the ordinal is outside the frozen candidate count, a required revision is absent, or canonical authority is asserted
- **THEN** assignment validation rejects the record
- **AND** no datastore, projection, GPU residency, or retrieval state is changed
