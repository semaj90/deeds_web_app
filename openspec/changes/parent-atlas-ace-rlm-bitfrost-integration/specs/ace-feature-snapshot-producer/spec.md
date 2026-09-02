# ACE feature snapshot producer

## ADDED Requirements

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
