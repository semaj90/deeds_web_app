## Why

`codebase_chunk_index.error_embedding` is `vector(384)` while the canonical embedding model
(embeddinggemma) outputs 768-dim vectors, blocking
`scripts/atlas/backfill-graphify-rff-embeddings-768.mjs` outright (it can't write 768d values into
a 384d column). This is the error-fixing topology lane's ("RFF" in this repo's own scripts —
`scripts/atlas/phase3-neo4j-rff-topology.mjs` — not the unrelated Random Fourier Features ML
technique, which does not exist anywhere in this repo). The sibling `signature_embedding` column is
already `halfvec(768)` and already receives 768d writes, so this is a narrow, one-column gap, not a
two-column one. Live research (2026-09-09) confirmed **neither column has a live retrieval reader
today** — they are write-only/backfill-only, so the migration risk is low, but that also means the
fix is worthless unless a real read-side consumer gets wired up alongside it. Separately, the
existing `latent_256`/`latent_64` autoencoder lanes are real and populated, but root `CLAUDE.md`'s
Embedding Dimensions Policy section is stale about `latent_64` (says "schema-only, zero rows";
a later 2026-09-02 `LATENT-SCHEMA-ALIGN-01` correction shows it's actually live), and `latent_128`
does not exist anywhere except an unapplied `CANDIDATE/UNVERIFIED` draft registry entry. This change
fixes the column mismatch, wires the error-fixing lane through the existing MRL-truncation and
autoencoder-latent mechanisms (kept as two explicitly distinct paths per this repo's own
Embedding Dimensions Policy hard rule), promotes `latent_128` from draft to real, and corrects the
stale documentation.

## What Changes

- Migrate `codebase_chunk_index.error_embedding` from `vector(384)` to `halfvec(768)` (matches
  `signature_embedding`'s existing type and the canonical `content_embedding` pattern). **BREAKING**
  for any out-of-tree consumer that assumed 384d (none found in this repo, but flagging per
  convention).
- Unblock and run `scripts/atlas/backfill-graphify-rff-embeddings-768.mjs` for real once the column
  type matches.
- Add MRL-truncated derived views (512/256/128) of the newly-768d `error_embedding`, reusing the
  existing, already-proven `project(vector, dimension)` mechanism in
  `scripts/atlas/prove-embeddinggemma-mrl-runtime.mjs` — no new truncation mechanism, just a new
  target column.
- Wire `error_embedding` through the already-populated `NestedSemanticAutoencoder.encode()` path
  (the same one that populates `latent_256`/`latent_64` for `content_embedding` today), extending
  `python/backfill_latent_256.py` to also encode `error_embedding`.
- Promote the `CANDIDATE/UNVERIFIED` `latent_128` draft registry entry
  (`drizzle/manual/20260903_nested_latent_representation_registry_v1.sql`, `dimension_method:
  SLICE_FIRST_N` of `latent_256`) to a real, built, `VERIFIED` lane.
- Wire at least one real read-side consumer (the `kag_recall_similar_fix` MCP tool path, or the
  narrowest equivalent) to actually query the migrated/new lanes — otherwise this change reproduces
  the exact "write-only, zero readers" problem it's fixing.
- Correct root `CLAUDE.md`'s Embedding Dimensions Policy section: fix the stale `latent_64`
  "schema-only, zero rows" claim, and add a `latent_128` entry once built.

## Capabilities

### New Capabilities
- `atlas-error-embedding-lane`: canonical 768d error/signature embedding lane for the error-fixing
  topology recall path (RFF), including its MRL-truncated (512/256/128) and autoencoder-latent
  (256/128/64) derived views, and the read-side consumer that actually queries it.

### Modified Capabilities
- (none — no existing `openspec/specs/*` capability currently covers this lane; `atlas-retrieval-reconciliation`
  and `atlas-feature-evidence-graph` were checked and are scoped to unrelated retrieval/evidence-graph
  concerns, not this embedding column)

## Impact

- **Schema**: new `drizzle/manual/NNNN_error_embedding_768.sql` migration (proposed, not applied by
  this change — per this repo's Drizzle Safety Rule, schema changes are an operator-review gate;
  this change only proposes the reviewed SQL).
- **Scripts**: `scripts/atlas/backfill-graphify-rff-embeddings-768.mjs` (unblocked, no logic change
  needed), `scripts/atlas/prove-embeddinggemma-mrl-runtime.mjs` (extend target column list),
  `python/backfill_latent_256.py` (extend to `error_embedding`).
- **Registry**: `drizzle/manual/20260903_nested_latent_representation_registry_v1.sql` (promote
  `latent_128` entry from `CANDIDATE/UNVERIFIED` to `VERIFIED`).
- **Retrieval**: one new/updated read-side consumer wired into the error-fixing recall path (MCP
  `kag_recall_similar_fix` or equivalent) — new capability, currently nothing reads this lane.
- **Docs**: root `CLAUDE.md` Embedding Dimensions Policy section corrected.
- **Qdrant**: new/updated collections for the derived views, each carrying a `projected_from`
  provenance payload field per the existing `codebase_chunks_512` convention.
