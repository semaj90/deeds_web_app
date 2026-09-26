## Context

`feature_ontology_tuples` (539,124 rows) is the only real, populated ontology-shaped store in
this repo. Its concept labels (`object_id: "concept:fn-call"`, etc.) are extractor-invented, not
resolved against any controlled vocabulary — the extractor (`atlas-packets-ontology-v1`) is
currently acting as the ontology, which is the exact anti-pattern the operator flagged. A real,
well-tested contract for grounded evidence already exists (`OntologyLinkedTupleV1`, n-ary via
`participants[]`) with a real writer and 10+ consumers, but its table (`atlas_ontology_linked_
tuples`) has zero rows — it has never been the live path. A real admission gate
(`OntologyFanoutAuthorityV1`) already exists to promote grounded tuples downstream, fail-closed
on revision/evidence completeness. `atlas_domain_ontology` (7 rows) is a real, tiny `is_a`
hierarchy, unchanged since 2026-06-29, disconnected from the live tuple store. Six more
ontology-shaped tables exist and are completely empty. `docs/.okf/schema.yaml` is a repo-local
(not external-spec) convention already declaring a `fabric_registry` with required-join fields
and a `semantic_vector` block — the ontology work should extend this, not create a parallel file.

## Goals / Non-Goals

**Goals:**
- Stand up one real ontology-resolution boundary that resolves raw surface labels to stable
  concept IDs with real parent/ancestor relationships, and never mints packet/source/workspace/
  graph identity.
- Grow (not replace) `atlas_domain_ontology` as the concept vocabulary root.
- Pick and justify one bridging strategy for `feature_ontology_tuples`' 539K existing rows.
- Extend `docs/.okf/schema.yaml`'s existing conventions to cover concept vocabulary/relations/
  `OntologyLinkedTupleV1` evidence.
- Design a PostgreSQL-18-native, bitmap-scan-optimized fanout layer for one-concept-to-many-
  evidence queries at current (500K+) and growing scale, reusing Postgres's own bitmap index/
  heap-scan machinery (multiple indexes combined via `BitmapAnd`/`BitmapOr`), sized to benefit
  from PG18's AIO subsystem — not a custom bitmap data structure.
- Flag the six empty ontology-shaped tables for consolidation/archival.

**Non-Goals:**
- Not building a full OWL/SHACL reasoner or adopting a specific external ontology standard in
  this phase — a working CURIE/synonym/ancestor resolution API is the bar, not formal
  description-logic inference.
- Not deleting any existing table — this repo's archive-not-delete convention applies.
- Not touching `ontology_edges` (packet-similarity, unrelated to concept ontology despite the
  name) — explicitly out of scope, do not conflate.
- Not fabricating exact PostgreSQL 18 AIO GUC names/syntax from memory — implementation must
  verify `io_method`/`io_combine_limit`/related settings against the installed PG18.4 docs
  before writing any DDL or config change; this design states architectural intent only.
- Not applying any migration, backfill, or package install as part of this proposal/design step.

## Decisions

**D1 — Resolution boundary is a library/service, not a rewrite of the extractor.**
OAKLIB (or an equivalent) sits between raw extraction and tuple promotion: extractor emits a raw
label + evidence span (unchanged), the resolution boundary maps that label to a canonical
concept ID + ancestors, and only the resolved result is eligible for `OntologyFanoutAuthorityV1`
promotion. Alternative considered: teach the extractor itself to resolve concepts inline —
rejected, because it would re-couple classification and ontology truth, the exact anti-pattern
this proposal exists to remove (mirrors this repo's existing NLP-classifier-vs-ontology
separation already stated in CLAUDE.md).

**D2 — `feature_ontology_tuples` bridging: forward-only cutover, not a mass backfill-and-
reconcile of 539K rows.** Existing rows stay as-is, explicitly labeled legacy/unresolved (a new
nullable `resolved_concept_id`/`resolution_state` column pair, additive only). New rows written
after the resolution boundary exists are required to carry a resolved concept ID before
promotion. Alternative considered: backfill-reconcile all 539K existing rows against the new
resolver — rejected for this phase because it requires the resolver's vocabulary to already
cover every concept label ever emitted historically, an unbounded and unverifiable claim to make
up front; a forward-only cutover lets the vocabulary grow incrementally against real new
evidence instead of forcing premature completeness. Revisit backfill as an explicit, separately-
authorized Phase 2b once the resolver has real production mileage.

**D3 — Fanout storage: indexes + a materialized view over `feature_ontology_tuples` filtered to
`resolution_state = 'RESOLVED'`, not a new physical table.** The existing table already carries
the required join keys (`packet_key`, `source_ref`, `subject_id`, `object_id`) at the needed
scale; a materialized view narrows to grounded rows only, with GIN/btree indexes on
`resolved_concept_id`, `subject_id`, and `packet_key` so a concept-to-evidence fanout query
resolves via Postgres's own bitmap index scan → bitmap heap scan path (`BitmapAnd` across the
narrowed view's indexes) rather than a sequential scan. Alternative considered: a dedicated new
`ontology_concept_fanout` table populated by a separate writer — rejected under Duplication
Prevention (this repo already has six unused, similarly-named tables; a seventh new table is the
wrong reflex when an index/materialized-view layer over an existing, populated table satisfies
the same query shape with less write-path duplication). PG18's AIO subsystem benefits this
design because it accelerates exactly the bitmap-heap-scan I/O pattern this view/index
combination produces at 500K+ row scale — exact GUC tuning left as an implementation-time
verification task, not specified here.

**D4 — `.okf` schema extension, not a new file.** Add an `ontology` block to `docs/.okf/
schema.yaml` alongside the existing `fabric_registry`, referencing `resolved_concept_id`/
`ontology_revision` the same way `fabric_registry` already references `packet_key`/
`source_revision` — declared, not enforced by this file (matches its own stated
`canonical_authority: false` convention).

## Risks / Trade-offs

- **[`OntologyFanoutAuthorityV1` admission is never persisted anywhere — found live while
  drafting Phase 3, 2026-09-15]** `evaluateOntologyFanoutAuthorityV1()` (`ontology-fanout-
  authority-v1.ts`) has zero production callers (confirmed via `grep` — only its own `.spec.ts`
  calls it); no table anywhere records an admission decision. This means Phase 3's fanout view
  can only filter on `resolution_state = 'RESOLVED'` (Phase 2), which is necessary but NOT
  sufficient to satisfy spec.md's "No bypass of admission gate" requirement — there is currently
  nothing to bypass because the gate was never wired to persist a result. → Mitigation: recorded
  explicitly in the migration file's own header comment rather than silently treating
  `resolution_state = 'RESOLVED'` as if it were admission-equivalent; real admission-gated
  filtering requires a separate, later piece of work (wire `evaluateOntologyFanoutAuthorityV1`
  to a real caller that persists its verdict) before this view can honestly claim spec
  compliance on that specific requirement.

- [Resolver vocabulary starts small (7 seed concepts) and most new evidence may initially fail
  to resolve] → Mitigation: `resolution_state` explicitly includes an `UNRESOLVED` state (not a
  hard failure) so unresolved evidence keeps flowing through existing consumers unchanged while
  the vocabulary grows; nothing blocks on 100% resolution coverage.
- [Materialized view staleness — fanout queries could read against a stale snapshot] → 
  Mitigation: refresh policy is an explicit task (Task list), not implied; state the refresh
  cadence and its staleness bound before promoting this to any latency-sensitive caller.
- [PG18 AIO settings are host/OS-dependent (io_uring on Linux, worker-based elsewhere) and this
  dev host is Windows] → Mitigation: design explicitly treats exact AIO configuration as an
  implementation-time verification step against the actual running PG18.4 instance, not assumed
  from documentation alone.
- [Six empty ontology tables might have hidden future callers not yet built] → Mitigation:
  archive (per this repo's archive-not-delete rule), never drop, and record the archival manifest
  entry so any future reference is recoverable.

## Migration Plan

1. Phase 1 (resolution boundary): new library/service, additive `atlas_domain_ontology` growth
   (new rows only, existing 7 untouched), no changes to `feature_ontology_tuples`.
2. Phase 2 (bridging): additive nullable columns on `feature_ontology_tuples`
   (`resolved_concept_id`, `resolution_state`), drafted migration reviewed manually per Drizzle
   Safety Rule, dry-run proof before apply, existing rows untouched (default `UNRESOLVED`).
3. Phase 3 (fanout storage): new materialized view + indexes, drafted migration, dry-run proof,
   refresh-cadence decision recorded before any consumer depends on it.
4. Rollback at every phase: additive-only changes (new columns default-null, new view/indexes)
   can be dropped without touching `feature_ontology_tuples`' existing rows or any other
   consumer's behavior.

## Resolved consideration: would a precomputed LUT (lookup table) beat the materialized-view + bitmap-index design?

Raised directly by the operator during implementation (2026-09-15) — answered with real measurements
against this table's actual current data, not speculation:

**What a LUT would mean here**: one row per `resolved_concept_id`, holding a precomputed array of
`packet_key`/`subject_id`/`tuple_id` references (an inverted-index rollup), refreshed periodically —
turning an N-row fanout into a single-row fetch + array deserialize.

**Real measurement (proxy, since `resolved_concept_id` has zero populated rows yet)**: `EXPLAIN
(ANALYZE, BUFFERS)` on `feature_ontology_tuples` filtered by a real high-fanout label
(`object_id = 'concept:sveltekit'`, 14,171 of 539,124 rows) already produces a native
`Bitmap Index Scan -> Bitmap Heap Scan` via the existing `feature_ontology_tuples_object_idx`:
**295ms cold-cache, 29.5ms warm-cache** (10x, once Postgres's own buffer cache is warm). This
confirms Postgres's native bitmap-scan path already behaves like an inverted index/LUT at this
table's real scale and cardinality — a GIN/btree index IS a lookup table, just one Postgres already
maintains transactionally, with no separate refresh/staleness concern.

**Decision: do not build a separate LUT table now.** A hand-rolled LUT only wins over the native
bitmap scan when (a) a specific concept's fanout is large enough that even a warm-cache bitmap heap
scan is too slow for its caller's latency budget, AND (b) that concept is queried frequently enough
to justify a second data structure's refresh/staleness overhead. Neither condition is measurable yet
— `resolved_concept_id` has zero real rows (Phase 2 has no live writer producing new,
resolver-annotated tuples today). Building a LUT speculatively, with no caller and no fanout data to
size it against, repeats this exact repo's own documented failure mode (Duplication Prevention: 6
already-dead ontology-shaped tables built ahead of real need). If real resolved data eventually shows
a specific concept with very high fanout AND a latency-sensitive caller, revisit this as a targeted,
evidence-backed addition — not a redesign of Phase 3's materialized view, which stays either way.

## Open Questions

- Exact OAKLIB implementation choice: real `oaklib` Python package via a small FastAPI sidecar
  (closest to the originally-described `:8095` design) vs. a lighter TypeScript-native resolver —
  not decided here; Phase 1's own tasks should include this as an explicit pick.
- Materialized view refresh cadence (on-demand vs. scheduled) — not decided here.
- Whether Phase 2b (retroactive backfill of the 539K legacy rows) ever happens, and under what
  vocabulary-coverage threshold — explicitly deferred, not scheduled by this design.
