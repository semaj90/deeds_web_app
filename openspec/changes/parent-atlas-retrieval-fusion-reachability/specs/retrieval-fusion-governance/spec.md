# Retrieval fusion governance

## ADDED Requirements

### Requirement: Logical lanes are distinct from executor names

SearchRuntime MUST remain the production normalization/fusion owner. Alternative
executors of the same logical dense lane MUST yield at most one semantic RRF vote
per admitted revision-qualified candidate; executor evidence MUST remain observable.

#### Scenario: Qdrant and TurboVec return the same canonical candidate
- **WHEN** both executors supply admitted hits for the same candidate and revision
- **THEN** normalization groups them under one logical dense lane before fusion
- **AND** two executor labels MUST NOT produce two semantic contributions

#### Scenario: Legacy fusion consumers require migration
- **WHEN** the evaluation or Go multi-vector path is considered for consolidation
- **THEN** its explicit RF owner decision and bounded replay precede runtime migration


### Requirement: Retrieval fusion has one normalization and fusion owner
Retrieval executors MUST return revision and identity metadata, while SearchRuntime owns cross-executor normalization, same-lane deduplication, and final fusion.

#### Scenario: Multiple executors return the same logical candidate
- **WHEN** candidates from one logical lane refer to the same canonical identity
- **THEN** SearchRuntime emits at most one lane vote for that identity.

#### Scenario: An executor lacks canonical identity
- **WHEN** a result has only a projection or degraded fallback identity
- **THEN** the result remains observable as degraded and cannot silently become canonical identity.

### Requirement: Weight semantics must be classified before consolidation
RRF weights, routing priors, reranker features, hotness scores, and executor-local
weights MUST remain distinct until their application stage and policy scope are
explicitly identified. A shared numeric type or similar name MUST NOT establish
shared semantic authority.

#### Scenario: A raw weight has an unknown meaning
- **WHEN** the census cannot identify the weight's semantic class, application stage,
  or policy scope
- **THEN** the entry is classified as `UNCLASSIFIED`
- **AND** migration authorization remains false.

#### Scenario: An executor is listed as a lane
- **WHEN** Qdrant, cuVS, CAGRA, TurboVec, or another executor name appears as an
  independent fusion lane
- **THEN** the census records an `EXECUTOR_AS_LANE` conflict
- **AND** the executor does not receive an independent logical-lane vote.

#### Scenario: Equivalent logical lanes use different names
- **WHEN** multiple weight sources map to one logical lane
- **THEN** the mapping records all aliases and executors
- **AND** the lane contributes at most one RRF vote before fusion.

#### Scenario: Weight consolidation is proposed
- **WHEN** the census has unclassified entries, semantic conflicts, unmapped voting
  sources, or missing caller replay evidence
- **THEN** `migrationAuthorized` is false
- **AND** no ranking or runtime fusion implementation is changed.
