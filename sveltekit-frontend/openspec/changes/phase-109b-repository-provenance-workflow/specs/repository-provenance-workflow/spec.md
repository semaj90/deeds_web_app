## Repository Provenance Workflow Specification - 2026-07-30

## ADDED Requirements

### Requirement: Repository snapshot stage
The system SHALL pin repository revision, dependency lockfiles, and external package versions before indexing.

#### Scenario: Snapshot is recorded
- **WHEN** stage 0 runs
- **THEN** a snapshot manifest is written
- **AND** the manifest records repository revision and dependency versions

### Requirement: Deterministic extraction stage
The system SHALL deterministically extract symbols, imports, exports, calls, schemas, routes, tools, and tests from source files.

#### Scenario: File is parsed
- **WHEN** stage 2 processes a file
- **THEN** it records source spans and extracted structural facts
- **AND** extraction output is idempotent for the same file hash

### Requirement: Identity resolution stage
The system SHALL assign stable artifact IDs and reconcile renamed or moved symbols.

#### Scenario: Symbol changes location
- **WHEN** a symbol moves or is renamed
- **THEN** the old artifact is marked superseded
- **AND** the new artifact retains a stable identity chain

### Requirement: Separate lexical and semantic indexing
The system SHALL maintain separate lexical, semantic, and structural retrieval lanes.

#### Scenario: Query needs multiple lanes
- **WHEN** a query is executed
- **THEN** exact symbol search, lexical ranking, semantic retrieval, and structural search may all contribute candidates
- **AND** no single lane is treated as complete authority

### Requirement: Relationship construction
The system SHALL store deterministic edges separately from inferred edges.

#### Scenario: Multi-party relation exists
- **WHEN** a relationship involves more than two artifacts
- **THEN** it is represented as a hyperedge with members and roles

### Requirement: Labeling observations
The system SHALL record labels as observations with provenance rather than overwriting canonical facts.

#### Scenario: Human validation occurs
- **WHEN** a label is reviewed
- **THEN** the result is stored with source, confidence, and evidence references

### Requirement: Projection and validation
The system SHALL project canonical artifacts into Postgres, Qdrant, Neo4j, and Redis with parity and coverage validation.

#### Scenario: Projection is complete
- **WHEN** stage 10 runs
- **THEN** schema hashes, referential integrity, parity, and coverage checks pass or fail explicitly

### Requirement: Incremental updates
The system SHALL invalidate only dependent projections when source hashes change.

#### Scenario: File content changes
- **WHEN** a file hash differs from the previous revision
- **THEN** dependent summaries, embeddings, labels, and edges are recomputed
- **AND** unchanged artifacts are reused
