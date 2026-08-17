# Parent Atlas Feature Evidence Graph — Requirements

## Requirement: Feature evidence is many-to-many

The system SHALL represent feature state through explicit evidence relations rather than a single inferred label.

A feature MAY have many requirements, artifacts, routes, tables, symbols, package capabilities, tests and runtime observations.

An evidence item MAY support more than one feature.

---

## Requirement: Typed evidence edges

Feature evidence edges SHALL include a relation type and revision-qualified source reference.

Recommended relations include:

- `SPECIFIES`
- `IMPLEMENTS`
- `USES_TABLE`
- `USES_COLUMN`
- `USES_PACKAGE`
- `EXPOSES_ROUTE`
- `AUTH_GUARDS`
- `TESTS`
- `CALLS`
- `DEPENDS_ON`
- `OBSERVED_AT_RUNTIME`
- `VALIDATES`
- `BLOCKS`

---

## Requirement: N-ary relations

When a fact depends on three or more participants, the system SHOULD preserve it as a relation/hyperedge rather than flattening it into unrelated pairwise edges.

### Scenario: Authenticated route backed by table

Given a route requires an auth guard and reads a user-owned table,
when evidence is materialized,
then Atlas SHOULD preserve the route + guard + table + ownership-policy relation as one evidence group with member references.

---

## Requirement: Evidence lineage

Every materialized `FeatureEvidenceV1` SHALL contain enough lineage to recover its producer, source revision and original evidence location.

---

## Requirement: Evidence confidence

Evidence confidence SHALL describe confidence in the evidence interpretation, not feature completion.

---

## Requirement: Projection parity

Postgres SHALL retain canonical evidence identity.

Neo4j/NetworkX/cuGraph MAY project typed edges for traversal and ranking.

Qdrant MAY project evidence text/vectors for retrieval.

Projection-specific IDs SHALL map back to canonical evidence IDs.

---

## Requirement: Graph rank is descriptive

PageRank, HITS, fanout, community membership and traversal frequency MAY annotate features/evidence.

These values SHALL NOT independently assert implementation or verification status.
