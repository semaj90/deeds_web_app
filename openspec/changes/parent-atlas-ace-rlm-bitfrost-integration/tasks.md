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
- [ ] Populate `SearchResult.provenance.hypergraphNeighbors` from persisted
  rows and prove identity/revision parity before enabling graph-aware ranking.

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
