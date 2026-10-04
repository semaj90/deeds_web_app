# CLAUDE.md archive — Embedding Dimensions Policy (verbatim)

Archived 2026-10-03 from root CLAUDE.md (size limit). Unchanged; a condensed policy stays in CLAUDE.md.
Source range (pre-trim line numbers): 336-517.

---

## 🧠 Embedding Dimensions Policy (CANONICAL — resolved 2026-08-23, supersedes all earlier framings)

**FINAL DECISION, operator-confirmed 2026-08-23: `semantic_768` (native EmbeddingGemma output) is
the canonical, primary persisted semantic representation.** This resolves a chain of five
undocumented, uncoordinated policy re-decisions made across less than a month without checking
prior state — Jul 27 (768) → Aug 3 proposal (768) → Aug 11 inventory (768, unexecuted) → **Aug 19
operator correction (512)** → Aug 22 undocumented code revert (back to 768). Full forensic trace
of that chain, and the live ground-truth evidence that resolved it, is preserved in
`openspec/changes/codereview-semantic-dimension-regression-aug22/tasks.md` section 1 — read it
before touching any of the three still-open historical docs (`parent-atlas-semantic-512-canonicalization/`,
`parent-atlas-semantic-768-canonical-contract/`, `parent-atlas-768-dim-migration/SPEC.md`), all of
which now point back to this section as the authoritative resolution.

**Why 768, not 512**: Postgres's own truth-of-record column (`codebase_chunk_index.content_embedding`)
is natively 768-dim and was already populated (52,380 rows) a full month before the Aug 19 freeze;
a Qdrant 768-dim mirror (`codebase_chunks_768_v2`) also already existed three weeks before that
freeze. The freeze's own stated premise — "a production/canonical 768-dimensional Qdrant corpus
was not created" — did not match what was actually populated, even at the time it was written.

**Truncation rule (the part that makes this safe, not just a reversal)**: lower-dimensional
projections via MRL-prefix + L2-renorm (512, 256, 128 — same mechanism, different prefix length)
remain legitimate **derived, secondary** lanes — but a truncation may only be produced **from a
768-dim source that has already been indexed and validated**, never computed speculatively ahead
of or in parallel with 768 indexing, and never treated as if it could stand in for 768 if the
768 index is incomplete or unvalidated. This is the same MRL-prefix mechanism the Aug 19 freeze doc
describes for `semantic_512` — the only change is which lane is primary-and-required versus
derived-and-optional.

**384 is retired, not a routing lane** (2026-08-30, see the verification entry below): the former
`content_embedding_384` column and the Warden/Nomic 384d routing lane it fed have been dropped —
verified zero rows had 384-only data with no corresponding 768 vector, archived per this repo's
archive-not-delete convention, then the column was removed. Do not reintroduce a 384d lane, and
do not cite `gpu:warden:cache:384d:*` Redis keys as live — they predate the drop.

**Autoencoder latent lanes are a separate mechanism from MRL truncation** — a trained encoder
projection, not a vector prefix. Corrected 2026-09-16 (via
`parent-atlas-error-embedding-768-migration` task 7.1/7.2) — the "zero rows"/"does not exist" claims
below were stale, verified live against Postgres and Qdrant directly, not assumed:

- **`latent_256`**: real and populated — `codebase_chunk_index.latent_256` (55,169 rows) + Qdrant
  `codebase_chunks_latent256`, 1:1 with the 768 corpus. Unchanged from the prior note.
- **`latent_64`**: **no longer schema-only.** `codebase_chunk_index.latent_64` now has **1,703**
  populated rows (verified live `count(latent_64)`, 2026-09-16) — the autoencoder producing it has
  been run against at least this many rows, contradicting the old "untrained, zero rows" framing.
  No Qdrant `codebase_chunks_latent64` collection exists yet (verified live via `GET /collections`)
  — this lane is Postgres-only so far, not yet mirrored to Qdrant.
- **`latent_128`**: **exists and is substantially populated**, not absent. `codebase_chunk_index`
  has a real `latent_128` column (halfvec(128)) with **55,169** populated rows — a full match to
  `latent_256`'s population, derived via a deterministic `SLICE_FIRST_N` + L2-renormalize of
  `latent_256` (not a new training run, not MRL truncation of the raw 768d vector — see
  `sveltekit-frontend/drizzle/manual/20260912_latent_128_columns.sql`'s own header comment for the
  exact distinction). Its `atlas_representation_registry_v3` promotion (`CANDIDATE`→`VERIFIED`) was
  explicitly, deliberately skipped by that migration's author — the column and data are real, the
  registry bookkeeping is not. No Qdrant `codebase_chunks_latent128` collection exists yet (verified
  live) — also Postgres-only so far. A parallel `error_embedding_latent_128` column exists too
  (error-fixing lane, distinct from this content-embedding lane), currently populated only at
  smoke-test scale (20 rows) — see that openspec change for the honest partial-completion detail.

**PRIMARY EMBEDDING MODEL**: `embeddinggemma:latest` (768-dim)
- **Canonical storage**: Qdrant — **two 768-dim collections currently coexist**,
  `codebase_chunks_768` (105,762 points, older generation, richer payload incl. `graphAuthorityScore`/
  `pagerank`/`community_id`/`tags`) and `codebase_chunks_768_v2` (52,380 points, `embedding-contract-768.ts`'s
  declared canonical target, leaner identity-only payload). **This split is a separate open finding**,
  not resolved by this policy update — see `codereview-semantic-dimension-regression-aug22/tasks.md`
  section 5 before picking one as "the" collection to query or write to.
- **Postgres mirror**: `codebase_chunk_index.content_embedding` (vector(768), 52,380 rows populated as of 2026-08-23)
- **Retrieval path**: Qdrant ANN → Postgres join by source_ref → optional Neo4j topology expansion

**Live re-verification (2026-09-27, `GET /collections/<name>` against the live Qdrant instance,
via `docs/reports/qdrant-collection-roles-v1.json`'s regenerated census — this superseded a stale
0-consumer bug in that same script, see `parent-atlas-qdrant-structural-payload-enrichment/tasks.md`
`QDRANT-COLLECTION-ROLE-RECHECK-2026-09-12-R2`)**:

| Collection | Live points | Named vectors | Note |
|---|---|---|---|
| `codebase_chunks_768` | **328,348** (was 105,762/109,776/40,568 at various earlier dates — real growth, not a typo; update again before citing an old figure) | `content`/`error`/`signature`, all 768-dim Cosine | `ACTIVE_SEMANTIC_PROJECTION` |
| `codebase_chunks_768_v2` | 52,816 (was 52,380) | `content`/`error`/`signature`, all 768-dim Cosine | `COMPARISON_CHALLENGER`, still `NOT_PROMOTED` — the split below is still unresolved |
| `codebase_chunks_512` | 53,380 (matches prior 53,379) | single unnamed vector | `SEMANTIC_EXPERIMENT` |
| `codebase_chunks_256` | **does not exist** | — | confirms the note below is still accurate |
| `codebase_chunks_128` | **does not exist** | — | confirms the note below is still accurate |
| `codebase_chunks_latent256` | 55,169 (matches Postgres `latent_256` population exactly) | single unnamed vector | `LEARNED_LATENT_PROJECTION` |
| `codebase_chunks_latent128` | **does not exist** | — | Postgres `latent_128` (55,169 rows) has no Qdrant mirror yet, per this file's own earlier note — still true |
| `codebase_chunks_latent64` | **does not exist** | — | Postgres `latent_64` (1,703 rows) has no Qdrant mirror yet, per this file's own earlier note — still true |
| `codebase_chunks_384` | 1 point | 384-dim | `LEGACY_SEMANTIC`, near-empty as documented |
| `codebase_chunks_384_hybrid` | 10 points | 384-dim | `LEGACY_SEMANTIC`, near-empty as documented |

Bottom line: the 768/512/latent-256 lanes are real and match (or exceed) what this file already
claimed; the 256/128 MRL lanes and the latent-128/latent-64 Qdrant mirrors are still genuinely
absent, not a doc gap — don't build them speculatively without a stated need, per
`DEPENDENCY-CAPABILITY-GUARD-01`.

**SECONDARY ROUTING LANE(S)**: 512d, 256d, 128d — all MRL-truncated prefixes of the same 768d
embeddinggemma vector (optional, cost-optimized re-ranking). 384d is retired (see above) — do not
add it back as a lane.
- **Purpose**: Fast re-ranking when VRAM pressure is high (skip GPU cost), or a smaller ANN index
  where full 768d recall isn't required
- **Storage**: 512d → Qdrant `codebase_chunks_512` (derived, `projected_from_768d` payload field
  confirms derivation); 256d/128d MRL lanes are not yet built as separate Qdrant collections — do
  not assume `codebase_chunks_256`/`codebase_chunks_128` exist without checking Qdrant collections live
- **Use case**: Final ranking of top-K after primary 768d ANN retrieval, or a bounded secondary index
- **NOT authoritative**: None of these lanes produce final recall results on their own; all guide/derive from 768d

**HARD RULES** (non-negotiable):
- ✅ Always use 768-dim embeddings from embeddinggemma as the primary source for Qdrant and Postgres
- ✅ Any 512d/256d/128d truncation must be produced from an already-indexed, already-validated 768d source — never speculatively ahead of it
- ✅ 512d/256d/128d routing lanes are OPTIONAL; don't block retrieval if their cache/collection misses
- ❌ Never make a truncated (512d/256d/128d) lane the primary retrieval authority
- ❌ Never reintroduce a 384d lane — it was retired 2026-08-30, verified zero-loss
- ❌ Never use different embedding models for the same dimension (embeddinggemma only for 768d)
- ❌ Never silently re-decide this policy in a future session without first reading the reconciliation trace above — that exact failure mode is what produced 5 rounds of churn in under a month

**`embedding_dimension` metadata column is unreliable — do not filter on it (found 2026-08-29,
same-day correction of a concurrent-agent regression)**: a background agent working the same day
built a review-pool/manifest/backfill-plan chain (`plan-current-semantic768-corpus-manifest-v1.mjs`,
`plan-semantic768-backfill-v1.mjs`, `prepare_golden_review_pool_v1.py`) that filtered
`codebase_chunk_index` on `embedding_dimension = 768`, found only 810 "valid" rows out of 55,169,
and concluded the canonical `content_embedding` column was mostly missing 768-dim data — then
"corrected" itself to treat the much-smaller `content_embedding_768` column (1,386 rows, only
~810 passing that same filter) as canonical instead. **This was backwards.** Verified live via
`vector_dims(content_embedding::vector)`: all 55,169 `content_embedding`-populated rows are
genuinely, exactly 768-dimensional — the halfvec(768) column type makes anything else physically
impossible. `embedding_dimension` is a separate, independently-set metadata column that is simply
**stale** for 52,365 of those rows (tagged `384` despite holding real, verified 768-dim vectors).
Trusting `embedding_dimension` over the actual vector data inverted the real picture: `content_embedding`
(55,169 real rows) is still canonical per the policy above; `content_embedding_768` (a much smaller,
separate column — do not confuse the two) is not. **Rule**: never gate a canonical-embedding
audit/backfill/corpus-manifest script on `embedding_dimension` alone — verify real dimensionality
via `vector_dims(column::vector)` (or trust the halfvec(768)/vector(768) column type itself) before
concluding data is missing or wrong-dimensional. If `embedding_dimension` disagrees with the
verified real dimension, the metadata column is what's wrong, not the vector. Do not use 384 as a
filter/gate on `content_embedding` for this reason — use 768, verified structurally, every time.

**2026-08-30 verification + cleanup (embedding_dimension backfill, latent lanes checked, legacy column dropped)**:
Re-verified the above live rather than trusting the doc: `codebase_chunk_index.content_embedding`
(halfvec(768)) has 55,169 populated rows, all confirmed genuinely 768-dim via `vector_dims()`.
Backfilled the stale `embedding_dimension` metadata column from real `vector_dims()` (was 52,402
rows mistagged `384` despite holding real 768-dim vectors; now 55,816 correctly say `768`, only 37
rows — which genuinely have no embedding — still say `384`). Also checked the derived/latent lanes
referenced elsewhere in this doc, since claims about them hadn't been verified against live data:
- **latent_256** (`codebase_chunk_index.latent_256` halfvec(256) + Qdrant `codebase_chunks_latent256`):
  real and fully live — 55,169 rows/points, a 1:1 match with the 768 corpus.
- **latent_64** (`codebase_chunk_index.latent_64` vector(64) + would-be Qdrant `codebase_chunks_latent64`):
  at the time of this 2026-08-30 check, zero rows populated, Qdrant collection absent, schema-only.
  **Superseded 2026-09-16**: now has 1,703 populated rows (verified live) — the autoencoder has
  since been run against real data; the Qdrant collection is still absent. See the corrected note
  in this section's earlier "Autoencoder latent lanes" paragraph for current detail.
- **latent_128**: at the time of this 2026-08-30 check, genuinely absent (no column, no Qdrant
  collection). **Superseded 2026-09-16**: the column now exists (`halfvec(128)`) with 55,169
  populated rows, added via `sveltekit-frontend/drizzle/manual/20260912_latent_128_columns.sql` —
  this 2026-08-30 note's "does not exist anywhere in this repo" is no longer accurate. Qdrant
  mirror still absent. See the corrected note earlier in this section for current detail.
- **Dropped `codebase_chunk_index.content_embedding_384` (legacy vector(384))**: verified zero rows
  had 384-only data with no corresponding 768 vector (no data loss), archived all 52,380 populated
  rows to `deeds_labs/archive/2026-08-30/content_embedding_384_backup.csv` per this repo's
  archive-not-delete convention (manifest: `docs/archive-manifest.json`), then dropped the column.
- **`codebase_chunks_768` vs `codebase_chunks_768_v2` (both still live, NOT deduped)**: checked
  `src/lib/server/atlas/qdrant-collection-contracts.ts` directly — this is not stale duplication.
  The plain `768` collection is explicitly documented in-code as the "older source contract"
  (multi-vector: content/signature/error + sparse bm42); `768_v2` is the "EMB3A target contract"
  (dense-only `content` vector, revision-filterable), an in-progress migration target referenced by
  43 live files. Do not merge or delete either without the person driving the EMB3A migration.

**Retrieval Decision Tree** (canonical — this merges what were two conflicting "canonical order"
diagrams in this file; the "Query Flow (Canonical Order)" diagram further down now points here
instead of restating its own order):
```
Query arrives
  → Embed with embeddinggemma:latest (768-dim)
  → Qdrant ANN on codebase_chunks_768 (top-20)
  → Postgres join to get source_ref, summary, etc.
  → optional Neo4j topology expansion
  → rerank (GPU cosine similarity)
  → Optional: check Redis for the 512d MRL routing cache (NOT 384d — that lane is retired)
  → If cache hit: use 512d score for final re-ranking
  → If cache miss: use 768d score directly
  → Return top-10 candidates to ACE context assembler
```

**For New Scripts**: Reference `REDIS_CONNECTION_FIXES.md` for the correct Redis pattern (host/port/password, not URL strings).

---

