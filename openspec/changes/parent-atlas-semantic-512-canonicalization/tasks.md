# Parent Atlas semantic_512 canonicalization — proof sequence

**⛔ SUPERSEDED, 2026-08-23 — operator decision.** This freeze is no longer canonical policy.
Presented with live ground-truth evidence that this doc's own stated premise ("no production
768-dimensional Qdrant corpus was created") did not hold even at the time this freeze was written
(Postgres's truth column and a Qdrant mirror were both already natively 768-dim, populated weeks
earlier), the operator reversed this decision and confirmed `semantic_768` as canonical instead.
See `openspec/changes/parent-atlas-semantic-768-canonical-contract/proposal.md` (now `ACCEPTED`)
and root `CLAUDE.md`'s embedding-dimensions policy for the current, authoritative rule. Full
forensic trace of the whole conflict (5 rounds of undocumented re-decision across less than a
month) is in `openspec/changes/codereview-semantic-dimension-regression-aug22/tasks.md` section 1.
**Everything below this point is historical record, not current policy** — kept for its real
audit/proof-sequence value (the S180-6B live-storage corrections, the writer-lineage findings)
but the frozen `semantic_512`-as-canonical conclusion itself no longer applies.

Operator correction (2026-08-19): the persisted EmbeddingGemma test corpus that actually exists is 512-dimensional; a production/canonical 768-dimensional Qdrant corpus was not created. Do not promote an assumed 768 store merely because EmbeddingGemma's native output is 768.

Live-storage correction (2026-08-19): the read-only S180-6B audit proved that live `atlas_packets` has complete `source_ref` but **no literal `source_revision` column**. Do not synthesize source revision from `workspace_revision`, `representation_revision`, vector dimension, timestamps, or Qdrant point IDs. Source freshness is a separate mutation-awareness proof.

Historical-512 correction (2026-08-19): `scripts/atlas/phase-embedding-lanes-qdrant-sync.mts` created `codebase_chunks_512` with `point.id = codebase_chunk_index.id`, but its payload used placeholder identity: `packet_key=packet:<id>` and `source_ref=content_hash.slice(0,16)`. Therefore the existing 512 vectors may be reusable, but their old payload identity is not authoritative.

## Frozen representation contract

```text
EmbeddingGemma native output (768)
        |
        | MRL prefix [0:512] + L2 re-normalize
        v
semantic_512                 CANONICAL PERSISTED SEMANTIC REPRESENTATION
        |
        +--> Qdrant codebase_chunks_512 / cosine        online ANN candidate executor
        +--> cuVS brute_force / cosine                  exact bounded oracle
        |
        +--> Autoencoder 512 -> 256 -> 64
                         |
                         v
                     latent_64                          ROUTING ONLY
                         |
                         +--> cuML KMeans (seeded)
                         +--> routing centroids/cluster IDs
                         +--> codebase_topology_64_v2
```

Candidate buckets `32/64/128/256/512` are row counts and are unrelated to semantic vector dimensionality.

## Source / mutation contract

```text
source_ref
   |
   +--> graph snapshot node content hash
   +--> current packet/source hash when same hash contract is proven
   +--> git_mutation_provenance.source_refs[] / changed_files[]
   +--> snapshot created/finalized time
   +--> topology hash
   v
MutationAwarenessReceiptV1
   |
   +--> FRESH
   +--> UNKNOWN
   +--> STALE
   +--> MISSING
```

Rules:

- `semantic_512`, legacy 768 metadata, `latent_64`, workspace revision and representation revision are **representation/state lineage**, not source freshness.
- `FRESH`: rankable and eligible for later exact source/AST/type promotion.
- `UNKNOWN`: rankable for recall, but exact source promotion remains blocked/degraded until current source evidence is hydrated.
- `STALE`: excluded from execution candidates and ContextManifest; rehydrate/reindex first.
- `MISSING`: excluded from execution candidates; restore canonical packet/source first.
- A graph snapshot fallback hash derived from packet metadata MUST NOT be compared to a later raw source SHA-256 as though both hashes had the same contract.
- Git/source paths are slash-normalized for mutation matching but case is preserved.

## Reconciliation contract

The historical 512 payload must be repaired through proven joins rather than trusted directly:

```text
Qdrant codebase_chunks_512 point.id
               |
               v
codebase_chunk_index.id
               |
       +-------+--------+
       |                |
       v                v
   source_ref      content_hash
       |                |
       +-------+--------+
               v
       atlas_packets candidates
               |
       strong identifiers converge?
          /                 \
        yes                  no
         |                    |
         v                    v
     ADMITTED           REVIEW / REJECTED
         |
         v
SourceVersionReceiptV1
+
Semantic512ReconciliationReceiptV1
```

Match policy:

- expected canonical packet key from `source_ref + content_hash` is strongest;
- `content_hash -> packet_id` and `Qdrant point.id -> artifact_id` are corroborating strong identifiers;
- `source_ref` alone is insufficient and is `REVIEW`;
- ambiguous top matches are `REVIEW`;
- missing chunk/packet, conflicting source ref, or invalid/non-512 vector is not admitted;
- reconciliation runs in PostgreSQL `REPEATABLE READ` read-only mode and records `pg_current_snapshot()`;
- every reconciled row records a float32 semantic vector digest so later training detects a changed Qdrant vector;
- Qdrant payload mutation is a separate optional operator step and requires the reviewed dry-run manifest checksum.

## Identity rules

- PostgreSQL owns packet/source identity.
- Qdrant point IDs, KNN row ordinals, KMeans labels, and latent vectors never mint identity.
- `packet_key` is mandatory for exact-KNN row identity. `source_revision` is optional because no canonical live owner exists today.
- Source freshness is proven by `MutationAwarenessReceiptV1` / `SourceVersionReceiptV1`, not by the KNN identity manifest.
- `tree_node_id` is conditional structural evidence and may be null until its Tree-sitter/GIS owner resolves it; never fabricate it.
- `feature_label` is derived classification evidence and may be null; KNN/KMeans/PageRank never produce it.
- Every admitted AE row must cite `packet_key`, true `source_ref`, `semantic_512`, source-version receipt ID, reconciliation receipt ID, and its semantic vector digest.
- Every `latent_64` row must preserve the reconciliation/source-version receipt IDs and cite `source_representation_id=semantic_512` plus `autoencoder_revision`.
- Every KMeans assignment must cite the latent/AE revision, reconciliation receipt, algorithm revision and fixed random seed.

## Proof gates

- [x] S512-0 — Representation semantics frozen: persisted canonical `semantic_512`, model-native dimension recorded separately as 768.
- [x] S512-1 — Query projection implemented: first 512 EmbeddingGemma dimensions + explicit L2 re-normalization.
- [x] S512-2 — Qdrant bounded scorer targets existing `codebase_chunks_512` unnamed cosine collection and joins only by `packet_key` after reconciliation.
- [x] S512-3 — cuVS exact endpoint implemented with explicit `metric="cosine"`; legacy 768/sqeuclidean smoke endpoint remains separate.
- [x] S512-4 — SvelteKit synthesis can exact-rerank the same bounded Qdrant rows on cuVS; fails open when identity/GPU is unavailable.
- [x] S512-5 — Autoencoder trainer is `512 -> 256 -> 64` and now consumes only an admitted, checksum-verified reconciliation manifest; it re-retrieves exact Qdrant point IDs and verifies each semantic vector digest before training.
- [x] S512-6 — cuML KMeans executor runs over `latent_64`, with explicit `random_state`, algorithm revision, centroids, inertia, reconciliation receipt, and identity-preserving assignments.
- [x] S512-7 — Separate rebuildable `codebase_topology_64_v2` routing projection materializer preserves source/ref/reconciliation lineage and never mutates semantic_512 evidence.
- [x] S512-8 — Routed-topK evaluation endpoint reports Recall@K against full semantic_512 cuVS exact oracle and fails open to full exact corpus when routing is too narrow.
- [x] S512-9A — Live-schema source-version audit reconciled: `source_ref` exists; canonical `source_revision` does not. Fabrication is forbidden.
- [x] S512-9B — `MutationAwarenessReceiptV1` implemented over graph snapshot time/topology, trusted packet SHA parity, and tracked Git mutations.
- [x] S512-9C — Synthesis DAG excludes `STALE/MISSING` source occurrences before GPU bucket/ContextManifest construction and exposes UNKNOWN as degraded freshness.
- [x] S512-9D — Source-ref path normalization added for Git mutation matching; derived snapshot hash vs raw SHA mismatch is guarded.
- [x] S512-9E — cuVS exact-v2 identity decoupled from nonexistent `source_revision`; packet_key remains deterministic row identity and freshness is externally receipted.
- [x] S512-9F — AE/KMeans offline admission/materialization now uses `packet_key + source_ref + representation lineage + source-version/reconciliation receipts`; `source_revision` is never invented.
- [x] S512-9G — Read-only `codebase_chunks_512 -> codebase_chunk_index -> atlas_packets` reconciliation implementation added with ADMITTED/REVIEW/REJECTED classification, vector digests, Postgres snapshot receipt, deterministic manifest checksum, and checksum-gated optional Qdrant payload repair. **Runtime execution is still pending.**
- [x] S512-10 — Execute live semantic_512 reconciliation + Qdrant smoke: collection dimension=512, cosine, nonzero rows, admitted/review/rejected counts, packet_key/source_ref coverage, and representation lineage reported. `source_revision` absence is not a failure. **Executed 2026-08-21 — see finding below: 0 ADMITTED, blocks S512-11+.**
- [ ] S512-11 — Execute live cuVS cosine-v2 proof on real admitted 512 rows and compare exact top-K with Qdrant HNSW Recall@K.
- [ ] S512-12 — Train AE on admitted real 512 corpus only after S512-10; reject if validation/neighborhood metrics fail threshold.
- [ ] S512-13 — Compare AE-64 against deterministic PCA-64 baseline on exact-neighbor Recall@K/MRR/NDCG and routing latency.
- [ ] S512-14 — Fit seeded KMeans, materialize routing projection, and measure cluster-route Recall@K against full 512 exact oracle.
- [ ] S512-15 — Promote routing only if it reduces candidate work without breaching retrieval recall budget; otherwise keep latent/KMeans reference-only.
- [ ] S512-16 — Exact promotion proves **current** source span + Tree-sitter structural identity + compiler-semantic evidence and resolves UNKNOWN freshness before LLM synthesis.
- [ ] S512-17 — Reconcile older 384/768 documentation, pgvector columns and enums only after runtime proof; do not break broad consumers with an unproven rename.

## Operator proof sequence

Read-only reconciliation (no DB or Qdrant writes):

```bash
python python/atlas_semantic512_reconcile.py \
  --manifest-out data/atlas-ml/semantic512-reconciliation.ndjson \
  --receipt-out data/atlas-ml/semantic512-reconciliation-receipt.json
```

Review `classificationCounts`, every `REVIEW`/`REJECTED` class, and the receipt's `manifestChecksum`. Only then, if payload repair is desired:

```bash
python python/atlas_semantic512_reconcile.py \
  --apply-payload \
  --expected-manifest-checksum <REVIEWED_SHA256>
```

Training is downstream of the reviewed receipt:

```bash
python python/atlas_semantic512_autoencoder_train.py \
  --reconciliation-manifest data/atlas-ml/semantic512-reconciliation.ndjson \
  --reconciliation-receipt data/atlas-ml/semantic512-reconciliation-receipt.json
```

Then KMeans/routing remains dry-run unless explicitly applied:

```bash
python python/atlas_semantic512_build_routing.py
python python/atlas_semantic512_build_routing.py --apply
```

## Promotion invariant

```text
source_ref mutation gate
      |
      +-- STALE/MISSING --> rehydrate, no DAG execution
      |
      +-- FRESH/UNKNOWN
              |
              v
Qdrant ANN candidate
      |
      v
cuVS semantic_512 exact cosine
      |
      +-- optional latent_64/KMeans routing feature
      +-- BM25 lexical feature
      +-- AST/compiler feature
      +-- PageRank/PPR graph feature
      v
CandidateFeatureMatrix
      v
exact current source/AST/type promotion
      v
ContextManifestV1
      v
synthesis
```

No derived executor gets an independent RRF vote merely because it uses a different backend. Vector dimensionality is never a source mutation/version signal.

## Clarification: native 768 is not discarded (2026-08-21)

`semantic_512` being the canonical **persisted/searched** representation does not mean the native
768-dim output stops mattering — it remains the required source vector that 512 (and 256/128) are
derived from via MRL prefix + L2 renorm (`truncateEmbeddingGemmaMrl()`,
`sveltekit-frontend/src/lib/server/embedding/embedding-contract-768.ts`). Any embedding executor
(Ollama, a local llama.cpp GGUF, SentenceTransformers, etc.) must still produce a valid, finite,
correctly-normalized 768-dim native vector — that's the thing that gets validated for executor
parity/swap-compatibility — before the 512-dim projection step ever runs. An executor that can't
produce a trustworthy native 768 output can't produce a trustworthy semantic_512 either.

Supporting evidence: a same-day proof session (see `memory/SESSION-201-EG-GGUF-PROOF-GATES-0-2.md`
in the operator's Claude memory) independently validated a local Q8_0 GGUF executor's native
768-dim output — determinism across repeated calls and cold restarts, ~0.999 cosine parity against
a SentenceTransformers FP32 reference on 8 sample texts, and clean pass-through of a real
GGUF-sourced vector into `buildCanonicalSemanticLineage()` +
`deriveEmbeddingGemmaMrlProjection(vector, 512)` with zero disruption to representation identity —
before this doc's 2026-08-19 correction was known to that session. That native-768 proof layer is
orthogonal to, and does not need to be redone by, the semantic_512 canonicalization work above; it
validates the input side of the MRL derivation, not the persisted-representation decision itself.

## Code migration executed (2026-08-21)

The actual constant migration this doc's earlier "STALE" warnings deferred is now done for
Atlas's own scope. `qdrant-semantic-projection.ts` (`src/lib/server/atlas/retrieval/`) was already
the correct owner (`ATLAS_CANONICAL_SEMANTIC_REPRESENTATION = 'semantic_512'`,
`ATLAS_CANONICAL_SEMANTIC_DIMENSION = 512`, `QDRANT_SEMANTIC_COLLECTION = 'codebase_chunks_512'`)
— this session repointed the genuinely Atlas-scoped consumers of `embedding-contract-768.ts`'s
shared 768 constants to import from there instead, via `as`-aliased imports so each file's own
code needed zero further changes.

**Deliberately did NOT flip `embedding-contract-768.ts` itself.** It is legitimately shared
between Atlas and a separate, real, populated general-corpus codebase-RAG lane
(`codebase_chunks_768` / `codebase_chunks_768_v2`, 52,380 points, used by `unified-orchestrator.ts`,
the dual-lane RRF endpoint, etc. — documented as its own canonical lane in root `CLAUDE.md`'s
Qdrant Collections table). Flipping the shared constants would have broken that separate lane.
Same vector dimension never implies the same representation identity (per this repo's own
duplication-prevention rule) — verified this directly via a 49-consumer read-only audit before
touching anything: 26 files were genuinely Atlas-scoped and needed the 512 migration; 12 were
correctly targeting the separate general 768 corpus and were left alone; 11 were already correct
(native-768 lineage assertions, MRL-aware, or an unrelated fallback lane).

**21 of the 26 flagged files were migrated** (one subagent, stopped by the operator partway
through and completed by hand for the remainder — both produced identical, clean, minimal-diff
import-aliasing edits, verified via `npx tsgo --noEmit` after every batch with zero regressions in
any touched file):
`semantic-lineage.ts`, `qdrant-sync-payload.ts`, `trace-mcp-server.ts`, `phase-lane-registry.ts`,
`fabric-gpu-benchmark.ts`, `tensor-artifact-contract.ts`, `atlas-rapids-knn-client.ts` (+ its
spec), `pass-fabric-proof.ts`, `embeddinggemma-prefix384.ts`, `cuvs-sidecar-client.ts` (import
only — see the full rewrite in `parent-atlas-graph-retrieval-proof/tasks.md` GS1.51),
`phase89-workflow.ts`, `graphify-task-candidates.ts`, `fabric-lane-manifest.ts`, `fabric-lanes.ts`,
`lane-registry.ts`, `feature-matrix-schema.ts`, `graphify-task-candidate.ts`,
`canonical-chunk-contract.ts`, `analysis-pass-boundary.ts`, `analysis-pass-current.ts`,
`telemetry-breadth-contract.ts`, `phase-lane-proof.ts`, `feature-extraction-v1.ts` — plus a
cascading fix in `source-pos-concept-packet.ts` (three hardcoded `'semantic_768'` string literals
bypassing the type system entirely, only surfaced by the typecheck after the schema they fed into
was correctly migrated).

**2 of the 26 were false positives on the original audit — correctly left untouched, not
migrated**: `redis-cache-aggressive.ts` (its `assertSemantic768()` calls and `semantic_768`-named
cache keys genuinely cache native 768-dim artifacts — raw query embeddings, SOM centroids matching
`som-routing.ts`'s real `SEMANTIC_768_EXPERIMENT` lineage value — not a canonical-representation
claim) and `repository-provenance-workflow.ts` (its `representationName` field is written
alongside a hardcoded `collectionName: 'codebase_chunks_768_v2'` — the separate general corpus —
so 768 there is honest, not stale).

**One real near-miss, caught by operator interrupt, not by the agent**: the first pass at
`canonical-chunk-contract.ts` — the actual `CANONICAL_REPRESENTATIONS` registry object, not a
single-value assertion site — collapsed its `semantic_768` entry into `semantic_512` entirely
rather than adding 512 alongside it. This would have broken two real, live consumers: the cuVS
exact-KNN sidecar (`python/atlas_rapids_sidecar.py` hardcodes `_EXPECTED_DIMENSION = 768`, proven
live this same session — see `parent-atlas-graph-retrieval-proof/tasks.md` GS1.51) and
`som-routing.ts`'s `trainedFrom: 'SEMANTIC_768_EXPERIMENT'` lineage value. Fixed: the registry now
carries both entries — `semantic_512: ACTIVE` (canonical persisted), `semantic_768: EXPERIMENTAL`
(real, live, native-source — not the persisted lane, but not fake either). **Lesson for future
migrations touching this registry pattern**: a file that *enumerates* multiple coexisting
representations needs individual per-entry judgment, not the same blanket import-aliasing template
that's correct for every single-value assertion site. Checked all other 25 files for the same
multi-enum-collapse risk before finishing (`z.enum([...SEMANTIC_REPRESENTATION_ID...])` grep across
every touched file) — `canonical-chunk-contract.ts` was the only one with this shape.

Remaining: no other Atlas-scoped consumer of `embedding-contract-768.ts`'s 768 constants is known
to exist as of this session. `dataset-export.ts` and four other pre-existing typecheck errors
surfaced during verification are unrelated pre-existing baseline issues (confirmed via `git diff`
— none of those files were touched by this migration) and are out of this change's scope.

## S512-10 executed live (2026-08-21) — real bug found + fixed, real result blocks S512-11+

Ran `python/atlas_semantic512_reconcile.py` read-only against the live Postgres
(`legal_ai_db`, snapshot `5952977:5952977:`) and live Qdrant (`codebase_chunks_512`,
`points_count=53379`, `dimension=512`, `distance=Cosine`, confirmed via
`GET /collections/codebase_chunks_512`).

**Bug found and fixed before the script could produce a real result**: the script assumed
`Qdrant point.id == codebase_chunk_index.id` (a uuid) for every point and built its Postgres
lookup with `int(point["id"])` whenever the id looked numeric, then queried
`WHERE id = ANY(%s)` against the uuid column — a guaranteed `UndefinedFunction: operator does
not exist: uuid = integer` crash on first page. Root cause, confirmed by direct inspection of
both stores: `codebase_chunks_512` is not one producer's output, it's **two producer
generations mixed in the same collection**:
- ~52,380 points from the original `phase-embedding-lanes-qdrant-sync.mts` sync, where
  `point.id` *is* `codebase_chunk_index.id` directly (a uuid) — matches this doc's original
  stated assumption.
- 999 points (`payload.embedding_lane == 'fallback-512d'`) from a later backfill
  (`phase4SyncFallback512d` in the same file), which reused whichever small integer point id
  the *source* `codebase_chunks_768` collection happened to have for that chunk, and instead
  stamped the true `codebase_chunk_index.id` into `payload.representation_id` — every one of
  the 999 fallback points does carry a valid `representation_id` (verified by direct count:
  `999/999`), so all 53,379 points are in fact resolvable, just not by a single lookup rule.

Fixed via `resolve_chunk_lookup_id()`: use `point.id` when it's uuid-shaped, else fall back to
`payload.representation_id` when *that's* uuid-shaped, else the row is unresolvable (none were,
in this corpus). `chunk_rows()` now casts explicitly (`WHERE id = ANY(%s::uuid[])`). All 6
existing unit tests still pass unchanged (they exercise `classify_candidate`/`build_row`
directly with synthetic dicts, not the id-resolution path).

**Real result after the fix (no crash, no fabrication)**:
```json
{"rowCount": 53379, "admittedCount": 0, "reviewCount": 53379, "rejectedCount": 0,
 "classificationCounts": {"SOURCE_REF_ONLY_MATCH": 53379}}
```
Manifest (`data/atlas-ml/semantic512-reconciliation.ndjson`, 53,379 lines) and receipt
(`data/atlas-ml/semantic512-reconciliation-receipt.json`) written for real, from a live
`REPEATABLE READ` read-only Postgres snapshot + live Qdrant scroll — not synthesized.

**Why 0 ADMITTED is a real finding, not a bug**: `expected_packet_key()` builds
`f"{source_ref}:{content_hash[:16]}"` and treats a match against `atlas_packets.packet_key` as
the strongest identity signal. But every live `packet_key` in `atlas_packets` uses the
`ace:packet:<12hex>` scheme (confirmed via direct query) — a format that has no relationship to
`source_ref:content_hash[:16]`. `content_hash == packet_id` and `point_id == artifact_id` also
never hit (verified: `packet_id` values are things like
`packet_164_1784513267460`, unrelated to Qdrant's content hashes or point ids). Only the weak
`SOURCE_REF` signal (score 10, insufficient alone) matches, because many `atlas_packets` rows
share the same `source_ref` (e.g. many packets per `AGENTS.md` file) — so 100% of rows land in
`REVIEW: SOURCE_REF_ONLY_MATCH`, never `ADMITTED`. The `atlas_packet_identity_aliases` table
built in a prior session (Session 200, `packet:<hash>` → `ace:packet:<hash>` prefix-typo fix)
does **not** apply here — it resolves a different, already-`ace:packet:`-shaped alias, not the
`source_ref:content_hash[:16]` scheme this script expects to find. As of this session, no
component of `atlas_packets` encodes identity in the `source_ref:content_hash[:16]` shape at
all.

**Consequence for the remaining gates**: S512-11 through S512-15 all consume "admitted, real
512 rows" — with 0 admitted, they are blocked. **Operator correction (2026-08-21, superseding
the "(a)/(b)" framing above)**: do not fix this by loosening `expected_packet_key()`'s format
match, and do not weaken S512-10's ADMITTED definition to mean "exists in
`codebase_chunk_index`" — `atlas_packets.packet_key` as real canonical identity is a central
Parent Atlas invariant and stays unchanged. The missing artifact is a dedicated identity
reconciliation *layer* between Qdrant/`codebase_chunk_index` and `atlas_packets`, not a format
fix to one script. See the new `S512-ID*` gate family below, which now gates S512-10.

## S512-ID gate family (2026-08-21) — bounded chunk↔packet identity reconciliation, precedes S512-10

Inserted **before** S512-10 per operator direction. S512-10's ADMITTED requirement (real
`atlas_packets.packet_key`, unchanged) stays exactly as originally specified; what changes is
*how* a row earns that status. This family produces a separate, additive artifact —
`AtlasChunkPacketIdentityLinkV1` rows in the new `atlas_chunk_packet_identity_links` table
(`sveltekit-frontend/drizzle/manual/atlas_chunk_packet_identity_links.sql`) — and never mints
new `atlas_packets` rows. Minting a genuinely-missing canonical packet is a separate,
human-gated contract (`CanonicalPacketCreationProposalV1`, not implemented) that only follows
from a reviewed `MISSING_CANONICAL_PACKET` decision, never automatically from an UNRESOLVED
linkage row.

- [x] S512-ID0 — Cross-store identity census: **PROVEN**. Confirmed empirically (live queries,
      not assumption) that four identifier namespaces coexist and do not converge:
      1. `atlas_packets.packet_key` — `ace:packet:<12hex>`
      2. `codebase_chunk_index.metadata->>'packet_key'` — `sha256:<64hex>` (14,643/52,417 rows) or bare uuid
      3. `atlas_source_refs.source_ref_key` — namespace A (`path#Lstart-end` / `#file`)
      4. `atlas_packets.source_ref_key` — namespace B; **0 rows** join to namespace A despite
         both being populated (61,660 / 61,437 rows respectively)
      Also confirmed: `atlas_packets` has **0 rows** tagged `qdrant_collection =
      'codebase_chunks_512'`; `atlas_packets.byte_start`/`byte_end` are **100% NULL**
      (0/61,660); `codebase_chunk_index` has **0%** populated `tree_node_id` (via either
      `metadata->>'tree_node_id'` or `output_meta->>'tree_node_id'`, both checked) against
      `atlas_packets.tree_node_id` (99.998% populated, 61,659/61,660); `atlas_packets.sha256`
      (4,715/61,660 populated) has **0** direct matches against
      `codebase_chunk_index.content_hash`; `atlas_source_refs.content_hash` matches
      `codebase_chunk_index.content_hash` for 15,853/52,417 rows (~30%, a real bridge) but that
      bridge does not reach `atlas_packets` through any column tried (`source_ref_key` — 0 hits;
      `relative_path + qualified_symbol` vs `file_path + function_symbol` — 0 hits, and
      `function_symbol` is populated on only 61/61,660 `atlas_packets` rows to begin with).
- [x] S512-ID1 — Candidate identity derivation: **EXECUTED**. Built
      `python/atlas_chunk_packet_identity_linker.py` (read-only by default; `--apply-links`
      writes only to the new additive table, never to `atlas_packets`/`codebase_chunk_index`/
      Qdrant). Matching order, strongest evidence first, each tier only consulted when the
      prior tier found zero candidates (2+ candidates always classifies `AMBIGUOUS` and stops):
      1. `EXACT_CANONICAL_ID` — existing `atlas_packets` row already tagged
         `(qdrant_collection, qdrant_point_id)` for this exact point
      2. `EXACT_SOURCE_SPAN` — `source_ref + byte_start + byte_end`; recorded as structurally
         unavailable (not silently skipped) given the S512-ID0 findings above
      3. `STRUCTURAL_AST_COORDINATE` — `source_ref + tree_node_id` (chunk-side, from
         `metadata`/`output_meta`) vs `atlas_packets.tree_node_id`
      4. `CONTENT_HASH_UNIQUE` — `content_hash` converges to exactly one `atlas_packets` row,
         directly (`sha256`) or via the `atlas_source_refs` bridge
      5. `STRUCTURAL_FINGERPRINT` — **not implemented this session**; rows reaching this tier
         are `UNRESOLVED` with `evidenceRefs.structuralFingerprintNotImplemented=true`, never a
         fabricated similarity heuristic
      6. `UNRESOLVED`
      `source_revision` is left null throughout, consistent with S512-9A (no canonical column
      exists) — not fabricated here either.
- [x] S512-ID2 — Ambiguity/uniqueness proof: **EXECUTED against the full live corpus**
      (all 53,379 `codebase_chunks_512` points, batched per-scroll-page queries, one
      `REPEATABLE READ` read-only Postgres snapshot). Real result:
      ```json
      {"rowCount": 53379, "methodCounts": {"UNRESOLVED": 53379},
       "confidenceCounts": {"NONE": 53379}}
      ```
      **0 EXACT, 0 UNIQUE_DERIVATION, 0 AMBIGUOUS, 53,379 UNRESOLVED.** This is not a bug in the
      linker (verified via 18 unit tests in
      `python/tests/test_atlas_chunk_packet_identity_linker.py` covering every tier's
      win/ambiguous/fall-through behavior on synthetic data) — it is the honest consequence of
      S512-ID0's census: every tier this session could implement without fabricating evidence
      is structurally empty for this corpus today (no `qdrant_collection` tags, no byte spans,
      no chunk-side `tree_node_id`, no `sha256`/content_hash convergence to `atlas_packets`).
      Manifest: `data/atlas-ml/chunk-packet-identity-links.ndjson` (53,379 lines). Receipt:
      `data/atlas-ml/chunk-packet-identity-links-receipt.json`.
- [ ] S512-ID3 — Canonical `atlas_packets` linkage: **PENDING, operator decision required.**
      Cannot proceed until at least one tier produces real EXACT/UNIQUE_DERIVATION candidates.
      Two independent unlocks exist, either is sufficient, neither was attempted this session
      (both are population/backfill decisions for the operator, not something to infer):
      (a) populate `atlas_packets.qdrant_collection`/`qdrant_point_id` for the packets that
      really do own `codebase_chunks_512` points (would light up tier 1 `EXACT_CANONICAL_ID`);
      (b) populate chunk-side `tree_node_id` (tier 3) or establish a real, verified bridge from
      `atlas_source_refs`'s working content_hash convergence forward into `atlas_packets`
      identity (tier 4) — the current `relative_path + qualified_symbol` bridge attempt is
      itself empirically dead (0 hits) because `atlas_packets.function_symbol` is populated on
      only 61/61,660 rows.
      **Qdrant tier audit (2026-08-25):** `atlas_packets.qdrant_point_id` is populated for
      only 6,451/61,660 packets (10.5%), `qdrant_collection` for 6,365, and 10 duplicate point
      IDs exist. This is below the 95% admission target and remains `REVIEW`, so Qdrant IDs are
      not an admitted replacement for the missing packet/chunk bridge.
- [x] S512-ID4 — Linkage read-back determinism: **PROVEN_READ_ONLY**. The restored verifier
      `sveltekit-frontend/scripts/atlas/verify-s512-chunk-packet-identity-readback.mts` read the
      live snapshot twice under `REPEATABLE READ READ ONLY`; both checksums were
      `aeeef8bffa0fbb19c6ae9437aa9bc3c4f76922124b723fe43abe2bb488e9e5f6` across `105,762`
      rows. This proves deterministic readback only; S512-ID3 still blocks bridge admission.
      `sveltekit-frontend/scripts/atlas/verify-s512-chunk-packet-identity-readback.mts` was
      restored as a read-only repeatable-snapshot checksum verifier. It does not admit bridge
      rows; S512-ID3 remains the separate operator gate.

**Cross-reference (2026-08-25)**: `openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md`'s
`PACKET-CHUNK-GRANULARITY-01` entry independently arrived at this same table/decision while
investigating why the new `searchPostgresFts()` lexical adapter's `(source_ref, content_hash)`
join has low coverage for multi-chunk files. That entry was corrected to point back here rather
than re-deciding S512-ID3/ID4 — this remains the one authoritative gate for whether
`atlas_chunk_packet_identity_links` is safe for any consumer (FTS or otherwise) to rely on. Live
check that session found the table is still a single frozen snapshot from this gate family's
`codebase_chunks_768` addendum run (`algorithm_revision:
'atlas.chunk-packet-identity-linker.v1'`, `observed_at: 2026-08-21T15:03:58Z`,
`match_method` counts `UNRESOLVED: 101,237`, `EXACT_CANONICAL_ID: 4,517`, `AMBIGUOUS: 8`) — no
new rows or rebuild since S512-ID2.

- [x] **S512-ID3 — RESOLVED via explicit operator decision (2026-08-25), scoped narrowly.** The
  operator directly chose "Option B" from `PACKET-CHUNK-GRANULARITY-01`'s three named options —
  route the FTS identity join through this bridge table (`EXACT_CANONICAL_ID` rows only), keep
  `atlas_packets` file-granular — via explicit instruction in the neural-prefill-encoder session,
  not inferred by an agent. This is the operator decision this gate was waiting on. **Scope of
  what's actually admitted**: only `searchPostgresFts()` in `postgres-fts.adapter.ts` now consumes
  the bridge, and only its 4,517 `EXACT_CANONICAL_ID` rows — `UNRESOLVED`/`AMBIGUOUS` rows remain
  excluded by a hard SQL predicate, not convention. This does NOT resolve the two unlocks
  originally named above (Qdrant-tier population is still `REVIEW` at 10.5%; the
  `atlas_source_refs` content-hash bridge is still empirically dead) — it resolves a narrower,
  different question: whether the already-admitted `EXACT_CANONICAL_ID` subset may be consumed by
  one specific caller. See `MCP-FILE-TOPK`/`PACKET-CHUNK-GRANULARITY-01`-adjacent entry in
  `parent-atlas-neural-prefill-encoder/tasks.md` (dated 2026-08-25, "PACKET-CHUNK-GRANULARITY-01
  resolved") for the implementation and measured coverage (`408` exact + `2,811` bridge-additional
  = `3,219/52,380`, ~6.1%, up from ~0.78%).
  - [ ] Any OTHER consumer wanting to rely on this bridge table still needs its own explicit
    admission decision — this resolution is scoped to the FTS adapter only, not a blanket
    "bridge table is now canonical" declaration.

**Until S512-ID3/ID4 close, S512-10's real result stands as reported above (0 ADMITTED,
53,379 REVIEW under the reconciler's own weaker source_ref-only signal) and S512-11 through
S512-15 remain blocked.** Do not substitute `SOURCE_REF_ONLY_MATCH` or any `atlas_chunk_packet_identity_links`
`UNRESOLVED`/`AMBIGUOUS` row for a real ADMITTED packet link.

### Addendum: linker generalized and run against `codebase_chunks_768` (2026-08-21)

Out of scope for the S512 gates above (this doc's own canonicalization contract, and root
`CLAUDE.md`'s Qdrant Collections table, both treat `codebase_chunks_768` /
`codebase_chunks_768_v2` as a **separate, real, populated general-corpus codebase-RAG lane** —
"same vector dimension never implies same representation identity"). This addendum only
records that `atlas_chunk_packet_identity_linker.py`'s `--collection` flag (already present,
no code change needed) was exercised against it, as a general audit of that lane's own
identity health — its result does not feed, gate, or promote anything in the `semantic_512`
canonicalization above.

Live census before running: `codebase_chunks_768` holds **105,762** points with **three**
coexisting point-id generations (plain small ints e.g. `1`; large ~19-digit hash-like ints
e.g. `8192857214617718000`; and uuid strings e.g. `0000d635-...`) plus named vectors
(`content`/`error`/`signature`, all 768-dim cosine) rather than the single unnamed vector
`codebase_chunks_512` uses. `atlas_packets` has **6,364** rows already tagged
`qdrant_collection = 'codebase_chunks_768'` (unlike `codebase_chunks_512`'s 0) — but a
targeted 2-sample spot check found their `qdrant_point_id` values (the 19-digit generation)
absent from the live collection, i.e. some fraction of that tagging is stale from a prior
point-id generation that no longer exists.

Ran the unmodified linker full-corpus (`--collection codebase_chunks_768`, batched per-page,
one `REPEATABLE READ` snapshot), then `--apply-links` (additive only, into
`atlas_chunk_packet_identity_links`; still never touches `atlas_packets`/
`codebase_chunk_index`/Qdrant):

```json
{"rowCount": 105762, "methodCounts": {"EXACT_CANONICAL_ID": 4517, "AMBIGUOUS": 8, "UNRESOLVED": 101237},
 "confidenceCounts": {"EXACT": 4517, "AMBIGUOUS": 8, "NONE": 101237}, "linksApplied": 105762,
 "canonicalPacketsMinted": 0}
```

Unlike `codebase_chunks_512`, tier 1 (`EXACT_CANONICAL_ID`) does fire for real here — 4,517
points (4.3%) resolve to a genuine, pre-existing `atlas_packets.packet_key` via
`(qdrant_collection, qdrant_point_id)`, consistent with 6,364 packets already claiming this
collection (the gap between 6,364 and 4,517+8 is consistent with, but not proven equal to,
the stale-point-id spot check above — not independently verified row-by-row this session).
The other 101,237 (95.7%) are `UNRESOLVED` for the same structural reasons as the 512 corpus
(tiers 2/3/5 unavailable; tier 4 content-hash bridge doesn't reach `atlas_packets`). Manifest:
`data/atlas-ml/chunk-packet-identity-links-768.ndjson` (105,762 lines). Receipt:
`data/atlas-ml/chunk-packet-identity-links-768-receipt.json`.

## Handoff (2026-08-21 session end) — EMB-PROV embedding-model provenance, next session

**Not started this session — do not assume any of this is proven.** Operator asked to identify
what embedding model actually produced `codebase_chunks_768`'s vectors (105,762 points, 3 named
768-dim cosine vectors `content`/`error`/`signature`, 3 coexisting point-ID generations: small
sequential ints, ~19-digit hash-like ints, and uuids). Same-dimension-does-not-imply-same-model —
this cannot be answered from the 768 floats alone. Approach agreed: **provenance triangulation**
(writer/receipt/payload evidence first, numerical re-embedding last, never the reverse). Proposed
gate sequence, none executed yet:

- `EMB-PROV-00` — live collection schema + collection-level metadata (`GET
  /collections/codebase_chunks_768`; check for any `metadata.model*`/`metadata.*revision*` keys).
- `EMB-PROV-01` — repository writer census: `rg` for `codebase_chunks_768` combined with
  `embeddinggemma|MiniLM|11434|8081|content|error|signature` across `scripts/`,
  `sveltekit-frontend/`, `python/`, `docker/`, `openspec/`, `docs/`. Known candidate writer from
  this session: `scripts/atlas/phase-embedding-lanes-qdrant-sync.mts` (confirmed real, but its
  `phase4SyncFallback512d` function targets the *512* collection — its *768* write path, if any,
  was not traced this session).
- `EMB-PROV-02` — sample point payloads (`POST .../points/scroll` with `with_payload:true,
  with_vector:false`) across all 3 point-ID generations separately; look for
  `model`/`embedding_model`/`embedding_lane`/`provider`/`representation_revision` fields actually
  present in payloads (not assumed).
- `EMB-PROV-03` — for the 4,517 real `EXACT_CANONICAL_ID` links already persisted in
  `atlas_chunk_packet_identity_links` (built this session, see above), join back to `atlas_packets`
  for every real lineage column that exists live (audit actual schema first — do not invent column
  names) and check for any analysis-pass/receipt evidence naming an embedding model.
- `EMB-PROV-04` — split all evidence by point-ID generation (small-int / hash-int-19 / uuid)
  rather than treating the collection as one homogeneous writer epoch — the 3 generations may be
  3 different writer eras with different models.
- `EMB-PROV-05` — query live Ollama (`:11434`) for what it serves *now* — this proves current
  runtime capability only, not what produced the existing 105,762 points historically. Do not
  conflate the two claims.
- `EMB-PROV-06` — only after 00-05: bounded numerical re-embed of ~50-200 recovered source texts
  per generation against plausible candidate models, compare cosine similarity to stored vectors.
  Reproduce exact document-vs-query prompt form per model (EmbeddingGemma has distinct
  query/document prompts). This step alone is not proof — treat as final corroboration only.

**Legitimate final states**: `PROVEN` (for a given generation), `MIXED_REPRESENTATION_HISTORY`
(if the 3 point-ID generations turn out to be genuinely different writer epochs/models — treat
this as an expected, acceptable outcome, not a failure), or `UNPROVEN`. Do not force a single
answer if the evidence points to mixed history.

**Do not skip ahead to EMB-PROV-06.** Writer/payload/receipt evidence is authoritative;
re-embedding cosine similarity is corroborating evidence only, per this repo's own evidence-tier
discipline (same principle as the `atlas_chunk_packet_identity_links` matching order above —
strongest evidence first, numeric similarity last).

### EMB-PROV executed live (2026-08-21, next session)

**Correction to the handoff above**: the "3 point-ID generations" claim was wrong. Full
id-only scroll of the live collection (105,762/105,762 points, paginated to completion,
`next_page_offset: None` reached) found exactly **2** generations: `small-int` (53,381 points,
ids like `1`) and `uuid` (52,381 points, ids like `0000d635-8df8-4a03-a1b0-e33d2699f6c0`). Zero
`hash-int19`-shaped ids exist in `codebase_chunks_768`. (A third generation may exist in a
different collection referenced elsewhere in this document — not re-verified here — but it is
not present in this one.)

- **EMB-PROV-00** — `GET /collections/codebase_chunks_768`: `points_count: 105762`,
  `indexed_vectors_count: 117591`, 3 named 768-dim cosine vectors (`content`/`error`/`signature`),
  scalar int8 quantization enabled. No collection-level model metadata field exists (Qdrant
  doesn't have one) — model provenance can only live in per-point payloads, which is what the
  rest of this gate sequence checked.
- **EMB-PROV-01** — every writer script that actually calls an embedding endpoint (not just
  payload/identity plumbing) for this collection uses the same model, no exceptions found:
  `scripts/atlas/phase4-gpu-embedding-indexing.mts` and
  `sveltekit-frontend/scripts/atlas/batch-d-semantic-embedder.mts` both hardcode
  `EMBEDDING_MODEL = 'embeddinggemma:latest'` against `http://127.0.0.1:11434/api/embeddings`.
  `index-code-768.mjs` and `backfill-qdrant-768-from-postgres.mjs` write a literal
  `representation_id: 'embeddinggemma_768_native_v1'` string into the payload. Two other backfill
  scripts (`backfill-qdrant-768-v2-uuid.mjs`, `backfill-qdrant-768-keyset.mjs`) don't hardcode a
  model — they read `row.embedding_model` from Postgres and pass it through, which is what led to
  EMB-PROV-03 below. **Correction to the earlier flagged candidate**: `qdrant-sync-payload.ts`
  (`sveltekit-frontend/src/lib/server/retrieval/qdrant-sync-payload.ts`) is **not** a writer for
  this collection at all — traced its `requireCanonicalRepresentation()` call and found it hard-
  throws unless `representation_id === ATLAS_CANONICAL_SEMANTIC_REPRESENTATION`, which
  `qdrant-semantic-projection.ts:8` defines as the literal string `'semantic_512'`. That function
  is the writer for `codebase_chunks_512`, not `_768` — the existing
  `docs/reports/emb3a-qdrant-writer-lineage-audit.json` (from
  `scripts/atlas/audit-emb3a-qdrant-writer-lineage.mjs`, re-run this session, unchanged result)
  mislabels it as the `liveApplicationOwner` for `codebase_chunks_768`; that audit script itself
  needs a fix (out of scope for this note — flagging, not fixing).
- **EMB-PROV-02** — sampled live payloads across both real generations:
  - `uuid` generation, point `0000d635-8df8-4a03-a1b0-e33d2699f6c0`: payload directly declares
    `"representation_id": "embeddinggemma_768_native_v1"`, `"vector_name": "dense_768"`,
    `"workspace_id": "phase108d-backfill"`, `"indexed_at": "2026-04-20T18:22:23.413Z"` — this is
    the Phase 108D backfill referenced repeatedly in root `CLAUDE.md`. Direct, explicit,
    writer-declared model provenance, not inferred.
  - `small-int` generation is **internally heterogeneous** — sampled ids `1, 100, 1000, 5000,
    10000, 20000, 40000, 53000`: ids `1/100/1000` carry `representation_id` values that are
    random-looking UUIDs (e.g. `1550075d-9042-4953-bc75-90b50a9a8c5c`) plus
    `packet_version: "qdrant-backfill-v1"` and a `payload_backfilled_at` timestamp of
    **`2026-08-21T04:26:10.166Z` — today, same session window** — while ids `5000` and above
    carry the literal generic string `representation_id: "semantic_768"` (a lane label, not a
    model name) with no `packet_version`/`payload_backfilled_at`. This means some external process
    is actively rewriting payloads in this exact collection during this investigation window
    (plausibly the `atlas_chunk_packet_identity_links` `--apply-links` run against
    `codebase_chunks_768` from the prior session, or a concurrent agent — not re-identified here).
    **Caveat for whoever reads this next**: treat any `small-int`-generation payload snapshot as
    a moving target, not a frozen historical fact, until the writer of the `2026-08-21`
    `payload_backfilled_at` timestamps is identified.
- **EMB-PROV-03** — `atlas_chunk_packet_identity_links` (built last session) wasn't re-joined to
  `atlas_packets` this pass (time-boxed); the stronger, more direct signal turned out to be
  `codebase_chunk_index.embedding_model` itself (see below), which made the planned join
  secondary rather than necessary for this question.
- **EMB-PROV-04 (superseded)** — see the 2-generation correction above; the "split by 3
  generations" plan no longer applies as originally scoped.
- **EMB-PROV-05** — live `curl http://127.0.0.1:11434/api/tags`: 3 models loaded —
  `embeddinggemma:latest` (307.58M params), `nomic-embed-text:latest` (137M, documented
  fallback), `ibm/granite-docling:258m` (unrelated, doc-parsing). Confirms current runtime only,
  per the caveat already on this gate — not treated as historical proof.
- **Strongest evidence found, not originally planned as a numbered gate**: live query —
  ```sql
  SELECT embedding_model, count(*) FROM codebase_chunk_index
  WHERE content_embedding IS NOT NULL GROUP BY embedding_model;
  -- embeddinggemma | 52380   (single value, zero variance, 100% of populated rows)
  ```
  Cross-tabbed by `qdrant_id` shape: `small-int` qdrant_id rows → 10,302, all `embeddinggemma`;
  `uuid` qdrant_id rows → 42,078, all `embeddinggemma`. (Note this Postgres-side `qdrant_id`
  count, 52,380 total, does not equal the live Qdrant collection's own small-int point-id count,
  53,381 — the two numbering schemes are not 1:1; `codebase_chunk_index.qdrant_id` is not
  guaranteed to equal the Qdrant point's own `id` field for every row. Not resolved this pass.)
- **EMB-PROV-06** — deliberately **not run** this pass, per the standing instruction not to skip
  to it. The evidence tiers above (two independent writer-declared payload fields + one
  single-valued, zero-variance Postgres column, across three different code paths) are strong and
  mutually consistent enough that a numerical re-embed corroboration is optional, not required, to
  reach a conclusion — left for whoever wants the final corroborating data point.

**Conclusion: `EMB_PROV: PROVEN` for embedding model = `embeddinggemma` (Ollama `embeddinggemma:latest`, 768-dim native output), for all rows/points where model provenance is recorded at all.** This is not `MIXED_REPRESENTATION_HISTORY` in the model-identity sense — every writer, every payload sample, and the single Postgres provenance column agree on one model, with zero contradicting evidence found. The real heterogeneity discovered is **payload-schema/backfill-era drift** (different field names/versions across the two point-id generations, one of which is being actively rewritten as of this session), not a different embedding model. That schema-drift question (why two id generations exist, why one is being live-patched, whether `qdrant_id` in Postgres should 1:1-match Qdrant's own point id) is a separate, still-open thread — not closed by this proof.
