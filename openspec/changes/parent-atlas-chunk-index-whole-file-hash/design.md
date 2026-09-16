## Context

`codebase_chunk_index` (55,853 rows) is Postgres canonical truth for code chunks. Its
`content_hash` column was populated by at least two different writers over time, each hashing a
different, narrower scope than what `CURRENT-STRUCTURAL-LINEAGE-01`'s exact join needs:

- `sveltekit-frontend/scripts/codebase-semantic-indexer.ts` (lines 556/567/584/677): per-chunk text,
  SHA-256 truncated to 16 hex chars (39,114 rows).
- `scripts/atlas/index-full-repo-for-search.mjs` (line 607): composite string
  `${relPath}:${idx}:${chunkText}`, full 64-char SHA-256 (part of the 16,702 "long" rows).
- 37 rows have no hash at all.

`graphify_files` and `graphify_execution_file_membership_v2` uniformly carry a whole-file,
untruncated SHA-256 (351,065 rows, confirmed via `apply-file-level-source-refs-content-reconciled-v1.mjs`,
which sources `content_hash` straight from `graphify_files`). No combination of existing
`codebase_chunk_index` hash values can ever equal a whole-file hash, regardless of upstream
source-authority or coverage improvements — this is a structural, not a coverage, gap.

Constraint from this repo's Drizzle Safety Rule and its "no silent repair of canonical identity"
convention (see `CLAUDE.md`, and the `notAuthorized` fields already recorded in
`docs/reports/content-hash-format-heterogeneity-v1.json`): any schema change here must be additive,
reviewable, and must not retroactively reinterpret or backfill existing `content_hash` values as
part of this same pass.

Stakeholders: `parent-atlas-retrieval-lineage-dag-convergence` (the consumer/blocked party —
`CURRENT-STRUCTURAL-LINEAGE-01`'s exact join is what this unblocks) and whoever owns
`codebase_chunk_index`'s writer surface going forward.

## Goals / Non-Goals

**Goals:**
- Give `codebase_chunk_index` a whole-file-scoped, untruncated SHA-256 hash
  (`file_content_hash`) that can be joined exactly against `graphify_files`/
  `graphify_execution_file_membership_v2.content_hash`.
- Make the hash contract self-describing: any future reader can determine a row's hash scope,
  algorithm, length, and contract version without reading writer source code (which is exactly what
  the 2026-09-15 investigation had to do by hand).
- Identify, but not yet fix, every writer that needs to populate the new column (only 2 of ~19
  candidate files were read on 2026-09-15 — this design closes that gap as an audit task, before
  any writer code changes).

**Non-Goals:**
- Backfilling or recomputing any existing `content_hash` value.
- Redefining `content_hash`'s existing chunk-scoped semantics or touching any code that reads it
  today.
- Running any migration, backfill, or writer change as part of this OpenSpec change's proposal/
  design/spec/tasks artifacts — those are downstream, separately-gated implementation tasks.
- Deciding whether `content_hash` itself should eventually be deprecated in favor of
  `file_content_hash` — that is future work, explicitly out of scope here.
- Any Qdrant, Neo4j, or Redis/Valkey schema or cache changes.

## Decisions

1. **Additive new column, not redefinition of `content_hash`.**
   Rejected alternative: redefine `content_hash` to always mean whole-file. Rejected because an
   unknown number of live readers (10+ files touch `content_hash` per the 2026-09-15 grep) already
   assume chunk scope; silently changing its meaning would be a correctness regression disguised as
   a fix. Additive is strictly safer and matches this repo's own "layered ownership, not competing
   owners" duplication-prevention rule.

2. **Explicit metadata parameters (`content_hash_scope`, `content_hash_algorithm`,
   `content_hash_length`, `content_hash_version`), not just a bare new hash column.**
   Rejected alternative: add `file_content_hash` alone and document the contract only in prose
   (like this file). Rejected because prose docs already exist and did not prevent this exact bug
   from going unnoticed for an unknown number of sessions — a self-describing column lets any script
   (this repo already writes dozens of read-only audit scripts) mechanically verify hash scope/
   length/algorithm without re-deriving it from source. `content_hash_version` exists so a *third*
   future hash convention doesn't repeat this investigation.

3. **Populate metadata parameters for existing rows from known writer identity only — `NULL`/
   `'unknown'` where the writer isn't confirmed, never inferred from length alone.**
   Rejected alternative: infer `content_hash_scope='chunk', content_hash_length=16` for every row
   with a 16-char hash. Rejected because length is a symptom, not proof of writer identity — a
   future writer could legitimately produce a different 16-char value for a different reason. Only
   rows whose writer is read and confirmed (as `codebase-semantic-indexer.ts` was on 2026-09-15) may
   have these fields populated; everything else stays `unknown` until confirmed. This mirrors the
   `LEGACY-HASH-WRITER-IDENTIFICATION-01` finding's own explicit caveat that only 2/~19 writers were
   read.

4. **`file_content_hash` computed from the whole file at write time, not derived from existing
   `content_hash` values.**
   Rejected alternative: try to reconstruct a whole-file hash from concatenated chunk hashes.
   Rejected — chunk boundaries/overlap (`CHUNK_OVERLAP` in `codebase-semantic-indexer.ts`) mean
   concatenated chunk text does not equal file text; any such reconstruction would produce a
   fabricated hash, which is exactly the "synthetic identity" pattern this repo's docs repeatedly
   warn against. `file_content_hash` must be computed fresh from real file bytes by an authorized,
   separately-gated backfill/writer-update pass.

5. **Writer completeness is an explicit audit task before any writer code is touched.**
   Rejected alternative: assume the 2 writers found via grep are the only ones and update just
   those. Rejected because the 2026-09-15 investigation explicitly flagged this as unverified
   (`notFullyExhausted` in the evidence JSON). This design adds a dedicated task to read the
   remaining ~17 candidate files and classify each as `WRITES_CONTENT_HASH` /
   `DOES_NOT_WRITE_CONTENT_HASH` / `NEEDS_FURTHER_READING` before any writer is scheduled for update.

## Risks / Trade-offs

- **[Risk]** A confirmed writer computes `file_content_hash` inconsistently (e.g. line-ending
  normalization differs between the whole-file read and the Graphify file-hash writer, producing a
  hash that still doesn't match despite being "whole-file scoped").
  → **Mitigation**: the eventual backfill/writer-update task (out of scope here, but named in
  tasks.md as a dependency) must include a small live parity check — recompute `file_content_hash`
  for a handful of already-admitted `graphify_files` rows and confirm byte-for-byte match before any
  bulk write, mirroring the existing `pgcrypto digest() recomputation matched 10/10` pattern already
  used successfully in `backfill-chunk-id-and-content-hash.mjs`.
- **[Risk]** Adding 4-5 nullable columns to a 55,853-row table triggers an unexpectedly long table
  rewrite or lock under PostgreSQL 18.
  → **Mitigation**: use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ... DEFAULT NULL` (no `NOT NULL`,
  no computed default) — PostgreSQL adds nullable columns without a table rewrite; this is the same
  additive pattern already used successfully for `atlas_packets.source_revision` on 2026-09-09 (see
  `docs/parent-atlas-workstation-todo.md`'s readiness matrix entry for that column).
- **[Risk]** This change is approved and implemented, but the audit finds a *third* hash convention
  among the unread ~17 writer candidates, invalidating the "2 writers" framing.
  → **Mitigation**: tasks.md's writer-audit task is explicitly first and gates the writer-update
  task; if a third convention is found, that becomes a new, separately-scoped follow-up rather than
  silently expanding this change's blast radius.
- **[Trade-off]** Leaving `content_hash` untouched means two hash columns coexist indefinitely
  (`content_hash` chunk-scoped, `file_content_hash` whole-file-scoped) — a small but permanent
  cognitive-overhead cost, accepted deliberately in exchange for zero regression risk to existing
  readers.

## Migration Plan

Out of scope for this change's own artifacts (proposal/design/specs/tasks only propose and gate the
work). The eventual migration, when separately approved, follows this repo's Drizzle Safety Rule:
`drizzle-kit generate` → manual SQL review (confirm only `ADD COLUMN IF NOT EXISTS`, no `DROP`) →
`drizzle-kit migrate` (never `push`) → dry-run writer update on a bounded sample → live parity check
against a handful of `graphify_files` rows → only then a bounded, reversible writer-update rollout.
Rollback is trivial (the new columns are additive and can be dropped without touching `content_hash`
or any dependent row), but is itself a separately-authorized action, not automatic.

## Open Questions

- ~~Should `file_content_hash` be normalized before hashing~~ — **RESOLVED** by task 1.3 (writer
  audit, 2026-09-15): `graphify_files`' real writer chain
  (`observe-workspace-source-binding.mts` → `deriveCodeSourceRevisionV1()` →
  `materialize-graphify-source-inventory.mts`) applies **no** normalization —
  `sha256(Buffer.from(wholeFileContent, 'utf8')).digest('hex')` over raw bytes as read from disk.
  A future `file_content_hash` writer must do the same (no line-ending or other normalization) to
  have any chance of matching, subject to confirmation by task 4.1's live parity check.
- Long-term: should `content_hash` eventually be deprecated in favor of `file_content_hash` plus a
  separate `chunk_content_hash`? Explicitly deferred — not this change's decision to make.
- New, surfaced while finalizing task 2.3: writer identity is not itself a stored, per-row fact in
  `codebase_chunk_index` today. The classification-to-metadata mapping (tasks.md section 2) can
  state what metadata a *known* writer's rows should carry, but cannot by itself tell which
  existing rows came from which writer. Resolving this — via the remaining ~35-file writer audit,
  a distinguishing marker (e.g. correlating `qdrant_id` format or `indexed_at` timestamps with each
  writer's known run history), or accepting partial `NULL` metadata coverage — is a decision for
  task 5.2 (backfill), not resolved by this design.
