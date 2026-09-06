# Candidate feature execution governance

## ADDED Requirements

### Requirement: Candidate features share one admitted population
Candidate feature materialization MUST use one revision-qualified candidate population and checksum across semantic, structural, graph, domain, and ranking features.

#### Scenario: A feature row is materialized
- **WHEN** a feature is attached to a candidate
- **THEN** the row carries the candidate identity, population or ordinal-map checksum, feature revision, and producer evidence.

#### Scenario: A feature population is not admitted
- **WHEN** candidate identity or source revision qualification is incomplete
- **THEN** feature execution remains diagnostic and cannot promote ranking, cache, or graph identity.
