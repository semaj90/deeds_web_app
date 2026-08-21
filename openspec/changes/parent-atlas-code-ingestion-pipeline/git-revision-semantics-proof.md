# Git revision semantics proof

## Purpose

Define the semantics of `workspace_revision` and `source_revision` for Git-backed code sources before any canonical revision backfill or GPH-18/GPH-19 promotion.

This tranche is read-only. It does not populate `atlas_source_refs.commit_sha`, `atlas_source_refs.corpus_version`, `atlas_ast_nodes.source_revision`, `atlas_symbol_versions.*revision`, Qdrant payloads, or canonical evidence rows.

## Decision

For a Git-backed workspace:

```text
workspace_revision      = git:commit:<commit_oid>
workspace_tree_revision = git:tree:<root_tree_oid>
source_revision         = git:blob:<blob_oid>
```

`source_ref_key` remains path/symbol identity and is intentionally separate from source revision identity.

## Why these are different

A Git commit identifies a repository snapshot plus parent/history and commit metadata. Its referenced root tree identifies the exact path-to-object snapshot. A blob identifies file content and is path-independent: identical file content at two paths can share the same blob OID.

Therefore:

- use the commit OID for repository/workspace lineage;
- retain the root tree OID as exact snapshot evidence;
- use the blob OID for immutable per-source content revision;
- never use a path as source revision;
- never use a span/content SHA-256 as Git revision merely because it is content-addressed.

## Dirty workspace rule

`git rev-parse HEAD` is not enough to describe files read from the working tree.

Canonical Git revision authority is blocked when any of these are true:

```text
INDEX_DIFFERS_FROM_HEAD
WORKTREE_DIFFERS_FROM_INDEX
UNTRACKED_FILES_PRESENT
```

When blocked, native structural analysis may still emit the existing observational anchor:

```text
content:<sha256(raw source bytes)>
```

but `sourceRevision` remains `null` and `sourceRevisionAuthority` remains noncanonical.

## Existing schema mapping

Current schema evidence already separates several concepts:

```text
atlas_source_refs.commit_sha
  candidate workspace/repository commit lineage

atlas_source_refs.content_hash
  SHA-256 content digest / integrity anchor
  NOT automatically source_revision

atlas_source_refs.corpus_version
  corpus lifecycle/version namespace
  NOT a Git blob identity

atlas_ast_nodes.source_revision
  nullable sink for an accepted source revision
  NOT an origin merely because the column exists
```

No production writer is promoted by this document.

## Proof command

From `sveltekit-frontend`:

```bash
npx vitest run src/lib/server/atlas/indexing/git-revision-semantics-v1.spec.ts
npx tsx scripts/atlas/prove-git-revision-semantics.mts
```

Expected clean-workspace shape:

```text
workspaceRevision       git:commit:<oid>
workspaceTreeRevision   git:tree:<oid>
workspaceCanonicalEligible true
sourceRevision          git:blob:<oid>
```

Expected dirty-workspace shape:

```text
workspaceCanonicalEligible false
workspaceBlockers       [...]
sourceRevisionAuthority NOT PROMOTED
```

## Promotion gate

This proof defines semantics only. It does not prove the canonical owner/writer.

The subsequent owner tranche must prove all of:

1. the Git probe is invoked by the selected production structural owner;
2. the workspace is clean or the materializer reads directly from the committed tree/blob rather than mutable filesystem bytes;
3. `atlas_source_refs` is populated transactionally with commit/blob lineage;
4. downstream `atlas_ast_nodes` and `atlas_symbol_versions` pass the accepted revision through without synthesizing it;
5. controlled write/readback canary succeeds before GPH-19 owner acceptance.

Until then:

```text
workspace revision semantics  DEFINED_UNPROVEN
source revision semantics     DEFINED_UNPROVEN
canonical revision owner      NOT_PROVEN
canonical structural APPLY    BLOCKED
```
