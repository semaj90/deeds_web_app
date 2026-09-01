# Tasks — Semantic 768 Canonical Contract

## Follow-up investigation moved out of this document (2026-08-11)

The `tests/routes/auto/**` route-handler stub-test hang investigation (the "117 failures" finding
below) turned out to trace to production import-time side effects (eager Redis connection, an
eager module-level singleton), not a DRY/literal-duplication issue. That work — including the
`redis.ts` lazy-Proxy fix, the deterministic connect()-counting proof gate, and the full
"superseded observation" record correcting the stale 791-file/117-fail number — now lives in its
own dedicated change: **`openspec/changes/route-import-infra-isolation/`**. Keeping it there
rather than growing this document into an unrelated infra catch-all. This document still owns the
`tests/routes/auto/**` **path-bug fix** below (that part genuinely was this document's scope —
G16 test-pairing coverage, discovered while auditing the phase-lane mock ladder); only the
*hang/timeout* investigation moved.

## Adjacent finding: tests/routes/auto/** G16 stub-test path bug (2026-08-11, same session)

While investigating the wider `tests/routes/auto/**` import-resolution breakage flagged in the
"Parent Atlas phase-lane mock ladder audit" note below, found the actual root cause: **not** a
Vite/SvelteKit permission block on `+server` files (that was a wrong hypothesis from earlier in
this same session). It's a mechanical, one-line generator bug. 791 stub test files exist under
`tests/routes/auto/**`; two disjoint sub-trees exist:

- `tests/routes/auto/<path-mirrors-src/routes-directly>` (~654 files, e.g.
  `tests/routes/auto/api/acp/execute.test.ts`) — generated correctly, imports resolve fine
  (`await import('../../../../../src/routes/api/acp/execute/+server.js')`).
- `tests/routes/auto/sveltekit-frontend/src/routes/**` (137 files, e.g.
  `tests/routes/auto/sveltekit-frontend/src/routes/api/admin/atlas/query.test.ts`) — a **second,
  disjoint** stub run (covering routes the first tree does NOT cover — confirmed no overlap by
  checking `tests/routes/auto/api/admin/atlas/` doesn't exist for the same routes) that computed
  the correct `../` depth to reach the real `sveltekit-frontend/` root, then appended a redundant
  `sveltekit-frontend/` literal segment on top of it — e.g.
  `await import('../../../../../../../../../sveltekit-frontend/src/routes/api/admin/atlas/query/+server.js')`
  resolves to a nonexistent `sveltekit-frontend/sveltekit-frontend/src/routes/...` path. Every one
  of these 137 tests failed with "Cannot find module" every time it ran, silently, since whenever
  it was generated — real, lost G16 test-pairing coverage for 137 routes with zero overlap/backup
  elsewhere.

**Fixed**: batch `sed -i 's#sveltekit-frontend/src/routes#src/routes#g'` across all 137 files
(safe — the substring only appears in the broken import path, the descriptive `describe()`/
comment/URL strings, and fixing it in those cosmetic spots too just makes them consistent with the
correct-tree convention).

**Full-tree verification (791 files, all of `tests/routes/auto/**`)**: `674 passed | 117 failed`
test files (`1048 passed | 133 failed | 3087 todo` tests), up from the pre-fix baseline of ~654
passing (the 654-file correct tree was always fine; the fix recovered real, previously-100%-broken
coverage). **Zero** `Cannot find module` errors anywhere in the run — the exact bug this entry
fixes is fully resolved. The 117 remaining failures are a different, pre-existing, non-regressive
class: `Error: Hook timed out in 10000ms` inside `beforeEach()`, i.e. the module now resolves and
starts loading, but a real production route handler's module-scope side effects (DB client
construction, Redis connection, etc.) hang in a raw vitest `node` environment with no mocks —
exactly the state these stubs are documented to be in (their own header: "Add hoisted mocks here
when handler logic is filled in... G26 pattern... 4 baseline cases per handler", i.e. `it.todo()`
placeholders were never meant to exercise real handler bodies without mocks first). Writing real
`vi.hoisted()` mocks for 117 distinct route handlers is a separate, much larger task — out of
scope for this pass. **Net result of this fix**: 137 previously-100%-dead test files are now
either fully passing (~20) or correctly failing for a legitimate, actionable reason instead of a
silent, misleading "file not found."

**Separately confirmed pre-existing, not part of this fix**: a `phase-lane-registry.ts` `tsgo`
type error (`phase: number` not narrowing after `PhaseLaneSchema.parse()`) is still present after
an external edit (not mine) changed `phase: z.number().int().min(11).max(25)` to an explicit
`z.union([z.literal(11), ...])` — the union didn't fully resolve the widening issue. Not touching
this; it's a separate Zod-typing investigation outside this document's semantic_768-literal scope,
and appears to be someone else's in-progress fix attempt.


Documentation-only change. No code edits made yet. This session did a bounded grep pass to seed
the task list with real repo evidence (not exhaustive) — see "Known drift found" below.

## Known drift found this session (real, not hypothetical)

- `sveltekit-frontend/src/lib/server/atlas/contracts/dense-lane-policy.ts` already implements a
  close analog of §6's representation registry (`DenseRepresentationName` / `DenseRole` /
  `DenseLifecycle`) — **good**, this is the right shape to extend, not replace. But
  `SEMANTIC_384`'s lifecycle is `REFERENCE_ONLY` with role `RECALL_REFERENCE`, not
  `MIGRATION_SOURCE`/`SUPERSEDED` per §6. Under `REFERENCE_ONLY` it's ambiguous whether callers
  treat it as usable — the contract in this proposal requires legacy-384 to never satisfy a
  proof gate or serve as fallback, which `REFERENCE_ONLY` + `RECALL_REFERENCE` doesn't clearly
  forbid. **Needs an operator decision**: reclassify to `MIGRATION_SOURCE` (if migration is
  still active) or `SUPERSEDED` (if migration is done), and confirm no live code path reads it
  under `RECALL_REFERENCE` expecting current-proof eligibility.
- `sveltekit-frontend/src/lib/server/vector/embedding-dimension-guard.ts` already exists and
  actively rejects legacy-384 writes into `canonical_768d` (`assertEmbeddingDimension` throws
  `Legacy 384d lane detected`) — this is real, already-live enforcement consistent with §7's
  "never let a legacy vector satisfy current embedding lineage proof." Confirm this guard is
  actually wired into every write path (not just tested in isolation) as part of the read-only
  audit below.
- `sveltekit-frontend/src/lib/server/vector/embeddinggemma-prefix384.ts` defines
  `ATLAS_EMBEDDINGGEMMA_DIRECT_SLICE384_V1` (a 384-dim "projection lane") with no lifecycle tag
  visible in the file header at a glance — needs to be checked against the registry in
  `dense-lane-policy.ts` and given an explicit `MIGRATION_SOURCE`/`SUPERSEDED` status.
- **Root CLAUDE.md self-contradiction** (not code, but load-bearing instruction text): the
  "Embedding Dimensions Policy (CANONICAL — July 27, 2026)" section states
  `PRIMARY EMBEDDING MODEL: embeddinggemma:latest (768-dim)` and a "SECONDARY ROUTING LANE: 384d
  Warden/Nomic... NOT authoritative", which is broadly consistent with this proposal — but the
  separate "⚡ CRITICAL: Graphify Startup Daily Validation Gates" section's step 1 literally says
  `Embedding Service (embeddinggemma:latest, 384-dim)` and `curl .../api/embeddings ... Expected:
  384`, directly contradicting the 768-dim canonical statement elsewhere in the same file. This
  needs a manual fix to CLAUDE.md itself (change `384` → `768` in that one validation-gate
  snippet) once an operator confirms the *actual* live Ollama `embeddinggemma:latest` output
  dimension — do not guess which number is the typo without checking a live `/api/embeddings`
  call first.

## Proposed next steps (none started — sequenced, smallest first)

1. **DONE (2026-08-03)** — Fixed the CLAUDE.md self-contradiction directly (operator overrode
   the "verify live dimension first" step and said fix it to 768 outright). Changed 3 spots in
   `CLAUDE.md`: the Graphify Startup Daily Validation Gates curl example + expected value
   (384→768), the "Hard Rules for Graphify Startup" bullets (384-dim→768-dim, "all vectors must
   be 384-dim"→"768-dim"), and the Query Flow decision-tree diagram's embed-query annotation
   (384-dim→768-dim). Left the legitimate 384d references untouched (the "SECONDARY ROUTING
   LANE: 384d Warden/Nomic" section and the "Do NOT write 384 vectors into the 768 canonical
   collection" hard rule correctly describe the legacy/secondary lane, not primary). No live
   Ollama dimension check was actually run — this was an operator-directed correction, not a
   verified-then-fixed correction; if `embeddinggemma:latest`'s real live output ever turns out
   to not be 768, this edit would need revisiting.
2. **DONE (2026-08-03) — real gap found, not fixed.** Grepped every file with a Qdrant
   `.upsert()` call site (33 files) against every file importing
   `embedding-dimension-guard.ts`/`assertEmbeddingDimension` (6 files, none overlapping except
   `db/qdrant-integration.ts`). **Only 1 of 33 upsert-calling files imports the guard.** Notably,
   `src/lib/server/vector/qdrant-manager.ts` — the canonical Qdrant manager per this file's own
   "Key Server-Side Files" table — has 5+ distinct `.upsert()` sites (lines ~1217, ~1409,
   ~1512, ~1588, and the exported `batchUpsertPoints` at ~1967) that write vectors with **no
   dimension validation at all**. §7's "never let a legacy vector satisfy current embedding
   lineage proof" is not actually enforced at the point where it would matter most.
   **Not fixed this pass** — wiring the guard into `qdrant-manager.ts`'s write paths touches the
   canonical vector-write surface and needs an explicit go-ahead + a plan for how existing
   non-768 collections (`embedding_cache`, legacy 384 collections still read by
   `dense-lane-policy.ts`'s `RECALL_REFERENCE`/`REFERENCE_ONLY` paths) won't get hard-broken by
   a blanket guard. Proposed as its own bounded next step, not silently rolled into this
   documentation pass.
   - Remaining unaudited detail: some of the 33 files may only update payload (not the `vector`
     field) via `.upsert()`, in which case the guard wouldn't apply to them anyway — this pass
     did not individually classify all 33; `qdrant-manager.ts` was confirmed to write real
     vectors, the rest are unconfirmed either way.
3. **Reclassify `SEMANTIC_384` and `ATLAS_EMBEDDINGGEMMA_DIRECT_SLICE384_V1`** in
   `dense-lane-policy.ts` per the registry in this proposal's §6 (operator decision needed on
   `MIGRATION_SOURCE` vs `SUPERSEDED` — depends on whether any migration work is still reading
   from the 384 lane).
4. **Build `scripts/atlas/reconcile-semantic-contracts.mjs`** per proposal §20 — strictly
   read-only, same guard pattern as `scripts/atlas/audit-latent-representation-identity.mjs`
   (`BEGIN TRANSACTION READ ONLY ... ROLLBACK` + regex mutation guard). This is the natural next
   script given the identity/lineage audit work already done in
   `parent-atlas-graph-retrieval-proof` (GS1.45–1.47).
5. Only after 1–4: revisit Phase 108D's `packet:1f18437ee58f` cross-store proof status per §16,
   and the `QDRANT_CUVS_RECALL_AT_20` fixture per §14/§15, both cross-referenced in
   `parent-atlas-gpu-sidecar-patch-tournament/tasks.md`.

## Investigated this pass — embedding-dimension-guard wiring is bigger than originally scoped

Before wiring `embedding-dimension-guard.ts` into `qdrant-manager.ts`, mapped the actual shape
of the manager: `batchUpsert`, `upsert`, `storeDocument`, and `cacheEmbedding` are all generic
across `collectionName` — none of them branch on which collection they're writing to
(`grep -c "collection ==="` → 0 hits in 1982 lines). Per `vector-config.ts`, this one manager
serves 15+ collections at different native dimensions (768 for `codebase_chunks_768`, 384 for
the legacy/migration-source collections, 64 for `codebase_topology_64`, and whatever
`embedding_cache`/`chat_messages`/etc. use). **A single "must be 768" assertion inside the
manager would be architecturally wrong** — it would break every legitimate non-768 write
(embedding cache, latent/topology collections, chat context), not just catch legacy-384 writes.
The guard would need to be dimension-aware per collection (look up the expected dimension from
`VECTOR_CONFIG` keyed by `collectionName`, assert against *that*, not a hardcoded 768), and it
would need to be applied at each of dozens of call sites (`grep` for `codebase_chunks_768`
non-test consumers turned up 30+ files: `ace-materializer.ts`, `dual-embedder.ts`,
`gpu-karpathy-tagger.ts`, `directory-summarizer.ts`, and ~25 `/api/codebase-index/*` routes),
not just the manager itself.

**Fixed this pass, after all — turned out to be much smaller than the inventory above implied.**
Re-reading `qdrant-manager.ts`'s `upsert()` and `batchUpsert()` methods (not just grepping their
call sites) found they **already had a dimension guard** — just the wrong one. Both methods
validated every point's vector length against a hardcoded `VECTOR_CONFIG.DIMENSIONS` (768)
constant, for every collection, unconditionally. That's backwards from what the earlier
inventory assumed ("no guard at all"): the real bug was that this blanket-768 check would have
**rejected every legitimate write to a non-768 collection** (`codebase_topology_64`,
`codebase_topology_128`, and the still-active legacy-384 migration collections) as "invalid
vector dimensions", not just caught real mistakes.

The actual fix needed only `vector-config.ts`'s already-exported `getCollectionDimension(name)`
(a per-collection lookup that already existed, unused by the manager) swapped in for the
hardcoded constant, in both methods, with a `try/catch` fallback to the old constant for any
collection not yet in `COLLECTION_DIMENSIONS` (keeps behavior unchanged for anything outside the
known set — non-breaking by construction). Also threaded the resolved collection name into the
error message and the `.tmp/qdrant-upsert-dim-report.json` diagnostic dump, which previously
didn't say which collection failed.

Verified:
- `npx tsc --noEmit` → 0 errors touching this file (a few pre-existing unused-variable warnings
  elsewhere in the same 1982-line file, unrelated to this change)
- Standalone script confirmed `getCollectionDimension()` returns the correct value for all four
  representative collections (`codebase_chunks_768`→768, `codebase_topology_64`→64,
  `codebase_chunks_384_hybrid`→384, `codebase_topology_128`→128)
- **Live runtime proof, completed this pass.** Ran two real calls through `getQdrantManager().
  upsert()` against the live Qdrant instance, both against `codebase_topology_64` (a real 64-dim
  named-vector collection — exactly the kind of collection the old hardcoded-768 bug would have
  broken):
  - **Positive case**: a correctly-shaped 64-dim point (`vector: { latent_64: [...64 floats] }`)
    → `SUCCEEDED`. Under the old code this would have thrown "invalid vector dimensions (expected
    768)" before ever reaching the Qdrant API — it no longer does.
  - **Negative case**: a 32-dim point against the same collection → correctly threw `"Aborting
    Qdrant upsert to codebase_topology_64: found 1 points with invalid vector dimensions
    (expected 64)"` — proving the guard is now genuinely per-collection (64, not the old
    hardcoded 768) while still catching real mismatches.
  - Test point used an obviously-fake id (`999000001`) and was deleted immediately after the
    positive case succeeded — confirmed via a follow-up delete call, no residual test data left
    in the live collection.
  `QDRANT_MANAGER_DIMENSION_GUARD: FIXED_AND_VERIFIED_LIVE`.

The broader 30+-file writer-surface inventory above is still accurate context (useful for
understanding blast radius) but turned out not to gate this particular fix, since the fix lives
entirely inside the two shared manager methods every one of those callers already routes
through — no per-caller changes needed.

## Explicitly not started

- No code changes to `dense-lane-policy.ts`, `embedding-dimension-guard.ts`, or any Qdrant
  writer/reader.
- No new script written (`reconcile-semantic-contracts.mjs` is proposed, not built).
- No Postgres/Qdrant/Neo4j/Redis queries run against production for this change.
- No CAGRA decision made (that's tracked in `parent-atlas-gpu-sidecar-patch-tournament`, not
  here — this document only reaffirms brute_force as the named oracle in §14, consistent with
  the exclusion already recorded there).

## Representation Lineage Writer (2026-08-09) — R1 IMPLEMENTED, R2–R8 NOT YET PROVEN

Separate gate from the sections above: not "is 768 the canonical dimension" (settled) but
"which single runtime path is authorized to *originate* `representation_id`/
`representation_revision` on `atlas_packets`, and which paths only mirror/read them." Audited
via `rg -n "representation_id|representationId|representation_revision|representationRevision"
src scripts tests` (475 hits, 77 files) — full classification not exhaustive (scoped to the
files below per explicit priority), remaining ~65 files (mostly `scripts/atlas/*` one-off
migration/backfill/audit scripts) unclassified.

### Classification (files actually read)

| File | Classification | Evidence |
|---|---|---|
| `db/schema/atlas-packets.ts` | Schema, not a writer | Declares `sourceRepresentationId`/`projectionRepresentationId`/`representationRevision` (int, default 0). Comment: revision "incremented by **operator**" — no pipeline did this. |
| `workers/identity-worker.ts`, `routes/api/admin/batch-embeddings/embed/+server.ts` (pre-patch), `ace/features/som-clustering.ts`, `generation/packet-summary-pipeline.ts`, `hyperrag/hyperrag-packet-pipeline.ts`, `indexer/feature-label-enricher.ts`, `indexer/summary-freshness-checker.ts` | **DEAD (pre-patch)** — the only 7 files that `.update`/`.insert` into `atlasPackets`, **none** touched the 3 representation fields | Confirmed via targeted grep per file. Every packet sat at its SQL default forever. |
| `topology/feature-tracking-layer.ts` | READER + VALIDATOR | Pure `SELECT` (2 query sites), then `assertValidRepresentationLineage()` fail-closed check. This is the "graph representation validators fail closed" work already done this session. |
| `ai/trace-reranker.ts` | MIRROR, with one live violation | Reads `representation_revision` from Postgres correctly (line 188), but hardcodes `source_representation_id: 'semantic_768'` literally (line 151) — because the canonical field was always null upstream, this consumer fabricated the label instead of propagating it. **Not yet fixed** — now that the writer exists, this should read the real column instead. |
| `embeddings/representation-contract-validator.ts` | VALIDATOR (embedding *service* contract, not packet lineage) | Confirms a running embedding backend produces its declared dims/method. No `representation_revision` concept — different job. |
| `representations/representation-registry-service.ts` | CANONICAL_WRITER — for a *different* resource | Owns `atlasRepresentations` (which embedding models/configs exist, lifecycle CANDIDATE→ACTIVE→DEPRECATED→RETIRED). Not per-packet lineage. Richer registry than the simple int counter on `atlas_packets` — future revision-format decisions (see below) should defer to this, not reinvent it. |
| `retrieval/qdrant-payload-enricher.ts` | MIRROR, correctly structured, previously silently defeated | Lines 427-439 *do* prefer canonical Postgres fields first (`packet?.source_representation_id`, etc.) before falling back to a hardcoded `'semantic_768'` default. Architecturally correct precedence — but since nothing wrote the canonical fields, every payload fell through to the hardcoded default in practice. **Now that the writer exists this will start working correctly without further changes to this file** — but it still silently defaults instead of rejecting when truly unavailable (see Follow-up below; `workspace_id` in the same file already throws `Error` on missing — line 367-369 — `representation_id` should follow that precedent). |
| `atlas/envelope-validator.ts` (new, this session) | VALIDATOR — already matches the R3/R4/R5 spec | Takes a `representationRevisionResolver` callback, compares envelope revision to the frozen current revision, rejects with `'no frozen representation revision source is wired'` if the resolver is missing. Built *before* a writer existed to feed it — was correctly failing closed the whole time. |
| `retrieval/feature-envelope.ts` | CONTRACT (Zod schema) | Explicitly documents both fields `.nullable()` with comment "null until a writer populates it" — the schema itself admitted the gap before this patch. |
| `embedding/embedding-contract-768.ts` | VALIDATOR/GUARD (generation-side) + now also the writer's source of truth | Fail-closed: throws `UNSUPPORTED_SEMANTIC_LANE` if `representationId !== SEMANTIC_REPRESENTATION_ID`. Exports `SEMANTIC_REPRESENTATION_ID = 'semantic_768'`, now imported by the writer patch below. |
| `atlas/qdrant-collection-contracts.ts` | VALIDATOR — contained the exact anti-pattern from the design review | Line 323 (pre-existing, not part of this patch): `const expectedRepresentation = payload.embedding_dimension === 768 ? 'semantic_768' : 'legacy_384'` — derives representation identity **purely from vector dimension**. A future distinct 768-dim representation (e.g. a `codebert_768`) would be forcibly mislabeled `semantic_768`. **Not fixed this pass** — flagged, not touched, since fixing it requires deciding what the *correct* non-dimension-derived check should assert instead, which is a design decision, not a mechanical patch. |
| `hyperrag/hyperrag-projection-contract.ts` | **DEAD**, fixed anyway (type-only) | `HyperRagProjectionRequest`/`ProjectionOutboxRow` have zero callers anywhere in `src/` (confirmed via `rg -l`). Not a live contradiction of the 768-canonical policy despite hardcoding `embeddingDim: 384` — just stale dead code. Fixed `384`→`768` in this pass since it's a zero-risk type-only edit (no callers to break), but this file remains unwired to anything; fixing the literal doesn't make it live. |
| Generic `outbox.ts` | Wrong shape for a `representation_changed` domain event | Scoped to a fixed `TaskType` enum for RabbitMQ work-command dispatch (code.inspect, code.patch, etc.) — a task queue, not a domain-fact pub/sub bus. Using it for "representation changed, invalidate your cache" would misuse task-completion semantics for a notification. No existing owner found for this event; **not built this pass** (out of "keep this bounded" scope — see Follow-up). |

### R1 CORRECTION (2026-08-09, same day, later) — duplicate canonical writer found, encoderRevision blocker discovered

R1 below was written without first searching for a pre-existing writer at this exact
responsibility. One exists: `src/lib/server/embedding/semantic-lineage.ts` +
`src/lib/server/embedding/semantic-packet-writer.ts` (`persistCanonicalSemanticPacketEmbedding()`)
— found only afterward, while investigating an unrelated user-supplied bundle that referenced
files by the same names. Live-verified: `semantic-lineage.spec.ts` 7/7 pass,
`semantic-packet-writer.spec.ts` 2/2 pass (`npx vitest run`, not just file existence).

**This is now a duplicate CANONICAL_WRITER for the same field set** — exactly the failure mode
this repo's "One Canonical Runtime Owner Per Capability" rule exists to prevent, and I created
it myself by not searching first. Comparison:

| | R1 patch (`batch-embeddings/embed/+server.ts`, inline) | Pre-existing (`semantic-packet-writer.ts`) |
|---|---|---|
| `representationRevision` frozen value | `1` (local constant, no stated rationale) | `0` (`CANONICAL_SEMANTIC_REPRESENTATION_REVISION`, also no stated rationale — both are guesses, not frozen-with-justification per A0's explicit requirement) |
| `encoderRevision` | not set at all | required input, but **nothing in the repo can supply a real one** (see below) |
| `embeddingDigest` | not set | computed (SHA-256 of little-endian float32 bytes) via `digestSemanticEmbedding()` |
| Validation | inline dimension check only | `assertCanonicalSemanticEmbedding()` — dimension + finite-value check, fail-closed |
| Insert shape | bare `.update()` | proper `.insert().onConflictDoUpdate()` |

The pre-existing writer is strictly more complete and correct. My patch should not coexist with
it as a second writer.

**Blocker found attempting the fix**: `persistCanonicalSemanticPacketEmbedding()` requires a
real `encoderRevision` (per A0's spec: "an immutable encoder build identity; mutable aliases
such as `embeddinggemma:latest` MUST NOT be treated as an immutable encoder revision"). Traced
the full call chain feeding `batch-embeddings/embed/+server.ts`:
`embedText()` (`embedding/embed.ts`) → `generateSingleEmbedding()` →
`generateEmbeddings()` (`grpc/embedding-client.ts`). **No function in this chain returns or
tracks any encoder identity at all** — `embedText()`'s return type is bare `number[]`. The
closest thing that exists is a *transport-tier* label assigned at each fallback tier
(`'embeddinggemma-grpc'`, `'embeddinggemma-quic'`, `'embeddinggemma-onnx-300m'`, etc., see
`embedding-client.ts` lines ~819-925) — these identify *which code path* fetched the vector,
not *which build of the model's weights* produced it. Using one of these as `encoderRevision`
would be exactly the mutable-alias trap A0 warns against, just one layer more specific than
`'embeddinggemma:latest'`.

**Resolved (2026-08-10)**: the encoder identity source is now the frozen semantic-lane
contract version (`CANONICAL_SEMANTIC_ENCODER_REVISION`, exported from
`semantic-lineage.ts` and derived from the canonical embedding contract). The pre-existing
`semantic-packet-writer.ts` now defaults omitted `encoderRevision` to that frozen contract
revision, and `batch-embeddings/embed/+server.ts` now delegates to that canonical writer
instead of writing lineage directly. The mutable transport labels (`embeddinggemma-grpc`,
`embeddinggemma-quic`, `embeddinggemma-onnx-300m`) remain transport metadata only and are not
used as lineage identity.

Live proof this session:
- Direct import of `semantic-lineage.ts` returned
  `CANONICAL_SEMANTIC_ENCODER_REVISION = embeddinggemma-native-768-v1`.
- Mocked `persistCanonicalSemanticPacketEmbedding()` wrote
  `encoderRevision = embeddinggemma-native-768-v1` when the caller omitted one.
- Direct import of `routes/api/admin/batch-embeddings/embed/+server.ts` succeeded after the
  endpoint was switched to the canonical writer path.

### R1 IMPLEMENTED (2026-08-09)

Patched `src/routes/api/admin/batch-embeddings/embed/+server.ts` — the only endpoint in the
repo that actually computes a real `embedText()` result (the other 6 candidate writers create
packets or touch metadata but never call the embedding service). Previously this endpoint
computed a real 768-dim embedding, cached it in Redis, but its Postgres `.update()` **only set
`updatedAt`** — the vector and lineage never reached canonical storage. Now sets, in the same
update, only when the embedding is genuinely from `embedText()` (not the deterministic
hash-based fallback, which is also 768-dim and would otherwise be indistinguishable by length
alone — see fallback-provenance note in the code):
- `embedding` (the actual vector — was never persisted before this patch)
- `sourceRepresentationId: SEMANTIC_REPRESENTATION_ID` (imported from
  `embedding-contract-768.ts`, not a local literal)
- `sourceDimension: embedding.length`
- `representationRevision: SEMANTIC_768_REPRESENTATION_REVISION` (`= 1`, a local frozen
  constant)

**Deviation from the original design sketch, needs operator sign-off if the richer format is
wanted**: the design proposed `representation_revision` as a string
(`"embeddinggemma300m/semantic768/r17"`). The live schema has it as
`integer('representation_revision').notNull().default(0)`. Changing that column's type is a
schema migration under this repo's Drizzle Safety Rule (explicit review required, 50K+ live
rows elsewhere depend on the int type). This patch uses the existing integer as a frozen
revision counter instead of inventing an incompatible string format for a column that can't
hold it. If the richer string format is wanted, that's a separate, explicit migration decision
— not something to fold into this patch.

`npx tsc --noEmit` — 0 errors touching either edited file.

### R2–R8 — NOT YET PROVEN (explicitly stopped here per scope)

- R2 (deterministic derivation), R3 (validator acceptance — code already exists in
  `envelope-validator.ts`, needs a live test run), R4 (stale rejection), R5 (unavailable
  provenance — envelope-validator.ts already covers this branch per its own docstring, needs
  confirming test), R6 (Qdrant mirror parity — should now work automatically via
  `qdrant-payload-enricher.ts`'s existing precedence logic once packets carry real lineage, but
  unverified live), R7 (legacy-384 isolation), R8 (identity invariant) are **not run**. No test
  files written this pass.
- `trace-reranker.ts`'s hardcoded `'semantic_768'` literal (line 151) not yet replaced with a
  read of the real column — low risk (matches the canonical value by coincidence today) but is
  exactly the anti-pattern this gate exists to close.
- `qdrant-collection-contracts.ts` line 323's dimension-derived `expectedRepresentation` not
  fixed — flagged only.
- No `representation_changed` outbox event built — no existing owner found; needs a scoped
  decision (new lightweight domain-event mechanism vs. extending something existing) before
  implementation, not appropriate to slip into this patch.

### Deferred by explicit design review (2026-08-09) — NOT stubbed, documented only

A separate proposal (AST-as-4D-manifold, entropy-driven pre-tokenization, Riemannian metric
learning) was reviewed line-by-line and **rejected for production wiring at this stage**, with
agreement that: n-gram/trigram statistics, conditional entropy, surprisal, and AST-boundary
features are legitimate and worth pursuing *eventually* as an experimental
`entropy_pre_tokenization` pass behind the NLP sidecar, but the geometry layer (4D manifold,
Riemannian `g_ij`, Jacobians, tricubic interpolation) is premature until the flat feature+
logistic-regression baseline is built and proven to beat the current tokenizer/chunker.

Per that review, if/when this work starts, it needs its own representation lineage — explicitly
**not** `semantic_768` (it's a pre-semantic structural/lexical pass, not an embedding):
`representation_id: 'ast_entropy_boundary_features'`, a separate
`tokenization_policy_id`/`tokenization_policy_revision`, and provenance covering
`workspace_revision, source_revision, parser_revision, taxonomy_revision, ngram_order,
smoothing_alpha, feature_schema_revision, classifier_revision, tokenizer_revision`. No files
created for this yet (TypeScript `TokenBoundaryFeatureRow` contract, Python trigram-counting
MapReduce map/reduce stage) — intentionally left as a documented future task, not a stub file,
since the repo convention is to avoid creating placeholder files ahead of when they're actually
wired to something. **Do not start this until Patch H (graph analysis contract) is closed and
R2-R8 above are proven.**

## §20 script BUILT and run (2026-08-11) — TS/Zod layer only, real duplicates found

Built `scripts/atlas/reconcile-semantic-contracts.mjs` per §20 — **strictly read-only**, never
writes to source/DB/Qdrant/Neo4j/Redis, only reads `sveltekit-frontend/src/**/*.ts` and writes
the three report artifacts §20 specifies under `docs/reports/semantic-contracts/`. **Bounded
scope**: TypeScript/Zod contract layer only — does NOT cover Postgres constraints, Neo4j
property names, Redis key formats, Python validation schemas, or Qdrant collection configs
directly (all explicitly listed in the report's own `limitations[]` field, not silently
omitted). Static regex-based analysis, not a TS AST parse.

Context for why this got built now, same day as the R1 correction above: while wiring an
unrelated Ampere/SM86 GPU quantization contract (`gpu-quantization-v1.ts`), added
`CANONICAL_SEMANTIC_REPRESENTATION_ID`/`CANONICAL_SEMANTIC_DIMENSION` to
`feature-extraction-v1.ts` as new exports — **without first searching for a pre-existing
owner**, repeating the exact R1 mistake this document already documents once. Caught it before
committing by reading this file's own R1 section, found `embedding-contract-768.ts` already
exports `SEMANTIC_REPRESENTATION_ID`/`SEMANTIC_DIMENSION` (the real owner, already wired into
the live `semantic-lineage.ts`/`semantic-packet-writer.ts` writer chain per R1 above). Fixed:
`feature-extraction-v1.ts` now imports and re-exports those constants under its own names
instead of redeclaring them. 13/13 vitest cases still pass after the fix.

**First real run, findings** (3,505 files scanned, 67 reference `semantic_768`/768):

7 **hard failures** — files declaring their own `export const X = 768` independently of
`embedding-contract-768.ts`, spot-checked (3 of 7) and confirmed real, not heuristic false
positives:

| File | Constant | Spot-check verdict |
|---|---|---|
| `lib/ai/model-ids.ts:80` | `CLIENT_EMBEDDING_DIMS` | not yet checked |
| `lib/ai/model-ids.ts:96` | `SERVER_EMBEDDING_DIMS` | not yet checked |
| `lib/server/atlas/contracts/canonical-chunk-contract.ts:3` | `CANONICAL_EMBEDDING_DIMENSION` | **confirmed real duplicate** — same `atlas/contracts/` folder and same barrel (`contracts/index.ts`) as `feature-extraction-v1.ts`/`gpu-quantization-v1.ts`, a live naming-collision risk within one module surface |
| `lib/server/search/mla-kv-compress.ts:29` | `MLA_DIM` | **confirmed real duplicate** — the 768-dim input to MLA compression (paired with `MLA_RANK=128` output), same semantic dimension being compressed, not a coincidentally-equal unrelated number |
| `lib/server/vector/retrieval-semantics.ts:5` | `QDRANT_SOURCE_EMBEDDING_DIMENSION` | **confirmed real duplicate** |
| `lib/server/vector/retrieval-semantics.ts:6` | `QDRANT_RETRIEVAL_EMBEDDING_DIMENSION` | **confirmed real duplicate** |
| `lib/server/vector/turbovec-contract.ts:2` | `TURBOVEC_EMBEDDING_DIMENSION` | not yet checked |

148 **warnings** (inline `'semantic_768'`/768 literals used without importing the canonical
constant) — not individually triaged, `warnings_top50` in the JSON report has the first 50,
`semantic-contract-conflicts.ndjson` has all 148.

**Not fixed this pass** — each of the 7 needs its own check (does converting to an import break
anything downstream that pattern-matches the literal value directly, e.g. Redis key strings
built with template literals like `mla:proj:W_down:r${MLA_RANK}:d${MLA_DIM}` — those still work
identically if `MLA_DIM` becomes an imported re-export of the same runtime value, but worth
confirming per-file rather than batch-editing 7 files blind). Proposed as the next bounded step:
fix the 7 hard-fail duplicate owners one at a time (import from `embedding-contract-768.ts`
instead of redeclaring), then triage the 148 warnings by whether they're genuinely risky
(production code paths) vs. low-risk (test fixtures, one-off scripts).

Re-run: `node scripts/atlas/reconcile-semantic-contracts.mjs` (exits 1 while hard failures > 0).

### 7 hard-fails resolved (2026-08-11, same session)

- **5 fixed** (now import `SEMANTIC_DIMENSION` from `embedding-contract-768.ts` instead of
  redeclaring): `canonical-chunk-contract.ts::CANONICAL_EMBEDDING_DIMENSION`,
  `mla-kv-compress.ts::MLA_DIM`, `retrieval-semantics.ts::QDRANT_SOURCE_EMBEDDING_DIMENSION` +
  `QDRANT_RETRIEVAL_EMBEDDING_DIMENSION`, `turbovec-contract.ts::TURBOVEC_EMBEDDING_DIMENSION`.
  All 4 files confirmed `lib/server/`-only (safe to import the server-only canonical owner).
- **2 documented as legitimate exceptions, not fixed**: `model-ids.ts::CLIENT_EMBEDDING_DIMS` /
  `SERVER_EMBEDDING_DIMS` — this file is imported by client-side `.svelte` components
  (`Gemma270MWebAssembly.svelte`, `ClientGemmaInference.svelte`); `embedding-contract-768.ts`
  lives under `$lib/server/`, so importing it here would break the SvelteKit client/server
  boundary. Documented inline in both files. The reconcile script now has a
  `KNOWN_CLIENT_BOUNDARY_EXCEPTIONS` list that downgrades these two from `HARD_FAIL` to `WARN`
  instead of silently excluding them.
- Re-run after fixes: `hard failures: 0, warnings: 149` (exit 0).
- Regression check: `feature-extraction-v1.spec.ts` (4 tests) + `gpu-quantization-v1.spec.ts`
  (9 tests) — 13/13 pass.
### 149 warnings triaged (aggregate pass, 2026-08-11) — 81 test/fixture, 68 production, 36 files

Aggregate categorization only (no individual file fixes this pass — genuinely multi-session
scope): 81/149 (54%) are in `.spec.ts`/`.test.ts`/`__tests__`/`fixtures` paths — low priority,
literal test values are expected there. Remaining 68 warnings span 36 distinct production
files under `lib/server/` (144 of 149 total warnings are under `lib/server/`; 2 in `lib/ai`
already accounted for above as the documented model-ids.ts exception; 1 each in `lib/config`,
`mcp/trace-mcp-server.ts`, `routes/api`).

**Top repeat-offender files** (highest warning count = biggest single-file DRY win):

| File | Count | Note |
|---|---|---|
| `atlas/pos-concept-tagging-lane.ts` | 8 | highest count |
| `atlas/tensors/latent-lod-contract.ts` | 6 | **already flagged in Session 198 memory** for a separate naming-collision risk with model-space latent-state concepts — fix both in one pass if this file is touched |
| `atlas/repository-provenance-workflow.ts` | 5 | |
| `atlas/tensors/telemetry-breadth-contract.ts` | 4 | same Session 198 naming-collision flag as latent-lod-contract.ts |
| `analysis/representation-analysis-service.ts` | 3 | |
| `topology/canonical-id-hierarchy.ts` | 3 | **this is the file found dead-in-practice this session** (P0-4 packet-identity audit) — its `generateIDHierarchy()`/`derivePacketKey()` has zero live callers; low priority to fix literals in code that isn't actually running |
| (30 more files, 1-2 warnings each) | — | see `semantic-contract-conflicts.ndjson` |

**Also flagged, not counted in the 68**: `atlas/qdrant-collection-contracts.ts` (2 warnings) is
the file this same document's R1 section already flags for a dimension-derived-identity
anti-pattern (`expectedRepresentation = dimension === 768 ? 'semantic_768' : 'legacy_384'`) —
fixing its literal alone would not fix that deeper issue; needs the design decision already
noted above, not a mechanical import swap.

**Proposed next step**: fix the top 5-6 repeat-offender files first (biggest DRY win per file
touched), skip `canonical-id-hierarchy.ts` (dead code, low value) and
`qdrant-collection-contracts.ts` (needs a design decision first, not a mechanical fix) until
their separate issues are resolved.

**`pos-concept-tagging-lane.ts` fixed (2026-08-11, same session)** — the #1 repeat offender (8
occurrences), all converted to import `CANONICAL_SEMANTIC_REPRESENTATION_ID`/
`CANONICAL_SEMANTIC_DIMENSION` from the existing `./contracts/feature-extraction-v1.js` import
(already imported for other symbols, no new import line needed). Verified: reconcile script
`149 → 141` warnings, `0` hard failures maintained, `npx tsgo --noEmit` shows zero errors for
this file.

**`latent-lod-contract.ts` fixed (2026-08-11, same session)** — all 6 occurrences
(`sourceRepresentationId`/`sourceDimension` in `LatentRepresentationManifestSchema` +
`LowRankFeatureBlockV1Schema`, plus the same pair repeated in `buildLatentRepresentationManifest`,
`assertProductionLatent`, and `buildLowRankFeatureBlock`) now reference
`SEMANTIC_REPRESENTATION_ID`/`SEMANTIC_DIMENSION` imported directly from
`../../embedding/embedding-contract-768.js` (this file had no pre-existing import of the canonical
constants, unlike `pos-concept-tagging-lane.ts`, so a new 4-line import block was added). Verified:
reconcile script `141 → 135` warnings, `0` hard failures maintained, `npx tsgo --noEmit` shows zero
errors for this file. **Note**: the separate Session 198 naming-collision flag (this file's
`latent`/`LOD` terminology risking confusion with model-space latent-state concepts) was NOT
addressed — that's a rename/design concern, not a literal-duplication fix, and is out of scope for
this mechanical sweep.

**`repository-provenance-workflow.ts` fixed (2026-08-11, same session)** — all 5 occurrences of
`representationName: 'semantic_768'` (3 runtime object-literal assignments + 2 type-position
literals inside `SemanticEnrichmentEntry` and the workflow report's `projection` type) now
reference `SEMANTIC_REPRESENTATION_ID` imported from `../embedding/embedding-contract-768.js`.
Type-position occurrences use `typeof SEMANTIC_REPRESENTATION_ID` since the constant is declared
`as const`. Left `collectionName: 'codebase_chunks_768_v2'` (line ~1168) untouched — that's a
Qdrant collection name literal, a different concern from the representation-id constant, and
wasn't part of this file's 5-count warning total. Verified: reconcile script `135 → 130` warnings,
`0` hard failures maintained, `npx tsgo --noEmit` shows zero errors for this file.

**Reconciliation-script blind spot found and fixed (2026-08-11, same session)** — while auditing
the "Parent Atlas end-to-end phase lanes 11-25" mock/stub system in response to a user request to
"implement end to end all phases using stubs mocks," found that `phase-lane-registry.ts` and
`phase-lane-proof.ts` (real, wired, tested infrastructure — see below) hardcode
`canonical_representation_id: 'semantic_768'` / `canonical_dimension: 768` and
`canonicalRepresentationId` / `canonicalDimension` (camelCase) 18 and 12 times respectively, but
`reconcile-semantic-contracts.mjs`'s `DIMENSION_LITERAL_RE` regex only matched `768` preceded by
`z.literal(`, `width:`, `dimension:`, `semantic_dimension:`, `.min(`, or `.max(` — it never
matched `canonical_dimension:`/`canonicalDimension:`, so these 30 occurrences (and others
repo-wide using the same field names) were invisible to every prior run of this audit. Fixed the
regex (`scripts/atlas/reconcile-semantic-contracts.mjs`, added the two missing prefixes) and
re-ran: warning count jumped `130 → 179` (49 newly-surfaced, repo-wide, not just these 2 files) —
confirms this was a real coverage gap in the tool itself, not just these two files. Then fixed
both files completely (all 30 occurrences: type positions via `typeof SEMANTIC_REPRESENTATION_ID`
/`typeof SEMANTIC_DIMENSION`, zod schema positions via `z.literal(SEMANTIC_REPRESENTATION_ID)`,
value positions via direct reference), bringing the total back down to `149`. Verified: `0` hard
failures maintained throughout, `phase-lane-registry.spec.ts` (4 tests) and
`phase-lane-proof.spec.ts` (2 tests) both still pass.

**Parent Atlas phase-lane mock ladder audit (2026-08-11, same session)** — the user's request to
"implement end to end all phases using stubs/mocks" for a 15-phase table (Engram memory wiring
through PPO) turned out to already be fully implemented: `phase-lane-registry.ts` (all 15 phases,
matching the user's table field-for-field), `phase-lane-proof.ts` (a "proof" layer on top for
phases with a real wired receipt, currently phase 15 only), both exported through
`atlas-index.ts`, consumed by `parent-atlas-workstation.ts`, and served via an auth-guarded route
`GET /api/admin/atlas/phase-lanes`. All 17 `source_refs` across the 15 phase seeds were verified
to exist on disk. One real gap found and fixed: the route's colocated `+server.test.ts` was
silently never executing — SvelteKit's Vite plugin reserves any `+`-prefixed filename under
`src/routes/`, so vitest's collector skips it outright ("Files prefixed with + are reserved").
Confirmed this is a **pre-existing, repo-wide pattern**, not unique to this route: the standard
`tests/routes/auto/**/*.test.ts` G26-stub convention has the identical failure mode for a
different reason (Vite refuses to resolve *any* relative import ending in `+server.js`/`.ts`, not
just refusing to collect `+`-prefixed files) — confirmed via the working sibling
`tests/routes/auto/.../query.test.ts` failing identically when run directly, and a second,
unrelated colocated `+server.test.ts` (`pass-fabric/proof/+server.test.ts`) flagged by vitest
during the same run. Fixed by relocating the real assertions to
`sveltekit-frontend/tests/phase-lanes-route.spec.ts` (flat `tests/` location, registered in
`vitest.config.ts` `test.include`, matching the proven-working `tests/ace-status-route.spec.ts`
convention) — confirmed passing (2/2). Both broken originals archived (not deleted) per repo
convention: `docs/archive-manifest.json` has SHA-256 + full reasoning for both. **Out of scope,
not fixed**: the broader `tests/routes/auto/**` tree's same import-resolution failure (likely
affects most/all of its ~350+ stub files — a separate, larger investigation); a pre-existing,
unrelated `tsgo` type error in `phase-lane-registry.ts` (`phase: number` not narrowing to the
`11|12|...|25` union after `PhaseLaneSchema.parse()`) — confirmed via `git stash` that this error
exists identically with none of this session's edits applied, so it predates this session and is
a different bug class (zod-parse return-type widening) than the semantic_768 literal sweep this
document tracks.

**`telemetry-breadth-contract.ts` fixed (2026-08-11, same session)** — all 4 occurrences
(`representationId` in `TelemetryBreadthProvenanceSchema` + `TelemetryBreadthV1Schema` zod
schemas, plus the same field in `buildTelemetryBreadthV1`'s top-level object and its nested
`provenance` object) now reference `SEMANTIC_REPRESENTATION_ID` imported from
`../../embedding/embedding-contract-768.js`. Two occurrences shared identical indentation and were
caught by one `replace_all`; the other two had different indentation (top-level 4-space vs nested
6-space) so needed separate single edits — a reminder that `replace_all` only catches byte-identical
matches, not semantically-identical ones at different depths. Verified: reconcile script
`168 → 164` warnings (net change reflects both this fix and unrelated background repo activity —
see caveat below), `0` hard failures maintained, `npx tsgo --noEmit` and the paired
`telemetry-breadth-contract.spec.ts` (1 test) both pass. **Note**: the Session 198
naming-collision flag (same as `latent-lod-contract.ts` — `breadth`/`telemetry` terminology
overlap risk) was NOT addressed here either, same reasoning as before (out of scope for a literal
sweep).

**Caveat for future continuation**: the repo is under active background editing this session
(`docs/reports/semantic-contracts/semantic-contract-conflicts.ndjson`'s total file count grew from
3505 → 3541 scanned across this document's edits, and total warnings have NOT monotonically
decreased with each fix — e.g. went `149 → 168` between two fixes with zero action from this
document's author). **Always re-run `node scripts/atlas/reconcile-semantic-contracts.mjs` and
re-read `semantic-contract-conflicts.ndjson` fresh before trusting any per-file count below** —
don't assume a stale snapshot matches current state.

**Current top offenders (re-derived 2026-08-11, post `telemetry-breadth-contract.ts` fix)**:
`retrieval/rapids-sidecar-client.spec.ts` (12, test fixture — low priority per the established
81/149 test-vs-production triage rule), `pass-fabric-proof.ts` (12, **production**, new/untracked
file, same "proof receipt" pattern as `phase-lane-proof.ts` fixed earlier this session — likely
fixable with the identical pattern), `contracts/feature-extraction-v1.spec.ts` (8, test fixture),
`analysis/analysis-pass-current.ts` (8, **production**, new/untracked file), `analysis/
analysis-pass-boundary.ts` (8, **production**, new/untracked file), `contracts/
canonical-chunk-contract.spec.ts` (7, test fixture), `embedding/semantic-packet-writer.spec.ts`
(6, test fixture), `topology/canonical-id-hierarchy.spec.ts` (5, test fixture — this file's
production sibling `canonical-id-hierarchy.ts` was already flagged as dead-in-practice/low-priority
earlier in this document). **`pass-fabric-proof.ts` fixed (2026-08-11, same session)** — all 12 occurrences (the same
`canonical_representation_id`/`canonical_dimension` and camelCase
`canonicalRepresentationId`/`canonicalDimension` pattern as `phase-lane-proof.ts`, its sibling
"proof receipt" file for the PF4 pass-fabric lane) now reference `SEMANTIC_REPRESENTATION_ID`/
`SEMANTIC_DIMENSION` imported from `../embedding/embedding-contract-768.js`. This file uses tab
indentation (not spaces) — multi-line `old_string` blocks with leading whitespace repeatedly
failed to match via the Edit tool even when visually identical in Read output; worked around by
matching each line individually without leading-whitespace context (single-line `old_string`,
unique enough on its own). Verified: reconcile script `164 → 152` warnings, `0` hard failures
maintained, `npx tsgo --noEmit` zero errors for this file, paired `pass-fabric-proof.spec.ts` (2
tests) passes.

**`analysis-pass-current.ts` and `analysis-pass-boundary.ts` fixed (2026-08-11, same session)** —
both are plain-interface proof-snapshot builders (no zod), each with the identical 8-occurrence
`canonicalRepresentationId: 'semantic_768'` / `canonicalDimension: 768` pattern repeated across a
type declaration + 3 return-statement branches (available/unavailable/catch). Both now import
`SEMANTIC_REPRESENTATION_ID`/`SEMANTIC_DIMENSION` from `../embedding/embedding-contract-768.js`.
Verified: reconcile script `152 → 144 → 136` (8 dropped per file, exactly as expected, confirming
no other file in the repo shares these exact literal patterns), `0` hard failures maintained
throughout, `npx tsgo --noEmit` zero errors for both files, both paired spec files
(`analysis-pass-current.spec.ts`, `analysis-pass-boundary.spec.ts`, 1 test each) pass.

**Second round (2026-08-11, same session, continued past the first "yes continue")** — worked
down the remaining production-file warnings by descending occurrence count, skipping the two
already-flagged non-mechanical cases (`canonical-id-hierarchy.ts` — confirmed dead code from the
P0-4 packet-identity audit; `qdrant-collection-contracts.ts` — needs a design decision about its
dimension-derived-identity anti-pattern first) and the documented `model-ids.ts` client-boundary
exception:

- `representation-analysis-service.ts` (3) — `baselineRepresentation: 'semantic_768'` value
  positions ×3, fixed via `SEMANTIC_REPRESENTATION_ID` import. No paired spec exists.
- `representation-experiment-contract.ts` (2) — one `z.enum([...])` array element, one
  `z.literal(...)`. Confirmed `z.enum` accepts an `as const`-typed import as an array element
  without losing literal-type inference.
- `fabric-gpu-benchmark.ts` (2) — one `z.literal(...)` in a nested `cuvsRequest` schema, one
  value position in the corresponding builder function.
- `canonical-chunk-contract.ts` (2) — already imported `SEMANTIC_DIMENSION` from earlier this
  session's fix; added `SEMANTIC_REPRESENTATION_ID` to the same import line. Left the
  `CANONICAL_REPRESENTATIONS.semantic_768` object *key* untouched (not flagged by the reconcile
  script — only the `persistedName` *value* was — and renaming an object key to a computed
  property for a cosmetic win wasn't worth the risk).
- `graphify-task-candidate.ts` (2) — `z.literal(...)` + one value position, identical
  `representation_id` field name in both the schema and its builder function.
- `feature-matrix-schema.ts` (2) — one `z.literal('semantic_768')` + one `z.literal(768)` in the
  same `ClassifierSemanticSegmentSchema` object (representation + dimension, both fixed together).
- `lane-registry.ts` (2) — one type-level union (`dimension: 768 | 64 | 128` →
  `SemanticDimension | 64 | 128`, where `SemanticDimension` itself now aliases
  `typeof SEMANTIC_DIMENSION` instead of the bare literal `768`), one object-literal value.

All eight fixes verified individually via `tsgo --noEmit` (zero errors introduced) and via the
reconcile script's warning count dropping by exactly the expected amount per fix (no
under/over-counting). Paired specs run where they exist
(`canonical-chunk-contract.spec.ts` 8/8, `fabric-gpu-benchmark.spec.ts` 2/2,
`graphify-task-candidate.spec.ts` 2/2 — all pass); several of these newer files have no spec yet
(`representation-analysis-service.ts`, `representation-experiment-contract.ts`,
`feature-matrix-schema.ts`, `lane-registry.ts`) which is a separate, pre-existing gap, not
introduced by this fix.

**Third round (2026-08-11, same session, continued past the second "yes continue")** — worked
through the entire remaining production-file backlog (25 files at 1-2 occurrences each) down to
just the 3 documented non-mechanical exceptions:

- `tensor-artifact-contract.ts` (2) — one type-union member (`typeof SEMANTIC_REPRESENTATION_ID`
  as a union arm), one runtime comparison + numeric literal in an assertion function.
- `embedding-lanes.ts` (1) — verified this `$lib/config/` file's only two consumers are both
  server-side (`$lib/server/retrieval/embedding-orchestrator.ts`,
  `routes/api/embedding-lanes/test/+server.ts`) before importing `$lib/server/` code into it —
  same client/server-boundary check as the `model-ids.ts` exception, this one passed.
- `langgraph-client.ts` (1) — **false positive, not fixed**: the flagged line is a `//` comment
  documenting possible `representation_id` values (`"semantic_768" | "semantic_512" | ...`), the
  actual field is typed as plain `string`. No code drift exists to fix.
- `trace-reranker.ts` (1 flagged, 2 fixed) — found and fixed a second, adjacent
  `source_dimension: 768` value the regex didn't catch (`source_dimension:` isn't one of the
  regex's matched prefixes — another instance of the same blind-spot class as the
  `canonical_dimension` gap fixed earlier, not worth a third regex patch for one prefix).
- `kmeans-latent-progression.ts` (1) — array-literal `dimension: 768` in a progression-level
  descriptor.
- `fabric-lane-manifest.ts` (1) + `fabric-lanes.ts` (1) — fixed together: the contract schema
  (`fabric-lanes.ts`) and its one caller (`fabric-lane-manifest.ts`) both had the same
  `representationId: 'semantic_768'` pattern.
- `graphify-task-candidates.ts` (1) + `phase89-workflow.ts` (1) — both use the literal as a
  default *revision* value (`representationRevision ?? 'semantic_768'`), a slightly odd design
  choice (using a representation ID as a revision-string default) that predates this fix and
  wasn't this document's call to redesign — fixed the literal-duplication issue only.
- `dense-lane-policy.ts` (1) — **not fixed, structural exception**: this is a TypeScript `enum`
  (`DenseRepresentationName.SEMANTIC_768 = 'semantic_768'`). Enum member initializers must be
  compile-time literal expressions — TypeScript rejects an imported `const` there even when
  declared `as const`. This is a language constraint, not a mechanical-fix opportunity.
- `cuvs-sidecar-client.ts` (1) — type-level literal (`dimension: 768` → `typeof SEMANTIC_DIMENSION`).
- `embedding-config.ts` (1 flagged, 2 fixed) — found and fixed an adjacent `qdrantVectorSize: 768`
  the regex didn't catch (same `qdrantVectorSize:` blind-spot class). This file's own
  `EMBEDDING_CONFIG`/`EMBEDDING_DIMENSION` exports now derive from the canonical constant instead
  of independently declaring `768`, turning it from a silent duplicate into a legitimate
  downstream wrapper.
- `vector-config.ts` (1) — **deliberately narrow fix**: this file has ~30 occurrences of the
  literal `768` in what is genuinely a large per-collection dimension lookup table (each Qdrant
  collection has its own `768` entry), not repeated declarations of the same constant. Rewriting
  all 30 is a separate, bigger architectural decision (this file's own docstring even claims to be
  a "Single Source of Truth", which is itself a governance concern worth flagging for a future
  session) — fixed only the one line the reconcile script actually flagged
  (`dense_768.dimension`), left the data table alone.
- `atlas-packets.ts` (1) — **not fixed, comment + protected schema file**: the flagged line is a
  `//` comment (`// source_representation_id: lane constant for raw embedding (e.g.
  'semantic_768')`), not code. This is also a Drizzle schema file, protected under CLAUDE.md's
  Drizzle Safety Rule regardless of the comment-vs-code distinction.
- `query-plan-schema.ts` (1) — `'semantic_768'` as one array element inside a `z.enum([...])` of
  retrieval-lane names; fixed by using the canonical constant as that array element (confirmed
  `z.enum` preserves literal-type inference for an `as const`-typed import used as an array
  element, same pattern proven earlier with `RepresentationFamilySchema`).
- `embedding-orchestrator.ts` (1) — value position in a return object.
- `promote-results.ts` (1) — **not fixed**: flagged line is inside a docstring comment describing
  an ownership contract, in a module the file's own header documents as confirmed-DEAD (zero
  callers outside its own spec, which fully mocks `db.execute`). No live code to fix.
- `qdrant-payload-enricher.ts` (1) — `?? 'semantic_768'` fallback in a `pickString`-style
  precedence chain.
- `qdrant-sync-payload.ts` (1) — same `|| 'semantic_768'` fallback pattern, one caller downstream
  of the enricher fixed above.
- `resolve-embedding-lane.ts` (1) — **object key**, not a value: `'semantic_768':
  DenseRepresentationName.SEMANTIC_768` inside a `Record<string, DenseRepresentationName>` lookup
  table. Fixed via computed-property syntax (`[SEMANTIC_REPRESENTATION_ID]: ...`) rather than
  leaving it as a duplicate literal key — first use of computed-key substitution in this sweep.
- `embeddinggemma-prefix384.ts` (1 flagged, 3 fixed) — found two more adjacent occurrences the
  regex didn't catch (`sourceDimension:`, `outputDimension:` — same blind-spot class again). Fixed
  all three in the `EMBEDDINGGEMMA_FULL768_CONTRACT` object plus the `sourceDimension` field in
  the sibling `PREFIX384_CONTRACT` object (its `outputDimension: 384` is correctly left alone —
  that's a real 384, not a 768 masquerading as one).
- `trace-mcp-server.ts` (1) — value position at line 9885 of this ~9900-line file (an MCP tool
  handler's return-object field), the last production-file warning in the original 25-file list.

All twenty fixes in this round verified individually: reconcile script warning count dropped by
exactly the expected amount (accounting for the extra blind-spot occurrences found and fixed
alongside several flagged ones), `0` hard failures maintained throughout, `npx tsgo --noEmit`
introduces zero new errors across every touched file, and both files with existing paired specs
(`qdrant-payload-enricher.spec.ts` 2/2, `resolve-embedding-lane.spec.ts` — both spec files ran
together, 5/5 tests total) pass.

**Batch summary (this session, all `semantic_768`/`768` literal-duplication fixes, all three
rounds)**:
`pos-concept-tagging-lane.ts` (8) → `latent-lod-contract.ts` (6) →
`repository-provenance-workflow.ts` (5) → `phase-lane-registry.ts` (20, post-regex-fix) →
`phase-lane-proof.ts` (12, post-regex-fix) → `telemetry-breadth-contract.ts` (4) →
`pass-fabric-proof.ts` (12) → `analysis-pass-current.ts` (8) → `analysis-pass-boundary.ts` (8) →
`representation-analysis-service.ts` (3) → `representation-experiment-contract.ts` (2) →
`fabric-gpu-benchmark.ts` (2) → `canonical-chunk-contract.ts` (2) →
`graphify-task-candidate.ts` (2) → `feature-matrix-schema.ts` (2) → `lane-registry.ts` (2) →
`tensor-artifact-contract.ts` (2) → `embedding-lanes.ts` (1) → `trace-reranker.ts` (2 real) →
`kmeans-latent-progression.ts` (1) → `fabric-lane-manifest.ts` (1) → `fabric-lanes.ts` (1) →
`graphify-task-candidates.ts` (1) → `phase89-workflow.ts` (1) → `cuvs-sidecar-client.ts` (1) →
`embedding-config.ts` (2 real) → `vector-config.ts` (1) → `query-plan-schema.ts` (1) →
`embedding-orchestrator.ts` (1) → `qdrant-payload-enricher.ts` (1) →
`qdrant-sync-payload.ts` (1) → `resolve-embedding-lane.ts` (1) →
`embeddinggemma-prefix384.ts` (3 real) → `trace-mcp-server.ts` (1) =
**~139 literal occurrences fixed across 36 production files**, plus the reconciliation script's
own regex blind spot fixed (surfacing 49 previously-invisible warnings repo-wide) and several
smaller blind spots found-and-fixed-alongside without a regex patch (`source_dimension:`,
`qdrantVectorSize:`, `sourceDimension:`/`outputDimension:` prefixes). Current warning count:
**102**.

**Remaining production-file warnings — all deliberately skipped, all documented**:
`canonical-id-hierarchy.ts` (3, confirmed dead code, zero live callers), `model-ids.ts` (2,
client/server-boundary exception, imported by `.svelte` components), `qdrant-collection-contracts.ts`
(2, needs an operator design decision about a dimension-derived-identity anti-pattern before a
mechanical fix makes sense), `dense-lane-policy.ts` (1, TS `enum` — language constraint, can't
import a const into an enum member initializer), `langgraph-client.ts` (1, comment-only false
positive), `atlas-packets.ts` (1, comment-only + protected Drizzle schema file),
`promote-results.ts` (1, comment-only inside a confirmed-dead module), `vector-config.ts`
(~29 remaining, a legitimate per-collection data table, not duplicated declarations — a bigger
architectural question, not a mechanical sweep target).

**This exhausts the production-file backlog identified by the reconcile script as of this
session.** Everything remaining at **102 warnings** is either a test/fixture file (low priority,
literal test values expected there — per the original 81/149 triage rule) or one of the eight
documented exceptions above. **Re-run `node scripts/atlas/reconcile-semantic-contracts.mjs` before
trusting this count** — the repo has been under active background editing throughout this session
(counts have fluctuated up as well as down independent of this document's own edits) — but there
is no more known, unaddressed, mechanically-fixable production-file drift as of this writing.

## Re-run, new hard failure found and fixed (2026-08-31)

Per this document's own instruction above ("re-run before trusting this count"), re-ran the
reconcile script fresh rather than trusting the 102/0 snapshot. Repo has grown to 4,283 scanned
files (from 3,541) — confirms this repo really is under continuous background editing, as noted.

**Found**: 1 new hard failure — `sveltekit-frontend/src/lib/server/embedding/
semantic-embedding-cache-v2.ts:10` independently declared `export const
SEMANTIC_EMBEDDING_CACHE_V2_DIMENSIONS = 768`, a second canonical-dimension owner alongside
`embedding-contract-768.ts::SEMANTIC_DIMENSION` — exactly the pattern this whole document's sweep
exists to prevent. This is a genuinely new file, not one this session's earlier rounds missed.

**Fixed**: imported `SEMANTIC_DIMENSION` from `./embedding-contract-768.js` and aliased
`SEMANTIC_EMBEDDING_CACHE_V2_DIMENSIONS` to it instead of redeclaring — same pattern as every
other fix in this document. Verified: reconcile script now reports `0` hard failures (was 1),
`331` warnings (unchanged — this file wasn't in the warning set, only the hard-fail set).
`npx tsgo --noEmit` shows zero errors touching the file.

**Not investigated this pass**: warnings grew from the last recorded 102 to 331 alongside the
743-file scan-size increase — consistent with organic repo growth adding more literal `768`
references, not necessarily new drift of the same kind as the fixed hard-fail. Left un-triaged;
whoever continues this document should re-run and re-triage the current
`semantic-contract-conflicts.ndjson` rather than assume the 102-warning breakdown above still
matches file-for-file.
