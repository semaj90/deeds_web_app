## ADDED Requirements

### Requirement: Tool capabilities metadata
The system SHALL store a `tool_capabilities` JSONB column on every tool_registry row, containing an array of capability identifiers (e.g., ["lexical_search", "ast_analysis", "graph_traversal"]) that describe what the tool can do.

#### Scenario: Tool capabilities are indexed
- **WHEN** a tool's capabilities are queried
- **THEN** Qdrant payload filtering uses the capabilities array to exclude tools that don't match required capabilities

#### Scenario: Tool capabilities are human-readable
- **WHEN** a tool is registered with capabilities = ["lexical_search", "gpu_accelerated"]
- **THEN** the system can explain to users (or downstream filters) what the tool does

### Requirement: Tool constraints metadata
The system SHALL store a `tool_constraints` JSONB column on every tool_registry row, containing operational limits (e.g., max_query_length, rate_limit, timeout_seconds).

#### Scenario: Tool constraints prevent invalid calls
- **WHEN** a tool has constraints = { "max_query_length": 10000, "rate_limit": 100 }
- **THEN** queries longer than 10000 chars are rejected before tool execution; rate limiting is enforced

#### Scenario: Constraints are consulted before tool selection
- **WHEN** ranking tools for a query with 15KB input
- **THEN** tools with max_query_length < 15000 are de-ranked or filtered out

### Requirement: Tool examples metadata
The system SHALL store a `tool_examples` JSONB column on every tool_registry row, containing example input/output pairs and expected scenarios.

#### Scenario: Tool examples improve embedding quality
- **WHEN** tool embeddings are generated, examples are included in the text
- **THEN** Qdrant can match "find tools that return JSON with fields X, Y, Z" better because examples show output structure

#### Scenario: Tool examples are queryable
- **WHEN** a user asks "show me an example of how to use this tool"
- **THEN** the system returns the examples from tool_examples JSONB

### Requirement: Tool tags
The system SHALL store a `tool_tags` text array on every tool_registry row, containing semantic tags (e.g., ["fast", "deterministic", "gpu-accelerated", "deprecated"]).

#### Scenario: Deprecated tools are filtered
- **WHEN** ranking tools, those tagged ["deprecated"] are excluded (or de-ranked heavily)
- **THEN** users don't receive deprecated tool recommendations

#### Scenario: Tags support arbitrary filtering
- **WHEN** filtering for "fast" tools, Qdrant uses `tool_tags @> ['fast']` to find matches
- **THEN** query completes in <5ms using PostgreSQL array index

### Requirement: Tool failure modes tracking
The system SHALL store a `failure_modes` JSONB column on every tool_registry row, containing a tally of failure types (e.g., { "timeouts": 5, "schema_mismatch": 12, "rate_limit": 3 }).

#### Scenario: Failure modes inform circuit breaking
- **WHEN** a tool has failed 12+ times with schema_mismatch in the past 7 days
- **THEN** the HMM state inference can prioritize quarantine or reduce confidence

#### Scenario: Failure modes are updated by telemetry logger
- **WHEN** a tool execution logs an error of type "timeout"
- **THEN** the failure_modes.timeouts counter is incremented (via RabbitMQ async worker)

### Requirement: Tool telemetry columns
The system SHALL add the following telemetry columns to tool_registry: success_count (int), failure_count (int), avg_latency_ms (real), timeout_count (int), schema_mismatch_count (int), false_positive_rate (real), rolling_success_rate_7d (real).

#### Scenario: Telemetry columns enable operational visibility
- **WHEN** querying tool_registry for a specific tool
- **THEN** the response includes: `{ success_count: 150, failure_count: 3, avg_latency_ms: 42.5, rolling_success_rate_7d: 0.98 }`

#### Scenario: Telemetry is used for reranking
- **WHEN** multiple tools are candidates for selection, one has rolling_success_rate_7d = 0.98 and another = 0.65
- **THEN** the higher-confidence tool is ranked first (all else equal)

#### Scenario: Telemetry is non-blocking
- **WHEN** telemetry table is unavailable or stale
- **THEN** tool selection proceeds using fallback values (neutral confidence, no penalty)

### Requirement: Backward compatibility for tool registry
Existing queries against `tool_registry` (that do not reference new columns) SHALL continue to work without modification.

#### Scenario: Legacy tool queries work unchanged
- **WHEN** Phase 9 code runs `SELECT id, name, domains FROM tool_registry`
- **THEN** the query returns the same rows and columns as before; no errors

#### Scenario: Phase 9 tool selection ignores new fields
- **WHEN** `selectTool()` is called before Phase 10 wiring is complete
- **THEN** new ontology columns are NULL; Phase 9 behavior is unchanged (ranks by embedding similarity only)

