## ADDED Requirements

### Requirement: Packet type classification
The system SHALL store a `packet_type` enum on every atlas_packets row, indicating whether the packet represents code, test, documentation, prompt, tool, schema, API, or specification.

#### Scenario: Packet type is recorded
- **WHEN** a packet is created or updated in `atlas_packets`
- **THEN** the `packet_type` column contains one of: 'code' | 'test' | 'doc' | 'prompt' | 'tool' | 'schema' | 'api' | 'spec'

#### Scenario: Packet type is queryable
- **WHEN** a query filters packets by type (e.g., "find all test packets")
- **THEN** the filter uses the `packet_type` enum index and completes in <5ms on 58K rows

### Requirement: Packet ontology metadata
The system SHALL store a `packet_ontology` JSONB column on every atlas_packets row, containing capabilities, constraints, examples, and tags that describe what the packet provides.

#### Scenario: Ontology metadata is structured
- **WHEN** a packet's ontology is queried
- **THEN** the JSONB contains: `{ capabilities: string[], constraints: object, examples: object, tags: string[] }`

#### Scenario: Ontology metadata is optional but encouraged
- **WHEN** a packet exists without ontology data
- **THEN** queries still succeed (NULL or empty JSONB is valid); no error is raised

### Requirement: Packet hierarchy (parent and related packets)
The system SHALL store `parent_packet_key` (nullable, foreign key to another packet) and `related_packets` (text array) on every atlas_packets row to express hierarchical and semantic relationships.

#### Scenario: Parent-child relationships are traversable
- **WHEN** querying for children of a packet
- **THEN** the query `SELECT * FROM atlas_packets WHERE parent_packet_key = $key` returns all child packets in <10ms

#### Scenario: Related packets form a graph
- **WHEN** a packet has `related_packets = ['packet:foo', 'packet:bar']`
- **THEN** the array is queryable via PostgreSQL array operators (@>, &&) for set intersection/overlap queries

### Requirement: Packet telemetry metadata
The system SHALL store a `telemetry` JSONB column on every atlas_packets row, containing execution history and performance signals (optional, populated by tool execution logging pipeline).

#### Scenario: Telemetry is accumulated without blocking packet reads
- **WHEN** a packet is retrieved from atlas_packets
- **THEN** the telemetry field (if present) contains: `{ execution_count: int, success_count: int, failure_count: int, avg_latency_ms: float, last_execution: timestamp }`

#### Scenario: Telemetry field is optional during Phase 10
- **WHEN** Phase 10 schema is first deployed
- **THEN** telemetry column exists but all values are NULL or empty JSONB; Phase 10b populates it

### Requirement: Backward compatibility for packet schema
Existing queries against `atlas_packets` (that do not reference new columns) SHALL continue to work without modification.

#### Scenario: Legacy query runs unchanged
- **WHEN** existing code runs `SELECT packet_key, source_ref, feature_id FROM atlas_packets`
- **THEN** the query returns the same rows and columns as before; no errors

#### Scenario: New columns are non-blocking
- **WHEN** Phase 9 code queries `atlas_packets` without knowing about packet_type
- **THEN** NULL or default values are used for new columns; Phase 9 still runs

