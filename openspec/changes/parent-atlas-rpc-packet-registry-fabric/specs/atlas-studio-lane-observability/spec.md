## ADDED Requirements

### Requirement: Read-only Parent Atlas Studio
The Parent Atlas Studio page SHALL display registry identity, lane health,
projection parity, active revisions, and proof receipts through read-only
SvelteKit server/tRPC adapters.

#### Scenario: GPU development mode starts
- **WHEN** `npm run dev:gpu` starts with optional GPU services unavailable
- **THEN** Studio loads with explicit degraded lane status and does not require
  GPU, Qdrant, Redis, or Neo4j for startup

#### Scenario: Operator views a mirrored collection
- **WHEN** an operator selects a Qdrant collection or tag
- **THEN** Studio shows its canonical packet join, collection/index revisions,
  parity status, and write policy without performing a mutation

### Requirement: Stable failure shape
Studio APIs SHALL return stable JSON shapes with empty defaults and explicit
unavailable/degraded status when a registry or executor is unreachable.

#### Scenario: Registry is unavailable
- **WHEN** PostgreSQL or a registry adapter cannot be reached
- **THEN** the page receives a stable response with no fabricated counts,
  revisions, identities, or health claims
