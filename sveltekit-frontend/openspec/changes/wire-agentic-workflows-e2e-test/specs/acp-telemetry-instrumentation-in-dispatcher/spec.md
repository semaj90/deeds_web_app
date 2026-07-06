## ADDED Requirements

### Requirement: Telemetry emission from dispatcher nodes
The system SHALL emit telemetry (routing decision, tool invocation, timing, success/error) from all 9 dispatcher nodes to Redis (L1) and Postgres (L2) without blocking node execution.

#### Scenario: Node emits routing decision
- **WHEN** dispatcher node makes a routing decision (e.g., route to identity recovery vs. cache validation)
- **THEN** telemetry record is created: `{ nodeId, decision, timestamp, latency_ms }`
- **AND** record is written to Redis key `telemetry:dispatcher:{node_id}:{timestamp}`
- **AND** Postgres write is deferred (microtask queue) to avoid blocking
- **AND** node continues execution immediately (< 1ms telemetry overhead)

#### Scenario: Non-blocking telemetry emission
- **WHEN** node completes and telemetry is queued for emission
- **THEN** telemetry is sent to Redis synchronously (< 5ms)
- **AND** Postgres write is deferred via `queueMicrotask()` (async, non-blocking)
- **AND** node doesn't wait for Postgres to complete
- **AND** Postgres audit write eventually succeeds (eventual consistency)

### Requirement: Telemetry contains routing metadata
The system SHALL include routing decision metadata in telemetry: decision type, confidence score, alternative paths considered, selected path.

#### Scenario: Capture routing decision details
- **WHEN** dispatcher evaluates multiple routing options (identity recovery, cache validation, topology routing)
- **THEN** telemetry includes: `{ decision: 'identity-recovery', confidence: 0.95, alternatives: ['cache-validation', 'topology-routing'], selected_path: 'identity-recovery' }`
- **AND** confidence score is a number in [0, 1]
- **AND** alternatives list is ordered by confidence descending

### Requirement: Telemetry contains gRPC call traces
The system SHALL emit telemetry for gRPC calls: method name, duration, status code, error class (if failed).

#### Scenario: Record successful gRPC call
- **WHEN** dispatcher node calls gRPC service (e.g., embedding service at :50051)
- **THEN** telemetry includes: `{ service: 'embedding', method: 'embed', duration_ms: 125, status: 'success' }`
- **AND** duration is wall-clock time in milliseconds

#### Scenario: Record failed gRPC call
- **WHEN** gRPC call fails (e.g., connection timeout, service unavailable)
- **THEN** telemetry includes: `{ service: 'retrieval', method: 'search', duration_ms: 5000, status: 'error', error_class: 'DeadlineExceeded' }`
- **AND** error_class is the gRPC status code (DeadlineExceeded, Unavailable, etc.)

### Requirement: Telemetry contains tool invocation traces
The system SHALL emit telemetry when dispatcher invokes MCP tools: tool name, invocation time, duration, success/failure, params snapshot.

#### Scenario: Record tool invocation
- **WHEN** dispatcher invokes MCP tool `identity_recover_packet`
- **THEN** telemetry includes: `{ tool: 'identity_recover_packet', invoked_at: timestamp, duration_ms: 45, success: true, params_hash: 'abc123' }`
- **AND** params_hash is SHA-256 of params (privacy-safe, no sensitive data in telemetry)

#### Scenario: Record tool failure
- **WHEN** tool invocation fails
- **THEN** telemetry includes: `{ tool: 'identity_recover_packet', invoked_at: timestamp, duration_ms: 250, success: false, error: 'packet_not_found' }`
- **AND** error field is error code/message

### Requirement: Telemetry latency tracking
The system SHALL track latency percentiles (p50, p95, p99) for each dispatcher node and exported tool.

#### Scenario: Collect latency samples
- **WHEN** dispatcher node completes execution
- **THEN** latency sample (wall-clock time) is recorded to Redis sorted set `latency:dispatcher:{node_id}`
- **AND** samples are retained for 24 hours
- **AND** percentile calculation (p50/p95/p99) is performed on query, not per-invocation

#### Scenario: Export latency report
- **WHEN** performance baseline measurement runs
- **THEN** script queries Redis sorted sets for all nodes
- **AND** calculates p50/p95/p99 for each
- **AND** generates JSON report: `{ node: 'node_recover_identity', p50: 45, p95: 120, p99: 250 }`

### Requirement: Telemetry for cache hits/misses
The system SHALL record when dispatcher node hits or misses L1 (Bifrost Redis) and L2 (Postgres) caches.

#### Scenario: Record cache hit
- **WHEN** dispatcher looks up cached result in Redis (Bifrost L1)
- **THEN** telemetry includes: `{ cache_layer: 'L1_bifrost', hit: true, key: 'bifrost:packet:{key}', latency_ms: 2 }`
- **AND** node skips expensive computation

#### Scenario: Record cache miss + fallback
- **WHEN** dispatcher misses L1 cache and queries Postgres (L2)
- **THEN** telemetry includes: `{ cache_layer: 'L2_postgres', hit: false, fallback: true, latency_ms: 45 }`
- **AND** Postgres result is optionally cached in L1 for future hits

