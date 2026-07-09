## ADDED Requirements

### Requirement: Tool execution logging
The system SHALL create a `tool_execution_log` table to record every invocation of a tool, capturing: tool_id, query (text excerpt), success (boolean), latency_ms (int), error_type (nullable string), timestamp.

#### Scenario: Tool execution is logged
- **WHEN** `selectTool()` executes a tool
- **THEN** an entry is inserted into tool_execution_log with: `{ tool_id, query: query[:500], success: true/false, latency_ms: <time>, error_type: null or "timeout"/"schema_mismatch"/"api_failure", timestamp: NOW() }`

#### Scenario: Logging is non-blocking
- **WHEN** a tool executes and completes
- **THEN** telemetry is logged asynchronously via RabbitMQ (fire-and-forget); tool selection latency is not affected (<1ms queue overhead)

#### Scenario: Logging is reliable
- **WHEN** RabbitMQ queue has durability enabled
- **THEN** telemetry events are persisted even if the consumer is temporarily down; no telemetry loss

### Requirement: Error type classification
The system SHALL classify tool execution failures into categories: timeout, schema_mismatch, api_failure, rate_limit, unknown.

#### Scenario: Timeout is detected
- **WHEN** a tool exceeds its constraint timeout (e.g., 30 seconds)
- **THEN** the error_type is logged as "timeout" and timeout_count is incremented

#### Scenario: Schema mismatch is detected
- **WHEN** tool output does not match expected schema
- **THEN** the error_type is logged as "schema_mismatch" and schema_mismatch_count is incremented

#### Scenario: Unknown errors are tracked
- **WHEN** an error occurs that doesn't fit a known category
- **THEN** the error_type is logged as "unknown" and the full error message is stored (if space available)

### Requirement: Query text truncation for privacy
The system SHALL truncate query text to 500 characters before storing in tool_execution_log to balance observability with privacy.

#### Scenario: Long queries are truncated
- **WHEN** a query is 5000 characters long
- **THEN** only the first 500 characters are stored in tool_execution_log.query

#### Scenario: Query text is sufficient for analysis
- **WHEN** debugging why a tool failed on a particular query
- **THEN** the 500-character excerpt is enough to identify the query intent (first 500 chars usually includes key keywords)

### Requirement: Telemetry event schema stability
The system SHALL maintain backward compatibility for telemetry logging; if new fields are added in future phases, existing consumers SHALL continue to work.

#### Scenario: New telemetry fields do not break existing queries
- **WHEN** Phase 10 logs `{ tool_id, query, success, latency_ms, error_type, timestamp }`
- **THEN** Phase 11+ can add new columns (retry_count, confidence, etc.) without breaking Phase 10 log readers

#### Scenario: Telemetry can be extended
- **WHEN** Phase 11 wants to log XGBoost confidence scores
- **THEN** a new optional column can be added to tool_execution_log; Phase 10 logs have NULL for that column

