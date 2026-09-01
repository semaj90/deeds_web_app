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
- [ ] RETRIEVAL-02 — Census every Qdrant query for explicit named-vector
  selection; do not mass-edit callers.

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
- [ ] DAG-RUNTIME-01D.2 — Run the frozen replay against explicitly configured
  read-only live owners after exact source, candidate, graph, and representation
  revisions are available. WSL2 RAPIDS FastAPI runtime is now reachable at
  `127.0.0.1:8098` in `atlas-rapids-cu13` with HTTP 200 health, RTX 3060 Ti,
  cuVS/cuGraph 26.06, and no writes. This proves runtime availability only;
  the frozen OaK replay remains open because exact source/candidate/graph/
  representation inputs and live owner execution have not yet been proven.
- [ ] DAG-RUNTIME-01E — Link the execution receipt to ContextManifest and
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
  future packet creation captures real lineage. Separate authorization
  required; not started.
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

## Validation record

- [x] OpenSpec validation passes for proposal/design/tasks/spec consistency.
  Verified with the installed CLI using `openspec validate parent-atlas-retrieval-lineage-dag-convergence --type change --strict --json` (1/1 change passed).
- [ ] All completed items above have linked reports, not merely code existence.
- [ ] No database, Qdrant, graph, cache, or production mutation occurs during
  read-only gates.
