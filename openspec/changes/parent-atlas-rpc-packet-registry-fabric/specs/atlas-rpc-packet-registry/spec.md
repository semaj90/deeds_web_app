## ADDED Requirements

### Requirement: Canonical packet registry identity
The registry SHALL resolve every packet and projection descriptor to the
canonical PostgreSQL workspace, source reference, packet key, workspace
revision, packet revision, content digest, and representation revision.

#### Scenario: Projection descriptor resolves to canonical packet
- **WHEN** a lane reports a packet projection
- **THEN** the registry accepts it only if the packet identity and revisions
  resolve to PostgreSQL canonical state

#### Scenario: Unqualified packet is reported
- **WHEN** a lane omits workspace or packet revision
- **THEN** the registry reports the descriptor as unqualified and does not mark
  it eligible for promotion or fusion

### Requirement: Lane and mirror descriptors
The registry SHALL represent BM25, PostgreSQL pgvector, Qdrant dense/sparse,
IVFFlat, HNSW, cuVS/RAPIDS, and FastAPI as distinct lane or executor
descriptors with owner, revision, checksum, health, and write-policy fields.

#### Scenario: Mirrored Qdrant collection is listed
- **WHEN** a Qdrant collection is registered
- **THEN** its collection name, vector name, tags, index configuration,
  projection revision, and canonical packet join are visible without making
  Qdrant authoritative

#### Scenario: Duplicate mirror is queried
- **WHEN** PostgreSQL and Qdrant return the same canonical packet
- **THEN** SearchRuntime can identify the logical lane and deduplicate the
  result before fusion

### Requirement: Semantic AST packet RPC
The RPC contract SHALL support read-only retrieval of semantic AST packets
with source reference, exact byte span, tree-node/symbol identity, parser and
grammar revisions, workspace/packet revisions, and an evidence receipt.

#### Scenario: Qualified AST packet is returned
- **WHEN** a request supplies a valid workspace revision and source/packet
  scope
- **THEN** the response returns only packets carrying matching canonical
  identity and exact source coordinates

#### Scenario: AST producer is unavailable
- **WHEN** the AST producer or canonical join is unavailable
- **THEN** the RPC returns an explicit failed/unavailable receipt and no
  fabricated packet, revision, or source identity

### Requirement: Cross-transport identity
Go gRPC, FastAPI adapters, tRPC, protobufjs clients, and Mastra tools SHALL
preserve the same request identity and receipt fields across transport
boundaries.

#### Scenario: Request is bridged across transports
- **WHEN** a request moves from SvelteKit/tRPC through Go or FastAPI
- **THEN** tool call, run, workspace, packet, and revision identity remains
  unchanged in the response receipt

#### Scenario: Identity mismatch is detected
- **WHEN** a response receipt differs from the caller-owned identity
- **THEN** the adapter rejects it before FSM observation or agent context
  injection

### Requirement: Future consumer boundary
Arrow/mmap, XGBoost, PyTorch, reinforcement learning, DAG synthesis,
HyperGraphRAG, and agentic dense search SHALL consume revisioned registry
snapshots and SHALL NOT create canonical packet identity or direct durable
writes.

#### Scenario: Future consumer receives a snapshot
- **WHEN** a downstream consumer loads a registry snapshot
- **THEN** it receives packet identity, representation, and checksum revisions
  sufficient for replay and attribution

#### Scenario: Consumer attempts an unqualified write
- **WHEN** a downstream consumer lacks canonical admission and authorization
- **THEN** the operation fails closed with no PostgreSQL, Qdrant, cache, or
  graph mutation
