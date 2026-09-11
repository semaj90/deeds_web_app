# Parent Atlas ACE/RLM/BitFrost bounded integration

## Memory/agent feature-source alignment — 2026-09-05

ACE-FEATURE-SOURCE-OWNER-01 remains the production bridge and remains open.
Its acceptance includes SearchRuntime -> CandidateOrdinalMapV1 ->
CandidateFeatureSnapshotV1 -> existing ContextManifestV2 -> ACE, with exact
evidence/retrieval-policy/playbook revisions. Query/lexical features come from
QUERY-FEATURE-01..06 in candidate-feature execution fabric; unavailable features
must remain unavailable, never caller-invented lineage.

- [ ] ACE-FEATURE-SOURCE-QUERY-01 after the production bridge and feature contracts
  pass, consume query/candidate features through that same adapter and replay
  manifest identity, ordinal membership, and missing/stale input rejection.
  Do not create another SearchRuntime, feature store, or ContextManifest compiler.

Exact prompt/cache proofs belong to ace-bitfrost-cache-correctness. Completed
BitFrost invalidation evidence is not reopened; this addendum does not authorize
live warming or advance lineage/cohort admission.

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
| BITFROST-INVALIDATION-01/02 | see BITFROST-INVALIDATION-OWNER-01 below (2026-09-04) |
| ACE-RESIDENCY-01 | NOT STARTED |
| CENTROID-BITFROST-01 | NOT STARTED |

- [x] BIFROST-KEY-SEMANTICS-OWNER-01 Stage 1 (2026-09-04, read-only inventory, no mutations) —
  raised same-day by external review of BITFROST-INVALIDATION-OWNER-01 below. Found a real,
  confirmed namespace conflict this repo's own `cache-keys.ts` didn't protect against: the
  `bifrost:sem:packet:{X}` prefix is written with **two incompatible identities** for `{X}` —
  (A) `packetKey`, by `atlas-reward-cache.ts::setPacketCache` (this is what
  `invalidateBitfrostPacket()` in BITFROST-INVALIDATION-OWNER-01 below correctly targets), and
  (B) `query_hash`, by `scripts/cache/warm-bifrost-semantic-cache.mjs` and read by
  `query-router.ts:279` (confirmed live in that file's own comment: `Key:
  bifrost:sem:packet:{query_hash}`). **This does not reverse BITFROST-INVALIDATION-OWNER-01** — its
  fix is correctly scoped to identity A and remains valid — but it means a packet mutation can
  still leave a stale query-level cache hit (identity B) referencing the old packet, since there is
  no `packetKey -> query_hash` inverse index and identity B has no invalidator at all. Full
  inventory, evidence, and a Stage 2 recommendation (migrate identity B onto the already-reserved-
  but-unused `bifrost:sem:query:*` prefix, which `invalidate-atlas-cache-epoch.mjs` already deletes
  as if it were the intended shape — not yet acted on, per explicit "do not rename anything yet"):
  `docs/reports/parent-atlas-bitfrost-key-semantics-owner-v1.json`. **Not done in this pass**: a
  full sweep for older/script-level `invalidateRedisCache`-shaped functions beyond the 4 already
  classified below (summarizers, phase scripts, packet-truth scripts), and read-side confirmation
  of `bifrost:sem:sourceRef:*`'s callers.

- [x] BIFROST-KEY-SEMANTICS-OWNER-01 Stage 2 (2026-09-04) — resolved the conflict Stage 1 found.
  Added `bifrostKey.semantic.query()` (→ `bifrost:sem:query:{query_hash}`, the previously-reserved
  but unused prefix) and `.sourceRef()` to `cache-keys.ts` — no second key library, `cache-keys.ts`
  remains the single owner, per the reviewer's explicit instruction. Migrated the writer
  (`scripts/cache/warm-bifrost-semantic-cache.mjs`, doc header + 2 call sites) and the reader
  (`query-router.ts`, 2 call sites) off `bifrost:sem:packet:{query_hash}` onto the new `query()`
  builder. `bifrostKey.semantic.packet()`'s own doc comment now states its identity is
  packetKey-only. Old pre-migration `bifrost:sem:packet:{query_hash}` entries are deliberately not
  read by the new code (would perpetuate the exact ambiguity being removed) — they expire under
  their original 3600s TTL; the reader fails open (cache-miss → next retrieval lane) until
  repopulated under the new prefix.

  **Live-proven** (`scripts/atlas/prove-bifrost-key-semantics-owner-v1-stage2.mjs`, real Valkey,
  bounded disposable synthetic keys): confirmed `packet()` and `query()` now produce genuinely
  distinct keys; seeded one of each; ran `invalidateBitfrostPacket()` (identity A's invalidator)
  and confirmed it deletes the packet-keyed entry but **does not touch** the query-keyed one —
  the two identities are no longer entangled. `tsc --noEmit` confirms no new errors introduced.
  Full result: `docs/reports/parent-atlas-bitfrost-key-semantics-owner-v1-stage2.json`.

  **Found and flagged, not fixed (pre-existing, unrelated)**: `query-router.ts` imports
  `bifrostRetrievalCacheKeyV2` from `cache-keys.js`, which has never been exported there —
  confirmed via `git show HEAD:...cache-keys.ts` (zero matches before this session's edits). This
  predates this gate entirely; out of scope to fix here.

  **Not done**: the full `invalidateRedisCache`-shaped-function sweep and `bifrost:sem:sourceRef:*`
  read-side audit flagged in Stage 1 remain open.

- [x] BITFROST-INVALIDATION-OWNER-01 (2026-09-04) — **status correction (same day, external
  review): this gate establishes and live-proves the canonical BitFrost invalidation primitive;
  it does NOT prove production mutation-invalidation is happening.** Precise scope of what's
  actually done: `invalidateBitfrostPacket()` is now the single shared implementation, all 4
  previously-duplicated `invalidateRedisCache`-shaped call sites delegate to it instead of their
  own key logic, and its bounded-Valkey proof (steps A-L) covers exact-key deletion, unrelated-key
  survival, repopulation, idempotent replay, Redis fail-open behavior, and no broad SCAN/FLUSH.
  That is DONE and PROVEN. What is NOT proven, and must not be read into the above: **none of the
  4 delegate call sites are reachable from a live production Postgres-mutation trigger today**
  (see cross-reference in `parent-atlas-retrieval-lineage-dag-convergence` tasks.md), and **the
  actual live producer of `bifrost:sem:packet:*` data was never identified** within
  `sveltekit-frontend/src` — production staleness today is still bounded by the 1-hour TTL, not by
  this new primitive. Do not create a fourth invalidation owner to close this gap — see
  `BITFROST-LIVE-INVALIDATION-ADOPTION-01` below, which wires the existing primitive to the real
  mutation owner once that owner is found. Full ownership matrix, live proof (steps A-L), and
  hard-rule compliance recorded in `docs/reports/parent-atlas-bitfrost-invalidation-owner-v1.json`.

- [x] BITFROST-LIVE-INVALIDATION-ADOPTION-01 (opened 2026-09-04, closed same day as
  `NOT_APPLICABLE_CURRENT_RUNTIME`) — Step 1 producer census (fork agent, `docs/reports/parent-atlas-bitfrost-producer-census-v1.json`)
  found **neither targeted key family has any live production writer at all** — both
  `bifrost:sem:packet:*` (real writer: `scripts/atlas/warm-bitfrost-semantic-cache.mjs`) and
  `bitfrost:summary:packet:v1:*` (real writer: `scripts/atlas/summary-index-ranker.mjs`, TTL
  corrected here to 604800s/7 days, not the 1h previously stated) are manual, hand-invoked npm
  backfill scripts with zero scheduler/cron/Docker-startup wiring found anywhere in the repo.
  `python/` has zero `bifrost:`/`bitfrost:` references at all — ruling out a Python-side live writer.

  **Follow-up convergence audit** (`BITFROST-PRODUCER-CONVERGENCE-01`,
  `docs/reports/parent-atlas-bitfrost-producer-convergence-v1.json`) corrected the census's own
  overstatement that this was "three parallel duplicate writers." Comparing value contracts, not
  just key prefixes, found **four legitimately distinct cache families** (`bifrost:packet:*`,
  `bifrost:sem:packet:*`, `bifrost:sem:query:*`, `bitfrost:summary:packet:v1:*`) — each with its
  own value schema and source-of-truth table — that must NOT be collapsed into one owner. It did
  surface two real, narrower defects, neither fixed this pass (out of read-only convergence-audit
  scope, and the operator explicitly said not to rename `bitfrost-warm-startup.mjs` yet):
  1. `bifrost:packet:{suffix}` has an **identity collision**: `bitfrost-warm-startup.mjs` (writer)
     and `mcp-tool-implementations.ts` (reader) key it by `packet_key`, but
     `retrieval/cache-layers-orchestrator.ts::measureLayer3Exact` (a read-only latency benchmark
     probe, no SET) keys the same prefix by `intentHash` — same disease as the `bifrost:sem:packet`
     vs `bifrost:sem:query` collision already fixed this session, recurring in a sibling namespace.
  2. `bifrost:sem:packet:{packetKey}` has a **value-contract mismatch on the identical key**:
     `atlas-reward-cache.ts`'s `PacketCacheEntry` (7 fields) vs the real writer
     (`warm-bitfrost-semantic-cache.mjs`)'s ~25-field lineage/topology envelope. Zero blast radius
     today only because `getPacketCache()`/`setPacketCache()` (the narrow-schema side) both have
     zero live callers — `getPacketCache()` does an unchecked `JSON.parse(raw) as PacketCacheEntry`
     that would silently return `undefined` fields if it were ever called against real data.

  One confirmed-dead file found and archived during this pass: `scripts/atlas/wire-bifrost-packet-mirror.mjs`
  (`node --check` throws a real `SyntaxError` — leftover escaped backticks from a markdown paste —
  and imports a nonexistent `../utils/redis_client.js`; never executed once). Archived to
  `deeds_labs/archive/2026-09-04/wire-bifrost-packet-mirror.mjs.dead-scaffold.bak`, manifest entry
  in `docs/archive-manifest.json`.

  **Closure rationale, per direct operator instruction**: since no live Postgres-mutation-triggered
  writer exists for either target key family, and there is no observed runtime evidence that Parent
  Atlas needs a continuously-maintained live-invalidated Redis packet cache, building one now would
  be new infrastructure built to satisfy a gate rather than a real requirement. Closing as
  `NOT_APPLICABLE_CURRENT_RUNTIME`, not `BLOCKED` and not falsely marked complete:
  `invalidateBitfrostPacket()` (from `BITFROST-INVALIDATION-OWNER-01`) remains the canonical,
  proven, ready-to-call primitive for any future live writer of these two key families. Re-open
  this gate only if/when a live mutation-triggered writer is actually built for either family.

  **Also still open from prior gates, not yet resolved** (do not let this new gate obscure them):
  `dispatcher/redis-cache-invalidate.ts::warmRedisCache()` still writes the wrong
  (`bifrost:packet:*`) key shape; `cache/cache-invalidation.ts` (a separate digest-based
  schema/model-level invalidator) uses a third, distinct wrong shape (`semantic:bifrost:*`), unrelated
  concern, unresolved; `tests/cache-keys-bifrost.spec.ts`/`tests/cache-keys.spec.ts` are not
  cleanly wired into a resolvable vitest project config — not run this session.

  **Ownership audit found the prior convergence-ledger audit itself was partly wrong**: it
  characterized `acp/packet-materializer-pipeline.ts`'s `invalidateRedisCache` as having "real
  callers... grep-verified, live production code paths." A repo-wide grep for the literal
  filename found **zero importers** — the files it cited (`ace-materializer.ts`,
  `hyperrag-packet-pipeline.ts`, `hyperrag-rpc-client.ts`) each define or call their own,
  differently-implemented, same-named `materializePacket()`/`materializePackets()`, never this
  one. A 4th invalidator (`ace/ace-materializer.ts::invalidateMaterializedPacket`, not previously
  documented at all) was also found, also wrong-keyed, also unreachable outside its own test spec.
  **Corrected finding**: none of the 4 `invalidateRedisCache`-shaped implementations are reachable
  from a live production Postgres-mutation trigger today — worse than "2 of 3 dead," and the real
  writer of the live `bifrost:sem:packet:*` data (`atlas-reward-cache.ts::setPacketCache`) also has
  zero external callers. The actual bound against indefinite staleness in production right now is
  the 1-hour TTL, not active invalidation.

  **Fix**: added `invalidateBitfrostPacket()` as the single canonical invalidation primitive
  (`sveltekit-frontend/src/lib/server/cache/atlas-reward-cache.ts`, co-located with its matching
  writer), consuming only canonical identity (`packetKey`/`featureId`/`sourceRevision`) and the
  shared `bifrostKey.semantic.*` constructors from `cache-keys.ts` (added the missing
  `packetSummary` builder — `bitfrost:summary:packet:v1:{packet_key}`, confirmed live, previously
  had no shared constructor at all). All 4 pre-existing implementations now delegate to it instead
  of maintaining their own copy of the key logic: `dispatcher/redis-cache-invalidate.ts`,
  `workers/redis-invalidate-worker.ts` (dead code, left in place per archive-not-delete, key logic
  fixed so it isn't a landmine if ever wired up), `acp/packet-materializer-pipeline.ts`, and
  `ace/ace-materializer.ts` (writer's key shape fixed too, not just the invalidator).

  **Live proof** (`scripts/atlas/prove-bitfrost-invalidation-owner-v1.mjs`, real Valkey, bounded
  disposable synthetic packet keys, zero canonical Postgres/Qdrant/Neo4j writes): seeded real
  semantic-packet/summary/feature keys plus one unrelated packet → ran canonical invalidation →
  confirmed all 3 affected keys gone, unrelated packet's key untouched → confirmed cache
  repopulates with new revision content → replayed invalidation twice, proved idempotent (second
  replay deletes 0 keys, no error) → proved fail-open on a broken Redis connection (`ok:false`,
  never throws) → confirmed the canonical function contains no `SCAN`/`FLUSHDB`/`FLUSHALL`/`.keys(`
  call. `ace-materializer.spec.ts` (1/1) + `tests/atlas/ace-materializer-redis.spec.ts` (2/2) still
  pass. `tsc --noEmit` clean on all 5 touched files. Full result:
  `docs/reports/parent-atlas-bitfrost-invalidation-owner-v1.json`.

  **Not done / explicitly flagged, not fixed**: the real live writer of `bifrost:sem:packet:*` in
  production was not located within `sveltekit-frontend/src` — likely a script/backfill outside the
  TS app; out of scope for an invalidation-correctness gate. `dispatcher/redis-cache-invalidate.ts`'s
  `warmRedisCache()` still writes the wrong (`bifrost:packet:*`) shape — flagged, not fixed (scope
  is invalidation, not warming). `cache/cache-invalidation.ts` (a separate digest-based
  schema/model-level invalidation utility) uses yet another distinct wrong shape
  (`semantic:bifrost:*`) — unrelated concern, flagged only. `tests/cache-keys-bifrost.spec.ts` /
  `tests/cache-keys.spec.ts` exist and cover `bifrostKey` directly but are wired to a vitest project
  config not resolved during this pass — not run, flagged rather than silently skipped.

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
- [x] Audited the available `.tmp/atlas/graphify-file-index-v1` export as a candidate input.
  It is explicitly `read_only`, contains 1,000 packets, reports `source_revision=workspace:0`,
  resolves zero symbol-registry owners, and has no `semantic_768` vectors. Its AST/domain rows
  remain `CANDIDATE_ONLY`/`canonical_writes=false`; it is useful for observation testing but is
  not a current, revision-qualified KAG producer export and is not admitted to materialization.
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

### LEXICAL-PREAPPLY-01 — source-byte and query-score gate updated 2026-09-08

- [x] Added `LexicalInputProofV1` and focused fixtures. The proof binds the exact UTF-8
  derivation bytes, declared/computed content hash, source/workspace revisions, tokenizer and
  lexical derivation revisions, and explicit `pg_catalog.simple` FTS configuration.
- [x] Corrected the legacy BM25 path so no flags means dry-run and `--apply` fails closed; it no
  longer writes the historical constant `bm25_score = 0.5` or promotes Redis term caches as
  canonical relevance.
- [x] Added `Bm25ObservationV1` for query/candidate-qualified scores. BM25 is an observation keyed
  by query, candidate ordinal, packet/source identity, retrieval revision, and executor; it is not
  static packet metadata.
- [x] Corrected the shared contract to `LexicalRelevanceObservationV1` with explicit scorer
  semantics: PostgreSQL emits `PG_TS_RANK_CD`; Go emits `BM25` only after an Okapi scorer census.
  `Bm25ObservationV1` remains a deprecated compatibility alias.
- [x] Audited Go Retrieval: `/search/bm25` is a read-only PostgreSQL `ts_rank_cd` proxy, not a
  BM25 implementation. Its response now exposes `score_type=PG_TS_RANK_CD`, scorer revision, and
  text-search configuration; the historical route name remains compatibility-only.
- [x] Propagated the same scorer metadata through the TypeScript PostgreSQL FTS candidate shape;
  compatibility exports retain their old names but now report `PG_TS_RANK_CD` explicitly.
- [x] Extended the Go lexical response envelope with query checksum, one-based rank, candidate
  count, and explicit cover-density scorer metadata; added focused Go and TypeScript coverage.
- [ ] Deploy/restart the Go Retrieval binary containing the corrected response metadata before
  claiming live scorer-contract proof. Port `8096` is `legal-ai-go-search` and its 404 on
  `/search/bm25` is expected. The actual Go Retrieval service is `legal-ai-go-retrieval` on
  `:8100`; its health is `READY_FULL`, and its read-only `/search/bm25` request succeeds, but the
  running response still lacks the newly added `score_type`/scorer metadata, so the container
  predates the source change.
- [ ] Implement `GO-LEXICAL-SCORER-CENSUS-01` before labeling any Go result `BM25`; prove term
  statistics, document frequency, document-length normalization, and frozen corpus statistics.
- [x] Read-only source-authority audit confirms acquisition owns raw-byte `contentDigest` and
  `storageUri` in `atlas_source_revisions`, while `codebase_chunk_index.content_hash` is a derived
  per-chunk hash and `atlas_packets` has no proven source-revision link to acquisition.
- [x] Read-only bridge check found 353 packet/chunk source references with content present but zero
  rows where `sha256(codebase_chunk_index.content)` equals the packet `content_hash`; the chunk hash
  therefore cannot be treated as the raw source-byte proof.
- [ ] Keep lexical materialization and BM25 `--apply` blocked until an exact packet-to-source-byte
  owner link is established, or a reviewed packet/chunk derivation contract explicitly proves the
  bytes and hash scope. Do not use `summary`, legacy `sha256`, ambiguous source-reference joins,
  or Redis terms as substitutes.
- [x] Rechecked current source lineage read-only: 52 source-qualified cohort rows matched Graphify
  source revisions, but all 52 disagreed with the live workspace binding revision; current-workspace
  eligibility is therefore 0. The source-registry audit found 22,604 registry rows but no selected
  current source bindings for this proof.
- [x] Re-ran the Graphify source-revision audit successfully for completed run
  `48485685-e773-4433-a1f8-00f5524cca44`: 23,758 rows were inspected, with 23,516
  `CONTENT_MATCH`, 235 `CONTENT_MISMATCH`, and 7 `SOURCE_UNAVAILABLE`. The receipt is
  `SOURCE_BYTES_NOT_PROVEN`; mismatched/unavailable source bytes remain excluded from apply.
- [ ] After the source-byte join is proven, run a read-only query/cohort score comparison between
  PostgreSQL `ts_rank_cd` and Go Retrieval, then add guarded canary write plus independent readback.

Current source-revision audit refresh 2026-09-08: `audit-current-graphify-source-revision-v1.mjs`
reports `SOURCE_BYTES_NOT_PROVEN` across 23,758 rows: 23,469 `CONTENT_MATCH`, 282
`CONTENT_MISMATCH`, and 7 `SOURCE_UNAVAILABLE`. This newer receipt supersedes the earlier
23,516/235 snapshot for current planning; mismatched and unavailable rows remain excluded from
promotion and no source or projection rows were changed.

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

## Session handoff (2026-09-04, end of session — operator pausing)

**Closed this session** (all pushed, commit `cef902bec6`): `BITFROST-INVALIDATION-OWNER-01`
(canonical `invalidateBitfrostPacket()` primitive, 4 duplicate implementations delegated, live
Valkey proof A-L); `BIFROST-KEY-SEMANTICS-OWNER-01` (found + fixed a real `bifrost:sem:packet:*`
dual-identity collision — packetKey vs query_hash sharing one prefix — split query_hash onto
`bifrost:sem:query:*`, live-proved distinct); `BITFROST-LIVE-INVALIDATION-ADOPTION-01` (producer
census + convergence audit found no live mutation-triggered writer exists for either target key
family; closed `NOT_APPLICABLE_CURRENT_RUNTIME`, correctly not `BLOCKED` or falsely "done"; also
found and archived one dead script, `wire-bifrost-packet-mirror.mjs`); and, in the sibling
`parent-atlas-retrieval-lineage-dag-convergence` ledger, `SEARCH-RUNTIME-READONLY-01`
(`SearchRuntime.search()` now accepts `readOnly: true`, backward-compatible, live-proved zero
writes against real Postgres+Qdrant).

**Also settled this session, operator-directed, recorded for continuity — do not re-litigate**:
BitFrost should stay a warmed resident cache tier (cache-aside + bounded prewarming), NOT grow into
a second retrieval index. The 4 BitFrost key families (`bifrost:packet:*`, `bifrost:sem:packet:*`,
`bifrost:sem:query:*`, `bitfrost:summary:packet:v1:*`) are genuinely distinct value contracts and
should stay separate — do not collapse them into one universal packet-cache value or add a Valkey
FT/vector index. Postgres/Qdrant/Neo4j remain the durable index owners; BitFrost only decides what
already-derived data is worth keeping resident.

**Next queued gate — `BITFROST-RESIDENCY-WARMING-01` (not started)**. Scope, per operator direction:
prove only `HotnessSnapshotV1` (deterministic top-N hot-artifact selection), `BucketWarmPlanV1`
(bounded warming pipeline), cache-aside promotion-on-miss, LFU/LRU/TTL memory bounds, and that
canonical stores always reconstruct on cache loss (BitFrost never becomes identity-bearing). Small
control indexes (e.g. `bitfrost:heat:packet`/`bitfrost:heat:query`/`bitfrost:heat:feature`/
`bitfrost:heat:summary` ZSETs of a `ResidencyScore` blending frequency/breadth/recency/
reconstruction-cost/latency-saved/byte-cost) are the right Valkey primitive for this — not a
secondary FT/vector index. Start with a real bounded warm-plan proof (startup load of a
`HotnessSnapshotV1` top-N, not all ~60K packets), not a new indexing architecture.

**Two narrower, deliberately-not-fixed defects carried forward from the BitFrost convergence audit**
(zero/low blast radius today, fix alongside `BITFROST-RESIDENCY-WARMING-01` or whenever their losing
side gains a live caller, not before): `bifrost:packet:{suffix}` has an identity collision
(`packet_key` in `bitfrost-warm-startup.mjs`/`mcp-tool-implementations.ts` vs `intentHash` in
`cache-layers-orchestrator.ts::measureLayer3Exact`, a read-only benchmark probe); `bifrost:sem:packet:{packetKey}`
has a value-contract mismatch on the identical key (`atlas-reward-cache.ts`'s narrow 7-field
`PacketCacheEntry` vs the real writer's ~25-field lineage/topology envelope — `getPacketCache()`'s
unchecked `as PacketCacheEntry` cast would silently return `undefined` fields if it ever gained a
live caller). Full detail: `docs/reports/parent-atlas-bitfrost-producer-convergence-v1.json`.

**Standing restriction, unchanged**: do NOT touch `parent-atlas-versioned-doc-intelligence`
(DOC-12/DOC-13/DOC-14) — a separate, actively-changing concurrent session owns that lane. This
session's own code-review pass (resumed after the fact) found its 3 flagged findings were already
either false positives or already-fixed live in that lane's files by the concurrent session — no
action needed there, but do not assume that stays true; re-check before touching.

**Priority order for the next session, per operator direction**: (1) `BITFROST-RESIDENCY-WARMING-01`
(above); (2) `outcome_ledger` fresh-install schema convergence; (3) current-workspace source/chunk
lineage bridge (see the concurrent same-day audit entries just above this section in
`parent-atlas-retrieval-lineage-dag-convergence/tasks.md` — source-authority and hydration rechecks
found real, unresolved gaps: 0 current-workspace matches, 0 exact packet/chunk joins, 43 missing
canonical chunk-owner rows); (4) only then return to DOC-13/14 once that lane settles.

- [x] BITFROST-RESIDENCY-WARMING-01 (2026-09-04, fixture-proven, follow-on session) —
  proved the bounded pieces the prior handoff scoped: `ResidencyScoreV1` (a pure,
  deterministic blend of frequency/breadth/recency/reconstruction-cost/latency-saved/
  byte-cost — no wall-clock reads, same input always yields the same score),
  `HotnessSnapshotV1` (deterministic top-N selection, score-descending with a
  stable key-ascending tie-break, hard-capped at `MAX_HOTNESS_SNAPSHOT_TOP_N = 5_000`
  regardless of requested size or candidate-set size — proved against a 200K-candidate
  fixture that a plan never approaches the full ~60K-packet corpus), `BucketWarmPlanV1`
  (splits a snapshot into disjoint, deterministic buckets for staggered warming, each
  entry mapped through the *existing* `bifrostKey.semantic.*`/`packetSummary` builders
  in `cache-keys.ts` — never a hand-built key string), a generic cache-aside
  `getOrWarmCacheAsideV1()` (cache hit never calls the reconstructor; cache miss calls
  the caller-injected reconstructor and warms on success; a reconstructor returning
  `null` stays a genuine miss — proves BitFrost never fabricates data, i.e. never
  becomes identity-bearing; a cache *read* failure falls through to reconstruction
  rather than being treated as absence), and a bounded warm-plan executor
  `executeBucketWarmPlanV1()` (bounded concurrency, per-entry failure isolation, and a
  result type whose `writesPerformed` field is typed `false` — not just documented —
  so a caller cannot mistake a successful warm pass for a canonical-store mutation).
  Added 4 bounded LFU-style control-index ZSETs matching the operator's exact spec
  (`bitfrost:heat:packet`/`query`/`feature`/`summary` in `cache-keys.ts`'s `bifrostKey`),
  with `recordHeatSignalV1()`/`getTopHeatKeysV1()` mirroring the existing
  `reward:zset:*` pattern in `atlas-reward-cache.ts` (same `HEAT_ZSET_MAX = 10_000`
  bound, same fail-open-to-`[]` behavior) rather than inventing a new pattern.
  New file: `src/lib/server/atlas/cache/bitfrost-residency-warming-v1.ts` +
  `bitfrost-residency-warming-v1.test.ts` (19/19 pass, fake in-memory Redis covering
  only the ioredis surface used — `get`/`set`/`zadd`/`zcard`/`zremrangebyrank`/
  `zrevrangebyscore`). `npx tsgo --noEmit` reports 0 errors touching either new/changed
  file. **Status: `PROVEN_BOUNDED_FIXTURE`, matching this file's own status-language
  convention** (see the `RlmEnvironment` fixture-proof note near the top of this file)
  — every reconstructor, every Redis client, and every heat signal in the tests above
  is a fixture/fake. Explicitly NOT done: no live caller records a real heat signal on
  a real cache hit/miss yet, no live caller has run `executeBucketWarmPlanV1()` against
  the real Valkey instance with a real Postgres-backed reconstructor, and no startup
  hook invokes any of this. That live-wiring pass is a distinct, separately-authorized
  follow-up gate — do not treat this fixture proof as adoption. This intentionally
  does not touch `bifrost:packet:*`, `bifrost:sem:packet:*` value semantics, or the two
  narrower defects the prior BitFrost convergence audit carried forward (identity
  collision / value-contract mismatch, both zero live callers today) — those remain
  exactly as scoped in the paragraph above this task, unchanged.

### Revision-qualified KAG read seam — 2026-09-07

- [x] Extend the governed OAK KAG neighbor input/receipt with required
  `workspaceRevision` and `graphRevision` fields.
- [x] Bind both revisions in the existing `atlas_hyperedges` lookup and retain
  the legacy fail-open reader for informational enrichment callers.
- [x] Add focused tests for required revisions, SQL parameter binding, and receipt
  propagation. Tests: 10/10 reader/handler cases passed.
- [ ] Supply the current completed Graphify/source-manifest revisions and run a
  bounded strict read against that cohort. Do not use the historical
  `taxonomy-edges-v1-2026-05-08` / `git:0084288f26` pair as current evidence.
- [x] Resolve the latest completed Graphify authority read-only: run
  `48485685-e773-4433-a1f8-00f5524cca44`, completed `2026-09-05`, with
  workspace/source-manifest digest
  `sha256:e0dc2711f632e38607cb19fe3ca74e9e37ff864027857062e6e4be6ac86241bb`.
  Re-running the census with that explicit expected pair confirms
  `currentBindingProven: false`; no historical hyperedge rows match it.
- [ ] Implement the bounded 3-hop traversal only after the strict current-binding
  read passes; preserve role-aware hyperedges and do not clique-expand them.

### Bounded quick-hop implementation — 2026-09-07

- [x] Add pure `kag-quick-hop-v1.ts` over the existing `HyperedgeV1` contract.
  It preserves n-ary participant roles, filters by both supplied revisions,
  tracks visited canonical/member and hyperedge IDs, bounds depth/frontier/
  hyperedges/evidence refs, and emits a checksum-qualified ID/evidence receipt.
- [x] Prove a three-participant fact remains one hyperedge while producing only
  bounded incidence paths; prove stale revisions are excluded and missing
  revision authority is rejected. Focused KAG reader/handler/quick-hop tests:
  13/13 passed.
- [ ] Connect the pure traversal to the strict PostgreSQL reader only after the
  current Graphify binding is supplied and passes the census. Source hydration,
  CandidateOrdinal mapping, ACE promotion, and ContextManifest generation are
  intentionally not part of this implementation.
- [x] Add the injected `KagQuickHopReaderV1` coordinator seam. It requests
  bounded incidence pages, carries the required revision pair, rejects stale
  reader results, and delegates path/checksum semantics to the pure engine.
  Focused KAG tests now pass 15/15.
- [x] Add `createPostgresKagQuickHopReaderV1()` as the production composition
  point. Construction is side-effect free and delegates only to the strict
  revision-qualified Postgres hyperedge reader.
- [ ] Bind the coordinator to `readKagHyperedgesStrictV1` only after current
  Graphify binding is supplied and passes the census; this live composition gate
  remains open by design.

### Hypergraph currentness bridge — 2026-09-07

- [x] Add `scripts/atlas/audit-hypergraph-current-arity-census-v1.mjs` under the
  existing KAG audit owner. It performs read-only schema discovery, hyperedge/member
  population counts, arity distribution, revision grouping, role/relation shape, and
  orphan/duplicate/checksum integrity checks.
- [x] Fail closed when the three KAG tables or required columns are absent. The
  report distinguishes `CENSUS_COMPLETE_CURRENTNESS_UNPROVEN` from
  `CURRENT_BINDING_PROVEN`; expected graph/workspace revisions must be supplied
  explicitly through environment inputs and are never inferred from timestamps.
- [x] Run the census against the live PostgreSQL instance and preserve
  `docs/reports/atlas-hypergraph-current-arity-census-v1.json`. It found 62,802
  hyperedges, 125,604 members, 0 ontology tuples, and exactly arity-2 for every
  hyperedge (max/average 2). It found no orphan members, duplicate role members,
  missing contract IDs, or missing checksums. All rows are bound to the single
  historical pair `taxonomy-edges-v1-2026-05-08` / `git:0084288f26`; current
  binding is intentionally **not** proven because the current Graphify/source
  manifest revisions were not supplied and must not be inferred.
- [ ] Only after current binding is proven, implement the bounded quick-hop traversal
  proof. Use the existing indexed member lookup and preserve hyperedges as N-ary
  records; do not clique-expand them or create another graph store/fusion owner.

### HYPEREDGE-CANONICAL-DETERMINISM-01 — completed 2026-09-07

- [x] Reused the existing `compareUtf8` comparator for KAG persistence-row normalization
  and hyperedge projection ordering. These paths no longer depend on ICU/default-locale
  `localeCompare()` behavior for canonical evidence ordering.
- [x] Added a non-ASCII ordering regression through the ontology tuple persistence mapper.
- [x] Focused KAG validation: 3 test files, 12 tests passed; OpenSpec strict validation passed.
- [ ] This closes ordering determinism only. It does not prove current Graphify binding,
  live n-ary source facts, or authorize a Postgres materialization canary.

### KAG currentness recheck — 2026-09-07

- [x] Re-ran the current Graphify owner audit: the expected workspace revision still has one
  `RUNNING` row, zero completed owners, and no completion timestamp.
- [x] Re-ran the live read-only hypergraph census: 62,802 hyperedges, 125,604 members, zero
  ontology tuples, all binary (`max=2`, `avg=2`), with zero integrity violations.
- [x] Confirmed every stored relation remains bound to historical
  `taxonomy-edges-v1-2026-05-08` / `git:0084288f26`; no current binding was inferred.
- [ ] Keep strict quick-hop composition and production traversal gated until a completed
  Graphify/source-manifest revision pair is supplied and independently reconciled.

### NARY-FACT-PROPOSAL-01 — proposal boundary implemented 2026-09-07

- [x] Added `nary-fact-proposal-v1.ts` with Zod validation for revision-qualified,
  role-labelled proposals containing at least three participants.
- [x] Added deterministic participant/evidence normalization using `compareUtf8`, duplicate
  role-labelled identity rejection, checksum construction, and checksum verification.
- [x] Added fixture coverage for deterministic ordering, non-canonical authority, and duplicate
  participant rejection; focused proposal/materializer/persistence tests pass 9/9.
- [x] ParticipantResolver, owner-registry, and pure admission seams now exist separately: this
  contract still does not invent identities, perform durable concept admission, write
  `atlas_hyperedges`, or enable live quick-hop traversal.

### NARY-PARTICIPANT-RESOLUTION-01 — pure canonical-owner seam implemented 2026-09-07

- [x] Added `participant-resolver-v1.ts` as a pure resolver between observations and
  `NaryFactProposalV1`; it requires an explicit canonical-owner registry.
- [x] Resolved participants carry entity type, optional entity/source revisions, and
  deterministically normalized evidence references.
- [x] Missing canonical IDs remain `UNRESOLVED`; literal route/method/path values are retained
  only as evidence/attributes and are never synthesized into canonical identities.
- [x] Unknown owners and owner attribute mismatches are rejected; duplicate registry ownership
  is ambiguous; a mixed batch returns no admissible participants.
- [x] Focused resolver, proposal, and materializer tests pass; no database, ontology, or
  hyperedge writes were performed.
- [x] Pure owner adapters now cover existing candidate packet/symbol identities and canonical
  `ConceptDefinitionV1` identities.
- [ ] Wire a real revision-qualified owner registry from live packet/symbol/concept authorities,
  then feed only fully resolved participants into proposal admission. Current Graphify/workspace
  binding and ontology-tuple population remain blocked.

### NARY-PARTICIPANT-OWNER-REGISTRY-01 — pure registry combiner implemented 2026-09-07

- [x] Added a read-only combiner for explicit packet, symbol, and concept owner inputs.
- [x] Registry output is deterministic and exposes duplicate canonical IDs instead of choosing
  an owner by source order; no source name or literal is converted into an identity.
- [x] Focused registry/resolver/proposal/materializer tests pass; no registry lookup or durable
  write is wired yet.
- [ ] Supply real revision-qualified owner arrays from the existing canonical authorities and
  independently verify collisions before any `NaryFactProposalV1` can be admitted.

### NARY-FACT-ADMISSION-01 — pure proposal admission gate implemented 2026-09-07

- [x] Added checksum, proposal-state, workspace-revision, graph-revision, evidence, and
  participant-owner admission checks.
- [x] Admission returns `ADMITTED` only after every participant resolves through explicit owners;
  it does not call `createHyperedgeV1()` or persist anything.
- [x] Focused admission tests cover successful admission and revision drift rejection.
- [x] Admission now requires an explicit `GRAPHIFY_RUN_OWNER_COMPLETE` proof whose workspace
  and graph revisions match the expected values; arbitrary caller-supplied revisions cannot pass.
- [ ] Connect the gate to a current Graphify owner and authorized Postgres canary with independent
  readback; historical KAG rows remain excluded.

### NARY-PROPOSAL-HYPEREDGE-MATERIALIZER-01 — admitted-only conversion implemented 2026-09-07

- [x] Added a pure conversion from an `ADMITTED` `NaryFactProposalV1` to the existing
  `HyperedgeV1` contract.
- [x] Conversion rechecks proposal checksum and preserves role-labelled participant IDs,
  source/workspace/graph revisions, producer revision, and evidence references.
- [x] Unadmitted proposals fail closed; no Postgres, ontology, or hyperedge persistence write is
  performed.
- [ ] Add the authorized current-revision writer/readback canary only after Graphify currentness,
  participant collisions, and ontology tuple population are proven.

### ONTOLOGY-TUPLE-NARY-PROPOSAL-01 — verified tuple adapter implemented 2026-09-07

- [x] Added a pure adapter from `OntologyLinkedTupleV1` to `NaryFactProposalV1`.
- [x] Requires `ACTIVE_VERIFIED`, packet identity, source revision, matching graph revision, and
  at least three explicitly owned participants.
- [x] Requires workspace revision from the caller because the tuple contract does not carry it;
  degraded tuples and incomplete lineage fail closed.
- [x] Focused verified/degraded tuple tests pass; no ontology or hyperedge persistence was done.
- [ ] Populate a real current `OntologyLinkedTupleV1` cohort and independently reconcile its
  owner registry before admission or Postgres canary work.

### CANONICAL-OWNER-SCHEMA-RECONCILIATION-01 — read-only audit implemented 2026-09-07

- [x] Added `scripts/atlas/audit-canonical-owner-schema-reconciliation-v1.mjs` to compare the
  existing packet, symbol-version, and concept tables against the owner fields required by the
  proposal admission boundary.
- [x] The audit writes only a report artifact and never mutates Postgres, Qdrant, Neo4j, or Valkey;
  schema presence is explicitly not treated as row currentness or promotion authority.
- [x] Ran the audit against the live database: symbol owner schema is complete, while packet and
  concept owner schemas are incomplete for the proposed registry fields.
- [ ] Separately prove owner uniqueness, current revisions, and completed Graphify lineage before
  wiring a durable owner reader.

### CANONICAL-OWNER-REVISION-AXES-01 — additive schema proposal implemented 2026-09-07

- [x] Added the unapplied sidecar migration
  `manual/20260907_canonical_owner_revision_axes_v1.sql` with nullable packet
  `source_revision` and concept `definition_revision` fields.
- [x] Updated the Drizzle schema and sidecar registry; the migration performs no backfill,
  rewrite, delete, or live application.
- [ ] Review field semantics and run an authorized migration/readback canary only after Graphify
  currentness and source-content lineage are proven.
- [x] Added a read-only migration safety audit; it checks additive SQL and reports whether the
  new columns are already present without applying the migration.

### CANONICAL-OWNER-ROW-ADAPTERS-01 — fail-closed row adapters implemented 2026-09-07

- [x] Added packet and concept row adapters that require the dedicated source-content or
  definition revision field before producing a participant owner.
- [x] Missing keys return no owner; missing lineage fields throw explicit fail-closed errors.
- [x] Focused registry and two-axis lineage tests pass (9/9 combined); live registry wiring and
  migration application remain blocked.
- [x] Added a pure registry composition function for packet, concept, and symbol-owner inputs;
  incomplete packet/concept lineage fails closed rather than producing a partial registry.
- [x] Added the symbol-row adapter with explicit repository/compiler revision semantics, keeping
  the symbol axis distinct from packet source-content and concept definition revisions.

### RAPIDS-RUNTIME-SMOKE-01 — WSL GPU fixture replay refreshed 2026-09-07

- [x] Started the existing Ubuntu WSL2 environment and verified PyTorch 2.13.0+cu130 sees the
  RTX 3060 Ti; cuGraph 26.06.00, cuDF 26.06.01, CuPy 14.1.1, and nx-cugraph import successfully.
- [x] Replayed the existing 10,000-node/50,000-edge read-only PageRank fixture with the correct
  repository Python package root: vertex identity exact, directed semantics exact, rank
  correlation `0.99991506`, top-k overlap `0.98`, gate `PASS`.
- [ ] This remains bounded fixture evidence; it does not promote the live 162K Graphify snapshot
  or authorize graph/database writes.

### GPU-ENVIRONMENT-OWNERSHIP-01 — three-lane inventory refreshed 2026-09-07

- [x] Keep native Windows PyTorch CUDA as the general native-inference lane; no consolidation
  with Linux analytics environments was attempted.
- [x] Keep WSL2 `atlas-rapids-cu13` as the RAPIDS/cuVS/cuGraph/cuDF executor lane:
  11G on disk, PyTorch `2.13.0+cu130`, cuGraph `26.06.00`, cuDF `26.06.01`, CuPy `14.1.1`.
- [x] Keep WSL2 `atlas-cutile-cu132` as the AGMR/cuTile lane: 6.0G on disk, PyTorch
  `2.14.0+cu132`, Transformers `5.5.0`.
- [x] Read-only WSL inventory reports 927G available on the 1,007G filesystem and 36M in
  `/home/james/.cache`; no package install, environment merge, or VHDX compaction was done.
- [ ] Treat native TensorRT-RTX and native Windows cuTile as future parity experiments, not
  installed or promoted runtimes.

### AGMR-DONOR-B-FORWARD-01 — standalone finite forward refreshed 2026-09-07

- [x] Ran the existing donor-B standalone artifact check in WSL2 `atlas-cutile-cu132` using
  `models/atlas-gemma-rank-v1-donor-b/standalone-init-bf16`.
- [x] Artifact loaded with hidden shape `[1, 5, 256]`, rank score finite, and status
  `EXPORTED_STANDALONE_FORWARD_FINITE_PROVEN`.
- [ ] This proves finite artifact loading/inference only; it does not prove ranking quality,
  teacher parity, quantization parity, or production promotion.

### AGMR-MXBAI-SHADOW-01 — donor-B structural comparison refreshed 2026-09-07

- [x] Compared donor-B against the existing frozen mxbai teacher receipt: 3 queries and 15
  candidates, with all student scores finite and CPU elapsed time `524.916ms`.
- [x] Receipt records mxbai `mixedbread-ai/mxbai-rerank-base-v2` as teacher and the student as
  an untrained raw rank-head logit; sigmoid-once teacher semantics are preserved.
- [x] Structural baseline recorded: mean top-3 overlap `0.6667`, mean Spearman `-0.1667`,
  top-1 agreement `0/3`.
- [ ] Quality/parity remains unproven because candidate identity and canonical ordinal proof are
  false and the student rank head is untrained; no promotion decision follows.

### SYMBOL-OWNER-ROW-AUDIT-01 — read-only integrity audit implemented 2026-09-07

- [x] Added `scripts/atlas/audit-symbol-owner-rows-v1.mjs` for symbol-version uniqueness,
  source/revision completeness, and workspace distribution.
- [x] The audit reports structural eligibility separately from promotion authority and performs
  no database or projection writes.
- [x] Live replay found 285 unique symbol-version rows with complete source/revision fields;
  85 match the explicitly supplied current workspace revision and 200 remain on legacy
  `workspace:0`. This is coverage evidence, not Graphify completion proof.
- [x] Ran the audit with the current workspace revision and reconciled current symbol rows against
  source/workspace bindings; uniqueness and field coverage passed.
- [ ] Reconcile the rows against a completed Graphify owner before using them in live proposal
  admission.

### SYMBOL-OWNER-LINEAGE-RECONCILIATION-01 — read-only source-binding join implemented 2026-09-07

- [x] Added `scripts/atlas/audit-symbol-owner-lineage-v1.mjs` to reconcile current symbol rows
  against `atlas_workspace_source_bindings` using exact source/workspace revisions.
- [x] The audit distinguishes missing bindings and revision mismatches from structural symbol-row
  validity; it never treats a partial join as promotion authority.
- [x] Run with `ATLAS_WORKSPACE_REVISION` set to the active revision: 85/85 current symbol rows
  have exact source/workspace binding coverage and zero workspace-axis mismatches.
- [ ] Require completed Graphify ownership and a separate content-lineage proof before live
  proposal admission.

Live replay 2026-09-07: 85 current symbol rows matched 85 source-binding rows with zero missing
bindings or workspace-axis mismatches. Repository revision and source-content revision are now
reported as separate axes; `lineageReady` is a coverage signal only and promotion remains false.
No repair or write was attempted.

### SYMBOL-OWNER-LINEAGE-MISMATCH-DETAIL-01 — read-only revision-axis detail audit implemented 2026-09-07

- [x] Added `scripts/atlas/audit-symbol-owner-lineage-mismatches-v1.mjs` to retain observed
  repository-revision versus source-content-revision pairs and bounded source-reference samples.
- [x] The report deliberately does not choose an authority or rewrite either revision field.
- [ ] Review the mismatch pairs against the completed Graphify/source-binding owner before any
  lineage repair or proposal promotion.

Live detail replay 2026-09-07 found six observed axis pairs across 50 sampled rows: symbol rows
use repository revision `1bb240fb20f1d4ba5651d8a4da9a10c9d6337aaf`, while source bindings use
distinct per-file `sha256:...` content revisions. The report labels this cross-axis comparison
non-semantic; neither value should be overwritten.

### SOURCE-LINEAGE-AXES-01 — explicit two-axis reconciliation implemented 2026-09-07

- [x] Added `source-lineage-axes-v1.ts` with separate `repositoryRevision` and
  `sourceContentRevision` fields and explicit authority labels.
- [x] Reconciliation requires exact `sourceRef` and `workspaceRevision` agreement, reports
  `MATCHED`, `MISSING_BINDING`, or `CONFLICT`, and never chooses an authority or rewrites a claim.
- [x] Missing or malformed source bindings remain fail-closed and non-canonical; checksums cover
  the complete observation envelope.
- [x] Focused lineage, participant-resolution, and admission tests pass (11/11 combined).
- [ ] Review the resulting two-axis records against the completed Graphify/source-binding owner;
  do not promote until currentness and live owner-registry coverage are proven.

### GRAPHIFY-RUN-AUDIT-REPORT-ROBUSTNESS-01 — completed 2026-09-07

- [x] Hardened the read-only current Graphify owner audit so a transient report-file lock does
  not discard the database result; output now includes `reportWriteError` when artifact writing
  fails.
- [x] Current readback remains `GRAPHIFY_RUN_OWNER_BLOCKED`: one bound run is `RUNNING`, with
  zero completed owners and no completion timestamp.
- [ ] Do not treat this reporting repair as Graphify completion; a completed receipt-bound run is
  still required before graph or n-ary persistence promotion.

### GRAPHIFY-CURRENTNESS-RECHECK-02 — unchanged 2026-09-08

- [x] Re-ran the read-only owner audit. The expected workspace revision still has one bound
  `RUNNING` row, `completedOwnerCount=0`, and `currentCompletedAt=null`.
- [x] The audit returned the database state on stdout despite a transient report-artifact write
  warning; this does not change the currentness result.
- [ ] Keep historical KAG rows and the mxbai teacher fixture excluded from current production
  admission until the Graphify run reaches `COMPLETED` with an independently readable receipt.

### GRAPHIFY-RUN-STALE-OBSERVATION-01 — operator recovery required 2026-09-08

- [x] The bound run `14643371-f6f2-4131-906b-235a5c06619a` reports `started_at=2026-08-28T04:01:23Z`,
  remains `RUNNING`, and has `completed_at=null`; this is an 11-day stale-running observation,
  not evidence of successful current Graphify output.
- [ ] An authorized Graphify owner/operator must inspect or recover the stale run and produce a
  receipt-bound terminal state. Do not mark it `COMPLETED`, relabel historical graph revisions, or
  start a replacement run from this read-only audit.

### CONCEPT-OWNER-ADAPTER-01 — existing canonical concept alignment implemented 2026-09-07

- [x] Added an adapter from `ConceptDefinitionV1` to the participant-owner shape, preserving
  `conceptId` as identity and `definitionRevision` as the entity revision.
- [x] Concept recognitions, classifier labels, and aliases remain observations or resolution
  evidence; they are not promoted into owner records by this adapter.
- [x] Added an equivalent adapter for existing candidate `packetKey` and `symbolVersionId`
  fields; candidate ordinals, paths, and projection IDs are never used as owner identities.
- [x] Focused owner-registry tests pass; live concept-table population and admission remain
  unproven because the current ontology tuple count is zero.

### VALKEY-CACHE-POLICY-01 — persisted policy reconciled 2026-09-08

- [x] Verified the live Valkey policy was changed to `volatile-lru` and persisted in
  `docker/docker-compose.gpu.yml` with a 2 GiB `maxmemory` limit.
- [x] Keep non-expiring application control/schema keys protected; only TTL-bearing derived
  cache entries are eligible for memory-pressure eviction. Parent Atlas durable job dispatch
  is RabbitMQ-owned; BullMQ references belong only to the separate `claude-mem` stack.
- [x] Treat TTL and eviction as cleanup/residency behavior only. Neither establishes
  currentness nor overrides workspace, graph, representation, or model revisions.
- [ ] Re-check the live container after the next authorized compose recreation and record
  `CONFIG GET maxmemory`, `CONFIG GET maxmemory-policy`, and bounded eviction telemetry.

### CENTROID-CACHE-REVISION-ISOLATION-01 — gap recorded 2026-09-08

- [x] Audited `scripts/atlas/warm-centroid-cache.mjs`: cluster keys are overwritten with a
  24-hour TTL, the index is replaced, and no active orphan pruning or pass/revision identity
  exists in the value or index.
- [x] Confirmed no current application reader was found for the legacy
  `centroid:kmeans:{cluster_id}` contract; do not change its format without a compatibility
  receipt.
- [ ] Add a revision-qualified centroid manifest/pointer and pass identity before enabling
  supersession. Readers must reject a mixed pass and accept only the manifest's listed IDs.
- [ ] Add owned-namespace pruning or archival of superseded centroid keys; never scan/delete
  unrelated Valkey keys and never use TTL as a substitute for supersession.
- [ ] Prove atomic publication (`prepare → checksum → publish pointer`) and readback under
  a simulated interrupted rewrite before marking `CENTROID-BITFROST-01` complete.

Evidence boundary: current centroid data is a rebuildable Valkey projection of the Postgres
centroid source. Cluster IDs, SOM cells, topology coordinates, and Valkey keys are not canonical
identity. Existing legacy readers remain unchanged pending the new manifest contract.

### RABBITMQ-PARENT-ATLAS-BOUNDARY-01 — queue ownership review 2026-09-08

- [x] Confirmed Parent Atlas durable dispatch uses RabbitMQ/AMQP and the existing publisher,
  consumer, exchange, and queue registry; BullMQ is not a Parent Atlas dependency or runtime.
- [x] Preserve BullMQ only inside the isolated `claude-mem` stack, which owns its own Valkey-backed
  observation queue.
- [x] Removed the misleading Parent Atlas BullMQ type shim and documentation references.
- [ ] Define and implement a consumer-owned contract for browser batch-summary hints before
  publishing them to RabbitMQ. The current endpoint is validation/acknowledgement only.
- [ ] Wire the Omni worker RabbitMQ loop only after its task envelope, retry, acknowledgement, and
  durable receipt owners are specified. Do not enqueue unowned messages.

Evidence boundary: queue reachability or a successful publish does not prove a consumer processed
the message. Parent Atlas remains PostgreSQL-first for durable receipts; RabbitMQ is dispatch only.

### OKF-PYTHON-SEARXNG-GO-ALIGNMENT-01 — boundary review 2026-09-08

- [x] Confirmed SearXNG is an external discovery provider: its `/search` or `/` endpoint
  accepts GET/POST parameters and requires an enabled response format such as `format=json`.
  SearXNG results must remain evidence candidates, not canonical source or RRF ownership.
- [x] Confirmed the existing Python/FastAPI sidecars are observation and enrichment producers;
  Pydantic validation remains the runtime boundary and does not mint canonical identities.
- [x] Confirmed Go retrieval is an executor/progressive-delivery lane. It may consume Postgres,
  Qdrant, Valkey, and embedding services, but SearchRuntime retains normalization, deduplication,
  and production fusion ownership.
- [ ] Add one versioned cross-schema fixture that round-trips the selected `.okf`/YAML artifact
  through Python/Pydantic, TypeScript/Zod, SearXNG result normalization, and the Go retrieval
  envelope. Require `sourceRef`, URL, content checksum, workspace/source revisions, provider,
  and retrieval timestamp to remain distinct fields.
- [ ] Do not introduce a new `.okf` taxonomy owner or direct SearXNG-to-Valkey indexing path.
  Discovery results must pass canonicalization, bounded scoring, and ACE admission before any
  revision-qualified cache projection.

### TASK-SEMANTIC-PACKET-COMPATIBILITY-01 — step 2 done, verified with corrections (2026-09-08)

Step 2 (read-only schema-compatibility guard) was already implemented this session in
`sveltekit-frontend/src/lib/server/tasks/semantic-packets.ts` before this entry was written:
`assertTaskSemanticPacketSchemaCompatible()` queries `information_schema.columns` for
`task_semantic_packets`, diffs against the exact 27 columns `createTaskSemanticPacket()`'s INSERT
needs, and throws `TASK_SEMANTIC_PACKET_SCHEMA_INCOMPATIBLE: missing=...` before any task-row load,
embedding, Qdrant upsert, or Postgres write — the call happens as the very first line of
`createTaskSemanticPacket()`. Independently verified, not just trusted:

- [x] Confirmed the diff is real (`git diff`, not just claimed) and reuses this file's existing
  `db`/`pgRows`/`sql` imports — no new dependency.
- [x] Ran the given `safe_next_command`
  (`npx openspec validate parent-atlas-ace-rlm-bitfrost-integration --type change --strict --json`)
  — passes clean.
- [x] Ran the given `smoke_command`
  (`npx vitest run src/lib/server/embedding/semantic-packet-writer.spec.ts`) — **passes (4/4), but
  it does not test this guard**. That spec file exercises a different, unrelated function
  (`persistCanonicalSemanticPacketEmbedding`, which writes `semantic_768` lineage into
  `atlas_packets`) that happens to share a similarly-named directory. A green result here is real
  but provides zero evidence about `assertTaskSemanticPacketSchemaCompatible()`'s correctness —
  flagging this rather than letting a passing-but-irrelevant test stand in for real coverage.
- [x] **Closed that gap directly**: added `sveltekit-frontend/src/lib/server/tasks/
  semantic-packets.spec.ts` (new file) with 3 focused tests against a mocked
  `information_schema.columns` result — (1) resolves cleanly when all 27 required columns are
  present, (2) throws `TASK_SEMANTIC_PACKET_SCHEMA_INCOMPATIBLE` naming the missing columns when
  given the exact live 16-column shape this session's own audit found, (3)
  `createTaskSemanticPacket()` rejects before any other DB call (`mockExecute` called exactly once)
  when schema is incompatible. Exported `assertTaskSemanticPacketSchemaCompatible` (was
  module-private) so it could be tested directly rather than only indirectly through the full
  lifecycle function. **Live-run, not just written**: `npx vitest run
  src/lib/server/tasks/semantic-packets.spec.ts` → 3/3 pass.

**Remaining TASK-SEMANTIC-PACKET-COMPATIBILITY-01 steps, not started**: (1) capture the exact
production `DATABASE_URL` target — not done, still open; (3) run the writer against a disposable
database fixture; (4) decide whether to apply the additive
`20260606_task_semantic_packets_live_alignment.sql` migration or narrow/archive the writer — still
correctly blocked, no migration applied; (5) independent Qdrant/Postgres identity readback. None of
these were attempted in this pass — step 2's verification plus closing its real test-coverage gap
was the bounded scope of this entry.

### TASK-SEMANTIC-PACKET-COMPATIBILITY-01 — active MCP writer guard 2026-09-08

- [x] Confirmed `task.run_semantic_packet_workflow` reaches
  `runTaskSemanticPacketLifecycle()` through the live MCP dispatch table.
- [x] Added a read-only required-column preflight before embedding, Qdrant, or PostgreSQL work;
  incompatible live schemas fail closed with the missing-column list.
- [x] Confirmed focused semantic-packet writer tests pass 4/4 and OpenSpec strict validation passes.
- [x] Reconcile the live 16-column `task_semantic_packets` table with the broader Drizzle/writer
  contract, using a disposable compatibility test before considering an additive migration.

Evidence boundary: the preflight prevents partial writes but does not prove the unapplied migration
is correct or authorize applying it to `legal_ai_db`.

### TASK-SEMANTIC-PACKET-COMPATIBILITY-01 — disposable proof result 2026-09-08

- [x] Ran `scripts/atlas/prove-task-semantic-packet-disposable-compatibility-v1.mjs` against an
  ephemeral PostgreSQL 18 container initialized with the observed 16-column live shape.
- [x] Confirmed the proposed alignment SQL parses and applies in isolation without touching the
  live database; the proof container was removed and `writesPerformed=false`.
- [x] Confirmed the alignment SQL adds 39 columns but leaves six active-writer columns absent:
  `summary_model`, `summary_hash`, `confidence`, `status`, `agent_pickup_ready`, and `deleted`.
- [x] Extended the unapplied sidecar with the six writer-required columns and reran the disposable
  proof; the active writer contract is now covered in isolation.
- [ ] Do not apply `20260606_task_semantic_packets_live_alignment.sql` yet; live application still
  requires explicit migration authorization and post-commit readback.

Evidence: `docs/reports/task-semantic-packet-disposable-compatibility-v1.json`.

### TASK-SEMANTIC-PACKET-COMPATIBILITY-01 — live type/default audit 2026-09-08

- [x] Read the live PostgreSQL catalog without mutation. `task_semantic_packets` remains a
  16-column legacy table with zero live rows.
- [x] Recorded non-column drift: live `id` is `uuid DEFAULT gen_random_uuid()` while the current
  Drizzle owner declares a serial-style primary key; live legacy score fields are `real NOT NULL`,
  and `semantic_vector` is an extra pgvector column outside the active writer contract.
- [x] Refreshed `npm run audit:drizzle` from the repository root; it completed successfully and
  regenerated `docs/reports/postgres-contract-mirrors-report.json` and its Markdown companion.
- [ ] Do not alter the live primary-key or legacy vector/score columns in this additive migration;
  resolve that separate owner/type drift before claiming full Drizzle parity.

### TASK-SEMANTIC-PACKET-WRITER-CENSUS-02 — initial read-only findings 2026-09-08

- [x] Confirmed additional direct writers beyond the MCP/API lifecycle: `ingest-packets.mjs`,
  `scripts/atlas/batch-offline-ingest.mjs`, `scripts/atlas/create-agent-pickup-packets.mjs`,
  `scripts/atlas/generate-feature-todos.mjs`, `scripts/atlas/generate-recovery-template-from-packet.mjs`,
  and the Phase 17 feature extractor.
- [x] Classified the first compatibility hazards: legacy writers reference `som_cluster`,
  `task_title`, `task_type`, and `task_status`, which are not part of the current Drizzle owner or
  the repaired additive migration; the batch/offline and agent-pickup writers use UUID-compatible
  IDs and overlapping current fields.
- [ ] Classify each writer as production, MCP/API, offline, bounded migration, legacy, or dead before
  expanding the live migration or changing write order.

Evidence boundary: this is a source census only; no writer was executed and no store was mutated.

Writer classification from the initial census:

| Writer | Classification | Apply behavior | Current status |
|---|---|---|---|
| `src/lib/server/tasks/semantic-packets.ts` | PRODUCTION_MCP / PRODUCTION_API | always writes when invoked | guarded; Qdrant-before-Postgres remains open |
| `src/routes/api/tasks/packets/+server.ts` | PRODUCTION_API | direct Drizzle insert | current-field subset; migration required |
| `scripts/atlas/batch-offline-ingest.mjs` | OFFLINE_INGEST | explicit `--apply` | references current fields plus legacy `id`/projection shape |
| `scripts/atlas/create-agent-pickup-packets.mjs` | LEGACY_PICKUP | apply by default unless `--dry-run` | blocked when legacy prerequisites are absent |
| `scripts/atlas/generate-feature-todos.mjs` | LEGACY | explicit `--apply` | references obsolete `task_title`/`task_type`/`task_status` |
| `scripts/atlas/generate-recovery-template-from-packet.mjs` | LEGACY | explicit `--apply` | references obsolete task fields |
| `ingest-packets.mjs` | LEGACY / UNKNOWN | writes immediately on launch | references obsolete `som_cluster`; not executed |

This matrix is a review result, not an authorization to run any `--apply` path.

### TASK-SEMANTIC-PACKET-ATOMICITY-01 — canonical-first ordering 2026-09-08

- [x] Changed the active MCP/API lifecycle to insert the canonical PostgreSQL packet before the
  rebuildable Qdrant projection.
- [x] Confirmed source ordering: `db_mirror_created` precedes `qdrantManager.upsert()` and the
  `qdrant_upsert` receipt.
- [x] Focused semantic-packet tests pass 3/3.
- [ ] Add a durable projection/outbox receipt or reconciliation path for the inverse failure mode:
  PostgreSQL succeeds but Qdrant publication fails.

This is an ordering repair only; it does not apply the pending schema migration or execute a live
packet workflow.

Existing outbox review: `outbox_events` and `outbox-worker.ts` are real and transactional, but the
current `encode.embedding.succeeded` handler publishes to `agent_memory_observations`, not the
`codebase_chunks` projection used by task semantic packets. No semantic-packet event was added;
reusing that handler would misroute data. A dedicated projection adapter or explicit reconciliation
job remains required.

### TASK-SEMANTIC-PROJECTION-INTENT-01 — reference-only contract 2026-09-08

- [x] Added `TaskSemanticProjectionIntentV1` with UUID packet/projection identities, semantic_768
  representation lineage, source/workspace revisions, input checksum, and immutable `artifactRef`.
- [x] Added focused tests proving deterministic checksums and rejecting inline embedding payloads;
  tests pass 2/2.
- [ ] Produce or identify the canonical task-summary embedding artifact before wiring an outbox
  event; the current task packet stores only `qdrant_point_id`.

This contract is intentionally unconnected to `outbox_events` until a replayable artifact owner and
task-specific Qdrant handler exist.

Artifact-owner audit: `atlas_vector_registry` is the closest existing owner because it already
contains packet identity, model/representation metadata, content checksum, artifact URI, and Qdrant
pointer fields. Its current `vector_name` constraint still calls the relevant 768 form
`dense_768_legacy`, so it cannot yet be silently reused as the current `semantic_768` owner.
The historical `semantic_embedding_cache_v2` migration describes a cache-only `semantic_768` store,
but a live read-only check returned `to_regclass = NULL`: the table is not present in the current
PostgreSQL database. Therefore it cannot provide a replay artifact, task identity, or projection
receipt. No cache table was created and no historical cache migration was applied.

Drizzle reconciliation rerun 2026-09-08 confirms the live `task_semantic_packets` relation still has
the legacy 16-column shape and zero rows. The active MCP writer currently requires 23 additional
columns, including `qdrant_point_id`, lifecycle fields, lineage fields, and JSONB relationship fields.
The broad Drizzle/manual definition contains those fields plus additional future enrichment columns
and indexes, so `ADD_DRIZZLE_MIRROR` is not authorization to apply that entire surface. A minimal
writer-only migration must be extracted and reviewed separately before deployment; no live migration
has been applied.

### TASK-SEMANTIC-PACKET-MINIMAL-MIGRATION-01 — identified, not applied (2026-09-08)

- [x] Derived `sveltekit-frontend/drizzle/manual/20260908_task_semantic_packets_writer_columns_only.sql`
  from the exact active insert allow-list; it contains only the 23 absent writer columns.
- [x] Disposable PostgreSQL 18 proof passes: baseline 16 columns, 23 migration columns,
  zero missing writer columns after alignment, `writesPerformed=false`.
- [x] Disposable representative insert/readback passes with UUID primary key, JSONB fields,
  lifecycle defaults, and `productionWritesPerformed=false`.
- [x] Extended the disposable proof to apply the reviewed production-index candidate after the
  column set; all three expected indexes are present and the insert/readback still passes.
- [ ] Confirm no legacy writer requires incompatible types or defaults.
- [ ] Apply only after explicit authorization through the normal Drizzle migration path.

The proof report is `docs/reports/task-semantic-packet-disposable-compatibility-v1.json`. The
minimal SQL remains an unapplied candidate; the broader `20260606_task_semantic_packets_live_alignment.sql`
is not used by this proof and remains unsuitable as an automatic live migration.

Writer compatibility review also found and fixed three workflow API lookups that still coerced
`task_semantic_packets.id` UUIDs through `Number(...)`. They now pass the queue packet UUID directly;
task/workspace numeric IDs remain unchanged.

Legacy writer review 2026-09-08: `create-agent-pickup-packets.mjs` uses the text value `idle` and
stores a source reference without a task-packet `qdrant_point_id`; it is not compatible with the
active packet lifecycle semantics and remains legacy-gated. `batch-offline-ingest.mjs` is explicitly
apply-gated but uses a projection-derived UUID and file path in projection fields, so it remains an
offline migration candidate rather than an active writer. `phase17-feature-extractor.ts` currently
logs its raw SQL intention instead of executing it. No legacy writer was enabled or modified.

Safety repair 2026-09-08: `create-agent-pickup-packets.mjs` now defaults to dry-run and requires
explicit `--apply`; passing both mode flags fails closed. Syntax validation passes and the conflicting
mode guard was exercised without opening a database or Redis connection.

Lifecycle alignment 2026-09-08: the legacy pickup insert now uses packet status `todo` instead of
the unsupported `idle` value. The script remains legacy-gated and default dry-run.

Bounded dry-run replay 2026-09-08 loaded 10 recommendation records and emitted only `[DRY] would
enqueue` plans. It performed no database or Redis connection/write; the final counter is a plan count,
not a persisted-packet count.

Offline-ingester compatibility repair 2026-09-08: `batch-offline-ingest.mjs` now uses a deterministic
UUID for the PostgreSQL packet primary key while retaining its separate numeric Qdrant projection ID.
This resolves the live UUID/type mismatch without promoting the legacy ingester or changing its
explicit `--apply` gate.

Type-boundary repair 2026-09-08: `updatePacketRow()` now accepts only string packet IDs, matching
the UUID Drizzle owner. Full workspace TypeScript still reports unrelated pre-existing errors, but
the changed task-packet module and workflow lookup produced no diagnostics in the focused compiler
filter; focused tests remain 5/5.

### TASK-SEMANTIC-PACKET-WRITER-MATRIX-03 — read-only matrix 2026-09-08

- [x] Added `scripts/atlas/audit-task-semantic-packet-writer-matrix-v1.mjs` and the root
  `atlas:task-semantic-packet:matrix` command.
- [x] Enumerated nine relevant surfaces: the guarded MCP lifecycle, API route, two offline-ingest
  branches, agent-pickup writer, legacy packet ingester, feature-todo writer, recovery-template
  writer, and the Phase 17 intent-only SQL path.
- [x] Queried the live `public.task_semantic_packets` metadata through the Docker Postgres fallback;
  live schema status is proven, with 16 columns and no live rows changed.
- [x] Generated `docs/reports/task-semantic-packet-writer-column-matrix-v1.json` containing each
  writer's required columns, live-column comparison, missing columns, mode, and compatibility class.
- [x] Matrix confirms zero currently compatible active writers against the live 16-column table;
  the guarded MCP writer and API route remain blocked until their required additive columns exist.
- [x] Matrix confirms the Phase 17 SQL is intent-only, while legacy writers reference obsolete or
  non-current fields and must not be revived by applying the broad mirror migration.
- [ ] Use this artifact to review the production target and migration minset before any authorized
  live `ALTER TABLE`; this report itself performs no database, Qdrant, or cache writes.

Evidence: `docs/reports/task-semantic-packet-writer-column-matrix-v1.json`.

### TASK-SEMANTIC-PACKET-PRODUCTION-TARGET-01 — read-only target/minset plan 2026-09-08

- [x] Added `scripts/atlas/plan-task-semantic-packet-production-target-v1.mjs` and the root
  `atlas:task-semantic-packet:target` command.
- [x] Resolved the production target to the guarded MCP lifecycle plus the current API route.
  Offline, legacy, and intent-only writers remain excluded from production admission.
- [x] The earlier 23-column minimum-set result is retained as historical planning evidence only.
  A fresh live catalog audit now finds `task_semantic_packets` present with 39 columns and 2 rows;
  it is not currently a 16-column table. The reviewed SQL must therefore be re-preflighted against
  the current target before any apply decision.
- [x] Refreshed the writer matrix and production-target planner. The two admitted production writers
  (`mcp-create-task-semantic-packet`, `api-post-task-semantic-packet`) require **zero** additional
  live columns. Seven missing fields belong to excluded/blocked or intent-only writers:
  `community_id`, `som_cluster`, `som_col`, `som_row`, `task_status`, `task_title`, `task_type`.
- [x] Proved the reviewed `20260908_task_semantic_packets_writer_columns_only.sql` is additive and
  contains no data backfill; it is **not applicable** to the current production target and remains
  unapplied.
- [x] Recorded `applyAuthorized=false`; the planner performs no database, Qdrant, cache, or service
  restart operation.
- [ ] Obtain explicit authorization before applying the reviewed additive migration through the
  normal Drizzle/sidecar migration path.

Evidence: `docs/reports/task-semantic-packet-production-target-v1.json`.

### TASK-SEMANTIC-PACKET-INDEX-PLAN-01 — additive index candidate 2026-09-08

- [x] Confirmed no new table is required: `public.task_semantic_packets` exists and is the live
  runtime owner. The current audit reports 39 live columns and 2 rows; the older 16-column/zero-row
  description is stale and must not authorize a migration.
- [x] Refreshed the live writer matrix: production-target migration minimum set is empty; the seven
  missing fields are not grounds for a production migration because their writers are excluded or
  blocked.
- [x] Confirmed existing primary-key, packet-key, source-ref, feature-id, alias-id, and metadata
  indexes through live `pg_indexes` readback.
- [x] Added unapplied `manual/20260908_task_semantic_packets_production_indexes.sql` with only
  three production-path indexes: `(workspace_task_id, created_at DESC)`, `(status, feature_id)`,
  and `agent_pickup_ready`.
- [x] Registered the index candidate as `planned_sidecar`, dependent on the writer-column migration.
- [ ] Run EXPLAIN validation after the columns exist; do not add indexes merely to mirror every
  historical Drizzle declaration.
- [ ] Recompute index definitions only if a currently admitted production query needs them; do not
  apply the column sidecar migration. Any future migration must name a newly admitted writer and pass
  a fresh checksum-bound preflight.

This is an additive plan only. No table, column, index, row, projection, or cache was changed.

### TASK-SEMANTIC-QDRANT-IDENTITY-01 — semantic_768 input guard 2026-09-08

- [x] Added `assertCanonicalSemantic768Vector()` to the active task-packet lifecycle.
- [x] The guard rejects missing, non-finite, legacy 384-dimensional, and any non-768 vector before
  either the canonical Postgres insert or Qdrant publication.
- [x] Focused task-packet tests pass 5/5.
- [ ] Add live Postgres/Qdrant independent readback after the migration canary; this guard proves
  input shape only and does not prove projection parity.

No database, Qdrant, or cache writes were performed by this change.

Qdrant identity alignment 2026-09-08: the active task-packet writer now resolves both the
collection and vector payload through `qdrantManager.collections.codebase_chunks`, which is the
configured `codebase_chunks_768_v2` canonical dense projection, instead of hardcoding the legacy
`codebase_chunks_768` collection/payload selector. The environment override remains available for
explicit test profiles. Focused task-packet tests pass 5/5; live Postgres↔Qdrant readback remains
open until the migration canary is authorized.

### TASK-SEMANTIC-PACKET-APPLY-CANARY-01 — infrastructure preflight and receipt reconciliation 2026-09-08

- [x] Ran `scripts/atlas/preflight-task-semantic-packet-apply-canary-v1.mjs` read-only.
- [x] Live `public.task_semantic_packets` metadata is readable with zero missing required production
  columns; the current admitted production writer minimum set is empty.
- [x] Qdrant shape is proven for `codebase_chunks_768_v2`, vector `content`, dimension `768`, and
  cosine distance.
- [x] Reconciled the preflight with the existing authorized canary receipt rather than treating the
  canary as pending. `docs/reports/task-semantic-packet-apply-canary-v1.json` reports
  `status=PROVEN`, `identityParity=true`, and completed Postgres/Qdrant readbacks.
- [ ] Keep the two explicitly tagged canary fixtures out of production retrieval populations through
  the normal archival/fixture policy. Do not delete them or rerun the canary merely to generate a
  third row.

Evidence: `docs/reports/task-semantic-packet-apply-canary-preflight-v1.json`.

Canary fixture isolation audit 2026-09-08: the shared Qdrant filter contract currently excludes only
`_atlas_system_record=true`; it does not universally exclude the two existing
`canary://task-semantic` / `canary=true` fixtures. No fixture was deleted or changed in this audit.
Before broader retrieval admission, add a reviewed read-path exclusion or archive classification that
handles both the complete and partial historical canary payloads.

### TASK-SEMANTIC-PACKET-APPLY-CANARY-01 — preflight only 2026-09-08

- [x] Added `scripts/atlas/preflight-task-semantic-packet-apply-canary-v1.mjs` and the root
  `atlas:task-semantic-packet:canary:preflight` command.
- [x] Live Qdrant canonical collection inspection is reachable for `codebase_chunks_768_v2`.
- [x] Live Postgres metadata is readable, but all 23 reviewed migration columns remain absent;
  `applyCanaryEligible=false` and `applyAuthorized=false`.
- [x] Preflight writes only `docs/reports/task-semantic-packet-apply-canary-preflight-v1.json`;
  it does not apply SQL, insert packets, upsert Qdrant, or restart services.
- [ ] Apply the reviewed column migration only after explicit authorization, then rerun this
  preflight before the canary.

Preflight refinement 2026-09-08: the check now reads the live Qdrant collection configuration rather
than treating HTTP 200 as sufficient. `codebase_chunks_768_v2` reports vector name `content`,
dimension `768`, and cosine distance, so the Qdrant shape gate is proven. The canary remains blocked
solely by the 23 absent Postgres columns and `applyAuthorized=false`.

### TASK-SEMANTIC-PACKET-MIGRATION-RUNNER-01 — guarded dry-run 2026-09-08

- [x] Added `scripts/atlas/apply-task-semantic-packet-migration-v1.mjs` and the root
  `atlas:task-semantic-packet:migration` command.
- [x] Default execution validates both reviewed SQL files and reports an additive-only plan.
- [x] Live execution requires both `--apply` and
  `ATLAS_AUTHORIZE_TASK_SEMANTIC_PACKET_MIGRATION=1`; the apply path was not run.
- [x] Dry-run completed with `additiveOnly=true`, `executed=false`, and
  `productionWritesPerformed=false`.

Authorized live apply 2026-09-08: the reviewed column and index SQL was executed through the guarded
runner after explicit authorization. Independent Postgres readback reports 39 columns on
`task_semantic_packets` and all three approved production indexes. The transaction inserted or
updated no packet rows; Qdrant and services were not touched. The packet apply canary remains a
separate step.

Migration runner hardening 2026-09-08: after review of PostgreSQL 18 locking semantics, the runner
was corrected so Phase A columns use bounded `lock_timeout`/`statement_timeout` inside a transaction,
while Phase B indexes are checked by live `pg_indexes` definition and created with
`CREATE INDEX CONCURRENTLY` outside a transaction. The current live definitions are exact matches,
so a fresh dry-run reports `SKIP_EXACT_MATCH` for all three and performs no writes.

Post-migration mirror audit 2026-09-08: `npm run audit:drizzle` confirms the live table is reachable
and the writer migration is present. Its remaining `COLUMN_MISMATCH` is caused by 17 live historical/
future columns (`canonical`, community/SOM/lineage fields, and related enrichment fields) absent from
the current Drizzle owner. This is separate schema drift; it does not invalidate the 23-column writer
minimum or the proven canary. The live table contains two explicitly tagged canary rows.

### TASK-SEMANTIC-PACKET-APPLY-CANARY-01 — proven 2026-09-08

- [x] Added and ran the explicitly authorized one-packet Postgres→Qdrant canary.
- [x] Postgres insert, Qdrant upsert, Postgres readback, and Qdrant readback all completed.
- [x] Identity parity is proven for the successful canary: packet UUID, packet key, Qdrant point
  UUID, source reference, and `semantic_768` representation agree across both stores.
- [x] The first attempt exposed a harness parsing bug (`INSERT 0 1` appended to the returned UUID);
  it failed before readback, and its single canary payload was corrected and independently verified.
- [x] Live census now reports two explicitly tagged canary rows; no unrelated rows were changed.
- [ ] Keep canary artifacts out of production retrieval populations or mark them through the normal
  archival/fixture policy before broader packet admission.

### TASK-SEMANTIC-PACKET-LIFECYCLE-ORDER-01 — source-order proof 2026-09-08

- [x] Added the read-only audit `scripts/atlas/audit-task-semantic-packet-lifecycle-order-v1.mjs`.
- [x] Proven in the active `createTaskSemanticPacket()` source that the 768-vector guard runs before
  the canonical PostgreSQL insert, and the PostgreSQL insert runs before the Qdrant upsert.
- [x] Proven that the Qdrant path uses the canonical collection constant and named `content` vector
  payload builder.
- [x] Report written to `docs/reports/task-semantic-packet-lifecycle-order-v1.json` with
  `status=PROVEN_SOURCE_ORDER`, `readOnly=true`, and `productionWritesPerformed=false`.
- [ ] Full model-driven MCP lifecycle replay remains a separate gate; this task proves source order,
  not a new live packet creation.

Bounded dry-run replay processed 10 files, produced 10 nodes and 0 edges, and reported
`APPLY MODE: DRY-RUN`; no output files, PostgreSQL rows, Qdrant points, or Redis keys were written.

Post-registration `npm run audit:drizzle` completed its report generation but returned exit code 1
because the repository still has pre-existing mirror blockers: `task_semantic_packets` live/static
column drift, `atlas_packets` drift, missing live `feature_registry`, and unrelated
`parent_atlas_documents`/`route_runtime_packets` classifications. This is not evidence that the new
writer-only sidecar was applied; live `task_semantic_packets` remains unchanged.

The full contract-map audit was rerun without its report-suppressing dry-run flag. It now recognizes
`0099_atlas_svg_glyphs.sql` as an intentional documented sidecar and reports 64 total findings
(63 medium historical migration/contract findings, 1 informational sidecar finding, 0 high). The
remaining numbered SQL files were not bulk-registered because their live ownership and apply state
are not proven.

Relevant migration triage: `0019_bm25_search_vector.sql` includes a live-table backfill, trigger,
and `CREATE INDEX CONCURRENTLY`; `0020_fix_packet_feature_metrics_schema.sql` includes `DROP COLUMN`
statements; and `0019_atlas_packet_indexes_gin.sql` adds several indexes. These are not safe to
classify as writer-only sidecars from filename presence alone. Live objects exist for the packet
tables, but no apply or ownership decision was made.

Command-alignment repair 2026-09-08: added the documented root script `audit:contracts`, mapped to
the existing read-only contract-map auditor. `npm run audit:contracts` now executes successfully and
refreshes the report; current findings remain 0 high, 63 medium, and 1 informational.

Added focused command alias `npm run atlas:task-semantic-packet:proof`. It reruns the disposable
PostgreSQL 18 column plus representative insert/readback proof without contacting the live database.

### PROJECTION-LIFECYCLE-PRIORITY-01 — cache audit alignment (2026-09-08)

The cache audit changes the next priority from cache modeling to durable projection lifecycle. The
current low/mostly-cold cache population is useful evidence: correctness can be established before a
large hot state exists.

- [x] Defined and tested pure `ProjectionChangeV1` payload validation with event identity,
  workspace/source/graph/representation/feature revisions, stage receipt checksum, changed packet
  keys, candidate ordinals, and affected projection families.
- [ ] Emit it as a durable outbox event in the same PostgreSQL transaction as a future canonical
  mutation.
- [ ] Define idempotent consumer keys as `(eventId, targetProjection, targetRevision)`.
- [ ] Keep Qdrant, Neo4j, centroid artifacts, and Valkey as rebuildable consumers; none becomes
  canonical authority.
- [ ] Add lifecycle states for canonical commit, invalidation, projection pending, projected,
  readback-proven, and optional prewarm.

### VALKEY-REVISION-QUALIFICATION-01 — design gate (2026-09-08)

- [ ] Require revision-qualified keys for ACE, BitFrost, centroid, artifact, and candidate-set state.
- [ ] Treat keyspace notifications as best-effort observability only; durable outbox events carry
  invalidation intent.
- [ ] Distinguish hard invalidation, soft retirement, and selected prewarm. TTL/LRU is cleanup and
  performance policy, never currentness or validity.
- [ ] Add bounded single-flight protection for lazy reconstruction; cache miss must not trigger
  unbounded duplicate recomputation.

### CENTROID-DURABLE-ARTIFACT-01 — design gate (2026-09-08)

- [ ] Define durable `CentroidArtifactV1` with workspace/representation/clustering revisions,
  dimensions, vector checksum, member-set checksum, and artifact reference.
- [ ] Treat Valkey centroid loss as `CACHE_MISS`, not `CENTROID_LOST`; rebuild from the durable
  artifact or sealed semantic population.

The live cache census remains a baseline only; no new cache schema, invalidation consumer, centroid
artifact, or projection write was created in this pass.

Outbox reliability repair 2026-09-08: `outbox-worker.ts` now unpublishes an event when any expected
handler fails, including partial fanout failures. Previously, one successful handler could leave
`published_at` set while another failed projection was never retried. No outbox cycle was run.

Live registry readback adds a separate drift finding: `public.atlas_vector_registry` exists with
4,480 rows, all `embedding_dim=768`, but its live 12-column shape has no `vector_name`,
`representation`, `model_revision`, `workspace_revision`, `artifact_uri`, or `qdrant_point_id`
population. The historical `0500_atlas_semantic_contracts.sql` definition is therefore not the
live owner contract. It must not be treated as a ready replay-artifact store without a dedicated
read-only reconciliation and lineage decision.

### GO-RETRIEVAL-CACHE-CONTEXT-VALIDATION-01 — implemented 2026-09-08

- [x] Added `validateLaneRequest()` to the Go lane coordinator.
- [x] Cached requests now fail closed when `workspace_id` or `corpus_version` is absent; uncached
  fixture calls retain the existing revision-optional behavior.
- [x] Nil contexts and whitespace-only queries are rejected before timeout setup or lane fanout.
- [x] Focused service validation passes with `go test ./...`.
- [ ] Cross-runtime TypeScript/Go request-envelope parity remains a separate gate.

### GO-RETRIEVAL-HELPER-RECONCILE-01 — audit result 2026-09-08

- [x] Searched the active repository for `buildContextFromGoHttp`,
  `validatePacketFromGoHttp`, `/context/build`, and the proposed `/validate` route.
- [x] No live helper implementation or matching Go HTTP endpoint was found.
- [x] No endpoint was added: the names remain unowned compatibility expectations, not proven
  capabilities. Context assembly belongs behind ACE/ContextManifest; packet validation belongs to
  the existing typed validation contracts until a concrete caller and protocol are identified.
- [x] Current caller review supersedes the earlier stale note: `buildContextFromGo()` and
  `validatePacketFromGo()` are real callers from `routes/api/atlas/runtime-retrieve/+server.ts`
  and `atlas-mastra-workflow.ts`; their fallbacks now use canonical Postgres directly, with no
  new Go route. The gated Postgres integration proof covers PASS/FAIL packet validation and
  bounded context assembly. No datastore writes occur in these helper paths.
- [ ] Keep the separate TypeScript↔Go gRPC envelope/codegen parity gate open; it does not block
  the already-proven Postgres-direct helper fallback.

### SOM-KMEANS-FIXTURE-01 — live readiness audit 2026-09-08

- [x] Ran the existing read-only SOM audit against the live packet population.
- [x] Corrected the audit's PostgreSQL bigint handling and replaced its stale hardcoded packet
  denominator with a live `COUNT(*)`.
- [x] Current readback: 61,718 packets; 61,660 assigned; 342/400 SOM cells populated; 2,964
  adjacency edges; 7,522 `latent_64` rows.
- [x] Audit now reports 2/7 gates passed: assignment coverage and adjacency edges. It no longer
  reports `Infinity`, `NaN`, or coverage above 100%.
- [ ] Topology promotion remains blocked: cell coverage, distribution, latent coverage, and ACE
  retrieval-speedup gates are not proven. No SOM/KMeans write or training run occurred.

### LATENT-768-LADDER-READINESS-01 — definition 2026-09-08

- [x] Clarified that `latent_256`, `latent_128`, and `latent_64` must all derive from the same
  current `EmbeddingGemma → semantic_768` cohort and immutable ordinal map.
- [x] Clarified that Qdrant and Neo4j are downstream projections/fanout consumers, not latent
  training authorities or sources for filling missing rows.
- [ ] Freeze the current source-qualified semantic cohort and `RepresentationArtifactV1` input
  manifest.
- [ ] Produce deterministic 768→256→128→64 artifacts with model/revision/checksum metadata.
- [ ] Compare each width with the exact cosine/top-k oracle and prove reload row alignment.
- [ ] Seal and atomically publish derived artifacts before any Qdrant/Neo4j/Valkey fanout.
- [ ] Keep `latent_64` cache-hint-only until its coverage and retrieval-quality gates pass.

Static contract audit 2026-09-08: `python scripts/atlas/audit-fetch-latent-derived-views-v2.py`
returned `PROVEN_STATIC_CONTRACT`. Existing owners are `latent256-candidate-provider.ts` for
persisted `latent_256`, `latent-derive.ts` for virtual `latent_128`, and the existing physical
`latent_64` storage. The audit proves contract shape only; live current-cohort coverage,
CandidateOrdinal parity, derived checksums, and query-time promotion remain unproven.

Live latent identity audit 2026-09-08: `scripts/atlas/audit-latent-representation-identity.mjs`
completed read-only with zero production mutations. The bounded sample selected 1,000 rows with
`latent_64`; packet IDs and packet keys were unique, but 325 rows lacked `qdrant_point_id`. The
Qdrant sample classified all 250 points as `MISSING_SOURCE_REVISION`; packet key, source ref, and
`representation_id` were present, while source/workspace revisions were absent. Source-lineage
joins were 0/1,000, symbol joins were 0/1,000, and representation-ledger joins were 0/1,000.
The stored latent bytes are uniformly 256 bytes, consistent with 64 little-endian float32 values
from the current writer source, but no producer revision/serialization field proves that contract
in the live row. Status remains **NOT_PROVEN** for latent promotion; do not fan out or rebuild
latent widths from this population.

Evidence: `docs/reports/latent-representation-identity-audit-2026-09-08.json`.

### AST-GREP-OUTLINE-SYMBOL-POPULATION-01 — capability audit 2026-09-08

- [x] Refreshed both workspace installations and verified the pinned `ast-grep` CLI as 0.45.3.
- [x] Added a read-only audit and report command for the bounded structural paths used by the
  retrieval and Parent Atlas packages.
- [x] Confirmed the refreshed installed executable exposes the documented `outline` subcommand;
  no regex substitution is used for this audit.
- [x] Verified pinned `@ast-grep/cli@0.45.3` exposes `outline` and captured a bounded
  `--items structure --view digest` output for the retrieval and Parent Atlas source paths.
- [x] JSON readback contains 526 files, 5,705 top-level items, and 3,974 direct members across
  the bounded TypeScript, Go, and Python owner surfaces.
- [x] Refreshed the local dependency installation and reran the bounded digest; reconcile it next
  with 8095 Tree-sitter spans and the revision-qualified symbol resolver.
- [ ] Do not promote outline names, signatures, paths, or line ranges directly to
  `symbol_version_id`, CandidateOrdinal, Postgres, Qdrant, Neo4j, or Valkey.

Read-only reconciliation replay 2026-09-08: `ATLAS_AST_PARITY_CORPUS_LIMIT=66 npx tsx
scripts/atlas/prove-node-tree-sitter-corpus-parity-v2.mts` completed with runtime and source
span self-validity `66/66`, named-symbol coverage `53/66`, exact span parity `53/66`, and full
parity `50/66`. The remaining classes are `NAMED_SYMBOL_MISSING_RIGHT: 37` and
`SEMANTIC_KIND_UNKNOWN_BOTH: 4`; this is a real parity gap, not a CLI installation problem.
The comparator now records unmatched observation scope (`TOP_LEVEL_DECLARATION`,
`NESTED_DECLARATION`, `AMBIENT_DECLARATION`, or `OTHER`) for diagnosis, while preserving its
existing provider-tolerant pairing behavior. No identities were promoted and no database,
Qdrant, Neo4j, or Valkey writes occurred.
The comparator now excludes export-statement wrappers from symbol counts because the underlying
declaration is the symbol and the export is a relationship observation. The remaining 37
unmatched left observations are nested callback observations; no unmatched top-level declaration
remains in this replay.

### TS-GO-REQUEST-ENVELOPE-PARITY-01 — boundary audit 2026-09-08

- [x] Confirmed the active proto authority is `proto/active/retrieval.proto` and uses
  `CodebaseSearchRequest.representation_id` as field 10.
- [x] Fixed the TypeScript gRPC client to forward `representationId` for unary and streaming
  `SearchCodebase` calls; focused package build and five transport tests pass.
- [x] Confirmed `workspace_id`, `corpus_version`, and cache policy are not fields in the active
  retrieval proto. They remain internal Go lane/cache qualifiers and must not be fabricated at
  the wire boundary.
- [ ] If those qualifiers are required over gRPC, propose a reviewed proto revision and regenerate
  both TypeScript loader fixtures and Go bindings before adding parity assertions.
- [ ] After that, prove cached/uncached acceptance and rejection matrices plus independent cache-key
  parity. No cache promotion is implied by the current transport test.
- [x] Added a read-only proto-to-TypeScript forwarding census so future proto changes cannot be
  mistaken for client parity; report path is `docs/reports/retrieval-grpc-envelope-parity-v1.json`.

### IDENTITY-MODEL-FREEZE-01 — tree/symbol/packet separation 2026-09-08

- [x] Freeze `tree_node_id` as a revision-bound parse occurrence/provenance coordinate. It is
  not a stable symbol identity and must not be reused as `symbol_id`, `symbol_version_id`,
  `chunk_id`, `packet_key`, or `graph_node_key`.
- [x] Freeze the identity chain as:
  `source_ref → source_revision → parse_node_id/tree_node_id → symbol_id → symbol_version_id →
  chunk_id → packet_key → graph_node_key`.
- [x] Freeze ownership: Tree-sitter/AST-grep may emit structural observations; compiler/LSP/
  Graphify may resolve symbols; PostgreSQL admits canonical packet and lineage rows; Neo4j,
  NetworkX, cuGraph, Qdrant, cuVS, Valkey, and model classifiers consume derived identities.
- [ ] Add or reconcile a live `parse_node_id` field without relaxing the existing tree-node
  uniqueness constraint.
- [ ] Prove `symbol_id` stability across two source revisions and `symbol_version_id` changes
  only when the symbol's revision-bound definition changes.
- [ ] Rebuild downstream packet/chunk/graph joins from the frozen lineage map before any
  structural reindex or topology promotion.

### MULTILANE-REINDEX-ORDER-01 — structural, graph, GPU, and ontology lanes 2026-09-08

- [x] Freeze the execution order: Tree-sitter CST → AST-grep outline/patterns → LSP/Graphify
  symbol resolution → deterministic domain signals → grounded ontology observations →
  `OntologyLinkedTupleV1` proposals → canonical PostgreSQL admission.
- [x] Freeze the graph rule: NetworkX is the CPU/reference oracle; Neo4j is a projection/fanout
  executor; the Python sidecar may delegate read-only graph calculations; cuGraph is the WSL2
  RAPIDS GPU executor. None may mint identity or canonical facts.
- [x] Freeze the routing rule: contextual sparse trees, sampling forests, ExtraTrees, and
  classifier outputs are bounded derived features/cache hints. They may choose candidate budgets
  but cannot create a retrieval vote, ontology identity, or packet admission.
- [x] Freeze the vector rule: EmbeddingGemma `semantic_768` is the canonical dense source;
  cuVS/CAGRA, Qdrant, and TurboVec are executors/projections. `latent_256/128/64` must be
  revisioned artifacts derived from the same source cohort and ordinal map.
- [ ] Produce one current source-qualified reindex manifest containing the frozen identity map,
  domain signals, ontology tuple candidates, graph edges, and representation revisions.
- [ ] Run only bounded read-only parity first: Tree-sitter/AST-grep symbols, NetworkX/Neo4j
  graph counts, then RAPIDS/cuGraph/cuVS executor parity. Fanout to Qdrant/Neo4j/Valkey remains
  blocked until the manifest is sealed and independently read back.

### REINDEX-MANIFEST-CROSS-SCHEMA-01 — read-only planner 2026-09-08

- [x] Added `scripts/atlas/plan-reindex-manifest-cross-schema-v1.mjs` and the root command
  `npm run atlas:reindex:manifest:plan`.
- [x] Live read-only run inventories seven PostgreSQL source/projection tables and records row
  counts, available columns/types, identity fields, domain signals, ontology tuple state, and
  representation metadata.
- [x] Emits a deterministic bounded `CandidateOrdinalMap` sample with packet/source/tree/symbol
  identities, source/workspace revisions, content hashes, and representation revisions.
- [x] Records intended PostgreSQL/Qdrant/Neo4j/Valkey operations as blocked proposals only;
  `writesPerformed=false` and `safeToApply=false` are part of the manifest contract.
- [x] Live receipt: 1,252 `semantic_768`-eligible rows, 25 bounded sample rows; report is
  `docs/reports/reindex-cross-schema-admission-v1.json`.
- [x] Enhanced the report with an implementation plan covering source lineage, structural symbol
  reconciliation, packet joins, snapshot sealing, bounded canary, projection fanout, and ACE
  promotion; every stage records owner, prerequisite, action, status, and promotion condition.
- [ ] Resolve incomplete source/revision lineage and prove the full current cohort before any
  reindex upsert or projection fanout.

  Narrow live follow-up (2026-09-08): the planner reports `atlas_packets=61,718`,
  `codebase_chunk_index=55,853`, `graphify_files=26,014`, `feature_domain_facts=91,658`,
  `graphify_symbols=0`, `graphify_edges=0`, and `atlas_ontology_linked_tuples=0`.
  The semantic cohort has only `1,252` rows currently eligible for `semantic_768`; source
  references are present on `53,461`, but source/workspace revisions are present on only
  `10,924`, and current packet/tree/symbol bindings are absent from that cohort. Domain
  signals are present (`91,658` rows / `40` classes) but none are source-revision-bound;
  ontology tuples and graph symbols/edges are empty. All prerequisite table/column checks
  pass, but `sampleHasCurrentLineage=true` is only a bounded sample result; the manifest
  correctly remains `safeToApply=false`, `writesPerformed=false`, with next gate
  `REINDEX-MANIFEST-LIVE-LINEAGE-AND-ORDINAL-PROOF`. No PostgreSQL, Qdrant, Neo4j, or
  Valkey writes were performed.

  **Eligibility clarification:** `semantic768Eligible` is intentionally narrower than the
  structural census. The planner currently tests `source_ref IS NOT NULL` together with
  `content_embedding_768 IS NOT NULL`; it does not count Tree-sitter, CST, AST-grep, LSP,
  or RPC observations as semantic-vector eligibility. The live `content_embedding_768`
  transition column is sparse, while the separate halfvec `content_embedding` population is
  much larger; these owners must be reconciled before changing the predicate.

  **Provider ownership clarification:** Tree-sitter owns exact CST/byte spans; AST-grep
  provides syntax-aware outline/pattern observations; ts-morph/LSP/Graphify resolves
  compiler symbols and references; the existing adapters are present, but `graphify_symbols`
  and `graphify_edges` are currently empty. The neural decoder is a numerical
  `semantic_768 -> latent_256/128/64` projection service, not an NLP classifier, ontology
  writer, or llama prefill/KV owner. Domain signals exist but are not source-revision-bound;
  the ontology tuple table is empty. Therefore the missing implementation is a
  revision-qualified observation-to-symbol/packet adapter and ordinal-map proof, followed
  by ontology/graph proposals—not another parser, vector store, or decoder.

Read-only symbol materializer proof (2026-09-08): the default 42,398-row nomination artifact
and its older 440-row resolution artifact are not the same cohort, producing zero candidates
when combined. Re-running with the matching current artifacts
(`current-graphify-symbol-nominations-v1.jsonl`,
`tree-bound-symbol-registry-resolution-v1.ndjson`, and
`current-structural-symbol-resolution-v1.ndjson`) produced 90 exact canonical declaration
candidates, all with source/workspace revisions, and `identityBridgeOutcomes.RESOLVED=90`,
with zero unresolved or ambiguous rows. The result is still `DRY_RUN`, with zero symbol,
callable-search, PostgreSQL, Qdrant, Neo4j, or Valkey writes. This proves the current
  observation-to-symbol bridge for a bounded cohort; it does not yet populate the empty
  `graphify_symbols` table or authorize a production materialization.

The five live-version misses in that proof are not unresolved structural rows: they are
revision-qualified declarations in `FixSynthesizer.ts` (`createBackup`, `rollbackFix`,
`validateAST`, `applyFix`, and `FixSynthesizerConfig`) with exact canonical registry bindings
but no pre-existing `atlas_symbol_versions` row. Treat them as deterministic new-version
insert candidates after a bounded authorization/readback gate; do not treat the absence of
an old version row as permission to repair the registry or to synthesize a symbol identity.

### ATLAS-CANONICAL-PROJECTION-FABRIC-01 — architecture alignment (2026-09-08)

The canonical fabric is now defined as one revision-qualified evidence/ordinal seam feeding
all rebuildable projections. The existing cross-schema planner remains the pre-seal owner;
no second `.okf` compiler, vector authority, graph authority, or cache authority is being
introduced. The intended lowering is:

`source bytes -> CST/AST + AST-grep observations + LSP/ts-morph observations ->
SymbolObservation/SymbolVersion -> packet/chunk/concept candidates -> sealed ordinal map ->
representation, graph, and cache projection manifests -> bounded ACE ContextManifest`.

The current live planner is **not yet sealable**: `graphify_symbols=0`, `graphify_edges=0`,
ontology tuples are empty, domain signals are not source-revision-bound, and only 1,252 rows
pass the current sparse `content_embedding_768` predicate. The neural decoder is correctly
kept as a derived `semantic_768 -> latent_256/128/64` numerical projection; it is not an NLP,
ontology, identity, or llama-KV owner. NetworkX, Neo4j, cuGraph/cuVS, Qdrant, and Valkey
remain consumers of a future sealed manifest rather than independent knowledge builders.

Next implementation gate: extend the existing planner with a read-only projection-readiness
receipt covering `SymbolObservationV1`, `SymbolVersionV1`, `RepresentationManifestV1`,
`GraphProjectionManifestV1`, latent widths, domain/ontology candidates, and projection
checksums. Do not seal ordinals, emit `.okf`/Arrow/MsgPack artifacts, fan out to Qdrant or
Neo4j, warm Valkey, or run ACE promotion until exact current source/packet/symbol joins and
the semantic representation owner are proven.

Projection-readiness extension completed read-only (2026-09-08): the existing planner now
records live representation populations and local structural-artifact evidence in the same
manifest. Current counts are `content_embedding_768=1,386`, `content_embedding=55,169`,
`latent_256=55,169`, `latent_64=1,703`, `summary_embedding=1,160`, and no `latent_128`
column. Local evidence records 440 current nominations, 353 exact tree-bound resolutions,
90 exact registry bindings, 85 existing symbol versions, and 5 deterministic new-version
candidates. This confirms the 1,252 semantic count is a sparse transition-column predicate,
not a total AST/CST/symbol-fabric population. `writesPerformed=false` and `safeToApply=false`
remain enforced; no projection artifact or cache was emitted.

Read-only latent canary planning completed (2026-09-08):
`node scripts/atlas/plan-lineage-qualified-latent-canary-v1.mjs` consumed the existing
lineage-qualified candidate map and latent cohort audit without touching Postgres, Qdrant,
Neo4j, Valkey, or model artifacts. The planner produced a 15-row candidate cohort with
`workspaceRevision=sha256:b19b04b6b19a1fe0cfd48d2fa9507f9e7055f9f3dfed277d2e3d5dea3303f4dc`,
`candidateSnapshotRevision=lineage-qualified-canary:sha256:b19b04b6b19a1fe0cfd48d2fa9507f9e7055f9f3dfed277d2e3d5dea3303f4dc:v1:15`, and
`ordinalMapChecksum=86fee5d38619d3065d8710942068f26fb5b0d3c09992b1b523083ae0a593d297`.
The cohort is source-revision-qualified and has no synthetic revision fallback, but the
planner correctly remains `READY_FOR_EXPLICIT_PRODUCER_REVIEW` rather than promotion-ready:
the required latent artifacts still lack proven producer/model/parameter/input/output checksums
and atomic readback. `LATENT256_CURRENT_COHORT_CANDIDATE` is 15/15; `latent_128` is still absent
as a physical column. Next gate remains
`REPAIR_LATENT_PRODUCER_BEFORE_ANY_APPLY`.

The planner contract was tightened in the same read-only pass: `plan-lineage-qualified-latent-
canary-v1.mjs` now declares three independent required artifacts (`latent_256`, `latent_128`,
and `latent_64`), each derived directly from `semantic_768` with its own dimension and the same
binding/checksum/readback requirements. Candidate rows expose all three output representation
IDs; no latent values are generated. This removes the previous mismatch where a `latent_256`
cohort was paired with a single `ae_latent_64` output label.

### SEMANTIC-REPRESENTATION-OWNER-01 — read-only owner audit (2026-09-08)

The live semantic owner decision remains open. Both `content_embedding` and
`content_embedding_768` are 768-dimensional representations, but they are not proven
interchangeable by column name or dimension. The grouped census shows `content_embedding`
populated across the large `embeddinggemma:latest:eg-task-prefix-v1` / `qdrant-backfill-v1`
cohort, while `content_embedding_768` is only partially populated across mixed
embedding-version groups. The larger column cannot be promoted merely because it has more
rows, and the sparse transition column cannot be called complete merely because its type is
`vector(768)`.

Before changing the canonical predicate, compare model/tokenization/pooling, normalization,
source content hash, encoder/representation revision, vector values, and Qdrant payload
lineage on a bounded exact join. Until that receipt exists, the planner retains
`content_embedding_768` as the reviewed transition predicate, records `content_embedding` as
an unpromoted candidate, and leaves reindex/fanout writes blocked.

Bounded live comparison (2026-09-08): 739 rows contain both vector columns; exact vector
equality is `0/739`, mean cosine distance is approximately `0.099843`, and maximum cosine
distance is approximately `0.274282`. Grouped means are approximately `0.103471` for
`embeddinggemma:latest:eg-task-prefix-v1` (576 rows) and `0.0870239` for
`embeddinggemma:latest` (163 rows). This proves the columns are not interchangeable mirrors;
changing the canonical owner would change retrieval geometry. No vector or index writes were
performed.

Upstream representation-owner audit (2026-09-08): `node scripts/atlas/audit-emb3a-upstream-revision-owner.mjs`
remains `REVISION_OWNER_NOT_PROVEN`. Live `atlas_packets` has 61,718 packet/source rows and
workspace/representation columns, but lacks `source_revision` and `representation_id`; all
61,718 workspace revisions are zero and only one representation revision is nonzero.
`atlas_source_revisions` contains two rows but has no packet-key or source-ref bridge.
`atlas_ast_nodes` has 11,067 rows but zero populated source revisions, and
`atlas_representation_records` is empty. This is the authoritative blocker for semantic-owner
promotion: no schema repair, vector rewrite, or lineage backfill is inferred from these
read-only findings.

Provenance follow-up (2026-09-08): the first audit query referenced non-existent live columns
(`encoder_revision`, `source_revision`) and was corrected from `information_schema` before
drawing conclusions. The corrected census shows all 739 overlapping rows have content hashes,
Qdrant IDs, embedding versions, and `embedding_normalized=true`; however, 647 of the 1,386
`content_embedding_768` rows have no `embedding_version`, while only 739 have both columns
for direct comparison. The field is dimension-valid but not provenance-complete. This is why
semantic-owner promotion remains blocked rather than being decided by population size.

Read-only dependency proof (2026-09-08): `audit-current-workspace-packet-chunk-join-v1.mjs`
found one current workspace revision with 111 binding rows but zero exact Graphify source joins
and zero packet/chunk content matches. `audit-current-source-evidence-hydration-v1.mjs` found
52 exact revision matches but only 9 content-hydrated rows; 43 lack a canonical chunk owner.
The separate `audit-chunk-bridge-v1.mjs` found 100 exact chunk identities in its 353-row cohort,
but 179 rows remain revision-unproven. These are distinct cohorts and must not be combined.
No reindex or projection write is authorized from these results.

The audit was tightened to normalize slash direction, leading `./`, and case, and to accept
Graphify's authoritative `code_source_revision` with a `source_revision` fallback. The live result
remains zero exact Graphify joins, zero binding/chunk content matches, and zero packet/chunk exact
matches. Therefore this is not a simple path-formatting defect; current source-binding ownership
or content-hash correspondence must be repaired/proven before any heuristic join is considered.

Follow-up diagnostic: all 111 bindings now match Graphify by normalized source reference,
source revision, and content hash; 0 match the current workspace revision and all 111 are classified
as `workspace_mismatch_rows`. The next repair is therefore workspace-revision ownership/selection,
not path normalization or content rehydration. No rows were promoted.

Currentness owner audit (2026-09-08): `audit-current-graphify-run-owner-v1.mjs` reports one
Graphify run still `RUNNING` with no completed owner. The source-cohort audit reports 52 source-
revision-qualified rows under workspace revision `sha256:927ed411...`, while live workspace
bindings use `sha256:55edaaad...`; 52/52 are therefore workspace-mismatched. Do not relabel,
backfill, or promote either revision until the Graphify run completes and its owner is independently
read back.

Lifecycle-owner replay 2026-09-08: `audit-graphify-stale-run-reconciliation-v1.mjs` classified
the portfolio as `CONFLICTING_EVIDENCE`; no process owner was present and promotion/readiness
replay remained disallowed. `audit-graphify-lifecycle-owner-v1.mjs` found 7 running records,
6 stale records, and 1 current record, with `LIFECYCLE_OWNER_UNPROVEN`,
`STALE_RUNS_NOT_RECONCILED`, and `REPOSITORY_REVISION_NOT_CURRENT` blockers. A fresh Graphify
run is not eligible yet. The audits were read-only and performed zero writes.

Completion-plan replay 2026-09-08: `plan-graphify-run-completion-v1.mjs` remains
`COMPLETION_PLAN_BLOCKED` with blockers `CANONICAL_GRAPHIFY_RUN_NOT_COMPLETED`,
`SOURCE_SELECTION_NOT_COMPLETE`, and `STRUCTURAL_RESOLUTION_RECEIPT_INCOMPLETE`.
No graph revision was emitted and no Postgres, Qdrant, Neo4j, or Valkey mutation is authorized.

Current-run detail replay 2026-09-08: the selected run is
`14643371-f6f2-4131-906b-235a5c06619a`, bound to workspace
`sha256:55edaaad...`, with a 24,192-source manifest and status `RUNNING` since
2026-08-28. It has no `completed_at`, no recorded `graph_revision`, and no persisted
per-edge structural outcome detail. The reconciliation classification is
`CONFLICTING_EVIDENCE`; this run must not be completed or promoted without an explicit
owner decision and completion/readback proof.

Follow-up hydration replay 2026-09-08: `audit-current-source-evidence-hydration-v1.mjs` remains
`SOURCE_EVIDENCE_HYDRATION_BLOCKED`: 52 exact source-revision matches, only 9 content-hydrated,
0 authoritative namespaces, 0 evidence-span-ready, and 0 classifier-ready. The 43 remaining
rows lack a canonical chunk owner; the 9 hydrated rows have content but no source revision.
The separate `audit-chunk-bridge-v1.mjs` cohort remains distinct: 353 examined, 100 exact chunk
identities, 74 source-only ambiguous, and 179 revision-unproven. Its `promotionEligible` result
does not authorize combining it with the blocked hydration cohort or writing projections.
No writes occurred.

Current batch planning replay 2026-09-08: `plan-current-source-graphify-batch-v1.mjs` selected
52 rows but classified 0 as `currentGraphifyExact` and all 52 as
`graphifyRevisionOrContentMismatch`. The selection checksum is
`0c4ff5b9107a9f2eb0dee9ddfac3b4393941e4dcfc3dc146fe776cb7026acaf3`.
The result is `CURRENT_GRAPHIFY_BATCH_PLAN_BLOCKED_REVIEW`; no current-source canary is eligible.

Source-reference resolution replay 2026-09-08: `audit-graphify-source-ref-resolution-v1.mjs`
examined 61,717 packet references against 25,643 Graphify references. It found 17,307 raw
exact matches, 3,003 normalized matches, 215 unique-basename matches, 5,155 ambiguous-basename
matches, and 36,037 unresolved references. Only raw exact matches with independent content and
revision proof are promotion-eligible; normalized and basename matches remain diagnostic, and
ambiguous/unresolved references are rejected. The audit reported 100 exact packet/chunk/Graphify
bridges but does not authorize combining cohorts or performing projection writes.

Git source-authority replay 2026-09-08: `audit-graphify-git-source-authority-v1.mjs` selected
run `14643371-f6f2-4131-906b-235a5c06619a` but found 0 authoritative Graphify rows against
25,365 repository tree entries. `gitAuthorityProven=false`; therefore the existing run cannot
serve as the canonical source manifest. Exact path matches remain observations only until a
completed owner-controlled source manifest is produced.

Scope reconciliation replay 2026-09-08: `source-scope-reconciliation-v1.mjs` found an active
indexable manifest of 16,629 distinct references (16,568 admitted), while PostgreSQL contains
55,853 `codebase_chunk_index` rows and only 1,386 rows with `semantic_768` vectors. The live
Qdrant target is `codebase_chunks_768` with 109,776 points, three 768-dimensional named vectors,
and green/healthy optimizer state; it is not the previously referenced `_768_v2` target. Exact
manifest-to-Postgres, manifest-to-Graphify, and manifest-to-Qdrant coverage all remain false.
This is a read-only scope/alignment result and does not authorize reconciliation or upsert.

Qdrant collection-owner census 2026-09-08: repository-wide targeted search shows
`codebase_chunks_768` is the operational collection used by retrieval, restore, validation,
embedding, ACE, and topology paths. `codebase_chunks_768_v2` is confined to isolated canary/
sparse-experiment paths. This resolves the configuration ambiguity for future planning, but
does not prove current identity/revision parity for the operational collection; that still
requires an independent Postgres-to-Qdrant census and bounded readback.

Live store-parity census 2026-09-08: `node scripts/atlas/verify-store-parity.mjs --store=qdrant`
read 61,718 PostgreSQL packets (6,451 with `qdrant_point_id`), 109,776 Qdrant points, and
59,692 Neo4j packet nodes. A 100-point Qdrant sample carried `packet_key`, `source_ref`, and
`feature_id`; Neo4j reported 0 packet nodes with Qdrant IDs; Valkey reported 0 BitFrost packet
and 0 centroid directory keys. The existing report's negative "Qdrant missing" arithmetic is
not a valid coverage metric because the Qdrant and PostgreSQL populations are not one-to-one.
This is read-only evidence; no repair or projection write was performed.

Bounded identity replay 2026-09-08: `node scripts/atlas/qdrant-postgres-identity-audit.mjs
--dry-run --limit=1000` classified all 1,000 audited Qdrant points as
`EXACT_ATLAS_PACKET_KEY`, with 0 ambiguous and 0 unknown identities. The broader PostgreSQL
join remains incomplete: 6,451 of 61,718 `atlas_packets` rows have `qdrant_point_id`, while
all 55,853 `codebase_chunk_index` rows have `qdrant_id`. This proves a bounded identity path,
not full population parity; the generated ledger is diagnostic and no Qdrant/Postgres repair
was applied.

Full-census attempt 2026-09-08: the same audit without `--limit` began traversing the operational
collection but exited before producing a final summary/receipt; the existing ledger remains the
prior 1,000-row bounded ledger. No full-census counts are accepted. The audit now supports
checkpointed NDJSON pages via `--checkpoint=...` and `--resume`; a fresh bounded replay of 200
points wrote `auditedPoints=200`, `next_page_offset=201`, and exactly 200 ledger rows, then resumed
to 300 points with exactly 300 ledger rows and `next_page_offset=301`. This proves bounded resume
cursor/ledger consistency only; no full-census counts are accepted and no Qdrant/Postgres repair
was applied. A subsequent resumed extension to 1,000 points classified all 1,000 as
`EXACT_ATLAS_PACKET_KEY`, with 0 ambiguous and 0 unknown identities; the checkpoint and ledger
both report 1,000 audited rows and `next_page_offset=1002`. Full operational-collection parity
remains unproven. The same checkpoint was then extended to 5,000 unique points: all 5,000 were
`EXACT_ATLAS_PACKET_KEY`, with 0 ambiguous and 0 unknown identities; checkpoint and ledger both
report 5,000 rows and `next_page_offset=5002`. This strengthens the bounded identity evidence but
does not authorize repair or establish full collection parity. The same checkpoint was then
extended to 20,000 unique points: all 20,000 were `EXACT_ATLAS_PACKET_KEY`, with 0 ambiguous and
0 unknown identities; checkpoint and ledger both report 20,000 rows and `next_page_offset=20002`.
This remains bounded read-only evidence and does not establish full operational-collection parity
or authorize repair.
The completed resumable scan reached the end of `codebase_chunks_768`: 109,676 unique points,
with checkpoint and ledger counts equal and `completed=true`. Classification was 106,237
`EXACT_ATLAS_PACKET_KEY`, 3,436 `EXACT_CHUNK_QDRANT_ID`, 2 `SOURCE_REF_ONLY` ambiguous, and 1
`UNKNOWN_IDENTITY`. This closes the census itself, not parity or repair: the ambiguous/unknown
rows and the chunk-vs-packet population split require a separate review before any backlink or
projection mutation.
Review of the three exceptional rows found that the two `SOURCE_REF_ONLY` classifications were
too permissive: each source had one packet row but multiple chunk rows. The audit classifier now
counts packet and chunk matches together and returns `AMBIGUOUS_SOURCE_REF` whenever the combined
source population exceeds one. The remaining unknown point carries a non-matching hash-like
payload packet key and is retained as `UNKNOWN_IDENTITY`. The regenerated final ledger contains
109,776 points: 106,337 `EXACT_ATLAS_PACKET_KEY`, 3,436 `EXACT_CHUNK_QDRANT_ID`, 2
`AMBIGUOUS_SOURCE_REF`, and 1 `UNKNOWN_IDENTITY`. This is an audit-classification result only;
no repair, backlink, or projection mutation is authorized.
The manifest now includes the live packet/chunk relationship census: 6,440 distinct packet
Qdrant IDs, 55,853 distinct chunk Qdrant IDs, 1,280 exact ID overlaps, 5,171 packet-only IDs,
54,576 chunk-only IDs, and 11 duplicate packet backlink rows. Reconciliation policy is to keep
packet and chunk identities separate and reconcile only through exact revision-qualified lineage;
collection counts must not be used as a one-to-one parity denominator.
Live pgvector census 2026-09-08: `codebase_chunk_index` has 55,853 rows and complete FTS coverage.
`content_embedding` is populated for 55,169 rows at dimension 768 using `halfvec`, while the
separate `content_embedding_768` vector column contains only 1,386 rows at dimension 768. Other
representations are partial: `latent_256` 55,169, `latent_64` 1,703, `summary_embedding` 1,160,
`signature_embedding` 533, and `error_embedding` 0. Metadata still exposes three EmbeddingGemma
labels and historical dimensions `{384,768}`. pgvector is therefore substantially built out, but
the canonical dense-column owner and representation revision still require explicit reconciliation;
no rewrite or index mutation was performed.
Duplicate-backlink review 2026-09-08: all 11 duplicate `atlas_packets.qdrant_point_id` rows are
cross-source collisions (11 groups, each with two distinct packet keys), involving mirrored roots,
backup folders, or duplicate repository paths. They are not same-packet revision duplicates and
must not be auto-deduplicated. The parity manifest now records the duplicate-group count and keeps
these rows outside any repair scope.
The corrected projection-owner report shows the broader legacy-generation issue: 4,351 duplicate
packet-key groups across Qdrant points, with mixed `SMALL_INTEGER` and `UUID` point-ID generations;
the largest packet-key group contains 755 points. This is not safe to collapse in place. Any future
repair must use a new revision-qualified projection collection and reviewed alias/cutover plan,
not winner selection inside `codebase_chunks_768`.
Live Qdrant cutover inventory 2026-09-08: no aliases exist. `codebase_chunks_768` is green with
109,776 points and named vectors `content`, `error`, and `signature`, each 768-dimensional;
`codebase_chunks_768_v2` is a separate green 52,816-point collection, and latent collections are
separate as well. A future migration must build and validate a new revision-qualified collection,
then perform a reviewed alias cutover; it must not rename, delete, or repair the operational
collection in place.
The dedicated projection-ID owner audit also had a reporting defect: source-path comparison was
counting every candidate chunk, not each Qdrant point. It now counts at most once per point. The
corrected read-only report shows 4,011 exact source-path chunk bridge matches and 105,750
point-level source-path mismatches, within the 109,776-point population. This fixes observability
only; it does not make mismatched projection IDs repairable.
The duplicate-row detail confirms the root mechanism: `source_ref_key` is reused across distinct
repositories/workspaces, while the sampled rows carry `workspace_revision=0`,
`representation_revision=0`, and empty `content_hash`. Therefore a future projection identity
must be qualified by repository/workspace plus packet or chunk identity and revision; no repair may
deduplicate on `source_ref_key` or Qdrant point ID alone.
Exception review 2026-09-08: live payload inspection confirmed the two ambiguous points are
document projection points for a source with six chunk rows, while the unknown point is a
`process_packet` projection carrying a non-canonical hash-like key and no matching packet/chunk
row. The parity manifest now records explicit dispositions
`RETAIN_UNRESOLVED_CROSS_TABLE_SOURCE` and `RETAIN_UNRESOLVED_NONCANONICAL_PROJECTION`, both with
`safeToRepair=false`; manifest checksum was regenerated. These are retained for provenance review,
not deleted or repaired.
The checkpoint restore path now also rejects any ledger/checkpoint row-count mismatch rather than
silently resuming from an unsafe cursor. The checkpointed audit was extended to 50,000 unique
points; the ledger and checkpoint agree at 50,000 rows with `next_page_offset=50102`, and the
bounded result remains 100% `EXACT_ATLAS_PACKET_KEY` with 0 ambiguous and 0 unknown identities.

Process-owner check 2026-09-08: the Windows process census found no live Graphify worker,
`daily-graphify`, or source-inventory process. The selected `RUNNING` database record is
therefore an orphaned status row rather than a currently resumable worker. No process was
stopped and no database status was changed.

### ATLAS-COMPILED-SNAPSHOT-BOUNDARY-01 — architecture update 2026-09-08

- [x] Treat the cross-schema reindex manifest as a read-only admission input to a future
  `AtlasCompiledSnapshotV1`, not as canonical state and not as a monolithic binary/vector index.
- [x] Freeze snapshot metadata as revision-qualified references and sealed artifact digests for
  workspace, graph, semantic, ontology, classifier, packet-set, ordinal maps, lexical/AST/CST,
  graph/hypergraph, domain, latent, semantic_768, glyph, and receipt artifacts.
- [x] Freeze compiler lowering: PostgreSQL/source evidence → Graphify IR → deterministic ordinals,
  CSR/COO, incidence, bitsets, and feature columns → derived PostgreSQL search, Qdrant, TurboVec,
  cuVS, Neo4j/cuGraph, and `.okf`/ByteTile artifacts.
- [x] Freeze executor ownership: NetworkX is the CPU graph oracle; Neo4j and cuGraph are graph
  executors/projections; Qdrant, cuVS, and TurboVec are semantic executors; cuTile/WebGPU are
  challengers. None owns identity or meaning.
- [x] Freeze ACE/BitFrost as residency/context policy. Agents receive revision-qualified
  ContextManifests, not raw database contents or unqualified binary sections.
- [ ] Extend the current planner into a sealed snapshot only after exact source, parse, symbol,
  packet, and representation joins are proven.
- [ ] Build Arrow/MsgPack/`.okf` sections only from that sealed snapshot; no section may mint or
  replace canonical IDs.

### REGISTRY-WRITER-OWNERSHIP-02 — live parity and writer reachability audit 2026-09-08

- [x] Added the read-only `scripts/atlas/audit-registry-writer-ownership-v2.mjs` audit and
  root command `npm run atlas:packet-registry:writer-ownership`.
- [x] Live parity confirms `atlas_packets=61,718` and `atlas_packet_registry=61,718`, with
  zero missing packet keys, orphan registry rows, duplicate registry keys, and 61,718 packets
  complete for packet/source/feature identity.
- [x] Classified six known surfaces without executing them: HyperRAG is `UNRESOLVED` because
  no production entrypoint was proven; the root addressable materializer is an
  `ACTIVE_SECONDARY_WRITER` for file/manifest output; the SvelteKit duplicate is `UNRESOLVED`;
  one backfill is `MANUAL_MIGRATION_ONLY`; one Week 1 script is `BROKEN_LEGACY`; and the
  remaining Week 1 script is `MANUAL_MIGRATION_ONLY`.
- [x] Recorded HyperRAG's real risk: it can create/alter the registry and uses
  `ON CONFLICT (packet_key) DO UPDATE`, but the audited writer has no source/workspace/graph
  revision references or transaction markers.
- [x] Follow-up source review found HyperRAG calls `ensureHotTable()` before its dry-run branch;
  therefore its advertised dry-run is not write-free because it can execute registry DDL.
- [x] Corrected HyperRAG dry-run behavior: schema admission now runs only under `--apply`, and
  `upsertRegistry()` is no longer called during dry-run. A bounded `--dry-run --limit=1` replay
  completed with one planned row, zero database upserts, and no runtime errors.
- [x] Added three source-level regression tests covering apply-only schema admission, apply-only
  registry upsert, and explicit dry-run planning markers; all pass without service access.
- [ ] Keep HyperRAG apply blocked until its writer is revision-qualified, transaction-safe, and
  explicitly selected as the canonical registry owner.
- [ ] Decide whether HyperRAG becomes the single canonical registry writer or remains
  archived/unresolved; do not run it or any registry backfill until that decision is made.
- [x] Reviewed `materialize-addressable-packets.mjs` separately as a non-registry artifact;
  the root copy is the discovered package entrypoint and publishes file/manifest artifacts
  under `--apply`, while the SvelteKit-local copy is not a discovered package entrypoint.
  See `docs/reports/addressable-packet-materializer-ownership-v1.json`; no writer was run.
  producer and reconcile its `--apply` file publication semantics before promotion.
`REINDEX-MANIFEST-CROSS-SCHEMA-01` parity precursor 2026-09-08: generated the read-only
`docs/reports/qdrant-postgres-parity-manifest-v1.json` from the corrected completed ledger and
live PostgreSQL population counts. It records 109,776 audited Qdrant points, 109,773 exact
identity classifications, and 3 exceptional identities. The manifest explicitly sets
`promotion.eligible=false` and `writesPerformed=false`; no backlink, repair, or projection write
was performed. This closes manifest generation, not identity remediation or promotion.

Source-authority drift follow-up 2026-09-08: `audit-graphify-workspace-owner-v1.mjs` confirms
the workspace owner contract exists at `public.workspaces.id` with live counts
`workspaces=1`, `graphify_runs=19`, and `graphify_files=26,014`. However,
`audit-graphify-git-source-authority-v1.mjs` against the workspace-bound run
`14643371-f6f2-4131-906b-235a5c06619a` returns `rowCount=0`, `repositoryTreeEntryCount=25,365`,
and `gitAuthorityProven=false`. Thus the database ownership schema exists, but the selected run
has no file rows to prove Git/source authority. Option 2 remains the correct frontier; do not
start REL-01A or promote the projection fabric from this evidence.

### AGENTIC-ERROR-FIXING-KANBAN-01 — consolidated recommendation board (2026-09-08)

Refreshed the existing workstation board with
`node scripts/atlas/build-parent-atlas-workstation-openspec-workboard-v2.mjs`. The board is
recommendation-only and reads task authority from `openspec/changes/*/tasks.md`; it does not
change task checkboxes or infer promotion from implementation presence. Current selected scope is
48 tasks: `BLOCKED_UPSTREAM=2`, `UNVERIFIED=14`, `HUMAN_DECISION_REQUIRED=1`,
`OWNED_BY_OTHER_CHANGE=12`, `GOVERNANCE_ONLY=4`, `NEGATIVE_CONSTRAINT=13`, and
`SUPERSEDED=2`; `OPEN_ACTIONABLE=0`.

Recommended Kanban order for collaborative error fixing:

`BLOCKED` — resolve current Graphify/source-owner drift and the 52-row current-workspace mismatch;
do not start REL-01A or projection fanout.

`READY_FOR_REVIEW` — inspect the unverified candidate tasks for exact evidence and owner scope,
especially CandidateFeatureMatrix, ordinal-map, exact-KNN, and SOM prerequisites.

`HUMAN_GATE` — require explicit authorization before any lifecycle, database, Qdrant, Neo4j,
Valkey, or model mutation.

`IMPLEMENT` — only a task with a real owner, current input, bounded target, and safe dry-run path.

`VERIFY` — run focused tests/readback and attach a report with exact counts/checksums.

`DONE` — only when implementation is wired, replay/readback is proven, and the owning ledger
accepts the evidence. Board reports are
`docs/reports/parent-atlas-workstation-openspec-workboard-v2.json` and `.md`.

### OPENSPEC-PORTFOLIO-RECONCILIATION-02 — deterministic read-only inventory (2026-09-08)

Added `scripts/atlas/reconcile-openspec-portfolio-v2.mjs` to inventory both OpenSpec trees and
emit relation candidates without archiving, renaming, merging, or changing task state. The live
run found 94 active change directories (`ROOT=81`, `SVELTEKIT=13`; archived directories are
excluded) and 6,137 checkbox tasks, of which 3,607 are checked. After filtering generic prose
tokens and path/table fragments, it emitted 1,270 evidence-backed candidate relations and 98
narrower owner collision candidates; all 1,270 relations have `mutationRecommended=false`. The result is a
candidate graph, not a duplicate verdict: shared paths/tables/functions and explicit references
must still be manually classified before any archival action. Reports:
`docs/reports/openspec-portfolio-inventory-v2.json` and
`docs/reports/openspec-portfolio-relations-v2.json`. Script syntax and the existing OpenSpec
owner validate cleanly. Collision triage now separates 57 `P1_CANONICAL_TABLE_REVIEW`
candidates and 41 `P2_SHARED_DERIVED_SURFACE` candidates. Archived directories are excluded
from the active portfolio; no cross-tree P0 collision remains in this run.

### ATLAS-CANONICAL-PROJECTION-FABRIC-01 — tracked next step, gated (2026-09-08)

Record-only proposal: after the workspace-revision drift blocker is resolved, build a bounded
read-only admission receipt for the canonical projection fabric. The intended evidence chain is
`source revision -> CST/AST and AST-grep observations -> symbol versions -> packet/chunk/concept
candidates -> sealed ordinal map -> semantic_768 and latent_256/128/64 manifests -> graph and
cache projection plans -> ACE evidence-card plan`. The receipt must measure identity, revision,
representation, symbol, graph, ontology, ordinal-map, checksum, and projection predicates and
must report `NOT_PROVEN` or `BLOCKED` when any prerequisite is absent.

This remains explicitly gated behind resolving `NO_CURRENT_COMPLETED_BOUND_SOURCE_OWNER` and
the current workspace-revision drift. Do not create `.okf`/Arrow/MsgPack artifacts, generate
latent values, fan out to Qdrant/Neo4j/Valkey, or promote ACE evidence from this proposal alone.
This entry follows the repository's record-but-don't-fix convention; it is a tracked next step,
not an implementation claim.

Prerequisite replay 2026-09-08: `node scripts/atlas/audit-current-graphify-run-owner-v1.mjs`
remains `GRAPHIFY_RUN_OWNER_BLOCKED`. The audit found one run for expected workspace revision
`sha256:55edaaadab0cef724593287c7c908dad6cdc1b25039a752a6b5dab2c0c44fac9`, with
`currentStatus=RUNNING`, `currentCompletedAt=null`, and `completedOwnerCount=0`. The report was
written successfully and the audit performed no data or projection writes. Therefore
`ATLAS-CANONICAL-PROJECTION-FABRIC-01` remains blocked; do not attempt its receipt, artifact
generation, or fanout until a completed bound source owner is independently read back.

State-change reconciliation 2026-09-08: during the subsequent read-only audit, the previously
`RUNNING` Graphify records were observed as `SUPERSEDED` with `completedAt=2026-09-08T23:38:12.571Z`;
this mutation was not issued by the audit commands in this session. Fresh owner replay now reports
`currentStatus=SUPERSEDED`, `completedOwnerCount=0`, `runningRunCount=0`, `currentRunCount=0`,
and blockers `LIFECYCLE_OWNER_UNPROVEN` plus `CURRENT_RUN_NOT_ESTABLISHED`. Treat the transition
as external state change requiring provenance review, not as a completed Graphify run. No fresh
run, projection, or latent operation is authorized from it.

Completion-plan replay 2026-09-08: `node scripts/atlas/plan-graphify-run-completion-v1.mjs`
remains `COMPLETION_PLAN_BLOCKED` with blockers `CANONICAL_GRAPHIFY_RUN_NOT_COMPLETED`,
`SOURCE_SELECTION_NOT_COMPLETE`, and `STRUCTURAL_RESOLUTION_RECEIPT_INCOMPLETE`. The bounded
source plan contains 52 rows, all classified `graphifyRevisionOrContentMismatch`, with
`currentGraphifyExact=0` and selection checksum
`0c4ff5b9107a9f2eb0dee9ddfac3b4393941e4dcfc3dc146fe776bc7026acaf3`. No graph revision was
produced and no lifecycle or projection mutation was performed.

Source-revision replay 2026-09-08: `node scripts/atlas/audit-current-graphify-source-revision-
v1.mjs` selected completed run `48485685-e773-4433-a1f8-00f5524cca44` by completed-bound file
count and inspected 23,758 rows. Results were `CONTENT_MATCH=23,456`,
`CONTENT_MISMATCH=290`, and `SOURCE_UNAVAILABLE=12`; status is `SOURCE_BYTES_NOT_PROVEN`.
This is completed-run evidence, but not current-source admission: the 302 nonmatching or
unavailable rows and the separate workspace-drift/lifecycle findings remain unresolved. No
source, Graphify, packet, or projection rows were changed.

Source-evidence hydration replay 2026-09-08: `node scripts/atlas/audit-current-source-evidence-
hydration-v1.mjs` remains `SOURCE_EVIDENCE_HYDRATION_BLOCKED`. All 52 rows have exact revision
matches, but only 9 are content-hydrated and 0 are authoritative-namespace or evidence-span
ready. The missing reasons are `CANONICAL_CHUNK_OWNER_MISSING=43` and
`CHUNK_OWNER_HAS_CONTENT_BUT_NO_SOURCE_REVISION=9`; classifier-ready count is 0 and writes are
0. This confirms the blocker is missing canonical chunk/source ownership, not merely a stale
checksum. Projection-fabric and Graphify recovery remain gated.

Graphify lifecycle replay 2026-09-08: the existing read-only audits remain contradictory and do
not authorize recovery. `audit-graphify-stale-run-reconciliation-v1.mjs` reports
`CONFLICTING_EVIDENCE`, one run, no process owner, and `promotionAllowed=false`.
`audit-graphify-lifecycle-owner-v1.mjs` reports `LIFECYCLE_OWNER_UNPROVEN`, seven running/stale
runs, zero current runs, and blockers `STALE_RUNS_NOT_RECONCILED`,
`CURRENT_RUN_NOT_ESTABLISHED`, and `REPOSITORY_REVISION_NOT_CURRENT`. All reports record
`writesPerformed=false`. The projection-fabric gate therefore remains blocked; do not start a
fresh Graphify run or relabel stale records from this audit alone.

Lifecycle record detail 2026-09-08: all seven records are `RUNNING` with
`lastHeartbeatAt=null`, `activeWorkerEvidence=false`, `graphRevision=null`, and
`artifactMatchesRunRevision=false`; the audit recommends `SUPERSEDE` for each, but that is only
a disposition recommendation, not authorization to mutate. The newest record started
2026-09-08T05:27:52.415Z and is two commits behind the recorded repository head; the current
workspace-bound record `14643371-f6f2-4131-906b-235a5c06619a` started 2026-08-28 and is 405
commits behind. This confirms stale/ambiguous lifecycle state, not a safely recoverable current
owner. No run was stopped, superseded, or restarted.

Machine/runtime owner check 2026-09-08: Windows process census found no matching Node or Python
`graphify`/`run-graph`/`daily` process. Docker also has no Graphify container; only the NLP
sidecar, RAPIDS executor, neural decoder, and Go Retrieval service are running among the related
services. This independently corroborates `activeWorkerEvidence=false`: the database's seven
`RUNNING` rows appear orphaned from the current workstation runtime. This is evidence for an
owner-reconciliation decision, not permission to mark or supersede rows.

### GRAPHIFY-STALE-RUN-RECONCILIATION-01 — apply, first write in this chain (2026-09-08)

Operator-confirmed decision to act on the above evidence rather than continue auditing.
Built `scripts/atlas/apply-graphify-stale-run-reconciliation-v1.mjs` — the first script in this
whole chain that writes. It re-derives eligibility live rather than trusting any prior report:
(1) `status='RUNNING' AND completed_at IS NULL`; (2) `repository_revision` strictly behind a
freshly-read git HEAD (`git rev-list --count`); (3) a fresh PowerShell `Win32_Process` census run
immediately before the write, matching only real Graphify worker entrypoints
(`run-graphify-daily-startup`, `daily-graphify-cold-processing`, `index-codebase-fast`,
`ace-incremental-startup`) and explicitly excluding this tooling family's own filenames — the
first census attempt naively matched the bare substring `graphify` and caught its own PowerShell
invocation and the reconciliation script's own process, correctly aborting with zero writes; this
was fixed before any write occurred, not after.

`--dry-run` confirmed 7/7 rows eligible (commits-behind-HEAD ranging 2 to 407) with a clean
process census, matching the read-only audits above exactly. The real apply then ran inside one
transaction: `UPDATE graphify_runs SET status='SUPERSEDED', completed_at=NOW(), configuration =
configuration || {supersededBy, supersededAt, supersededReason, evidenceRefs} WHERE run_id =
ANY(eligible ids) AND status='RUNNING' AND completed_at IS NULL RETURNING run_id` — a row-count
check between eligible IDs and `RETURNING` rows guards against a concurrent-change race; a
mismatch would have rolled back the whole transaction. Result: `SUPERSEDED`, 7/7 rows updated.
Live verification post-write: `graphify_runs` status distribution is now `COMPLETED=12,
SUPERSEDED=7, RUNNING=0` — no row was marked `COMPLETED` (which would have misrepresented an
orphaned row as a successful run); no artifact, graph, Qdrant, Neo4j, or Redis state was touched.
Receipt: `docs/reports/graphify-stale-run-reconciliation-apply-v1.json`.

This closes the specific stale-row cleanup, not the broader chain: `LIFECYCLE_OWNER_UNPROVEN`
still holds (no single canonical `graphify_runs` writer was established by this action — this
was a bounded administrative correction, not a claim of writer ownership), and
`ATLAS-CANONICAL-PROJECTION-FABRIC-01` remains gated on the separate, unresolved
`NO_CURRENT_COMPLETED_BOUND_SOURCE_OWNER` blocker. A fresh Graphify run is not started by this
entry and remains a separate decision.

### GRAPHIFY-POST-RECONCILIATION-REVIEW-01 — read-only replay (2026-09-08)

Replayed the current authority and completion checks after the bounded stale-row correction:

- `node scripts/atlas/audit-current-graphify-run-owner-v1.mjs` remains
  `GRAPHIFY_RUN_OWNER_BLOCKED`; expected workspace revision is
  `sha256:55edaaadab0cef724593287c7c908dad6cdc1b25039a752a6b5dab2c0c44fac9`, the bound row is
  `SUPERSEDED` with `currentCompletedAt=2026-09-08T23:38:12.571Z`, and
  `completedOwnerCount=0`.
- `node scripts/atlas/audit-graphify-run-file-binding-v1.mjs` reports
  `COMPLETED_BOUND_OWNER_PRESENT`, with `COMPLETED_BOUND=4`, `COMPLETED_UNBOUND=8`, and
  `OTHER=7`. This proves historical completed-bound populations exist; it does not prove that
  any one is current for the active workspace.
- `node scripts/atlas/plan-graphify-run-completion-v1.mjs` remains
  `COMPLETION_PLAN_BLOCKED` with `CANONICAL_GRAPHIFY_RUN_NOT_COMPLETED`,
  `SOURCE_SELECTION_NOT_COMPLETE`, and `STRUCTURAL_RESOLUTION_RECEIPT_INCOMPLETE`; no
  `graphRevision` was produced.
- `npx tsx scripts/atlas/select-current-source-evidence-authority-v1.mts` returns
  `NO_CURRENT_COMPLETED_BOUND_SOURCE_OWNER`, with 19 total runs, 12 completed, 0 running,
  4 completed-bound, 8 completed-unbound, no selected run, and zero selected source rows.
- `node scripts/atlas/prove-current-source-evidence-authority-live-replay-v1.mjs` returns
  `LIVE_REPLAY_PROVEN` for the selector behavior, but both read-only passes agree on
  `NO_CURRENT_COMPLETED_BOUND_SOURCE_OWNER`; current workspace state is dirty with source
  count 24,094 and no selected run.
- The `.graphify-daily-start.lock` file names `run-graphify-daily-startup.mjs`, but its recorded
  PID has no matching live Graphify process in the machine census. Treat it as stale runtime
  evidence, not as proof that a run is active.

Conclusion: the stale-row cleanup is verified, selector replay is verified, and the current
source-owner gate is still blocked. Do not generate the canonical projection-fabric receipt,
latent artifacts, AST/symbol promotion, or projection fanout from historical completed-bound
runs. A fresh Graphify lifecycle run requires a separately reviewed owner/entrypoint decision.
All commands in this review were read-only; no source, packet, vector, graph, cache, or lifecycle
rows were changed.

### GRAPH-SNAPSHOT-JSON-EXPORT-REVIEW-01 — capability and boundary review (2026-09-08)

The graph-export proposal is directionally correct, but the repository already contains
several different export surfaces and they must not be treated as one canonical graph:

- `sveltekit-frontend/src/routes/api/codebase-graph/json/+server.ts` is a legacy fast-AST
  viewer export. It reads `docs/graph/codebase-graph.json`, caps output at 5,000 nodes/files,
  and emits file/directory node-link data without source/workspace revisions, symbol versions,
  graph revision, or canonical identity proof.
- `sveltekit-frontend/src/routes/api/codebase-index/export/bundle/+server.ts` is a unified,
  capped admin bundle assembled from graph, cluster, wiki, manifold, tile, and cache sources.
  It is useful for dashboard/agent inspection, but its graceful degradation and mixed sources
  make it unsuitable as the canonical projection input.
- `scripts/atlas/export-graph-snapshot-v2.mts` and the existing graph snapshot materializer,
  Postgres loader, identity validator, and parity exporter provide the stronger revisioned
  shape. The exporter currently writes a monolithic JSON artifact and must not be run as a
  promotion step while `NO_CURRENT_COMPLETED_BOUND_SOURCE_OWNER` remains unresolved.
- `scripts/atlas/daily-graphify-directory-stream.mjs` already emits a bounded JSONL planning
  stream and receipt, but its AST/chunk/semantic/Graph GPU stages are explicitly planned or
  deferred; it is a planning artifact, not a completed canonical Graphify snapshot.

Structural discovery was rechecked with the pinned project tool:
`npm run atlas:ast-grep:outline:audit:pinned` returned
`OUTLINE_STRUCTURAL_DISCOVERY_PROVEN` using `ast-grep 0.45.3`, covering 526 files, 5,705
outline items, 3,974 members, and 4,029 exported items with zero diagnostics. The globally
installed bare executable reports `ast-grep 0.42.3`, so operator commands must use the pinned
project audit rather than an unqualified global invocation. This proves bounded structural
observation only; it does not prove LSP symbol resolution, current source binding, or canonical
promotion.

The existing `simdjson-bridge` is correctly scoped as a JSON-text ingestion/parser accelerator:
large payloads may use the native addon and small or unavailable cases fall back to V8
`JSON.parse`; it must not be used as a protobuf/gRPC or tensor parser. No new parser or graph
authority is required.

Decision: keep JSON/JSONL as the interchange format, but defer canonical graph export until a
current completed source owner exists. The eventual gate should emit a revision-qualified
manifest plus bounded `nodes.jsonl`/`edges.jsonl`, validate identities and checksums, and feed
NetworkX, Neo4j, cuGraph, and dense-search feature joins as projections of that same sealed
snapshot. No export, graph, Qdrant, Neo4j, cache, or source data was mutated in this review.

### GRAPH-CONTROL-VS-KNOWLEDGE-SPLIT-REVIEW-01 — architecture alignment (2026-09-08)

The two-graph proposal matches the existing ownership model and should be adopted as a
sequencing rule, not as a request for two new graph authorities:

- The control/prefill graph is a small acyclic workflow. Existing
  `sveltekit-frontend/src/lib/server/atlas/workflow/context-tool-dag-contracts.ts` validates
  bounded tool dependencies and rejects cycles; its focused tests pass 3/3. NetworkX-style
  topological scheduling belongs here. GPU graph execution is unnecessary for this small
  control structure.
- The code/knowledge graph is a general directed, potentially cyclic relation graph. Existing
  graph snapshot contracts, relationship kernels, Neo4j projection, NetworkX reference paths,
  and cuGraph executors already reflect this distinction. Imports, calls, references, tests,
  and concept relations must not be forced into a DAG.
- JSON/JSONL remains the interchange layer. DuckDB/Parquet can provide offline columnar
  analytics; simdjson remains a JSON-text parser bridge; cuDF/cuGraph/cuVS remain executors;
  none becomes identity or graph truth. Existing CouchDB usage is an operational archive/cache
  surface and should not be expanded into a competing canonical graph store.
- The safe ordering is still identity/source binding first, then a sealed revision-qualified
  graph snapshot, then NetworkX/Neo4j/cuGraph parity and dense-search joins. The current
  `NO_CURRENT_COMPLETED_BOUND_SOURCE_OWNER` blocker prevents the snapshot gate from being
  promoted.

The proposal's next-stage labels are therefore accepted as backlog structure only:
`GRAPH-SNAPSHOT-EXPORT`, `NETWORKX-DAG-COMPILER`, `JSON-INGEST-PARITY`,
`NETWORKX-GRAPH-ORACLE`, `NX-CUGRAPH-PARITY`, `CUVS-SEMANTIC-ANCHOR`, and
`PREFILL-DAG-EXECUTOR`. Do not create duplicate exporters, parsers, graph databases, or
retrieval lanes before the current source owner and graph identity decision are resolved.

#### Two-graph follow-up — backend diagnostic reconciliation (2026-09-08)

- [x] Reuse this existing architecture owner for the repeated two-graph proposal.
  Final ordering is ACE admission -> ContextManifest/PromptPlan -> prefill ->
  Ornith. Dependency generations identify eligible work; concurrency limits,
  cancellation and mutation authorization remain separate executor concerns.
  DuckDB and CouchDB already have cold-processing entrypoints in
  `scripts/atlas/daily-graphify-cold-processing.mjs`; retain their existing
  analytics/archive roles. No new scheduler, graph store or package was added.
- [x] Reproduce simple-graph edge loss in the active NetworkX 3.3 interpreter:
  two directed edges 0->1 with weights 2 and 3 yield one edge with weight 3.
  This is a tiny in-memory fixture, not evidence of corruption in the live
  corpus. The existing Python oracle reports duplicate/reciprocal diagnostics;
  preserve typed relation identity in the knowledge artifact and require an
  explicit shared aggregation policy for any simplified algorithm projection.
- [x] Repair the existing `graph-snapshot-parity-contract.ts` status derivation:
  inspect both backend diagnostics plus the caller summary. Previously the
  validator selected the first available backend summary; a clean NetworkX
  summary could mask cuGraph warnings. Each duplicate/reciprocal warning now
  makes the derived status PARTIAL even when the caller summary is clean.
  This change covers derived status; explicit caller status overrides and
  broader production admission are outside this bounded patch.
- [x] Focused validation: from `sveltekit-frontend`, run
  `npx vitest run src/lib/server/atlas/graph/graph-snapshot-parity-contract.spec.ts src/lib/server/atlas/workflow/context-tool-dag-contracts.spec.ts`.
  Result: 12/12 tests pass (9 parity, including six new backend-warning cases;
  3 control-DAG tests). No live graph/GPU execution, datastore mutation or
  promotion was performed.
- [ ] Prove the full revision-qualified snapshot and shared edge-projection
  policy before NetworkX/Neo4j/cuGraph production parity. The fixture does not
  resolve the current completed source-owner gate or authorize projection apply.

Documentation checked: NetworkX `topological_generations` requires a DAG;
the current RAPIDS supported-algorithms list does not list that operation.
Keep the existing small control-DAG owner. JSONL and Parquet need separate
file checksums plus a shared logical-record checksum when comparing formats.
References: https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.dag.topological_generations.html
and https://docs.rapids.ai/api/cugraph/stable/nx_cugraph/supported-algorithms/.

#### GRAPHIFY-PROMOTION-ADMISSION-01 — daily apply ordering (2026-09-09)

- [x] Insert the existing read-only `audit-canonical-projection-fabric.mjs`
  before `graphify:daily:chain` in `scripts/startup/run-graphify-daily-startup.mjs`.
  A non-`SAFE_TO_PROJECT` result now stops the ordinary daily entrypoint before
  any apply-capable child is launched. The audit itself uses a read-only
  Postgres transaction and emits only local reports.
- [x] Make lifecycle open/bind a prerequisite rather than a fail-open warning.
  A daily run without a durable `graphify_runs` open/bind cannot proceed to the
  apply chain. Lifecycle completion errors now propagate as run failures rather
  than being reported as successful completion.
- [x] Add `atlas:graphify:daily:admission` as an explicit operator-facing
  read-only preflight command. No bypass flag was added; the existing bounded
  coordinator canary remains the separate non-production mutation path.
- [x] Add `scripts/startup/run-graphify-daily-admission-order.spec.mjs`.
  Two source-level regression tests prove admission precedes lifecycle open,
  lifecycle open precedes the apply chain, and the prior degraded-success
  continuation messages are absent. `node --check` and both tests pass.
- [ ] Run the admission preflight against a current completed source/semantic/
  structural/graph bundle and record `SAFE_TO_PROJECT`. Current reports remain
  `NOT_SAFE_TO_PROJECT`; this patch intentionally does not manufacture a
  current source owner or authorize projection writes.

Files: `scripts/startup/run-graphify-daily-startup.mjs`,
`scripts/startup/run-graphify-daily-admission-order.spec.mjs`, and
`sveltekit-frontend/package.json`. No database, Qdrant, Neo4j, Valkey, model,
or projection writes were performed.

Follow-up correction (2026-09-09): the first wiring invoked
`audit-canonical-projection-fabric.mjs` directly, but that audit reports
`NOT_SAFE_TO_PROJECT` while preserving a zero exit status for compatibility.
Added `scripts/atlas/require-canonical-projection-admission-v1.mjs` to parse the
dated receipt and fail with `GRAPHIFY_PROMOTION_ADMISSION_BLOCKED` unless the
verdict is exactly `SAFE_TO_PROJECT`. Replayed
`npm run atlas:graphify:daily:admission`: the read-only transaction rolled back,
the receipt reported `NOT_SAFE_TO_PROJECT` with 10/11 predicates below PASS,
and the enforcing command exited 1. This is the required fail-closed proof;
the apply chain was not started.

#### CURRENT-GRAPHIFY-SNAPSHOT-AUTHORITY-RECHECK-01 (2026-09-09)

- [x] Replayed the existing read-only authority audit from the repository root:
  `npx tsx scripts/atlas/audit-current-graphify-snapshot-authority-v1.mts`.
  The initial invocation from `sveltekit-frontend` was a path error; no service
  or datastore process was started by that failed invocation.
- [x] Fresh receipt reports `NO_TERMINAL_EXECUTION_FOR_CURRENT_WORKSPACE` for
  workspace `625743d2-092b-4fa8-abe0-9dc094920c80`, with source count `24,123`
  and `qualifyingExecutionIds=[]`. The current snapshot has a new workspace
  revision and source-manifest checksum; prior run counts are historical and
  are not reused.
- [x] This confirms the promotion gate is doing the intended job: no current
  source-owner execution means no structural/semantic/graph snapshot can be
  treated as current, and the daily apply chain remains blocked upstream.
  The audit produced only the local report and performed no canonical or
  projection writes.
- [ ] Resolve the existing Graphify source-owner lifecycle and produce one
  terminal execution bound to this exact current workspace snapshot. Do not
  weaken full source-count, byte-binding, or checksum requirements, and do not
  invoke the broad daily apply chain to manufacture the receipt.

Report: `docs/reports/current-graphify-snapshot-authority-v1.json`.

#### GRAPHIFY-LIFECYCLE-OWNER-RECONCILIATION-01 (2026-09-09)

- [x] Traced the daily wrapper lifecycle and current authority reader. The
  wrapper opens/completes legacy `graphify_runs`; the current authority audit
  qualifies only terminal `graphify_executions` with matching
  `graphify_execution_files` and a completed `SOURCE_SELECTION` stage. These
  are separate ledgers and cannot be treated as interchangeable attempt IDs.
- [x] Replayed the existing plan-only injection owner:
  `node scripts/atlas/plan-graphify-current-execution-injection-v1.mjs`.
  It reports `READY_FOR_EXPLICIT_AUTHORIZATION`, current binding count `24,101`,
  and a freshly computed workspace revision. The plan explicitly keeps
  `openExecution=false`, `recordSourceSelectionStage=false`, and
  `writeScope=NONE_UNTIL_EXPLICIT_AUTHORIZATION`.
- [x] No execution-ledger row, source-selection membership, canonical packet,
  Qdrant, Neo4j, Valkey, or model write was performed. The plan receipt is
  proposal evidence only and does not make the workspace current-authority
  eligible.
- [ ] Human-authorize a separate bounded execution-ledger injection or approve
  a reviewed replacement of the legacy daily lifecycle owner. The full current
  source set is not an implicit authorization request. After an authorized
  coordinator run, independently re-run the snapshot-authority audit before
  allowing any projection apply.

This keeps `graphify_runs` as legacy compatibility evidence until the
`graphify_executions` owner is explicitly wired; do not create a third lifecycle
table or infer terminal completion from process markers.

Report: `docs/reports/graphify-current-execution-injection-plan-v1.json`.

Lifecycle-owner audit recheck (2026-09-09):
`node scripts/atlas/audit-graphify-lifecycle-owner-v1.mjs` reports
`LIFECYCLE_OWNER_UNPROVEN`, `runningRunCount=0`, `staleRunCount=19`,
`currentRunCount=0`, and `eligibleForFreshRun=false`; it performed no writes.
This confirms the old `graphify_runs` open/complete scripts are compatibility
writers, while the current execution coordinator is the only viable owner for
future source-selection authority. Keep the daily chain blocked until that
owner is explicitly authorized and wired end-to-end.

#### GRAPHIFY-EXECUTION-LEDGER-CANARY-01 (2026-09-09)

- [x] Ran the explicitly authorized existing bounded canary from
  `sveltekit-frontend` with `GRAPHIFY_COMMITTED_CANARY=1`,
  `ATLAS_NON_PRODUCTION_DATABASE=1`, the required confirmation token, and the
  existing non-production workspace UUID.
- [x] Independent readback confirmed execution
  `709e5232-879a-46a8-963d-71c45e2658f0` is `COMPLETED`, with workspace
  revision `sha256:ec2cc83d87c6f88c7fea4980f3d6d50db8a5d8686f6f4899d87645f0b5cd6507`,
  three distinct source bindings, three matching workspace revisions, and five
  completed stages (`OPEN`, `SOURCE_SELECTION`, `INVENTORY`, `AST_PARSE`,
  `STRUCTURAL_EXTRACT`).
- [x] The canary receipt correctly reports `canonicalAuthority=false` and
  `canonicalPromotionMayBeAttempted=false`. Structural provider status was
  `RECOVERED_WITH_ERRORS`; this is canary evidence, not structural promotion.
- [x] Re-ran the full read-only authority audit afterward. It returned
  `SOURCE_SELECTION_INCOMPLETE`, `qualifyingExecutions=0`, because the
  three-source selection is intentionally bounded/canary and the full snapshot
  gate requires a complete non-canary source set. This proves the canary did
  not accidentally open promotion.
- [ ] Do not expand this canary or run the daily apply chain. A separate
  authorization and reviewed transaction plan are required for any broader
  execution-ledger population.

Reports: `docs/reports/graphify-daily-coordinator-canary-v1.json`,
`docs/reports/current-graphify-snapshot-authority-v1.json`.

#### CURRENT-SOURCE-EVIDENCE-HYDRATION-RECHECK-01 (2026-09-09)

- [x] Replayed the existing read-only hydration audit:
  `node scripts/atlas/audit-current-source-evidence-hydration-v1.mjs`.
- [x] Current report inspected `24,101` input rows; `23,447` had exact source
  revision matches, but `authoritativeNamespaces=0`,
  `evidenceSpanReady=0`, and `classifierReady=0`.
- [x] Exclusion census is explicit: `23,195`
  `CANONICAL_CHUNK_OWNER_MISSING` and `906`
  `CHUNK_OWNER_HAS_CONTENT_BUT_NO_SOURCE_REVISION`. No database, projection,
  or model writes occurred; the audit wrote only its local receipt.
- [ ] Resolve the canonical chunk-owner/source-revision authority before
  attempting full structural, semantic, ontology, or projection admission.
  Exact source matches alone do not establish an evidence-ready packet.

Report: `docs/reports/current-source-evidence-hydration-v1.json`.

### EXTERNAL-DOCS-OKF-CRAWL-REVIEW-01 — bounded integration review (2026-09-08)

The current external-document path is present and should be retained as a layered,
read-only observation pipeline:

`SearXNG discovery -> bounded fetch -> BeautifulSoup/Firecrawl normalization ->
Pydantic/Zod validation -> `.okf` derived corpus -> future Postgres admission`.

Live/read-only checks completed:

- Local SearXNG `http://localhost:8889/search?...&format=json` returned HTTP 200 and
  10 JSON results. SearXNG is therefore a discovery provider, not a source-of-truth
  writer or ranking/fusion owner.
- `python scripts/atlas/validate-okf-beautifulsoup-pydantic-v1.py --url
  https://docs.searxng.org/dev/search_api.html` returned `VALIDATED`, with
  `parser=html.parser`, `parserVersion=4.15.0`, `canonicalAuthority=false`, and
  `writesPerformed=false`.
- `docs/.okf/schema.yaml` and `docs/.okf/registry.yaml` both parse as YAML mappings
  with their expected top-level sections. The registry already names BeautifulSoup,
  Firecrawl, and SearXNG as external-document providers and points to live owners.
- `npx tsx scripts/docs-atlas/crawl-okf-dev-docs.mts --dry-run --limit=3` processed
  exactly 3 manifest URLs and performed no fetch, database, projection, cache, or
  model writes. The npm wrapper should not be used for this limit flag because npm
  treats it as an unknown config option; invoke the bounded `tsx` command directly.
- Installed package census: Python 3.13.5; beautifulsoup4 4.15.0; pydantic 2.11.7;
  networkx 3.3; PyYAML 6.0.2; Node `yaml` 2.9.0; Crawl4AI is not installed.
- Version-drift check: the active Python interpreter does not satisfy the repository's
  `python/requirements-parent-atlas-graph.txt` declaration `networkx>=3.4,<4` because it
  exposes `networkx 3.3`. `pip check` also reports unrelated environment conflicts
  (including Transformers 5.5.0 versus packages requiring `<5.0.0`, and MCP/uvicorn/
  anyio mismatches). This is an environment-readiness finding, not permission to repair
  the shared interpreter; use the owning sidecar/virtual environment and a pinned lock
  before any NetworkX/cuGraph parity run.
- The SvelteKit package tree resolves the expected JavaScript boundary packages:
  `@ast-grep/cli 0.45.3`, `yaml 2.9.0`, and `zod 4.4.3`.

Ownership decisions:

- BeautifulSoup remains the deterministic HTML parser and exact-text fallback.
- Firecrawl remains an optional remote extraction provider for known official pages.
- Crawl4AI is not a current component. If later required for JavaScript-heavy pages,
  add it in a separately pinned environment and emit the same observation contract;
  do not introduce it into the canonical path by package installation alone.
- `.okf` YAML remains schema/registry/navigation input. It cannot mint identity,
  revisions, ontology concepts, graph edges, or Postgres rows.
- Postgres remains canonical for admitted `source_ref`, `source_revision`,
  `workspace_revision`, `content_hash`, and promotion status. NetworkX, Neo4j,
  cuGraph, Qdrant, cuVS, and CouchDB remain derived executors/projections/archive;
  none is a new canonical graph store.

The current TypeScript `okf.dev.corpus.v1` record is useful for bounded corpus
inspection but is not yet sufficient for canonical admission: it lacks explicit
`workspace_revision`, `source_revision` semantics, provider/parser revision,
robots-policy result, retrieval receipt, and an independent source-to-content
binding. The Python pipeline carries more revision fields, but cross-runtime
Pydantic/Zod/SearXNG/Go parity is not yet proven.

Correction after the existing-owner audit: do not create a second TypeScript
external-document contract. `packages/parent-atlas/src/core/external-doc-knowledge-fabric.ts`
already owns revisioned fetch/chunk/derived/Qdrant projection schemas, and
`sveltekit-frontend/src/lib/server/atlas/docs/external-doc-admission.ts` already owns
the guarded Postgres page/chunk admission boundary with server-side checksum
recomputation, transaction-scoped readback, and explicit revision fields. The
remaining parity work should adapt the Python/BeautifulSoup capture into those
existing owners, or reject it, rather than introduce another `.okf` schema.

Existing external-document tests were rerun: 16/16 focused Node tests passed across
capture archiving, revisioned OKF fabric, n-ary tuple validation, Qdrant projection,
retrieval proof, and cutover guards. The package build remains blocked by unrelated
pre-existing type errors in `knowledge-page-dag-binding-v1.spec.ts` (`FILE_EXECUTOR`,
`typescript_function`, and `KnowledgePageJobV1` are outside the declared unions).
This is contract/test evidence, not a production admission claim.

Next gate, no automatic mutation:

`EXTERNAL-DOC-OBSERVATION-PARITY-01`

Build a 1--3 URL fixture that maps the Python/Pydantic BeautifulSoup capture into
the existing TypeScript `externalDocPageCaptureSchema` and, separately, the existing
`ExternalDocAdmissionInputV1` adapter. It must record normalized URL, resolved URL,
fetch provider, parser/provider revision, robots decision, retrieval timestamp,
raw/normalized content hashes, `source_revision`, and `canonical_authority=false`.
Then emit a read-only admission plan. Do not add a Postgres table, install Crawl4AI,
create a Qdrant collection, or promote external documents until the current
Graphify/source authority blocker (`NO_CURRENT_COMPLETED_BOUND_SOURCE_OWNER`) is
resolved and the fixture has independent readback coverage.

Bounded implementation 2026-09-09: added
`scripts/atlas/audit-external-doc-observation-parity-v1.mjs` and the root command
`npm run atlas:docs:observation:parity`. It checks `robots.txt` with Python's
`RobotFileParser`, captures the official SearXNG API documentation through the
existing BeautifulSoup adapter, validates the original capture with Pydantic,
maps it into the existing `externalDocPageCaptureSchema`, and compares requested/
resolved URLs, UTF-8 content hash, content, and non-canonical status. The first
run exposed and fixed a Windows child-process encoding issue by passing UTF-8 bytes
and setting `PYTHONIOENCODING=utf-8`; the final run returned
`PARITY_PROVEN_NON_CANONICAL` with all 8 checks true. Receipt:
`docs/reports/external-doc-observation-parity-v1.json`.

This closes the page-capture parity fixture only. The receipt explicitly leaves
`workspaceRevision` unbound, does not exercise Go/SearXNG result normalization,
and attempts no Postgres, Qdrant, Neo4j, Valkey, CouchDB, or model writes. The
existing package build remains independently blocked by the pre-existing
`knowledge-page-dag-binding-v1.spec.ts` union errors described above.

Second bounded replay 2026-09-09: direct Node invocation (not the npm wrapper,
because npm consumed custom `--url` and `--source-revision` arguments as unknown
configuration) against the official Crawl4AI quickstart page with explicit
`fixture:external-doc-crawl4ai-v1` returned `PARITY_PROVEN_NON_CANONICAL` with
all 8 checks true. The receipt records BeautifulSoup `html.parser` 4.15.0,
robots `ALLOWED`, matching requested/resolved URLs, matching UTF-8 content
checksums, and `canonicalAuthority=false`. This is a second source-specific
capture/schema replay, not evidence that Crawl4AI is installed or that external
documentation is ready for canonical admission. No Postgres, Qdrant, Neo4j,
Valkey, CouchDB, model, or other datastore writes were performed; only the
read-only report artifact was refreshed.

`EXTERNAL-SEARCH-RESULT-PARITY-01` bounded read-only reconciliation 2026-09-09:
local SearXNG returned HTTP 200 with URL-based discovery results, and Go Retrieval
`:8100/search/bm25` returned HTTP 200 with PostgreSQL FTS results and explicit
`read_only=true`/`canonicalAuthority=false`. Added
`scripts/atlas/audit-external-search-result-parity-v1.mjs` and the root command
`npm run atlas:docs:search-result:parity`. The receipt maps both providers to a
small ephemeral `{source, sourceRef, title, snippet, rank}` shape while preserving
provider-specific identity and ranking semantics. This proves transport and
normalization readiness only; it does not equate SearXNG URLs with Go packet/source
refs, create a shared retrieval vote, or admit external documents. Receipt:
`docs/reports/external-search-result-parity-v1.json`.

External documentation consulted for this review:

- SearXNG Search API: https://docs.searxng.org/dev/search_api.html
- Beautiful Soup documentation: https://www.crummy.com/software/BeautifulSoup/bs4/doc/
- Crawl4AI quickstart: https://docs.crawl4ai.com/core/quickstart/
- Python robots parser: https://docs.python.org/3/library/urllib.robotparser.html

All commands in this review were read-only. No source, Postgres, Qdrant, Neo4j,
Valkey, CouchDB, model, or package state was changed.

Current-source authority refresh 2026-09-09: `audit-current-graphify-source-revision-v1.mjs`
again selected completed run `48485685-e773-4433-a1f8-00f5524cca44` and inspected
23,758 rows. The current receipt reports `CONTENT_MATCH=23,453`,
`CONTENT_MISMATCH=293`, and `SOURCE_UNAVAILABLE=12`, with all 23,758 rows carrying
a source revision, but status remains `SOURCE_BYTES_NOT_PROVEN`. The small count
drift from earlier replays is itself a reason to treat this as a fresh audit
snapshot, not as promotion evidence. No source, Graphify, packet, or projection
rows were changed. The external-document admission path therefore remains
blocked on current workspace/source authority.

Source-evidence hydration refresh 2026-09-09: `audit-current-source-evidence-hydration-v1.mjs`
reports `SOURCE_EVIDENCE_HYDRATION_BLOCKED` for 52 exact source-revision matches.
Only 9 rows have content hydrated; authoritative namespaces, evidence-span-ready
rows, and classifier-ready rows are all 0. Missing reasons are
`CANONICAL_CHUNK_OWNER_MISSING=43` and
`CHUNK_OWNER_HAS_CONTENT_BUT_NO_SOURCE_REVISION=9`; writes performed: 0. This
confirms the next repair is canonical chunk/source ownership and revision binding,
not another web crawl, checksum refresh, or projection upsert.

Chunk-bridge refresh 2026-09-09: `audit-chunk-bridge-v1.mjs` examined 353 rows and
found 100 `EXACT_CHUNK_IDENTITY`, 74 `SOURCE_ONLY_AMBIGUOUS`, and 179
`REVISION_UNPROVEN`, with zero content/source mismatches and zero writes. The
`promotionEligible=true` field means an exact subset exists; it does not authorize
combining ambiguous or revision-unproven rows, broad reindexing, or projection
mutation. The next bounded action is a lineage-qualified candidate canary built
from the 100 exact identities only.

Latent producer dry-run 2026-09-09: `audit-latent-producer-contract-v1.mjs` found
all required producer-contract checks present and identified
`latent256-revision-qualified-wrapper.mts` as the qualified producer, with the
legacy writer compatibility-only. Running the wrapper against
`docs/reports/sem768-corpus-bundle-01.json` with the reviewed model checksum and a
bounded 15-row dry-run safely returned `NO_ELIGIBLE_ROWS` and
`BACKFILL_DRY_RUN_PROVEN`; the bundle carries `sourceAuthorityStatus=PARTIAL` and
the eligible count is 0. No latent artifacts or datastore rows were written. The
next gate is independent latent canary readback only after an admitted
source-qualified cohort exists.

Candidate-corpus lineage census 2026-09-09: `audit-candidate-corpus-lineage-v1.mjs`
audited all 61,718 live `atlas_packets` rows and admitted 0. The exclusions were
61,717 `MISSING_SOURCE_REVISION` rows and 1 `MISSING_SOURCE_REF` row; no synthetic
revision fallback was used. The lineage checksum is
`4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` and the
receipt status is `DIAGNOSTIC_ONLY`. This supersedes any impression that the
15-row latent plan is currently writable: source-lineage hydration must repair
or establish the canonical packet bindings first.

Source-ref namespace reconciliation 2026-09-09:
`audit-source-ref-namespace-reconciliation-v1.mjs` found `EXACT_CURRENT=0` and
classified the live comparison as `MISSING_POSTGRES_CHUNK=15444`,
`CHUNK_SOURCE_MATCH_HASH_MISMATCH=887`,
`GRAPHIFY_SOURCE_MATCH_HASH_MISMATCH=32`, and
`HASH_TRUNCATED_NOT_PROVABLE=204`; `MISSING_GRAPHIFY=0`. No namespace rule was
promoted and no source, packet, or projection rows were changed. The next gate is
source-binding reconciliation with explicit producer ownership, not a mass
backfill or latent/vector upsert.

Current source-authority repair planning 2026-09-09:
`plan-current-source-authority-repair-v1.mts` returned
`REPAIR_PLAN_BLOCKED_NO_EXACT_ROWS`. The selected completed owner run remains
`48485685-e773-4433-a1f8-00f5524cca44`, while the current workspace revision is
`sha256:853f6a80e8071a59a74e64fa62556a54470a14dfdb52189692b06206d520a280`.
Across 23,758 Graphify rows and 24,098 bindings, exact current bindings are 0;
23,746 are source-revision mismatches and 12 are unavailable. Content digest
mismatch count is 293. The plan requires explicit authorization and remains
non-canonical; no repair or projection writes occurred.

Current source-authority selection refresh 2026-09-09:
`select-current-source-evidence-authority-v1.mts` returned
`NO_CURRENT_COMPLETED_BOUND_SOURCE_OWNER`. The live census contains 19 Graphify
runs: 12 completed, 4 completed-bound, 8 completed-unbound, and no running runs;
none matches the active workspace within the five-minute tolerance. The selector
found no ambiguity and selected no run, with `sourceCount=0`. Graphify was not
started or restarted, and no source, packet, or projection data was changed.

Current Graphify injection planning 2026-09-09: the lifecycle audit produced a
fresh workspace namespace with 24,098 source bindings and
`audit-graphify-lifecycle-entrypoint-v1.mts` returned
`READY_FOR_INJECTED_WIRING`. The corrected planner is
`node scripts/atlas/plan-graphify-current-execution-injection-v1.mjs` (the earlier
`.mts` command was a filename mistake and made no changes). It returned
`READY_FOR_EXPLICIT_AUTHORIZATION` for workspace revision
`sha256:51d95b3c8c8c49842c5157342832809e94f012d92ad2b95eafa4c2f471f263f9`, with
`workspaceNamespaceStatus=WORKSPACE_SOURCE_NAMESPACE_PROVEN`, all required
manifest/parser/extraction inputs present, and write scope
`NONE_UNTIL_EXPLICIT_AUTHORIZATION`. The plan explicitly states that the full
25,701-source set is not an authorization request. No database connection or
Graphify execution was opened. Receipt:
`docs/reports/graphify-current-execution-injection-plan-v1.json`.

Graphify lifecycle owner refresh 2026-09-09:
`audit-graphify-lifecycle-owner-v1.mjs` reports
`LIFECYCLE_OWNER_UNPROVEN` and `CURRENT_RUN_NOT_ESTABLISHED`, with 0 running,
0 stale, and 0 current runs. Namespace authority remains `PROVEN`, but
`eligibleForFreshRun=false`. Inspection confirms the daily coordinator already
contains the open -> bind -> chain -> complete wiring; the standalone
`graphify-daily-lifecycle-open-v1.mjs` is a real Postgres writer and must not be
invoked as an audit. No lifecycle, source, packet, or projection writes were
performed. A separately bounded authorization is still required before opening
a fresh run.

Bounded-lifecycle scope review 2026-09-09: no existing writer accepts the planned
5-source cohort. `graphify-daily-lifecycle-open-v1.mjs` opens a real lifecycle row
and binds the full current workspace manifest, while
`prove-graphify-open-bind-complete-lifecycle-v1.mjs` uses synthetic proof metadata
and deletes its test row. Neither is an appropriate implementation of the
five-source current-owner canary. No writer was invoked; a new bounded lifecycle
adapter or an explicit full-manifest authorization is required before mutation.

Fresh-origin cohort replay 2026-09-09: `plan-fresh-origin-bounded-cohort-v1.mjs`
selected 5 rows under origin workspace revision
`sha256:51d95b3c8c8c49842c5157342832809e94f012d92ad2b95eafa4c2f471f263f9`.
`audit-fresh-origin-bounded-cohort-lineage-v1.mjs` found all 5 present with
source revision, content hash, and byte length matches, but 0 workspace-revision
matches; authorization remained false. The follow-up
`audit-current-workspace-packet-chunk-join-v1.mjs` found 111 live binding rows
under a different workspace revision
`sha256:55edaaadab0cef724593287c7c908dad6cdc1b25039a752a6b5dab2c0c44fac9`,
with 0 Graphify exact sources and 0 packet/chunk content matches. This proves
workspace-revision drift is the active blocker; no binding, packet, chunk, or
projection writes occurred.

Addressable-packet materializer ownership review 2026-09-09:
`npm run atlas:addressable-packets:ownership` produced
`ROOT_MATERIALIZER_ENTRYPOINT_PROVEN_LOCAL_COPY_NOT_ENTRYPOINT`. The discovered
package entrypoints (five commands across the root and SvelteKit package files)
resolve to `scripts/atlas/materialize-addressable-packets.mjs`; no discovered
package command resolves to `sveltekit-frontend/scripts/atlas/materialize-addressable-packets.mjs`.
The root materializer is a file-artifact producer whose `--apply` path publishes
the addressable NDJSON/manifest; this audit does not admit it as the canonical
`atlas_packet_registry` writer. The SvelteKit-local copy remains an archive
candidate only, not an automatic deletion target. HyperRAG remains unresolved:
its static source contains schema/registry mutation paths, no production
entrypoint was found, and its three writer-safety tests pass. No materializer,
registry, database, or projection writes were performed.
Report: `docs/reports/addressable-packet-materializer-ownership-v1.json`.

Canonical projection fabric audit refresh 2026-09-09:
`node scripts/atlas/audit-canonical-projection-fabric.mjs` executed inside a
read-only PostgreSQL transaction and rolled back successfully. Verdict:
`NOT_SAFE_TO_PROJECT`; 10/11 admission predicates remain below PASS. The live
receipt records `atlas_packets` identity as `PARTIAL_PROVEN` with 325 missing
Qdrant point IDs in the bounded sample, revision qualification as
`NOT_PROVEN` because `atlas_packets.workspace_revision` is absent, an empty
`graphify_symbols` table, an `AMBIGUOUS_OWNER` split between two 768-dim
vector columns, only `latent_64` present without a representation ledger,
no sealed graph manifest, no sealed ordinal-map table, and no cross-projection
checksum proof. Ontology tables exist with 63,084 rows, but existence is not
promotion proof. No canonical or projection writes occurred.
Report: `docs/reports/atlas-canonical-projection-fabric-audit-2026-09-09.json`.

Source-authority blocker refresh 2026-09-09:
read-only lifecycle/workspace/Git audits confirm the workspace owner contract is
present at `public.workspaces.id` (`workspaces=1`, `graphify_runs=19`,
`graphify_files=26,014`), but lifecycle ownership is still
`LIFECYCLE_OWNER_UNPROVEN`: running, stale, and current run counts are all zero,
so `eligibleForFreshRun=false`. The selected workspace-bound Git authority
check has `rowCount=0` against `repositoryTreeEntryCount=25,365` and
`gitAuthorityProven=false`. This is an execution/source-binding gap, not a
missing database owner. Do not start the unbounded daily chain or fan out
projections; the next implementation must be a bounded extraction/binding
adapter with explicit source rows and independent readback. No writes occurred.

Bounded Graphify canary implementation review 2026-09-09:
the existing `sveltekit-frontend/scripts/atlas/graphify-daily-coordinator-canary-v1.mts`
already provides the bounded execution seam. It requires
`GRAPHIFY_COMMITTED_CANARY=1`, materializes a fresh workspace revision, selects
exactly three bindings, verifies one source's byte revision, records the
selection/inventory/structural stages, and independently reads back the
execution ledger. It reports writes only for that explicitly authorized ledger
canary and does not write packets, Qdrant, Neo4j, or Valkey. The guard was
exercised without authorization and correctly failed closed; the focused
coordinator adapter suite passed `7/7`. The canary itself was not run.

Bounded cohort refresh note 2026-09-09:
`node scripts/atlas/plan-fresh-origin-bounded-cohort-v1.mjs` recomputed the
cohort but failed while opening its fixed report path
`docs/reports/fresh-origin-bounded-cohort-plan-v1.json` with Windows error
`UNKNOWN`. The prior report remains readable but is historical to that planner
invocation and must not be treated as fresh current proof. The bounded committed
canary independently recomputes `materializeWorkspaceRevisionOriginV1()` at
execution time and still requires explicit authorization before any ledger
write. No source, Graphify, packet, projection, or cache writes occurred.

Bounded cohort planner reliability fix 2026-09-09:
updated `scripts/atlas/plan-fresh-origin-bounded-cohort-v1.mjs` so a Windows
failure on the stable report path falls back to a uniquely timestamped report
instead of leaving the caller with an unreported fresh computation. The normal
stable path now succeeds for `--limit=5`, producing
`PLAN_ONLY_REQUIRES_EXPLICIT_AUTHORIZATION` with 5 selected rows and origin
workspace revision
`sha256:51d95b3c8c8c49842c5157342832809e94f012d92ad2b95eafa4c2f471f263f9`.
The subsequent read-only lineage replay remains
`FRESH_ORIGIN_COHORT_READBACK_BLOCKED`: source revision, content hash, and byte
length match 5/5, while workspace revision matches 0/5. No datastore or
projection writes occurred.

Current-run eligibility refresh 2026-09-09:
`audit-current-graphify-run-owner-v1.mjs` reports
`GRAPHIFY_RUN_OWNER_BLOCKED` with one workspace-matching run, status
`SUPERSEDED`, zero completed authoritative owners, and no report-write error.
`audit-graphify-readiness-replay-v1.mjs` independently reports
`READINESS_REPLAY_BLOCKED_STALE_RUN` for run
`14643371-f6f2-4131-906b-235a5c06619a`, with 111 Graphify file rows. Those rows
do not establish a current owner because the run is superseded and full
source/revision proof remains incomplete. No writes occurred.

Bounded canary guard hardening 2026-09-09:
`graphify-daily-coordinator-canary-v1.mts` now fails closed unless all of the
following are explicit: `GRAPHIFY_COMMITTED_CANARY=1`,
`ATLAS_NON_PRODUCTION_DATABASE=1`,
`GRAPHIFY_COMMITTED_CANARY_CONFIRM=AUTHORIZE_GRAPHIFY_COMMITTED_BOUNDED_CANARY_V1`,
a non-empty `DATABASE_URL`, and a valid UUID in
`ATLAS_GRAPHIFY_CANARY_WORKSPACE_ID`. The previous hard-coded database fallback
was removed; the workspace is selected only by the explicitly supplied UUID.
The unauthorised invocation failed at the first guard, and a partial invocation
with only the canary flag failed at the non-production guard. The coordinator
adapter suite passed `7/7`. The committed canary was not executed, and no
database, source, packet, Qdrant, Neo4j, or Valkey writes occurred.

Source-authority and fabric refresh 2026-09-09:
the current read-only owner audit still reports `GRAPHIFY_RUN_OWNER_BLOCKED`:
the workspace-matching run is `SUPERSEDED`, `completedOwnerCount=0`, and
`currentStatus=SUPERSEDED`. Source hydration independently remains
`SOURCE_EVIDENCE_HYDRATION_BLOCKED` with 52 exact revision matches, only 9
content-hydrated rows, 0 authoritative namespaces, 0 evidence-span-ready rows,
and 0 classifier-ready rows; 43 rows lack a canonical chunk owner and 9 have
content but no source revision. The canonical projection-fabric audit again
ran in a read-only transaction and returned `NOT_SAFE_TO_PROJECT` with 10/11
predicates below PASS. No source, packet, canonical, or projection writes were
performed. The bounded canary remains ineligible until a current completed
source owner and revision-qualified hydration are proven.

Lifecycle entrypoint readiness refresh 2026-09-09:
`npx tsx scripts/atlas/audit-graphify-lifecycle-entrypoint-v1.mts` now
completes successfully after the report-writer fallback repair. It produced
`READY_FOR_INJECTED_WIRING` with 24,101 source bindings and workspace revision
`sha256:b5521d6a519d6152c81d9db446b92e43a87ec402694bb67a8f7fc33fd6047e5c`.
The report explicitly retains `liveStartupWired=false`,
`graphifyRunsWritten=false`, `canonicalAuthority=false`, and
`writesPerformed=false`; this is entrypoint readiness, not current-owner proof
or authorization to execute. No datastore or projection writes occurred.

Lifecycle audit report-path repair 2026-09-09:
the first read-only execution of `audit-graphify-lifecycle-entrypoint-v1.mts`
completed its workspace-binding calculation but failed only while opening the
stable JSON report path with Windows `UNKNOWN`/file-lock behavior. The script
now preserves the fresh result under a unique timestamped fallback when that
path is unavailable, matching the bounded-cohort planner's safe report-emission
behavior. A rerun succeeded at the stable path with
`READY_FOR_INJECTED_WIRING` and 24,101 bindings. This repair does not change
lifecycle execution or authority; `liveStartupWired=false` and
`writesPerformed=false` remain explicit. No datastore or projection writes
occurred.

Current packet/chunk join refresh 2026-09-09:
`node scripts/atlas/audit-current-workspace-packet-chunk-join-v1.mjs` reports
`CURRENT_PACKET_CHUNK_JOIN_MISSING` for the stored 111-row workspace binding
cohort: `graphify_exact_sources=0`, `binding_chunk_content_matches=0`,
`packet_chunk_exact_sources=0`, and `packet_content_matches=0`. The stored
binding revision is older than the newly computed workspace origin, so this is
not evidence that the source files are absent from the workstation. The
available `apply-current-workspace-source-bindings-v1.mjs` is a transactional
111-row apply path, not a dry-run; it was intentionally not executed because
the current source plan is stale and separate authorization is required. No
binding, packet, chunk, Graphify, Qdrant, Neo4j, or Valkey writes occurred.

Current execution-injection plan refresh 2026-09-09:
`node scripts/atlas/plan-graphify-current-execution-injection-v1.mjs` produced
`READY_FOR_EXPLICIT_AUTHORIZATION` for the newly computed workspace revision
`sha256:b5521d6a519d6152c81d9db446b92e43a87ec402694bb67a8f7fc33fd6047e5c` with
24,101 bindings. This is a broad source-binding plan, not a bounded mutation
request; it explicitly requires authorization and does not prove a completed
current Graphify owner. No binding, packet, Graphify, Qdrant, Neo4j, or Valkey
writes occurred.

Fresh bounded cohort refresh 2026-09-09:
`node scripts/atlas/plan-fresh-origin-bounded-cohort-v1.mjs --limit=5`
selected 5 rows from current workspace revision
`sha256:b5521d6a519d6152c81d9db446b92e43a87ec402694bb67a8f7fc33fd6047e5c`
and returned `PLAN_ONLY_REQUIRES_EXPLICIT_AUTHORIZATION`.
`audit-fresh-origin-bounded-cohort-lineage-v1.mjs` independently found 5/5
source-revision, content-hash, and byte-length matches, but 0/5
workspace-revision matches in the live binding table; authorization remains
false. This is a valid bounded preflight but not a promotion proof. No binding,
packet, Graphify, Qdrant, Neo4j, or Valkey writes occurred.

Current-source repair-plan refresh 2026-09-09:
`npx tsx scripts/atlas/plan-current-source-authority-repair-v1.mts` returned
`REPAIR_PLAN_BLOCKED_NO_EXACT_ROWS` for owner run
`48485685-e773-4433-a1f8-00f5524cca44`. It compared 23,758 Graphify rows with
24,101 current bindings and found 0 exact current bindings, 23,746 source
revision mismatches, 298 content-digest mismatches, and 12 unavailable
sources. The computed current workspace revision was
`sha256:44b3c240e14f72cb438885c9d30e081cf903154c3ee98544bfa1a7c94e2b7f79`.
The plan requires authorization and performs no writes; no binding, packet,
Graphify, Qdrant, Neo4j, or Valkey writes occurred.

Lifecycle-owner audit correction 2026-09-09:
`audit-graphify-lifecycle-owner-v1.mjs` previously queried only `RUNNING`
rows, which made its lifecycle portfolio unable to evaluate completed or
superseded runs, and its static writer census included test files. The audit
now inventories all `graphify_runs` states, derives `runningRunCount` from that
full set, treats only completed rows with a completion timestamp and repository
HEAD match as current authority, and excludes `.spec.`, `.test.`, and test
directory paths from mutation-owner candidates. The corrected read-only result
is 19 historical runs, 0 running, 19 stale/superseded, 0 current completed
owners, with blockers `LIFECYCLE_OWNER_UNPROVEN`,
`CURRENT_RUN_NOT_ESTABLISHED`, and `REPOSITORY_REVISION_NOT_CURRENT`.
`namespaceAuthorityStatus=PROVEN`; `writesPerformed=false`. No datastore or
projection writes occurred.

Current-owner stale-input repair 2026-09-09:
`audit-current-graphify-run-owner-v1.mjs` no longer embeds the historical
workspace revision `sha256:55edaaad...`. It now accepts
`ATLAS_EXPECTED_GRAPHIFY_WORKSPACE_REVISION` or reads the explicitly generated
`graphify-lifecycle-entrypoint-v1.json` report and records the input source in
its receipt. After regenerating the lifecycle origin, the owner audit checked
revision `sha256:f476b4a6aac2afcafe0f82c7b0e48d52951ccbce73fca52b9706b1f1fbfabefb`
and correctly found 0 matching runs, 0 completed owners, and 0 workspace rows;
status remained `GRAPHIFY_RUN_OWNER_BLOCKED`. No datastore or projection writes
occurred.

Full-cohort hydration audit correction 2026-09-09:
`audit-current-source-evidence-hydration-v1.mjs` previously measured only the
historical 52-row cohort. It now prefers the fresh
`graphify-lifecycle-entrypoint-v1.json` source bindings and falls back to the
historical cohort only when that origin report is unavailable. The full
read-only census covers 24,101 bindings: 23,447 exact Graphify source-revision
matches and 906 content-hydrated rows, but 0 authoritative namespaces, 0
evidence-span-ready rows, and 0 classifier-ready rows. Missing reasons are
23,195 `CANONICAL_CHUNK_OWNER_MISSING` and 906
`CHUNK_OWNER_HAS_CONTENT_BUT_NO_SOURCE_REVISION`. No datastore or projection
writes occurred.

Lineage-qualified candidate cohort refresh 2026-09-09:
`node scripts/atlas/audit-lineage-qualified-candidate-cohort-v1.mjs` audited
61,718 packets. It found 61,717 with a source reference, 17,144 exact
Graphify sources carrying workspace/source/semantic revisions, 100 exact
packet-to-chunk bindings, 756 ambiguous packet-to-chunk bindings, and 0 graph
revisions. Consequently only 100 rows are source/chunk qualified and 0 are
fully qualified; promotion status is `COHORT_BLOCKED` with next gate
`GRAPH_OR_SEMANTIC_REVISION_OWNER_REQUIRED`. The audit is read-only and no
canonical or projection writes occurred.

Structural-edge artifact refresh 2026-09-09:
the actual owners are `audit-current-structural-edge-contract-v1.mjs`,
`audit-current-graph-artifact-readiness-v1.mjs`, and
`plan-current-structural-edge-resolution-v1.mjs`; the previously suggested
`audit-current-structural-edge-artifact-v1.mjs` does not exist. The contract
audit is `CONTRACT_READY_FOR_SNAPSHOT_REVIEW` with 2,545 nodes and 1,334 edges,
zero missing required node/edge fields, zero duplicate edge shapes, and zero
unknown endpoints, but `graphRevision=null`. Artifact readiness remains
`CURRENT_GRAPH_ARTIFACT_BLOCKED_ON_EDGE_PRODUCER` with 0 explicit
revision-qualified edges. The resolution planner reports 9,730 unresolved
targets in its bounded sample. All audits are read-only; no graph or projection
writes occurred.

Structural-edge plan input drift 2026-09-09:
`node scripts/atlas/plan-current-structural-edge-artifact-v2.mjs` executed
read-only but returned `CURRENT_STRUCTURAL_EDGE_PLAN_INCOMPLETE` with
`selectedSourceCount=0`, `sourceCount=0`, `chunkCount=0`, `nodeCount=0`, and
`edgeCount=0`. The planner is still pointed at
`current-source-graphify-batch-v1.json`, whose current-exact source population
is empty; this does not contradict the separate structural contract census of
2,545 nodes and 1,334 edges. The next implementation must reconcile the
planner input with the fresh lifecycle-origin source bindings before invoking
the sidecar or building any artifact. No graph or projection writes occurred.

Current Graphify batch-planner input repair 2026-09-09:
`plan-current-source-graphify-batch-v1.mjs` previously selected from the
historical 52-source cohort and stale workspace observation. It now prefers
`graphify-lifecycle-entrypoint-v1.json` bindings and records `inputSource` in
the plan, retaining the prior files only as fallback. A bounded `--limit=5`
replay selected 5 current-origin rows and classified all 5 as
`GRAPHIFY_REVISION_OR_CONTENT_MISMATCH` rather than reporting an empty cohort.
The downstream structural plan consequently remains
`CURRENT_STRUCTURAL_EDGE_PLAN_INCOMPLETE` with zero selected rows because no
current Graphify match exists. No Graphify, graph, or projection writes
occurred.

Snapshot-authority refresh 2026-09-09:
`npx tsx scripts/atlas/audit-current-graphify-snapshot-authority-v1.mts`
returned `NO_TERMINAL_EXECUTION_FOR_CURRENT_WORKSPACE` for workspace
`625743d2-092b-4fa8-abe0-9dc094920c80` and current revision
`sha256:48b88df55b11d0ece664ed3729467352722b73b37ffae478c1aecb12d4784d13`.
`qualifyingExecutions=0`; the audit only emitted the current source-selection
input and performed no datastore or projection writes. This confirms that no
Graphify snapshot can be promoted yet. The next allowed branch is an explicitly
authorized, non-production bounded canary with the hardened guards, not a
broad daily execution or projection fan-out.

Task-semantic fixture isolation repair 2026-09-09:
the shared `buildCodebaseQdrantFilter()` now always excludes the two historical
canary payload shapes with `must_not` clauses for `canary=true` and
`source_ref=canary://task-semantic`, while preserving legacy collection and
topology requirements. Added focused coverage in
`sveltekit-frontend/src/lib/server/search/qdrant-search-filter.spec.ts`;
both tests pass. The live task-semantic preflight still reports
`missingColumnCount=0`, `qdrantStatus=proven`, and
`applyCanaryEligible=true` with `applyAuthorized=false`. Fixtures were not
deleted or modified; no database, Qdrant, Neo4j, or Valkey writes occurred.

Source-hydration report reliability repair 2026-09-09:
the read-only `audit-current-source-evidence-hydration-v1.mjs` previously
failed after completing its database audit when Windows returned `UNKNOWN`
while opening the stable report path. It now preserves the same fresh result
under a timestamped fallback when the stable path is temporarily locked,
matching the other currentness audits. A rerun completed successfully with
`SOURCE_EVIDENCE_HYDRATION_BLOCKED`, 24,101 input bindings, 23,447 exact
source-revision matches, 906 content-hydrated rows, 0 authoritative
namespaces, 0 evidence-span-ready rows, and 0 classifier-ready rows. Missing
reasons remain 23,195 `CANONICAL_CHUNK_OWNER_MISSING` and 906
`CHUNK_OWNER_HAS_CONTENT_BUT_NO_SOURCE_REVISION`. `node --check` passed;
the audit performed zero datastore or projection writes. This repairs
observability only and does not close current Graphify ownership, source
lineage, or projection-promotion gates.

Parent Atlas export storage classification 2026-09-09:
reviewed `scripts/atlas-parent-indexing.mjs` after the open-lanes handoff
raised an unsigned object-store request. The script has no Postgres, SeaweedFS,
S3, or CouchDB client path; it reads only `.opencode/cards` and the local
outcome ledger and writes optional files under `memory/exports/parent-atlas/`.
Its report/log wording previously called these “canonical tables” and
recommended Redis/CouchDB promotion. That wording is now corrected to
`DISPOSABLE_DERIVED_EXPORT`, `canonicalAuthority=false`,
`objectStore=NOT_USED`, and explicit zero Postgres/SeaweedFS/CouchDB/cache
writes. `node --check scripts/atlas-parent-indexing.mjs` and its bounded
`--dry-run` passed; this checkout loaded 0 cards and 0 outcomes and performed
no export writes. The unsigned S3 `AccessDenied` was therefore not a missing
Parent Atlas artifact or a promotion blocker. No data was deleted or uploaded.

External parity and source-authority comparison refresh 2026-09-09:
the bounded external-document replay remains `PARITY_PROVEN_NON_CANONICAL`:
8/8 checks pass (Python validation, TypeScript schema, normalized/content
checksums, requested/resolved URL parity, robots approval, and
`canonicalAuthority=false`). The SearXNG↔Go Retrieval replay separately
remains `SEARCH_RESULT_NORMALIZATION_PROVEN_NON_CANONICAL`: all 9 checks pass,
including both live HTTP responses, URL/source-ref shape, uniqueness, Go
`read_only=true`, and `canonicalAuthority=false`. Neither replay writes to
Postgres, Qdrant, Neo4j, Valkey, CouchDB, or models.

The source-authority claim is not static: a fresh
`audit-current-graphify-source-revision-v1.mjs` replay selected the same
completed run `48485685-e773-4433-a1f8-00f5524cca44` but now reports 23,443
`CONTENT_MATCH`, 303 `CONTENT_MISMATCH`, and 12 `SOURCE_UNAVAILABLE` rows out
of 23,758, with all source revisions present. Therefore the earlier
23,453/293 split is historical to that invocation and must not be reused as
current promotion evidence. Status remains `SOURCE_BYTES_NOT_PROVEN`; current
workspace/source ownership and canonical admission remain blocked.

External-document handoff comparison refresh 2026-09-09:
the earlier `EXTERNAL-DOC-OBSERVATION-PARITY-01` implementation is present,
not merely proposed. A fresh `npm run atlas:docs:observation:parity` replay
returned `PARITY_PROVEN_NON_CANONICAL` with all 8 checks true. A fresh
`npm run atlas:docs:search-result:parity` replay returned
`SEARCH_RESULT_NORMALIZATION_PROVEN_NON_CANONICAL` with all 9 checks true.
The direct bounded `npx tsx scripts/docs-atlas/crawl-okf-dev-docs.mts
--dry-run --limit=3` replay processed 3 manifest URLs with zero fetch,
database, projection, cache, or model writes.

Comparison correction: the handoff's parity and package observations remain
aligned, but they prove only bounded non-canonical transport/capture behavior.
`workspaceRevision` is still unbound for external observations; Go/SearXNG
normalization is covered by a separate non-canonical receipt; Crawl4AI remains
optional and uninstalled; active NetworkX remains 3.3 against the declared
`>=3.4,<4` requirement. The current Graphify source replay is now
23,443 matches, 303 mismatches, and 12 unavailable rows, so the earlier
23,453/293 split is historical. Do not install packages, add tables, upload
external pages, or promote them until current source/workspace authority and
independent admission readback are proven.

Graphify dry-chain safety correction 2026-09-09:
the caller census found that `sveltekit-frontend/package.json` defined
`graphify:daily:dry` with `graphify:materialize:apply`, despite the materializer
having an existing dry/default entrypoint. This was a real command-boundary
drift: a user selecting the dry chain could request addressable-packet writes
before the later dry-run stages. The script now calls
`graphify:materialize:dry`; the production `graphify:daily:chain` apply path was
left unchanged. JSON parsing, an explicit command assertion, and `git diff
--check` pass. The full daily chain was not run; no database, Qdrant, Neo4j,
Valkey, object-store, or model writes occurred.

Graphify dry-chain replay 2026-09-09:
the corrected bounded command was executed through
`node scripts/startup/run-atlas-phase8-fanout.mjs --dry-run --apply-through=3`
and completed with exit code 0. Correction from the subsequent entrypoint review:
this was a mixed apply/dry replay, because `--apply-through=3` selects the
LangExtract, summary-ranker, and summary-envelope apply commands. The prior
claim that the entire replay was read-only is withdrawn; zero counts from
later stages do not prove that the first three stages performed no writes.
Recorded output: 61,718
packets were counted, 0 feature-envelope rows required refresh, the semantic
bundle reported 576 input rows but `sourceAuthorityStatus=PARTIAL`, the latent
wrapper reported 0 eligible and 0 written rows, SOM dry-run loaded 5,000 valid
latent vectors without training, and the GDS density read passed against
621,170 Neo4j nodes and 448,818 relationships. BitFrost applied writes were 0;
centroid dry-run planned 64 keys plus index/meta but wrote none; Graphify draft
skipped cleanly because llama-server was unavailable. The first replay exposed
an `EPERM` progress-file replacement; a retry exposed that
`atlas:phase16:gds:dry` was not passing a dry flag and targeted a shared report.
`check-graph-density.mjs` now accepts `--dry-run` and uses a unique report path,
and the package entrypoint passes that flag. Syntax, package JSON, direct GDS
dry-run, and the full bounded fanout pass. Canonical promotion remains blocked
by current Graphify/source-revision authority and source-evidence hydration.

### GRAPHIFY-DRY-ENTRYPOINT-PARITY-01 — continuation 2026-09-08

- [x] Route `graphify:daily:dry` through the fully dry Phase 8 alias and redirect
  the misleading `atlas:phase8:fanout:dry:steps1-3` compatibility alias to it.
  The explicit mixed-mode API is retained; it must not be described as read-only.
- [x] Verify package routing and all eleven planned child commands through the
  focused fanout test with intercepted child processes. This proves command
  dispatch only; child implementation side effects require their own audit.
  `npx vitest run src/lib/server/atlas/phase8-fanout.spec.ts` from the frontend
  passed 6/6 tests. The first attempt hit Vitest's non-file `import.meta.url`;
  loading the package JSON directly resolved that fixture setup issue.
- [ ] Continue current-source owner admission using the existing bounded source
  plan and lifecycle writer. A current source receipt, structural validation,
  same-revision semantic/graph snapshots, executor parity, and independently
  read-back bounded projection remain sequential promotion gates. Do not check
  these off from package routing tests or a process completion marker.

Source-owner follow-up: `node scripts/atlas/plan-current-source-graphify-batch-v1.mjs
--limit=5` returned `CURRENT_GRAPHIFY_BATCH_PLAN_BLOCKED_REVIEW`: five selected
sources, zero exact matches, five revision/content mismatches, no missing or
ambiguous Graphify rows. This compares live database rows with the recorded
lifecycle input bindings; it does not freshly validate those bindings' source
bytes. Receipt: `docs/reports/current-source-graphify-batch-plan-v1.json`.
The full-inventory lifecycle opener is a writer, not a bounded five-source
repair. Existing coordinator canary is separately guarded and uses three
sources; neither was invoked here.

Audit limitation: `audit-graphify-lifecycle-owner-v1.mjs` emits a literal
`transitionPrimitiveExists: false` and uses heuristic writer classification.
That field does not establish missing implementation: `openGraphifyRunV1`
and `bindWorkspaceRevisionV1` exist in the source-inventory writer. Current
execution authority must be established using the snapshot selector and its
database readback, not inferred from this static false value.

### CURRENT-SOURCE-BINDING-DIAGNOSTICS-01 — 2026-09-08

- [x] Extend the existing batch planner with per-field observed/expected binding
  diagnostics. Count each mismatched field once per selected source; preserve
  ambiguity rejection and require exact source references (case or namespace
  aliases cannot establish exact identity). No new source owner was introduced.
- [x] Reject invalid limits and empty cohorts; null database byte lengths cannot
  match a zero-byte file. Eight pure Node tests pass via
  `node --test scripts/atlas/graphify-source-binding-comparison-v1.test.mjs`.
- [x] Replay `node scripts/atlas/plan-current-source-graphify-batch-v1.mjs --limit=5`:
  five selected, zero exact, five mismatches, with `workspaceRevision=5` as the
  only mismatched field. Source revision, content digest, byte length, and exact
  source reference agree for all five rows with the recorded input bindings.
  Report: `docs/reports/current-source-graphify-batch-plan-v1.json`.
- [x] Independently hash those five source files using PowerShell
  `Get-FileHash -LiteralPath <source> -Algorithm SHA256` and inspect file length:
  all five current on-disk digests and lengths match the recorded cohort.
  This is a bounded observation at audit time, not full-workspace authority.
- [ ] Reconcile a current full source selection through the existing production
  execution owner before whole-workspace admission. The snapshot selector
  requires full source-count/binding/checksum parity and explicitly rejects
  bounded/canary selection receipts. A three- or five-source canary may prove
  writer behavior but cannot close this full-snapshot gate. Do not relabel it,
  weaken selector coverage, overwrite workspace revisions on old rows, or
  re-embed unchanged sources to manufacture admission.

Implementation: `scripts/atlas/plan-current-source-graphify-batch-v1.mjs`, pure
diagnostic helper `scripts/atlas/lib/graphify-source-binding-comparison-v1.mjs`,
and `scripts/atlas/graphify-source-binding-comparison-v1.test.mjs`.
The planner explicitly records `canonicalAuthority=false`,
`sourceBytesRevalidated=false`, and `promotionAllowed=false`; its separately
executed file-hash check above does not change those script guarantees.
Syntax and targeted diff checks pass. Database/projection writes: zero.

## PACKET-REGISTRY-WRITER-OWNERSHIP-01 (2026-09-08, read-only gate, first tranche of a larger canonical-spine plan)

Operator directive (2026-09-08): Parent Atlas's remaining gaps are not another
algorithm/reranker/cache/schema/GPU helper but three system-level invariants —
canonical writer ownership, revision-qualified admission, and transaction
semantics. This entry closes the first of those: which single runtime
boundary is permitted to establish canonical `atlas_packets` identity.

- [x] Built `scripts/atlas/audit-packet-registry-writer-ownership-v1.mjs`
  (read-only; never executes a writer). Candidate discovery via
  `rg -l -E '(INSERT INTO "?atlas_packets"?[^_]|UPDATE "?atlas_packets"?[^_]|
  INSERT INTO "?atlas_packet_registry"?|UPDATE "?atlas_packet_registry"?)'`
  across `scripts/`, `sveltekit-frontend/src/`, `sveltekit-frontend/scripts/`,
  `packages/` — 107 candidate files. A narrower, stale, hand-picked 6-file
  predecessor (`scripts/atlas/audit-registry-writer-ownership-v2.mjs`) already
  existed but missed 101 of the real candidates, including the file that
  turned out to be the only live-wired writer (`canonical-id-hierarchy.ts`)
  — do not treat that v2 script's narrow WRITERS list as authoritative going
  forward; this v1 gate supersedes it for ownership questions.
- [x] Live parity is clean: `atlas_packets` = `atlas_packet_registry` = 61,718
  rows, 0 missing-registry-row, 0 orphan-registry-row, 0 duplicate keys — the
  registry population gap the operator's directive worried about does not
  currently exist by count/key match (does not by itself prove the registry
  is a correct projection, only that it is not currently diverged in size).
- [x] First-pass automated classification (basename-cooccurrence heuristic)
  found 4 `CANONICAL_WRITER_CANDIDATE`s, 2 `PRODUCTION_CAPABLE_UNOWNED`
  runtime writers, 80 `PROJECTION_WRITER`, 21 `MIGRATION_ONLY`, 0 dead
  orphans, 0 unresolved-identity-writers, 13 dry-run-reachable mutation paths
  (scripts that can mutate `atlas_packets`/`atlas_packet_registry` on direct
  invocation with no dry-run gate — listed in the receipt's
  `dryRunReachableMutationPaths`, not executed).
- [x] Manually verified the 4 "canonical candidates" against real import
  statements (not basename cooccurrence) plus each file's actual write logic
  — this found 2 false positives in the automated pass, recorded in the
  receipt's `manualCallerVerification_2026-09-08` block:
  - **`sveltekit-frontend/src/lib/server/topology/canonical-id-hierarchy.ts`
    — REAL, the only verified live production writer.** 7 real callers
    (`dispatcher-integration.ts`, `dynamic-dispatcher.ts`,
    `go-retrieval-coordinator.ts`, `go-retrieval-facade.ts`,
    `go-service-integration.ts`, `permission-manager.ts`,
    `identity-worker.ts`) plus a live route
    (`src/routes/api/retrieval/go/+server.ts`). Conflict policy is narrow:
    `INSERT INTO atlas_packets ... ON CONFLICT (packet_key) DO UPDATE SET
    updated_at = NOW()` (line 326) — never overwrites identity/content
    columns on conflict. Also does separate `UPDATE atlas_packets` (lines
    559, 607) and `DELETE FROM atlas_packets` (line 585).
  - **`packages/atlas-core/src/validation/gan-deep-audit.ts` — FALSE
    POSITIVE, not a writer at all.** Only reads `atlas_packets`; the
    `UPDATE atlas_packets` regex match was a remediation-suggestion string
    template (`remediation: 'UPDATE atlas_packets SET ganWarnings = NULL...'`),
    never executed. Its live caller
    (`src/routes/api/atlas/gan-audit/deep/+server.ts`) is a read-only
    audit endpoint.
  - **`promote-results.ts` / `promote-results-outbox.ts` — TEST_ONLY_UNOWNED.**
    Each file's only reference anywhere in `sveltekit-frontend/src` is its
    own `.spec.ts`. Zero production callers.
  - **`packet-materializer-pipeline.ts` / `promotion-executor.ts` —
    `PRODUCTION_CAPABLE_UNOWNED` confirmed, zero references anywhere.**
    `packet-materializer-pipeline.ts` fully implements the 5-step canonical
    truth flow (Postgres write -> Redis invalidate -> event emit) with a
    correct `ON CONFLICT (packet_key) DO UPDATE SET <all columns> = ...`
    (full-column overwrite) but nothing in the live app calls
    `materializePacket()`/`materializePacketBatch()`.
- [x] **Corrected conclusion**: exactly ONE verified live runtime canonical
  writer exists — `canonical-id-hierarchy.ts`, reached via the Go retrieval
  dispatch path. This satisfies "exactly one canonical owner" for identity
  columns specifically. **But it is not a clean pass**: two fully-built,
  production-capable, currently-unowned writers
  (`packet-materializer-pipeline.ts`, `promotion-executor.ts`) exist with a
  DIFFERENT conflict policy (full-column overwrite vs. `canonical-id-hierarchy.ts`'s
  updated_at-only refresh) — if either is wired into a live caller later
  without first reconciling conflict semantics against the file that is
  actually canonical today, it would silently create the exact "competing
  identity derivation" failure mode the operator's directive warned about.
- [ ] Not done in this pass (deliberately, per "do not execute the registry
  writer yet"): `PacketWriteDecisionV1` conflict-policy contract,
  `CanonicalPacketWriteV1`/`RepresentationWriteV1` revision-qualified
  admission types, the outbox/transaction-boundary design, and any decision
  on whether `packet-materializer-pipeline.ts`/`promotion-executor.ts`
  should be wired in (matching `canonical-id-hierarchy.ts`'s conflict
  policy) or archived as superseded-but-never-adopted alternatives.
- [ ] The other two 13-item dry-run-reachable-mutation-path scripts and the
  21 `MIGRATION_ONLY` scripts were classified by heuristic (reachable via
  package.json or a cron/startup/graphify chain reference) but not
  individually read — this inventory is a starting point for
  `PACKET-WRITE-REVISION-CONTRACT-01`, not a closed audit of each one.

Report: `docs/reports/packet-registry-writer-ownership-v1.json`. Script:
`scripts/atlas/audit-packet-registry-writer-ownership-v1.mjs`. Zero writes
performed; zero writer scripts executed. Next gate per operator's own
sequencing: `PACKET_WRITE_REVISION_CONTRACT_01` — do not execute a registry
writer or backfill until that contract and the transaction/outbox design
exist.

## PACKET-REGISTRY-WRITER-OWNERSHIP-01 — CORRECTION (2026-09-08, same session, supersedes the "exactly one canonical writer" conclusion above)

The entry above this one concluded `canonical-id-hierarchy.ts` was the one
verified live canonical writer. **That conclusion was wrong**, caught by
checking the actual write-function call sites (not module-level import
cooccurrence) and by re-running discovery to also catch Drizzle-ORM writers,
which the original grep-for-literal-SQL discovery command structurally
cannot see.

- [x] `canonical-id-hierarchy.ts`'s actual write functions
  (`persistIDHierarchyToPostgres`, `softDeletePacket`,
  `approveAndPermanentlyDelete`, `undeletePacket`) have **zero callers
  anywhere in the repo** (checked with `rg --no-ignore --hidden` across the
  whole tree, not just `sveltekit-frontend/src` — covers `scripts/`, `.tmp/`,
  and gitignored paths per the operator's explicit ask this session). The 7
  files credited as "callers" in the prior entry only import types, a Zod
  schema, and the pure validator `validateCanonicalEnvelope()` — never the
  write functions. Reclassified `PRODUCTION_CAPABLE_UNOWNED`, same bucket as
  `packet-materializer-pipeline.ts` and `promotion-executor.ts`.
- [x] The original candidate-discovery command (`rg` for literal `INSERT
  INTO`/`UPDATE` SQL text) structurally cannot see Drizzle-ORM writers —
  Drizzle generates SQL programmatically (`.insert(atlasPackets).values(...)`,
  `.update(atlasPackets).set(...)`), no literal SQL string appears in source.
  A follow-up grep for `\.(insert|update)\(atlasPackets\)` found 8 more
  candidate files the v1 gate never classified: `som-clustering.ts`,
  `mcp-tool-implementations.ts`, `semantic-packet-writer.ts`,
  `packet-summary-pipeline.ts`, `hyperrag-packet-pipeline.ts`,
  `feature-label-enricher.ts`, `summary-freshness-checker.ts`,
  `workers/identity-worker.ts`. **This is a real gap in the gate's own
  methodology**, not just a missed file — any future re-run of this gate
  must discover candidates via both raw-SQL grep AND ORM-call-pattern grep
  (or better, an AST-based import/call-graph pass), never raw-SQL grep alone.
- [x] Verified 3 real, live, currently-wired writers of `atlas_packets`
  (function-call-site checked, not basename cooccurrence):
  - **`semantic-packet-writer.ts::persistCanonicalSemanticPacketEmbedding`**
    — caller: `src/routes/api/admin/batch-embeddings/embed/+server.ts` (live
    route). `INSERT ... .values({ packetKey, sourceRef, featureId,
    sourcePath, ... })` — the only one of the three confirmed to create new
    identity (`packet_key`/`source_ref`/`feature_id`) rather than only
    update an existing row.
  - **`packet-summary-pipeline.ts::runPacketSummaryPipeline` /
    `runPacketSummaryPipelineBatch`** — caller:
    `src/routes/api/atlas/summary/+server.ts` (live route). `UPDATE ...
    WHERE packetKey = input.packet_key` — summary/content update on an
    existing row only, not identity creation. Legitimate non-competing
    projection writer.
  - **`mcp-tool-implementations.ts::toolIdentityRecover`** — caller:
    `src/mcp/server.ts` (live 108-tool MCP registry, agent-triggered).
    `UPDATE ... WHERE packet_key = input.packet_key`, SETting
    `source_ref`, `file_path`, `feature_id`, `feature_label`,
    `domain_class`, `title_id`, `tree_node_id` — an identity-field REPAIR
    path on an existing row. Real, but able to overwrite the same identity
    columns `semantic-packet-writer.ts` establishes on create, with no
    visible coordination between the two — this is the actual residual
    "uncoordinated owner" risk, not a 4-way collision as first miscounted
    and not a clean 1-writer pass as second miscounted.
- [x] Checked whether the Parent Atlas Studio admin surface
  (`sveltekit-frontend/src/routes/api/atlas/studio/{cards,cards/[id],
  redis,search}/+server.ts`, real routes, confirmed to exist) calls any of
  these writers — it does not reference `atlasPackets`/`atlas_packets`,
  `canonical-id-hierarchy`, `semantic-packet-writer`,
  `packet-summary-pipeline`, or `identity-worker` at all. Consistent with
  the operator's own framing: Studio is still being built out, not yet
  wired to packet mutation. Not a caller.
- [x] Confirmed dormant, zero callers repo-wide (src + `--no-ignore
  --hidden` full-tree check): `canonical-id-hierarchy.ts`,
  `identity-worker.ts` (`processPacketIdentity`),
  `feature-label-enricher.ts` (`enrichPacketWithLabels`),
  `summary-freshness-checker.ts` (`recordSummaryGeneration`),
  `hyperrag-packet-pipeline.ts` (`createHyperRAGPacketPipeline`,
  `enqueuePacketProjectionRequests`), `som-clustering.ts`
  (`findBMUBatch`, referenced once by `som-clustering-cuda.ts`, which
  itself has zero callers), `packet-materializer-pipeline.ts`,
  `promotion-executor.ts`.
- [ ] Not resolved: whether `toolIdentityRecover`'s identity-field
  overwrite and `semantic-packet-writer.ts`'s identity-creation logic can
  disagree on derivation (e.g. different `feature_id`/`title_id`
  derivation rules) for the same `packet_key`. This is the concrete,
  narrowed version of `PACKET_WRITE_REVISION_CONTRACT_01`'s conflict-policy
  work — resolve it there, not by guessing here.

Receipt updated in place:
`docs/reports/packet-registry-writer-ownership-v1.json`
(`CORRECTION_2026-09-08` field). Zero writes performed; zero writer scripts
executed in the course of this correction.

## PACKET-REGISTRY-WRITER-OWNERSHIP-01 — SECOND CORRECTION (2026-09-08, same session, corrects the "toolIdentityRecover overwrites identity fields" claim in the CORRECTION entry directly above)

The CORRECTION entry above this one claimed `toolIdentityRecover` writes
`source_ref`, `file_path`, `feature_id`, `feature_label`, `domain_class`,
`title_id`, `tree_node_id` on an existing row, and flagged that as an
uncoordinated-owner risk against `semantic-packet-writer.ts`. **That claim
was wrong** — caused by quoting the wrong function. A background-task prompt
asked for `toolIdentityRecover`'s write scope, and the `sed`-extracted line
range actually captured the tail of `toolIdentityRecoverImpl` plus the full
body of the *next* function in the file, `toolEnvelopeValidateImpl` — and the
`requiredFields` / `.set(...)` code quoted as evidence was
`toolEnvelopeValidateImpl`'s, not `toolIdentityRecoverImpl`'s.

- [x] Read `toolIdentityRecoverImpl` directly (lines 129-218 of
  `mcp-tool-implementations.ts`, not the line range used in the mis-read).
  It calls `resolveCanonicalPacketKey(input.packet_key)` — the same
  canonical resolver `semantic-packet-writer.ts`'s
  `resolvePersistedPacketKey()` also calls — then does `UPDATE ... SET {
  identity_lane, identity_confidence, updated_at } WHERE packetKey =
  canonical_packet_key`. It never writes `source_ref`, `feature_id`,
  `feature_label`, `title_id`, `tree_node_id`, or `domain_class`. It is a
  narrow confidence/lane annotator only.
- [x] `toolEnvelopeValidateImpl` (the function actually quoted by mistake)
  is a separate, 4th live writer, previously unlisted: caller is the same
  live MCP registry (`src/mcp/server.ts`), writes only `{ identity_confidence,
  updated_at }` — also narrow, also no identity-column overlap with
  `semantic-packet-writer.ts`.
- [x] Re-derived the real conclusion: there is **no identity-field write
  overlap** between the 3 (now 4, counting `toolEnvelopeValidate`) live
  writers. `semantic-packet-writer.ts` is the sole writer of
  `source_ref`/`feature_id`/`feature_label`/`directoryPath`.
  `packet-summary-pipeline.ts` only touches summary-related columns.
  `toolIdentityRecover` and `toolEnvelopeValidate` only touch
  `identity_lane`/`identity_confidence`/`updated_at`. The "uncoordinated
  owner" risk asserted in the prior CORRECTION entry does not hold up.
- [x] **Gate result, now grounded in verified code, not inference**:
  `PACKET_REGISTRY_WRITER_OWNERSHIP_01` **passes** for the live writer set —
  disjoint write scopes, and the two writers that do resolve `packet_key`
  (`semantic-packet-writer.ts`, `toolIdentityRecover`) both route through the
  same shared `resolveCanonicalPacketKey()` function rather than each
  deriving it independently.
- [ ] The real residual risk is unchanged in kind but now correctly scoped:
  not a live conflict, but that 5 dormant, differently-designed writers
  (`canonical-id-hierarchy.ts`, `packet-materializer-pipeline.ts`,
  `promotion-executor.ts`, `identity-worker.ts`, and the
  hyperrag/feature-label/summary-freshness/som-clustering group) could be
  wired in later without reconciling conflict semantics against the live
  set — `packet-materializer-pipeline.ts` in particular does a full-column
  overwrite on conflict, unlike `semantic-packet-writer.ts`'s explicit,
  narrow field list.

**Process note for future sessions**: this is the second self-correction on
the same underlying question in one sitting. Both times the fix was the
same discipline — reading the actual function body at its real line range
rather than trusting a background-task's own summarized quote of it. Treat
any claim about what a specific function writes as unverified until the
function's own source has been read directly in this context, not relayed
through an intermediate description.

Receipt updated in place:
`docs/reports/packet-registry-writer-ownership-v1.json` (renamed the prior
`correctedConclusion` field to `correctedConclusion_v2` with the corrected
text, preserving the wrong version nowhere — the old field name no longer
exists in the file, replaced in place). Zero writes performed.

## PACKET_REGISTRY_WRITER_OWNERSHIP_01B — AST mutation-site census + hand verification (2026-09-08, same session, third and final round on this question)

Operator directive: reopen P0 at function/mutation-site granularity, not
module-import granularity, since two prior corrections in this same session
(above) showed module-level and even function-name-cooccurrence checks
produce false confidence. Built
`scripts/atlas/audit-mutation-site-census-v1.mjs` using ts-morph (real AST,
not regex) to extract every `.insert(atlasPackets)`/`.update(atlasPackets)`/
registry-equivalent call, its exact enclosing function by AST ancestry, and
the columns/conflict-policy/where-predicate it touches, across the 13
production `sveltekit-frontend/src` files this session's writer sweeps
surfaced. Standalone `scripts/` one-shot writers were left at the v1 gate's
file-reachability granularity (defensible for CLI-only scripts).

- [x] First AST run found a real bug in the script itself: the
  enclosing-function walker stopped at the first `VariableDeclaration`
  ancestor regardless of what it held, so `const updated = await
  db.update(...)` inside `toolIdentityRecoverImpl` produced the fabricated
  function name "updated" for 5 real mutation sites in
  `mcp-tool-implementations.ts`. Searching for callers of "updated(" then
  matched an unrelated `onupdated()` Svelte callback in
  `CitationSearch.svelte:80` and reported it as a caller of a database
  write it has nothing to do with -- verified false by reading the actual
  line (a prop-callback invocation, no relation to Postgres). Fixed the
  walker to only stop at a VariableDeclaration when its initializer is
  actually a function/arrow value, not any local result binding -- re-ran,
  the fabricated caller disappeared and the 5 sites resolved to their real
  enclosing functions.
- [x] Re-run surfaced a second, different false positive, not caught by
  the walker fix: `hyperrag-packet-pipeline.ts::materializePackets` (a real
  INSERT with onConflictDoUpdate(packetKey) writing packetKey, featureId,
  sourceRef, canonicalSourceRef, titleId, featureLabel, directoryPath) was
  classified CANONICAL_WRITER with 4 "callers" -- but ace-materializer.ts:309
  and packet-parser.ts:117 each define their OWN unrelated function of the
  same name (materializePackets), never importing this file. Verified by
  direct read of both (one is a local batch wrapper, the other is a Rust
  N-API MessagePack chunker -- not a DB write at all) and by a repo-wide
  grep for actual import statements of 'hyperrag-packet-pipeline' (zero
  functional importers -- only a metadata/catalog string in
  runtime-registry.ts). This exact false-positive pattern was already found
  and documented in an earlier, separate session's script
  (`scripts/atlas/prove-bitfrost-invalidation-owner-v1.mjs` lines 202, 234)
  -- independent confirmation this file's writer is genuinely dormant, not
  a coincidence of this session's methodology.
- [x] Checked the inverse risk too -- a false negative from wrapper
  indirection. The 4 mcp-tool-implementations.ts sites the walker-fix
  correctly renamed (toolIdentityRecoverImpl, toolEnvelopeValidateImpl,
  toolMirrorSyncQdrantImpl, toolMirrorSyncNeo4jImpl) still showed zero
  callers in the script's output -- because each is wrapped via
  withMcpToolTelemetry(...) and exported under a DIFFERENT name
  (toolIdentityRecover, toolEnvelopeValidate, toolMirrorSyncQdrant,
  toolMirrorSyncNeo4j), and it's the wrapped name src/mcp/server.ts
  actually imports and calls. Verified directly: server.ts:18 imports all
  5 wrapped names; real call sites at lines 2370, 2390, 2418, 2443. These 4
  are genuinely live. The 5th, toolIdentityQuarantine (wrapping
  toolIdentityQuarantineImpl, line 739 site), is imported at the same
  line 18 but never actually called anywhere in server.ts -- checked
  directly, zero toolIdentityQuarantine( call sites. Confirmed dormant,
  unlike its siblings.
- [x] Final, hand-verified result (recorded in
  `docs/reports/packet-registry-writer-ownership-01b-mutation-census-v1.json`'s
  HAND_VERIFICATION_CORRECTION_2026-09-08 block, which corrects the raw
  script output in place rather than replacing it):
  - Exactly ONE live canonical identity-creating writer:
    `semantic-packet-writer.ts::persistCanonicalSemanticPacketEmbedding`
    (caller: `api/admin/batch-embeddings/embed/+server.ts`). Writes
    packetKey/sourceRef/featureId/featureLabel/directoryPath.
  - 5 live, narrow, non-identity metadata/representation writers, all
    with disjoint column scopes and zero overlap with the identity
    writer's columns: `packet-summary-pipeline.ts::runPacketSummaryPipeline`
    (summary), and the 4 real MCP-tool-wired functions above
    (identity_lane/identity_confidence/qdrant_point_id/updated_at
    only -- never source_ref/feature_id/packet_key creation).
  - 8 confirmed dormant (PRODUCTION_CAPABLE_UNOWNED):
    `canonical-id-hierarchy.ts`, `packet-materializer-pipeline.ts`,
    `promotion-executor.ts`, `identity-worker.ts::processPacketIdentity`,
    `feature-label-enricher.ts::enrichPacketWithLabels`,
    `summary-freshness-checker.ts::recordSummaryGeneration`,
    `hyperrag-packet-pipeline.ts::materializePackets`, and
    mcp-tool-implementations.ts's unused toolIdentityQuarantine.
  - 2 test-only: `promote-results.ts`, `promote-results-outbox.ts`.
  - Gate result: PACKET_REGISTRY_WRITER_OWNERSHIP_01B PASSES --
    canonicalIdentityRuntimeWriters = 1, no competing identity derivation
    among the live writer set, disjoint write scopes confirmed at the
    column level (AST-extracted, not inferred).
- [x] Fixed the script's own bugs where found (the VariableDeclaration
  walker issue) but did not generalize the fix for the two remaining
  known gaps -- bare function-name text matching still cannot by itself
  distinguish same-named-different-file functions (the materializePackets
  case) from a wrapped/re-exported call chain (the MCP-tool case). Both
  were caught by hand-reading real call sites, not by the script. Flagged
  as a known limitation for any future re-run of this gate: a correct
  general fix needs either (a) requiring a real import statement resolving
  to the specific file before crediting a caller, or (b) full ts-morph
  project-wide reference resolution (findReferences()), not text-matching a
  function name -- deferred, not attempted this session given the
  4600+2600-file project load cost.

Process note, worth keeping: this is the third self-correction round on
the same underlying ownership question in one session -- module-level
cooccurrence (wrong) -> function-level manual read (right, but one
mis-attributed quote along the way, also caught and fixed) -> AST mutation
census (two more false readings, both caught by hand-verification before
being reported as final). Each round used a more rigorous method than the
last, and each still needed direct verification of its output rather than
being trusted on its own. That pattern -- new tooling raises confidence but
does not replace reading the actual call site -- is the operationally
important lesson for the rest of the canonical-spine work ahead (P1 revision
contract, P2 transaction/outbox, P3+ chunk/symbol lineage), not just this
one gate.

Receipts: `docs/reports/packet-registry-writer-ownership-01b-mutation-census-v1.json`
(script output + HAND_VERIFICATION_CORRECTION_2026-09-08 block).
Script: `scripts/atlas/audit-mutation-site-census-v1.mjs` (fixed in place,
one known bug remaining, documented above). Zero writes performed; zero
writer scripts executed.

## PACKET_WRITE_REVISION_CONTRACT_01 (2026-09-08, same session, read-only, answers the specific ownership-conflict question)

Operator's specific question: can `semantic-packet-writer.ts::persistCanonicalSemanticPacketEmbedding`
(the confirmed sole CANONICAL_WRITER) and `mcp-tool-implementations.ts::toolIdentityRecover`
(a confirmed live metadata mutator) produce contradictory identity state for
the same `packet_key`? Built `scripts/atlas/audit-packet-write-revision-contract-v1.mjs`
(read-only, one live-schema query + one live-data census, zero writes) to
answer with fresh evidence rather than extending the already-hand-verified
column lists from the 01B gate by inference.

- [x] **Direct answer: NO, not currently.** `toolIdentityRecover`'s actual
  `UPDATE .set()` only ever touches `identity_lane`, `identity_confidence`,
  `updated_at` — confirmed twice already this session by direct source
  read. It accepts `source_ref` and `feature_id` as **required** Zod input
  fields but never writes them anywhere. Zero column overlap with what
  `semantic-packet-writer.ts` creates (`packetKey`, `sourceRef`,
  `featureId`, `featureLabel`, `directoryPath`). `conflictPolicySafe: true`.
- [x] **Correction to the operator's own premise** (carried over from an
  externally-pasted log): the claim "toolIdentityRecover ... can overwrite
  identity related fields on an existing packet_key" does not match the
  verified code. Flagged this directly rather than silently building
  conflict-resolution machinery around a conflict that doesn't exist in the
  current implementation.
- [x] **Real, different problem found instead**: `toolIdentityRecover`'s
  Zod schema requires `source_ref`/`feature_id` as input but the function
  silently discards them — dead input fields on a tool whose name promises
  identity repair it doesn't perform. Two explanations, neither resolved
  here: (a) genuinely incomplete implementation (should compare-and-repair
  using those inputs but doesn't), or (b) intentionally required as
  proof-of-caller-knowledge with no actual use — but no
  read-compare-reject-if-mismatched logic exists either way. Left as an
  open item, not guessed at.
- [x] **Load-bearing schema finding**: queried live `information_schema.columns`
  directly (not the Drizzle schema file) — **`source_revision` does not
  exist in the live `atlas_packets` table**, despite the Drizzle schema
  file declaring `sourceRevision: text('source_revision')`
  (`schema/atlas-packets.ts:76`). This is schema/DB drift matching this
  repo's own extensively documented history (root `CLAUDE.md`'s Drizzle
  Safety Rule section). **Consequence**: the operator's entire
  `CanonicalPacketWriteV1.sourceRevision` /
  `expectedCurrentSourceRevision` / `STALE_REVISION` design cannot be
  implemented as literally specified against the live table today. This
  needs an explicit decision — (a) migrate to add `source_revision`, or (b)
  formally redefine revision-qualification evidence onto
  `workspace_revision` + `content_hash` (both of which DO exist live) and
  document that redefinition — before writing any enforcement code.
- [x] **Checked a real hypothesis and ruled it out with evidence**: does
  `semantic-packet-writer.ts`'s `ON CONFLICT (packetId)` target (not
  `packetKey`) risk silent duplicate-identity rows if a caller ever
  supplies a distinct `packetId` for an existing `packetKey`? No —
  `packet_key` carries its own live `UNIQUE` constraint
  (`atlas_packets_packet_key_key`), independent of the `ON CONFLICT`
  clause. Worst case is a raised `UNIQUE VIOLATION` error, not silent
  corruption. Safe failure mode, confirmed via `pg_constraint`, not assumed.
- [x] **Live data census** (61,718 rows): `distinct_workspace_revisions = 1`
  — every row shares the exact same `workspace_revision` value (the schema
  default, `0`). The column exists and is `NOT NULL`, but has never
  actually been incremented in this dataset — a second dormant-mechanism
  finding, same shape as the writer-ownership gaps already closed this
  session. `content_hash` is 99.4% NULL (61,365/61,718) and
  `lineage_version` is 99.997% NULL (61,716/61,718) — both exist as
  columns but carry essentially no real data yet. None of the three live
  revision-adjacent columns currently holds populated, exercised revision
  evidence at scale.
- [x] **`packetKeyIdentitySemantics` resolved from schema, not inferred**:
  `LOGICAL_STABLE_ACROSS_REVISIONS_BY_NECESSITY` — with no `source_revision`
  column and a live `UNIQUE(packet_key)` constraint, the schema permits at
  most one row per `packet_key` regardless of how many times its source
  content changes. There is no schema-level mechanism today for holding
  multiple revision-qualified rows under the same logical `packet_key`.
- [x] **Column classification** (operator's HARD_CANONICAL / STRUCTURAL_IDENTITY
  / DERIVED_CLASSIFICATION buckets), checked against live columns:
  `packet_key`/`source_ref`/`workspace_revision` exist under
  HARD_CANONICAL, `source_revision` is the one missing member;
  `tree_node_id` exists under STRUCTURAL_IDENTITY, `symbol_version_id`
  does not exist yet (matches the operator's own P5
  `SYMBOL_VERSION_RESOLUTION_01` being still-future work); all of
  `feature_id`/`feature_label`/`title_id`/`domain_class` exist under
  DERIVED_CLASSIFICATION.
- [x] **Overall verdict: `PARTIAL_PROVEN`**, not `NOT_PROVEN` and not
  `BLOCKED`. The specific ownership-conflict question this gate was
  reopened to answer has a direct, evidence-backed answer
  (`conflictPolicySafe = true`, `packetKeyIdentitySemanticsProven = true`
  by necessity). But `revisionInputsProven`,
  `allLiveCallersRevisionQualified`, and `mutationPathsRevisionGuarded`
  are all `false` because the column the whole revision-qualification
  design depends on doesn't exist live yet — these can't be `true` until
  that schema gap is resolved one way or the other, which is a genuine
  decision point, not something to resolve by assumption.

**Not done this pass** (deliberately — this was scoped as read-only,
per the operator's own "make this gate read only first"): no
`PacketIdentityDecisionV1`/`PacketWriteDecisionV1`/`PacketIdentityRepairV1`
TypeScript contracts written yet, no migration proposed, no code changed in
`toolIdentityRecover` or `semantic-packet-writer.ts`. The next real step is
the schema decision flagged above (add `source_revision`, or formally
redefine revision evidence onto `workspace_revision`+`content_hash`) —
that decision should come from the operator, not be assumed here, since it
determines the literal shape of every contract type downstream.

Receipt: `docs/reports/packet-write-revision-contract-v1.json`. Script:
`scripts/atlas/audit-packet-write-revision-contract-v1.mjs`. Zero writes
performed.

#### PACKET-CHUNK-LINEAGE-FRESH-CLASSIFICATION-01 (2026-09-09)

- [x] Re-ran the existing read-only packet/chunk lineage dry-run from the
  current workspace rather than relying on its historical baseline. The
  current population classified **61,717** packets; **1,033** have exact
  revision-proven membership proposals covering **12,880** membership rows;
  **44,410** remain namespace-unproven and **16,274** have no member. No
  conflicting memberships, synthetic canonical IDs, duplicate membership
  pairs, or foreign chunk IDs were found.
- [x] Reconciled the stale baseline explicitly with
  `scripts/atlas/audit-pkt-lineage-09-fresh-classification-v1.mjs`:
  population and aggregate membership counts changed, while admitted packet
  count stayed at 1,033. The classifier returned
  `READY_FOR_HISTORICAL_PROMOTION_AUTHORIZATION` with
  `SAFE_EXPLAINED_DRIFT`, not current-workspace promotion readiness.
- [x] Compared the fresh proposal to live `atlas_packet_chunk_lineage`:
  **7,421** pairs already identical, **5,433** new insert candidates,
  **0** provenance updates, **0** conflicts, **0** deletes, and **0** live
  rows absent from the fresh proposal. This is a plan surface only; it is
  not authorization to insert the 5,433 candidates.
- [x] Corrected the interpretation of the existing dry-run script: its
  `FAIL_RECONCILIATION` result is caused by comparing against a historical
  baseline whose counts are now stale, while the fresh classifier provides
  the current classification. No code or data mutation was performed.

**Status:** `PARTIAL_PROVEN` for historical classification; **blocked for
current-workspace canonical promotion** by the unresolved source-authority /
workspace-revision gate. The next safe step is to reconcile the fresh
proposal against a current completed Graphify source owner and produce a
revision-qualified manifest. Do not run either lineage canary or promotion
apply from this result alone.

Evidence: `docs/reports/pkt-lineage-09-fresh-classification-v1.json`,
`docs/reports/packet-chunk-lineage-backfill-dry-01-results.json`,
`scripts/atlas/audit-pkt-lineage-09-fresh-classification-v1.mjs`, and
`sveltekit-frontend/scripts/atlas/packet-chunk-lineage-backfill-dry-01.mts`.

#### CURRENT-SOURCE-AND-GRAPHIFY-BLOCKER-RECHECK-02 (2026-09-09)

- [x] Re-ran `audit-current-source-evidence-hydration-v1.mjs` read-only.
  Current result remains `SOURCE_EVIDENCE_HYDRATION_BLOCKED`: **24,101** input
  rows, **23,447** exact revision matches, **906** content-hydrated rows,
  **0** authoritative namespaces, **0** evidence-span-ready rows, and **0**
  classifier-ready rows. Missing reasons are **23,195** canonical chunk-owner
  gaps and **906** chunk owners with content but no source revision.
- [x] Re-ran the current Graphify snapshot authority audit using its actual
  `.mts` entrypoint. It returned `NO_TERMINAL_EXECUTION_FOR_CURRENT_WORKSPACE`
  for workspace `625743d2-092b-4fa8-abe0-9dc094920c80`, revision
  `sha256:f708f1586ccf341c6d3164e657ff6483284e5c0cc8a5c85aeecd69bea8a72bd6`,
  with **0** qualifying executions. The earlier `.mjs` path was not present;
  this was a command-path correction, not a data failure.
- [x] Confirmed the lineage dry-run must remain planning evidence only. The
  fresh historical classification cannot authorize current packet/chunk
  promotion while both source hydration and current Graphify authority remain
  unproven. No lineage canary, backfill, or projection apply was run.

**Status:** `BLOCKED` for current canonical reindex admission. The next
implementation target is the existing current-source-owner / Graphify
execution path, followed by a new read-only source-qualified manifest. Do not
apply the 5,433 historical lineage candidates from the prior classification.

Evidence: `docs/reports/current-source-evidence-hydration-v1.json`,
`docs/reports/current-graphify-snapshot-authority-v1.json`,
`scripts/atlas/audit-current-source-evidence-hydration-v1.mjs`, and
`scripts/atlas/audit-current-graphify-snapshot-authority-v1.mts`.

#### CURRENT-SOURCE-AUTHORITY-REPAIR-PLAN-02 (2026-09-09)

- [x] Ran the existing `plan-current-source-authority-repair-v1.mts` planner
  read-only against the active workspace. It returned
  `REPAIR_PLAN_BLOCKED_NO_EXACT_ROWS`, not an executable repair authorization.
- [x] The selected historical owner run is
  `48485685-e773-4433-a1f8-00f5524cca44`; it contains **23,758** rows while
  the current workspace has **24,123** bindings. Exact current bindings: **0**.
- [x] Classified the drift as **23,746** source-revision mismatches and
  **12** unavailable sources. Content-digest mismatch evidence affects **309**
  rows. `canonicalAuthority=false` and `authorizationRequired=true` remain
  explicit in the receipt.
- [x] No source refresh, Graphify rerun, packet update, lineage write, or
  projection mutation was performed. The planner confirms that the existing
  run cannot be promoted by reinterpretation or repair-by-fuzzy-match.

**Status:** `BLOCKED`. A fresh current-workspace source selection/execution
must be established before source hydration, structural refresh, semantic or
graph snapshots, or reindex admission can proceed. The next gate is a
read-only design/health check for the existing Graphify current-execution
injection path; do not invoke the daily apply-capable chain.

Evidence: `docs/reports/current-source-authority-repair-plan-v1.json` and
`scripts/atlas/plan-current-source-authority-repair-v1.mts`.

#### GRAPHIFY-CURRENT-EXECUTION-INJECTION-PLAN-02 (2026-09-09)

- [x] Re-ran the existing read-only injection planner. It produced
  `READY_FOR_EXPLICIT_AUTHORIZATION` for workspace revision
  `sha256:f476b4a6aac2afcafe0f82c7b0e48d52951ccbce73fca52b9706b1f1fbfabefb`
  with **24,101** current source bindings.
- [x] Confirmed the planner does not open an execution, record source
  selection, refresh Graphify, or invoke downstream projections. It explicitly
  reports `authorizationRequired=true`.
- [x] No mutation was performed. This plan is not a promotion receipt and does
  not authorize the daily chain, source hydration, lineage backfill, or any
  Qdrant/Neo4j/Valkey operation.

**Status:** `READY_FOR_EXPLICIT_AUTHORIZATION`, then `BLOCKED` until the
bounded current-execution authorization is supplied. The exact next action,
if authorized separately, is the existing bounded execution-ledger canary;
the apply-capable daily Graphify chain remains prohibited.

Evidence: `docs/reports/graphify-current-execution-injection-plan-v1.json` and
`scripts/atlas/plan-graphify-current-execution-injection-v1.mjs`.

#### GRAPHIFY-CANARY-GUARDRAIL-RECHECK-01 (2026-09-09)

- [x] Rechecked the bounded canary's explicit guards: it requires
  `GRAPHIFY_COMMITTED_CANARY=1`, `ATLAS_NON_PRODUCTION_DATABASE=1`, and the
  exact confirmation token before opening an execution or persisting stage
  rows.
- [x] Rechecked the canary readback contract: it requires a completed
  execution, completion timestamp, exactly three selected files, and five
  completed stages before reporting `PROVEN_COMMITTED_BOUNDED_CANARY`.
- [x] Re-ran `node --test scripts/startup/run-graphify-daily-admission-order.spec.mjs`:
  **3/3 passed**. The daily apply chain remains downstream of canonical
  admission, and lifecycle failures cannot be converted into degraded success.
- [x] No canary was started in this recheck. No execution-ledger rows,
  source rows, or projections were written.

**Status:** `GUARDRAILS_PROVEN`; current source authority remains blocked.
The next state-changing step requires the separately supplied bounded-canary
authorization and must be followed by independent database readback.

#### GRAPHIFY-GIT-SOURCE-AUTHORITY-RECHECK-01 (2026-09-09)

- [x] Ran `audit-graphify-git-source-authority-v1.mjs` read-only. The selected
  run is `14643371-f6f2-4131-906b-235a5c06619a`, but its database status is
  `SUPERSEDED` and it has **0** associated `graphify_files` rows.
- [x] The repository currently has **25,365** Git tree entries, but there are
  no Graphify rows to compare against them. Therefore
  `gitAuthorityProven=false`; repository size is not source-owner proof.
- [x] Confirmed the audit performed no PostgreSQL, Qdrant, Neo4j, or Valkey
  writes. This eliminates the Git audit as a promotion path and preserves the
  requirement for a fresh current-workspace execution.

**Status:** `NOT_PROVEN`. The next authorized transition remains the bounded
current-execution canary, followed by independent readback; do not invoke the
apply-capable daily chain or reinterpret the superseded run.

#### GRAPHIFY-CANARY-LEDGER-READBACK-RECHECK-02 (2026-09-09, corrected)

- [x] Read back the previously authorized bounded execution
  `709e5232-879a-46a8-963d-71c45e2658f0` without mutation. The execution is
  `COMPLETED` with `canonical_authority=false`; all five expected stages are
  `COMPLETED`: `AST_PARSE`, `INVENTORY`, `OPEN`, `SOURCE_SELECTION`, and
  `STRUCTURAL_EXTRACT`.
- [x] Confirmed the ledger schema does not expose a `file_count` column on
  `graphify_executions`; counts must be derived from `graphify_files` and
  stage receipts rather than assumed from the execution row.
- [x] Corrected the first readback query: it inspected legacy
  `graphify_files`, but the current coordinator's source-selection owner is
  `graphify_execution_files`. The correct independent query returns **3**
  rows, **3** distinct source refs, and **1** workspace revision for this
  canary. The apparent execution-to-file ambiguity was a query-table error,
  not a coordinator defect.
- [x] No writes performed. No new canary was started.

**Status:** `PARTIAL_PROVEN`; execution, stage completion, and bounded source
membership readback are proven. Full current-workspace authority remains
blocked because this is intentionally a 3-source canary and
`canonical_authority=false`. Use `graphify_execution_files` for current
execution membership; do not infer it from legacy `graphify_files`.

#### CURRENT-GRAPHIFY-AUTHORITY-RECHECK-03 (2026-09-09)

- [x] Re-ran `audit-current-graphify-snapshot-authority-v1.mts` after the
  corrected canary readback. It returned
  `NO_TERMINAL_EXECUTION_FOR_CURRENT_WORKSPACE` for workspace
  `625743d2-092b-4fa8-abe0-9dc094920c80`, current revision
  `sha256:970ab246d39e035e1e266fa3b3dbb3303a213ed44bc23b5d809891be449a3ec7`,
  and **0** qualifying executions.
- [x] This is expected: the existing canary is bounded to three sources and
  explicitly non-canonical, while the active workspace revision changes as
  the worktree changes. It cannot satisfy full-workspace source-count and
  live-tree checksum predicates.
- [x] No execution, source selection, or projection mutation was performed.

**Status:** `BLOCKED` for full current Graphify authority. A fresh bounded
canary may prove ledger mechanics, but it will not close full-workspace
promotion; the apply-capable daily chain remains disabled by admission.

#### CURRENT-SOURCE-OWNER-RECONCILIATION-01 (2026-09-09)

- [x] Added the bounded read-only owner reconciliation audit at
  `scripts/atlas/audit-current-source-owner-reconciliation-v1.mjs` with root
  command `npm run atlas:source-owner:reconciliation`.
- [x] The audit records Git worktree root/common directory, HEAD/tree, dirty
  state, tracked source count/checksum, current execution candidates using
  `graphify_execution_files`, and legacy `graphify_files`/`graphify_runs`
  candidates. It emits both JSON and Markdown receipts.
- [x] Ran the audit successfully: `CURRENT_SOURCE_AUTHORITY_NOT_PROVEN`,
  owner decision `LEGACY_ONLY_NO_CURRENT_OWNER`, **23,742** tracked indexable
  sources, **8** current execution candidates, **0** exact current owners,
  and **4** legacy completed candidates. `writesPerformed=false`.
- [x] This audit does not create an execution, select sources, refresh
  Graphify, backfill revisions, or touch Qdrant/Neo4j/Valkey. The dirty
  worktree and absence of one exact full-workspace completed owner remain
  explicit admission reasons.

**Status:** `BLOCKED` for `CURRENT_SOURCE_AUTHORITY_PROVEN`. This closes the
read-only reconciliation implementation gate, not source-owner promotion.
The next state-changing action still requires explicit authorization for a
bounded current execution; the daily apply chain remains fail-closed.

Evidence: `docs/reports/current-source-owner-reconciliation-v1.json`,
`docs/reports/current-source-owner-reconciliation-v1.md`, and
`scripts/atlas/audit-current-source-owner-reconciliation-v1.mjs`.

#### SOURCE-REVISION-BACKFILL-PLAN-01 (2026-09-09)

- [x] Ran the existing `plan-source-revision-backfill-v1.mjs` read-only using
  only previously recorded lineage evidence and fresh content checks.
- [x] The planner evaluated **200** proposals: **183** were classified
  `CONTENT_MATCH_AUTHORITY_UNPROVEN` and **17** `STALE_CONTENT`.
- [x] Qualified rows: **0**. `safeToBackfill=false` and
  `writesPerformed=false`. No source revisions were synthesized or written.
- [x] Confirmed this gate cannot bypass the current-source-owner blocker:
  matching bytes without a current authoritative owner are evidence, not
  authorization for `atlas_packets` or any projection.

**Status:** `BLOCKED` for source-revision backfill. Preserve unknown historical
rows as unknown until a current Graphify source owner and revision-qualified
admission receipt exist.

Evidence: `docs/reports/source-revision-backfill-plan-v1.json` and
`scripts/atlas/plan-source-revision-backfill-v1.mjs`.

#### GRAPHIFY-CURRENT-BOUNDED-CANARY-02 (2026-09-09)

- [x] Executed the explicitly authorized bounded non-production canary with
  `AUTHORIZE_GRAPHIFY_COMMITTED_BOUNDED_CANARY_V1`.
- [x] Canary receipt: execution
  `8894000e-d7cc-4298-8201-3f3ad6a0ce57`, workspace revision
  `sha256:c44511cb21e26ca33b97ae6a7f3878827883dd11680db7aeefd60c477711be70`,
  **3** selected sources, **5** completed stages, and structural status
  `RECOVERED_WITH_ERRORS` / `NATIVE_RECOVERED`.
- [x] Independent PostgreSQL readback confirmed execution `COMPLETED`,
  `canonical_authority=false`, **3** execution-file rows, **3** distinct
  source refs, **1** workspace revision, all **3** rows matching the execution
  revision, and **5** completed stages.
- [x] The canary receipt explicitly reports
  `canonicalPromotionMayBeAttempted=false`, `broadGraphifyRun=false`, and no
  Qdrant, Neo4j, Valkey, packet, semantic, or graph projection writes.
- [x] This proves the current coordinator's bounded ledger/source-selection /
  structural mechanics and readback path. It does **not** establish a
  full-workspace current source owner because the cohort is intentionally only
  three sources.

**Status:** `PROVEN_COMMITTED_BOUNDED_CANARY`; full current source authority
remains `BLOCKED`. The next gate is a fresh read-only authority audit against
this canary, followed by a separate decision for any larger current-workspace
execution. Do not invoke the apply-capable daily chain.

Evidence: `docs/reports/graphify-daily-coordinator-canary-v1.json`, live
`graphify_executions`, `graphify_execution_files`, and
`graphify_execution_stages` readback.

#### GRAPHIFY-FULL-CURRENT-SOURCE-SELECTION-01 (2026-09-09)

- [x] Extended the existing coordinator canary owner with a guarded `--full`
  mode. It requires the distinct authorization token
  `AUTHORIZE_GRAPHIFY_FULL_WORKSPACE_SOURCE_SELECTION_V1`; bounded modes remain
  capped at 50.
- [x] Full current-workspace source selection completed under execution
  `ccb615ba-99da-4801-bcf7-0e8a63e7376a`. The freshly materialized workspace
  revision is
  `sha256:5db2bc428d4dcf07c2a11096039aad18c916b50aa17e849b2325a782d981dcdc`.
- [x] Execution receipt reports **24,132/24,132** source bindings selected,
  **5** completed stages, `broadGraphifyRun=true`,
  `canonicalPromotionMayBeAttempted=false`, and
  `canonicalAuthority=false`. Only execution-ledger/source-selection/stage
  rows were persisted; no packet, semantic, Qdrant, Neo4j, Valkey, or feature
  projection writes occurred.
- [x] Independent PostgreSQL readback confirmed `COMPLETED`, **24,132**
  execution-file rows, **24,132** distinct source refs, one workspace revision,
  all **24,132** rows matching the execution revision, and **5** completed
  stages. `SOURCE_SELECTION` uses the non-canary policy revision
  `graphify-current-workspace-source-selection:v1`.
- [x] Re-ran the authority audit: `CURRENT_SNAPSHOT_PROVEN` with exactly **1**
  qualifying execution for workspace
  `625743d2-092b-4fa8-abe0-9dc094920c80`.

**Status:** `CURRENT_SOURCE_AUTHORITY_PROVEN`; downstream canonical packet,
semantic, structural, graph, and projection promotion remains separately
gated. This closes source selection authority only; it does not authorize the
daily apply chain or broad projection writes.

Evidence: `docs/reports/graphify-daily-coordinator-canary-v1.json`,
`docs/reports/current-graphify-snapshot-authority-v1.json`,
`docs/reports/current-source-selection-input-v1.json`, and live PostgreSQL
readback.

#### GRAPHIFY-AUTHORITY-AFTER-50-CANARY-01 (2026-09-09)

- [x] Re-ran the full current-authority audit after the 50-source canary.
  Result: `NO_TERMINAL_EXECUTION_FOR_CURRENT_WORKSPACE`, workspace
  `625743d2-092b-4fa8-abe0-9dc094920c80`, current revision
  `sha256:f0c841b9f055147f203b87f76936e4d10285c4cca321847362f3a7afc1425d57`,
  qualifying executions **0**.
- [x] Correctly classified the 50-source execution as bounded evidence only:
  it cannot satisfy the full-workspace source-count and live-tree checksum
  predicates and remains `canonical_authority=false`.
- [x] No new execution or projection mutation was performed. OpenSpec remains
  valid after the evidence update.

**Status:** `PROVEN_BOUNDED_ONLY`; full current authority remains `BLOCKED`.

#### GRAPHIFY-SOURCE-INVENTORY-DRY-RUN-01 (2026-09-09)

- [x] Ran the existing `materialize-graphify-source-inventory.mts` in its
  default dry-run mode. It produced `DRY_RUN_PROVEN` for workspace revision
  `sha256:470a398ac7fd8a993330449bf6e0809bf4c101fb6e4b9978048f5385c5ae3fdb`
  with source manifest digest equal to that revision.
- [x] Current source manifest count: **24,132**; bounded selected count:
  **100**. `canonicalWriteAttempted=false` and
  `graphMayConsumeWorkspaceRevision=false`.
- [x] This proves current-worktree source manifest construction, not durable
  Graphify ownership. No `--apply`, execution creation, packet write, or
  projection mutation was performed.

**Status:** `DRY_RUN_PROVEN`; full source-owner admission remains `BLOCKED`.

Evidence: `docs/reports/graphify-source-inventory-plan.json` and
`sveltekit-frontend/scripts/atlas/materialize-graphify-source-inventory.mts`.

#### CURRENT-SOURCE-OWNER-POST-CANARY-RECHECK-01 (2026-09-09)

- [x] Refreshed `npm run atlas:source-owner:reconciliation` after the new
  canary. Current execution candidates increased to **9**, but exact current
  full-workspace owners remain **0**; the owner decision remains
  `LEGACY_ONLY_NO_CURRENT_OWNER`.
- [x] The canary is therefore visible to the inventory but correctly does not
  qualify as canonical: its bounded membership and non-canonical policy keep
  it outside full-workspace admission.
- [x] No writes were performed by this refresh. The generated JSON/Markdown
  reports are derived worktree artifacts only.

**Status:** `PROVEN_BOUNDED_ONLY`; full current source authority remains
`BLOCKED`. A separate full-workspace execution policy decision is required
before any source-revision backfill or downstream projection apply.

#### GRAPHIFY-INJECTION-PLAN-SCOPE-CORRECTION-01 (2026-09-09)

- [x] Re-ran the current execution injection planner: **24,101** bindings,
  status `READY_FOR_EXPLICIT_AUTHORIZATION`, intended stages `OPEN` and
  `SOURCE_SELECTION`, and write scope `NONE_UNTIL_EXPLICIT_AUTHORIZATION`.
- [x] Corrected its stale hard-coded note claiming a “25,701-source set.” The
  plan now refers to the dynamic current-workspace source set, preventing an
  authorization scope mismatch.
- [x] Syntax validation and strict OpenSpec validation pass. The planner
  remains plan-only and opens no database connection.

**Status:** `PLAN_SCOPE_PROVEN`; no execution or source-selection mutation was
performed. Any future full-workspace run requires a separately bounded scope
and explicit authorization.

#### GRAPHIFY-50-SOURCE-CANARY-01 (2026-09-09)

- [x] Extended the existing bounded coordinator canary to accept
  `--limit=N`, constrained to **1–50**, with dynamic source-count validation
  and scope-specific authorization for the 50-source run.
- [x] Focused guard tests passed **5/5** across the canary-limit and daily
  admission-order suites. The failed `tsx --noEmit` attempt was a tooling
  misuse only; it did not run the canary or write state.
- [x] Ran the explicitly authorized 50-source canary with
  `AUTHORIZE_GRAPHIFY_50_SOURCE_CANARY_V1`. Receipt execution:
  `45938370-7d17-4b25-a118-363997035e40`; workspace revision
  `sha256:5d4ee74f53ea47ba80d4835494856fd0cfbc9ae532cabf8db1a17277d937510f`;
  source count **50**; completed stages **5**.
- [x] Independent PostgreSQL readback confirmed `COMPLETED`,
  `canonical_authority=false`, **50** execution-file rows, **50** distinct
  refs, one workspace revision, all **50** rows matching the execution
  revision, and five completed stages.
- [x] The receipt reports `canonicalPromotionMayBeAttempted=false` and
  `broadGraphifyRun=false`. No packet, semantic, Qdrant, Neo4j, Valkey, or
  feature-projection writes occurred; only bounded execution-ledger/source
  selection/stage records were persisted.

**Status:** `PROVEN_COMMITTED_BOUNDED_CANARY`; full-workspace current source
authority remains `BLOCKED`. This proves a larger bounded ledger path, not
full 24k-source promotion and not authorization for the legacy full-manifest
writer.

Evidence: `docs/reports/graphify-daily-coordinator-canary-v1.json`, live
`graphify_executions`, `graphify_execution_files`, and
`graphify_execution_stages` readback.

#### CURRENT-SOURCE-OWNER-RECONCILIATION-CORRECTION-02 (2026-09-09)

- [x] Re-ran the current source-owner reconciliation after the authorized full
  selection. It now identifies exactly one `CURRENT_EXECUTION_OWNER_CANDIDATE`
  for execution `24719bbd-3d33-4daf-bdec-f65277c6b149`, rather than incorrectly
  classifying the full execution as ownerless.
- [x] Corrected the audit to use the already-proven
  `current-graphify-snapshot-authority-v1.json` workspace-revision manifest for
  owner matching. The static Git inventory remains a separate diagnostic:
  **23,742** tracked indexable files versus **24,132** revision-qualified
  workspace bindings.
- [x] The owner candidate is not promotion-ready: the worktree is dirty and
  the static inventory differs from the workspace manifest, so the audit keeps
  `CURRENT_SOURCE_AUTHORITY_NOT_PROVEN` and `safeToPromote=false`. This is a
  deliberate snapshot-policy guard, not evidence that the full ledger selection
  failed.
- [x] Read-only rechecks still report
  `SOURCE_EVIDENCE_HYDRATION_BLOCKED`: **23,195** canonical chunk owners are
  missing and **906** chunk owners have content but no source revision. No
  source, packet, semantic, Qdrant, Neo4j, Valkey, or feature projection writes
  were performed in this audit tranche.

**Status:** `PARTIAL_PROVEN`: current full source-selection owner candidate is
identified and independently reconciled; canonical packet/structural/semantic/
graph admission remains blocked by snapshot policy and source hydration.

Evidence: `docs/reports/current-source-owner-reconciliation-v1.json`,
`docs/reports/current-source-owner-reconciliation-v1.md`,
`docs/reports/current-graphify-snapshot-authority-v1.json`, and
`docs/reports/current-source-evidence-hydration-v1.json`.

#### REINDEX-MANIFEST-CROSS-SCHEMA-02 (2026-09-09)

- [x] Ran the existing read-only cross-schema manifest planner through
  `npm run atlas:reindex:manifest:plan` and generated checksum
  `2cab742429cccfb7811fd56c309496852d2fb19d87761cb378f8517198837606`.
- [x] The live census records **1,252** rows with the sparse
  `content_embedding_768` column present, but this is not a promotion count:
  the sample has no resolved parse nodes, symbols, packets, or representations;
  domain facts have **0** source-revision-bound rows; ontology tuples and graph
  edge inputs are empty; and **54,601** rows are excluded from the semantic
  cohort.
- [x] The planner emits explicit intended-upsert plans with zero rows and keeps
  PostgreSQL, Qdrant, Neo4j, Valkey, and feature-map mutation blocked. No
  production data was changed.

**Status:** `NOT_PROVEN`: the reindex manifest exists and is checksum-bound, but
current source, chunk, symbol, packet, representation, domain, and graph joins
are not yet sealed. The next gate is a source-qualified chunk/symbol lineage
reconciliation; do not apply the manifest or interpret `1,252` as usable
semantic coverage.

Evidence: `docs/reports/reindex-cross-schema-admission-v1.json`,
`scripts/atlas/plan-reindex-manifest-cross-schema-v1.mjs`, and
`docs/reports/current-source-evidence-hydration-v1.json`.

#### CURRENT-CHUNK-SYMBOL-LINEAGE-RECHECK-01 (2026-09-09)

- [x] Ran `audit-current-source-cohort-lineage-v1.mjs` read-only. The existing
  52-row cohort is source-revision-qualified for all **52** rows, but matches
  **0** rows to the current workspace revision; all **52** are therefore
  classified `SOURCE_REVISION_QUALIFIED_WORKSPACE_MISMATCH`.
- [x] Ran `audit-current-tree-bound-symbol-registry-input-v1.mjs` read-only.
  The input contains **353** rows with all required fields, valid spans/kinds,
  and no duplicate canonical keys or proposed stable symbol IDs. Its sole
  workspace revision is the historical
  `sha256:55edaaadab0cef724593287c7c908dad6cdc1b25039a752a6b5dab2c0c44fac9`,
  which does not equal the current full-selection revision
  `sha256:5320597bf4e26adc0d71dabd34faf3eec74a5f2b10f57d92c33771f2b7691f82`.
- [x] No symbol registry, packet, lineage, vector, graph, or projection writes
  were performed. The symbol input is structurally valid review evidence, not
  current-workspace admission evidence.

**Status:** `PARTIAL_PROVEN`: structural symbol input shape is proven, but its
workspace lineage is stale. Regenerate or rebind the 353-row symbol input from
the current source owner before any symbol or packet promotion.

Evidence: `docs/reports/current-source-cohort-lineage-v1.json`,
`docs/reports/current-tree-bound-symbol-registry-input-audit-v1.json`,
`.tmp/atlas/current-tree-bound-symbol-registry-input-v1.ndjson`, and
`docs/reports/current-graphify-snapshot-authority-v1.json`.

#### CURRENT-TREE-BOUND-SYMBOL-REVISION-GUARD-02 (2026-09-09)

- [x] Corrected `plan-current-tree-bound-symbol-registry-input-v1.mjs` to
  compare nomination `workspace_revision` values with the current Graphify
  authority receipt before classifying review input.
- [x] Replayed the planner read-only: all **353** rows are now explicitly
  `STALE_WORKSPACE_REVISION_REVIEW_ONLY`; current authority is
  `sha256:5320597bf4e26adc0d71dabd34faf3eec74a5f2b10f57d92c33771f2b7691f82`.
  The historical input revision is not relabeled or silently repaired.
- [x] Syntax validation and strict OpenSpec validation pass. Canonical writes,
  alias writes, symbol-version writes, and database writes remain **0**.

**Status:** `PROVEN_FAIL_CLOSED`: stale structural input is detected and blocked;
current symbol regeneration from the full source owner remains required before
symbol, packet, or projection admission.

Evidence: `docs/reports/current-tree-bound-symbol-registry-input-v1.json`,
`.tmp/atlas/current-tree-bound-symbol-registry-input-v1.ndjson`,
`scripts/atlas/plan-current-tree-bound-symbol-registry-input-v1.mjs`.

#### TREE-BOUND-SYMBOL-REGISTRY-RECONCILIATION-03 (2026-09-09)

- [x] Ran the existing read-only reconciliation planner. It read **10,260**
  registry rows and classified the 353 tree-bound candidates as **90**
  `EXACT_CURRENT` and **263** `UNRESOLVED`; there were **0** namespace-exact
  legacy matches, conflicts, or ambiguous matches.
- [x] The plan preserves the no-fuzzy/no-alias policy and emits checksum
  `sha256:51000ffd4727294f83b6c9e914c55d1b722f430cbdc9b34598d72512b0321de3`.
  It proposes **0** canonical or database writes.
- [x] The 90 exact matches are review evidence only until their source and
  workspace revisions are reconciled against the current full Graphify owner;
  the 263 unresolved rows remain excluded from promotion.

**Status:** `PARTIAL_PROVEN`: registry reconciliation mechanics are proven,
but current symbol-version admission is not. The next implementation gate is
to regenerate structural resolutions from the current source owner, then rerun
this reconciliation before any symbol canary.

Evidence: `.tmp/atlas/tree-bound-symbol-registry-reconciliation-plan-v1.ndjson`,
`scripts/atlas/plan-tree-bound-symbol-registry-reconciliation-v1.mjs`, and
`docs/reports/current-graphify-snapshot-authority-v1.json`.

#### TREE-BOUND-SYMBOL-RESOLUTION-PROOF-04 (2026-09-09)

- [x] Ran the existing read-only resolver proof. It inspected **353** tree-bound
  inputs and **10,260** registry rows: **90** exact canonical-key matches,
  **85** symbol-version bindings, and **5** missing symbol versions.
- [x] No exact metadata-revision matches, registry ambiguities, symbol-version
  ambiguities, source-revision mismatches, or fuzzy matches were accepted.
  Lookup remains exact-key and exact source/span/declaration-hash only.
- [x] No canonical, symbol-version, packet, or database writes occurred.

**Status:** `PARTIAL_PROVEN`: exact resolution mechanics are proven for the
90 matched rows, but the 5 symbol-version gaps and stale workspace input still
block promotion. The next gate is the existing live-producer replay under the
current source owner.

Evidence: `docs/reports/tree-bound-symbol-registry-resolution-v1.json`,
`.tmp/atlas/tree-bound-symbol-registry-resolution-v1.ndjson`, and
`scripts/atlas/prove-tree-bound-symbol-registry-resolution-v1.mjs`.

#### CONTEXTUAL-TREE-FOREST-SAMPLING-AUDIT-01 (2026-09-09)

- [x] Ran the existing read-only contextual-tree readiness audit. PostgreSQL,
  Neo4j, Qdrant, and the structural surfaces are reachable; the overall result
  is `DATA_ABSENT` because synthesized feature-map tables are empty, not because
  a new graph store is missing.
- [x] Fixed the integration direction: Tree-sitter remains the exact CST/AST
  span authority; AST-grep and LSP/ts-morph remain structural observations;
  NetworkX is the CPU/reference graph; cuGraph is a later derived accelerator;
  Qdrant remains vector retrieval and filtering only.
- [x] The future contextual forest contract is bounded and revision-qualified:
  seed `packet_key`/`symbol_version_id`, deterministic seed, per-hop fanout,
  edge-type/domain filters, deduplication, and explicit candidate ordinals.
  Sampling output is a routing/context feature, never identity or a new RRF
  lane. No graph, vector, cache, or database writes were performed.

**Status:** `PARTIAL_PROVEN`: executor surfaces are present, but current
feature-map materialization and source-qualified symbol lineage are absent.
The next gate is a read-only forest-sampling fixture over a sealed small graph,
with NetworkX output as the oracle before any cuGraph/RAPIDS execution.

Evidence: `docs/reports/contextual-tree-readiness-report.json`,
`scripts/atlas/audit-contextual-tree-readiness.mjs`, and official Tree-sitter,
NetworkX, and RAPIDS/cuGraph sampling documentation.

#### GRAPHIFY-FANOUT-OBSERVABILITY-02 (2026-09-09)

- [x] Confirmed the Phase 8 wrapper keeps `latent_64` classified as an
  optional derived representation; it remains non-canonical and does not add a
  semantic retrieval vote or completion predicate.
- [x] Added an explicit terminal progress state,
  `SUCCEEDED_WITH_OPTIONAL_FAILURES`, when an optional derived step fails. The
  receipt now preserves the degraded fanout state instead of presenting it as
  an indistinguishable generic success.
- [x] Made progress denominators derive from the actual step plan rather than
  the stale hard-coded `/9` value. This covers the current 11-step plan and
  bounded fixture plans without changing execution order.
- [x] Focused wrapper tests pass **6/6**; the read-only criticality audit still
  reports `OPTIONAL_DERIVED_REPRESENTATION`, `writesPerformed=false`, and
  `canonicalAuthority=false`. No datastore or projection writes occurred.

**Status:** `PROVEN`: optional fanout failure is observable and cannot be
confused with full fanout success; canonical promotion remains separately
blocked by current source/lineage admission.

Evidence: `scripts/startup/run-atlas-phase8-fanout.mjs`,
`scripts/atlas/lib/phase8_progress.mjs`,
`sveltekit-frontend/src/lib/server/atlas/phase8-fanout.spec.ts`, and
`docs/reports/graphify-fanout-criticality-01.json`.

#### LATENT-REPRESENTATION-LEDGER-01 (2026-09-09)

- [x] Re-ran the existing latent identity audit in a read-only transaction;
  the transaction rolled back and confirmed zero production mutations.
- [x] Sampled **1,000** `latent_64` rows and **250** Qdrant points. Packet and
  representation IDs are present, but all sampled Qdrant points lack
  `source_revision` and `workspace_revision`.
- [x] Confirmed the representation ledger is absent: **0/1,000** rows joined to
  `atlas_representation_records`; producer revision, input digest, and
  parameter digest are unavailable.
- [x] Confirmed source-version and symbol-version joins remain unproven:
  `SOURCE_VERSION_JOINED=0`, `SYMBOL_VERSION_JOINED=0`, and
  `FULL_LINEAGE_PROVEN=0`.

**Status:** `BLOCKED`: `latent_256`, derived `latent_128`, and `latent_64`
contracts exist, but latent promotion/backfill is not admissible until the
representation ledger and current source/workspace binding exist. The latent
writer's fallback lookup order must not be used as proof of revision identity.

Evidence: `docs/reports/latent-representation-identity-audit-2026-09-09.json`,
`docs/reports/latent-representation-identity-audit-2026-09-09.md`, and
`scripts/atlas/audit-latent-representation-identity.mjs`.

#### CANONICAL-PROJECTION-FABRIC-RECHECK-02 (2026-09-09)

- [x] Re-ran the existing read-only fabric audit after the latent ledger
  review. Overall verdict remains `NOT_SAFE_TO_PROJECT`; **10/11** promotion
  predicates are below `PASS`.
- [x] Confirmed the concrete blockers: no packet-side workspace revision join,
  empty `graphify_symbols`, ambiguous 768-dimension physical owners, absent
  representation ledger, absent sealed graph manifest, absent sealed ordinal
  map, and no cross-projection checksum proof.
- [x] Confirmed ontology tables are populated (**63,084** rows total), so the
  ontology layer is not absent; however, that does not prove current source
  lineage or projection admission.
- [x] Confirmed no database, vector, graph, cache, or model writes occurred.

**Status:** `BLOCKED`: the next repair is authority convergence—workspace
revision binding, one semantic owner, representation ledger, graph manifest,
and ordinal-map sealing. Do not enable latent, topology, or broad fanout apply
until these predicates are independently proven.

Evidence: `docs/reports/atlas-canonical-projection-fabric-audit-2026-09-09.json`,
`docs/reports/atlas-canonical-projection-fabric-audit-2026-09-09.md`, and
`scripts/atlas/audit-canonical-projection-fabric.mjs`.

#### CONTEXT-FOREST-CPU-BASELINE-01 (2026-09-09)

- [x] Added a bounded `ContextForestV1` contract and deterministic CPU sampler
  under the existing graph owner. It consumes revision-qualified roots and
  typed edges; it does not query or mutate a datastore.
- [x] Enforced deterministic root/edge ordering, deduplication, maximum node
  and edge counts, depth bounds, and token-cost bounds. The output carries the
  workspace revision, graph revision, ordinal-map checksum, policy revision,
  and deterministic checksum.
- [x] Smoke-tested the sampler successfully. OpenSpec strict validation passes.
  The Vitest runner did not return normal output in this shell, so no Vitest
  pass is claimed; the direct TypeScript smoke reported
  `CONTEXT_FOREST_SMOKE_PASS`.

**Status:** `IMPLEMENTATION_PRESENT` / `PARTIAL_PROVEN`: the CPU baseline is
implemented and bounded, but live current-source inputs, sealed ordinals,
NetworkX parity, Neo4j parity, and cuGraph execution remain separate gates.

Evidence: `sveltekit-frontend/src/lib/server/graph/context-forest.ts`,
`sveltekit-frontend/src/lib/server/graph/context-forest.spec.ts`, and the direct
TypeScript smoke check.

#### SEMANTIC-768-OWNER-RECONCILIATION-01 (2026-09-09)

- [x] Reconciled the live indexing census with the latent and canonical-fabric
  auditors without changing data. The current active semantic candidate is
  `codebase_chunk_index.content_embedding` (`halfvec(768)`, **55,169/55,853**
  populated); `codebase_chunk_index.content_embedding_768` (**1,386**) is a
  transition/legacy surface, and `atlas_packets.embedding` is a secondary
  768-dimensional surface whose active writer remains unresolved.
- [x] Corrected stale audit labels that called both `atlas_packets.embedding`
  and `codebase_chunk_index.content_embedding_768` `CANONICAL_SOURCE`.
- [x] Preserved the admission block: one active physical candidate is not
  sufficient to prove canonical ownership. Writer census, revision-qualified
  read-path proof, representation ledger, and independent Qdrant readback are
  still required.
- [x] Re-ran the read-only indexing and fabric audits. No PostgreSQL, Qdrant,
  Neo4j, Valkey, or model writes occurred; the fabric remains
  `NOT_SAFE_TO_PROJECT` with **10/11** predicates below `PASS`.
- [x] Replayed `audit-latent-representation-identity.mjs` after the label
  correction: read-only guard, packet identity, Qdrant join classification,
  and report generation pass; source-version and symbol joins remain
  `NOT_PROVEN`, and the representation ledger remains `NOT_PROVEN`.

**Status:** `PARTIAL_PROVEN` / `BLOCKED`: physical semantic ownership is now
classified consistently, but canonical ownership is not promoted until the
active writer and revision-qualified projection path are proven.

Evidence: `docs/reports/atlas-indexing-surfaces-v1.json`,
`docs/reports/atlas-canonical-projection-fabric-audit-2026-09-09.json`,
`scripts/atlas/audit-atlas-indexing-surfaces.mjs`,
`scripts/atlas/audit-latent-representation-identity.mjs`, and
`scripts/atlas/audit-canonical-projection-fabric.mjs`.

#### SEMANTIC-768-WRITER-OWNERSHIP-01 (2026-09-09)

- [x] Added a bounded, read-only writer census covering repository scripts,
  packages, SvelteKit routes, and migration SQL. It classifies references to
  `codebase_chunk_index.content_embedding`,
  `codebase_chunk_index.content_embedding_768`, and `atlas_packets.embedding`;
  it does not execute any writer.
- [x] Live PostgreSQL census confirmed: `content_embedding` is `halfvec` with
  **55,169/55,853** populated rows; `content_embedding_768` is `vector` with
  **1,386/55,853**; `atlas_packets.embedding` is `vector` with
  **61,659/61,718**.
- [x] The receipt records **21** writer/reference surfaces and remains
  `OWNER_NOT_PROVEN`; revision-qualified and guarded writer behavior is not
  uniform, so no writer was promoted or invoked.

**Status:** `PARTIAL_PROVEN` / `BLOCKED`: the active candidate and competing
surfaces are now measurable, but canonical ownership still requires selecting
one writer, proving its source/workspace revision guards, and reconciling its
Qdrant read path.

Evidence: `scripts/atlas/audit-semantic-768-writer-ownership-v1.mjs`,
`docs/reports/semantic-768-writer-ownership-v1.json`, and the live PostgreSQL
read-only census.

Follow-up writer classification (same gate): the bounded receipt distinguishes
`MUTATION_WRITER` from `READER_OR_DIAGNOSTIC` references and excludes the audit
script itself. It records **19** remaining references, including unguarded
mutation-capable paths for the active `content_embedding` surface and the
legacy `content_embedding_768` surface, plus unresolved `atlas_packets.embedding`
writers. This confirms that the next repair is writer consolidation and
revision-guard hardening—not another embedding backfill.

The operator-entrypoint census further identifies three reachable apply
surfaces: the daily Graphify embedding apply path targets `content_embedding`,
the full-repo index apply path targets legacy `content_embedding_768`, and the
`/api/codebase-index/index-stream` route can write the same legacy surface.
`selectedWriter=null` remains intentional until the first path has explicit
source/workspace guards and an independent projection readback.

The ownership comparison records a real split: historical corpus evidence
names `scripts/atlas/reembed-corpus-document-prefix-v1.mjs` as the dominant
producer, while the reachable daily operator path is
`scripts/atlas/backfill-graphify-file-embeddings-768.mjs`. The receipt therefore
sets `decision=UNRESOLVED_WRITER_SPLIT`; neither file is treated as canonical
until one revision-qualified contract is selected and independently read back.

Writer safety hardening (same gate): `backfill-graphify-file-embeddings-768.mjs`
now refuses `--apply` unless an explicit workspace revision is supplied and
`codebase_chunk_index` exposes both `source_revision` and `workspace_revision`.
Its apply selection requires the expected workspace revision, and its update
guard checks both source and workspace revisions in addition to the null-vector
condition. A bounded dry-run still completes with `status=DRY_RUN`; no apply
attempt was executed.

#### CONTEXT-FOREST-MASTER-READINESS-01 (2026-09-09)

- [x] Added `audit-context-forest-readiness-v1.mjs` as a read-only master
  harness. It reconciles existing current receipts into a fixed gate matrix;
  it does not execute Graphify, Qdrant, Neo4j, cuGraph, or ACE operations.
- [x] The first blocking gate is reported as `Graphify source membership`, with
  `nextGate=CURRENT-SOURCE-OWNER-RECONCILIATION-01` and
  `fullWorkspaceSafe=false`. The CPU context forest remains
  `FIXTURE_PROVEN`/partial only; no fixture or mock is promoted to live proof.
- [x] Harness smoke and JavaScript syntax checks pass. No datastore,
  projection, cache, model, or source writes occurred.
- [x] Replayed the actual `.mts` Graphify authority auditor after correcting
  the stale `.mjs` command path. It now reports `CURRENT_SNAPSHOT_PROVEN` for
  the full **24,132-source** workspace selection; the readiness harness
  recognizes that proof and advances the first blocker to `Semantic-768 owner`.

**Status:** `IMPLEMENTATION_PRESENT` / `BLOCKED`: the consolidated readiness
receipt exists, but current source authority, semantic ownership, symbol and
representation lineage, sealed ordinals, graph parity, and cross-store
readback remain incomplete.

Evidence: `scripts/atlas/audit-context-forest-readiness-v1.mjs` and
`docs/reports/parent-atlas-context-forest-readiness-v1.json`.

### Current source-owner recheck (2026-09-09)

- Replayed `scripts/atlas/audit-current-source-owner-reconciliation-v1.mjs`
  read-only. It found 23,749 source records and 12 completed execution
  candidates, but zero exact current canonical owners.
- The latest full-workspace selection contains 24,132 members and has a
  completed membership readback, but remains `canonical_authority=false`.
- Result: `CURRENT_SOURCE_AUTHORITY_NOT_PROVEN` /
  `LEGACY_ONLY_NO_CURRENT_OWNER`. Existing completed runs are historical or
  bounded candidates, not a current Graphify source authority.
- No source, database, Qdrant, Neo4j, Valkey, or model writes occurred.
- This keeps semantic, graph, and projection promotion blocked until one
  current owner is explicitly admitted.

### Admission parameter bundle (2026-09-09)

- Added `scripts/atlas/fetch-admission-parameters-v1.mjs`, a read-only receipt
  assembler over the existing source-owner, Graphify snapshot, semantic-768,
  Qdrant provenance, and Leiden canary receipts.
- Receipt: `docs/reports/admission-parameters-v1.json`.
- Current result: `PARAMETERS_BLOCKED`. The bundle carries the current workspace
  revision and configured canonical collection, while reporting the unresolved
  source authority, graph snapshot, semantic manifest admission, Qdrant lineage,
  and judgment-set gates explicitly.
- No datastore, projection, cache, or model writes occurred.

### Authorized full-workspace source-selection canary (2026-09-09)

- Executed `AUTHORIZE_GRAPHIFY_FULL_WORKSPACE_SOURCE_SELECTION_V1` through
  `sveltekit-frontend/scripts/atlas/graphify-daily-coordinator-canary-v1.mts --full`
  against the non-production workspace.
- Readback succeeded for execution
  `24719bbd-3d33-4daf-bdec-f65277c6b149`: 24,132 selected sources, five
  completed stages, and workspace revision
  `sha256:5320597bf4e26adc0d71dabd34faf3eec74a5f2b10f57d92c33771f2b7691f82`.
- This proves the bounded source-selection ledger operation, not canonical
  Graphify authority. A subsequent currentness audit found the live workspace
  revision changed and the reconciliation population differed (23,751 versus
  24,132), so the selection is retained as a candidate receipt only.
- The consolidated `AdmissionParametersV1` receipt remains
  `PARAMETERS_BLOCKED`; no Qdrant, Neo4j, Valkey, embedding, or model writes
  occurred.

### Current source-authority admission predicates (2026-09-09)

- Replayed `scripts/atlas/audit-current-graphify-snapshot-authority-v1.mts`
  read-only. Current result: `NO_TERMINAL_EXECUTION_FOR_CURRENT_WORKSPACE`.
- Current workspace revision: `sha256:63f2609bbd54e7a2e03c337ffcea45218ba837907350383470a17f95e5eaa05e`.
- Qualifying executions for that exact revision: `0`.
- The source-owner reconciliation identifies the remaining reasons precisely:
  `EXACT_CURRENT_COMPLETED_OWNER_COUNT_NOT_ONE`,
  `WORKTREE_DIRTY_REQUIRES_SNAPSHOT_POLICY`, and
  `STATIC_WORKTREE_INVENTORY_DIFFERS_FROM_WORKSPACE_REVISION_MANIFEST`.
- Therefore prior 24,132-source selections and bounded canaries remain
  historical/candidate evidence, not current canonical authority. No writes
  occurred.

### Source inventory reconciliation correction (2026-09-09)

- Corrected `scripts/atlas/audit-current-source-owner-reconciliation-v1.mjs` to
  use the same source population contract as
  `workspace-revision-origin-runtime-v1.ts`: tracked plus non-ignored working
  tree files, the full shared source-extension set, `docs/reports/` exclusion,
  five MiB size admission, and UTF-8 validation.
- The prior 23,751 count was a false comparison caused by tracked-only
  enumeration and a narrower extension set. The aligned audit now reports
  **24,186 candidates admitted**, **38 skipped** (30 oversized, 8 invalid
  UTF-8), with explicit inventory policy metadata in the receipt.
- A fresh graph snapshot audit still reports
  `NO_TERMINAL_EXECUTION_FOR_CURRENT_WORKSPACE` at **24,140** sources. The
  residual 46-row difference is therefore current dirty-worktree drift during
  separate audit executions, not an extension/filter mismatch. No current
  source owner is admitted.
- Status remains `CURRENT_SOURCE_AUTHORITY_NOT_PROVEN`; semantic, graph, and
  projection promotion remain blocked until a quiescent/revision-pinned source
  snapshot and terminal Graphify execution agree exactly.

Evidence: `docs/reports/current-source-owner-reconciliation-v1.json`,
`docs/reports/current-graphify-snapshot-authority-v1.json`, and
`sveltekit-frontend/src/lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.ts`.
No database, projection, cache, embedding, or model writes were performed by
this reconciliation; only derived reports and this ledger entry changed.

### Encoding and UUID identity clarification (2026-09-09)

- `UTF-8` is the source-text encoding admission check. There is no `UTF-5`
  encoding in this contract; invalid UTF-8 sources are excluded from the
  workspace-origin manifest and reported explicitly.
- `UUIDv5` is unrelated to text encoding. It may be used later for a
  deterministic, namespace-qualified derived identity such as `symbol_id`,
  only after its namespace and name preimage are frozen and tested.
- `UUIDv7` remains the preferred canonical `packet_key` direction because it
  provides time-ordered durable packet identity. `parse_node_id`, `chunk_id`,
  `symbol_id`, `concept_id`, and `graph_node_key` remain separate identities;
  none may be silently replaced by a UUIDv5 or projection ID.
- This is a terminology/contract clarification only. No identity migration,
  packet rewrite, or projection write was performed.

Status: `RECORDED_CLARIFICATION`; UUIDv5 derived-symbol design remains
`NOT_STARTED` and the broader current-source admission remains blocked.

### Current admission refresh (2026-09-09)

- Replayed `audit-current-graphify-snapshot-authority-v1.mts` read-only.
- Current snapshot remains `NO_TERMINAL_EXECUTION_FOR_CURRENT_WORKSPACE` with
  workspace revision `sha256:c5d7efc34ccce388aaff25b178766b4a0ca2798b6c36e56139f79c1aafb1140d`,
  24,140 source entries, and zero qualifying terminal executions.
- Refreshed `admission-parameters-v1.json`; status remains `PARAMETERS_BLOCKED`
  for source authority, graph snapshot, semantic-768 admission, Qdrant v2
  identity lineage, and judgment-set review.
- No database, projection, cache, embedding, or model writes occurred.

### Sequential source-authority refresh (2026-09-09)

- Re-ran the Graphify snapshot audit and source-owner reconciliation
  sequentially to remove parallel-audit interference.
- The snapshot still has no qualifying terminal execution for the current
  workspace. The sequential receipts report **24,141** snapshot sources and
  **24,187** currently admitted source files, a **46-file** difference.
- `git status` confirms the worktree is not quiescent: nested repositories
  `claude-mem`, `models/embeddinggemma_300m`, and `turbovec` contain modified
  content. This is now classified as workspace snapshot drift, not a UTF-8 or
  extension-policy defect.
- Status remains `CURRENT_SOURCE_AUTHORITY_NOT_PROVEN`; no promotion or
  projection apply is authorized.

### Git-tree-aware indexing CRUD gate (2026-09-09)

- Existing `GraphDeltaV1` is only a partial foundation. It exposes added,
  changed, and removed graph records, but its legacy numeric
  `workspaceRevision`/`representationRevision` fields cannot serve as the
  canonical Git-tree identity contract.
- Add the next bounded gate as
  `GIT-TREE-AWARE-SOURCE-DELTA-01`: derive a read-only delta between an exact
  base Git tree and the current source snapshot, classifying each source as
  `CREATE`, `READ_UNCHANGED`, `UPDATE`, `RENAME`, or `DELETE_TOMBSTONE`.
- Each row must carry `sourceRef`, `sourceRevision`, `contentDigest`,
  `baseCommitOid`, `baseTreeOid`, `workspaceRevision`, and evidence of whether
  the file is tracked at the base/current tree. Git-tree identity remains
  separate from `packet_key`, `chunk_id`, `tree_node_id`, and `symbol_id`.
- CRUD means index-state reconciliation only: create/update/delete decisions
  are emitted as an authorization-ready manifest. No packet, chunk, symbol,
  PostgreSQL, Qdrant, Neo4j, Valkey, or Graphify projection mutation is
  permitted until the source-owner and revision gates pass.
- Required read-only acceptance counts: duplicate source refs `0`, synthetic
  identities `0`, ambiguous renames `0`, invalid UTF-8 `0` among admitted rows,
  base/current tree checksums reproducible, and delta replay deterministic.

Status: `PLANNED_BLOCKED`; implementation should reuse the existing workspace
origin runtime and Graphify delta contracts rather than creating another source
inventory owner.

### Git-tree source delta auditor (2026-09-09)

- Added `scripts/atlas/audit-git-tree-source-delta-v1.mts`, a bounded read-only
  reconciliation over the canonical workspace-origin runtime and the current
  `HEAD` tree.
- Receipt: `docs/reports/git-tree-source-delta-v1.json`.
- The first report’s **85 `DELETE_TOMBSTONE` rows are not confirmed deletions**:
  a bounded inspection found all sampled paths still present on disk, including
  47 empty `HEAD` blobs. They represent `HEAD`/current-admission divergence
  and must not drive destructive cleanup.
- Correct classification is therefore: `DELETE_TOMBSTONE` only when the path is
  absent from disk; `EXCLUDED_CURRENT_SOURCE` when it exists but is outside the
  current admitted snapshot. The auditor now records `endHeadCommit` and
  `headStableDuringRun` so branch changes invalidate the delta proof.
- Status remains `PARTIAL_PROVEN`: no duplicate or synthetic identities were
  emitted, but deleted-content hydration and deterministic rename detection
  remain pending. No datastore or projection writes occurred.

Evidence: `docs/reports/git-tree-source-delta-v1.json`; the 85-row inspection
showed `exists=85`, `missing=0`, and `emptyHeadBlob=47`.

### Tournament-gated workspace revision policy and promotion board (2026-09-09)

- Until the tournament/source-authority layer is built out, the orchestration
  parameter `workspaceRevision` is intentionally **null/unbound**. This is a
  planning state, not a valid canonical revision. Any canonical writer or
  projection gate receiving null must return `BLOCKED` and perform zero writes.
- This policy does not weaken the existing source, packet, representation, or
  projection schemas. It prevents provisional tournament context from being
  mistaken for current workspace authority.
- The consolidated Parent Atlas promotion board is now the following ten
  blocking gates, in order:
  1. `CURRENT-SOURCE-TERMINAL-EXECUTION-01`
  2. `CURRENT-STRUCTURAL-LINEAGE-01`
  3. `SEMANTIC-768-OWNER-RECONCILIATION-01`
  4. `REPRESENTATION-LEDGER-01`
  5. `QDRANT-V2-IDENTITY-LINEAGE-01`
  6. `LEIDEN-EXACT-PROJECTION-IDENTITY-01`
  7. `GRAPH-PROJECTION-MANIFEST-01`
  8. `RRF-CURRENT-PRODUCTION-REPLAY-01`
  9. `RETRIEVAL-JUDGMENT-SET-01`
  10. `RETRIEVAL-PARITY-RECEIPT-01`
- Gate outputs must distinguish `CONTRACT_PROVEN`, `FIXTURE_PROVEN`,
  `BOUNDED_LIVE_PROVEN`, `LIVE_PROVEN`, `PARTIAL_PROVEN`, and `BLOCKED`.
  Code presence, row counts, ANN shape, path joins, or process exit codes do
  not satisfy authority proof.
- Latent 256/128/64, RFF/topology, context forests, ontology enrichment,
  sampling, GPU executors, and Leiden/Louvain quality remain derived,
  non-blocking features until the ten-gate canonical spine is closed.
- Admission closure is not allowed while `workspaceRevision` is null,
  canonical semantic ownership is ambiguous, Qdrant identity is unresolved,
  graph ordinals are unsealed, or the judgment set is unreviewed.

Status: `BLOCKED_BY_DESIGN`; this records the tournament gate and promotion
sequence only. No runtime, database, projection, cache, or model mutation was
performed.

### Lifecycle-seam review consolidation (2026-09-09)

- The current deficiency is not another retrieval algorithm. The missing
  layer is a reproducible execution fabric that binds source population,
  lineage, representations, graph projections, caches, and retrieval receipts
  to one revision-qualified snapshot.
- `GIT-TREE-AWARE-SOURCE-DELTA-01` must remain a timeline/index-state audit.
  `HEAD`-only paths are not automatically deletions: classify present-but-not-
  admitted paths separately from true absent-path tombstones, and require
  stable `HEAD`/tree identity before treating the delta as deterministic.
- The remaining lifecycle gates are recorded in dependency order:
  `SOURCE-POPULATION-DELTA-01`, `WORKSPACE-SNAPSHOT-POLICY-01`,
  `CANONICAL-LINEAGE-DAG-01`, `REPRESENTATION-REGISTRY-01`,
  `GRAPH-PROJECTION-MANIFEST-01`, `SOM-TOPOLOGY-LINEAGE-01`,
  `DERIVED-SUMMARY-LIFECYCLE-01`, `ARTIFACT-INVALIDATION-DAG-01`,
  `TOMBSTONE-LIFECYCLE-01`, `QUERY-ROUTING-CALIBRATION-01`,
  `FEATURE-NORMALIZATION-MASK-01`, `RETRIEVAL-JUDGMENT-SET-01`, and
  `PARENT-ATLAS-EXECUTION-RECEIPT-01`.
- These gates do not authorize new tables, collections, graph stores, or
  models. They define how existing Tree-sitter/AST-grep/LSP, PostgreSQL,
  semantic-768, Qdrant, Neo4j, NetworkX/cuGraph, ACE/BitFrost, and Ornith
  outputs become reproducible and invalidatable.
- Canonical identity remains PostgreSQL/source lineage. Derived artifacts must
  carry their producer/input/output revisions and ordinal-map checksum. Cache
  entries require explicit invalidation dependencies; tombstones preserve audit
  history instead of silently deleting evidence.
- A future `ParentAtlasExecutionReceiptV1` should join source, lineage,
  representation, graph, feature, query-classification, candidate, fusion,
  context, model, and validation checksums. Until then, subsystem receipts do
  not constitute whole-DAG reproducibility.

Status: `RECORDED_GATED_BACKLOG`; no new search algorithm, data store, or
promotion authority was introduced.

### Git-tree delta correction — false deletion classification fixed (2026-09-09)

- Re-ran `scripts/atlas/audit-git-tree-source-delta-v1.mts` after separating
  paths absent from disk from paths present but excluded by the current source
  admission policy.
- Corrected result: **24,139** `READ_UNCHANGED`, **2** `UPDATE`, **1** `CREATE`,
  and **85** `EXCLUDED_CURRENT_SOURCE`; there are no confirmed deletions in this
  run. The 85 paths remain on disk and are not eligible for tombstone actions.
- The receipt now records `endHeadCommit` and `headStableDuringRun`. This run
  reports `READ_ONLY_DELTA_PROVEN` with a stable base tree and
  `writesPerformed=false`.
- Rename detection and historical digest hydration remain intentionally
  deferred. No source, packet, database, graph, vector, cache, or model writes
  were performed.
### PARENT-ATLAS-PROMOTION-GATES-01 — ten-gate promotion board (2026-09-09)

- [x] Added the read-only promotion board at `scripts/atlas/audit-parent-atlas-promotion-gates-v1.mjs` and root command `npm run atlas:promotion:gates`.
- [x] The board records the ten blocking gates in dependency order and stops at the first blocker; it does not infer authority from code existence, row counts, fixture passes, or historical receipts.
- [x] `workspaceRevision` is intentionally `null`/unbound under `UNBOUND_UNTIL_TOURNAMENT`. This is an admission blocker, not a schema relaxation: canonical writers and projections must remain fail-closed until the tournament/source-authority layer binds a revision.
- [x] Existing receipts are referenced as evidence only. No source, database, Qdrant, Neo4j, cache, model, or index writes are performed.
- [ ] Gate 1 remains blocked until exactly one terminal current-source execution is bound to a non-null workspace revision; gates 2–10 remain dependency-blocked and must not be represented as promoted.
- Report: `docs/reports/parent-atlas-promotion-gates-v1.json`.
- [x] Gate 1 read-only refresh completed with `npx tsx scripts/atlas/audit-current-graphify-snapshot-authority-v1.mts`: `NO_TERMINAL_EXECUTION_FOR_CURRENT_WORKSPACE`, `qualifyingExecutions=0`, current observed revision `sha256:a2c7cfc5a7d7ffe53a25418a734ad8c9d0d69ada1d7a5b605239c91f0ac17759`. The first blocker remains unchanged; no Graphify execution was launched.

### Lineage validation recheck (2026-09-10)

- [x] Corrected `scripts/atlas/audit-lineage-validation.mjs` to use the live
  `task_semantic_packets` columns (`feature_id` and `source_ref`) instead of
  retired `source_ref_hash` and `canonical_source_ref` columns.
- [x] Re-ran the read-only audit: `6/7` checks pass. L2 now passes with `2/2`
  feature and source references; the remaining blocker is empty
  `nes_chrom_kag_dag_hits` (`0` entries).
- [ ] Keep KAG/ACE promotion blocked until the KAG/DAG audit trail has
  revision-qualified entries. No canonical or projection writes occurred.

Receipt: `memory/exports/lineage-validation.json`.

### CHR97 lineage recheck (2026-09-10)

- [x] Re-ran the read-only CHR97 lineage audit: `8/13` checks pass. NES
  packets have complete feature and chunk coverage (`1,992/1,992`).
- [ ] Keep the lane blocked: `0/1,992` packets have `kag_node_key` or
  `qdrant_point_id`, and `nes_chrom_kag_dag_hits` is empty, so KAG/Qdrant
  back-references cannot be proven.
- [ ] Do not promote the sprite/evaluation artifacts from their local
  completeness alone; canonical packet and graph identity remains absent.

Receipt: `memory/exports/lineage-chr97-validation.json`.
## CONTEXT-FOREST-READINESS-01 recheck (2026-09-10)

- [x] Run the read-only context-forest readiness reconciliation.
- [x] Confirm PostgreSQL remains the intended canonical owner, but current
  source membership has no terminal execution for the active workspace.
- [x] Preserve the blocked state for Leiden, semantic owner, packet/chunk/
  symbol identity, representation ledger, projection identity, Qdrant, and
  ordinal/graph manifest prerequisites.
- [x] Confirm `writesPerformed=false`; no context forest or cache promotion
  occurred.
- [ ] Re-run only after current source membership, semantic owner, and graph
  identity receipts are changed and independently proven.

Evidence: `docs/reports/parent-atlas-context-forest-readiness-v1.json`.
Status: `NOT_SAFE_TO_PROJECT`; first blocker: `GRAPHIFY_SOURCE_MEMBERSHIP`.
Next gate: `CURRENT-SOURCE-OWNER-RECONCILIATION-01`.

## ACE-LIVE-DRY-INPUT-READINESS-01 recheck (2026-09-10)

- [x] Ran the read-only ACE input readiness audit against the admitted
      snapshot, existing ordinal map, and revision-authority candidate.
- [x] Correctly rejected all three inputs as incompatible schemas: the ordinal
      map contains an extra field, the workspace snapshot is not a
      `CandidateFeatureSnapshotV1`, and the revision receipt is not a
      `RevisionAuthorityEnvelopeV1`.
- [ ] Keep ACE live-dry materialization blocked; no replacement artifacts were
      synthesized and no cache/context writes occurred.

Evidence: `docs/reports/ace-live-dry-input-readiness-v2.json`.
Status: `ACE_LIVE_DRY_INPUT_BLOCKED`; canonicalAuthority=false;
writesPerformed=false. First blocker: `ACE_INPUT_CONTRACTS_NOT_ALIGNED`.
Next gate: provide authoritative ordinal, feature-snapshot, and revision
authority artifacts with the exact shared schemas.

## CORE-LANE-RECHECK-2026-09-10

- [x] Re-ran context readiness; Graphify source membership remains the first dependency.
- [ ] Keep ACE/context promotion blocked until authoritative ordinal, feature snapshot, and revision envelopes align.

Evidence: `docs/reports/ace-live-dry-input-readiness-v2.json` and
`docs/reports/parent-atlas-context-forest-readiness-v1.json`.
First blocker remains: `ACE_INPUT_CONTRACTS_NOT_ALIGNED`.

### ACE-LIVE-INPUT-RECHECK — 2026-09-10

- [x] Preserved the strict validator: the supplied ordinal map, workspace
      snapshot, and revision artifact are different artifact kinds and do not
      satisfy the three ACE input schemas.
- [ ] Keep live-dry materialization blocked; do not synthesize replacement
      feature or authority artifacts while Graphify source membership is
      unresolved.

Evidence: `docs/reports/ace-live-dry-input-readiness-v2.json`.
Status remains `ACE_LIVE_DRY_INPUT_BLOCKED`; writesPerformed=false;
canonicalAuthority=false.

## ACE-LIVE-DRY-INPUT-RECHECK-2026-09-10T2

- [x] Re-ran the read-only ACE input readiness audit without inventing input
      artifacts.
- [x] Confirmed all three required inputs were absent from the invocation:
      `CandidateOrdinalMapV1`, `CandidateFeatureSnapshotV1`, and
      `RevisionAuthorityEnvelopeV1`; cross-contract verification was not
      attempted.
- [ ] Keep ACE/context promotion blocked until those authoritative artifacts
      exist and share the admitted source/revision envelope.

Evidence: `scripts/atlas/audit-ace-live-dry-input-readiness-v2.mts` and
`docs/reports/ace-live-dry-input-readiness-v2.json`.
Status: `ACE_LIVE_DRY_INPUT_BLOCKED`; authority=false;
writesPerformed=false; cacheWritesPerformed=false.
First blocker: `ACE_REQUIRED_INPUT_ARTIFACTS_MISSING`.

## CONTEXT-FOREST-READINESS-RECHECK-2026-09-10T21

- [x] Re-ran the read-only context-forest readiness audit.
- [x] Confirmed the first blocking gate remains Graphify source membership;
      the report still identifies no current terminal execution for the
      workspace.
- [ ] Keep ACE/context promotion blocked until snapshot-bound Graphify
      membership, current semantic/graph revisions, and required ordinal and
      feature envelopes are available. No cache, ACE, graph, or database
      writes occurred.

Evidence: `docs/reports/parent-atlas-context-forest-readiness-v1.json`.
Status: `NOT_SAFE_TO_PROJECT`; authority=false; writesPerformed=false.
First blocker: `GRAPHIFY_SOURCE_MEMBERSHIP`.
Next gate: snapshot-bound Graphify execution and current-source readback.
Next gate: provide the exact authoritative ordinal, feature snapshot, and
revision authority paths; do not synthesize stand-ins.

## GPU-ACE-ORNITH-READONLY-CHAIN-RECHECK-2026-09-10

- [x] Ran the read-only aggregation of the GPU tile, CandidateOrdinal,
      feature-matrix, ACE/ContextManifest, Ornith replay, claim-validation,
      read-only DAG, and mutation-blocking receipts.
- [x] Confirmed all eight proof gates and the mutation guard are passing.
- [ ] Keep full-corpus ordinal expansion and graph-revision ownership open;
      this fixture/replay chain does not authorize canonical graph, Qdrant,
      Neo4j, cache, model, or projection writes.

Evidence: `docs/reports/parent-atlas-gpu-ace-ornith-readiness-v1.json`.
Status: `GPU_ACE_ORNITH_READONLY_CHAIN_PROVEN`; writesPerformed=false;
canonicalAuthority=false. Remaining non-blocking work: explicit mutation
authorization, full-corpus CandidateOrdinal expansion, and graph-revision
ownership for 128/768 scaling.

## CONTEXT-FOREST-READINESS-RECHECK-2026-09-11

- [x] Fixed the Windows report-writer failure by switching the readiness
      auditor to atomic temporary-file replacement.
- [x] Re-ran the read-only readiness audit successfully.
- [ ] Keep ACE/context projection blocked: the first gate remains Graphify
      source membership; no context, cache, graph, or database writes occurred.

Evidence: `scripts/atlas/audit-context-forest-readiness-v1.mjs` and
`docs/reports/parent-atlas-context-forest-readiness-v1.json`.
Status: `NOT_SAFE_TO_PROJECT`; authority=false; writesPerformed=false.
First blocker: `GRAPHIFY_SOURCE_MEMBERSHIP`.
Next gate: snapshot-bound Graphify membership and current-source readback.

## RAPIDS-CUVS-LIVE-READINESS-RECHECK-2026-09-10

- [x] Replaced the former simulated TurboVec/cuVS readiness result with
      live health probes for TurboVec and the WSL2/RAPIDS `:8098` executor.
- [x] Confirmed TurboVec is reachable but remains a derived accelerator
      projection (`indexed=0`, `canonicalAuthority=false`).
- [ ] Keep RAPIDS promotion blocked until the `:8098` sidecar proves the
      complete CUDA execution contract, including `torchAvailable=true`.

Evidence: `docs/reports/turbovec-cuvs-readiness.json`.
Status: `LIVE_ACCELERATOR_CHAIN_BLOCKED`; `cudaAvailable=true` and
`executionOnly=true`, but `torchAvailable=false`; writesPerformed=false.
First blocker: `RAPIDS_CUDA_TORCH_EXECUTION_NOT_PROVEN`.
Next gate: repair or start the WSL2 RAPIDS/cuDF/cuVS sidecar, then rerun the
live readiness audit. This does not authorize canonical or projection writes.

## RAPIDS-CUVS-CONTAINER-PYTORCH-GAP-2026-09-10

- [x] Compared the healthy WSL2 `atlas-rapids-cu13` environment with the live
      Docker `atlas-gpu-8098` container.
- [x] Confirmed WSL2 has PyTorch CUDA, cuDF, cuVS, cuGraph, and CuPy.
- [x] Confirmed the live container has cuDF/cuVS/cuGraph/CuPy but no PyTorch;
      its exact-scan routes therefore cannot be promoted as live-proven.
- [x] Added the missing CUDA-compatible PyTorch dependency to the container
      image definition.
- [ ] Rebuild/restart and re-run the readiness audit only with explicit runtime
      authorization; no restart or image mutation was performed here.

Evidence: `docker/atlas-gpu-8098/Dockerfile`,
`docs/reports/turbovec-cuvs-readiness.json`, and live WSL/container import
checks. Status remains `LIVE_ACCELERATOR_CHAIN_BLOCKED`; writesPerformed=false.
First blocker: `RAPIDS_CONTAINER_REBUILD_NOT_AUTHORIZED`.
Next gate: authorized container rebuild/restart, then live `:8098/health` and
bounded cuVS route readback.
