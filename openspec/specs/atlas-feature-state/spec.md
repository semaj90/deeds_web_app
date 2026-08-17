# Parent Atlas Feature State — Requirements

## Requirement: Completion is evidence-derived

The system SHALL compute feature completion from configured acceptance evidence.

Topology, similarity, centrality, cluster membership, model confidence and document claims SHALL NOT independently mark a feature complete.

---

## Requirement: Separate completion and confidence

`completion` SHALL represent satisfied acceptance criteria on a 0–100 scale.

`confidence` SHALL represent confidence that the computed state reflects current repository/runtime reality.

They SHALL be stored and displayed separately.

---

## Requirement: Feature state vocabulary

The canonical state machine SHALL support at least:

- `EVIDENCE_NEEDED`
- `MISSING`
- `SPECIFIED`
- `IMPLEMENTING`
- `VERIFY`
- `VERIFIED`

---

## Requirement: Evidence rubric

Each feature SHOULD define weighted acceptance dimensions such as:

- specification present
- canonical implementation owner resolved
- data/schema dependency present
- authorization/policy evidence present when applicable
- tests present
- tests passing
- runtime evidence present when applicable
- projection/index parity proven when applicable
- replay/receipt present when applicable

The exact rubric MAY vary by feature class.

---

## Requirement: Priority is distinct from completion

Priority MAY combine normalized signals including PageRank, fanout, blocker count, user criticality, regression risk, uncertainty and recency.

Priority SHALL NOT be used as a substitute for completion.

---

## Requirement: Revisioned state receipt

Every state computation SHALL emit a revision-qualified receipt containing:

- `feature_id`
- `feature_revision`
- `evidence_snapshot_revision`
- `completion`
- `confidence`
- `state`
- `blocking_evidence[]`
- `satisfied_evidence[]`
- `priority_signals`
- `producer_revision`

---

## Requirement: Staleness

When source, schema, dependency, test or runtime revisions used by a state receipt change, Atlas SHALL mark the affected state stale until recomputed.
