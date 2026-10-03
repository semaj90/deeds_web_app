# Centroid routing artifacts

## ADDED Requirements

### Requirement: Centroid manifests bind one frozen clustering result

`CentroidManifestV1` MUST bind its centroid artifacts and member assignments to one workspace
revision, candidate snapshot revision, representation revision, `CandidateOrdinalMapV1` checksum,
clustering pass, algorithm revision, parameter checksum, and candidate count. Its payload and
manifest checksums MUST be deterministic. The manifest MUST declare `canonicalAuthority: false`.

#### Scenario: The same frozen clustering result is serialized twice
- **WHEN** the same centroid entries and revision tuple are supplied in a different input order
- **THEN** the manifest canonicalizes centroid order and emits the same payload and manifest checksums

#### Scenario: A manifest reference or assignment is changed
- **WHEN** an artifact checksum, candidate snapshot, ordinal-map checksum, or member-assignment checksum changes
- **THEN** manifest validation rejects the stale checksum
- **AND** no cache or canonical store is written

### Requirement: Centroid cards are bounded routing hints

`CentroidCardV1` MUST bind its exemplar ordinals to the exact candidate snapshot and ordinal-map
checksum and MUST resolve to the matching centroid entry in its `CentroidManifestV1`. Exemplar
ordinals MUST be unique and within the candidate-count bound. Domain and concept hints are advisory;
the card MUST declare `canonicalAuthority: false` and MUST NOT establish candidate identity, proof,
retrieval eligibility, or cache residency.

#### Scenario: A card matches its manifest and snapshot
- **WHEN** the card revisions, ordinal-map checksum, centroid artifact reference/checksum, and cluster size match the manifest
- **THEN** the card may be used as a diagnostic routing hint
- **AND** canonical candidate resolution remains required

#### Scenario: A card contains an invalid ordinal or stale manifest binding
- **WHEN** an exemplar ordinal is outside the snapshot or any bound revision differs
- **THEN** the card is rejected before routing and cannot alter cache or retrieval state
