## ADDED Requirements

### Requirement: End-to-end workflow execution
The system SHALL support end-to-end test execution: query input → dispatcher routing decision → subagent execution → cache/topology enrichment → telemetry export → response output.

#### Scenario: Execute full workflow
- **WHEN** test harness provides a query (e.g., "recover packet with key X")
- **THEN** dispatcher receives query and routing node makes decision (identity recovery vs. cache validation)
- **AND** dispatcher invokes appropriate subagent(s)
- **AND** subagent(s) execute: read Postgres, validate Zod, write Postgres, invalidate Redis, emit event
- **AND** results are merged and enriched with topology data from Neo4j
- **AND** telemetry is emitted to Redis + Postgres
- **AND** final response is returned to caller with success status

#### Scenario: Workflow handles partial failures
- **WHEN** query requires 2 subagents but one fails
- **THEN** dispatcher continues with available data from successful subagent
- **AND** final response includes partial data with error indication
- **AND** telemetry records which subagent failed

### Requirement: Reference query test suite
The system SHALL execute 20+ reference queries (production-realistic) through the dispatcher to measure baseline performance.

#### Scenario: Execute reference query suite
- **WHEN** test harness runs `npm run test:agentic-e2e:reference-queries`
- **THEN** harness loads 20+ reference queries from benchmark data (Sessions 115-118)
- **AND** each query is executed through full dispatcher pipeline
- **AND** results are collected and analyzed
- **AND** test reports PASS if all queries complete successfully

#### Scenario: Validate query results
- **WHEN** reference query returns results
- **THEN** results include packet metadata (id, score, signals, rrfBreakdown)
- **AND** results are ranked by RRF score descending
- **AND** score range is valid [0, 1]

### Requirement: Test isolation and state cleanup
The system SHALL isolate each test run, cleaning up state between queries to prevent cross-contamination.

#### Scenario: Clean state between queries
- **WHEN** test harness executes query A, then query B
- **THEN** state from query A doesn't affect query B results
- **AND** Redis cache is isolated (separate keys per test)
- **AND** Postgres transactions are rolled back after each query (test database)

#### Scenario: Test database isolation
- **WHEN** test harness runs against separate test database
- **THEN** no real production data is modified
- **AND** test data is seeded before test suite runs
- **AND** test data is cleaned up after tests complete

