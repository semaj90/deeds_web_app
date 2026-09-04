# Parent Atlas Feature Evidence Graph — Requirements

## Purpose

Define revision-qualified evidence relationships for Parent Atlas feature and graph analysis.

## Requirements

### Requirement: Feature evidence is many-to-many

The system SHALL represent feature state through explicit evidence relations rather than a single inferred label.

A feature MAY have many requirements, artifacts, routes, tables, symbols, package capabilities, tests and runtime observations.

An evidence item MAY support more than one feature.

---

### Requirement: Typed evidence edges

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

## Requirement: Relationship degree means semantic arity

Atlas SHALL define `relationship_degree` as the number of distinct participating entity types in one semantic relationship fact.

`relationship_degree` SHALL NOT mean:

- number of database attributes;
- number of rows/records;
- number of participants/roles when several participants have the same entity type;
- graph node degree / number of incident graph edges;
- PageRank, fanout, traversal frequency or relation count.

The canonical degree classes SHALL be:

- degree 1 → `unary`
- degree 2 → `binary`
- degree 3 → `ternary`
- degree 4+ → `nary`

### Scenario: Recursive feature dependency

Given `Feature A DEPENDS_ON Feature B`,
when Atlas materializes the relationship,
then the relationship SHALL have two participants but degree 1 because only the `feature` entity type participates.

### Scenario: Feature uses route

Given one `Feature` is implemented through one `Route`,
when Atlas materializes the relationship,
then the relationship SHALL have degree 2 (`binary`).

### Scenario: Authenticated table-backed route

Given a `Route` is guarded by a `Policy` and accesses a `Table`,
when Atlas materializes that semantic fact,
then the relationship SHALL have degree 3 (`ternary`).

---

## Requirement: Participant count is explicit and distinct

Atlas SHOULD record `participant_count` separately from `relationship_degree`.

`participant_count` SHALL equal the number of concrete participants/roles in the fact.

`relationship_degree` SHALL equal the number of distinct `entity_type` values across those participants.

This distinction SHALL allow recursive unary facts to preserve multiple roles such as `parent` and `child`, `caller` and `callee`, or `supervisor` and `subordinate` while remaining degree 1.

---

## Requirement: Cardinality is orthogonal to degree

Atlas SHALL represent relationship cardinality separately from relationship degree.

Examples include `1:1`, `1:N`, `N:1`, and `M:N`, or role-specific minimum/maximum constraints.

A binary relationship MAY therefore be one-to-one, one-to-many or many-to-many without changing its degree.

---

## Requirement: N-ary relations

When a fact depends on three or more participating entity types, the system SHOULD preserve it as a relation/hyperedge rather than flattening it into unrelated pairwise edges.

Pairwise graph edges MAY be generated as traversal projections, but they SHALL reference the canonical relationship/hyperedge ID so the original semantic fact can be reconstructed.

### Scenario: Authenticated route backed by owned table

Given a feature, route, auth guard, table and ownership column jointly establish one access-control fact,
when evidence is materialized,
then Atlas SHOULD preserve the feature + route + guard + table + ownership-column relation as one canonical N-ary evidence group with typed member roles.

A Neo4j/NetworkX/cuGraph projection MAY derive pairwise traversal edges from this group, but those edges SHALL NOT replace the canonical N-ary relation.

---

## Requirement: Relationship participant contract

Each canonical relationship participant SHALL contain at least:

- `role`
- `entity_type`
- `entity_id`
- optional `entity_revision`
- optional `source_ref`

Each canonical relationship SHALL contain at least:

- `relationship_id`
- `relationship_type`
- `participants[]`
- `participant_count`
- `relationship_degree`
- `relationship_degree_kind`
- `cardinality[]`
- `source_ref`
- `source_revision`
- `relationship_revision`
- `evidence_refs[]`
- `confidence`
- `producer_revision`

---

## Requirement: Evidence lineage

Every materialized `FeatureEvidenceV1` SHALL contain enough lineage to recover its producer, source revision and original evidence location.

---

## Requirement: Evidence confidence

Evidence confidence SHALL describe confidence in the evidence interpretation, not feature completion.

---

## Requirement: Projection parity

Postgres SHALL retain canonical evidence and relationship identity.

Neo4j/NetworkX/cuGraph MAY project typed edges for traversal and ranking.

Qdrant MAY project evidence text/vectors for retrieval.

Projection-specific IDs SHALL map back to canonical evidence/relationship IDs.

---

## Requirement: Graph rank is descriptive

PageRank, HITS, fanout, community membership, graph degree and traversal frequency MAY annotate features/evidence.

These values SHALL NOT independently assert implementation or verification status and SHALL NOT be confused with relationship degree.
