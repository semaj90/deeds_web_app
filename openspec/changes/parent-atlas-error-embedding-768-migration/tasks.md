## 1. Schema migration (operator-review gate — do not apply without sign-off)

- [ ] 1.1 Export current `error_embedding` data to `deeds_labs/archive/<date>/error_embedding_384_backup.csv` + `docs/archive-manifest.json` entry, per this repo's archive-not-delete convention (even though the column is confirmed unused/unread today).
- [ ] 1.2 Write `drizzle/manual/NNNN_error_embedding_768.sql`: `ALTER TABLE codebase_chunk_index ALTER COLUMN error_embedding TYPE halfvec(768) USING NULL;` plus an HNSW index matching `signature_embedding`'s existing index pattern.
- [ ] 1.3 Human review + apply the migration SQL (per Drizzle Safety Rule — this task is NOT auto-completable by an agent).
- [ ] 1.4 Verify live: `SELECT vector_dims(error_embedding::vector) FROM codebase_chunk_index WHERE error_embedding IS NOT NULL LIMIT 5;` — expect 0 rows (freshly nulled) or 768 for any populated row.

## 2. Repopulate error_embedding at 768d

- [ ] 2.1 Run `scripts/atlas/backfill-graphify-rff-embeddings-768.mjs` (dry-run first, then apply) against the migrated column.
- [ ] 2.2 Verify populated row count and confirm no dimension-mismatch errors in the run log.
- [ ] 2.3 Update this repo's status-language tracking (WIRED → DRY_RUN_PROVEN → APPLY_PROVEN) for this backfill, per root CLAUDE.md's enforced status-language convention.

## 3. MRL-truncated derived views (512/256/128)

- [ ] 3.1 Extend `scripts/atlas/prove-embeddinggemma-mrl-runtime.mjs`'s target column list to include `error_embedding` (reuse `project(vector, dimension)` verbatim — no new mechanism).
- [ ] 3.2 Create/extend the Qdrant collection(s) for these derived views, following the resolved payload contract from design.md's Open Questions (default: `codebase_chunks_768_v2`'s leaner identity-only shape unless told otherwise), each carrying `projectionMethod: 'MRL_PREFIX_TRUNCATE_L2'` and `projected_from_768d: true`.
- [ ] 3.3 Run the projection for all populated `error_embedding` rows; verify point counts match.

## 4. Autoencoder-latent derived views (256/64)

- [ ] 4.1 Extend `python/backfill_latent_256.py` to also encode `error_embedding` through `NestedSemanticAutoencoder.encode()`, writing to new/existing `latent_256`/`latent_64`-equivalent columns scoped to the error-embedding lane (do not conflate with `content_embedding`'s existing `latent_256`/`latent_64` columns — confirm column naming in design review before writing).
- [ ] 4.2 Run the backfill; verify populated row counts.
- [ ] 4.3 Confirm the autoencoder path stays architecturally distinct from the MRL path (no shared function, no shared Qdrant payload field naming that implies equivalence).

## 5. latent_128 promotion

- [ ] 5.1 Promote `drizzle/manual/20260903_nested_latent_representation_registry_v1.sql`'s `latent_128` entry from `CANDIDATE/UNVERIFIED` to `VERIFIED`.
- [ ] 5.2 Write and run the deterministic `SLICE_FIRST_N` derivation script (slice of `latent_256`, not a new training run) to populate `latent_128` for `content_embedding` first (the existing, larger corpus), verifying against the registry's documented `dimension_method`.
- [ ] 5.3 Extend the same slice derivation to the new error-embedding `latent_256` column from Task 4.
- [ ] 5.4 Verify: every row with a populated `latent_256` also has a populated `latent_128`.

## 6. Read-side wiring (closes the "write-only lane" gap)

- [ ] 6.1 Identify the exact current implementation of the `kag_recall_similar_fix` MCP tool (or confirm the narrowest real equivalent) and confirm it does not already silently ignore an available embedding column.
- [ ] 6.2 Wire it to perform a real similarity search against `error_embedding` (or its most appropriate derived view, per design review) instead of whatever fallback/stub behavior it currently has.
- [ ] 6.3 Smoke-test with a real query against a known-similar prior fix; confirm a non-empty, relevant result — record as DRY_RUN_PROVEN, then APPLY_PROVEN once confirmed live.

## 7. Documentation correction

- [ ] 7.1 Update root `CLAUDE.md`'s Embedding Dimensions Policy section: replace the stale `latent_64` "schema-only, zero rows" claim with the corrected live/populated/model-derived state (cite the 2026-09-02 `LATENT-SCHEMA-ALIGN-01` correction and this change's own verification).
- [ ] 7.2 Add a `latent_128` bullet to the same section, matching the existing `latent_256`/`latent_64` format, once Task 5 lands.
- [ ] 7.3 Update `reports/parent-atlas-open-lanes-todo.md`'s item 7/8 note (already added 2026-09-09) to point at this change's completion status once done.

## 8. Verification gate

- [ ] 8.1 Re-run the full verification list from design.md's Migration Plan end-to-end on a non-production/staging pass if available, or document why staging isn't available and production verification is being used directly.
- [ ] 8.2 Confirm no other open-lanes-todo.md or CLAUDE.md claim now contradicts this change's final state (cross-check against the "Duplication Prevention" and "One Canonical Runtime Owner" governance sections).
