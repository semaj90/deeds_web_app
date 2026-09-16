## Reconciled against live state, 2026-09-16 — this ledger was badly stale (showed 0/25)

The `parent-atlas-openspec-tasks-audit-fabric` audit flagged this change as 0/25, not started. That
was **wrong** — checked live Postgres, migration files, and `docs/archive-manifest.json` directly
(not inferred) and found most of the schema and a meaningful slice of the read-side work already
done, just never reflected here. Evidence and honest partial-completion notes are inline below.
This is the same class of finding the audit fabric exists to catch, but checkbox-counting alone
can't see live DB state — a reminder that a 0% score on a schema-migration change can mean "not
started" or "done but untracked," and only a live check tells you which.

## 1. Schema migration (operator-review gate — do not apply without sign-off)

- [x] 1.1 Export current `error_embedding` data — done. `docs/archive-manifest.json` records the
      2026-09-12 export to `deeds_labs/archive/2026-09-12/error_embedding_384_backup.csv`,
      confirming 0/55,853 rows were populated at snapshot time (header-only CSV, no data lost).
- [x] 1.2 Write the migration SQL — done.
      `sveltekit-frontend/drizzle/manual/20260912_error_embedding_768.sql`.
- [x] 1.3 Human review + apply — **done by the operator since this ledger was last updated**
      (verified live, not assumed: `\d codebase_chunk_index` shows `error_embedding` is now
      `halfvec(768)` with `idx_codebase_chunk_index_error_embedding_hnsw` already built,
      `m='16', ef_construction='64'`, matching `signature_embedding`'s pattern per the task's own
      spec).
- [x] 1.4 Verify live — done this session:
      `SELECT vector_dims(error_embedding::vector), count(*) ... GROUP BY 1` returns exactly one
      row, `768 | 20` — every populated row is genuinely 768-dim, none stuck at the old 384.

## 2. Repopulate error_embedding at 768d

- [ ] 2.1 **Partially done, not a full backfill.** Only 20 of 274,465 `codebase_chunk_index` rows
      have a populated `error_embedding` (verified live via `count(error_embedding)`) — this looks
      like smoke-test-scale population (see `scripts/atlas/smoke-error-embedding-semantic-tier.mjs`,
      which embeds one hardcoded query and one-off tests the ANN path), not a corpus-wide run of
      `backfill-graphify-rff-embeddings-768.mjs` against this column. Do not check this box until a
      real bulk backfill has actually run — 20 rows is not "repopulated."
- [ ] 2.2 Not done — no bulk run has occurred to verify row counts against.
- [ ] 2.3 Not done — no status-language entry exists yet for this backfill since no bulk run has
      happened.

## 3. MRL-truncated derived views (512/256/128)

- [ ] 3.1 **Not done.** Grepped `scripts/atlas/prove-embeddinggemma-mrl-runtime.mjs` directly —
      `error_embedding` does not appear in it at all. This task genuinely has not started.
- [ ] 3.2 Not done (depends on 3.1).
- [ ] 3.3 Not done (depends on 3.1/3.2).

## 4. Autoencoder-latent derived views (256/64)

- [x] 4.1 Schema done. `sveltekit-frontend/drizzle/manual/20260912_error_embedding_latent_columns.sql`
      adds `error_embedding_latent_256` (halfvec(256)), `error_embedding_latent_64` (vector(64)),
      plus checkpoint-revision/valid/validated-at metadata columns and HNSW indexes — its own header
      comment confirms this is task 4.1 of this exact change, and confirms it is kept
      architecturally distinct from `content_embedding`'s `latent_256`/`latent_64` (different
      column names, no shared code path, per the migration's own comment).
- [ ] 4.2 **Applied, but only at the same 20-row smoke scale as Task 2** — verified live:
      `error_embedding_latent_256`, `error_embedding_latent_64` both show exactly 20 populated rows,
      matching `error_embedding`'s population 1:1. This is real, correct, consistent data — just
      not yet a full-corpus backfill. Do not check this box complete until it covers more than the
      smoke-test set.
- [x] 4.3 Confirmed distinct — verified live: `error_embedding_latent_*` columns share no name,
      default, or index pattern with `content_embedding`'s pre-existing `latent_256`/`latent_64`
      columns.

## 5. latent_128 promotion

- [x] 5.1 **Explicitly, deliberately SKIPPED** — not overlooked. Verified in
      `sveltekit-frontend/drizzle/manual/20260912_latent_128_columns.sql`'s own header comment:
      "registry promotion itself, task 5.1, remains explicitly SKIPPED... This migration builds the
      actual latent_128 data only, decoupled from the unbuilt atlas_representations registry
      bookkeeping." Marking this box done to reflect that decision was made and recorded, not that
      the registry entry was promoted — no `atlas_representation_registry_v3` row exists for
      `latent_128` today (checked directly; the referenced registry migration file only frames the
      candidate, never marks it `VERIFIED`).
- [x] 5.2 Done for `content_embedding`'s lane — verified live: `latent_128` has 55,169 populated
      rows, matching `latent_256`'s existing full-corpus population. Derivation script:
      `scripts/atlas/backfill-latent-128-slice.mjs`.
- [x] 5.3 Done for the error-embedding lane too, at the same 20-row smoke scale as Tasks 2/4 —
      verified live: `error_embedding_latent_128` shows exactly 20 populated rows.
- [x] 5.4 Verified live: every one of the 20 `error_embedding_latent_256`-populated rows also has
      `error_embedding_latent_128` populated (both count to exactly 20). For `content_embedding`'s
      lane, `latent_256` (55,169) and `latent_128` (55,169) also match exactly.

## 6. Read-side wiring (closes the "write-only lane" gap)

- [ ] 6.1 Identified — the real tool is `kag.recall_similar_fix`
      (`sveltekit-frontend/src/mcp/trace-mcp-server.ts:4600`). **Confirmed live it does NOT use
      `error_embedding` today** — its actual implementation is pg_trgm fuzzy text similarity plus
      exact-hash lookup over `error_fingerprints`, calling `lookupErrorFingerprint`/
      `findSimilarErrors` from `error-fingerprint.ts` (grepped that file directly for
      `error_embedding`/`embedding` — zero matches). It is not "silently ignoring" the column so
      much as never having been wired to it yet.
- [ ] 6.2 **Not done.** The live tool handler still has no semantic-search code path against
      `error_embedding` or its derived views.
- [ ] 6.3 **Proven standalone, not wired into production.**
      `scripts/atlas/smoke-error-embedding-semantic-tier.mjs` exists and its own header comment
      says it "reuses the same embed+ANN pattern wired into trace-mcp-server.ts, standalone, to
      prove it without restarting the live MCP server" — i.e. this is a `DRY_RUN_PROVEN`-shaped
      artifact for the *mechanism*, not evidence that `kag.recall_similar_fix` itself was updated.
      Do not check this box complete until 6.2 actually lands in the live handler and this smoke
      test (or an equivalent) passes against it.

## 7. Documentation correction

- [x] 7.1 **Done this session (2026-09-16).** Root `CLAUDE.md`'s Embedding Dimensions Policy
      section claimed `latent_64` (content_embedding's lane) was "schema-only, zero rows." Verified
      live: `count(latent_64)` on `codebase_chunk_index` returns **1,703** populated rows — the
      claim was stale. Corrected in `claude.md` directly (see that file's own diff), replacing the
      "zero rows, untrained autoencoder" framing with the live-verified populated state.
- [x] 7.2 **Done this session.** Added a `latent_128` bullet alongside the corrected `latent_64`
      one — verified live: `latent_128` has **55,169** populated rows (matching `latent_256`'s full
      population), not merely a schema-only candidate as the registry-promotion framing might
      suggest.
- [ ] 7.3 Not done — `reports/parent-atlas-open-lanes-todo.md` not touched this session; this
      change is not yet fully complete (Tasks 2/3/6 remain genuinely open), so pointing that report
      at "completion status" would be premature.

## 8. Verification gate

- [ ] 8.1 Not done — this session performed targeted live verification of specific claims (schema
      shape, row counts, tool wiring), not the full design.md Migration Plan checklist end-to-end.
- [ ] 8.2 Not done — a full cross-check against every other CLAUDE.md governance section is out of
      scope for this session; only the two specific stale claims found (7.1/7.2) were corrected.
