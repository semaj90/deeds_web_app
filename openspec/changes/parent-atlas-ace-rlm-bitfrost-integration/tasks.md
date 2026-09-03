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
- [x] ACE-FEATURE-SOURCE-CONTRACT-01 add the fail-closed SearchRuntime ACE
  resolver and feature-bundle composition contracts; unit coverage is bounded
  and does not imply a live production caller.
- [ ] ACE-FEATURE-SOURCE-OWNER-01 bind one production source adapter that
  supplies canonical SearchRuntime candidates, `CandidateOrdinalMapV1`, feature
  rows, and authoritative revisions to the resolver; do not migrate the ACE
  stream route until this gate passes.
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
   **Progress 2026-09-01:** the existing assembler now accepts explicit
   `ContextManifestV2` cache admission and forwards caller-owned retrieval
   revisions. Added `ace-context-manifest-admission-v1.ts` to adapt a
   validated candidate-feature snapshot into the existing V2 manifest. The
   adapter is test-proven, but no live `ContextManifestV1` producer supplies
   the complete input yet; keep this task open as `WIRED_PARTIAL`.
   **Admission audit 2026-09-01:** a server-scope search found only the
   snapshot contract/materializers and focused fixtures; no production caller
   owns `CandidateFeatureSnapshotV1`. Do not promote a route or client payload
   as the missing producer. The next gate is a server-owned snapshot producer
   with verified candidate, workspace, source, feature, ordinal, and graph
   revisions.
   **Adapter progress 2026-09-01:** added and test-proven
   `retrieval-router-to-candidate-feature-snapshot-v1.ts`. It preserves
   identity/revisions from `CandidateOrdinalMapV1`, maps only existing router
   features, and rejects nullable workspace lineage. It remains `CREATED +
   TEST_PROVEN`, not live-wired; callers must provide explicit lane masks and
   validated server-owned inputs.
   The adapter now also accepts the existing revision-qualified
   `QueryAdaptiveFeatureRowV1` output with deterministic ordinal rematerialization.
   This is still caller-invoked and does not make ACE live by itself.
   **Producer gate 2026-09-01:** keep the live caller blocked until a
   server-owned retrieval boundary supplies an existing `CandidateOrdinalMapV1`
   plus revision-qualified feature-resolver output. The current generic Atlas
   runtime context still derives omitted `workspaceRevision` and
   `packetRevision` from wall-clock timestamps in
   `atlas-runtime-context.ts`/`atlas-semantic-tools.ts`; those values are not
   admissible ACE lineage. Do not replace them with another placeholder.
   The next narrow task is **ACE-FEATURE-SNAPSHOT-PRODUCER-01**: compose
   SearchRuntime → existing ordinal admission → query-adaptive feature compiler
   → `CandidateFeatureSnapshotV1` → existing ACE admission, with missing or
   unqualified revisions rejected before snapshot construction.
   **Owner sweep 2026-09-01:**
   `sveltekit-frontend/src/lib/server/atlas/retrieval/fanout-admission-v1.ts`
   is an existing revision-qualified executor-result admission owner. It
   correctly consumes an existing ordinal map and refuses degraded identity,
   revision mismatch, and executor-ID substitution, but it does not emit a
   feature snapshot or invoke the QAS resolver. Treat it as an upstream
   admission dependency for ACE-FEATURE-SNAPSHOT-PRODUCER-01, not as the ACE
   producer itself. No production caller was found that supplies the complete
   SearchRuntime + ordinal map + feature resolver bundle.
   **Implementation progress 2026-09-01:** added
   `sveltekit-frontend/src/lib/server/atlas/context/ace-feature-snapshot-producer-v1.ts`.
   It composes the existing ordinal-map feature adapter with ACE manifest
   admission, validates explicit revisions, and returns `writesPerformed=false`.
   Focused coverage is now 8/8. This is `CREATED + TEST_PROVEN`; live caller
   adoption remains blocked until an authoritative retrieval entrypoint can
   supply the complete input bundle.
3. **Persist KAG-01/KAG-02 output** — only after (1) proves the projection
   is trustworthy: decide the row shape (array-per-canonical-id vs.
   join-table-per-pair), add the migration following the ORF-2 GIN-index
   precedent above, and materialize via the same dry-run-first /
   bounded-`--limit`-apply-second discipline used throughout this session.
4. **SIMD-01** — unrelated to the above three; still blocked on running
   PERF0 first, per this file's original text.

## ACE-CONTEXT-LIVE-02: caller census (2026-09-02, read-only, done before any migration)

Before migrating any caller to strict `ContextManifestV2`, censused every real caller of the ACE
packet cache surface (`redisGetAcePacket`/`redisSetAcePacket`/`hashQuery` from
`sveltekit-frontend/src/lib/server/cache/ace-packet-cache.ts`) and cross-referenced the existing
`ContextManifestV2` caller finding above (`assembleACEContext`). **Important false-lead avoided**:
a naive grep for `hashQuery` across the repo returns 40+ hits, but `hashQuery` is independently
redefined as an unrelated local helper in at least 12 other files (`engram-memory.ts`,
`packet-stream-cache.ts`, `atlas-cache-envelope.ts`, `hypergraph-builder.ts`,
`opencode-atlas-bridge.ts`, `embedding-service.ts`, `recommendation-events.ts`,
`semantic-cache.ts`, `RedisCacheService.ts`, `trace-mcp-server.ts`, `event-logger.ts`,
`stage-a0-routing.ts`, `synthesis-engine.ts`) — none of those import from `ace-packet-cache.ts` and
none are ACE-packet-cache callers at all. This is itself a separate, real duplication finding
(13 independent `hashQuery` implementations, likely all near-identical sha256-of-query-text) but
out of scope for this census — flagged, not fixed. Filtered to only files whose import statement
literally resolves to `$lib/server/cache/ace-packet-cache.js`:

| Caller | Uses | Classification |
|---|---|---|
| `routes/api/ace/stream/+server.ts` (GET+POST, auth-gated) | `redisGetAcePacket`/`redisSetAcePacket`/`hashQuery` — full read+write round trip, cache key is `hashQuery(query)` only | **LEGACY_QUERY_CACHE** |
| `routes/api/chat/stream/+server.ts` (GET+POST, auth-gated) | same pattern, same query-only key | **LEGACY_QUERY_CACHE** |
| `lib/server/analytics/ldr-ace-bridge.ts` (`cacheLdrAcePacket`, fire-and-forget export pipeline) | `redisSetAcePacket`/`redisSetSemanticProvenanceTuple` — write-only, never reads back, same query-only key | **LEGACY_QUERY_CACHE** (write-only variant) |
| `routes/api/ace/packet/+server.ts` (GET+POST, auth-gated) | imports `hashQuery` only, uses it purely as a `.tmp/ace/packet-{hash}.json` filename — **never calls `redisGetAcePacket`/`redisSetAcePacket` at all** | doesn't fit the 5-bucket taxonomy cleanly — real, live, production route, but has no Redis ACE-cache interaction to migrate. Not LEGACY_QUERY_CACHE (no cache read/write), not DEAD, not DIAGNOSTIC_ONLY. Noted honestly rather than force-fit. |
| `lib/server/cache/ace-packet-cache-v1.spec.ts` | imports `redisGetRevisionedAcePacketV1`/`redisSetRevisionedAcePacketV1` (the strict V2 functions) | **DIAGNOSTIC_ONLY** (test-only) |

**`redisGetRevisionedAcePacketV1`/`redisSetRevisionedAcePacketV1`/`buildRevisionedAcePacketCacheKeyV1`
(the strict, revision-qualified cache path) have zero production callers anywhere** — confirmed by
grep, only the spec file above imports them. This is the concrete evidence behind "cache mechanics
PROVEN, live caller adoption NOT YET PROVEN": the strict path exists, is presumably correctly built
(per its own identity-checksum design mirroring `ContextManifestV2`'s), but no live route has ever
called it. **STRICT_V2_WIRED count: 0.**

**Cross-referenced against the existing `ContextManifestV2` finding** (this file's own CM-02
section above, unchanged by this census, not re-litigated): 7 production routes call
`assembleACEContext` (`api/ace/summarize`, `api/cases/[id]/similar`,
`api/reconstruction/scene-intent`, `api/synthesis/generate` (3 call sites), `api/v1/query`,
`api/wiki/encyclopedia`) — all still produce only `ContextManifestV1`. Zero currently call
`buildContextManifestV2`. This matches, not contradicts, the file's existing "no live
`ContextManifestV1` producer supplies the complete input yet" finding.

**Recommended migration target for the actual ACE-CONTEXT-LIVE-02 step (not yet started)**:
`routes/api/ace/stream/+server.ts` — **wording correction (2026-09-02)**: this is the preferred
*representative canary target* for the strict revision-qualified path, not "the only full-round-trip
live route among the two candidates" as an earlier draft of this section said — the census table
above shows `api/chat/stream` also does a full read+write round trip. `ace/stream` is preferred
because it is the more central ACE-labeled entrypoint, not because it uniquely qualifies. **Real
open dependency before that migration can be written, flagged rather than glossed over**: the
acceptance criteria require a `sourceRevision` to test against, but this session's own
`OaK revision qualification` work (`parent-atlas-retrieval-lineage-dag-convergence/tasks.md`)
found the live workspace/source revision bundle is currently `BLOCKED_REVISION_BUNDLE_UNPROVEN` —
a mix of stale/orphaned and fresh-but-unpersisted values, not one coherent live world-state. Migrating
`ace/stream` to a strict revision-qualified key needs *some* source of `sourceRevision`/
`representationRevision`/`retrievalPolicyRevision` for a live request; using the same unproven
bundle here would just relocate that problem into ACE rather than solve it. This dependency needs
resolving (or an explicitly scoped, narrower revision source specific to this route) before writing
the migration, not worked around with a placeholder revision.

**The architectural conclusion stands regardless of the wording issue**: the strict ACE cache
mechanics exist and are test-proven; live adoption is blocked on revision authority, not on cache
implementation.

**Closing summary (2026-09-02)**:

| Bucket | Members |
|---|---|
| Legacy live readers/writers | `api/ace/stream`, `api/chat/stream` |
| Legacy write-only | `ldr-ace-bridge.ts` |
| Non-cache `hashQuery` consumer | `api/ace/packet` |
| Strict revision-qualified path | implemented, test-proven, **production callers = 0** |
| Live migration | `BLOCKED_REVISION_INPUT_UNPROVEN` |

**Next gate for this workstream, when intentionally resumed (not started, read-only when it runs)**:

### ACE-REVISION-SOURCE-OWNER-01 (not started)

For `api/ace/stream`, determine whether an existing live request path already owns each value
required by the strict cache key — `sourceRevision`, `representationRevision`,
`retrievalPolicyRevision`. For each field, record: producer, storage/source, scope, freshness
semantics, whether it is request-bound, whether it is persisted, whether it is authoritative, and
whether it can disagree with OaK/global revision state. Return exactly one of
`ROUTE_LOCAL_REVISION_AUTHORITY_PROVEN`, `PARTIAL_ROUTE_LOCAL_AUTHORITY`, or
`NO_ROUTE_LOCAL_AUTHORITY`. Do not fabricate values. Do not migrate callers. Do not alter cache
keys. Do not write Redis.

This keeps two possibilities cleanly separated: either the global coherent revision bundle becomes
proven (OaK unblocks) and ACE may consume it directly, or `api/ace/stream` has a narrower,
independently authoritative route-local revision tuple and ACE can proceed without waiting for
global OaK convergence. Until one of those is proven:

| Item | Status |
|---|---|
| ACE-CONTEXT-LIVE-02 | CLOSED (this census) |
| ACE strict cache mechanics | PROVEN |
| Live strict caller adoption | BLOCKED |
| BITFROST-LIVE-WARM-01 | NOT STARTED |
| BITFROST-INVALIDATION-01/02 | NOT STARTED |
| ACE-RESIDENCY-01 | NOT STARTED |
| CENTROID-BITFROST-01 | NOT STARTED |

Parked here for this session. Convergence work resumes on the already-authorized Qdrant
reconciliation track (`parent-atlas-retrieval-lineage-dag-convergence`), not on a new
revision-ownership investigation.

**Route revision-authority audit 2026-09-01:** the preferred `api/ace/stream`
canary was checked read-only before any caller migration. It has no local
authoritative `sourceRevision`, `representationRevision`, or
`retrievalPolicyRevision`; it uses `hashQuery` plus the legacy
`redisGetAcePacket`/`redisSetAcePacket` query-only cache surface and has no
strict V2 imports. The result is recorded in
`docs/reports/ace-route-revision-authority-v1.json` as
`NO_ROUTE_LOCAL_AUTHORITY`. Keep live strict caller adoption blocked; do not
fabricate revisions or alter cache keys. The next implementation gate is an
authoritative server composition provider that supplies an existing
`CandidateOrdinalMapV1` and revision-qualified feature rows, followed by the
bounded ACE live-admission canary.

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

## KAG-09: taxonomy-assignment review pipeline wired end-to-end, three real bugs fixed (2026-08-26)

Continuation of a pasted handoff that picked up exactly where this file's
own KAG-04/KAG-05 sections above left off (`atlas_hyperedges`/
`atlas_hyperedge_members` schema-vs-contract alignment, and the residual
Postgres-before-Redis ordering bug in `taxonomy-topology-packet.ts` that
KAG-04's 2026-08-25 fix left half-closed). Also closes out roadmap steps
1–3 of "wire `promoteTaxonomyAssignmentV1` into something live," which
didn't have a tracked home before this session.

### Migration/contract audit (KAG-05A/05B from the handoff)

- [x] **Verified already done, not re-done**: `drizzle/manual/20260824_kag_contract_alignment_v1.sql`
  (applied 2026-08-24, `sidecar-migrations.json`) already adds
  `contract_hyperedge_id`/`packet_key`/`workspace_revision`/`source_revision`/
  `graph_revision`/`producer_revision`/`evidence_refs`/`checksum`/`lifecycle`/
  `provenance` to `atlas_hyperedges`, column-for-column matching
  `HyperedgeV1Schema` and the exact `INSERT` in
  `materialize-kag-contracts-v1.mts`. No `CandidateOrdinal` added anywhere
  in this table; the dynamic evidence-event hypergraph tables
  (`atlas_evidence_entities`/`atlas_evidence_event_hyperedges`) were not
  touched or aliased. `atlas_hyperedge_members` already matched
  (`member_id`/`member_role`/`ordinal`) from the original 2026-07-16
  migration.

### Bug 1 — Postgres-before-Redis cache admission (closes KAG-04's residual gap)

- [x] KAG-04 (2026-08-25, above) fixed write *ordering* but not write
  *conditionality*: `persistOntologyLinkedTuples(...).catch(warn)` then
  `writeOntologyLinkedTupleCachePlan(...)` ran unconditionally regardless
  of whether the Postgres write actually succeeded — a Postgres failure
  could still leave Redis serving a tuple that doesn't exist in canonical
  storage.
- [x] Fixed in `taxonomy-topology-packet.ts`: persistence now runs first,
  its per-tuple `errors` array is used to filter to only the tuples that
  actually landed in Postgres, and only that filtered set is cached
  (cache plan is only rebuilt when the filtered set differs from the full
  set, to avoid wasted work in the common all-succeeded case). Failures
  logged as `DEGRADED_PERSISTENCE`, still fail-open at the MCP-response
  level per the existing convention.
- [x] `taxonomy-topology-packet.spec.ts`'s one smoke test still passes.

### Bug 2 — silent hop-budget truncation in `hypergraph-retrieval-v1.ts`

- [x] `retrieveHypergraphContextV1()`'s `truncated` flag was only set when
  `maxRelations`/`maxEntities` caps were hit — never when the hop budget
  itself cut off exploration with more graph still reachable. Violates
  this repo's own "no silent caps" rule (root CLAUDE.md: "silent
  truncation reads as covered everything when it didn't").
- [x] Fixed: after the hop loop, `frontier.length > 0` unambiguously means
  the loop stopped because of the hop budget with unexplored entities
  remaining (the only other exit path naturally empties `frontier`) — now
  sets `truncated = true` in that case.
- [x] Added 2 new tests on a genuine 3-hop chain (A→R1→B→R2→C→R3→D):
  `maxHops:1` → `R3`/`D` correctly excluded AND `truncated:true`;
  `maxHops:3` → fully explored, `truncated:false`. 5/5 in that spec pass.

### Bug 3 — `promoteTaxonomyAssignmentV1` had no status gate

- [x] `entity-concept-taxonomy-v1.ts::promoteTaxonomyAssignmentV1` gated on
  non-empty `evidenceRefs` but never checked `candidate.status` — a
  merely `'proposed'`/`'review_required'` (or even `'rejected'`) candidate
  could be promoted into canonical `HyperedgeV1` truth just by having
  evidence attached. **The pre-existing test for this function
  demonstrated the bug directly**: it built a fresh `status: 'proposed'`
  candidate and called `promoteTaxonomyAssignmentV1` on it, and it
  succeeded.
- [x] Added `if (candidate.status !== 'promoted') throw
  TAXONOMY_PROMOTION_REQUIRES_PROMOTED_STATUS:<id>:<status>`. Updated the
  existing test to simulate the (then-unbuilt) review transition; added a
  new test proving `'proposed'`/`'review_required'`/`'rejected'` are all
  now refused. 5/5 pass.
- [x] Found via a targeted `rg` search for existing synthesis call sites
  before assuming none existed — the first pass had missed this function
  entirely (see "Honest scope / what's NOT done" below for why that
  matters).

### Gate-alignment: Postgres CHECK constraints (found via a "review all gates" pass)

- [x] `atlas_hyperedges.checksum` (must match `HyperedgeV1Schema`'s
  `^[0-9a-f]{64}$`) and `.lifecycle` (must be one of
  `OBSERVED`/`DERIVED`/`SUPERSEDED`, same enum as sibling
  `atlas_ontology_linked_tuples.lifecycle`) had zero matching Postgres
  `CHECK` constraints — a raw SQL insert or any future second producer
  bypassing the Zod contract could write a malformed row with nothing at
  the DB layer to catch it.
  `drizzle/manual/20260826_atlas_hyperedges_gate_alignment_v1.sql`
  (applied; table had 0 rows at authoring time, no backfill needed).

### `semantic_768`/`semantic_512` mislabel (found during the tsgo error sweep, unrelated to the above but fixed in the same pass)

- [x] `routes/api/admin/atlas/synthesize/+server.ts:195` had a live type
  error: `representationId: 'semantic_768'` passed to
  `createAtlasRapidsSemantic512Client().exactKnn()`, whose type demands the
  literal `'semantic_512'`. `git blame` traced it to commit `a2e4dab329`
  ("retire Atlas v1 in favor of v2/semantic_768 alignment"), which flipped
  only this string literal without updating the client call — breaking
  internal consistency with the `vector.length === 512` filter and the
  512-client a few lines away. The original, internally-consistent value
  (commit `9e2883741a`) was `'semantic_512'`. **Not a re-litigation of the
  768-vs-512 canonical/primary policy** (root CLAUDE.md, 2026-08-23 final
  decision — 768 stays primary elsewhere, untouched by this fix): this is
  correctly labeling a legitimate 512-dim exact-rerank *secondary* lane,
  which that same policy explicitly permits as long as it's labeled
  correctly. Reverted to `'semantic_512'`.

### Roadmap steps 1–3: wiring `promoteTaxonomyAssignmentV1` into something live

Before this session `TaxonomyAssignmentCandidateV1`/`promoteTaxonomyAssignmentV1`
had a schema, a constructor, and (after Bug 3 above) a correct gate — and
zero live callers anywhere. Built all three roadmap steps, each proven
live against real Postgres with explicit-and-verified cleanup (this
module has no wrapping transaction to roll back — it's the live write
path — so every proof script deletes its own rows and asserts the
deletion):

- [x] **Step 3 (persistence)**:
  `sveltekit-frontend/src/lib/server/atlas/kag-hyperedge-postgres.ts::persistHyperedges()`
  — the missing in-process Postgres writer for `HyperedgeV1` (before this,
  only the offline `materialize-kag-contracts-v1.mts` CLI script, reading
  a JSONL file, could write these). Per-edge transactional (header +
  members atomic together; one bad edge's `ROLLBACK` doesn't affect
  siblings in the same batch). 4/4 mocked tests +
  `scripts/atlas/kag-persist-hyperedges-live-proof-v1.mts` (write →
  readback with checksum/ordinal intact → verified delete).
- [x] **Step 2 (review surface)**: new table
  `atlas_taxonomy_assignment_candidates`
  (`drizzle/manual/20260826_atlas_taxonomy_assignment_candidates_v1.sql`)
  + `kag-taxonomy-candidate-postgres.ts` (`persistTaxonomyAssignmentCandidates`,
  `listPendingTaxonomyAssignmentCandidates`,
  `decideTaxonomyAssignmentCandidateV1`) + admin route `GET`/`POST
  /api/admin/atlas/taxonomy-candidates`. `decideTaxonomyAssignmentCandidateV1`
  commits the candidate's status flip **before** attempting the hyperedge
  write (KAG-05E discipline extended to this new call site) — if the
  hyperedge write then fails, the candidate stays correctly `'promoted'`
  with `promoted_hyperedge_id` left `NULL`, a real queryable degraded
  state (`outcome: 'promoted_degraded'`), never silently reported as a
  full success. 7 + 5 mocked/route tests +
  `scripts/atlas/kag-taxonomy-candidate-review-live-proof-v1.mts` (persist
  → pending queue → reject → promote → hyperedge created and linked →
  already-decided guard fires → verified cleanup).
- [x] **Step 1 (candidate producer)**: deliberately did **not** build a
  new speculative multi-signal fusion job pulling live KNN + community +
  graph + lexical + NLP scores from five different subsystems — that
  would have been unverifiable within this session and duplicative of
  whatever the real fusion design turns out to need. Instead,
  `taxonomy-candidate-producer-v1.ts::deriveTaxonomyAssignmentCandidatesFromOntologyTuplesV1()`
  derives candidates from `OntologyLinkedTupleV1` rows a live pipeline is
  *already* producing (`taxonomy-topology-packet.ts`, the same call site
  Bug 1 above touches) — `label_kind='ontology'` tuples with a resolvable
  concept id and non-empty evidence become one candidate each
  (`ACTIVE_VERIFIED` + confidence ≥ 0.85 auto-proposes, else
  `review_required`). Wired directly into that live pipeline's existing
  fail-open persistence block. 6 unit tests +
  `scripts/atlas/kag-taxonomy-candidate-producer-live-proof-v1.mts` (real
  tuple persisted → derived → persisted → visible in the real pending
  queue → verified cleanup).

### Honest scope / what's explicitly NOT done

- **The producer only knows `semanticScore`/`nlpEvidenceRefs`.**
  `communityAffinity`/`graphSupport`/`lexicalSupport` are left `null`
  rather than fabricated, because this producer genuinely has no
  community/graph/lexical signal to report. `TaxonomyAssignmentCandidateV1`'s
  shape already supports a richer producer populating those fields — none
  exists yet. **Do not read a `null` here as "signal absent," read it as
  "no producer has attempted to compute this signal."**
- **No review UI.** The review surface is an authenticated JSON API
  (`GET`/`POST /api/admin/atlas/taxonomy-candidates`) only — no Kanban-style
  or other UI page consumes it yet. `human-review-projection-v1.ts`
  (`KanbanRecommendationProjectionV1`) is a *different* contract for a
  different recommendation kind; it was not reused or extended.
- **No auto-promotion.** Every promotion requires an explicit
  `POST .../taxonomy-candidates` call with a human-supplied `reviewedBy` —
  there is no threshold rule that auto-flips `'proposed'` straight to
  `'promoted'` without a decision call. (The producer's `'proposed'` vs
  `'review_required'` split is a *prioritization* hint for whoever reviews
  the queue, not a bypass of the review step itself.)
- **`gate inventory` finding — corrected, then fixed narrower than first
  described (2026-08-26, later same session)**: originally flagged 2
  differently-named error codes for the same "revision mismatch" concept
  (`HYPEREDGE_WORKSPACE_REVISION_MISMATCH` in
  `hyperedge-projection-adapters-v1.ts` vs. bare
  `WORKSPACE_REVISION_MISMATCH` in `incidence-projection-v1.ts`) as an
  inconsistency to rename. **That was wrong** — checked the wider repo
  before renaming anything and found both shapes are an established,
  repeated repo-wide dual convention: `<MODULE>_WORKSPACE_REVISION_MISMATCH`
  (≥8 other call sites — `CODE_ARCHAEOLOGY_`, `PRE_FANOUT_ONTOLOGY_`,
  `GRAPHIFY_BINDING_`, `GRAPHIFY_RUN_`, `GRAPH_SOURCE_BINDING_`,
  `CANDIDATE_`, `FANOUT_ORDINAL_MAP_`, `BLOCKED_`) and bare
  `WORKSPACE_REVISION_MISMATCH` (≥4 other call sites —
  `fanout-admission-v1.ts`, `query-adaptive-feature-compiler.ts`,
  `search-runtime-adapter.ts`, `classification-envelope-v1.ts`). Renaming
  `incidence-projection-v1.ts`'s bare form would have made it inconsistent
  with its *real* siblings. **Left both untouched, no rename.**
- [x] The genuinely isolated inconsistency was narrower: within
  `entity-concept-taxonomy-v1.ts` itself, 3 throws were bare prose
  strings (`'taxonomy promotion requires evidence'`,
  `'concept cannot be broader than itself'`,
  `'concept hierarchy relation requires evidence'`) sitting next to the
  coded `TAXONOMY_PROMOTION_REQUIRES_PROMOTED_STATUS:<id>:<status>` throw
  in the same file. No test pinned the exact prose (verified via grep
  before changing). Recoded to
  `TAXONOMY_PROMOTION_REQUIRES_EVIDENCE:<candidateId>`,
  `CONCEPT_BROADER_THAN_SELF:<parentConceptId>`, and
  `CONCEPT_HIERARCHY_REQUIRES_EVIDENCE:<parentConceptId>:<childConceptId>`
  respectively — all now `CODE:detail` shaped, consistent within this one
  file. 5/5 in `entity-concept-taxonomy-v1.test.ts` still pass.
- **`materialize-kag-contracts-v1.mts`'s own open question is unchanged**:
  KAG-05 above (2026-08-25) already noted it still has no real, reviewed
  canonical input source. `persistHyperedges()` (this section) gives a
  *second*, in-process way to write the same tables — it does not answer
  that question, and the CLI script's need for a real producer decision
  stands exactly as it did before this session.

Verification across everything in this section: 33 unit/mocked tests
across 7 spec files passing, 4 live-Postgres proof scripts (all
non-destructive, all cleanup-verified), full-repo `npx tsgo --noEmit`
clean except 85 pre-existing unrelated errors (one of which — the
`semantic_768`/`512` mislabel above — this session's fixes actually
reduced by one).

### Next steps arising from this section

1. **Build a real signal-fusion producer** for
  `communityAffinity`/`graphSupport`/`lexicalSupport` (community
  detection / PageRank / BM25-or-trigram scores respectively), populating
  the same `TaxonomyAssignmentCandidateV1` shape more fully. Needs an
  operator decision on where it lives (a new scheduled job, or folded into
  an existing enrichment pass) before building — same "needs a decision,
  not a unilateral fix" shape as KAG-05/KAG-04's other open items.
2. **Decide on a review UI**, or confirm the JSON API is sufficient for
  now. If a UI is wanted, `human-review-projection-v1.ts`'s Kanban pattern
  is the nearest precedent but is NOT wired to this candidate type today.
3. ~~**Rename the two `*_REVISION_MISMATCH` error codes**~~ — done, but not
  as originally framed. See the corrected "gate inventory" note above:
  both codes turned out to already match a real, wider repo convention
  and were left as-is; the actual fix was recoding 3 unrelated bare-prose
  throws within `entity-concept-taxonomy-v1.ts` to match that file's own
  `CODE:detail` style.
4. **`materialize-kag-contracts-v1.mts` producer selection** — still
  exactly as open as KAG-05 (2026-08-25) left it; not advanced by this
  session's work.
5. **New, more urgent item found while investigating a downstream roadmap
  question (2026-08-26): a second, independent, evidence-gated N-ary
  relationship contract already exists.**
  `openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md`'s
  `KAG-HYP-01: ontology tuple to hyperedge synthesis (2026-08-26)` section
  built `synthesizeOntologyHyperedge()` →
  `FeatureRelationshipV1`/`atlas.feature-relationship.v1`
  (`packages/parent-atlas/src/core/feature-intelligence.ts`) the same day
  as this file's `promoteTaxonomyAssignmentV1()` →
  `HyperedgeV1`/`atlas.hyperedge.v1` — neither aware of the other. Full
  comparison recorded as a cross-reference note in that file's KAG-HYP-01
  section (not duplicated here). **Not resolved, no side picked** — this
  is a real "One Canonical Runtime Owner Per Capability" governance
  question (root CLAUDE.md), needs an explicit operator decision before
  either side gets extended further.

## KAG pipeline wiring — status closure (2026-08-26, later same session)

**Status: `APPLY_PROVEN`** (root CLAUDE.md's enforced status vocabulary —
`CREATED`/`WIRED`/`DRY_RUN_PROVEN`/`APPLY_PROVEN`/`NOT_PROVEN`; not
"LIVE_PROVEN", which isn't one of the five enforced terms). `APPLY_PROVEN`
is the correct term here specifically because every proof in KAG-09 above
did real writes against the live Postgres instance, read them back, and
verified deletion — not a dry run.

The 3-step roadmap opened earlier this same file (search "roadmap steps
1–3" in KAG-09 above) is closed:

| Step | Status |
|---|---|
| 1 — candidate producer | `APPLY_PROVEN` |
| 2 — review/promotion surface | `APPLY_PROVEN` |
| 3 — hyperedge persistence | `APPLY_PROVEN` |

Evidence (all already itemized in KAG-09 above, not re-proven here): 33
unit/mocked tests across 7 spec files, 4 non-destructive live-Postgres
proof scripts, 0 residual proof rows, 0 new `tsgo` errors in any touched
file. The honest-scope note in KAG-09 stands unchanged: the producer
populates `semanticScore`/NLP evidence only;
`communityAffinity`/`graphSupport`/`lexicalSupport` are `null` (absence of
a producer for that signal), never fabricated as `0`.

**Not claiming**: this does not mean "KAG is done" in any broader sense —
only that the specific 3-step wiring gap (candidate → review → hyperedge,
all the way to Postgres) that existed at the start of this session is
closed. Signal richness (KAG-07 below), the `materialize-kag-contracts-v1.mts`
producer-selection question, and the review-UI decision are all still
open exactly as items 1/2/4 above describe.

## KAG-07: signal enrichment (proposed design, NOT started)

**Bounded owner census rechecked 2026-09-01:** `atlas_graph_authority_scores` (212,398 rows), `graph_community_assignments` (1,049,522 rows), and `graph_communities` (790,088 rows) exist live, while `atlas_taxonomy_assignment_candidates` is empty. The nullable candidate signal columns therefore remain an unjoined surface, not evidence of enrichment. `graphSupport` and `communityAffinity` have populated source artifacts but no candidate join receipt yet; `lexicalSupport` owner remains unproven. Preserve missing evidence as `NULL`, not zero. Report: `docs/reports/kag-signal-owner-census-v1.json`.

**Proven contract slice 2026-09-01:** added `atlas.taxonomy-signal-evidence.v1` with normalized score, evidence references, producer/workspace lineage, explicit source/graph revision axes, and deterministic checksum. Focused tests pass 2/2. This does not mark KAG-07 complete: live signal joins and materialization remain open. Report: `docs/reports/kag-signal-provenance-contract-v1.json`.

**Lexical identity bridge census 2026-09-01:** `atlas_packets.source_ref` matched `codebase_chunk_index.source_ref` for 4,549 packet references, but 4,282 were one-to-many; exact `atlas_packets.tree_node_id` to `codebase_chunk_index.chunk_id` matched 0 rows. Keep lexical enrichment blocked until an exact packet/chunk identity bridge is proven; do not score ambiguous source-reference joins.

Feeds the *same* `TaxonomyAssignmentCandidateV1` shape from established
evidence owners — this is explicitly not a new "fusion service": no new
service, no new orchestrator, just more producers writing into the
contract that already exists and is already proven end-to-end.

- `semanticScore` — done (KAG-09's producer, from `OntologyLinkedTupleV1.confidence`)
- `lexicalSupport` — proposed source: Postgres FTS/trigram lane (not yet identified which existing module owns this read path — needs inspection, not assumed)
- `graphSupport` — proposed source: Graphify/graph-authority structural evidence (candidate owner: `src/lib/server/graph/graph-analysis-runner.ts` + its adapters, per this repo's own "NetworkX vs. Neo4j" note in root CLAUDE.md — unverified whether that's the right hook)
- `communityAffinity` — proposed source: promoted community/Leiden assignment (candidate owner: `graph_community_assignments` table per root CLAUDE.md — unverified)
- Rule carried forward unchanged from KAG-09: **missing signal = `null`, never a fabricated `0`.**

**Proposed but not yet designed further**: attaching provenance to each
signal (a `score` + `evidenceRefs` + `producerRevision` +
`workspaceRevision` shape per signal, not just a bare number) so a
candidate can say *why* it has `graphSupport=0.82`, not merely store the
value. This is a real, reasonable idea — flagging it as unstarted design,
not implementing it speculatively here, since it changes
`TaxonomyAssignmentCandidateV1`'s schema shape and should go through the
same review this file's other schema changes have (KAG-03/KAG-04 above).

**Explicitly not claiming the candidate-owner guesses above are correct**
— `graph-analysis-runner.ts` and `graph_community_assignments` are named
here as places to *check first*, per this repo's own Duplication
Prevention rule ("grep first... a file existing is not evidence it's
live"), not as confirmed integration points. Whoever picks up KAG-07
should verify live callers/data freshness on each before wiring, exactly
as KAG-09's own producer avoided assuming an unverified live signal
source.

### Cross-reference note: adjacent work already tracked elsewhere (checked before writing this, not assumed)

A broader priority ranking was proposed alongside this update, covering
whole-file/chunk byte-hash semantics (`BYTE-01`), `atlas_chunk_packet_identity_links`
census work, a `StructuralGraphSnapshotV1`/`CandidateOrdinalMapV1` graph
artifact pipeline, Arrow IPC/mmap proofs, NetworkX→cuGraph parity, a
`[N,4,4,6]→[N,96]` feature fabric, Go retrieval orchestration, ACE context
packing, and post-Qdrant-1.19-upgrade cleanup items. Before appending that
here, checked whether it already has a tracked home — **it does**:

- `atlas_chunk_packet_identity_links` and whole-file/chunk hash semantics
  are the **live, actively-tracked subject of
  `openspec/changes/parent-atlas-semantic-512-canonicalization/tasks.md`**
  (root-level `openspec/`, not `sveltekit-frontend/openspec/` — same
  distinction that mattered for finding *this* file). That file already
  has named proof gates (e.g. `S512-15`) and session-by-session history
  for exactly this table.
- `CandidateOrdinalMapV1`/`StructuralGraphSnapshotV1`-shaped work already
  has three addendum documents under
  `openspec/changes/parent-atlas-candidate-feature-execution-fabric/`
  (`candidate-snapshot-contract-addendum.md`,
  `fanout-admission-addendum.md`,
  `fanout-executor-ordinal-normalization-addendum.md`).
- Qdrant version was checked live for this update: `1.19.0` confirmed
  running (`curl 127.0.0.1:6333/`). The remaining post-upgrade items
  proposed (legacy search/recommend/discover caller sweep, parity checks,
  revision-qualified payload lineage, filter-field decisions,
  filter-aware HNSW rebuild) were not independently verified and are not
  recorded here — they belong wherever the Qdrant 1.19 upgrade itself was
  tracked, not duplicated into this KAG/ACE/Bitfrost file.

**Not recording the proposed P0–P9 cross-cutting priority order in this
file.** This file's scope is KAG/ACE/RLM/Bitfrost integration; a
priority ranking spanning byte-hash semantics, GPU graph parity, ACE
packing, and retrieval orchestration is a cross-cutting program decision.
Root CLAUDE.md already names `MASTER-FEATURE-TODO-2026-05-20.md` as "the
master phase plan for lane completion and backlog tracking" — that, or
whichever of the two openspec files above already owns each item, is
where that ranking belongs. Duplicating it here risks exactly the
same-thing-two-names drift this repo's own Duplication Prevention rule
warns about (found 3 separate times already this session: the
`*_REVISION_MISMATCH` naming, the two `KAG-04` sections above, and the
two `parent-atlas-graph-retrieval-proof` folders across the two openspec
roots).

## Next steps (2026-08-25, session pause — nothing below started; item 1 done 2026-08-25/26, see KAG-06 above; item 4 audited 2026-08-26, see audit section above; KAG-08 DAG runner fixed+wired 2026-08-26, see KAG-08 above; item 2 (`materialize-kag-contracts-v1.mts` producer selection) still NOT advanced as of KAG-09's 2026-08-26 work — see KAG-09's own "Next steps" for what that session added instead)

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

## SIMD-01 / PERF0: partial benchmark, still open (2026-08-31)

Ran a first real PERF0 measurement rather than leaving this purely theoretical, but this is
**not** a closure — the pipeline this gate covers (live Neo4j/Postgres RLM persistence, the
canonical producer-export decision below) is still unfinished, so payload sizes seen here are a
snapshot, not the ceiling.

**Measured** (native V8 `JSON.parse`, no simdjson):
- Real RLM trace fixture (`docs/reports/rlm-environment-proof.json`, 1,845 bytes): **6.9 µs/parse**
- Synthetic ACE context packet at this pipeline's documented upper bound (~13KB, 40 candidates):
  **31.2 µs/parse**

Both are 2-3 orders of magnitude below where simdjson's real gains show up (per CLAUDE.md's own
GPU Acceleration Stack benchmarks: crossover ~1KB, meaningful wins at 10-100KB+, e.g. 12ms→2.4ms
at 100KB). Against this pipeline's actual network/DB/LLM round-trip costs (seconds, not
milliseconds), tens of microseconds of parse time is noise. **At current per-request payload
sizes, JSON.parse is not a bottleneck and SIMD-01 is not justified — but this only covers
per-request RLM/ACE payloads, not bulk file ingestion (see below), and not whatever payload shape
shows up once live persistence and the producer-export decision actually land.**

Web research (2026-08-31) on where JSON parsing genuinely is worth accelerating: simdjson Node
bindings show ~5.5× real throughput on large files (`canada.json`: 236 ops/sec vs 42.67 ops/sec
native) and the underlying library sustains 1-2 GB/s on modern hardware — but there's a real
caveat that C++→JS object-marshaling overhead can eat the gain unless parsing lazily / extracting
only needed fields (this repo's own `fastJsonExtractNumbers()` in `simdjson-bridge.ts` already
does this correctly). For **bulk JSONL/large-file ingestion** specifically (as opposed to small
per-request payloads), 2026 guidance is streaming (`readline`/`stream-json` over
`createReadStream`), not a faster in-memory parser, to keep memory constant regardless of file
size.

That search directly surfaced a real, unrelated bug in the other blocked task below, not a
hypothetical: **fixed** `scripts/atlas/materialize-kag-contracts-v1.mts` — it was doing
`readFile()` the entire input file into memory, then `.split(/\r?\n/)` the entire string, and
only *then* applying `--limit`, meaning `--limit` never actually bounded memory. Replaced with a
`node:readline` line-by-line stream over `createReadStream` that stops reading once `limit` lines
are collected. Verified live with a small real JSONL fixture: `inputLines: 2` confirmed the reader
stopped exactly at `--limit=2` despite the file having 4 lines (one blank), and the existing
Zod-validation/dry-run/rejection pipeline downstream is unchanged (both dummy records were
correctly rejected by the real schemas; `canonicalWrites: false` as expected without `--apply`).
This matters because the still-open "run the materializer against a reviewed Graphify/AST
producer export" task above could plausibly hand it a large file (this repo's own
`docs/graph/codebase-graph.json` is ~25MB) once a producer is selected — `--limit` now actually
protects memory when that happens, whichever export is eventually chosen.

**SIMD-01 remains open, not closed.** What would actually justify revisiting it: (a) live
persistence lands and produces payloads meaningfully larger than the ~13KB upper bound measured
here, or (b) the materializer needs to ingest genuinely large files where the *parse* step (not
just the *read* step, now fixed) becomes measurably slow — re-run PERF0 against real numbers at
that point rather than assuming the numbers above still hold.

## KAG-OWNER-01–07: field-level audit of the two competing relationship contracts (2026-08-26)

Continuation of the cross-reference note above (item 5, "second, independent N-ary
relationship contract"). Per operator direction: this is a read-only audit, no merge, no
delete, no rename, no repository consolidation — those are all explicitly listed as NOT to do
yet. Read both contracts and their real consumers directly rather than inferring from names.

| Question | `atlas.hyperedge.v1` (`HyperedgeV1`) | `atlas.feature-relationship.v1` (`FeatureRelationshipV1`) |
|---|---|---|
| Input | `OntologyLinkedTupleV1` (code-entity POS/tag/ontology tagging) | `OntologyTupleV1` (`external-doc-knowledge-fabric.js` — doc/LangExtract-style concept/tool/retrieval tuples) |
| Output identity | `hyperedgeId = "hyperedge:" + sha256({predicate, participants, workspaceRevision, sourceRevision}).slice(0,32)` | `relationship_id = "hyperedge:" + sha256({predicate, participantKeys, source_ref, source_revision, relation_revision}).slice(0,40)` |
| Workspace revision | required field | **absent from the schema entirely** |
| Graph/source revision | `graphRevision` + `sourceRevision`, both required | `source_revision` only; no separate graph-revision axis |
| Evidence refs mandatory | yes, enforced (`TAXONOMY_PROMOTION_REQUIRES_EVIDENCE` throws on empty) | sourced from `tuple.evidence_span_refs`, not schema-enforced non-empty |
| Human promotion required | **yes, enforced** — `candidate.status !== 'promoted'` throws | **no promotion state machine at all** — pure function returns `ELIGIBLE` directly from `evidence_state`+`lifecycle` inputs |
| Can proposed evidence become truth without review | no (this session's fix closed exactly this gap) | **yes, structurally** — any caller passing `evidence_state: 'ACTIVE_VERIFIED'` gets `ELIGIBLE` immediately |
| Member cardinality | n-ary, `.min(2)` | n-ary, `.min(1)`, plus explicit `participant_count`/`relationship_degree`/`relationship_degree_kind` (unary/binary/ternary/nary) and per-role `cardinality` constraints — genuinely richer |
| Checksum field | yes, `checksum: ^[0-9a-f]{64}$`, DB `CHECK` added this session | **no checksum field in the schema at all** |
| Postgres destination | `atlas_hyperedges`/`atlas_hyperedge_members` — live, populated, write/read/delete proven | `atlas_relationships`/`atlas_relationship_members`/`atlas_relationship_cardinality`/`atlas_relationship_evidence`/`atlas_relationship_embeddings` — **checked live 2026-08-26: `atlas_relationships` does not exist in the database.** Migration written, never applied. Not merely unproven — currently non-functional. |
| Downstream consumers | `kag-hypergraph-reader-v1.ts` → `SearchResult.provenance.hypergraphNeighbors`, live | `hypergraph-retrieval.ts`/`hypergraph-ppr.ts`/`hypergraph-fusion-facade.ts`/`hypergraph-query-policy.ts` (1,638 lines), but FI-16H says "frontend live import/adoption remains unproven" |

**Verdict (operator-confirmed, matches the evidence)**: do not pick one canonical owner for
all N-ary relationships. The two domains are genuinely different (code-entity taxonomy vs.
general doc-derived concept/tool/app-completion relationships) and were independently
reinvented, not accidentally copied. `HyperedgeV1` has the stronger governance claim for its
own domain (promotion gate, evidence enforcement, checksum, live Postgres proof);
`FeatureRelationshipV1` has legitimately richer domain modeling (degree/cardinality) for its
own domain but zero working persistence today.

**Proposed resolution (recorded, NOT implemented)**: domain-scoped canonical ownership, not a
universal winner —
- `CANONICAL_OWNER` for taxonomy classification (`ENTITY_CLASSIFIED_AS`, `CONCEPT_BROADER_THAN`): `HyperedgeV1`
- `CANONICAL_OWNER` for Feature Intelligence relationships (doc/concept/tool/app-completion facts): `FeatureRelationshipV1`, once its Postgres path is actually live-proven
- A non-persistent, non-canonical shared kernel type (`AtlasRelationshipKernelV1`: relationshipId, participants[canonicalId/role/ordinal], evidenceRefs, workspaceRevision, sourceRevision, graphRevision?, producerRevision, checksum) that both domain contracts can compile to/from for shared graph-projection/StructuralGraphSnapshotV1 tooling — never independently writable, never a third owner.
- An explicit `RelationshipAuthority` discriminator (`KAG_TAXONOMY` | `FEATURE_INTELLIGENCE`) plus a namespaced relation-type list per authority, so the same semantic fact can never be independently minted by both systems — that, not "two schemas exist," is the actual forbidden state.
- Neither side migrates its rows into the other's tables; neither repository is replaced by the other.

**Not done in this pass** (per explicit operator instruction): defining `AtlasRelationshipKernelV1` in code, implementing either kernel adapter, applying the `atlas_relationships` migration, proving FI persistence live, or freezing the relation-type namespace. All of these are the next tranche (`REL-OWNER-01` through `REL-OWNER-08`, `REL-FI-01`), not started.

**Explicitly safe to continue in parallel, unaffected by this open question**: `StructuralGraphSnapshotV1` production-artifact validation, NetworkX/cuGraph PageRank/PPR work, and `KAG-07` real signal-owner discovery (read-only) — none of these require deciding which ontology-synthesis function owns canonical truth.

### REL-OWNER-01 through 07 — status correction (2026-08-26, later session)

The paragraph directly above is **stale**. Re-reading the live tree found the shared-kernel work
already implemented (name landed as `RelationshipKernelV1`, not `AtlasRelationshipKernelV1` — same
design, different literal name) and this session closed the remaining gap:

- **REL-OWNER-01/02** (freeze domain ownership) — **DONE this session.** Recorded a
  `n_ary_relationship_synthesis` capability entry in
  `docs/architecture/runtime-ownership-registry.json` naming `HyperedgeV1`
  (`sveltekit-frontend/src/lib/server/graph/hyperedge-contract.ts`) `CANONICAL_OWNER` for
  `KAG_TAXONOMY` and `FeatureRelationshipV1`
  (`packages/parent-atlas/src/core/feature-intelligence.ts`) `CANONICAL_OWNER` for
  `FEATURE_INTELLIGENCE`, per this repo's own "One Canonical Runtime Owner Per Capability"
  governance section (root CLAUDE.md).
- **REL-OWNER-03/04/05** (define the shared kernel type + both adapters) — **already DONE, found
  pre-existing.** `packages/parent-atlas/src/core/relationship-kernel.ts` defines
  `RelationshipKernelV1`/`buildRelationshipKernel` with the exact field set proposed above
  (relationshipId, authority, relationType, participants[canonicalId/role/ordinal/entityType/
  entityRevision/sourceRef], evidenceRefs, sourceRef, sourceRevision, workspaceRevision,
  graphRevision, relationshipRevision, producerRevision, checksum). Both adapters exist:
  `hyperedgeToRelationshipKernel()` in `hyperedge-contract.ts` (KAG_TAXONOMY) and
  `featureRelationshipToKernel()` in `relationship-kernel.ts` (FEATURE_INTELLIGENCE). Neither the
  kernel schema nor either adapter exposes a standalone constructor/writer — confirmed by reading
  both files in full; the kernel can only be reached through one of the two adapters.
- **REL-OWNER-06** (prove lossless round-trip) — **already DONE, found pre-existing + re-verified
  live this session.** `packages/parent-atlas/test/relationship-kernel.test.mjs` (3/3 pass before
  this session's additions) proves `FeatureRelationshipV1 → kernel` is deterministic regardless of
  input participant order (same checksum). `sveltekit-frontend/src/lib/server/graph/
  hyperedge-contract.spec.ts` (`'keeps shared kernel fields aligned while retaining domain-scoped
  authority'`, 6/6 pass, re-run live this session) proves both adapters preserve their respective
  domain's revision fields (`kag.workspaceRevision === hyperedge.workspaceRevision`,
  `fi.workspaceRevision === null` since Feature Intelligence has no workspace concept) while
  sharing one `schema` literal and one checksum algorithm.
- **REL-OWNER-07** (freeze the relation-type namespace, reject cross-domain collisions) — **DONE
  this session.** Added `KAG_TAXONOMY_RELATION_TYPES` (`['ENTITY_CLASSIFIED_AS',
  'CONCEPT_BROADER_THAN']` — the complete, grep-confirmed list of every predicate string
  `entity-concept-taxonomy-v1.ts` can produce) and `assertRelationTypeNamespace(relationType,
  authority)` to `relationship-kernel.ts`, wired directly into `buildRelationshipKernel()` so both
  adapters enforce it unconditionally. The asymmetry the guard encodes is real, not incidental:
  `KAG_TAXONOMY` is closed-vocabulary (a human wrote every possible predicate literal), while
  `FEATURE_INTELLIGENCE` is open-vocabulary by design — `ontology-hyperedge-synthesis.ts` line 126
  sets `relationship_type: tuple.predicate` directly from NLP-extracted text, so it cannot be
  enumerated. The only enforceable direction is therefore "an open vocabulary must never mint one
  of the closed vocabulary's reserved names," which is exactly what the guard checks. 4 new tests
  added and passing (`packages/parent-atlas/test/relationship-kernel.test.mjs`, now 11/11 total).
  Confirmed via grep across every known `FeatureRelationshipV1` consumer
  (`adaptive-hypergraph-chain.ts`, `executor-plans.ts`, `hypergraph-fusion-facade.ts`,
  `hypergraph-ppr.ts`, `hypergraph-query-policy.ts`, `hypergraph-retrieval.ts`,
  `relationship-query-repository.ts`) that none hardcode a relation-type literal — they all
  propagate whatever `FeatureRelationshipV1.relationship_type` already carries — so wiring the
  guard into the shared builder could not silently break an existing caller.
- **REL-OWNER-08** (feed both adapters into the `StructuralGraphSnapshotV1` producer) — **DONE
  this session, found mostly pre-wired.** `buildIncidenceProjectionFromRelationshipKernelsV1()`
  (`sveltekit-frontend/src/lib/server/atlas/graph/incidence-projection-v1.ts`) already accepts
  `RelationshipKernelV1[]` generically — it has no authority-specific branch, so kernels from
  either adapter flow through identically, and `buildStructuralGraphSnapshotFromIncidenceV1()`
  consumes that projection's node/edge counts without caring which domain produced them. What was
  missing was proof the two domains can coexist in one call without an id or namespace collision.
  Added `GPH-PROJ` test `'REL-OWNER-08 projects a KAG_TAXONOMY hyperedge and a
  FEATURE_INTELLIGENCE relationship into one incidence graph without ID or namespace collision'`
  (`incidence-projection-v1.spec.ts`, 7/7 pass) that builds one `HyperedgeV1` and one
  `FeatureRelationshipV1` sharing a common entity (`concept:retrieval`), compiles both to kernels,
  and asserts: 2 distinct relation nodes, exactly 2 incidence edges into the shared entity (one per
  relation, not merged/duplicated), and `nodeKind` correctly carries `ENTITY_CLASSIFIED_AS` vs
  `DOC_RELATES_CONCEPTS` as the domain tag.
  **Real finding surfaced by writing this test**: both domains' `relationshipId`/`relationship_id`
  generators independently chose the literal text prefix `hyperedge:` (`hyperedge-contract.ts`'s
  `createHyperedgeV1` uses a 32-hex-char slice; `ontology-hyperedge-synthesis.ts`'s
  `synthesizeOntologyHyperedge` uses a 40-hex-char slice) — so relation *node ids* are not
  authority-namespaced by convention. This is safe, not a bug: `buildIncidenceProjectionV1`
  already throws `DUPLICATE_RELATION_ID` on any literal id collision (astronomically unlikely
  given they're independent sha256 outputs of different lengths), and REL-OWNER-07's
  `assertRelationTypeNamespace` guard is what actually keeps the two domains distinguishable on
  the graph — `nodeKind`/`relationType`, not the id prefix, is the real domain tag. Recorded here
  so a future reader doesn't mistake the shared `hyperedge:` prefix for an intentional shared
  namespace.
- **REL-FI-01** (apply the `atlas_relationships` migration, live-prove Feature Intelligence
  Postgres persistence) — still **NOT started**, and now doubly confirmed dead-simple to state:
  `scripts/atlas/audit-ontology-hyperedge-synthesis.mjs` is a real, live, read-only audit script
  that already runs `synthesizeOntologyHyperedge()` end to end and writes a receipt to
  `docs/reports/kag-hyp-synthesis-audit-v1.json` — but its own report schema hardcodes
  `canonical_persistence_attempted: false`. The synthesis logic is proven; only the Postgres
  write-path is missing. This is real, scoped, and unstarted work, not a design gap.

**Verification commands** (all re-run live this session, all green):
```bash
cd packages/parent-atlas && node ../../node_modules/typescript/bin/tsc -p tsconfig.json   # exit 0
cd packages/parent-atlas && node --test test/relationship-kernel.test.mjs test/ontology-hyperedge-synthesis.test.mjs test/feature-intelligence.test.mjs   # 11/11 pass
cd sveltekit-frontend && npx vitest run src/lib/server/graph/hyperedge-contract.spec.ts   # 6/6 pass
cd sveltekit-frontend && npx vitest run src/lib/server/atlas/graph/incidence-projection-v1.spec.ts   # 7/7 pass
```

**Remaining tranche**: only `REL-FI-01` (apply the `atlas_relationships` migration, live-prove
Feature Intelligence Postgres persistence) is left unstarted from the original REL-OWNER-01
through REL-FI-01 list.

### REL-FI-01 — BLOCKED (2026-08-26): the drafted migration collides with two unrelated live tables

Attempted to apply `sveltekit-frontend/drizzle/manual/20260817_atlas_feature_intelligence_v1.sql`
live (`docker exec legal-ai-postgres psql ... -v ON_ERROR_STOP=1 < ...`). It failed partway
through with `ERROR: column "domain" does not exist` on `CREATE INDEX
atlas_features_domain_status_idx ON atlas_features(domain, status)`. Root cause, confirmed via
`\d atlas_features` live: **`atlas_features` already exists as a completely different, unrelated
table** — AST-derived structural feature facts (`tree_node_id`, `feature_namespace`,
`feature_type`, `normalized_value`, `schema_id`/`schema_version` FK to `atlas_schema_registry`,
`extractor_version`, `content_hash`), not the Feature Intelligence "product feature" concept
(`feature_key`, `feature_label`, `domain`, `parent_feature_id`, `status`, aliases) that
`feature-intelligence-repository.ts::upsertFeature()` assumes. The migration's own `CREATE TABLE
IF NOT EXISTS atlas_features (...)` therefore silently no-opped onto the wrong table before the
`CREATE INDEX` statement exposed the mismatch.

Checked every other table the migration and its sibling
(`20260818_atlas_dynamic_hyperedge_entities_v1.sql`) would create
(`atlas_relationships`, `atlas_evidence`, `atlas_feature_aliases`, `atlas_relationship_members`,
`atlas_relationship_cardinality`, `atlas_relationship_evidence`, `atlas_relationship_embeddings`,
`atlas_feature_embeddings`, `atlas_feature_state_receipts`, `atlas_dynamic_hyperedge_candidates`)
— **found a second collision**: `atlas_feature_evidence` also already exists live, as an entirely
different table (packet-level multi-modal evidence extraction keyed on `packet_key`/
`content_hash`/`ast_evidence`/`lsp_evidence`/`document_evidence`/`ontology_evidence`/
`ml_evidence`), not the Feature Intelligence `feature_id`/`evidence_id`/`relation_type`/`polarity`
join table the migration expects. No other table name collided.

**No damage done**: both colliding tables were confirmed `count(*) = 0` (empty) after the aborted
run; `CREATE EXTENSION IF NOT EXISTS vector` was a no-op (already installed); the migration run
stopped at the second statement (the failing index) so nothing past `atlas_features`'s no-op
`CREATE TABLE` executed. No data was read, written, or at risk.

**Why this is a stop-and-report finding, not a quick fix**: renaming two table names inside a
drafted-but-never-applied migration is mechanically trivial, but those names are the permanent
public API of the Feature Intelligence persistence layer (`feature-intelligence-repository.ts`
hardcodes them in every query) — picking the replacement names is a naming decision with the same
lasting-consequence shape as the semantic_512/768 five-round flip-flop and the 5-competing-
PageRank-implementations incident this repo's own CLAUDE.md already documents as a recurring
failure mode. Per this session's own established pattern (investigate and report before acting on
architectural ownership questions), this was not resolved unilaterally.

**Not done, blocked pending an operator naming decision**: renaming `atlas_features` →
(candidate: `atlas_fi_features`) and `atlas_feature_evidence` → (candidate: `atlas_fi_evidence`)
consistently across the migration SQL, `feature-intelligence-repository.ts`, and
`feature-intelligence.ts` doc comments; then re-applying the corrected migration; then running the
live persist → read-back → cleanup proof this session had planned to do next.

### REL-FI-01 — RESOLVED (2026-08-26, same session): operator chose the `atlas_fi_*` rename

Operator selected "Rename to atlas_fi_* (recommended)". Completed end to end:

1. Renamed `atlas_features` → `atlas_fi_features` and `atlas_feature_evidence` →
   `atlas_fi_evidence` (table names, every derived index name, and the one FK constraint name)
   throughout `drizzle/manual/20260817_atlas_feature_intelligence_v1.sql` and
   `packages/parent-atlas/src/core/feature-intelligence-repository.ts`. Confirmed via grep that no
   other file in the FeatureRelationshipV1 consumer graph (`adaptive-hypergraph-chain.ts`,
   `executor-plans.ts`, `hypergraph-fusion-facade.ts`, `hypergraph-ppr.ts`,
   `hypergraph-query-policy.ts`, `hypergraph-retrieval.ts`, `relationship-query-repository.ts`)
   issues raw SQL against either old name, so the rename could not silently break another caller.
2. Applied both `20260817_atlas_feature_intelligence_v1.sql` (renamed) and its sibling
   `20260818_atlas_dynamic_hyperedge_entities_v1.sql` live (`docker exec legal-ai-postgres psql -v
   ON_ERROR_STOP=1`) — both exit 0. Live-confirmed all 13 expected tables now exist:
   `atlas_fi_features`, `atlas_fi_evidence`, `atlas_relationships`, `atlas_relationship_members`,
   `atlas_relationship_cardinality`, `atlas_relationship_evidence`, `atlas_relationship_embeddings`,
   `atlas_feature_embeddings`, `atlas_feature_state_receipts`, `atlas_dynamic_hyperedge_candidates`,
   `atlas_feature_aliases`, `atlas_evidence`, `atlas_evidence_entities`. Registered both files in
   `sveltekit-frontend/drizzle/sidecar-migrations.json`.
3. Wrote a real live proof, `scripts/atlas/rel-fi-01-feature-relationship-persistence-live-proof-v1.mts`:
   `upsertFeature` → `insertEvidence` → `persistRelationship` (a real `FeatureRelationshipV1` built
   via `buildFeatureRelationship`) → `findRelationshipsForEntities` read-back → explicit cleanup
   with a post-cleanup zero-row verification query. **First run failed** with a genuine,
   previously-undiscovered bug: `error: column "r.relationship_key" must appear in the GROUP BY
   clause or be used in an aggregate function` inside `findRelationshipsForEntities()`. Root cause:
   the query's outer `SELECT r.*, ... GROUP BY r.relationship_id` relied on Postgres's
   functional-dependency optimization (grouping by a table's primary key lets you select its other
   columns un-aggregated) — but `r` there is a row from the `rels` CTE, not a base table, so
   Postgres has no primary-key metadata for it and the optimization doesn't apply. This bug could
   not have been caught by any test in the suite before this session, because this was the literal
   first time this table/query pair existed live — the migration had never been applied before.
   **Fixed** by replacing the outer `JOIN atlas_relationship_members m USING (relationship_id) ...
   GROUP BY r.relationship_id` with three independent correlated subqueries (one each for
   participants, cardinality, evidence_refs), matching the pattern already used for cardinality and
   evidence_refs in the same query — removes the redundant join, removes the GROUP BY entirely, and
   is strictly simpler than the original. Re-ran the live proof: **all steps pass, `cleanupVerified:
   true`, zero residue.** Re-ran the full `packages/parent-atlas` test suite: **267/267 pass**
   (confirms the query rewrite changed nothing observable for any existing caller/test).

**Verification commands** (all re-run live this session, all green):
```bash
cd packages/parent-atlas && node ../../node_modules/typescript/bin/tsc -p tsconfig.json   # exit 0
cd packages/parent-atlas && node --test test/*.test.mjs   # 267/267 pass
cd sveltekit-frontend && npx tsx ../scripts/atlas/rel-fi-01-feature-relationship-persistence-live-proof-v1.mts
  # {"...", "cleanupVerified": true}
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\d atlas_fi_features"
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\d atlas_relationships"
```

**REL-OWNER-01 through REL-FI-01 is now fully closed.** Every item from the original tranche list
is DONE and live-proven: domain ownership frozen in the registry, the shared kernel + both
adapters implemented and round-trip-proven, the relation-type namespace guard wired and tested,
mixed-domain `StructuralGraphSnapshotV1` feed proven, and Feature Intelligence Postgres persistence
now live-proven end to end (including a real bug found and fixed along the way).

### REL-OWNER-08 refinement — explicit `authority` on projection nodes (2026-08-26, same session)

External review of the closed tranche correctly identified one real remaining gap in the
mixed-domain incidence projection: a relation node's domain was only *inferable* from
`nodeKind`/`relationType` via the REL-OWNER-07 reserved-namespace guard, never stated explicitly.
Closed it:

- Added `authority: relationshipAuthoritySchema.nullable().optional()` to `HyperRelationV1Schema`
  (`sveltekit-frontend/src/lib/server/atlas/graph/hyper-relation-v1.ts`) — optional because a
  hand-built `HyperRelationV1` from a non-relationship-kernel producer (e.g. a tree-sitter
  `CALL_BINDING` fact) has no domain authority to report.
- `buildIncidenceProjectionFromRelationshipKernelsV1()` now carries `kernel.authority` through
  onto the `HyperRelationV1` it constructs.
- `IncidenceProjectionNodeV1` gained an `authority: RelationshipAuthority | null` field — always
  `null` on entity nodes, and on relation nodes either the real authority (when the relation came
  from a kernel) or `null` (when it did not).
- Extended the mixed-domain `GPH-PROJ` test to assert `authority === 'KAG_TAXONOMY'` /
  `'FEATURE_INTELLIGENCE'` on the two relation nodes and `authority === null` on every entity node.
- Added the fail-closed collision test the review specifically asked for: two kernels from
  different authorities sharing one literal `relationshipId` throws `DUPLICATE_RELATION_ID`, it
  does not silently coalesce them into one graph node. Confirms the existing Set-based dedup in
  `buildIncidenceProjectionV1` already had this property; there was no code bug, only a missing
  test proving it.
- Added the "unknown relationship authority is rejected" test the review asked for — confirmed via
  test that it's the zod `relationshipAuthoritySchema` enum (not the namespace guard, which only
  checks known-authority cases) that rejects an unrecognized authority string. This is correct
  layering, not a gap: `assertRelationTypeNamespace` and schema validation are two independent
  checks, not one check duplicating the other.

**Two of the review's requested REL-OWNER-07 test cases were already covered** before this
refinement (FEATURE_INTELLIGENCE minting a KAG-reserved type → reject; KAG_TAXONOMY minting an
unregistered type → reject) — see the REL-OWNER-07 section above. **"Missing evidence → reject
where domain requires it"** was also already covered, at the correct layer: `buildRelationshipKernel()`
itself does not require non-empty `evidenceRefs` (kernel construction is an identity/projection
concern, not an evidence-completeness policy), but `buildIncidenceProjectionFromRelationshipKernelsV1()`
does (`EVIDENCE_MISSING:` throw, proven in `GPH-PROJ-07`) — evidence-completeness is enforced where
the kernel is consumed for graph execution, not baked into kernel identity itself.

**Verification** (all re-run live this session, all green):
```bash
cd packages/parent-atlas && node ../../node_modules/typescript/bin/tsc -p tsconfig.json   # exit 0
cd packages/parent-atlas && node --test test/relationship-kernel.test.mjs   # 6/6 pass
cd sveltekit-frontend && npx vitest run src/lib/server/atlas/graph/incidence-projection-v1.spec.ts src/lib/server/graph/hyperedge-contract.spec.ts   # 14/14 pass
cd sveltekit-frontend && npx tsgo --noEmit   # 0 errors in any file touched this session
```

### What was explicitly NOT started this session (correctly sequenced, not skipped)

An external review proposed a much larger roadmap on top of this closed tranche:
`RelationshipGraphProjectionV1` as a new named contract, binding relation/entity ordinals into
two explicit coordinate namespaces against `CandidateOrdinalMapV1`, a `GRAPH-PROD-01..05` /
`GRAPH-PPR-01` / `GRAPH-NEIGHBOR-01` production-snapshot-and-PageRank-parity tranche, a
`QDRANT-SPARSE-01..06` / `QDRANT-POST-01..06` BM25/IDF-scope capability audit, and an
`FTS-ID-01..03` investigation into why only 21/374 raw Postgres FTS lexical hits (5.6%) currently
bind to a safe canonical packet identity. **None of this was started in this session** — it is
real, well-scoped future work, correctly sequenced by the review as separate tranches from
REL-OWNER-08, not evidence of anything left undone in the tranche this session actually closed.
Two structural points from that review are worth recording now so a future session doesn't have to
re-derive them:
- The existing `IncidenceProjectionNodeV1.gpuNodeId` scheme already implements the "two coordinate
  namespaces" property the review asked for as a new type: entities are pushed first (dense
  ordinals `0..entityCount-1`), relations are pushed after (dense ordinals continuing from there) —
  so `kind: 'entity' | 'relation'` plus contiguous-by-construction ordinal ranges already gives a
  reader everything `CandidateOrdinal` vs `RelationshipOrdinal` would, without a second parallel
  type. A future session should read this file before deciding whether `RelationshipGraphProjectionV1`
  needs to be a new contract or just a rename/thin-wrapper over what's already here.
- The FTS finding (21/374 bind rate) is a real, separate, already-diagnosed problem — the review
  correctly says not to weaken identity matching to raise recall, and to classify the 354
  unresolved hits by failure reason before touching ranking/tokenization. That work has its own
  clear next step (`FTS-ID-01`) and does not block or depend on anything in this tranche.

### GRAPH-PROD-01 — DONE (2026-08-26, same session): first production `StructuralGraphSnapshotV1`

User chose "do all 3" from a follow-up direction question (prove the mechanism on empty data /
populate real relationship data / redirect to Neo4j) and asked to continue with the layers. Before
writing any code, checked real row counts live: `atlas_hyperedges = 0`, `atlas_relationships = 0`,
`atlas_packets = 61,660`. **Zero real relationship data exists in either domain** — everything
proven in this session and the prior one was fixtures or a single throwaway proof row, immediately
cleaned up. Built the mechanism honestly against that reality rather than deferring:

1. **`readAllHyperedgesFromPostgres()`** added to `kag-hyperedge-postgres.ts` — the first bulk
   reader for `atlas_hyperedges`/`atlas_hyperedge_members` (only a writer, `persistHyperedges()`,
   existed before). Reconstructs `HyperedgeV1` via `HyperedgeV1Schema.parse()` using the
   **stored** checksum (round-trip fidelity, not re-derivation).
2. **`listAllRelationships()`** added to `feature-intelligence-repository.ts` — the first
   unfiltered bulk reader for `atlas_relationships` (the existing `findRelationshipsForEntities()`
   requires a non-empty entity-id filter).
3. **`incidence-edge-arrow-artifact-v1.ts`** (new) — the first real implementation of the
   `edgeArtifact.format === 'ARROW_IPC'` field `StructuralGraphSnapshotV1` has always declared.
   `apache-arrow@21.1.0` was a listed dependency with **zero import sites anywhere in the repo**
   before this file.
   **Real bug caught and fixed before this could be trusted as a checksum source**: the first
   implementation used `tableFromArrays()`, which auto-dictionary-encodes plain `string[]` columns
   (`Dictionary<Int32, Utf8>`) — and each independently-built dictionary gets its own internal id
   embedded in the IPC dictionary-batch header, so two calls with byte-identical logical content
   produced **different** IPC bytes (confirmed live: 1744 vs 1776 bytes for the same two-row
   table). This would have silently broken every downstream determinism/checksum-based proof
   (GRAPH-PROD-02 explicitly asked for "artifact checksum readback determinism"). Root-caused via
   a targeted byte-diff script, fixed by building each column explicitly with
   `vectorFromArray(values, new Utf8())` / `new Int32()` (never letting the library choose
   dictionary encoding), then `new Table({...})` instead of `tableFromArrays()`/`makeTable()` (the
   latter's TS type signature doesn't accept a record of `Vector<T>`, only raw typed arrays).
   Confirmed live: same-content calls now produce byte-identical IPC output. 4 new tests
   (`incidence-edge-arrow-artifact-v1.spec.ts`), all pass, including one that pins the
   determinism property so a regression here fails loudly.
4. **`scripts/atlas/graph-prod-01-build-production-structural-snapshot-v1.mts`** (new) — the
   production driver: reads real hyperedges + real relationships → converts both through their
   existing adapters into `RelationshipKernelV1` → filters to kernels matching
   `--workspace-revision` (a real multi-revision corpus must be pre-filtered to one revision before
   reaching `buildIncidenceProjectionFromRelationshipKernelsV1`, which throws on ANY mismatch
   across a batch — excluded kernels are counted and reported, not silently dropped) → derives the
   entity list from kernel participants → builds the incidence projection → serializes edges to a
   real Arrow IPC file on disk → builds and validates the `StructuralGraphSnapshotV1` descriptor →
   re-serializes the same projection a second time and confirms the checksum matches (inline
   GRAPH-PROD-02 determinism check) → writes a JSON receipt.
   **Second real bug caught and fixed by actually running it**: the first run threw
   `ENOENT` because the graph-revision string (`graph:ws:0084288f26`) was used verbatim in a
   Windows file path — colons are reserved characters in Windows paths (drive-letter separator).
   The path-sanitizing regex had `:` in its allowed-character class by mistake; removed it.

**Live run result (honest, on real — currently empty — data):**
```json
{
  "realHyperedgesRead": 0, "realFeatureRelationshipsRead": 0,
  "kernelsBuilt": 0, "kernelsIncluded": 0, "kernelsExcludedByRevisionMismatch": 0,
  "projection": { "entityCount": 0, "relationCount": 0, "unresolvedParticipantCount": 0 },
  "edgeArtifactBytes": 1008,
  "edgeArtifactChecksum": "66fbc8d1f44ceaf4531da3e1e9f4f2e373b59eeeb59d4237cc96b406b03aa354",
  "snapshot": { "nodeCount": 0, "edgeCount": 0, "canonicalAuthority": false, ... },
  "artifactChecksumDeterministic": true
}
```
Independently re-verified outside the script: re-read the on-disk `.arrow` file, recomputed its
sha256 by hand, and re-parsed it with `tableFromIPC()` — byte count, checksum, and 7-field schema
all matched the script's own report exactly. **This is a genuine, complete GRAPH-PROD-01 proof of
the mechanism, not a placeholder** — every revision binding, checksum, and file write in the
script runs the identical code path a future non-empty production run would use. What it does
**not** prove yet: PageRank/PPR on a real edge set (there are no edges), or CPU↔GPU parity — those
require real relationship data first (the "populate real KAG/FI relationship data" direction from
the same 3-way user choice, not yet started) or a redirect to the pre-existing Neo4j/
`codebase-graph.json` topology (the third direction, also not yet started).

**Verification** (all re-run live this session, all green):
```bash
cd packages/parent-atlas && node ../../node_modules/typescript/bin/tsc -p tsconfig.json   # exit 0
cd sveltekit-frontend && npx vitest run src/lib/server/atlas/graph/incidence-edge-arrow-artifact-v1.spec.ts   # 4/4 pass
cd sveltekit-frontend && npx tsx ../scripts/atlas/graph-prod-01-build-production-structural-snapshot-v1.mts
  # {"...", "artifactChecksumDeterministic": true}
cd sveltekit-frontend && npx tsgo --noEmit   # 0 errors in any file touched this session
```

**Not started** (the other two of the "do all 3" directions, correctly deferred as separate,
larger tranches): populating `atlas_hyperedges`/`atlas_relationships` with real data by running the
KAG taxonomy-promotion pipeline and/or `synthesizeOntologyHyperedge()` against real repo content;
redirecting NetworkX/cuGraph PageRank-parity work at the pre-existing, already-populated Neo4j +
`docs/graph/codebase-graph.json` topology instead of the (currently empty) HyperedgeV1/
FeatureRelationshipV1 layer.

### Follow-up (same day) — the "redirect to real topology" leg was already satisfied elsewhere

Before building anything for the Neo4j-redirect leg, checked real state first:

- **Leg 2 (populate real KAG/FI data)**: confirmed there is **no existing CLI/script that produces
  real `OntologyLinkedTupleV1` rows** (`atlas_ontology_linked_tuples` is also 0 rows, live-checked).
  This isn't "run an existing pipeline" — it's "build an NLP/ontology-extraction pipeline from
  scratch." Genuinely large, unscoped, correctly not started.
- **Leg 3 (Neo4j redirect)**: found real, populated data (Neo4j: 621,162 nodes, 30 relationship
  types, ~370K edges, 3,667 nodes already carry `pageRank`/`graphAuthorityScore` from a **prior**
  run by the already-registered `CANONICAL_OWNER` — `neo4j-gds-client.ts::runPageRankClient()`, per
  `docs/architecture/runtime-ownership-registry.json`'s `graph_analysis` entry). Before building a
  new NetworkX/cuGraph parity script against it (which would risk becoming the "6th competing
  PageRank implementation" this repo's own CLAUDE.md explicitly warns against — 5 were already
  found and catalogued in one prior audit), checked whether the parity work the review asked for
  already existed anywhere. **It does, and it already passed, on real (not literal-Neo4j, but
  real-scale, non-fixture) production data**:
  `sveltekit-frontend/docs/reports/graph-snapshot-parity/receipt.json`, data refreshed
  2026-08-26T13:13 (same day as this session):
  ```
  nodeCount: 162,234 real nodes, edgeCount: 108,156 real edges
  source: graphify/frozen-graph-snapshot-v2.json (486MB, real production corpus,
          identity-contract-v1 + tree-sitter-typescript-v1 — i.e. the AST/tree-sitter
          structural graph, a THIRD graph substrate distinct from both Neo4j and the
          HyperedgeV1/FeatureRelationshipV1 layer)
  status: PASS
  pagerankTopKOverlap: 1, pagerankCorrelation: 1, pagerankMaxDelta: ~4.9e-9
  louvainCommunityAgreement: 1 (ARI=1.0, NMI=1.0, 54,078 == 54,078 communities both backends)
  componentCount: exact match (54,078 == 54,078)
  ```
  This is real graph-scale, both-backend-executed PageRank + Louvain parity — not a toy fixture,
  and essentially a perfect result. Operator, presented with this finding, chose to treat leg 3 as
  satisfied by this existing proof rather than duplicate it against the literal Neo4j graph.

### "Find a way to wire up" (2026-08-26, same session): RelationshipKernelV1 → Neo4j projector

User asked for a concrete architectural wiring, not more design discussion. Read the real
consumer code first rather than guess: **zero files under `ace/`, `hyperrag/`, or `acp/` import
anything from this session's graph layer** (grep confirmed). ACE's actual multi-hop consumer,
`multihop-contextual-tree.ts`, talks to Neo4j directly via Cypher, matching entry nodes on
`stableKey`/`sourceRef`/`id` and walking a **hardcoded** relationship-type whitelist
(`IMPORTS|CONTAINS|BELONGS_TO_CLUSTER|REFERENCES|EVIDENCE_FOR|DOCUMENTS|CONSULTED`) that does
**not** include `ENTITY_CLASSIFIED_AS`/`CONCEPT_BROADER_THAN`. So the one correct wiring point —
following this repo's own Postgres-is-truth/Neo4j-is-mirror pattern — is a projector that writes
`RelationshipKernelV1` into Neo4j using the same `stableKey` identity, making KAG/FI relationships
*present* in the graph. It does **not**, by itself, make them traversed — extending the hardcoded
whitelist is a separate, deliberate decision this projector does not make unilaterally.

Built `relationship-kernel-neo4j-projector-v1.ts`, with a hybrid shape matching REL-OWNER-08's own
no-flattening rule: a kernel with exactly 2 participants (both real KAG predicates always are)
writes a direct binary edge; a kernel with more participants (real Feature Intelligence
relationships can be genuinely N-ary) writes an `:AtlasRelation` hub node plus one `INCIDENT_TO`
edge per participant — the same shape `incidence-projection-v1.ts` already uses for Postgres/Arrow.
Cypher relationship types can't be parameterized, so `relationType` is validated
(`^[A-Z][A-Z0-9_]*$`) before string-interpolation — proven live via a fixture using a
Cypher-injection-shaped string, confirmed skipped, not executed.

**Two real bugs found and fixed by actually running this against live Neo4j, not by review:**

1. **Participant-ordinal canonicalization bug.** `buildRelationshipKernel()`'s
   `canonicalizeParticipants()` sorts participants by **role name alphabetically**, then
   reassigns `ordinal` 0/1/2... — it does not preserve the caller's original construction order.
   The first version of both the projector and its proof assumed `ordinal 0 == "first/subject"
   participant` in a directionally-meaningful sense; live run failed with `expected 1 binary edge
   read back, got 0` because the projector — correctly, given its own logic — wrote the edge in
   the opposite direction from what the read-back query (wrongly) assumed. Fixed by renaming the
   projector's edge properties from `subjectRole`/`objectRole` to `fromRole`/`toRole` (never
   implying a semantic direction the data never asserted) and fixing the proof to derive expected
   order from the kernel's own post-canonicalization `participants` array, never from
   pre-canonicalization construction order. The original test fixture also used the wrong role
   names (`subject`/`object`) — the real KAG predicate (`entity-concept-taxonomy-v1.ts`) uses
   `entity`/`concept` — fixed to match.
2. **Incomplete-cleanup bug.** An earlier interrupted run (background task that produced no
   visible output before this turn) left real residue in Neo4j uncleaned. A later run's narrower
   `DELETE n` (only the exact edge this run tracked) then failed with
   `Neo.ClientError.Schema.ConstraintValidationFailed: node still has relationships` — a node from
   the interrupted run's leftover writes. Manually verified and removed the residue
   (`DETACH DELETE` by marker, confirmed `count(n) = 0` afterward), then hardened the proof script
   itself to use `DETACH DELETE` unconditionally in its own cleanup, rather than assuming it only
   ever needs to undo exactly what its own current run created.

**Final live run, clean, exit 0:**
```json
{
  "projection": {"kernelsAttempted": 2, "binaryEdgesWritten": 1, "hubNodesWritten": 1, "incidentEdgesWritten": 3, "skipped": []},
  "binaryReadBack": {"authority": "KAG_TAXONOMY", ...},
  "hubReadBack": [/* 3 rows, correct role/ordinal, verified as a set match */],
  "unsafeRelationTypeRejected": true,
  "cleanupVerified": true
}
```

**What this does and does not achieve**: the mechanism for projecting either domain's relationship
kernels into real Neo4j, preserving N-ary structure, is now proven live. It is proven on synthetic
fixtures only (0 real rows exist in either source table, same honesty constraint as GRAPH-PROD-01)
and **does not yet make anything traversable** by `multihop-contextual-tree.ts` — that requires
someone to deliberately decide to extend its hardcoded relationship-type whitelist, which this
session did not do.

**Files**: `sveltekit-frontend/src/lib/server/atlas/graph/relationship-kernel-neo4j-projector-v1.ts`,
`scripts/atlas/relationship-kernel-neo4j-projector-live-proof-v1.mts`.

**Correction for a stale operator note this session**: "Neo4j PageRank limitations → pivot to
NetworkX/cuGraph" is now recorded in the root `CLAUDE.md` (search "Correction (2026-08-26,
operator note)") — Neo4j's own GDS PageRank run (3,667 scored nodes) predates and is superseded by
the NetworkX↔cuGraph parity pipeline as the trusted compute path; this does not affect the
projector above, which writes graph *structure*, not PageRank scores.

**Update, same session**: the NLP sidecar ACP registration WAS done next (see section below).

### ACP registration for the miniforge NLP sidecar (2026-08-26, same session)

Closes the specific gap this file's Aug 9 audit already documented: `ACPToolRegistry.ts` had zero
references to the sidecar, so agents couldn't discover it via `GET /api/acp/tools`. Checked the
real running container first rather than guess at its capabilities: `docker ps` confirmed
`miniforge-nlp-sidecar` live on `:8095`; `GET /health` and `GET /openapi.json` gave real schemas.

**Real finding that reframes "wire GPU scripts to the sidecar"**: the sidecar's own
`/health` response is unambiguous —
`capabilities: {spacy:true, langextract:true, tree_sitter:true, treesitter_chunker:true,
ast_grep:true, networkx:true, torch:false, nx_cugraph:false, cugraph:false, cuvs:false, cupy:false}`.
**This service has zero GPU capability of its own.** The real GPU/RAPIDS path
(`atlas:cugraph:pagerank` in this same file's `BASH_WORKER_ACTIONS`) already goes through a
completely separate mechanism — `bashWorkerExecute()` → `scripts/atlas/opencode-bash-worker.mjs`
→ WSL2 bash with `useRapidsEnv: true` (conda RAPIDS activation) — that has nothing to do with this
sidecar and was already wired before this session. So "wire GPU scripts to the sidecar" was not a
coherent action as literally stated; the two systems don't overlap.

Registered 3 new ACP tools against the sidecar's real endpoints (`ACPToolRegistry.ts`):
- `nlp:capabilities` — `GET /health` (capability/health probe)
- `nlp:analyze` — `POST /analyze` (multi-pass structural/lexical/linguistic/semantic extraction;
  input schema matches the real `AnalyzeRequest` OpenAPI model exactly)
- `nlp:ast-chunk` — `POST /ast/chunk` (tree-sitter/ast-grep structural chunking; input schema
  matches the real `AstChunkRequest` model, output is the real `AstEvidenceResponseV2` shape)

All 3 support `dryRun` (added to `DRY_RUN_TOOLS`), follow the existing HTTP-tool handler pattern
(`fetch` + `AbortSignal.timeout`, matching `knowledgeSearch`/`langextractExtract`), and read the
endpoint from `ENV.NLP_SIDECAR_URL ?? ENV.MINIFORGE_SIDECAR_URL ?? 'http://127.0.0.1:8095'` (both
env vars already existed in `env.server.ts`, unused until now).

**Live-proved against the real running container**
(`scripts/atlas/acp-nlp-sidecar-tools-live-proof-v1.mts`, exit 0):
```json
{
  "nlpToolsRegistered": true,
  "capabilities": {"success": true, "data": {"status": "ok", "capabilities": {"spacy": true, ...}}},
  "analyze": {"success": true, "entityCount": 0},
  "astChunk": {"success": true, "schema": "atlas.ast.evidence.v1", "chunkCount": 2, "syntaxStatus": "CLEAN"},
  "dryRunModeWorks": true
}
```
`entityCount: 0` on the analyze call is expected, not a bug — a single short generic test sentence
doesn't reliably trigger spaCy NER; not worth a larger fixture just to prove the tool executes.

**Verification** (all re-run live this session, all green):
```bash
cd sveltekit-frontend && npx tsgo --noEmit   # 0 errors in ACPToolRegistry.ts
cd sveltekit-frontend && npx tsx ../scripts/atlas/acp-nlp-sidecar-tools-live-proof-v1.mts   # exit 0
```

**Still separate, un-started, correctly scoped as its own decision**: wiring real GPU *compute*
scripts (beyond the existing `atlas:cugraph:pagerank` bash-worker path) to anything — there is
currently no second GPU-capable service to wire them to. If GPU capability is later added to the
sidecar (torch/cugraph/cuvs/cupy flip to true), that would be a natural trigger to revisit this,
not before.

### Real networkx usage added to the sidecar, then re-checked for nx-cugraph fit (2026-08-26, same session)

User asked to align the "sidecar's networkx capability" to WSL2/RAPIDS conda. Investigation first
(grep, not guess): `python/miniforge_nlp_sidecar.py` had **zero call sites** for the already-
imported `networkx` module — `NETWORKX_AVAILABLE: true` in `/health` was purely "the package
happens to be importable" (a transitive dependency of langextract/spacy), not a real feature. The
one place in this repo that DOES compute real networkx PageRank (`cugraph-pagerank.py`) only uses
it as a CPU fallback when cuGraph is absent — nx-cugraph can't help that branch either, since it
also requires cuGraph to dispatch to. So "accelerate the sidecar's networkx" had no real target as
stated. Reported this and asked; operator chose to add a real networkx feature first.

**Added**: `_compute_entity_graph_metrics()` in `miniforge_nlp_sidecar.py` — builds a directed
subject→object graph from `/analyze`'s extracted `relationships` (currently populated only by
`_code_relationships()`'s regex extraction: `imports`/`extends`/`implements`) and computes
real PageRank (`networkx.pagerank`, falling back to `degree_centrality` if PageRank fails to
converge) per entity. Uses `backend="cugraph"` when `NX_CUGRAPH_AVAILABLE` (not currently true in
this container — the switch is forward-compat, not yet exercised). New `entity_graph_metrics`
field added to `AnalyzeResponse` (additive, backward-compatible).

**Explicitly not confused with a different real thing**: this is a **per-document** entity
centrality score (how central an entity is within one document's own asserted relationships), not
`atlas_packets.page_rank_score` (a **cross-file, corpus-wide** authority score computed by
`cugraph-pagerank.py` from a completely different import graph). Both are real, both use
PageRank, and they must never be conflated as the same signal — documented explicitly in the new
function's docstring for exactly this reason.

**Live-verified** (rebuilt the Docker image, checked version drift before deploying — Dockerfile
pins only `langextract==1.6.0`; all other packages unpinned, but this rebuild happened to resolve
identical versions to what was already running: `ast-grep-py 0.45.2`, `tree-sitter-language-pack
0.9.0`, `treesitter-chunker 4.0.0` — confirmed via `docker run --rm ... pip list` before
`docker compose up -d`, so no silent dependency drift). Real test with a code snippet containing
imports/extends/implements: relationships extracted correctly, `entity_graph_metrics` populated
with real PageRank scores, `"backend": "networkx"` (correctly, since `nx_cugraph` isn't installed
in this container). Re-ran the `nlp:*` ACP tool proof afterward — 3/3 still pass, no regression.

**Verification**:
```bash
docker run --rm deeds-miniforge-nlp-sidecar:latest python -m pip list | grep -E "tree-sitter|ast-grep|langextract"
docker compose -f docker/miniforge-nlp-sidecar/docker-compose.yml up -d
curl -X POST http://127.0.0.1:8095/analyze -H "Content-Type: application/json" \
  -d '{"text":"import { Foo } from \"./foo\"; class Widget extends Foo {}","source_type":"codebase"}'
  # -> relationships: [...], entity_graph_metrics: {"backend":"networkx","scores":{...}}
cd sveltekit-frontend && npx tsx ../scripts/atlas/acp-nlp-sidecar-tools-live-proof-v1.mts   # exit 0
```

**This repo now has three distinct real graph substrates, correctly kept separate, at three
different maturity levels**:
1. **Neo4j** (621K nodes, 30 rel types) — topology mirror, canonical PageRank owner exists and has
   run once (3,667 scored nodes). No fresh NetworkX/cuGraph parity check against it specifically.
2. **`graphify/frozen-graph-snapshot-v2.json`** (162,234 real nodes / 108,156 real edges after
   resolution) — AST/tree-sitter structural graph. NetworkX↔cuGraph PageRank + Louvain parity
   `PASS`, real data, done.
3. **HyperedgeV1/FeatureRelationshipV1 → RelationshipKernelV1 → StructuralGraphSnapshotV1**
   (this session's REL-OWNER-08/GRAPH-PROD-01 work) — mechanism fully proven, `0` real edges (no
   upstream producer has ever run against real content).

Do not conflate these three when a future session says "the graph" — always name which one.

### Session handoff (2026-08-26, end of session): next priority is real relationship data, not more plumbing

Operator agreed with the recommendation to prioritize **populating real relationship data**
(`atlas_hyperedges`/`atlas_relationships` are still 0 rows each) over further graph/ACP plumbing.
**Deliberately not started this session** — building a real NLP/ontology-tuple extraction pipeline
from scratch (confirmed earlier: no existing CLI/entrypoint produces real `OntologyLinkedTupleV1`
rows) is large, new, unscoped work, and this session's context budget was too depleted (~33%
remaining) to start it responsibly. Starting and running out of room mid-build would leave an
unverified, half-finished pipeline — the opposite of this session's discipline of proving every
piece live before moving on.

**For the next session, in priority order**:
1. **Populate real relationship data** (the actual bottleneck — everything downstream, ACE packets,
   ranking, DAG synthesis, is starved without it). Requires designing/building a real ontology-tuple
   extraction pipeline; no existing entrypoint to extend, so scope this fresh.
2. **Audit TurboVec sidecar compression** — a real, existing component (CUDA prefilter, 4-bit RAM
   ANN) that was flagged as genuinely unexamined this session. Worth checking before assuming it
   needs work.
3. **Check `daily-graphify-board.js` + `phase89:board-workflow`** before designing any new
   "pick best actions" recommendation engine — that board may already do ranking/recommendation
   work the operator described wanting.
4. **Do not** re-open nx_cugraph/WSL2 alignment — checked twice this session, no real target exists
   for it yet (see the two sections above this one).

### GRAPH-PPR-01 upgraded to RUNTIME_SMOKE_PROVEN on the real 162K corpus (2026-08-26, follow-on session)

Operator pasted a large architecture-alignment document (pgvector/Qdrant/CUDA/CandidateOrdinal/ACE
layering — canonical semantic_768 stays in Postgres, indexes are rebuildable executors, GPU receives
ordinals/bounded rows not raw corpora). Before treating any of its proposed tranches (RAPIDS-01/02,
GRAPH-PPR-01, GRAPH-FEATURE-01, etc.) as new work, audited what already exists — per this session's
own established discipline (audit before building). Finding: **far more of this was already built
than the document assumed.**

**Already real, found by reading code (not assumed from file names)**:
- `python/atlas_rapids_sidecar.py` — real FastAPI sidecar (WSL2 `atlas-rapids-cu13` conda env, port
  8098) with fail-closed `/v1/knn/exact` (cuVS brute_force) and a quarantined-experimental
  `/v1/knn/cagra`, both with packetKey+sourceRevision identity contracts, dimension/corpus/GPU-memory
  guards.
- `python/atlas_rapids_graph_runtime.py` — a **resident, revision-qualified cuGraph PageRank runtime**
  with `/v1/graph/load`, `/v1/graph/resident`, `/v1/graph/pagerank`. Already supports personalized
  PageRank (seed nodes + weights → `cugraph.pagerank(personalization=...)`), candidate-filtered
  scoring (exactly "CandidateOrdinal shortlist" from the operator's doc), revision-mismatch rejection,
  GPU-memory floor checks, and a receipt schema (`atlas.graph-pagerank-receipt.v1`) with node/edge
  table hashes for parity verification. This already **is** GRAPH-PPR-01 as specified — it did not
  need to be built.
- `sveltekit-frontend/docs/reports/graph-snapshot-parity/{manifest.json,nodes.parquet,edges.parquet}`
  — the real production graph artifact referenced elsewhere in this file's own "graph_snapshot_parity"
  sections: 162,234 nodes, 108,156 edges, `graphRevision dff9006fef66e63fb55b98de3feaeb0409ef940c...`.
- `sveltekit-frontend/src/lib/server/atlas/graph/atlas-rapids-pagerank-client.ts` +
  `src/routes/api/admin/atlas/graph/projection/load/+server.ts` — a real, revision-checked TypeScript
  client and an admin route that already POST to `/v1/graph/load`. **But** the client's own spec file
  is 100% `vi.stubGlobal('fetch', ...)` mocked — it had never actually been exercised against a live
  sidecar or the real artifact. Correctly classified per this file's own evidence rules as
  `STATICALLY_REFERENCED`, not `RUNTIME_SMOKE_PROVEN`, before today.

**What was actually done this session** (not a rebuild — a live-proof pass, exactly matching this
file's established methodology): started the WSL2 sidecar for real (`atlas-rapids-cu13`, confirmed
live GPU: RTX 3060 Ti, torch 2.13.0+cu130, cuvs/cugraph/cuml 26.06.00), then drove it directly against
the real artifact:
1. `POST /v1/graph/load` with the real `graphRevision`/`projectionRevision` — loaded 162,234 nodes /
   108,156 edges onto GPU in 1.09s, `nodeTableHash`/`edgeTableHash` matched the manifest exactly.
2. `POST /v1/graph/pagerank` (global, no seeds) — **failed** on first real run:
   `CUGRAPH_INVALID_INPUT vertex type of graph and precomputed_vertex_out_weight_sums must match`.
3. Reproduced directly in a WSL2 python REPL (not guessed) — the error message is misleading; it is
   **not** a vertex-id dtype mismatch (both sides were confirmed int64 by direct inspection). The real
   cause: `edges.parquet`'s `weight` column is `int64`, and `cugraph.pagerank`'s
   `precomputed_vertex_out_weight` requires the summed weight ("sums") column to be `float64`. Casting
   `edges_df["weight"]` to `float64` immediately after the parquet read fixed it, confirmed in the REPL
   before touching the real file.
4. **Fixed live**: `python/atlas_rapids_graph_runtime.py` — one-line cast
   (`self.edges_df["weight"] = self.edges_df["weight"].astype("float64")`) added right after the
   edges parquet read, with a comment recording the misleading error text so a future reader doesn't
   re-diagnose the same red herring.
5. Restarted the sidecar, re-ran the full sequence for real:
   - Global PageRank top-5 on the real graph: real `packetKey`/`nodeKey` identities returned, 52ms
     kernel time, `didConverge: true`.
   - **Personalized PageRank (PPR)** with 3 real seed node keys sampled from the actual corpus:
     correct propagation (seed nodes ranked highest, a non-seed neighbor packet appeared at rank 4/5
     via real graph propagation) — this is the literal "CandidateOrdinal seeded PPR" the operator's
     document asked for, proven against real data, not a fixture.
   - **Candidate-filtered scoring** (`candidateNodeKeys`, the bounded-shortlist mode): mechanically
     correct — returned exactly the requested 2 candidates in the requested count/shape. Both scored
     0.0 for this particular seed/candidate pair; not investigated further (plausible directed/PPR
     reachability, but could also be a second real issue) — flagged, not chased, to keep this pass
     bounded.

**New finding, NOT fixed (out of scope for the sidecar, belongs to the exporter)**: sampling real
`graph_node_key` values surfaced a naming bug — some keys are double-prefixed,
e.g. `packet:packet:8a51153e20db` instead of `packet:8a51153e20db`. This is cosmetic for the sidecar
(it round-trips whatever string it's given) but is a real identity-hygiene defect in whatever producer
wrote `graph-snapshot-parity/nodes.parquet` (likely `scripts/atlas/export-graph-snapshot-parity-parquet.mts`
or its upstream identity contract). Left unfixed and unclassified beyond this note — do not silently
"clean" it by stripping the prefix without checking whether some other consumer already depends on the
doubled form.

**Net effect on the runtime-ownership classification** (per this file's own vocabulary): GRAPH-PPR-01
moves from `STATICALLY_REFERENCED` to `RUNTIME_SMOKE_PROVEN` — real GPU, real 162K/108K corpus, real
personalized-PageRank propagation, real bug found and fixed by execution rather than review. The
TypeScript client (`atlas-rapids-pagerank-client.ts`) and admin route remain themselves unexercised
end-to-end (this proof drove the sidecar directly over `curl`, not through the SvelteKit layer) — that
last hop is a small, bounded follow-up, not a new build.

**This does not change the prior handoff's priority order.** Real relationship data
(`atlas_hyperedges`/`atlas_relationships`, still 0 rows) remains priority 1 — proving that the GPU
graph executor works does not manufacture the graph edges themselves. What this session's pass adds:
confidence that when real hyperedge/relationship data does land in Postgres and gets exported through
the existing `export-graph-snapshot-parity-parquet.mts` → `atlas_rapids_graph_runtime.py` path, the
GPU PPR layer underneath it is proven, not speculative. The operator's large architecture document's
core framing (Postgres canonical semantic_768 / CandidateOrdinal identity, executors are rebuildable,
GPU receives ordinals+bounded rows never raw corpora, don't create a second index/graph/cache
authority) matches what's already built here — it is describing this repo's actual shape more often
than it is proposing new shape. Treat future re-reads of that document as a confirmation checklist
against real code, not a build spec, since most of GPU-SEM/GRAPH-PPR/CandidateOrdinal it names already
has a concrete implementation in this repo.

## ACE-FEATURE-SOURCE-OWNER-01 (2026-09-03, contract proof complete; live owner still open)

The thin composition contracts now exist in
`sveltekit-frontend/src/lib/server/atlas/retrieval/search-runtime-ace-resolver-v1.ts` and
`search-runtime-feature-bundle-provider-v1.ts`. They accept already-produced candidates,
`CandidateOrdinalMapV1`, and `RetrievalRouterFeatureRowV1` values, enforce population and revision
parity, reject timestamp workspace revisions, and preserve `writesPerformed=false` and
`canonicalAuthority=false`. Focused resolver coverage passed 4/4; the existing SearchRuntime QAS
adapter coverage passed 2/2. This proves the composition boundary, not a production caller.

The remaining work is explicitly open: no production adapter currently supplies the route with the
canonical SearchRuntime candidate population, ordinal map, feature rows, and authoritative revision
tuple. The `api/ace/stream` route still uses the legacy query-only ACE cache, and the strict cache
caller census remains zero. Do not mark `ACE-CONTEXT-LIVE-02`, live strict caller adoption, or
`ACE-FEATURE-SOURCE-OWNER-01` complete from these unit tests.

An explicit adapter seam was added at
`sveltekit-frontend/src/lib/server/atlas/retrieval/search-runtime-ace-production-source-adapter-v1.ts`.
It accepts only an injected canonical source owner, rejects an incorrect implementation reference,
fails closed when that owner is unavailable, and delegates all identity/revision/population checks to
the existing resolver. Its focused tests pass 3/3. This is a production-boundary contract, not proof
that the ACE stream route has been migrated. A fresh caller audit confirms zero concrete callers of
the production adapter and zero strict `ContextManifestV2` route callers; the legacy ACE stream still
uses the query-only cache. Evidence: `docs/reports/ace-feature-source-owner-live-audit-v1.json`.

The follow-up caller trace is explicit (2026-09-03, read-only):
`atlas-semantic-tools.ts`, `semantic-search-workflow.ts`, and `rlm-search-adapter.ts`
construct the general `createAtlasSearchAdapter()` and remain legacy/QAS retrieval
callers. No caller invokes `createSearchRuntimeAceProductionSourceAdapterV1`,
`searchWithAceManifest`, or a strict `ContextManifestV2` route. The feature materializer
is referenced by ACE producer/provider contracts and specs, not by a production route.
This confirms an owner-adoption gap, not a missing second retrieval engine. Keep the gate
open and do not fabricate source injection from these general SearchRuntime callers.

The narrower provider trace is also empty: `buildSearchRuntimeFeatureBundleV1` and
`produceAceFeatureSnapshotV1` have no production callers outside contract/spec coverage.
The existing `SearchRuntime.search()` result therefore cannot be promoted into ACE by
itself; it lacks the admitted ordinal map, feature-row population, lane masks, and
revision authority envelope required by strict admission.

| Gate | Status | Evidence |
|---|---|---|
| Resolver contract and fail-closed parity | PROVEN_BOUNDED | `search-runtime-ace-resolver-v1.spec.ts` 4/4 |
| SearchRuntime feature-bundle contract | IMPLEMENTED_NOT_LIVE | provider exists; no production resolver binding |
| Canonical route source owner | OPEN | `docs/reports/ace-revision-source-owner-v1.json` |
| Live ACE stream adoption | BLOCKED | legacy query-only cache remains in `api/ace/stream` |

Next implementation gate: `ACE-FEATURE-SOURCE-OWNER-01` production adapter only. It must compose
the existing SearchRuntime result and canonical ordinal/feature owners; it must not query Qdrant,
Neo4j, or PostgreSQL directly from the route, allocate CandidateOrdinal values, or synthesize
revisions. After that adapter has a bounded dry proof, wire one ACE stream canary and test strict
cache MISS/HIT plus revision and candidate-population changes.

**Left running**: the WSL2 RAPIDS sidecar (`python/atlas_rapids_sidecar_graph.py`, PID varies per
`wsl -d Ubuntu -e bash -lc "pgrep -f atlas_rapids_sidecar_graph"`) is still up on `127.0.0.1:8098`
with the 162K graph resident, for anyone continuing this thread without a cold restart. It is a local
dev process with no persistence — killing it is always safe; the artifact and fix are what's durable.
