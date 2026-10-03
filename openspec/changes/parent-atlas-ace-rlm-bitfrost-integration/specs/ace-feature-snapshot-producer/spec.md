# ACE feature snapshot producer

## ADDED Requirements

### Requirement: Query feature inputs use the existing ACE production bridge

ACE MUST consume admitted query/candidate features through the existing feature-source
adapter and ContextManifestV2, preserving ordinal, evidence, retrieval-policy and
playbook revision bindings. A new feature MUST NOT create another context compiler.

#### Scenario: A feature input lacks current lineage
- **WHEN** query or candidate features cannot satisfy the existing snapshot admission
- **THEN** the bridge rejects them or records unavailability without synthesizing revisions


### Requirement: Server-owned feature snapshots require complete lineage

The ACE admission path MUST construct `CandidateFeatureSnapshotV1` only from a
server-owned retrieval result, an existing validated `CandidateOrdinalMapV1`,
and feature rows carrying matching workspace, source, feature, graph, and
producer revisions. Query order, client payloads, timestamps, and cache keys
MUST NOT supply missing lineage.

#### Scenario: Complete revision-qualified inputs are admitted

- **GIVEN** SearchRuntime returns canonical candidates
- **AND** the server supplies a validated `CandidateOrdinalMapV1`
- **AND** every feature row matches the map identity and required revisions
- **WHEN** the producer builds the ACE snapshot
- **THEN** it emits a checksum-sealed `CandidateFeatureSnapshotV1`
- **AND** it may pass that snapshot to the existing ACE admission boundary
- **AND** it performs no canonical store writes

#### Scenario: Missing or synthetic lineage is rejected

- **GIVEN** a candidate, feature row, or runtime context lacks an authoritative
  workspace, source, candidate-snapshot, feature, graph, or producer revision
- **OR** a revision is derived from the wall clock or a client-provided value
- **WHEN** the producer attempts snapshot admission
- **THEN** it rejects the candidate before snapshot construction
- **AND** no ACE cache write or canonical write is performed

### Requirement: Feature production preserves existing ownership

The producer MUST call the existing SearchRuntime, ordinal-map, query-adaptive
feature compiler, and ACE admission owners through their typed boundaries. It
MUST NOT become a retrieval executor, invent a second ordinal allocator, or
dispatch directly to Qdrant, Postgres, Neo4j, or Valkey.

#### Scenario: Existing owners remain the only execution path

- **GIVEN** a live caller requests ACE context from retrieval results
- **WHEN** the producer composes the feature snapshot
- **THEN** retrieval and feature resolution remain owned by their existing
  server modules
- **AND** the producer emits only the snapshot/admission result
- **AND** writesPerformed is false unless a separately authorized cache write
  is explicitly requested

### Requirement: Request-scoped candidates remain bound to the sealed parent map

A request-scoped retrieval selection MUST bind to the checksum, row count,
producer revision, workspace revision, and candidate-snapshot revision of the
validated parent `CandidateOrdinalMapV1`. Every selected candidate MUST retain
its original parent `candidateOrdinal` and exact canonical ID, packet key,
source reference, source revision, and workspace revision. Selection order,
retrieval rank, executor IDs, and local array positions MUST NOT allocate or
rewrite a canonical ordinal.

#### Scenario: Top-K selection retains parent identity and coordinates
- **GIVEN** a validated parent `CandidateOrdinalMapV1`
- **AND** SearchRuntime returns revision-qualified selected identities with
  their already-admitted parent ordinals
- **WHEN** the server constructs the request-scoped selection receipt
- **THEN** the receipt binds the exact parent map checksum and producer metadata
- **AND** each selected row preserves its original parent ordinal
- **AND** the receipt is deterministic, non-canonical, and write-free

#### Scenario: Selected features bind to the admitted full feature snapshot
- **GIVEN** a verified request selection and a complete full-cohort
  `CandidateFeatureSnapshotV1` bound to the same parent ordinal map
- **WHEN** the server resolves feature rows for the selected candidates
- **THEN** it verifies the full snapshot checksum and exact selected-row
  identity/revisions before returning the subset
- **AND** the selected subset preserves sparse parent ordinals and binds the
  parent map, feature snapshot, and selection checksums
- **AND** the full snapshot row count is not redefined as the request top-K
  count
- **AND** the result is non-canonical and write-free

#### Scenario: Selection cannot substitute or remap a candidate
- **GIVEN** a selected candidate has an unknown ordinal or mismatched canonical
  ID, packet key, source reference, source revision, or workspace revision
- **OR** the receipt is replayed against a different parent map
- **WHEN** the selection is built or independently verified
- **THEN** it is rejected before ACE snapshot or ContextManifest construction
- **AND** no ordinal is inferred from rank or request-local array position

#### Scenario: Legacy ACE stream cannot accept client cache authority
- **GIVEN** the live stream route still assembles a legacy packet rather than
  an admitted `AcePacketV3`/`ContextManifest`
- **WHEN** a client supplies an `aceCacheIdentity` in its request body
- **THEN** request validation rejects that body before cache access
- **AND** the route does not perform a revisioned BitFrost read or write from
  caller-provided identity
- **AND** revisioned cache access remains unavailable until a server-owned
  admitted ACE handoff is wired
