## ADDED Requirements

### Requirement: Telemetry emission from tool selection
The system SHALL emit a telemetry event to RabbitMQ queue `tool.telemetry` every time `selectTool()` executes a tool, capturing: tool_id, query, success, latency_ms, error_type, timestamp.

#### Scenario: Tool execution triggers telemetry
- **WHEN** `selectTool()` completes execution of a tool
- **THEN** an event is published to RabbitMQ queue `tool.telemetry` with all required fields

#### Scenario: Telemetry emission is non-blocking
- **WHEN** a tool executes and returns a result
- **THEN** telemetry is queued asynchronously; tool selection latency is not affected (fire-and-forget, <1ms overhead)

#### Scenario: Queue is durable
- **WHEN** RabbitMQ is configured for persistence
- **THEN** telemetry events survive a process crash or queue consumer downtime

### Requirement: RabbitMQ consumer for tool telemetry
The system SHALL provide a background worker that consumes the `tool.telemetry` queue and writes entries to `tool_execution_log` table.

#### Scenario: Consumer reads from queue
- **WHEN** tool.telemetry queue has messages
- **THEN** the consumer prefetch(1) and processes one message at a time

#### Scenario: Consumer writes to database
- **WHEN** a telemetry event is consumed
- **THEN** it is inserted into tool_execution_log; the message is acknowledged (acked)

#### Scenario: Consumer handles errors
- **WHEN** database INSERT fails
- **THEN** the message is nacked and requeued (up to 3 retries); after 3 failures, it is sent to dead-letter queue

#### Scenario: Consumer is stateless
- **WHEN** the consumer restarts
- **THEN** it resumes from where it left off (queue tracks acknowledgments); no telemetry is lost

### Requirement: Hourly materialized view refresh
The system SHALL refresh the materialized view `tool_execution_stats_7d` on a scheduled task (hourly cron or RabbitMQ scheduled message).

#### Scenario: Refresh is scheduled
- **WHEN** the system starts, an hourly refresh job is registered
- **THEN** the refresh runs at predictable times (e.g., :00 of every hour)

#### Scenario: Refresh aggregates telemetry
- **WHEN** the refresh job runs
- **THEN** it queries tool_execution_log for the past 7 days, groups by tool_id, and computes: success_count, failure_count, avg_latency_ms, timeout_count, schema_mismatch_count, rolling_success_rate

#### Scenario: Refresh completes in bounded time
- **WHEN** the view is refreshed with 10K+ log entries
- **THEN** the refresh completes in <30 seconds (non-blocking, can run during off-peak hours)

### Requirement: Multi-signal observation layer integration
The system SHALL pass telemetry statistics (success_rate, latency, timeout_count, schema_mismatch_count) to `computeObservationFromQuery()` for use in HMM state inference.

#### Scenario: Observation includes historical signals
- **WHEN** `computeObservation()` is called (Phase 11+)
- **THEN** it reads from tool_execution_stats_7d and includes: historical_success_rate, avg_latency_ms, validation_failures (schema_mismatch_count)

#### Scenario: HMM state inference uses telemetry
- **WHEN** inferHMMState() receives an observation with low success_rate
- **THEN** it can de-rank or quarantine tools with degraded performance history

#### Scenario: Fallback if telemetry unavailable
- **WHEN** tool_execution_stats_7d is empty or stale
- **THEN** HMM inference uses neutral values (success_rate = 0.5, no penalty); tool selection proceeds

### Requirement: Feedback loop closes on tool updates
After telemetry refresh, the system SHALL update telemetry columns on tool_registry (success_count, failure_count, avg_latency_ms, rolling_success_rate_7d) to reflect current statistics.

#### Scenario: Tool registry stats are synchronized
- **WHEN** the materialized view is refreshed
- **THEN** tool_registry columns are updated with fresh values from tool_execution_stats_7d (via SQL UPDATE or application code)

#### Scenario: Next query sees fresh stats
- **WHEN** a user queries a tool immediately after stats refresh
- **THEN** the tool_registry row reflects the most recent rolling_success_rate (updated within 1 hour)

#### Scenario: Circular dependency is prevented
- **WHEN** tool telemetry is logged and stats are updated
- **THEN** no circular dependencies exist (tools don't depend on their own stats being updated before they can be selected)

