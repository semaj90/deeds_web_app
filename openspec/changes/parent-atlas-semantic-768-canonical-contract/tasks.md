# Tasks — Semantic 768 Canonical Contract

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
