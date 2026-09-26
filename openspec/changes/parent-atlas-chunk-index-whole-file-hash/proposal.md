## Why

`CURRENT-STRUCTURAL-LINEAGE-01` (owned by `parent-atlas-retrieval-lineage-dag-convergence`)
requires an exact `source_ref + content_hash` join between `codebase_chunk_index` and
`graphify_execution_file_membership_v2`/`graphify_files`, and it returns `0/25,271` matches. A
2026-09-15 read-only investigation (`docs/reports/content-hash-format-heterogeneity-v1.json`,
tasks.md entries `CONTENT-HASH-FORMAT-HETEROGENEITY-01` and
`LEGACY-HASH-WRITER-IDENTIFICATION-01`) found two independent, stacked root causes:

1. **Truncation**: 39,114/55,853 `codebase_chunk_index.content_hash` values are only the first 16
   of 64 SHA-256 hex characters (`sveltekit-frontend/scripts/codebase-semantic-indexer.ts:556`),
   structurally incapable of matching the uniformly 64-char SHA-256 in the Graphify tables.
2. **Scope mismatch**: even the 16,702 rows with a full 64-char hash are **chunk**-scoped (one
   chunk's text, or `${relPath}:${idx}:${chunkText}`), while `graphify_files`/
   `graphify_execution_file_membership_v2.content_hash` is **whole-file**-scoped. Fixing the
   truncation alone would still not produce a match for any file split into more than one chunk.

Without this fixed, `CURRENT-STRUCTURAL-LINEAGE-01` cannot reach `CURRENT_STRUCTURAL_LINEAGE_EXACT`
no matter how much source-ref/workspace-revision coverage improves upstream — blocking
`safeToProject` and everything downstream of it in the Parent Atlas critical path (CandidateOrdinal
scale-out, `semantic_768` full-cohort admission, graph feature admission).

## What Changes

- Add a **new, additive** column to `codebase_chunk_index` carrying a whole-file-scoped, untruncated
  SHA-256 digest (working name: `file_content_hash`) — computed over the entire source file, not a
  chunk — so it can be joined exactly against `graphify_files`/`graphify_execution_file_membership_v2`.
  The existing `content_hash` column (chunk-scoped, sometimes truncated) is **not** redefined, not
  backfilled, and not read differently by any existing caller.
- Add explicit, self-describing metadata parameters to the hash contract on both tables so future
  readers/writers do not have to re-derive scope/algorithm/length by reading source code:
  `content_hash_scope` (`'chunk' | 'whole_file'`), `content_hash_algorithm` (`'sha256'`),
  `content_hash_length` (`16 | 64`), `content_hash_version`. Existing rows get these fields populated
  from what is already known about their writer (e.g. all `codebase-semantic-indexer.ts` rows are
  `scope=chunk, length=16`); rows whose writer is not yet identified are left explicitly `NULL`/
  `unknown`, never guessed.
- Audit the full candidate writer list for `codebase_chunk_index` (only 2 of ~19 files found via
  grep were read in the 2026-09-15 investigation) before finalizing which writers must be updated to
  populate `file_content_hash` going forward.
- **No migration, backfill, or writer code change is applied by this proposal.** This is the
  proposal/design/spec/task-list step only; every actual write is gated behind explicit human review
  and dry-run-first execution in a later, separately-approved pass (per this repo's Drizzle Safety
  Rule and its ban on silent repair of canonical identity data).

## Capabilities

### New Capabilities

- `codebase-chunk-index-hash-contract`: defines the whole-file-scoped `file_content_hash` column,
  the self-describing hash-metadata parameters (`content_hash_scope`/`content_hash_algorithm`/
  `content_hash_length`/`content_hash_version`), which writers must populate them and how, and the
  read-only audit step for the remaining unread candidate writer files.

### Modified Capabilities

- None. `codebase_chunk_index`'s existing chunk-scoped `content_hash` semantics are unchanged; this
  is purely additive.

## Impact

- **Schema**: `codebase_chunk_index` gains 4-5 new nullable columns (additive Drizzle migration,
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, no `DROP`/`ALTER TYPE` on existing columns).
- **Writers**: `sveltekit-frontend/scripts/codebase-semantic-indexer.ts`,
  `scripts/atlas/index-full-repo-for-search.mjs`, and any other confirmed `codebase_chunk_index`
  writer found by the remaining-writer audit gain a whole-file hash + metadata-parameter write path.
  No existing writer's `content_hash` write path changes.
- **Readers**: `scripts/atlas/audit-selected-graphify-structural-lineage-v1.mjs` (owner:
  `parent-atlas-retrieval-lineage-dag-convergence`) gains a `file_content_hash`-based join path as
  an alternative/addition to its current `content_hash`-based join, once the new column is populated
  and proven.
- **Cross-change dependency**: this change resolves the blocker recorded against
  `CURRENT-STRUCTURAL-LINEAGE-01` in `openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md`.
  It is a sibling/dependent change, not a fork — that change remains the owner of the structural
  lineage gate itself; this change only supplies the missing whole-file-comparable hash it needs.
- **No Qdrant, Neo4j, Redis/Valkey, or canonical-writer-code changes** are in scope.
