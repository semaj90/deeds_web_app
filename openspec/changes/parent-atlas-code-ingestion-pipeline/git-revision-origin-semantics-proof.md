# GPH-14R2 — Git-backed revision origin semantics

Status: **IMPLEMENTED_UNPROVEN**

Date: 2026-08-21

## Decision boundary

This tranche defines revision semantics only. It does **not** accept a canonical owner, create a revision ledger, backfill revision columns, or enable Graphify APPLY.

The previous revision-owner audit correctly distinguishes origin candidates from pass-through/defaulted/projection sinks. This proof narrows the code-ingestion meaning of the two unresolved revision families.

## Workspace revision semantics

A code workspace snapshot is externally identified by a Git **commit object ID**.

A commit identifies the repository snapshot through its top-level tree. This is the external immutable identity Atlas should preserve for a checked-in repository state.

However, existing Parent Atlas `workspace_revision` columns are integer-valued in multiple tables. Therefore:

```text
Git commit OID
    !=
existing integer workspace_revision column value
```

The future storage shape should use an internal revision ledger key while preserving the Git commit OID as external snapshot identity:

```text
WorkspaceRevisionRecordV1
  workspaceRevision     integer/bigint internal key
  repoId                string
  commitOid             string
  treeOid               string
  objectFormat          sha1 | sha256
  observedRef           string | null
  createdAt             timestamp
```

No such accepted code-workspace revision ledger is proven in the current repository, so owner acceptance remains blocked.

## Source revision semantics

A raw Git blob OID is content identity, but is not sufficient as Atlas source identity because the same blob can occur at multiple paths. For code ingestion, the canonical source revision candidate is therefore path-scoped Git object identity:

```text
sourceRevisionId = sha256(
  repoId
  + NUL + sourceRef
  + NUL + objectMode
  + NUL + committedBlobOid
)
```

with an explicit namespace:

```text
gitsrc:v1:<sha256>
```

This gives the required behavior:

- unchanged file at the same path/mode keeps the same source revision across workspace commits;
- changed bytes change the blob OID and therefore the source revision;
- renames/path changes create a new source revision identity even when bytes are unchanged;
- executable/mode changes create a new source revision identity;
- the containing workspace commit remains a separate binding rather than being embedded into source identity.

The separate binding is required:

```text
WorkspaceSourceBindingV1
  workspaceRevision
  sourceRevisionId
  sourceRef
  objectMode
  blobOid
```

This models which source revisions participate in a particular repository snapshot without forcing unchanged files to receive a new source revision on every unrelated commit.

## Dirty worktree rule

`git rev-parse HEAD` proves the checked-in commit, not arbitrary uncommitted working-tree bytes.

Therefore a Graphify run over working-tree files may claim the HEAD workspace snapshot only when the worktree is clean and the hash of each processed working-tree file agrees with its committed Git tree entry.

If the worktree is dirty, the current proof must fail closed:

```text
BLOCKED_DIRTY_WORKTREE
```

A later explicit dirty-worktree snapshot protocol may define another revision kind, but this tranche does not invent one.

## Existing `atlas_source_refs` is not enough

`atlas_source_refs` already carries useful fields:

```text
content_hash
commit_sha
corpus_version
effective_from
effective_to
```

but its current primary key is:

```text
(source_ref_key, repo_id)
```

not a revision-qualified key. Consequently the table is suitable as a current source-ref projection/candidate surface, but it is not yet accepted as the immutable history owner for multiple revisions of the same source ref.

Do not simply start filling `commit_sha` and declare ownership proven.

## Relationship to existing acquisition source revisions

The web/research acquisition plane already has a strong, separate source-revision concept: `atlas_source_revisions.source_revision_id` identifies digest-deduplicated acquired content and can be reused by multiple fetch attempts.

That is useful precedent for separating:

```text
fetch/workspace occurrence
from
source content revision
```

but it is scoped to acquired web sources and is not automatically the code-ingestion revision owner.

## Promotion state

This proof is contract-only. Even after a clean Git semantics receipt:

```text
workspaceRevisionOwnerAccepted = false
sourceRevisionOwnerAccepted    = false
canonicalPromotionAllowed      = false
canonicalWritesAllowed         = false
```

The next promotion step requires an accepted persistence owner for:

1. workspace revision records,
2. code source revision records,
3. workspace-to-source bindings,
4. readback and uniqueness invariants,
5. integration into `GraphifyStructuralMaterializer` as `sourceRevisionAuthority='PROVEN'`.

## Proof commands

From `sveltekit-frontend/`:

```bash
npx vitest run src/lib/server/atlas/indexing/git-revision-semantics-v1.spec.ts
npx tsx scripts/atlas/prove-git-revision-semantics.mts
```

The expected clean-worktree contract state is:

```text
SEMANTICS_PROVEN_OWNER_UNACCEPTED
```

not `REVISION_OWNER_PROVEN`.
