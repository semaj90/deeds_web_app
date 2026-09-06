# Candidate feature execution governance

## ADDED Requirements

### Requirement: Lexical query features are revision-qualified derived inputs

QueryFingerprintV1 and LexicalFingerprintV1 MUST derive from existing lexical owners,
record normalizer/corpus revisions, and enter the existing CandidateFeatureSnapshotV1.
They MUST NOT allocate candidate identity, grant admission, or add a fusion vote.

#### Scenario: A lexical feature is stale or unavailable
- **WHEN** its corpus revision does not match or required statistics are absent
- **THEN** feature admission rejects or marks it unavailable without inventing values

#### Scenario: An optional cluster routes candidates
- **WHEN** a lexical KMeans cluster is evaluated on a frozen admitted population
- **THEN** clusterId remains a routing feature and exact eligibility is unchanged

#### Scenario: Statistics are derived in a read-only proof
- **WHEN** bounded FTS/ts_stat queries compute lexical features
- **THEN** no canonical datastore or materialized-view writes occur


### Requirement: Candidate features share one admitted population
Candidate feature materialization MUST use one revision-qualified candidate population and checksum across semantic, structural, graph, domain, and ranking features.

#### Scenario: A feature row is materialized
- **WHEN** a feature is attached to a candidate
- **THEN** the row carries the candidate identity, population or ordinal-map checksum, feature revision, and producer evidence.

#### Scenario: A feature population is not admitted
- **WHEN** candidate identity or source revision qualification is incomplete
- **THEN** feature execution remains diagnostic and cannot promote ranking, cache, or graph identity.
