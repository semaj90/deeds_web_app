## 1. Writer-completeness audit (read-only, must complete first)

- [x] 1.1 Enumerated candidate `codebase_chunk_index` writer files. Real
      scope was far larger than the ~19 estimated at proposal time: 150+
      files merely *reference* the table name; 59 contain a real
      `INSERT`/`UPDATE` against it; a tight `content_hash`-proximity filter
      narrowed this to 24 files, all of which were individually read this
      pass. The remaining ~35 write-capable-but-unfiltered files were **not**
      read (see `scopeHonesty` in the report below) — this task is complete
      for the tight candidate list only, not the full loose-reference
      universe.
- [x] 1.2 Read and classified all 24 tight-filter candidates. **Corrects an
      error made earlier the same day** in the sibling change's
      `LEGACY-HASH-WRITER-IDENTIFICATION-01` entry: `codebase-semantic-indexer.ts`
      does **not** write directly to Postgres (zero `pg`/`Pool`/`INSERT INTO`
      references in the file) — its `content_hash` write is a **Qdrant
      payload** field. The real mechanism is a confirmed two-hop pipeline:
      `codebase-semantic-indexer.ts` (writes 16-char-truncated SHA-256 of
      chunk text into a Qdrant point payload, collection `codebase_chunks_768`)
      → `sveltekit-frontend/scripts/mirror-qdrant-to-postgres.ts` (scrolls
      that same collection, copies `payload.content_hash` verbatim into
      Postgres). A third, independent writer using the identical
      16-char-truncated-chunk-SHA256 formula was also found:
      `apply-null-content-hash-metadata-repair.mjs` (NULL-only, gated,
      `--apply`-only). `index-full-repo-for-search.mjs` remains confirmed as
      the direct 64-char writer (unchanged from initial finding). Full
      per-file classification in the report below.
- [x] 1.3 Read `graphify_files`' real writer chain:
      `observe-workspace-source-binding.mts` → `deriveCodeSourceRevisionV1()`
      (`sveltekit-frontend/src/lib/server/atlas/identity/code-source-revision-v1.ts`)
      → `materialize-graphify-source-inventory.mts`. Formula confirmed:
      `sha256(Buffer.from(wholeFileContent, 'utf8')).digest('hex')` — full
      64-char, no truncation, no line-ending normalization. Answers
      design.md's first Open Question: no normalization is applied upstream,
      so none should be introduced on the `codebase_chunk_index` side either
      unless a parity check (task 4.1) proves otherwise.
- [x] 1.4 Wrote the audit result to
      `docs/reports/codebase-chunk-index-writer-audit-v1.json`
      (`mode: READ_ONLY`, `writesPerformed: false`), including an explicit
      `scopeHonesty` block stating `WRITER_AUDIT_PARTIAL` (not `COMPLETE`) —
      the ~35 unread write-capable candidates remain an unquantified residual
      risk, not ruled out.
- [x] 1.5 Not proceeding to section 3 — this session stops at section 1 per
      explicit scope. `WRITER_AUDIT_PARTIAL` status alone would gate section
      3 further even without that instruction, per this task's own condition.

## 2. Metadata parameter contract finalization

- [x] 2.1 Confirmed exact column names/types read-only against the live
      schema (`information_schema.columns` for `codebase_chunk_index`,
      2026-09-15) — none of the 5 proposed names collide with any of the 86
      existing columns. Cross-checked against the real consumer,
      `scripts/atlas/audit-selected-graphify-structural-lineage-v1.mjs`
      (owner: `parent-atlas-retrieval-lineage-dag-convergence`): it already
      dynamically probes `information_schema.columns` before querying
      (`tableColumns()` helper) rather than hardcoding a column list, so
      adding `file_content_hash` is compatible with its existing pattern —
      task 6.1 (separately authorized) extends that same dynamic-column
      check, no consumer-side redesign needed. Finalized names/types:
      - `file_content_hash text` — 64-char lowercase hex SHA-256, whole-file
        scope, nullable.
      - `content_hash_scope text` — `'chunk'` or `'whole_file'`, nullable
        (describes the EXISTING `content_hash` column, not the new one —
        `file_content_hash` has a single fixed contract by construction and
        needs no per-row scope tag).
      - `content_hash_algorithm text` — nullable.
      - `content_hash_length integer` — nullable.
      - `content_hash_version integer` — nullable (see 2.2).
      No live human sign-off from a second person was available in this
      session; this decision is recorded for review before migration
      apply (section 3), not treated as final human authorization.
- [x] 2.2 Finalized `content_hash_version` as a plain integer, starting at
      `1`. Version `1` = "classified by the `codebase-chunk-index-writer-audit-v1`
      audit dated 2026-09-15" (`docs/reports/codebase-chunk-index-writer-audit-v1.json`).
      If a future pass finds a writer this audit missed (a real possibility
      — see that report's `scopeHonesty` block, ~35 candidates unread), rows
      newly attributed to it get version `2`, etc. Existing version-`1`
      rows are never silently reinterpreted by a later version's findings.
- [x] 2.3 Defined the classification-to-metadata mapping, keyed by confirmed
      writer identity (never by hash length/shape):

      | Confirmed writer | scope | algorithm | length | version |
      |---|---|---|---|---|
      | `index-full-repo-for-search.mjs` (direct INSERT) | `chunk` | `sha256` | `64` | `1` |
      | `codebase-semantic-indexer.ts` + `mirror-qdrant-to-postgres.ts` (two-hop via Qdrant) | `chunk` | `sha256` | `16` | `1` |
      | `apply-null-content-hash-metadata-repair.mjs` (NULL-only repair) | `chunk` | `sha256` | `16` | `1` |
      | any of the ~35 unaudited write-capable candidates | `NULL` (unknown) | `NULL` | `NULL` | `NULL` |

      **Important honest caveat surfaced while finalizing this**: this
      mapping is keyed by *writer identity*, but no existing
      `codebase_chunk_index` row currently records which writer produced it
      — writer identity is not itself a stored, queryable fact per row.
      Applying this mapping to backfill *existing* rows (task 5.2, out of
      this change's scope) therefore cannot simply "look up the writer" —
      it requires either (a) completing the remaining ~35-file writer audit
      first to be certain every row's true origin is covered, or (b)
      explicitly accepting that some fraction of the 39,114 16-char rows
      may originate from a still-unidentified writer with a *different*
      scope than `chunk`, and leaving those specific rows' metadata `NULL`
      rather than guessing from length. This mapping table is a decision
      about *known* writers only; it is not itself a safe backfill
      algorithm — that distinction must be preserved when task 5.2 is
      eventually authorized.

## 3. Schema migration (draft only — human review required before apply)

- [x] 3.1 Drafted the migration:
      `sveltekit-frontend/drizzle/manual/20260915_codebase_chunk_index_whole_file_hash.sql`.
      All 5 columns via `ADD COLUMN IF NOT EXISTS`, all nullable, no
      `DROP`/`ALTER TYPE`/`NOT NULL` on anything existing or new. Matches
      the exact precedent style of `20260909_atlas_packets_source_revision.sql`
      (additive column + partial index, no backfill). Also added the
      matching Drizzle schema declarations to
      `sveltekit-frontend/src/lib/server/db/schema-postgres.ts`'s
      `codebaseChunkIndex` table (5 new fields + `fileContentHashIdx`), per
      this repo's convention of keeping schema.ts and manual SQL in
      agreement (same pattern as the `source_revision` precedent).
- [x] 3.2 Manually reviewed the generated SQL and **found and fixed one real
      bug during review**: the initial draft used
      `ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS ...` for the
      `content_hash_scope` CHECK constraint — this is **not valid
      PostgreSQL syntax** (only `ADD COLUMN IF NOT EXISTS` and
      `DROP CONSTRAINT IF EXISTS` exist; there is no `ADD CONSTRAINT IF NOT
      EXISTS`). Fixed to the idiomatic guarded `DO $$ ... pg_constraint ...
      END $$` form. Also found, while adding the matching Drizzle
      declaration, that `source_ref` — a real, live column on this table —
      was previously undeclared in `schema-postgres.ts` (pre-existing
      schema/DB drift, not introduced by this change); added it because the
      new `fileContentHashIdx` needs it, without attempting a broader
      drift-remediation pass. `tablesFilter` in `drizzle.config.ts` is
      confirmed unaffected — `codebase_chunk_index` is already declared in
      the schema, this migration only adds columns to it, no new/dropped
      tables are involved. TypeScript diagnostics confirmed clean after the
      `sourceRef` fix (no errors, only pre-existing unrelated deprecation
      warnings elsewhere in the file).
- [x] 3.3 **UPDATE 2026-09-15 (same day): explicit human authorization was
      given to apply this migration** (asked directly, confirmed "yes,
      apply it now"). Applied via a new hand-written script,
      `sveltekit-frontend/scripts/atlas/apply-codebase-chunk-index-whole-file-hash-columns-v1.mjs`
      (matching this repo's manual-migration convention — `drizzle/manual/`
      files are hand-applied, not run through `drizzle-kit migrate`; see
      the identical precedent for `20260909_atlas_packets_source_revision.sql`).
      Each statement executed as its own separate `pool.query()` call
      (required specifically for `CREATE INDEX CONCURRENTLY`, which cannot
      run inside any transaction, including the implicit one Postgres opens
      for a multi-statement string sent as a single query).
      **Live readback confirms**: all 5 columns exist
      (`file_content_hash`, `content_hash_scope`, `content_hash_algorithm`,
      `content_hash_length`, `content_hash_version`, all correct types),
      the `codebase_chunk_index_content_hash_scope_check` constraint exists,
      the `idx_codebase_chunk_index_file_content_hash` partial index exists.
      **Zero backfill occurred**: `55,853` total rows, `0` with
      `file_content_hash` populated, `0` with `content_hash_scope`
      populated — exactly as designed. This closes section 3's real-world
      apply step; sections 4-6 remain separately gated (parity proof,
      writer rollout, downstream join wiring were NOT authorized or
      attempted by this apply).

## 4. Dry-run parity proof (separately authorized; not part of this change's apply)

- [x] 4.1 Ran the dry-run parity proof read-only:
      `scripts/atlas/prove-file-content-hash-parity-v1.mjs` (new script,
      zero writes). Sampled 20 `repo:root` rows from the admitted
      execution's `graphify_execution_file_membership_v2` membership, read
      each file's real bytes off disk, computed
      `sha256(bytes).digest('hex')` in-memory, compared against the row's
      stored `content_hash`. Result: **19/20 exact byte-for-byte matches**,
      confirming `graphify_files`' whole-file SHA-256 formula (task 1.3) can
      be reproduced exactly from live disk content with no normalization —
      the design decision to apply none is validated, not just assumed.
      Evidence: `docs/reports/file-content-hash-parity-proof-v1.json`.
- [x] 4.2 The 1 non-match is **not a hash-formula discrepancy** — it is
      `$lib/utils/file-reader.ts`, a SvelteKit import alias in
      `source_ref`/`repository_relative_path`, not a real filesystem path
      (`ENOENT` on read, not a hash mismatch). This is the exact,
      already-known issue `CURRENT-SOURCE-REF-VOCABULARY-GUARD-01`
      (2026-09-11, same tasks.md file) already flagged and added schema
      rejection for (`$lib/`, `$app/`, `@/`, `~/` aliases) — not a new
      finding, and not something this task needed to resolve itself.
      **No normalization discrepancy exists; section 4 is a clean pass.**

## 5. Bounded writer rollout — 5.2 APPLIED 2026-09-15 (explicit human authorization: full-table scope)

- [x] 5.1 DONE 2026-09-15 (later same day, code fix — not yet re-verified
      live). Updated `scripts/atlas/index-full-repo-for-search.mjs`'s
      `upsertPostgres()` (the confirmed writer behind the currently-running
      re-index job) to write `file_content_hash` on every INSERT/UPDATE,
      using the file's whole-file `sha256(text)` value that this script
      already computed once per file as `chunk.file_hash` (see
      `processFile`, was previously computed but never persisted). Also
      populated the metadata columns for this writer's OWN `content_hash`
      contract, confirmed by reading its `contentHash = sha256(\`${relPath}:${idx}:${c.text}\`)`
      formula directly (task 1.2's audit already classified this writer):
      `content_hash_scope='chunk'`, `content_hash_algorithm='sha256'`,
      `content_hash_length=64` (full, unsliced — this writer is NOT the
      16-char-truncated one), `content_hash_version=1`. Syntax-checked via
      `node --check` — clean, no new diagnostics introduced.

      **Not yet proven live**: the background re-index job (PID `43384`,
      launched earlier this session) had already loaded the OLD code into
      memory before this edit — Node does not hot-reload a running process's
      module source, so that job will keep writing `file_content_hash IS
      NULL` rows until it finishes and a fresh invocation of this script
      picks up the fix. Confirming this requires either waiting for that job
      to finish and running a fresh incremental pass, or restarting it — not
      done this pass (would kill an already-hours-long run for a benefit
      that only applies to files it hasn't reached yet). Re-verify via the
      same direct-count check used above
      (`count(*) FROM codebase_chunk_index` vs
      `count(file_content_hash)`) after the current job completes or a new
      one runs.

      **UPDATE, same day, minutes later**: instead of waiting for the job to
      finish, re-ran the existing idempotent backfill script
      (`backfill-codebase-chunk-index-file-content-hash-v1.mjs --apply`,
      `WHERE file_content_hash IS NULL` only — safe to run concurrently with
      the still-running re-index job, no table lock conflict, no destructive
      action) to catch up the ~70,000 rows the job had already inserted with
      the old code. Result: `hashed: 69,815`, `updated: 69,815`,
      `alreadyPopulated: 52,154` (table grown to `125,668` rows total).
      **Live re-run of `audit-selected-graphify-structural-lineage-v1.mjs
      --repository-id repo:root` immediately after: `exactChunkMatchesViaFileHash`
      jumped from `894` to `6,709`** (27.7% of `24,185` membership rows) —
      closely tracking the raw file-coverage figure (`6,571` distinct
      `source_ref`s present, measured just before this backfill), confirming
      that once `file_content_hash` is populated, whole-file-hash matching is
      now essentially complete for every `repo:root` file this project has
      actually indexed so far. The residual gap (`24,185 - 6,709` ≈ 72%) is
      overwhelmingly the raw indexing-coverage gap (files the re-index job
      hasn't reached yet), not a hash-formula problem anymore — this
      sharpens the earlier root-cause finding rather than contradicting it.

      **Confirmed live-and-biting, not theoretical (2026-09-15, later same
      day)**: the full-repo re-index job launched earlier this session
      (`index-full-repo-for-search.mjs --apply`, PID 43384, still running)
      has grown `codebase_chunk_index` from `55,853` to `116,239` rows
      (verified via direct count) while `file_content_hash`-populated rows
      stayed exactly at `52,154` — the one-time 5.2 backfill count,
      unchanged. Every one of the ~60,000 new rows this job has written so
      far has `file_content_hash IS NULL`, because `index-full-repo-for-search.mjs`
      is one of the task-1-confirmed writers that was never updated per this
      task. Consequence for `CURRENT-STRUCTURAL-LINEAGE-01`: raw file
      *coverage* for `repo:root` is genuinely climbing from the re-index
      (distinct `source_ref`s present in `codebase_chunk_index`, of 24,185
      `repo:root` membership rows: `906` at session start → `6,571` now,
      27.2%), but `exactChunkMatchesViaFileHash` is stuck at `894` and will
      **not** rise further from this job alone — it can only close the part
      of the gap that was a pure coverage problem for rows that already
      existed before 5.2's backfill ran; every newly-inserted row needs 5.1
      done before it can ever match. Do not re-run the structural lineage
      audit expecting the count to move until 5.1 is closed.
- [x] 5.2 Ran `scripts/atlas/backfill-codebase-chunk-index-file-content-hash-v1.mjs`
      (new script; `--dry-run` default, `--apply` flag). **Found and fixed a
      real bug during the dry run before applying**: `codebase_chunk_index.relative_path`
      mixes TWO root conventions across rows from different historical
      writers — some relative to the repo root (`packages/*`, `docs/*`),
      others relative to `sveltekit-frontend/` (`src/lib/*`, `src/routes/*`).
      Confirmed live: `src/lib/server/db/schema-postgres.ts` (a file edited
      earlier this same session) reported `ENOENT` against the bare repo
      root but exists under `sveltekit-frontend/`. First dry run (repo-root
      only) found just 16,891/55,853 resolvable; fixed to try both roots,
      re-ran dry run: 52,154/55,853 (93.4%) resolvable, 3,662 (6.6%) genuine
      read failures (spot-checked — deleted/renamed files across this
      project's long history, e.g. stub files and pruned `AGENTS.md` cards,
      not a further path bug), 37 alias-path skips (matches task 4.2's
      already-known count).
      **Applied** (explicit authorization: "full table" scope): `52,154`
      rows updated, `updated === hashed` exactly, `0` guessed/fabricated.
      **Live re-check of the actual target gate** (read-only, join
      `codebase_chunk_index.file_content_hash` against
      `graphify_execution_file_membership_v2.content_hash` for the admitted
      execution): **10,787 exact matches — up from 0.** This is the first
      real movement `CURRENT-STRUCTURAL-LINEAGE-01` has had since it opened.
      Evidence: `docs/reports/backfill-codebase-chunk-index-file-content-hash-v1.json`.

## 6. Downstream wiring — 6.1 DONE 2026-09-15 (same day)

- [x] 6.1 Added a `file_content_hash`-based join **additively**, alongside
      the existing `content_hash`-based join (never replacing it —
      `report.status`/`firstBlocker`/`nextGate` still compute from the
      original content_hash join only). New fields:
      `exactChunkMatchViaFileHash` per row, `exactChunkMatchesViaFileHash`
      count. Fixed one real bug while wiring this in: the new
      `fileHashChunks` variable was first declared inside the `try` block
      (block-scoped), causing a `ReferenceError` when referenced afterward
      — moved to the same top-level `let` scope as `chunks`/`packets`.
      **Live re-run result: `894` exact matches via `file_content_hash`**
      (up from `0`), out of `25,271` membership rows. Consistent with the
      earlier ad-hoc `10,787`-chunk-row count from a coarser query: `10,787
      ÷ ~12 chunks/file ≈ 899` — the two numbers count different things
      (chunk rows vs. distinct member rows), not a discrepancy.
      **`CURRENT-STRUCTURAL-LINEAGE-01`'s primary gate is still
      `CURRENT_PACKET_CHUNK_JOIN_UNPROVEN`** — `894/25,271` (3.5%) is real
      progress, not closure. Most of the remaining 96% is plausibly members
      from non-`repo:root` repositories (`claude-mem`, `turbovec`, etc.)
      that `codebase_chunk_index` never indexed at all — not investigated
      further this pass; a real next step, not assumed.

- [x] 6.2 Re-ran the structural lineage audit (see 6.1 above for the
      result: `894/25,271` via file hash, primary gate still
      `CURRENT_PACKET_CHUNK_JOIN_UNPROVEN`, not `CURRENT_STRUCTURAL_LINEAGE_EXACT`).
      Recorded in `parent-atlas-retrieval-lineage-dag-convergence/tasks.md`
      (this change's owner), cross-referenced back here.
