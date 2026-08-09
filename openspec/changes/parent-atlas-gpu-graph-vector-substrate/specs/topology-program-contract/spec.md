## ADDED Requirements

### Requirement: Agentic error fixing uses typed, bounded topology programs, not raw graph access
The system SHALL expose graph traversal to agentic error-fixing tools only through
named, bounded "topology programs" (`ERROR_REPAIR`, `TEST_IMPACT`,
`DEPENDENCY_REPAIR`), each specifying a seed, a named projection, an explicit edge
type allow-list, and a maximum depth. The system SHALL NOT expose unbounded Cypher
or raw graph read access to an LLM agent for repair/impact-analysis purposes.

#### Scenario: An agent needs to localize a failing symbol's blast radius
- **WHEN** an agentic repair loop needs to find what a failing symbol calls,
  references, or returns
- **THEN** the system SHALL execute the `ERROR_REPAIR` program (projection
  `atlas_execution_v1`, edges `CALLS | REFERENCES | RETURNS`, depth <= 3) and SHALL
  reject any request specifying a depth greater than 3

#### Scenario: An agent needs to find tests impacted by a changed symbol
- **WHEN** an agentic loop needs to determine which tests cover a changed symbol
- **THEN** the system SHALL execute the `TEST_IMPACT` program (projection
  `atlas_test_v1`, edges `TEST_COVERS_FILE | IMPORTS | CALLS`, depth <= 3)

#### Scenario: An agent needs to trace a missing or broken dependency
- **WHEN** an agentic loop needs to trace what imports, requires, implements, or
  extends a missing/broken symbol
- **THEN** the system SHALL execute the `DEPENDENCY_REPAIR` program (projection
  `atlas_dependency_v1`, edges `IMPORTS | REQUIRES | IMPLEMENTS | EXTENDS`,
  depth <= 3)

### Requirement: Topology programs return real distances and predecessors regardless of backend
The system SHALL route small/shallow topology-program requests through Neo4j APOC
bounded expansion (query-time) and larger/heavier requests through the cuGraph
BFS/SSSP sidecar, and SHALL return the same distance/predecessor response shape from
either backend so callers do not need backend-specific handling.

#### Scenario: A topology program request exceeds APOC's practical bound
- **WHEN** a topology program's seed set or expected result size is large enough
  that query-time APOC expansion would be a poor fit
- **THEN** the system SHALL route the request to the cuGraph BFS/SSSP sidecar
  endpoint instead, and SHALL return real (not approximated) distances and
  predecessors

### Requirement: The atlas_test_v1 projection exists for TEST_IMPACT
The system SHALL add `atlas_test_v1` (edges: `TEST_COVERS_FILE`, `IMPORTS`, `CALLS`)
to `graph-projection-manifest.ts`'s `NAMED_PROJECTION_CANDIDATES`, alongside the
existing `atlas_dependency_v1`/`atlas_execution_v1`/`atlas_feature_v1`/
`atlas_combined_v1`.

#### Scenario: TEST_IMPACT is executed before atlas_test_v1 exists
- **WHEN** the `TEST_IMPACT` topology program is invoked
- **THEN** the system SHALL require `atlas_test_v1` to be a registered named
  projection and SHALL fail closed (not silently substitute a different projection)
  if it is not yet defined
