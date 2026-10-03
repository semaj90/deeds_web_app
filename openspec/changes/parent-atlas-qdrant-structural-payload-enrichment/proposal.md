## Why

Today's `codebase_chunks_768` Qdrant payload (both the compliant `buildQdrantSyncPayload()` writer
and the ~109,746 legacy-written points measured in `SEMANTIC-CORPUS-ADMISSION-01`, see
`docs/reports/semantic-corpus-admission-v1.json`) carries identity/lineage fields
(`canonical_id`/`canonical_source_ref`, `source_ref`, `workspace_id`, `workspace_revision`,
`topo_class`, `som_cluster`, `graphAuthorityScore`) and the 768-dim embeddinggemma vector, but no
structural facts about the chunk itself — no AST/CST node kind, no symbol identity, no import/call
relationships. Semantic-cache/search consumers that want to filter or boost on "is this a function
definition," "does this reference symbol X," or "same AST subtree shape" today have to re-derive
that from source on every query, or not at all. This repo already computes exactly this evidence
elsewhere — `packages/parent-atlas/src/core/ast-grep-observation-adapter.ts`'s
`AstGrepObservationV1` contract, wired into production via
`graphify-structural-intelligence-adapter.ts` (cited in root `CLAUDE.md`'s "Audit `packages/*`
Before Moving Anything From `scripts/atlas/`" section) — but it isn't projected into the Qdrant
payload today, so it can't be used as a search/filter dimension there.

**Correction (2026-09-12, verified before any implementation started, not assumed)**: the sentence
above is only true of the in-memory adapter/schema layer. A read-only measurement
(`scripts/atlas/dryrun-structural-payload-join-hitrate-v1.mjs`,
`docs/reports/structural-payload-join-hitrate-dryrun-v1.json`) found the `atlas_observation_records`
table — the intended persisted store for `AstGrepObservationV1`-family rows
(`drizzle/manual/20260819_atlas_observation_feature_rows_v1.sql`) — **does not exist in the live
schema at all**. `AstGrepObservationV1` observations are computed by
`adaptAstGrepMatches()`/`compileGraphifyStructuralIntelligence()` in-memory during a Graphify pass,
but nothing persists them anywhere durable today. "Existing structural evidence to project into
Qdrant" therefore does not currently exist as data — only the code path that could produce it
does. This proposal's real scope is broader than originally framed: it must first decide whether
to (a) apply the pending migration and add a persistence step to Graphify before any Qdrant
projection is possible, or (b) compute structural observations on-demand at enrichment-write time
with no Postgres persistence layer at all, as a deliberate design tradeoff. Neither is decided
here — see tasks.md section 1.4.

This proposal is planning-only. No implementation, no schema change, no Qdrant mutation happens as
part of this change — it exists so the idea raised in conversation (richer AST/CST-aware payload
alongside the embeddinggemma vectors) has a reviewable shape before any code gets written.

## What Changes

- Define a `QdrantStructuralPayloadV1` field set (proposed, not final) as an **additive** extension
  to the existing Qdrant payload shape — new fields only, no renaming or removal of any field
  `buildQdrantSyncPayload()` already writes.
- Source of truth for the new fields is `AstGrepObservationV1` (existing, already-proven contract),
  joined by `canonical_id`/`source_ref` — never re-derived independently inside this proposal's
  scope.
- Population is via `setPayload` (additive field write), not re-embedding and not point
  recreation — the existing 768-dim vectors are untouched.
- Explicitly scoped to enrichment of the **existing 768d owner corpus** (`codebase_chunks_768`).
  Does **not** touch `codebase_chunks_768_v2` (challenger, per the Embedding Dimensions Policy's
  "never merge" rule), does not touch any MRL-truncated (512/256/128) or autoencoder-latent
  collection, does not touch Postgres pgvector originals, TurboVec's RAM ANN index, or any GPU/CPU
  embedding cache.
- No deletion of any existing point, collection, or payload field anywhere in this repo as part of
  this change.

## Capabilities

### New Capabilities
- `atlas-qdrant-structural-payload`: additive AST/CST-derived structural metadata fields on the
  existing `codebase_chunks_768` payload, sourced from the existing `AstGrepObservationV1` contract.

### Modified Capabilities
- (none yet — this proposal has not been reviewed against `openspec/specs/*` for overlap; that
  review is itself a task below, not assumed complete by writing this proposal)

## Impact

- **Qdrant**: additive payload fields on `codebase_chunks_768` only. Existing points, vectors, and
  fields unchanged; new fields populated via `setPayload`, same discipline as
  `QDRANT-LEGACY-PAYLOAD-BACKFILL-01` (explicit human sign-off required before any live call).
- **Postgres**: **corrected** — `atlas_observation_records` (the intended persisted store) does not
  exist live; the pending migration is unapplied. If option (a) in the Why section above is chosen,
  this proposal WOULD need a schema change (applying the existing pending migration) plus a new
  Graphify persistence step, both out of scope for this proposal's current draft and requiring
  their own review.
- **Read side**: `qdrant-search.ts`'s `buildCodebaseQdrantFilter` would need new optional filter
  fields to actually use this data (not part of this proposal's implementation scope yet — tasks.md
  tracks it as a follow-up decision, not a committed task).
- **Docs**: none yet.

## Explicitly out of scope for this proposal

- Any live Qdrant mutation (this is proposal-only).
- Choosing the final field names/shape (tasks.md's first task is exactly that decision).
- Wiring any new filter/boost logic into search — a separate, later decision once the payload shape
  is settled and reviewed.
- `codebase_chunks_768_v2`, MRL/latent collections, Postgres originals, TurboVec, GPU/CPU caches —
  none of these are touched by this proposal at any point.
