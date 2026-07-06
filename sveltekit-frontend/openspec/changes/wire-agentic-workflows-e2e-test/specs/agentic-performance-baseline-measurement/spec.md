## ADDED Requirements

### Requirement: Performance latency measurement (percentiles)
The system SHALL measure and report latency percentiles (p50, p95, p99) for dispatcher nodes, tools, and gRPC calls across 20+ reference queries.

#### Scenario: Measure node latency
- **WHEN** dispatcher node completes execution
- **THEN** latency sample (wall-clock time) is recorded to Redis sorted set `latency:dispatcher:{node_id}`
- **AND** latency is measured in milliseconds (integer precision)
- **AND** samples are retained for 24 hours

#### Scenario: Generate latency report
- **WHEN** test harness completes reference query suite
- **THEN** script queries Redis sorted sets for all nodes
- **AND** calculates percentiles: `{ p50: N, p95: M, p99: K }`
- **AND** generates JSON report: `{ node_id, latency_ms: { p50, p95, p99 } }`
- **AND** report includes all 9 dispatcher nodes

#### Scenario: Latency threshold validation
- **WHEN** performance baseline measurement completes
- **THEN** script validates: p99 latency for all nodes < 100ms (acceptable threshold)
- **AND** if any node exceeds threshold, test reports WARNING
- **AND** report identifies which nodes need optimization

### Requirement: Tool success rate measurement
The system SHALL measure tool invocation success rate (%) across all dispatcher tools.

#### Scenario: Count tool successes and failures
- **WHEN** tools are invoked during reference query execution
- **THEN** each tool invocation result is recorded: success or failure
- **AND** counts are aggregated by tool name
- **AND** success rate = (successes / total invocations) * 100

#### Scenario: Generate tool success report
- **WHEN** test harness completes
- **THEN** report includes: `{ tool_name, total_calls, successes, failures, success_rate_pct }`
- **AND** tool success rate is >= 95% for acceptable performance

### Requirement: Cache hit rate measurement
The system SHALL measure cache hit rate for L1 (Bifrost Redis) and L2 (Postgres) caches.

#### Scenario: Track L1 cache hits and misses
- **WHEN** dispatcher queries Bifrost Redis (L1)
- **THEN** result is recorded: hit or miss
- **AND** hit rate = (hits / total_queries) * 100

#### Scenario: Track L2 fallback
- **WHEN** L1 cache misses and Postgres is queried (L2)
- **THEN** L2 query is recorded as fallback
- **AND** L2 hit rate = (successful_postgres_queries / total_fallbacks) * 100

#### Scenario: Generate cache report
- **WHEN** test harness completes
- **THEN** report includes: `{ cache_layer: 'L1', hits, misses, hit_rate_pct }, { cache_layer: 'L2', hits, misses, hit_rate_pct }`
- **AND** L1 hit rate is ideally >= 50% (less than 50% means cache is not warmed sufficiently)
- **AND** L2 hit rate should be high (Postgres is reliable, fast fallback)

### Requirement: Error distribution tracking
The system SHALL classify and count errors by error class (category) during test execution.

#### Scenario: Classify errors by type
- **WHEN** dispatcher encounters an error
- **THEN** error is classified: `{ error_class: 'PacketNotFound' | 'ValidationError' | 'GrpcTimeout' | ... }`
- **AND** error is counted in aggregation

#### Scenario: Generate error distribution report
- **WHEN** test harness completes
- **THEN** report includes: `{ error_class, count, percentage }`
- **AND** errors are sorted by frequency (most common first)
- **AND** total error count and error rate are calculated

#### Scenario: Error tolerance validation
- **WHEN** performance baseline measurement completes
- **THEN** script validates: total error rate < 5% (acceptable for test phase)
- **AND** if any error class > 50% of total errors, it's flagged for investigation

### Requirement: Performance baseline report generation
The system SHALL generate a comprehensive JSON report with all performance metrics.

#### Scenario: Generate baseline report
- **WHEN** test harness command `npm run test:agentic-e2e:perf-baseline` completes
- **THEN** script generates JSON file: `docs/reports/agentic-perf-baseline-{timestamp}.json`
- **AND** report includes:
  - Timestamp and test parameters (query count, duration)
  - Latency percentiles (all nodes)
  - Tool success rates (all tools)
  - Cache hit rates (L1, L2)
  - Error distribution
  - Summary: pass/fail status, recommendations for optimization
