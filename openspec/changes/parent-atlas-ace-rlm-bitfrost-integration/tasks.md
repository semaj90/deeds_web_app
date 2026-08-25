# Parent Atlas ACE/RLM/BitFrost bounded integration

This change reuses existing owners. It does not create a second SearchRuntime,
RRF implementation, vector store, identity resolver, or ContextManifest owner.

- [x] AR-01 audit existing SearchRuntime, ContextManifest, ACE, receipt, and
  Valkey/BitFrost owners.
- [x] AR-02 define bounded `RlmEnvironment`, `RlmBudget`, and `RlmTrace` types.
- [x] AR-03 delegate RLM search through the existing SearchRuntime adapter.
- [x] BF-01 add revision-qualified BitFrost retrieval keys.
- [x] BF-02 add fail-open cached SearchRuntime adapter behavior.
- [x] AR-04 add bounded packet/source/graph/process inspection tools.
- [x] AR-05 enforce recursive budget and duplicate-subproblem guards.
- [x] AR-06 preserve canonical IDs through injected owner inspection interfaces.
- [x] AR-07 emit deterministic observable RLM runtime receipts.
- [x] BF-03 probe Valkey `CLIENT TRACKING` with scoped BitFrost prefixes;
  live invalidation delivery remains a separate proof gate.
- [x] BF-04 add revision-safe negative eligibility cache contract.
- [x] BF-05 add revision-qualified future CAGRA filter cache key contract.
- [x] BF-06 add fail-open expiry/eviction/cache-miss envelope behavior.
- [x] CM-01 compile observable RLM trace metadata into the existing ContextManifest;
  no hidden reasoning is persisted and manifest identity remains deterministic.
- [x] ACE-01 audit execution-review, ContextManifest outcome joins, and
  recommendation-policy receipt owners.
- [x] ACE-02 add a pure execution-feedback bridge preserving manifest and
  selected-packet identity; persistence remains an approved curator step.
- [ ] SIMD-01 run PERF0 before any simdjson implementation.

Fixture proof: `npm run atlas:rlm:environment:proof` writes
`docs/reports/rlm-environment-proof.{json,md}`. The current status is explicitly
`PROVEN_BOUNDED_FIXTURE`; live Neo4j/Postgres/ACE persistence remains open.

BF-04..06 are focused-proven contracts. BF-03 remains opt-in until a dedicated
RESP3 Valkey tracking connection is validated live; startup does not enable it.

Acceptance for this first slice:

`RLM_SEARCH_USES_SEARCHRUNTIME`, `BITFROST_REVISION_KEYS`,
`BITFROST_FAIL_OPEN`, and `BITFROST_STALE_REJECT` must be proven without
changing canonical retrieval, identity, RRF, or GPU promotion semantics.

## Alignment notes (2026-08-24) — external RLM/ACE/KAG critique vs live code

An external architectural review (not written against this repo's actual
source) proposed three RLM gaps and two KAG gaps. Checked directly against
`sveltekit-frontend/src/lib/server/atlas/rlm/rlm-runtime.ts` and
`.../contracts/ontology-linked-tuple-v1.ts` before acting on any of it:

- **RLM-1/2/3 (bounded environment, maxDepth, no-fail-open-to-accept) — already
  addressed, not a gap.** `rlm-runtime.ts::search()` returns `null` and sets
  `status:'FAILED', failureCode:'RLM_PROGRAM_FAILED'` on a thrown error (line
  ~84) — it never falls back to silently accepting a candidate.
  `recurse()` checks `depth > options.budget.maxDepth` and returns `null`
  with `status:'BUDGET_EXHAUSTED'` before recursing (line ~94). AR-02/AR-05/AR-07
  above already cover this; no new task needed. The external doc's proposed
  `RlmEnvironmentV1.permittedOperations` allowlist is effectively already
  enforced by the `allow(kind)` gate wrapping every `inspect*`/`recurse`/`search`
  call — worth renaming/documenting explicitly if it's ever audited from
  outside, but not a functional gap.

- **ACE-1 (ContextManifest still v1, not revision-qualified) — real, open.**
  `context-manifest-traversal-adapter-v1.ts` confirms the live manifest is
  still `schema: 'atlas.context-manifest.v1'` (`graph-runtime-contracts.ts`),
  identified by `candidateCount` + a single optional `graphRevision`, not the
  full evidence-revision set (`sourceRevision`, `representationRevision`,
  `featureRevision`, `ontologyRevision`, `modelRevision`, prompt-template
  revision) that `OntologyLinkedTupleV1` and the NE-prefill contracts already
  carry. Tracked as new task **CM-02** below — do not implement without a
  fresh dry-run/live-apply proof cycle per this repo's own discipline.

- **KAG-1/2 (dual KAG generations, no mutual index) — partially addressed,
  partially open.** `OntologyLinkedTupleV1` is real and has 3 live non-test
  consumers (`feature-doc-enrichment.ts`, `ontology-linked-tuple-cache.ts`,
  `pos-concept-tagging-lane.ts`) — the "newer, stronger contract" the external
  doc describes already exists and is wired, it is not a proposal. The legacy
  `KAGNode`/`KAGEdge` shape in `src/lib/server/types/kag.ts` still exists
  uncoordinated alongside it — no projection adapter or retirement has
  happened. Tracked as new task **KAG-01** below.

- [x] CM-02 `ContextManifestV2` identity implemented as a strict superset of
  `ContextManifestV1`
  (`sveltekit-frontend/src/lib/server/atlas/graph/context-manifest-v2.ts`):
  `buildContextManifestV2(v1, identityInput)` carries every V1 field through
  unchanged (`v2.v1 = v1`, no field recomputed/overwritten) and adds
  `identityChecksum` = `canonicalSha256V1(...)` over `selectedOrdinalSetChecksum
  + evidenceRevisions{sourceRevision,representationRevision,featureRevision,
  ontologyRevision,modelRevision,promptTemplateRevision} + ordinalMapChecksum
  + retrievalPolicyRevision + acePlaybookRevision` plus V1's own
  requestId/snapshotId/candidateBucket (so two V2s of the *same* revision set
  but different underlying V1 manifests never collide). Does not become a
  second manifest owner — no ranking, persistence, or candidate-selection
  logic added; it is purely a stronger identity computed from an existing V1
  manifest the caller already built. 5/5 vitest pass
  (`context-manifest-v2.spec.ts`): V1 fields pass through untouched;
  checksum deterministic (64-hex) for identical input; checksum changes when
  only `retrievalPolicyRevision` changes while V1 evidence stays untouched;
  checksum changes when V1's own `snapshotId` changes even with identical
  revision inputs (proves V1 identity isn't silently dropped from V2's
  checksum); all-null evidence revisions (no lane run yet) validate. No
  caller wired yet — this is the contract only; wiring a real
  `ContextManifestV1` producer to also emit V2 is a separate, not-yet-scoped
  follow-up.
- [x] KAG-01 (adapter built + unit-proven; legacy retirement NOT done — see
  KAG-01b) `KagProjectionAdapter`
  (`sveltekit-frontend/src/lib/server/atlas/integration/kag-projection-adapter-v1.ts`)
  derives `KAGNode[]`/`KAGEdge[]` from `OntologyLinkedTupleV1` (nodes) and
  `HyperedgeV1` (relations — corrected from the original plan's
  `HyperRelationV1`: `hyperedge-projection-adapters-v1.ts`'s own comment
  says "Compatibility view only. HyperedgeV1 remains the canonical n-ary
  truth", so `HyperedgeV1` is the real source, `HyperRelationV1` is itself
  already a legacy compat view). `projectOntologyTuplesToKagNodesV1` keys
  each node by `packetKey ?? sourceRef`, de-dupes by keeping the
  higher-confidence tuple, tags from `ontologyIds ∪ conceptIds`.
  `projectHyperedgesToKagEdgesV1` projects each n-ary hyperedge to a
  **star** (hub = lowest-ordinal participant → every other participant),
  not a clique, with weight `1/(participants.length-1)` so total edge
  weight per hyperedge sums to 1 regardless of fan-out — prevents wide
  n-ary relations from dominating a downstream PageRank pass purely by
  participant count. Unrecognized predicates map to `RELATED` rather than
  throwing. Pure functions, no I/O, no Neo4j write, no new fields added to
  the legacy `KAGNode`/`KAGEdge` shape. 8/8 vitest pass
  (`kag-projection-adapter-v1.spec.ts`): node projection + dedup-by-confidence
  + citation-participant classification + packetKey-absent fallback; edge
  star-not-clique shape + normalized weight + case-insensitive predicate
  mapping + unrecognized-predicate fallback.
- [x] KAG-01b (finding corrected, not a diff-proof — see below) Checked
  for a live `KAGNode`/`KAGEdge` producer to diff the new adapter against,
  per the original plan. **There isn't one.** `rg`-confirmed zero callers
  anywhere in `src/` for `KAGNode`/`KAGEdge`/`KAGExpansion`/
  `KAGRetrievalContext` outside `types/kag.ts` itself and the
  `types/index.ts` barrel re-export. The actual live Neo4j-querying class
  (`src/lib/server/retrieval/kag-expansion.ts::KAGExpander`) is a *different*
  shape entirely (`GraphNeighbor[]`, not `KAGNode`/`KAGEdge`) and **also**
  has zero callers anywhere in `src/` — confirmed dead independently of the
  legacy type. Recorded both as `DEAD` in
  `docs/architecture/runtime-ownership-baseline.json` under a new
  `kag_graph_expansion` capability entry (JSON validated parseable after
  edit), per this repo's own "record what you found, even when you don't
  fix it" governance rule. Net effect: KAG-01's adapter is not "an untested
  replacement for a live system" — it is the *only* thing in this
  capability with test coverage at all. No retirement action taken on
  `types/kag.ts` (archive-not-delete still applies; a status flag is a
  schema-shape decision for whoever owns that file, not made here).
- [x] KAG-02 explicit inverse mutual index implemented
  (`sveltekit-frontend/src/lib/server/atlas/integration/kag-mutual-index-v1.ts`
  ::`buildKagMutualIndexV1(tuples, hyperedges)`). Scoped down from the
  original plan's `treeNodeId`/`symbolVersionId`/"graph ordinal"/"semantic
  ordinal" axes to the two identity fields this repo's frozen identity
  contract actually guarantees (`packetKey ?? sourceRef`) — pulling in
  `CandidateOrdinal*` contracts (found live in `atlas/retrieval/`,
  `atlas/features/`, `atlas/graph/fanout-admission-v1.ts`) was deliberately
  out of scope here to avoid inventing a second ordinal-index owner; a wider
  index can extend this one later without redesigning it, since the map
  shape is additive. Four maps, both directions:
  `canonicalIdToTupleIds`/`tupleIdToCanonicalId` and
  `canonicalIdToHyperedgeIds`/`hyperedgeIdToCanonicalIds`. Pure, in-memory,
  deterministic — this is the shape a materializer would persist as a table
  or view, not the persistence itself (not yet scoped, matches KAG-01's
  adapter-first approach). 5/5 vitest pass (`kag-mutual-index-v1.spec.ts`):
  packetKey preferred over sourceRef; sourceRef fallback when packetKey
  absent; duplicate participants in one hyperedge de-duped; multiple
  hyperedges referencing the same canonical id accumulate without
  duplicates; empty-input safe.

Both KAG-01 and KAG-02 are pure, unit-tested projection/index builders with
zero I/O — no Postgres table, Neo4j write, or live materializer exists yet
for either. That live-wiring + the KAG-01b Neo4j-equivalence proof are the
next real gate before any legacy `types/kag.ts` retirement claim.

ACE must not become the ontology owner: ACE stays strategy/tactic/execution
lessons (`ContextManifest`, `RlmTrace`, execution-feedback bridge already in
this file); `OntologyLinkedTupleV1`/KAG stays curated semantic fact/relation
storage. Nothing above changes that boundary — CM-02 only strengthens
ACE's own manifest identity, it does not let ACE mint ontology facts.

## Review (2026-08-24) — combined test run + status

All three new files verified together in one `vitest run`, not just
individually (cross-file/import-graph regression check):
`context-manifest-v2.spec.ts` (5) + `kag-projection-adapter-v1.spec.ts` (8) +
`kag-mutual-index-v1.spec.ts` (5) = **18/18 passing**, run from
`sveltekit-frontend/`. No shared-state or mock leakage between them (each
constructs its own fixtures; none touch `pg.Pool`/Redis/Neo4j).

Files added this session, all pure/no-I/O, zero migrations, zero live
writes:
- `src/lib/server/atlas/graph/context-manifest-v2.ts` (+ spec)
- `src/lib/server/atlas/integration/kag-projection-adapter-v1.ts` (+ spec)
- `src/lib/server/atlas/integration/kag-mutual-index-v1.ts` (+ spec)

Task status in this file: AR-01..AR-07, BF-01..BF-06, CM-01, CM-02, ACE-01,
ACE-02, KAG-01, KAG-02 all `[x]`. Open: SIMD-01 (pre-existing, unrelated —
blocked on PERF0), KAG-01b (legacy `types/kag.ts` retirement — explicitly
not attempted).

### Indexes — none needed yet, precedent recorded for when persistence lands

Nothing added this session writes to Postgres, so no new index is required
right now. `buildKagMutualIndexV1`'s output shape (`canonicalId ->
tupleIds[]`, `canonicalId -> hyperedgeIds[]`, and both inverses) is exactly
what a GIN-indexed array column materializes well — this repo already has
the working precedent one migration away:
`sveltekit-frontend/drizzle/manual/20260819_atlas_observation_feature_rows.sql`
(this session's ORF-2 migration) indexes `ontology_classes`,
`ast_observation_kinds`, `langextract_classes`, and `flattened_tags` all as
`USING gin (...)` on `text[]` columns, plus plain B-tree on `source_ref`,
`tree_node_id`, and the KMeans/SOM/community routing columns. A future
`atlas_kag_mutual_index` materialization should follow the same shape:
B-tree on `canonical_id` (the join key everything else in this repo already
uses) + `tupleId`/`hyperedgeId`, GIN on `tuple_ids`/`hyperedge_ids` array
columns if a single row per canonical id stores them as arrays rather than
one row per (canonical_id, tuple_id) pair — that row-shape decision itself
is not yet made and should not be assumed here.

### Next steps (not started, in suggested order)

1. **KAG-01b is now closed** (see above — no live producer exists to diff
   against; both legacy candidates confirmed `DEAD` in the baseline
   registry). What remains open in this capability, if anyone picks it up:
   decide whether `types/kag.ts` gets a status flag now that it's confirmed
   dead, and whether `kag-projection-adapter-v1.ts` gets an actual caller
   (it currently has none either — it is proven-in-isolation, not
   proven-in-production).
2. **Live-wire CM-02** — find (or add) the real `ContextManifestV1` producer
   and have it also emit `ContextManifestV2` via `buildContextManifestV2`,
   sourcing `evidenceRevisions`/`retrievalPolicyRevision`/
   `acePlaybookRevision` from whatever revision values that producer already
   has in scope (do not fabricate placeholder revisions to make the call
   compile).
3. **Persist KAG-01/KAG-02 output** — only after (1) proves the projection
   is trustworthy: decide the row shape (array-per-canonical-id vs.
   join-table-per-pair), add the migration following the ORF-2 GIN-index
   precedent above, and materialize via the same dry-run-first /
   bounded-`--limit`-apply-second discipline used throughout this session.
4. **SIMD-01** — unrelated to the above three; still blocked on running
   PERF0 first, per this file's original text.

## KAG-03: additive, non-ranking type-level integration point (2026-08-25)

Investigated wiring KAG-01/KAG-02 into the live retrieval path before
touching anything. Found there is **no existing graph-expansion hook
anywhere in `context-assembler.ts`** (zero matches for
graph-expansion/neighbor/hop terms) — so "wire it in" was never a small
connect-the-dots task. Found the real live canonical response shape at
`sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts::SearchResult`
(NOT the older `unified-orchestrator.ts::RetrievalResult`, which
project-root CLAUDE.md already documents as superseded).

Chose the safe option deliberately: added
`provenance.hypergraphNeighbors?: Array<{canonicalId, hyperedgeIds}>` to
`SearchResult` — purely additive, optional, **never read by scoring,
fusion, or reranking** anywhere in this file (checked: nothing in
`search-runtime.ts` references the new field except its own type
declaration). This is a contract-only change, not a ranking change.

**Deliberately left unpopulated at every call site.** Checked for a live
Postgres source first: zero `INSERT INTO` for either `OntologyLinkedTupleV1`
or `HyperedgeV1` anywhere in the repo (checked
`ontology-linked-tuple-cache.ts`/`feature-doc-enrichment.ts`, the two real
callers). Populating the field now would mean fabricating placeholder data
pretending a real evidence source exists — refused to do that. The field
exists so a caller can type-check against its eventual shape; actual
population is blocked on the persistence step KAG-01/KAG-02 always said
was separate and not-yet-scoped.

2 new vitest cases added to `search-runtime.spec.ts` (15/15 total pass,
13 pre-existing + 2 new): a `SearchResult['provenance']` without the field
is valid (today's real state); a `SearchResult['provenance']` with the
field populated type-checks correctly (tomorrow's state, once persistence
exists). No existing test broke.

## KAG-04: additive persistence alignment (2026-08-24)

- [x] Audited the live PostgreSQL catalog read-only. The existing canonical
  tables are present: `atlas_hyperedges`, `atlas_hyperedge_members`, and
  `atlas_ontology_tuples`; all three currently contain zero rows.
- [x] Confirmed the repository already has a canonical table owner. No new
  parallel KAG table was created.
- [x] Added pure contract-to-row mappers in
  `sveltekit-frontend/src/lib/server/atlas/integration/kag-persistence-row-v1.ts`.
  `HyperedgeV1` remains one n-ary parent row plus ordered members; it is not
  clique-expanded. `OntologyLinkedTupleV1` retains revisions, evidence,
  participants, and provenance.
- [x] Added focused mapper tests. They are fixture-only and perform no store
  writes.
- [x] Authored additive sidecar migration
  `sveltekit-frontend/drizzle/manual/20260824_kag_contract_alignment_v1.sql`.
  It adds contract IDs, packet/revision lineage, evidence arrays, lifecycle,
  provenance, and schema registry keys using `IF NOT EXISTS`/idempotent
  registry inserts. It does not delete or backfill data.
- [x] Registered the migration as `manual_sidecar` and added a read-only
  verifier at `scripts/atlas/audit-kag-persistence-v1.mjs`.
- [x] Applied the migration after transactional validation. The read-only
  post-apply audit reports `READY_FOR_MATERIALIZATION`; all required columns
  are present, both contract registry keys are `ACTIVE`, and all three KAG
  tables remain at zero rows.
- [x] Added `scripts/atlas/materialize-kag-contracts-v1.mts`. It validates
  JSONL `HyperedgeV1`/`OntologyLinkedTupleV1` records, maps them to the
  existing owners, defaults to `DRY_RUN_READY`, and only performs
  idempotent upserts with explicit `--apply`.
- [x] Fixture dry-run accepted one hyperedge and one ontology tuple, planned
  two hyperedge members, and reported `canonicalWrites: false`.
- [x] Live ontology persistence proof passed through the real producer SQL:
  tagged tuple inserted, read back with provenance, then cleaned up. The
  canonical `atlas_ontology_linked_tuples` table returned to zero rows.
- [ ] Run the materializer against a reviewed Graphify/AST producer export;
  no producer export is currently selected as canonical KAG input.
- [x] Populate `SearchResult.provenance.hypergraphNeighbors` from persisted
  rows. See `## KAG-06` below — this does not yet "prove identity/revision
  parity" against a live corpus (both source tables are still empty in
  production); it proves the read path is correctly wired and fails open.

## KAG-04: `atlas_ontology_linked_tuples` table + live pipeline fix (2026-08-25)

Found the one real live producer of `OntologyLinkedTupleV1` that actually
persists anything (`taxonomy-topology-packet.ts::buildTaxonomyTopologyPacket`,
called from a registered MCP tool in `src/mcp/trace-mcp-server.ts`) and it
was writing **only to Redis** (`ontology-linked-tuple-cache.ts`, 6h TTL,
`.catch(() => {})`) — violating this repo's own "Postgres is truth, write
there first" rule (project CLAUDE.md, "Atlas Data Persistence + Retrieval
Contract").

- [x] Created `atlas_ontology_linked_tuples`
  (`sveltekit-frontend/drizzle/manual/20260825_atlas_ontology_linked_tuples.sql`,
  applied live) — full `OntologyLinkedTupleV1` shape, GIN indexes on
  `ontology_ids`/`concept_ids` following the ORF-2 precedent, FK to
  `atlas_packets(packet_key)`.
- [x] Added `sveltekit-frontend/src/lib/server/atlas/ontology-linked-tuple-postgres.ts::persistOntologyLinkedTuples()`
  — per-row upsert, captures per-row errors instead of losing the whole
  batch on one failure. 4/4 vitest pass (mocked `pool.query`, proves column
  mapping and JSON encoding).
- [x] Live-proved the table/SQL shape with
  `scripts/atlas/prove-ontology-linked-tuple-persistence.mjs` (kept as a
  real script, not a throwaway) — write, readback, cleanup all passed
  against the real running Postgres.
- [x] Wired `persistOntologyLinkedTuples()` into
  `taxonomy-topology-packet.ts`, called **before** the existing Redis
  write, fail-open (`.catch()` + warning, matches the existing Redis
  write's own fail-open behavior — a persistence failure must not break
  the MCP tool's response). `npx tsc --noEmit` clean on the touched file.

### Sweep: is Postgres actually source of truth here now? (requested this turn)

- **This specific pipeline: yes**, now fixed as above.
- **Found a real, adjacent, NOT-duplicate table while sweeping**:
  `feature_ontology_tuples` (Drizzle-schema'd as `featureOntologyTuples`,
  90,600 real rows) — a subject/predicate/object triple store
  (`phase-107-v1` extractor, temporal `valid_from`/`valid_to`), genuinely
  different shape from `OntologyLinkedTupleV1`'s token-level tagged-tuple
  model, not a duplicate of the table created above. **But same class of
  finding as `atlas_ast_nodes`/`ontology_edges` earlier this session: real
  data, zero live writer anywhere in the current tree** — only one read
  call site (`feature-doc-enrichment.ts:439`). Flagged, not fixed — out of
  scope for this pass.
- **The other two real `OntologyLinkedTupleV1` producers** —
  `feature-doc-enrichment.ts` and `pos-concept-tagging-lane.ts` — build and
  Zod-validate tuples but persist them **nowhere at all**, not even Redis.
  Their output flows directly into an MCP tool response and appears to be
  ephemeral by design. Did not add persistence here — unlike the
  `taxonomy-topology-packet.ts` case, there was no existing Redis write to
  "fix the ordering of," so adding Postgres writes here would be a new
  persistence decision, not a truth-ordering correction. Flagged as an
  open question for whoever owns those two call sites: should this output
  be durable too, or is ephemeral-per-request the intended design?

## KAG-05: real bugs found and fixed in `materialize-kag-contracts-v1.mts` (2026-08-25)

`scripts/atlas/materialize-kag-contracts-v1.mts` (added concurrently by
another process during this session, not by me — file changed on disk
mid-session) targets the exact same `atlas_ontology_linked_tuples` table
(and pre-existing `atlas_hyperedges`/`atlas_hyperedge_members` tables) as
KAG-04, with an independently-converged, column-identical design. Its own
tasks.md note said "no producer export currently selected" — ran it for
real with a live fixture to close that, and found it was never actually
runnable end-to-end:

- **Bug 1**: the hyperedge insert loop did `for (const row of hyperedgeRows)`
  then read `row.contractHyperedgeId`/`row.relationType`/etc directly — but
  `toAtlasHyperedgePersistenceRowsV1()` returns `{hyperedge, members}`, not
  a flat row. Every hyperedge field was `undefined`, causing
  `null value in column "relation_type" violates not-null constraint` on
  first real run. Fixed: `for (const { hyperedge: row, members } of hyperedgeRows)`.
- **Bug 2**: the ontology-tuple insert loop did `for (const tuple of tuples)`
  — `tuples` is the raw `{kind, value}` filter result, not `tupleRows` (the
  actual mapped `AtlasOntologyTuplePersistenceRowV1[]` the rest of that
  block's field access already assumed, e.g. `tuple.tupleId`). Fixed:
  `for (const tuple of tupleRows)`.
- Both bugs were silent at the type level in some editors because `tuple`/
  `row` were implicitly typed permissively enough not to flag it, but
  `npx tsc --noEmit` surfaces both clearly once you look — worth adding to
  a pre-commit/CI gate for this script specifically.

Added two new scripts to build a real, live fixture and prove the fix
(kept as real scripts per this session's convention, not throwaways):
`scripts/atlas/build-kag-fixture.mts` (builds one real `HyperedgeV1` via
the actual `createHyperedgeV1()` factory — not a hand-fabricated checksum —
plus one real `OntologyLinkedTupleV1`, using a real existing
`atlas_packets.packet_key` to satisfy the FK) and
`scripts/atlas/build-kag-fixture-and-materialize.mjs` (runs both steps via
`node <tsx-cli.mjs>`, matching NE-35D's Windows-safe launcher pattern).

**Live-proved end-to-end after the fix**: `"status": "APPLIED",
"canonicalWrites": true` — 1 hyperedge + 2 members + 1 ontology tuple
genuinely written through real FK-constrained tables. Verified via direct
`SELECT` (not just trusting the script's own report). All three test rows
deleted afterward (verified real ownership by matching the fixture's exact
`workspace_revision`/`producer_revision` fingerprint before deleting —
did not blindly delete based on ID pattern alone).

## KAG-06: wired `hypergraphNeighbors` to real Postgres rows (2026-08-25/26)

Closed out "Next steps" item 1 from the prior session-pause note below.

- [x] Added the read-side (row -> contract) mapper that KAG-01 through
  KAG-05 never built:
  `sveltekit-frontend/src/lib/server/atlas/integration/kag-hypergraph-reader-v1.ts`.
  `readKagHypergraphNeighborsV1(canonicalIds)` queries
  `atlas_ontology_linked_tuples` (`packet_key = ANY($1) OR source_ref = ANY($1)`)
  and `atlas_hyperedges` joined to `atlas_hyperedge_members` (matched via the
  internal `hyperedge_id` uuid, keyed back to the contract via
  `contract_hyperedge_id` — not the uuid itself), maps both back to
  `OntologyLinkedTupleV1[]`/`HyperedgeV1[]`, and runs them through the
  existing pure `buildKagMutualIndexV1()` (KAG-02, unchanged) to produce
  `{ canonicalId, hyperedgeIds }[]`.
- [x] Fail-open by construction: empty input returns immediately with no
  query fired; any DB error is caught and logged, never thrown — matches the
  fail-open convention already used for the KAG-04 write side in
  `taxonomy-topology-packet.ts`.
- [x] Wired into `search-runtime.ts` via a new private
  `lookupHypergraphNeighbors()` method, called at both `SearchResult`
  construction sites that carry real packets (the main success path and the
  degraded/no-embedding-health path) — dynamic `await import(...)`, matching
  this file's existing lazy-import stage convention. The empty-candidates
  early return is intentionally untouched (no packets to look up). Attached
  to `provenance` only, strictly after `finalPackets`/`postProcessed`/
  `reranked` are already computed — never read by `candidate-scorer.js`,
  `canonical-rerank-executor.js`, or `post-process-reranker.js`.
- [x] Tests: new
  `kag-hypergraph-reader-v1.spec.ts` (5 cases — empty input is a no-op,
  correct row-to-contract mapping, no-match canonicalId is omitted, DB error
  fails open, dedup/cap of requested ids) plus a new integration case in
  `search-runtime.spec.ts` proving the additive contract end-to-end
  (`provenance.hypergraphNeighbors` populated from a mocked reader while
  `packets`/`metadata` are byte-identical to the equivalent run without it).
  21/21 tests pass across both files.
- [x] `npx tsgo --noEmit`: zero new errors from either new file or the two
  `search-runtime.ts` call sites (remaining repo-wide errors are pre-existing
  and unrelated — missing optional deps, unrelated type mismatches).

**Not claimed**: `atlas_ontology_linked_tuples` and `atlas_hyperedges` are
still near-empty in production (per KAG-04/05, only proven with fixture rows
that were deleted after verification) — so `hypergraphNeighbors` will
typically still be absent on real queries today, by design (the array is
only emitted when a canonicalId actually has ≥1 matching hyperedge). This
closes the "the plumbing doesn't exist" gap, not the "the data doesn't exist
yet" gap — that remains item 2 below (a real producer) and the broader
"populated table, zero live writer" pattern (item 4 below).

## Audit: "populated table, zero live writer" pattern sweep (2026-08-26)

Closes "Next steps" item 4 below (the audit; item 4's underlying findings
are not fixes — no code or data was changed, this is read-only evidence).

**Method**: batch-counted every live row in every Postgres table matching
`atlas_%`, `kag_%`, `ontology_%`, `feature_%`, `graph_%`, `symbol_%`,
`nlp_%`, `taxonomy_%`, `*hyperedge*` (130 tables total; via a single
`DO $$ ... RAISE NOTICE` loop against `legal-ai-postgres`, not the
`pg_stat_user_tables` estimate, which is stale after a container restart).
Investigated the 34 tables with the highest row counts (>100 rows) by
grepping the whole repo (`src/`, `scripts/`, `packages/`, `tests/`, `docs/`)
for `INSERT INTO <table>` plus, for the top suspects, broader patterns
(Drizzle camelCase `.insert(...)`, distinctive column/value fingerprints
like `algorithm_revision`/`sources` literals) before concluding "no writer."

**New confirmed instances (2, both stronger than the original 3 — genuinely
zero references anywhere in the working tree, not even a script)**:

- **`atlas_chunk_packet_identity_links` — 105,762 rows, the single largest
  orphan found.** Schema is rich and clearly purpose-built (`qdrant_point_id`,
  `chunk_index_id`, `canonical_packet_key` FK to `atlas_packets`,
  `match_method`, `confidence`, `canonical_packet_minted`,
  `canonical_writes_allowed`, `algorithm_revision`). Every live row carries
  `algorithm_revision = 'atlas.chunk-packet-identity-linker.v1'` and
  `observed_at` timestamps around 2026-08-21 — a real, versioned linker ran
  once. Grepped for the table name (all casings/Drizzle var forms) and for
  the `chunk-packet-identity-linker` / `canonical_packet_minted` fingerprint
  strings: zero hits anywhere in `src/`, `scripts/`, `packages/`, `tests/`.
  The linker that produced this is not in the working tree at all — not
  even as a script. Highest-risk finding of this sweep: `canonical_writes_allowed`
  is `false` on every sampled row, meaning this table's own data says it was
  never trusted to promote a canonical identity — worth reading before
  anyone builds on it expecting it to be authoritative.
- **`ontology_domain_tuples` — 61,659 rows.** Every sampled row's `sources`
  column is literally `{atlas_packets.domain_class}` and
  `materialization_version = 1`, `created_at`/`updated_at` both
  2026-07-21 15:33:06 — a one-time bulk materialization from
  `atlas_packets.domain_class`, not an ongoing pipeline. Zero grep hits for
  the table name (any casing) or the Drizzle var name (`ontologyDomainTuples`,
  confirmed declared in `sveltekit-frontend/drizzle/schema.ts:6731` but never
  referenced from a writer — only from a downstream *read* view,
  `ontology_domain_summary`, at `schema.ts:7803`) in any `scripts/`/`src/`
  file.

**Confirmed via a prior independent audit (not re-derived, just corroborated)**:

- **`feature_domain` — 61,659 rows.** `docs/reports/sessions/feature-domain-storage-ownership-2026-07-27.md`
  (2026-07-27 session, unrelated to this one) already concluded "No active
  code writers were found in `src/` or `scripts/` that target `feature_domain`
  directly" after the same style of investigation — my independent grep pass
  agrees (only hit: a *commented-out* `-- INSERT INTO feature_domain` in
  `sveltekit-frontend/drizzle/0043_feature_extraction_tables.sql:212`). The
  companion note `feature-domain-storage-migration-note-2026-07-27.md`
  explicitly decided to keep `feature_domain` as a live target for future
  writes rather than deprecate it — so this is a known, accepted gap, not a
  new one, but it does count toward the pattern total.

**Already known (from earlier this session, not re-investigated in depth)**:
`atlas_ast_nodes` (11,067 rows, NE-ID-06/07), `ontology_edges` (252,102 rows
— script-only writers exist: `scripts/ontology/resolve-edges-and-populate.mjs`,
`scripts/ontology/ontology-edges-worker.mjs`, `scripts/atlas/populate-ontology-edges.mjs`
— reachability/currency not verified), `feature_ontology_tuples` (90,600
rows — script-only: `scripts/atlas/generate-ontology-tuples.mjs`,
`scripts/atlas/backfill-feature-layer-from-atlas-packets.mjs`).

**Broader "script-only" bucket — NOT the same severity, NOT fully
investigated for reachability**: of the 34 tables checked, the majority
(~25, including `atlas_tree_nodes` 269,972 rows, `atlas_graph_nodes_v2`
483,801 rows, `atlas_graph_edges_v2` 224,764 rows,
`atlas_graph_authority_scores_v2` 162,234 rows, `atlas_packet_metrics`
67,190 rows, `atlas_topology_index` 67,189 rows, `taxonomy_edges` 62,802
rows, `atlas_packet_features` 61,660 rows, `symbol_resolver` 58,365 rows,
`atlas_id_hierarchy_metadata` 58,365 rows, `atlas_feature_envelopes` 58,365
rows, `atlas_packet_registry` 58,324 rows — 3 competing writer scripts found
for this one alone, `atlas_artifacts` 58,312 rows, `atlas_higher_hop_index`
58,309 rows, `atlas_feature_vectors` 58,304 rows, `atlas_graph_authority_scores`
50,164 rows, `feature_file_edges`/`feature_structural_facts`/
`feature_lexical_facts`/`ontology_keywords`/`feature_implementations`) have
a writer that exists **only** as a one-off script under `scripts/atlas/` or
`scripts/`, never called from live `src/` app code. A script existing is
not evidence it still runs — none of these were checked against
`package.json` for an active npm alias, a scheduled task, or a
`graphify:*`/`startup:*` pipeline hook. This bucket is real risk (same
"looks wired, might be frozen" shape as the confirmed instances) but is
**explicitly out of scope for this pass** — flagging per the "no silent
caps" convention rather than implying full coverage. A follow-up pass would
need to check each script's `package.json` reachability and last-modified
date against the table's actual data freshness.

**Confirmed live, app-code-backed writers (no action needed)**:
`atlas_packets` (multiple `src/lib/server/*` writers — `promote-results-outbox.ts`,
`packet-materializer-pipeline.ts`, `promotion-executor.ts`,
`canonical-id-hierarchy.ts`), `atlas_summary_layers` (`promote-results.ts`),
`graph_community_assignments`/`graph_communities` (`graph-analysis-runner.ts`),
`graph_node_metrics` (4 live adapters: `pagerank-analysis-adapter.ts`,
`kcore-analysis-adapter.ts`, `betweenness-analysis-adapter.ts`,
`cheirank-analysis-adapter.ts`, the last with its own passing spec asserting
the `INSERT INTO graph_node_metrics` call).

**Coverage note**: 130 candidate tables were counted; only the top 34
(row count >100) were investigated for writer presence. Tables below that
threshold, and any populated table outside the `atlas_/kag_/ontology_/
feature_/graph_/symbol_/nlp_/taxonomy_/hyperedge` prefix set, were not
checked at all.

## KAG-08: fixed and wired the `kag_dag_*` DAG runner (2026-08-26)

Not one of the original numbered "Next steps" — surfaced by directly
investigating the `kag_dag_nodes`/`kag_dag_edges`/`kag_dag_runs` tables
(zero rows, seen but not detailed in the "populated table, zero live
writer" audit above, since those tables are the *inverse* case: zero rows,
not populated-with-zero-writer). Found a second, unrelated bug class:
provisioned tables + a hand-written orchestrator that was never actually
reachable from anything, with its own unit test silently asserting the
wrong thing.

- [x] **Confirmed `KagDagRunner` (`src/lib/server/features/ai/ace/kag-dag-runner.ts`,
  the `register()`/`execute()` class) specifically had zero production
  callers** and its own test
  (`src/lib/server/ace/kag-dag-runner.test.ts`) was **failing** before this
  fix (`expected undefined to be true` — verified by running it, not
  assumed). Root cause: `execute()` used a hardcoded 14-name
  `executionPlan` array (the code's own comment: "topological sort omitted
  for skeleton, running in hardcoded order") while the test registered
  nodes under a completely different vocabulary
  (`check_prior_answer_cache`, `ace_rerank`, `search_centroid_clusters`,
  ...) — those nodes could never run regardless of registration, so the
  cache-short-circuit assertion the test claimed to prove was never
  actually exercised.
- [x] **Correction (2026-08-26, found ~1 hour after writing the above):**
  "zero production callers" above is about the `KagDagRunner` *class*
  only — it is NOT true of the `kag_dag_runs`/`kag_dag_nodes` tables in
  general. `src/lib/server/features/ai/agents/trace-subagent-orchestrator.ts`
  (`runTraceSubagentDag`) is a **third, independent, real writer** to the
  same two tables — plain `db.insert(kagDagRuns)`/`db.insert(kagDagNodes)`
  calls, nothing to do with the `KagDagRunner` class or this session's new
  `persistKagDagRunFromSteps()`. It IS route-wired:
  `POST /api/trace/subagents/run` → `runTraceSubagentDag()`. And
  `src/lib/server/ai/code-intel-service.ts`'s `getRetrievalRuns()`/
  `getRetrievalRunDetail()` are a **real, already-wired reader** —
  `GET /api/code-intel/retrieval-runs` and `GET /api/code-intel/retrieval-runs/[id]`
  both call them, reading straight from `kagDagRuns`. So there was already
  a live write path AND a live read path before this session touched
  anything. Re-verified row counts after this correction: still 0/0 live —
  meaning the `runTraceSubagentDag` route is reachable but has
  (apparently) never actually been invoked in this environment, which is a
  materially different finding than "no writer exists." Not investigated
  further: whether that route silently swallows a real DB error on first
  call (its outer `catch` would mask an `INSERT` failure as a normal
  `status: 'failed'` run-update, which itself would affect 0 rows if the
  initial insert never committed) — flagging, not fixing.
- [x] **There is already a real, live UI for this data**: `/code-intel/retrieval`
  (`src/routes/(app)/code-intel/retrieval/{+page.svelte,+page.server.ts}`,
  auth-guarded, "TRACE Retrieval Timeline") lists runs from
  `GET /api/code-intel/retrieval-runs` and renders a 5-step
  Triage/Retrieve/Align/Compose/Encode narrative per run from
  `GET /api/code-intel/retrieval-runs/[id]`. **Important mismatch found**:
  the UI reads fields off `run.metadata` (`intent`, `tags`, `clustersUsed`,
  `lensesUsed`, `researchProvenance`, `summary`) — a shape that matches
  `trace-subagent-orchestrator.ts`'s conventions, not this session's new
  `persistKagDagRunFromSteps()` writer, which writes to `finalJson`
  (`{workflowState, topPacketKeys, topK}`), not `metadata` at all, and
  never touches `kag_dag_nodes` from the detail-view read side either (only
  `getRetrievalRunDetail()` selecting `memoryGainAudits` — it doesn't read
  `kagDagNodes` back out, even though both writers populate that table).
  **Deliberately not fixed**: forcing `persistKagDagRunFromSteps()`'s
  output into the Triage/Retrieve/Align/Compose/Encode narrative would be
  guessing at a real product decision (are search-workflow runs and
  subagent-orchestrator runs meant to be one unified "TRACE run" concept in
  this UI, or should the UI grow a second run "kind" / view?) rather than a
  mechanical fix — flagging per the same operator-decision discipline as
  items 2/3/5/7 above, not deciding it unilaterally. Once new rows
  actually appear (real search traffic, or someone calls
  `/api/trace/subagents/run`), the search-workflow rows will render in the
  list with a real query/timestamp but a placeholder-only detail view
  ("General Query", "0 used", "Answer generated via Gemma4.") until this
  is resolved.
- [x] **Also found, not fixed:** `src/lib/server/ace/code-intel-service.ts`
  (a *different* file from the one above — `ace/` vs `ai/`) declares its
  own, unrelated `getRetrievalRuns()` with the identical name and a
  different signature (synchronous, returns in-memory
  `latestCorpusNodes`-derived stub data, never touches `kag_dag_runs` at
  all). The live route imports from `ai/code-intel-service.ts`, not
  `ace/`, so this isn't a routing bug today — but it's exactly the
  same-name-different-thing hazard root CLAUDE.md's Duplication Prevention
  section warns about, worth a dedicated look whenever `code-intel-service`
  is touched next.
- [x] **Confirmed the live production `workflowDag`** (in
  `SemanticSearchWorkflowResult`, returned by `/api/retrieval/search-unified`)
  is built entirely separately, in
  `src/lib/server/retrieval/semantic-search-workflow.ts`'s
  `runSemanticSearchWorkflow()`, via a simple `addStep()` array push — it
  never touched `KagDagRunner` or the `kag_dag_*` Postgres tables at all.
  This is why all three tables were confirmed at 0 rows live. Per the
  CANONICAL_OWNER discipline (this file's own root CLAUDE.md governance
  section), `runSemanticSearchWorkflow` stays the one orchestrator — this
  work does NOT add a second execution engine, it wires `kag_dag_*` as a
  durable Postgres audit-trail *sidecar* for the trace it already produces.
- [x] Fixed `KagDagRunner.execute()` for real: added
  `topologicalSortDagNodes()` (Kahn's algorithm, deterministic tie-break on
  insertion order, drops `dependsOn` edges pointing at unregistered nodes
  instead of deadlocking, throws on a genuine cycle). Loosened
  `DagNodeName` from a closed union to `string` (kept the original 14
  names as a documented `KNOWN_DAG_NODE_NAMES` reference array, not an
  enforced type) so callers with a different step vocabulary aren't fighting
  the type. Replaced the hardcoded `nodeName !== 'write_audit' && nodeName
  !== 'record_cache'` magic-string check with a per-node `alwaysRun?:
  boolean` flag. Updated the existing test to set `alwaysRun: true` on its
  two audit/cache nodes — **it now passes** (was failing before this fix).
- [x] Added `persistKagDagRunFromSteps()` (same file) — a pure
  persistence function, not an orchestrator: takes an already-executed
  linear step trace (`{name, status, durationMs, detail?}[]`, exactly the
  shape `SemanticSearchWorkflowResult.workflowDag` already has) and writes
  one `kag_dag_runs` row + one `kag_dag_nodes` row per step + chained
  `kag_dag_edges` rows. Fail-open by construction (catches all DB errors,
  returns `null`, never throws) — matches the `recordPromotionIntent`/
  `logExposureEvents` fire-and-forget convention already used in
  `search-runtime.ts`.
- [x] Wired it into `runSemanticSearchWorkflow()` — fire-and-forget
  (`void persistKagDagRunFromSteps(...).catch(...)`), **always-on, not
  gated behind `persistReport`**. Checked why: the live
  `/api/retrieval/search-unified` route hardcodes `persistReport: false`
  on GET and never threads a `persistReport` value through on POST (the
  schema default is also `false`) — gating the new Postgres write behind
  the same flag as the opt-in JSON-file report would have meant it never
  actually fires from production traffic, leaving `kag_dag_*` permanently
  at 0 rows even after this fix. Postgres audit-trail writes are cheap and
  already the established always-on pattern elsewhere in this file's
  neighboring modules.
- [x] Tests: new `kag-dag-runner.spec.ts` (6 cases — topological ordering,
  dangling-dependency handling, cycle detection, full persist-shape
  assertion, failed-step propagation, DB-error fail-open) plus the fixed
  legacy test. `semantic-search-workflow.spec.ts` (existing, 1 test) still
  passes after the wiring. 29/29 across all 5 touched spec files.
  `npx tsgo --noEmit`: zero new errors on either touched file.

**Not claimed**: this does not make `kag_dag_*` reflect the *actual*
underlying stage costs of `runSemanticSearchWorkflow` — the step
vocabulary it records (`build_agentic_rag_context`, `canonical_search`,
`rust_shadow_compare`, `validate_response`, `validate_request`) is coarse
(one step covers the entire `createAtlasSearchAdapter().search()` call,
i.e. all of `SearchRuntime`'s internal retrieve/fuse/score/hydrate/rerank
stages collapse into a single `canonical_search` row). Finer-grained KAG
DAG nodes would require `SearchRuntime` itself to report sub-stage timings
through to `workflowDag`, which is out of scope here.

**Live-save verification (2026-08-26)**: `persistKagDagRunFromSteps()` and
`readKagHypergraphNeighborsV1()` had only ever been exercised against
mocked `pool.query` in vitest — never against the real schema. Verified
both directly via `docker exec psql` (exact column set each function
writes/reads, no ORM in between to hide a mismatch):
- **Write path**: inserted 1 `kag_dag_runs` row + 2 `kag_dag_nodes` rows +
  1 `kag_dag_edges` row using the exact shape `persistKagDagRunFromSteps()`
  produces — all committed cleanly, correctly FK-linked (read back via a
  join: `node_count=2, edge_count=1`), then deleted the run row and
  confirmed `ON DELETE CASCADE` removed the node rows automatically
  (0 remaining, not manually cleaned up per-table).
- **Read path**: ran both SQL query bodies from
  `kag-hypergraph-reader-v1.ts` (the `atlas_ontology_linked_tuples` query
  and the `atlas_hyperedges`/`atlas_hyperedge_members` join) verbatim
  against the live DB — both execute with zero syntax/column errors (0
  rows returned, correctly, since both source tables are still empty).

This closes the gap between "unit-tested against mocks" and "actually
compatible with the live schema" for both functions — no code changes
were needed, everything matched on the first try.

## Next steps (2026-08-25, session pause — nothing below started; item 1 done 2026-08-25/26, see KAG-06 above; item 4 audited 2026-08-26, see audit section above; KAG-08 DAG runner fixed+wired 2026-08-26, see KAG-08 above)

Committed and pushed to `origin/main` (`dcc4898338`). This session's real
work is closed out; these are the genuinely open threads to pick up next,
roughly in priority order:

1. ~~**Populate `KAG-03`'s `hypergraphNeighbors` field for real.**~~ Done —
   see `## KAG-06` above.
2. **Select a real, reviewed producer for `materialize-kag-contracts-v1.mts`.**
   Its own report still correctly says no canonical KAG input source is
   selected — the fixture used to prove it works this session was
   synthetic, not a real corpus export. Needs an operator decision on what
   the first real input is (a Graphify run? an AST pass export?).
3. **`atlas_ast_nodes` coverage gap (NE-ID-06/07).** The identity-bridge
   join logic is fixed and validated, but `atlas_ast_nodes` only covers
   `src/routes`/`src/lib` (2,196 files) — top-level `src/*` files and
   anything outside those two subtrees have zero rows. The script that
   originally populated it was never found in the working tree. Either
   locate/re-run it with broader coverage, or make a deliberate decision
   to re-scope symbol materialization to only the covered subtrees.
4. ~~**`feature_ontology_tuples` (90,600 rows) — same "populated table, zero
   live writer" pattern found three times this session** (also
   `atlas_ast_nodes`, `ontology_edges`). Worth a dedicated audit pass
   across the repo for this exact pattern, not just patching the three
   found by accident.~~ Audited — see "## Audit: 'populated table, zero
   live writer' pattern sweep (2026-08-26)" above. Found 2 new confirmed
   instances (`atlas_chunk_packet_identity_links` 105,762 rows,
   `ontology_domain_tuples` 61,659 rows), corroborated 1 from a prior
   independent audit (`feature_domain`), and flagged ~25 more as an
   unverified "script-only" risk bucket needing a follow-up reachability
   pass. This audit found problems, it did not fix any — no writer was
   built or reconnected. Whether/how to fix each instance is a separate,
   still-open decision (same operator-decision shape as items 2/3/5).
5. **Ephemeral vs. durable design question**, still open: should
   `feature-doc-enrichment.ts`/`pos-concept-tagging-lane.ts`'s
   `OntologyLinkedTupleV1` output also persist to
   `atlas_ontology_linked_tuples` now that the table exists, or is
   request-scoped/ephemeral the intended design for those two call sites?
   Needs an operator call, not a unilateral fix.
6. ~~**`KAG-01b`**: `types/kag.ts` (`KAGNode`/`KAGEdge`) confirmed dead
   (zero callers) but never given a status flag — cheap, low-risk cleanup
   whenever picked up.~~ **Re-checked 2026-08-26 — this framing is stale,
   do NOT archive `types/kag.ts`.** `kag-projection-adapter-v1.ts` (KAG-01,
   this same change) has a real, live `import type { KAGEdge, KAGNode }
   from '../../types/kag.js'` and its own doc comment names `types/kag.ts`
   as the legacy shape it deliberately projects into. Archiving `types/kag.ts`
   right now would break that import and its passing spec
   (`kag-projection-adapter-v1.spec.ts`) — not a cheap/low-risk move.
   The original "zero callers" claim (KAG-01b above) meant "no live
   production code *consumes* a `KAGNode`/`KAGEdge` value" (true —
   `projectOntologyTuplesToKagNodesV1`/`projectHyperedgesToKagEdgesV1`
   themselves have zero callers outside their own spec, confirmed
   2026-08-26), which is a different claim than "nothing imports the type."
   If `types/kag.ts` is to be retired, `kag-projection-adapter-v1.ts` would
   need to be retired first (or itself gets wired to a live caller) — that's
   a real design decision, not a mechanical cleanup. Leave both as-is.
7. **CHUNK0's canonical-ownership decision** is diagnosed but not made:
   `ast-chunker.ts` is the de facto production owner (3 live API-route
   callers); the :8095 sidecar path is proven correct but has zero live
   callers. Someone needs to decide whether to promote the sidecar path,
   formally demote `ast-chunker.ts`, or leave both as-is.
8. **`SIMD-01`** — unrelated, still blocked on running PERF0 first.

No new work should start on any of these without re-reading the relevant
section above first — several looked simpler than they turned out to be
(see KAG-05's two real bugs, NE-ID-06/07's corrected root-cause chain).
