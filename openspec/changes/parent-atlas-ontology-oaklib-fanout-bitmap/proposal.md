## Why

A same-day audit (`openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md`,
"Ontology / OAKLIB audit" section, 2026-09-15) found that this repo has no real ontology
resolution layer: the described OAKLIB (CURIE/synonym/parent-class resolution) and its `:8095`
sidecar do not exist anywhere. The live ontology data path — `feature_ontology_tuples`
(539,124 rows) — currently has its extractor invent concept labels directly (e.g.
`object_id: "concept:fn-call"`), with no resolution against a controlled vocabulary. A
well-designed, well-tested contract for grounded tuples already exists
(`OntologyLinkedTupleV1`) but its backing table has zero rows — dormant, not the live path.
Separately, the operator wants the corpus's `.okf` schema conventions mapped onto real
PostgreSQL 18 structures, including a fanout-optimized table/index design that benefits from
PG18's native asynchronous I/O (AIO) subsystem for bitmap-scan-heavy concept-to-evidence fanout
queries at the current and growing corpus scale (500K+ tuples).

## What Changes

- Stand up a real ontology-resolution boundary (OAKLIB or an equivalent CURIE/synonym/
  ancestor-lookup layer) that resolves raw surface labels to stable canonical concept IDs with
  real parent/ancestor relationships — replacing the current classifier-invents-concepts
  pattern.
- Grow the existing `atlas_domain_ontology` `is_a` hierarchy (7 seed rows) as the canonical
  concept vocabulary root, rather than introducing a competing vocabulary table.
- Define an explicit, justified bridging strategy for `feature_ontology_tuples`' 539,124
  existing rows (backfill-and-reconcile vs. forward-only cutover) so new ontology-grounded
  evidence flows through OAKLIB resolution before promotion.
- Extend `docs/.okf/schema.yaml`'s existing conventions (not a parallel schema) to cover the
  ontology concept vocabulary, relation edges, and `OntologyLinkedTupleV1`-shaped evidence.
- Design a PostgreSQL-18-native, bitmap-scan-optimized fanout structure (index set and/or
  materialized view — not a from-scratch data structure) for one-concept-to-many-evidence
  queries, sized to benefit from PG18's AIO subsystem, sitting entirely behind the existing
  `OntologyFanoutAuthorityV1` admission gate.
- Explicitly flag six empty, ontology-shaped tables (`atlas_concepts`, `concept_records`,
  `registry_ontology_tuples`, `atlas_ontology_concepts`, `atlas_ontology_relations`,
  `atlas_ontology_tuples`) as consolidation/archival candidates rather than adding a seventh.
- **BREAKING** (deferred to Phase 2, gated behind explicit review): any reconciliation of
  `feature_ontology_tuples`' existing concept labels changes what those 539K rows mean
  downstream — no consumer should assume today's raw labels are stable across this change.

## Capabilities

### New Capabilities
- `ontology-resolution-boundary`: The OAKLIB-equivalent CURIE/synonym/ancestor resolution
  service/library and its API contract — resolves raw labels to canonical concept IDs, never
  mints packet/source/workspace/graph identity.
- `ontology-fanout-storage`: The PostgreSQL-18-native bitmap-scan-optimized physical layer
  (indexes/materialized view) for concept-to-evidence fanout queries, gated behind the existing
  `OntologyFanoutAuthorityV1` admission contract.

### Modified Capabilities
- (none yet — `feature_ontology_tuples`' bridging strategy is a Phase 2 design decision within
  this same change, not a separate capability; no other existing spec's requirements change)

## Impact

- **Read-only today, real writes only in later phases behind explicit gates**: this proposal
  step makes no code or schema changes.
- Affected (future) code: `sveltekit-frontend/src/lib/server/atlas/contracts/ontology-linked-
  tuple-v1.ts`, `ontology-fanout-authority-v1.ts`, `ontology-linked-tuple-postgres.ts`,
  `pos-concept-tagging-lane.ts`, `taxonomy-candidate-producer-v1.ts`, and whichever extractor
  currently writes `feature_ontology_tuples` (`atlas-packets-ontology-v1`).
- Affected (future) data: `feature_ontology_tuples` (539,124 rows), `atlas_domain_ontology`
  (7 rows, to grow), `atlas_ontology_linked_tuples` (0 rows, dormant), the six empty tables
  listed above (candidates for archival, not deletion, per this repo's archive-not-delete rule).
- Affected docs: `docs/.okf/schema.yaml` (extended, not replaced).
- No production migration, backfill, or new dependency install happens as part of this
  proposal/design step — those are explicitly deferred to their own gated tasks.
