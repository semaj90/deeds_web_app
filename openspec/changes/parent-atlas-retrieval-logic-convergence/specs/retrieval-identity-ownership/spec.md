# Retrieval identity ownership

## MODIFIED Requirements

### Requirement: Canonical document identity remains PostgreSQL-owned

The retrieval system MUST use PostgreSQL packet, source, chunk, and workspace
lineage as the canonical document identity. Retrieval executors and derived
algorithms MUST preserve that identity when returning candidates and MUST NOT
mint a replacement canonical document identity from a Qdrant point ID,
candidate ordinal, graph ordinal, cache key, score, or vector position.

#### Scenario: Projection coordinates remain non-canonical

- **GIVEN** a retrieval result contains a Qdrant point ID, candidate ordinal,
  graph ordinal, or cache key
- **WHEN** the result is normalized for downstream fusion or context assembly
- **THEN** the result retains PostgreSQL-owned packet/source identity metadata
- **AND** the projection coordinate is labeled as executor-local or derived
- **AND** no canonical identity or promotion authority is created

#### Scenario: Missing canonical identity fails closed

- **GIVEN** a retrieval result lacks the required packet/source identity
- **WHEN** it reaches identity normalization
- **THEN** the result is marked unavailable or review-required
- **AND** it is not promoted as a canonical document
- **AND** no database, vector-store, cache, or graph write is performed
