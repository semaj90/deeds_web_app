## ADDED Requirements

### Requirement: error_embedding is 768-dimensional
`codebase_chunk_index.error_embedding` SHALL be stored as `halfvec(768)`, matching the dimension
and precision of `signature_embedding` and `content_embedding` (embeddinggemma's native 768d
output). The column SHALL NOT remain at any other dimension.

#### Scenario: Backfill script writes a real embedding
- **WHEN** `scripts/atlas/backfill-graphify-rff-embeddings-768.mjs` computes a 768d embeddinggemma
  vector for a chunk's error signature
- **THEN** the write to `error_embedding` succeeds without a dimension-mismatch error

#### Scenario: Dimension verification query
- **WHEN** `vector_dims(error_embedding::vector)` is run against any populated row
- **THEN** it returns `768` for every row

### Requirement: Derived MRL-truncated views for error_embedding
The system SHALL provide 512/256/128-dimensional MRL-truncated (prefix-slice + L2-renormalize)
projections of `error_embedding`, computed via the same mechanism already proven for
`content_embedding` in `scripts/atlas/prove-embeddinggemma-mrl-runtime.mjs`, and SHALL NOT introduce
a second, error-embedding-specific truncation mechanism.

#### Scenario: MRL projection matches the existing mechanism
- **WHEN** an MRL-truncated view of `error_embedding` is generated
- **THEN** it uses `projectionMethod: 'MRL_PREFIX_TRUNCATE_L2'` and is tagged
  `projected_from_768d: true` in its Qdrant payload, identical in shape to the existing
  `codebase_chunks_512` convention

### Requirement: Derived autoencoder-latent views for error_embedding
The system SHALL provide `latent_256` and `latent_64` autoencoder projections of `error_embedding`
via `NestedSemanticAutoencoder.encode()` (the same model already used for `content_embedding`), kept
architecturally distinct from the MRL-truncated views (no shared code path, no conflation of the two
mechanisms).

#### Scenario: Autoencoder projection is independently derived, not sliced from 768d
- **WHEN** `error_embedding`'s `latent_256` value is computed
- **THEN** it is produced by a forward pass through `NestedSemanticAutoencoder`, not a slice of the
  raw 768d vector

### Requirement: latent_128 is real and populated
A `latent_128` lane SHALL exist for `codebase_chunk_index`, derived as a deterministic
`SLICE_FIRST_N` slice of the already-computed `latent_256` column (per the existing
`drizzle/manual/20260903_nested_latent_representation_registry_v1.sql` design choice, promoted from
`CANDIDATE/UNVERIFIED` to real/built). This is the first real `latent_128` data in the repository —
prior to this change, no column or Qdrant collection for it existed anywhere.

#### Scenario: latent_128 column exists and is populated
- **WHEN** a row has a populated `latent_256` value
- **THEN** that row also has a populated `latent_128` value derived deterministically from it

#### Scenario: latent_128 registry entry is promoted
- **WHEN** the registry entry for `latent_128` is checked after this change lands
- **THEN** its status is no longer `CANDIDATE/UNVERIFIED`

### Requirement: At least one real read-side consumer
The error-fixing embedding lane (768d `error_embedding` and/or its derived views) SHALL be queried
by at least one live retrieval code path — it SHALL NOT remain write-only/backfill-only as it was
before this change.

#### Scenario: A real query exercises the lane
- **WHEN** the `kag_recall_similar_fix` MCP tool (or the narrowest equivalent real consumer) is
  invoked with a query
- **THEN** it performs a similarity search against `error_embedding` (or a derived view) and returns
  a real, non-empty result for a query known to have a similar prior fix

### Requirement: CLAUDE.md embedding-dimension claims stay accurate
Root `CLAUDE.md`'s Embedding Dimensions Policy section SHALL accurately reflect the live state of
`latent_64` (populated, not "schema-only, zero rows") and SHALL document the new `latent_128` lane
once built, in the same bullet format as the existing `latent_256`/`latent_64` entries.

#### Scenario: Doc matches live database state
- **WHEN** `latent_64` row-population is checked live and compared against CLAUDE.md's claim
- **THEN** the claims agree
