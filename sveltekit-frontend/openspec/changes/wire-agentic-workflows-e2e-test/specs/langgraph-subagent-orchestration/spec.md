## ADDED Requirements

### Requirement: Subagent parallel invocation
The system SHALL allow a parent LangGraph node to invoke multiple worker subagent nodes in parallel using `Promise.allSettled()`, passing a shared `NodeContext` (Postgres, Redis, gRPC clients) to each child.

#### Scenario: Parent invokes two subagents simultaneously
- **WHEN** parent node receives a query requiring identity recovery and cache validation
- **THEN** parent invokes both subagents in parallel (not sequentially)
- **AND** both subagents receive identical `NodeContext` with Postgres/Redis clients
- **AND** parent waits for both to complete before merging results

#### Scenario: Partial failure handling
- **WHEN** parent invokes 2 subagents and one fails (throws exception)
- **THEN** `Promise.allSettled()` captures both success and failure
- **AND** parent checks: if ≥1 succeeded, composite result is valid
- **AND** if all fail, parent propagates error up the graph

### Requirement: Deterministic result merging
The system SHALL merge subagent results into a single state object, with metadata coming from the highest-confidence subagent (determined by a stable sort order).

#### Scenario: Merge two subagent results
- **WHEN** subagent A returns `{ confidence: 0.9, packets: [...] }` and subagent B returns `{ confidence: 0.7, packets: [...] }`
- **THEN** merged result contains packets from both, sorted by confidence descending
- **AND** metadata (title, summary) comes from subagent A (highest confidence)
- **AND** merge order is stable (same inputs always produce same output)

#### Scenario: Merge with partial failures
- **WHEN** subagent A succeeds with `{ confidence: 0.8 }` and subagent B fails with exception
- **THEN** merged result contains only subagent A's data
- **AND** error is logged but doesn't prevent merge completion
- **AND** dispatcher returns valid response with partial data

### Requirement: Context isolation during parallel execution
The system SHALL ensure that concurrent subagent executions do NOT mutate shared state (no race conditions on Postgres queries, Redis cache, gRPC client handles).

#### Scenario: Two subagents reading same Postgres table
- **WHEN** subagent A queries Postgres for packets with `source_ref = 'auth'`
- **AND** subagent B queries Postgres for packets with `source_ref = 'cache'`
- **THEN** both queries execute in parallel without blocking
- **AND** neither query result is corrupted or mixed with the other
- **AND** Postgres connection pool handles concurrent requests safely

#### Scenario: Two subagents writing to Redis with different keys
- **WHEN** subagent A writes to Redis key `telemetry:a:{timestamp}`
- **AND** subagent B writes to Redis key `telemetry:b:{timestamp}` simultaneously
- **THEN** both writes succeed
- **AND** neither key's value is corrupted or mixed with the other
- **AND** no deadlock or connection exhaustion occurs

### Requirement: Subagent timeout protection
The system SHALL enforce a maximum execution time per subagent invocation to prevent indefinite hangs.

#### Scenario: Subagent exceeds timeout
- **WHEN** subagent A takes longer than 30 seconds to complete
- **THEN** `Promise.allSettled()` timeout fires
- **AND** subagent A is marked as failed with `{ status: 'timeout', error: 'timeout exceeded' }`
- **AND** other subagents continue and merge results from successes

#### Scenario: All subagents complete within timeout
- **WHEN** subagent A completes in 2s and subagent B in 5s (both < 30s timeout)
- **THEN** parent receives both results after 5s (max of the two)
- **AND** no timeout error is raised

