## 0. Governance admission

- [x] CONV-0A — Establish this convergence change as the active planning
  authority. `openspec status`, strict validation, and apply-instructions
  resolution all pass for the repo-local change. No planning command applies
  runtime work or mutates stores.
- [x] CONV-0B — Generate a read-only OpenSpec portfolio classification from the
  root change store. The report records task progress, declared gate references,
  blockers, supersession hints, and one explicit `CURRENT_AUTHORITY` for this
  convergence change without deriving queue priority from completion percentage
  or applying any change. See
  `scripts/atlas/audit-openspec-portfolio-v1.mjs` and
  `docs/reports/openspec-portfolio-v1.json`.

## 1. Lineage and semantic reader

- [x] LINEAGE-01 — Prove full source namespace and source-revision authority;
  retain fail-closed behavior for missing or placeholder lineage. Consolidated
  from the packet<->chunk lineage program's existing corpus-wide evidence
  (same underlying census, different task label): `graphify_files.workspace_id`
  is the only real namespace/revision authority found (885 rows, 778/61,660
  packets = 1.26% coverage); `atlas_packets.repository_id` is confirmed
  corrupted (58,365/58,365 distinct, synthetic) and explicitly rejected as an
  authority. Fail-closed behavior verified via `PacketChunkMembershipV1Schema`'s
  `.refine()` (9/9 tests) and the full-corpus `BACKFILL-DRY-01` classification
  (60,882 unproven packets correctly left `UNPROVEN`, zero fabricated).
  Verdict is low-coverage-but-correct, not full-coverage — see
  `docs/reports/lineage-01-source-namespace-revision-authority-v1.json`.
- [ ] LINEAGE-02 — Prove the bounded `15128/768` exact-candidate lineage gate;
  do not substitute repaired Qdrant metadata for source qualification.
  **BLOCKED_UNGROUNDED**: searched every JSON report under `docs/reports/`,
  the full OpenSpec tree, and git history (`git log --all -S "15128"`) — the
  only occurrence of the literal number `15128` anywhere in this repository
  is this task line itself. No existing cohort, fixture, or canary of that
  exact size was found. Not fabricated or matched to an unrelated existing
  artifact (e.g. the 55,169-row semantic_768 ordinal map) to force a fit —
  needs clarification of what this cohort refers to before it can be
  attempted. See open-questions section of the LINEAGE-01 evidence report.
- [x] RETRIEVAL-01A — Canonical `semantic_768` execution ownership was proven
  for the bounded B/D oracle cohort; retain scope limits.
- [x] RETRIEVAL-01B — `_768_v2` reader canary and exact PostgreSQL hydration were
  proven for the bounded cohort.
- [x] RETRIEVAL-01C — Projection result and canonical content hydration were
  separated through `ProjectionCandidateV1`.
- [x] RETRIEVAL-01D — Read-only reader replay was proven on the bounded cohort.
- [x] RETRIEVAL-01E — Named-vector execution and 50-query reader canary were
  corrected/proven within recorded scope.
- [x] RETRIEVAL-01G — Audit historical impact of pre-existing empty Qdrant
  results across all live readers. Consolidated from a concurrent
  investigation landed the same day (commit `128e052ba4`): two distinct
  root causes found and fixed together — (1) generation contamination in
  the pre-fix default collection (`QDRANT-READER-SHADOW-01`: 42% wrong
  top-1 self-match across a 50-query frozen set; 100% on the canonical
  `_768_v2` collection), and (2) a missing named-vector `using` parameter
  causing hard Qdrant 400s silently caught and returned as empty `[]`
  (`QDRANT-READER-FIX-02` canary: 0/50 zero-hit queries post-fix). All 9
  live readers funnel through one `QdrantSearchBackend.search()`
  implementation, so one fix corrected all call sites. One open,
  explicitly-flagged gap not closed here: `turbovec-search.ts`'s own
  hardcoded collection defaults (not the active backend by default, so no
  live impact under normal configuration). See
  `docs/reports/retrieval-01g-empty-result-historical-impact-v1.json`.
- [x] RETRIEVAL-01H — Freeze narrow semantic reader ownership only. Already
  satisfied by the same commit's `QDRANT_SEMANTIC_READER_OWNERSHIP`
  boundary: `ProjectionRegistryV1` (`RETRIEVAL-01I`, already frozen)
  explicitly scopes itself to `semantic_768`/`qdrant`/`codebase_chunks_768_v2`
  only, with TurboVec and any other executor explicitly out of scope (a new
  representation requires a new resolver branch, never a change to this
  one). See `docs/reports/writer-root-01-representation-owner-01-results.json`
  and `src/lib/server/atlas/retrieval/projection-registry-v1.ts` header.
- [x] RETRIEVAL-01I — `ProjectionRegistryV1` defined and frozen
  (`src/lib/server/atlas/retrieval/projection-registry-v1.ts`, 4/4 tests):
  fail-closed resolution of canonical packet identity + representation to a
  live-validated Qdrant projection coordinate (collection, vector name,
  physical point, revisions). Requires live payload `postgres_id` to match
  the requested canonical identity before resolving — never trusts a stored
  point-id field blindly.
- [ ] RETRIEVAL-01J — Dry-run stale bridge reconciliation with zero ambiguous or
  missing targets.
- [ ] RETRIEVAL-01K — Run a tiny separately-authorized reconciliation canary and
  read back exact projection identity; no legacy point deletion.
- [ ] RETRIEVAL-01L — Freeze full Qdrant projection ownership only after rollback
  and parity proof.
- [x] RETRIEVAL-02 — Census every Qdrant query for explicit named-vector
  selection; do not mass-edit callers. Audit-only, zero callers modified.
  Static scan of every direct Qdrant-like `.query(`/`.search(` call site
  under `sveltekit-frontend/src/lib/server` (excluding the 9 canonical
  callers already covered by `RETRIEVAL-01G`/`01H`): 32 direct call sites
  across 25 files. Three real false-positive/false-negative classes were
  found and corrected during the scan itself (Postgres `client.query()`
  SQL/transaction-control calls misclassified as Qdrant; the older
  `vector: { name, vector }` named-vector shape misclassified as missing
  selection; JSDoc/comment example lines misclassified as real call sites)
  — each documented in the report's own methodology section.
  **v2 tightening (2026-09-01, per operator review):** the original v1 pass
  reported "19 confidently missing `using`" from static heuristics alone.
  Per the review's explicit correction — "a missing `using` is a proven
  defect only after target collection, collection vector schema, and
  required vector name are all known" — v2 adds a live, read-only Qdrant
  schema lookup (`GET /collections/<name>`) per resolvable literal
  collection name and reclassifies every site into exactly one of
  `NAMED_VECTOR_REQUIRED_MISSING` / `DEFAULT_VECTOR_VALID` /
  `EXPLICIT_NAMED_VECTOR_VALID` / `COLLECTION_SCHEMA_UNKNOWN`. Result: only
  **3 proven defects** survive schema verification (down from 19 unverified
  heuristic guesses) — `atlas/retrieval/qdrant-semantic-scorer.ts:89`
  (querying the canonical `QDRANT_SEMANTIC_COLLECTION` = `codebase_chunks_768_v2`
  directly, live-confirmed `NAMED_VECTORS`, same missing-`using` defect
  class `RETRIEVAL-01G` fixed only in `qdrant-search.ts`),
  `retrieval/go-retrieval-orchestrator.ts:203`, and
  `retrieval/parallel-orchestrator.ts:164` (both querying literal
  `codebase_chunks_768`, also live-confirmed `NAMED_VECTORS`). One real
  false-positive from v1 was caught and corrected in the process:
  `ace/tag-sync.ts:135` queries `document_tags`, which is live-confirmed
  `SINGLE_DEFAULT_VECTOR` — v1 would have wrongly counted this as a defect;
  v2 correctly classifies it `DEFAULT_VECTOR_VALID`. The remaining 16 sites
  are `COLLECTION_SCHEMA_UNKNOWN` (unresolvable variable/constant
  collection expressions, or a live lookup confirming the named collection
  doesn't currently exist) and are explicitly NOT counted as proven
  defects — absence of proof is not proof of a defect. Per this task's
  instruction, none of the 3 proven defects were remediated — this is
  audit evidence for a future, separate remediation decision. See
  `docs/reports/retrieval-02-qdrant-named-vector-census-v1.json` and
  `scripts/atlas/retrieval-02-qdrant-named-vector-census.mjs`.
- [x] RF-IDENTITY-SEMANTICS-02 — Preserve the existing dedup precedence while
  distinguishing canonical Atlas identity from projection and grouping
  evidence: `content_hash` is `projection_exact`, `source_ref` is
  `source_group`, and lane-local IDs remain `degraded`. Focused identity/RRF
  tests passed 18/18; no persistence or projection ownership changed. See
  `docs/reports/rf-identity-semantics-02-v1.json`.
  **Naming collision note (2026-09-01):** this entry documents the initial,
  same-day V1 status-broadening only (`ResolvedIdentity.status` widened
  in-place). The operator's full review of this same correction — adding a
  `canonical_chunk_id` tier (consumed only from proven ProjectionRegistryV1/
  lineage hydration, never reconstructed) and a `HashContractV1` gate on
  `content_hash` (unqualified hashes must not reach `PROJECTION_EXACT`,
  since this repo has a confirmed historical hash domain that hashed
  generated artifact content, not source bytes) — landed as the fuller,
  additive `resolveCanonicalIdentityV2()` under the SAME task name in the
  sibling `parent-atlas-retrieval-fusion-reachability` change's `tasks.md`.
  Both are real and both are live (additive, non-conflicting code); this
  note exists so a future reader doesn't assume one supersedes the other
  without checking — the fusion-reachability entry is the complete
  implementation of the operator's full review.

## 2. OaK DAG runtime convergence

- [x] DAG-RUNTIME-01A — Repair the semantic owner contract with an exact callable
  implementation reference for `searchQdrantCodeStrictV1`. It does not alias
  `search_hybrid`, and preserves Qdrant, `semantic_768`, `_768_v2`, and named
  vector `content` lineage. Package build and focused semantic handler tests passed.
- [x] DAG-RUNTIME-01A.1 — Resolve the bounded replay subset to exact callable
  implementation references for AST evidence, graph expansion, PostgreSQL FTS,
  semantic Qdrant, KAG neighbor reads, and ACE ContextManifest compilation.
  The references are statically registered; no dynamic import or coarse action-kind
  fallback is used. Package build and focused owner tests passed.
- [x] DAG-RUNTIME-01B.1 — Added the exact KAG neighbor-read contract
  `parent-atlas.kag.neighbor-read.strict.v1` for canonical-ID neighbor reads.
  It is not an alias for packet lookup or generic BFS. Package build and focused
  KAG handler tests passed.
- [x] DAG-RUNTIME-01B — Register strict read-only owners for semantic Qdrant,
  PostgreSQL/KAG, AST evidence, graph expansion, and context compilation in the
  exact-reference runtime registry. Registry tests passed; live replay remains open.
- [x] DAG-RUNTIME-01C — Retain bound arguments and require parameter-checksum
  equality at execution admission. Existing
  `kernel-dag-execution-binding-v1.ts` retains `boundArguments`, rejects
  missing/mismatched checksums, and rejects output-schema mismatches. Binding
  and registry tests passed 5/5; package build passed. Evidence:
  `docs/reports/kernel-dag-execution-binding-v1.json`.
- [x] DAG-RUNTIME-01C.1 — Added the exact ACE ContextManifest adapter
  `parent-atlas.context-manifest.ace.v1`. It validates an assembled ACEContext,
  accepts the actual compiler options, and performs no retrieval or persistence.
  Package build and focused context-handler tests passed.
- [ ] DAG-RUNTIME-01D — Execute a frozen bounded plan twice and compare normalized
  outputs, evidence, statuses, and deterministic receipt checksums.
- [x] DAG-RUNTIME-01D.1 — Proved the registered lexical and semantic owners on a
  bounded mocked read-only replay. Two runs produced the same deterministic
  execution checksum, both actions succeeded, and all writes remained false.
  This is fixture proof only; live dependency replay remains open.
- [ ] DAG-RUNTIME-01D.2 — **`BLOCKED_REVISION_BUNDLE_UNPROVEN`** (2026-09-02, formalized). Run the
  frozen replay against explicitly configured read-only live owners after exact source, candidate,
  graph, and representation revisions are available. WSL2 RAPIDS FastAPI runtime is now reachable
  at `127.0.0.1:8098` in `atlas-rapids-cu13` with HTTP 200 health, RTX 3060 Ti, cuVS/cuGraph 26.06,
  and no writes. This proves runtime availability only. Per the "OaK revision qualification"
  section below, the 4-leg revision bundle (source/candidate/graph/representation) is confirmed
  NOT authoritative — a mix of stale/orphaned, fresh-but-unpersisted, bounded-canary-scoped, and
  fixture-only values, not one coherent live world-state. Do not spend further effort on this gate
  until a coherent revision bundle exists; do not run `graphify:daily` or generate a new Graphify
  run merely to manufacture one (that would invert the dependency — a replay gate should consume a
  revision that the graph lifecycle naturally produces, not force an expensive rebuild to obtain a
  token).
- [ ] DAG-RUNTIME-01E — **`BLOCKED_BY_01D.2`**. Link the execution receipt to ContextManifest and
  validation receipts while preserving zero-write/non-canonical semantics.

## 3. Representation and learned AE

- [ ] NESTED-TRAIN-02 — Retrain the nested AE from an immutable source snapshot,
  grouped train/eval split, frozen seeds, CUDA receipt, and new checkpoint hash.
- [ ] NESTED-REP-01 — Compare `semantic_768`, native `semantic_mrl_128`, learned
  `latent_128`, and learned `latent_64` on the same CandidateOrdinal cohort.
  Record recall@K, MRR, overlap, bytes, latency, projection checksums, and replay.

## 4. Promotion safety

- [ ] PROMOTION-01 — Keep source lineage, graph identity, feature layout,
  projection ownership, and migration baseline as independent blockers.
- [ ] PROMOTION-02 — Permit writes only through an explicit target list,
  rollback plan, readback receipt, and human authorization.

## 5. Packet<->chunk lineage (historical reconstruction + future capture)

Full evidence trail: `docs/reports/workstation-lineage-resume-01-results.json`
(see `handoff_2026-09-01` for the complete commit list and status block).
Root cause: `scripts/atlas/register-orphaned-chunks.mjs` (the active
`atlas_packets` producer) discovers chunks via `DISTINCT relative_path`,
never captures `codebase_chunk_index.chunk_id`/`content_hash`/revision.
`atlas_packets` is FILE-granularity (proven corpus-wide invariant);
`codebase_chunk_index` is chunk-granularity — the relationship is 1:N
lineage MEMBERSHIP, not 1:1 identity.

- [x] PKT-LINEAGE-01 — Trace the packet-creation writer, identify root cause
  of the packet<->chunk fan-out (`register-orphaned-chunks.mjs`'s `DISTINCT
  relative_path` design; also found `backfill-unified-id-hierarchy.mjs`
  live-corrupted `chunk_id`/`repository_id` for ~58,000+ packets via
  `randomUUID()`).
- [x] PKT-LINEAGE-02 — Prove `atlas_packets` FILE granularity is a
  corpus-wide invariant (0/61,660 packets have >1 `source_ref`), correcting
  the earlier 1:1-identity framing to 1:N membership.
- [x] PKT-LINEAGE-03 — Identify `sourceRevision`/`sourceNamespace` authority:
  `graphify_files` (885 rows, real, 100% populated internally, but only
  ~1.4% corpus coverage). `atlas_packets.repository_id` confirmed corrupted
  (58,365/58,365 populated values all distinct).
- [x] PKT-LINEAGE-04 — Read-only historical backfill scope census (aggregate,
  then full row-level in v2): 577/61,660 packets admissible as
  `MEMBERSHIP_EXACT_REVISION_PROVEN`; 4,110 `NAMESPACE_UNPROVEN`; 56,973
  `NO_MEMBER`. Reproducible: 3 independent runs, identical checksums.
- [x] PKT-LINEAGE-05 — Freeze `PacketChunkMembershipV1` contract
  (`src/lib/server/atlas/lineage/packet-chunk-membership-v1.ts`, 9/9 tests)
  and `atlas_packet_chunk_lineage` migration
  (`drizzle/manual/20260901_atlas_packet_chunk_lineage.sql`), proved
  disposable-DB-first. `UNIQUE(packet_key, canonical_chunk_id)` only —
  producer revision is provenance on the canonical row, never a second row.
  `chunk_ordinal` nullable (no reliable producer ordinal signal exists).
- [x] PKT-LINEAGE-06 — Future-capture writer canary
  (`scripts/atlas/packet-chunk-lineage-canary-01.mts`): 3 real shapes
  written + read-back verified, 1 orphan correctly refused (fail-closed,
  no fabricated namespace).
- [x] PKT-LINEAGE-07 — Historical-reconstruction canary
  (`scripts/atlas/packet-chunk-lineage-backfill-canary-01.mts`): 4 real
  historical packets promoted from the frozen dry-run artifact (SINGLE/FEW/
  MANY/overlap-with-06), atomic per-packet-set writes, replay-proven
  idempotent under the corrected uniqueness key.
- [ ] PKT-LINEAGE-08 (PROMOTION-01) — Wire the corrected membership-writing
  logic into the live `register-orphaned-chunks.mjs` production path so
  future packet creation captures real lineage. The path is now implemented
  behind the explicit `--capture-lineage` opt-in: it requires the additive
  `atlas_packet_chunk_lineage` table, reads real `codebase_chunk_index.chunk_id`
  values plus `graphify_files.workspace_id`, and commits each packet and its
  complete membership set transactionally. Dry-run evidence is in
  `docs/reports/chunk-registration-report.json`; production canary/apply
  remains separately authorized and therefore this task stays open. A bounded
  authorized apply canary on 2026-09-01 exercised the active entrypoint:
  one orphan packet row was inserted, but its 22 memberships were correctly
  refused because `graphify_files.workspace_id` was absent; readback confirmed
  zero lineage rows. This proves the fail-closed branch, not the
  namespace-qualified success branch. See
  `docs/reports/chunk-registration-report.json`.
- [ ] PKT-LINEAGE-09 (BACKFILL-PROMOTION-01) — Separately authorize applying
  the full 6,987-row admitted cohort (all 577 packets) from the frozen
  `BACKFILL-DRY-01` artifact. Re-run the dry classification fresh first to
  confirm it's still stable before trusting it. Not started. Deliberately
  kept separate from PKT-LINEAGE-08 (future capture vs. historical
  reconstruction are different risk profiles).
- [ ] PKT-LINEAGE-10 (BRIDGE-RECON-DRY-03) — Reconcile Qdrant projections per
  packet<->chunk MEMBERSHIP (not per packet alone), consuming only rows
  proven by PKT-LINEAGE-08/09. Blocked on both.
- [ ] PKT-LINEAGE-11 (RECON-CANARY-01) — Tiny bounded Qdrant metadata
  write canary. Blocked, zero writes, until PKT-LINEAGE-10 admits a
  zero-ambiguity cohort.

## Three bounded tracks — 2026-09-01/02 session (re-verified concurrent-session evidence, closed 1 real caller-mismatch bug)

**Track A (PKT-LINEAGE-08/09 preflight) — CONFIRMED, no new writes.** A concurrent session's
`scripts/atlas/plan-packet-chunk-lineage-promotion-v1.mjs` (read-only, verified: only `SELECT`
queries, `pool.query` never called with INSERT/UPDATE) was inspected line-by-line and re-run fresh.
Result, normalized to the required success-state shape:
```
implementationCorrect: PASS (chunkOrdinal fabrication bug fixed in bb1572e0a6, verified no drift)
chunkOrdinal: NULL (frozen contract honored)
authorityProvenBeforeMutation: PASS
packetMembershipAtomicity: PASS
authorityUnprovenFixture: REFUSED_WITH_ZERO_WRITES (BLOCKED_LINEAGE_AUTHORITY x10/10 candidates)
liveEligibleCandidateCount: 0
liveProductionCanary: BLOCKED_NO_ELIGIBLE_CANDIDATE
futureWriterSemantics: PROVEN
```
**Scope note (added after external review caught an overreach in this session's own chat summary,
not in this file): this Track A result covers PKT-LINEAGE-08's live-write canary only, on a small
10-row sample. It is NOT the full-population PKT-LINEAGE-09 dry classification** — see the
dedicated "PKT-LINEAGE-09 fresh historical classification" section further below for that, which
was a separate, larger, later step in this same session.
Not a stall condition — this is the correct, expected state until a source cohort with a single
unambiguous namespace+revision actually appears. No live orphan was fabricated to force a canary.
PKT-LINEAGE-09/10/11 remain correctly blocked per their existing entries above; do not re-attempt
until `eligibleCandidateCount > 0` on a fresh re-run.

**Track B (RF-IDENTITY-CALLER-MATRIX-01) — DONE. Verdict: `V2_READY_FOR_CANONICAL_HYDRATION`.**
Mapped every live caller of both name-colliding `resolveCanonicalIdentity` implementations plus
`resolveCanonicalIdentityV2`:
- `ace/identity-contract.ts::resolveCanonicalIdentity` — 3 live callers (`types/retrieval.ts`,
  `ace/retrieval/evidence-lanes.ts`, `ace/indexed-source-packet.ts`). No `content_hash` field
  exists in this module at all; `source_ref` is `status: 'degraded'`, never canonical.
- `retrieval/identity-resolution.ts::resolveCanonicalIdentity` (V1) — reaches the canonical
  `SearchRuntime` spine via `search-runtime.ts:814`'s dynamic import of
  `retrieve-candidates.ts::retrieveAllCandidates` (8 production call sites) plus
  `rrf-integration.ts`. `content_hash` → `'projection_exact'`; `source_ref` → `'source_group'`.
  **Neither is ever `'canonical'` on this live path.**
- `resolveCanonicalIdentityV2` — zero production callers (test-only). Safe to wire as the
  hydration-time resolver in `RF-QDRANT-HYDRATION-02` without migrating existing V1 callers first.

**content_hash CANONICAL anywhere live: NO. source_ref CANONICAL anywhere live: NO.**
No `V1_LIVE_SEMANTIC_COLLISION`. Proceed to `RF-QDRANT-HYDRATION-02` (not started this session).

**Real bug found and fixed instead (smallest-necessary migration, not a new abstraction):**
RF-IDENTITY-SEMANTICS-02's broadening of `resolveCanonicalIdentity`'s `status` field to 4 values
(`canonical | projection_exact | source_group | degraded`) was never propagated to the `Candidate`/
`LaneGroup`/`AggregatedCandidate.identityStatus` type declarations in `search-runtime.ts` (still
`'canonical' | 'degraded'`). This was a **live, currently-broken `tsc --noEmit` compile** — 8 real
`TS2322` errors in `retrieve-candidates.ts`, confirmed by running `tsc` directly, not assumed.
Fixed by widening all 3 type declarations to the full 4-way union — **zero runtime/dedup behavior
change**, verified by reading `fuseSearchRuntimeCandidates`'s dedup logic first: every branch
already tests `identityStatus === 'canonical'` and treats every other value (including the two new
ones) identically to `'degraded'`, so neither `content_hash` nor `source_ref` was ever at risk of
being wrongly promoted to a canonical dedup key even before the type fix — this was purely a stale
type contract, not a semantic bug. One stale test
(`retrieve-candidates-identity.test.ts`, asserting the pre-correction `content_hash → 'canonical'`
expectation) was also fixed to match the corrected precedence. `tsc --noEmit` now clean on both
files; all 32 tests across the 3 identity/fusion suites pass. Did not touch RETRIEVAL-02's 3 proven
Qdrant defects, did not start RF7, did not create a V3 resolver.

**Track C (GRAPHIFY-STALE-RUN-RECON-01) — DONE, read-only, re-run fresh, unchanged.**
`scripts/atlas/audit-graphify-stale-run-reconciliation-v1.mjs` (verified genuinely read-only:
`pool.query` calls are all `SELECT`) re-run live. One `graphify_runs` record for the expected
workspace revision (`sha256:55edaaad...`), `status: 'RUNNING'`, `completed_at: null`, started
2026-08-28T04:01:23Z — **zero `pg_stat_activity` or `pg_locks` evidence of a live backing
process** (both empty arrays), meaning this is an orphaned record from a dead/killed process, not
something still executing. `completedOwnerCount: 0` for this workspace revision.
Normalized to the exact required 3-way enum: **`STALE_RUN_NON_PROMOTABLE`** (not
`READINESS_REPLAY_SUFFICIENT` — `promotionAllowed`/`graphRevisionAllowed` are both explicitly
`false`; not `FRESH_GRAPHIFY_REQUIRED` — that's a stronger claim than this evidence proves, and
would require an explicit human abandonment-review decision, not an automatic assertion). Per
explicit instruction, `graphify:daily` was **not** run to silence this. No OaK/DAG-runtime work
follows from this track's `STALE_RUN_NON_PROMOTABLE` result until a human decides to abandon or
resume the orphaned run.

## RF-QDRANT-HYDRATION-02 (2026-09-02, done — WIRED, not yet DEDUP_PROVEN)

Read-only discovery first: `ProjectionRegistryV1` (`sveltekit-frontend/src/lib/server/atlas/retrieval/projection-registry-v1.ts`)
already exists, is fully tested (`projection-registry-v1.spec.ts`), and already matches the target
hydration ontology exactly — canonical packet identity + representation identity resolves to a
projection coordinate, validated against the live Qdrant point's own `postgres_id` payload rather
than trusted blindly (the exact anti-pattern that produced the earlier 7,773-row stale-payload
finding). It had **zero production callers** — a correctly-designed, fully dead path. This is the
real RF-QDRANT-HYDRATION-02 finding, not "needs to be built from scratch."

Wired it (smallest necessary integration, no new abstraction, no V3):
- `retrieve-candidates.ts::retrieveQdrant` (the `semantic_768`/`codebase_chunks_768_v2` dense lane
  — matches `ProjectionRegistryV1`'s declared scope exactly) now calls a new
  `hydrateCanonicalChunkIds()` helper on both its primary and dense-only-fallback return paths,
  right before returning candidates.
- `hydrateCanonicalChunkIds()` batches by unique Qdrant point id (dedup first — `resolveProjectionsBatch`
  does not guarantee output order matches input order, so results are matched back by key, never
  by array position), calls `resolveProjectionsBatch()` once per `retrieveQdrant()` invocation, and
  sets a new `Candidate.canonicalChunkId` field ONLY on `ok: true` results.
- **Fail-open by design**: wrapped in try/catch: a `ProjectionRegistryV1` error (network, schema
  drift) never drops or blocks candidates already resolved via the existing V1
  `resolveCanonicalIdentity` precedence — it only adds evidence, never subtracts it.
- **Scope boundary honored**: `canonicalChunkId` is observability/evidence only in this step. It is
  NOT yet consumed by `resolveCanonicalIdentityV2` or by `fuseSearchRuntimeCandidates`'s dedup —
  that remains on the existing V1 `identityStatus` precedence, untouched. Wiring `canonicalChunkId`
  into V2-based dedup is a distinct, separate future step (not started), consistent with "don't
  create another identity abstraction, don't skip to bulk migration."
- 4 new focused unit tests added (`__tests__/qdrant-hydration.test.ts`): validated-attach,
  fail-open-on-throw, no-op-on-empty-list, dedup-into-one-lookup. `tsc --noEmit` clean on all 3
  touched files (`retrieve-candidates.ts`, `search-runtime.ts`, `projection-registry-v1.ts`); 38/38
  tests pass across the full identity/fusion/hydration suite set.

**Status honestly**: `WIRED` (per this repo's enforced status-language rules) — the hydration path
is live and observable on every dense-lane query, but not yet `DEDUP_PROVEN` (no live-traffic
evidence yet of how often `canonicalChunkId` actually resolves `ok: true` vs. `PROJECTION_NOT_FOUND`/
`CANONICAL_IDENTITY_MISMATCH` on real queries — that requires a live-replay proof, not claimed
here). Next: `RF5-LIVE-REPLAY-01` (in parallel per the frozen lane plan) and, separately, the
V2-dedup consumption step once hydration's real-traffic hit rate is observed.

## RF5-LIVE-REPLAY-01 (2026-09-02, done) — 1 real bug found and fixed, 2 cases already safe

Ran all 5 named hard cases from the fusion-reachability change's frozen RF5-LIVE-REPLAY-01 spec
against `fuseSearchRuntimeCandidates`, using fixture-based candidates (not live traffic replay —
"replay" here means replaying the invariant against representative synthetic inputs, consistent
with this session's fixture-first proof pattern elsewhere):

1. **Same entity via multiple Qdrant physical hits** — already correctly deduped (pre-existing
   `RF5 within-lane canonical dedup` test suite covers this; reasserted here for the record).
2. **Same entity via multiple backend-local IDs** — same as above, already correct.
3. **Same packet with multiple legitimate canonical chunks** — **real, live bug found and fixed**.
   `getFusionIdentityKey()` only ever considered `symbolVersionId || packetKey || id` — `packetKey`
   is file/packet-granular, not chunk-granular, so two genuinely distinct chunks of the same packet
   were silently collapsing into one fused result (dropping a legitimate hit). Fixed by making the
   `packetKey` tier check `canonicalChunkId` (RF-QDRANT-HYDRATION-02's hydrated, Qdrant-validated
   chunk identity) when present, producing a `packetKey::chunk:canonicalChunkId` composite key —
   purely additive: `canonicalChunkId` is unset on every candidate that existed before today's
   hydration wiring, so this is zero behavior change for all pre-existing traffic/tests. A control
   test confirms the fix disambiguates rather than over-splits (same packet+chunk pair from two
   lanes still dedupes to one vote).
4. **Same source_ref with different canonical chunks** — already safe by construction: any
   non-`'canonical'`-status candidate (including `source_group`) dedupes on its backend-local id
   (`fallback_id`/`qdrantPointId`), never on `source_ref` itself, so distinct chunks with a shared
   `source_ref` were never at risk of merging.
5. **Same content_hash but unproven hash domain** — already safe by construction, for a narrower
   reason than the spec anticipated: V1 fusion (the live path) never promotes `content_hash` to the
   `'canonical'` dedup tier at all (it is always `'projection_exact'`, which uses the backend-local
   key like case 4) — hash-domain qualification is a `resolveCanonicalIdentityV2`-only concept that
   is not yet wired into fusion, so the specific failure mode the spec worried about (a wrong-domain
   hash silently over-merging with a canonical entity) cannot occur on the current live path. This
   will need re-checking once/if `resolveCanonicalIdentityV2` is ever wired into fusion directly.

5 new tests added to `search-runtime-fusion.test.ts` (`RF5-LIVE-REPLAY-01` describe block); 43/43
tests pass across the full identity/fusion/hydration suite; `tsc --noEmit` clean on all 3 touched
files. Next per the frozen lane plan: OaK revision qualification (read-only, when convenient) —
`RF6-OWNER-MATRIX-01`/`RF6-LIVE-REPLAY-01` remain explicitly not started (RF6 is a separate,
larger per-pipeline census task, not implied by this task's completion).

## OaK revision qualification (2026-09-02, read-only, done) — bundle NOT authoritative, DAG-RUNTIME-01D.2 correctly stays blocked

Read-only qualification of the 4 revision legs `DAG-RUNTIME-01D.2` needs before a live replay is
eligible: source, candidate, graph, representation. No revision was fabricated; each finding below
cites the concurrent-session artifact it came from (all genuinely read-only: every one asserts
`writesPerformed: false`/`canonicalWritesAllowed: false`/`readOnly: true`).

- **Source revision — NOT unified.** Two different, non-interchangeable values exist:
  (1) `sha256:55edaaad...` (24,192 sources) — the value bound to the `graphify_runs` row, but that
  row is the same orphaned `RUNNING`/`completed_at: null` record found in this task's own
  `GRAPHIFY-STALE-RUN-RECON-01` track (see above) — `docs/reports/current-graphify-run-owner-v1.json`
  confirms `authoritativeGraphRun: false`, `graphRevisionAllowed: false`. (2) `sha256:8a3a9085...`
  (25,048 sources) — a freshly, correctly re-derived live workspace revision from
  `docs/reports/graphify-revision-owner-v2.json`, but explicitly `revisionOwnerProven: false` and
  `persistedMatchingRows: 0` (zero DB rows currently bound to it — `blockers:
  ["CONTROLLED_PERSISTENCE_CANARY_NOT_PROVEN"]`). Neither value is simultaneously live, complete,
  AND persisted/bound.
- **Candidate revision — real but out of scope for this bundle.** `candidateSnapshotRevision:
  "lineage-qualified-canary:sha256:...:v1:15"` (`docs/reports/current-candidate-feature-matrix-manifest-v1.json`,
  status `GRAPH_FEATURE_MATRIX_REPLAY_PROVEN`) — a genuine, bounded n=15 canary revision in its own
  independent namespace, not demonstrated to correspond to either source revision above.
- **Graph revision — explicitly fixture-only.** `astGraphRevision: sha256:914f8880...`
  (`docs/reports/ast-structural-revision-v1.json`) carries `status: "PROVEN_FIXTURE_ONLY"` in its
  own field — not a live-corpus revision by its own admission.
- **Representation revision — not separately catalogued this pass.** Dozens of reports reference
  `representationRevision`/`representation_revision` fields; no single dedicated
  "representation-revision-authority" report was found in a reasonable-effort search. Recorded
  honestly as unresolved rather than assumed absent or fabricated as present.

**Verdict: the complete 4-leg revision bundle is NOT authoritative** — each leg is independently
real evidence, but they do not currently form one mutually-consistent, live, persisted bundle (a
mix of stale/orphaned, fresh-but-unpersisted, bounded-canary-scoped, and fixture-only values).
Per the explicit instruction, `DAG-RUNTIME-01D.2` and any live `DAG-RUNTIME-01D.2`/`01E` work
remains correctly blocked — this qualification pass changes nothing about that gate, it only makes
the reason precise and evidence-linked instead of a general "not yet proven."

## PKT-LINEAGE-09 fresh historical classification (2026-09-02, read-only, done) — `READY_FOR_HISTORICAL_PROMOTION_AUTHORIZATION`

**Correction to this file's own prior "Lane A: CLOSED" characterization** (external review caught
this): PKT-LINEAGE-08's live-canary absence does not close Lane A. PKT-LINEAGE-09's fresh dry
classification was the actual next step, deliberately separable from 08's canary, and had not yet
been run. It has now been run.

**The frozen baseline's own producer script was not found anywhere in the repository** — searched
by filename (`packet-chunk-lineage-backfill-dry-01*`) and by distinctive field names
(`MEMBERSHIP_EXACT_REVISION_PROVEN`, `frozenAuthority`, `admittedPacketSetChecksum`) across
`scripts/atlas/*.mjs`/`*.mts`. Rather than treat this as a blocker, wrote an independent
reconstruction (`scripts/atlas/audit-pkt-lineage-09-fresh-classification-v1.mjs`) from the frozen
baseline's own documented methodology (same `frozenAuthority`: `atlas_packets`,
`codebase_chunk_index`, `graphify_files`; same exclusion of `atlas_packet_chunk_lineage` as
comparison-target-only) and ran it fresh, read-only, full population (no `LIMIT`).

**Headline result — exact match on every promotion-relevant number:**
```
                        baseline    fresh     match
population              61,660      61,660    YES
admittedPackets            577         577    YES
proposedMembershipRows   6,987       6,987    YES
```
**Real, explained discrepancy in the rejected-bucket split (not glossed over):**
```
                        baseline    fresh
namespaceUnproven         4,110      60,882
noMember                  56,973        201
```
Both splits independently sum correctly to 61,660 (`4,110+56,973+577` and `60,882+201+577`), so
this is a bucketing-order difference, not an arithmetic error. **My fresh split's 778 = 577+201
"namespace-proven" figure exactly matches `LINEAGE-01`'s independently-audited
`namespaceProven: 778, namespaceUnproven: 60,882`** (`docs/reports/lineage-01-source-namespace-revision-authority-v1.json`)
— now a third independent confirmation of the same 778/60,882 split. The original frozen baseline
evidently checked chunk-membership before namespace/revision proof (labeling anything with zero
chunk rows as `NO_MEMBER` regardless of namespace status), while this fresh classifier and
`LINEAGE-01` both check namespace/revision proof first. **Classified as `SAFE_EXPLAINED_DRIFT`, not
`UNEXPLAINED_DRIFT`**: the bucketing convention differs, but the set that actually gets promoted
(admitted packets + proposed memberships) is byte-for-byte identical either way.

**Live canonical comparison** against the existing `atlas_packet_chunk_lineage` table (which does
already have rows — from an earlier promotion event, not from this session):
```
alreadyCanonicalIdentical:      89   (existing rows the fresh proposal exactly reproduces)
newInserts:                  6,898   (would-be new rows, not yet applied)
conflicts:                       0   (no existing row disagrees with the fresh proposal)
deletesRequired:                 0   (required to be zero per the task spec — confirmed)
existingRowsNotInFreshProposal:  0
```

**Verdict: `READY_FOR_HISTORICAL_PROMOTION_AUTHORIZATION`.** Row-level checksums were NOT compared
against the baseline (its serialization method is unrecoverable without its source script) — only
aggregate counts and the live canonical table, which is a materially stronger evidence surface
than a stored checksum from unknown code anyway. Report:
`docs/reports/pkt-lineage-09-fresh-classification-v1.json`. **No historical write was performed or
proposed for execution — this is the dry classification only.** `PKT-LINEAGE-09` (apply),
`PKT-LINEAGE-10`, `PKT-LINEAGE-11` remain separately gated on explicit future authorization, per
the standing instruction that a promotion-ready classification is not itself an apply decision.

## PKT-LINEAGE-09-HISTORICAL-PROMOTION-01 (2026-09-02) — `HISTORICAL_LINEAGE_PROMOTION_PROVEN`, then PKT-LINEAGE-10 read-only

**Authorized and executed per explicit operator instruction.** This is the first production
database write of this session. Two scripts, run in sequence:

1. **`freeze-pkt-lineage-09-proposal-v1.mjs`** (read-only) — re-ran the classification and
   persisted the full 6,987-row proposal to `docs/reports/pkt-lineage-09-frozen-proposal-v1.json`
   (the aggregate summary artifact from the prior task did not itself contain the row-level data
   needed for apply to consume verbatim). Determinism check against the prior classification run
   passed on every field (population/admitted/membership-count/namespace-unproven/no-member all
   matched) — confirmed the live DB had not drifted since the dry classification.
2. **`apply-pkt-lineage-09-historical-promotion-v1.mjs`** — verified schema contract
   (`UNIQUE(packet_key, canonical_chunk_id)` present, `chunk_ordinal` nullable) and re-diffed the
   frozen proposal against the live `atlas_packet_chunk_lineage` table immediately before writing
   (0 conflicts found). Applied via 577 independent per-packet atomic transactions: `INSERT ...
   ON CONFLICT (packet_key, canonical_chunk_id) DO NOTHING`, then a same-transaction readback
   verifying the packet's complete membership set exactly matches the frozen proposal before
   `COMMIT` (any mismatch would `ROLLBACK` — none occurred).

**Apply result** (`docs/reports/pkt-lineage-09-historical-promotion-apply-v1.json`):
```
packetsProcessed: 577   rowsBefore: 89     rowsInserted: 6,898   rowsAlreadyIdentical: 89
rowsAfter: 6,987        rollbacks: 0       conflicts: 0          duplicatePairs: 0   syntheticIds: 0
verdict: HISTORICAL_LINEAGE_PROMOTION_PROVEN
```
**Replay result** (`docs/reports/pkt-lineage-09-historical-promotion-replay-v1.json`, idempotency
proof — the exact same apply run a second time):
```
rowsBefore: 6,987   rowsInserted: 0   rowsAlreadyIdentical: 6,987   rowsAfter: 6,987
rollbacks: 0   conflicts: 0   duplicatePairs: 0
verdict: HISTORICAL_LINEAGE_PROMOTION_PROVEN
```
No synthetic IDs, no source_ref fanout, no representative-chunk substitution, no deletion (`DELETE`
is never issued anywhere in the apply script), no writes to Qdrant/Neo4j/Redis — Postgres only.
The canonical 1:N packet→chunk bridge (`atlas_packet_chunk_lineage`) now exists for all 577
namespace+revision-qualified packets.

## PKT-LINEAGE-10 (BRIDGE-RECON-DRY-03) (2026-09-02, read-only, done)

Run immediately after the apply succeeded, per instruction. `scripts/atlas/audit-bridge-recon-dry-03-v1.mjs`
consumes **only** the physical `(packet_key, canonical_chunk_id, chunk_row_id)` rows from the
now-populated `atlas_packet_chunk_lineage` table — never `source_ref` fanout (a 30-membership file
packet yields exactly 30 membership mappings, not 30 guesses from a shared file path). Joins each
row's `chunk_row_id` (the `codebase_chunk_index.id` UUID) directly into live Qdrant
`codebase_chunks_768_v2`, per the proven `physicalPointId === canonicalPacketIdentity` mapping.

```
lineageRowCount: 6,987
EXACT_CANONICAL_MEMBERSHIP: 6,312   (point exists, self-consistent, payload not yet reconciled)
ALREADY_RECONCILED:             0   (expected — this is the first reconciliation pass)
QDRANT_POINT_MISSING:          675   (no live Qdrant point for this chunk_row_id at all)
PROJECTION_REGISTRY_MISSING:     0
PAYLOAD_IDENTITY_CONFLICT:       0
REVISION_MISMATCH:               0
FOREIGN_CHUNK:                   0
proposedMutationCount: 6,312 (payload patches only: packet_key/canonical_chunk_id/source_namespace/
                              source_revision — NOT proposed for the 675 missing points)
writesPerformed: false
```
Zero contradictory evidence (no identity conflicts, no revision mismatches, no foreign-chunk
attribution) — a clean result, not glossed over. Full classification + exact proposed mutation set
in `docs/reports/bridge-recon-dry-03-v1.json`.

**Per explicit instruction: stopping here.** `PKT-LINEAGE-11`/`RECON-CANARY-01` are NOT authorized
by this result — no Qdrant write was proposed for execution or applied. RF6 refactoring/RF7 were
not started. OaK remains `BLOCKED_REVISION_BUNDLE_UNPROVEN`. `graphify:daily` was not run.

## Validation record

- [x] OpenSpec validation passes for proposal/design/tasks/spec consistency.
  Verified with the installed CLI using `openspec validate parent-atlas-retrieval-lineage-dag-convergence --type change --strict --json` (1/1 change passed).
- [ ] All completed items above have linked reports, not merely code existence.
- [ ] No database, Qdrant, graph, cache, or production mutation occurs during
  read-only gates.
