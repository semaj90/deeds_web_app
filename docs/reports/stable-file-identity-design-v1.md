# S01-08G — StableFileIdentityV1 design (READ-ONLY / DESIGN-ONLY)

**Result: `STABLE_FILE_ID_DESIGN_READY`.** Nothing applied — no DDL, no DB write, no backfill, no
stableFileId minted. Full detail in `docs/reports/stable-file-identity-design-v1.json`; identifier
census in `docs/reports/stable-file-uuid-role-census-v1.json` (S01-08F, same session).

## What's proven, not assumed

- **No existing table can safely become the stableFileId owner.** `atlas_source_refs` and
  `atlas_workspace_source_bindings` are path/revision-scoped by construction; repurposing either
  would conflate `PATH_IDENTITY`/`PROJECTION_COORDINATE` with `CANONICAL_LOGICAL_ID`.
  `atlas_source_aliases` is empty (0 rows, no writer). `atlas_identity_alias_decisions` is the
  best-shaped existing rename/move mechanism found (`transition_kind`, `old_key`/`new_key`,
  `old_revision`/`new_revision`, `reviewer_id`, `evidence_refs`) but its `entity_kind` CHECK
  constraint — confirmed live — only permits `'test'`/`'schema_object'`, not `'file'`.
- **Exactly one repository identity exists anywhere: `'deeds-web-app'`.** Confirmed live: every
  `repo_id` column in every table checked holds only that one value; `graphify_files` has no
  repository column at all. The 6 nested repositories — confirmed from `.gitmodules`:
  `claude-mem`, `granite-docling-258M`, `mcp-server-mcp`, `models/embeddinggemma_300m`,
  `sites/parent-atlas-gateboard`, `turbovec` — have zero registry rows anywhere.
- **A real deterministic-UUIDv8 utility already exists** (`sveltekit-frontend/src/lib/utils/uuid.ts`),
  correctly scoped to derived identities only. It is explicitly **not** used for `stableFileId`
  itself, because a path-derived deterministic function cannot express "same identity, different
  path" — the exact requirement a rename needs.

## The contract

```
stableFileId          — logical file lifecycle identity (UUIDv7, minted once)
sourceRevision         — content/revision identity (existing sha256: contract, reused unmodified)
repositoryRelativePath — observation/binding only, never identity
graphify_files.file_id — occurrence/revision identity (existing, unchanged, still not canonical)
treeNodeOccurrenceId   — declaration/AST occurrence identity (S01-09C's separate axis)
```

Four never conflate. `RepositoryIdentityV1` is new and covers all 7 repositories (root +
6 submodules) under one contract — the root is not a privileged default, it is repository #0.

## Proposed schema (design only, not applied)

`atlas_repository_identity`, `atlas_stable_file_identity`, `atlas_stable_file_revision_binding`,
`atlas_stable_file_alias` — four new, purely additive tables. `stable_file_id` is the **only**
uniqueness on the identity table; path uniqueness is always scoped through
`(stable_file_id → repository_id, workspace_revision, path)`, never global — this is what makes
cross-repository-same-path and path-reuse-after-delete both resolve correctly by construction.

**Hard rule carried through the whole design:** `stableFileId` is never a column default. A naive
`DEFAULT gen_random_uuid()` on a revision-row table is exactly the bug that made
`graphify_files.file_id` a `REVISION_RECORD_ID` instead of a logical identity (357/357 sampled
sources changed it across revisions, per S01-08). Exactly one canonical creator mints it, on an
explicit lifecycle event, inside one bounded transaction, with idempotent dedup-before-mint and a
readback before commit — no writer anywhere else is permitted to mint one.

## Lifecycle rules (CREATE/MODIFY/RENAME/DELETE/RECREATE/CROSS-REPO)

Exactly as specified: same file modified keeps its id; a proven rename keeps the id and records an
alias; delete tombstones (never deletes the row); recreate at the same path gets a **new** id
unless continuity is separately proven; same relative path in a different repository is always a
distinct id, enforced structurally, not by convention.

## Backfill classification (fail-closed)

`SAFE_NEW_ID`, `SAFE_EXISTING_CONTINUITY`, `MOVE_CONTINUITY_PROVEN`, `PATH_REUSE_NEW_ID`,
`REPOSITORY_NAMESPACE_MISSING`, `AMBIGUOUS_CONTINUITY`, `SOURCE_HISTORY_INSUFFICIENT`. Confirmed
live: zero move/alias evidence exists anywhere, so nothing defaults to continuity. All 1,086
nested-repository sources classify `REPOSITORY_NAMESPACE_MISSING` until `RepositoryIdentityV1`
rows exist for their repos. Ambiguous and insufficient-history rows are never auto-defaulted to
`SAFE_NEW_ID` by a bulk script.

## Explicitly out of scope here

`upstream_file_id` stays NULL and untouched — wiring it is S01-08M, after population (S01-08K) and
lifecycle proof (S01-08L). The S01-09C tree-node occurrence defect (13/22 groups still reproducible
in live nominations) is **not** fixed by this design and does not get folded into it — `stableFileId`
must never substitute for `treeNodeOccurrenceId`; that gets its own future gate, S01-09D.

## Staged path forward

`S01-08F` (done) → `S01-08G` (done, this document) → **STOP for explicit schema authorization** →
`S01-08H` apply schema → `S01-08I` canonical writer → `S01-08J` bounded backfill preview →
**STOP for explicit backfill authorization** → `S01-08K` apply → `S01-08L` lifecycle proof (tests
A–F) → `S01-08M` wire `upstream_file_id` → `S01-09R2` rerun `SymbolIdentityV1`.

## Unresolved, left open rather than silently decided

1. Whether `atlas_source_aliases` is literally repurposed for `StableFileAliasV1`, or a new table
   is created (this design recommends the new table — the existing entity model is alias-of-a-path,
   not binding-of-a-path-to-an-opaque-identity).
2. Whether `RepositoryIdentityV1.repositoryId` should be deterministically derived via the existing
   UUIDv8 utility keyed on the `.gitmodules` name (safe, since a gitmodule name — unlike a file path
   — doesn't rename), or minted fresh via UUIDv7.
3. Whether to bulk-preview the 24,456 root-repository population as `SAFE_NEW_ID` candidates now —
   deferred to S01-08J rather than pre-committed here.
