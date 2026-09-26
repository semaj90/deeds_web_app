## ADDED Requirements

### Requirement: Whole-file-scoped hash column
`codebase_chunk_index` SHALL have an additive, nullable `file_content_hash` column holding the
untruncated 64-character SHA-256 hex digest of the entire source file the row's chunk was derived
from — not the chunk's own text. This column SHALL be joinable exactly (equality, no fallback) with
`graphify_files.content_hash` and `graphify_execution_file_membership_v2.content_hash` for rows
sharing the same `source_ref`.

#### Scenario: Whole-file hash matches Graphify's own file hash
- **WHEN** `file_content_hash` is populated for a `codebase_chunk_index` row whose `source_ref`
  also appears in `graphify_files` at the same content revision
- **THEN** `file_content_hash` equals `graphify_files.content_hash` for that `source_ref` exactly,
  byte-for-byte hex string comparison, with no normalization fallback

#### Scenario: Row not yet populated is distinguishable from a mismatch
- **WHEN** a `codebase_chunk_index` row's whole-file hash has not yet been computed by any writer
- **THEN** `file_content_hash` is `NULL`, never a placeholder, empty string, or zero-hash sentinel

### Requirement: Self-describing hash metadata parameters
Every `codebase_chunk_index` row SHALL carry explicit metadata describing its existing
`content_hash` value's scope, algorithm, length, and contract version, so a caller can determine
these facts without reading writer source code: `content_hash_scope` (`'chunk'` or `'whole_file'`,
nullable), `content_hash_algorithm` (`'sha256'`, nullable), `content_hash_length` (integer, nullable),
`content_hash_version` (nullable). A row's metadata SHALL only be populated once its writer has been
read and confirmed — never inferred from the hash value's length or shape alone.

#### Scenario: Confirmed writer's rows carry accurate metadata
- **WHEN** a row was written by a writer whose hashing formula has been read and confirmed (e.g.
  `codebase-semantic-indexer.ts`'s per-chunk, 16-char-truncated SHA-256)
- **THEN** that row's `content_hash_scope='chunk'`, `content_hash_algorithm='sha256'`,
  `content_hash_length=16`

#### Scenario: Unconfirmed writer's rows are marked unknown, not guessed
- **WHEN** a row's writer has not been read and confirmed by this or a future audit pass
- **THEN** that row's `content_hash_scope`, `content_hash_algorithm`, `content_hash_length`, and
  `content_hash_version` are all `NULL` — never populated by inferring from the raw hash string's
  length or format alone

### Requirement: Writer completeness audit precedes any writer update
Before any `codebase_chunk_index` writer is scheduled to populate `file_content_hash` or the hash
metadata parameters, every candidate writer file identified by searching the repository for
`content_hash` assignments into `codebase_chunk_index` SHALL be individually read and classified as
`WRITES_CONTENT_HASH`, `DOES_NOT_WRITE_CONTENT_HASH`, or `NEEDS_FURTHER_READING`. No writer update
implementation may proceed while any candidate remains `NEEDS_FURTHER_READING`.

#### Scenario: Audit finds an additional, previously-unread writer
- **WHEN** the writer-completeness audit reads a `codebase_chunk_index`-adjacent script not
  examined in the 2026-09-15 investigation and finds it writes `content_hash`
- **THEN** that writer is added to the classified list with its own confirmed scope/algorithm/
  length, and is included in the scope of the eventual writer-update task

#### Scenario: Audit is explicitly incomplete until every candidate is classified
- **WHEN** fewer than all candidate writer files found by the repository search have been read
- **THEN** the audit's own report records the count of files still `NEEDS_FURTHER_READING` and
  does not claim `WRITER_AUDIT_COMPLETE`
