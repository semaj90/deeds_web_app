## Context

`codebase_chunk_index` has two columns for the error-fixing topology recall lane ("RFF" — this
repo's own acronym for "Agentic Error Fixing", backed by `scripts/atlas/phase3-neo4j-rff-topology.mjs`;
distinct from and unrelated to the Random Fourier Features ML technique of the same acronym, which
does not exist anywhere in this repo):

- `signature_embedding` — already `halfvec(768)`, already receives 768d writes from
  `scripts/atlas/backfill-graphify-rff-embeddings-768.mjs`.
- `error_embedding` — still `vector(384)`, added out-of-band (no Drizzle migration or snapshot
  tracks it), and the same backfill script's write to it fails with a dimension mismatch.

Neither column has a live retrieval reader today — confirmed via grep across `sveltekit-frontend/src`
and the Go retrieval service — so this is currently pure dead-weight infrastructure: writable but
never read. Separately, this repo has two genuinely distinct dimension-reduction mechanisms that
must not be conflated (per root `CLAUDE.md`'s Embedding Dimensions Policy hard rule):

- **MRL truncation**: prefix-slice + L2-renormalize of the 768d vector. Already built and proven in
  `scripts/atlas/prove-embeddinggemma-mrl-runtime.mjs` (`project(vector, dimension)`,
  `projectionMethod: 'MRL_PREFIX_TRUNCATE_L2'`). Feeds Qdrant `codebase_chunks_512` today.
- **Autoencoder latent lanes**: a trained model projection (`NestedSemanticAutoencoder.encode()`),
  not a slice. `latent_256` is real and populated (55,169/55,853 rows). `latent_64` is *also* real
  and populated — root `CLAUDE.md` currently says "schema-only, zero rows," which is stale; a later
  2026-09-02 correction (`LATENT-SCHEMA-ALIGN-01` in `schema-postgres.ts` ~4500-4506) and
  `openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md:1646,7477` both confirm
  it's live, HNSW-indexed, and independently model-derived. `latent_128` does not exist anywhere —
  only an unapplied `CANDIDATE/UNVERIFIED` draft registry row
  (`drizzle/manual/20260903_nested_latent_representation_registry_v1.sql`) defining it as
  `dimension_method: SLICE_FIRST_N` of `latent_256` (i.e. a *slice of the autoencoder output*, not
  a separately-trained head — cheap to build, not a new training run).

## Goals / Non-Goals

**Goals:**
- Unblock `error_embedding` at 768d so the existing backfill script actually runs to completion.
- Give the error-fixing lane the same derived-view options (MRL 512/256/128, latent 256/64) that
  `content_embedding` already has, reusing existing mechanisms rather than building new ones.
- Build `latent_128` for real (as the cheap slice-of-`latent_256` view the draft already specifies),
  since it's needed by this lane and by name in the open-lanes-todo checklist's RFF item.
- Wire at least one real read path so this lane stops being write-only.
- Fix the stale `latent_64` claim in root `CLAUDE.md` and document the new `latent_128` lane.

**Non-Goals:**
- Training a new, separate autoencoder head for a 128-dim lane (`latent_128` is explicitly a slice
  of `latent_256`, not a new model — see registry draft's own `dimension_method` choice; this design
  does not revisit that choice, only promotes it).
- Applying any migration SQL live from this change — per this repo's Drizzle Safety Rule, schema
  changes are an operator-review gate. This change proposes reviewed SQL; a human applies it.
- Reconciling `codebase_chunks_768` vs `codebase_chunks_768_v2` (a separate, already-tracked open
  finding per root `CLAUDE.md`'s Embedding Dimensions Policy section) — out of scope here.
- Building a general-purpose N-dim MRL/latent framework — this change targets the `error_embedding`
  column specifically, following existing per-column patterns.

## Decisions

**D1 — `halfvec(768)`, not plain `vector(768)`, for the migrated `error_embedding`.**
Matches `signature_embedding`'s existing type and the canonical `content_embedding` pattern
(`codebase_chunk_index.content_embedding` is `halfvec(768)`). Half-precision storage is the
established convention at this table's scale; introducing a mixed `vector`/`halfvec` pair on two
sibling columns of the same table would be its own inconsistency. Alternative considered: plain
`vector(768)` for full fp32 precision — rejected, no evidence this lane needs precision beyond what
`content_embedding`/`signature_embedding` already accept for the same model output.

**D2 — Reuse existing MRL and autoencoder mechanisms verbatim; do not build a new reduction method.**
Both mechanisms already exist, are proven, and are explicitly kept distinct by this repo's own hard
rule. Building a third, error-embedding-specific reduction mechanism would violate the "One
Canonical Runtime Owner Per Capability" governance rule this repo already enforces. Extend the
existing scripts' target-column lists instead of writing new ones.

**D3 — `latent_128` is a slice of `latent_256`, not a new trained head.**
The existing draft registry already made this choice (`dimension_method: SLICE_FIRST_N`). Promoting
it to real means: derive `latent_128` from the already-computed `latent_256` column via a
deterministic slice (analogous to, but distinct from, MRL truncation — this is slicing an
*autoencoder output*, not the raw 768d embedding), not running a new training job. Cheap, reversible,
matches the draft's own reasoning.

**D4 — Read-side wiring targets the narrowest real consumer, not a new subsystem.**
`kag_recall_similar_fix` (TRACE MCP tool) is the closest existing capability whose job description
matches "recall similar past fixes" — the natural consumer of an error-embedding similarity lane.
Wire it there rather than inventing a new retrieval subsystem, consistent with the
Duplication-Prevention rule (audit before building a new owner).

## Risks / Trade-offs

- **[Risk] `ALTER COLUMN ... TYPE halfvec(768) USING NULL` discards existing `error_embedding`
  data.** → **Mitigation**: acceptable because (a) confirmed zero live readers exist today, so no
  in-flight consumer breaks, and (b) the existing backfill script already knows how to
  fully repopulate the column from source once unblocked — this is a reset-and-rebuild, not a
  destructive loss of otherwise-irrecoverable data. Follow this repo's archive-not-delete
  convention for the pre-migration column snapshot regardless (export before altering).
- **[Risk] Building `latent_128` sets a precedent that speculative lanes can be promoted on request.**
  → **Mitigation**: this is an explicit, recorded user override of the "don't build speculatively"
  default (see root CLAUDE.md's own hard rule) — document that override here rather than silently
  normalizing it; future speculative-lane requests still default to "don't build."
- **[Risk] Wiring a new consumer to a previously-dead lane could surface latency/quality issues
  no one has evaluated.** → **Mitigation**: task list requires a smoke-test/proof step (real query,
  real result, verified via the standard status-language convention — DRY_RUN_PROVEN before
  APPLY_PROVEN) before claiming the read path is production-ready.
- **[Trade-off] Non-goal of not reconciling `codebase_chunks_768` vs `_768_v2`** means the new
  Qdrant collections for this lane will need to pick one contract to follow (recommend `_768_v2`'s
  leaner identity-only payload shape, since it's the actively-migrated-toward target per root
  CLAUDE.md) — flagged as an open question below rather than silently decided.

## Migration Plan

1. Export current `error_embedding` data (even though empty/unused) to
   `deeds_labs/archive/<date>/error_embedding_384_backup.csv`, per this repo's archive-not-delete
   convention, before altering the column.
2. Write and review (human sign-off, per Drizzle Safety Rule) the `ALTER COLUMN` migration SQL.
3. Apply migration; run `scripts/atlas/backfill-graphify-rff-embeddings-768.mjs` to repopulate.
4. Extend `prove-embeddinggemma-mrl-runtime.mjs` and `backfill_latent_256.py` to also target
   `error_embedding`; run both, verify populated row counts.
5. Promote the `latent_128` registry entry; build the slice-derivation script; verify populated.
6. Create/extend Qdrant collection(s) for the new derived views with `projected_from` provenance.
7. Wire `kag_recall_similar_fix` (or the narrowest equivalent) to query the new lane; smoke-test
   with a real query.
8. Update root `CLAUDE.md`'s Embedding Dimensions Policy section (fix stale `latent_64` claim, add
   `latent_128` entry).

**Rollback**: schema change is additive-in-spirit (same column, wider type) with zero live readers
at time of migration — rollback is re-running the pre-migration `ALTER COLUMN ... TYPE vector(384)`
plus restoring from the archived CSV if needed. No downstream consumer exists yet to coordinate a
rollback with.

## Open Questions

- Which Qdrant payload contract should the new collections follow — `codebase_chunks_768`'s richer
  multi-vector shape, or `codebase_chunks_768_v2`'s leaner identity-only shape? (See Trade-offs
  above — recommend `_768_v2`, needs explicit confirmation before task execution.)
- Should the archived pre-migration `error_embedding` CSV be considered disposable (since it's
  confirmed unused/unread) or does it still need the full archive-manifest treatment root CLAUDE.md
  specifies for all archived columns? Defaulting to "yes, full manifest treatment" for consistency
  unless told otherwise.
