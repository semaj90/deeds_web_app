## ADDED Requirements

### Requirement: Rolling statistics materialized view
The system SHALL create a materialized view `tool_execution_stats_7d` that aggregates the past 7 days of tool execution telemetry, computing: success_count, failure_count, avg_latency_ms, timeout_count, schema_mismatch_count, false_positive_rate, rolling_success_rate (success_count / (success_count + failure_count)).

#### Scenario: Stats are computed from telemetry log
- **WHEN** the materialized view is refreshed
- **THEN** it queries tool_execution_log for entries timestamped within the past 7 days and groups by tool_id

#### Scenario: Stats are accurate
- **WHEN** a tool has 95 successful and 5 failed executions in the past 7 days
- **THEN** the view shows: `{ success_count: 95, failure_count: 5, rolling_success_rate: 0.95, avg_latency_ms: 42.3 }`

#### Scenario: Stats are O(1) lookup
- **WHEN** tool selection queries the stats for a specific tool
- **THEN** the lookup is via `SELECT * FROM tool_execution_stats_7d WHERE tool_id = $1` (indexed primary key, <1ms)

### Requirement: Hourly refresh schedule
The system SHALL refresh the materialized view hourly on a scheduled task (e.g., cron or RabbitMQ scheduled message), capturing fresh statistics from the past 7 days.

#### Scenario: Refresh is scheduled
- **WHEN** the system starts, a scheduled job is registered to refresh the view at the top of every hour
- **THEN** the refresh runs non-interactively and completes in <30 seconds

#### Scenario: Refresh is non-blocking
- **WHEN** the view is being refreshed
- **THEN** queries against the view continue to use the previous version (no locks); users see fresh stats within 1 hour

#### Scenario: Refresh handles concurrent updates
- **WHEN** telemetry is being logged to tool_execution_log while the view is refreshing
- **THEN** the new data is included in the next hourly refresh (eventual consistency is acceptable)

### Requirement: Bounded retention for telemetry
The system SHALL retain tool execution telemetry for at least 7 days and MAY prune older entries (not required in Phase 10).

#### Scenario: 7-day retention is maintained
- **WHEN** querying the view, only telemetry from the past 7 days is included
- **THEN** tool stats are based on recent historical performance (not stale 30-day data)

#### Scenario: Old telemetry can be pruned
- **WHEN** a background job runs monthly
- **THEN** telemetry older than 7 days MAY be deleted (optional in Phase 10)

### Requirement: Fallback for missing statistics
When statistics are unavailable or stale, the system SHALL use fallback values (neutral confidence, no penalty) so tool selection proceeds.

#### Scenario: Missing stats do not block tool selection
- **WHEN** the materialized view is empty or out of date
- **THEN** tool selection uses default values: `{ success_count: 0, failure_count: 0, rolling_success_rate: 0.5 }` (neutral)

#### Scenario: New tools have no history
- **WHEN** a tool is added to tool_registry but has no entries in tool_execution_log yet
- **THEN** stats default to neutral values; the tool is not penalized for being new

### Requirement: Stats schema in tool_registry
The system SHALL populate telemetry columns on tool_registry (success_count, failure_count, avg_latency_ms, timeout_count, schema_mismatch_count, false_positive_rate, rolling_success_rate_7d) by reading from the materialized view.

#### Scenario: Tool registry reflects current stats
- **WHEN** tool selection queries tool_registry.rolling_success_rate_7d for a tool
- **THEN** the value is synchronized with tool_execution_stats_7d (updated at refresh time)

#### Scenario: Stats are consistent across queries
- **WHEN** querying different tools in a single query
- **THEN** all stats are from the same hourly refresh window (no partial updates mid-hour)

