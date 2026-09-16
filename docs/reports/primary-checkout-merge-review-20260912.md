# Primary checkout merge review checkpoint

Status: INCOMPLETE / NOT SAFE FOR BULK COMMIT.

This is a review checkpoint, not a production or completion receipt. No source,
index, stash, container, snapshot, or datastore changes were made by this review.
Only this document was added. Counts describe the inventory before adding it.

## Verified Git inventory

- Remote main: `3035675cea405351bd9de98bbd0ad201e568e462` (verified with ls-remote).
- Isolated `.tmp/merge-validation-20260912` checkout matches that commit.
- Its eight local generated reports parse as JSON; several retain blocked lineage statuses.
- Primary main: `c30568cfb9`, nine commits behind origin/main.
- Primary dirty paths: 337 (243 unstaged modifications, 46 untracked,
  41 staged deletions, six staged modifications, one staged-and-unstaged modification).
- All 41 staged-deletion paths exist in origin/main. Of these, 34 are absent
  locally and seven have local files that are untracked relative to the index.
- There are 32 stash entries. They were not applied, dropped, or content-reviewed.
- Nested repository changes are not saved by a parent repository commit:
  claude-mem: 11 modified paths; granite-docling-258M: one untracked path;
  models/embeddinggemma_300m: one modified path; turbovec: four modified and
  two deleted paths. These nested changes were inventoried, not fully reviewed.

## Confirmed review blockers

1. Staged deletions remove already-merged retrieval contracts, ledgers, audits,
   package entrypoints, and Docker requirements. Do not publish them wholesale.
2. Staged and working observation materializer changes remove required workspace
   revision and placeholder-source-revision guards and pass NULL as workspace
   revision. Aggregator changes also remove its invalid-revision guard.
   Review `scripts/atlas/materialize-observation-feature-rows.mjs` and
   `scripts/atlas/aggregate-observation-feature-plan.mjs` against merged guards.
3. Retrieval package changes restore application-owned queue/database/cache
   coupling, remove a dependency still imported by bifrost-provider, and delete
   entrypoints retained in package exports. Review the complete package boundary.
4. Snapshot retention preflight accepts two existing snapshots at max=2 without
   checking whether materialization would add a third. A pure VM fixture using
   the actual function confirmed this acceptance; no snapshots were materialized.
5. dev-gpu-runtime creates the lock before writing its JSON. Another launcher
   can interpret the transient empty file as stale and unlink it. Malformed
   lock content must not establish that its owner is dead.
6. Canonical hydration now carries packetKey directly from Qdrant without
   validating the packet/chunk relationship in PostgreSQL. qdrant-search then
   exposes that packet_key downstream. Preserve it as unverified metadata or
   resolve it through the canonical lineage bridge before admission.
7. The remote collection-role audit excludes broad compatibility paths from
   active-owner checks. Its PROVEN status is not sufficient evidence that all
   active callers use the admitted owner.
8. The untracked `retrieval/chunk-retrieval-profile-v1.ts` provides a second
   profile/aggregation implementation alongside the already-merged atlas
   contracts. Its directory aggregation accepts files from different workspace
   revisions and reports only the first revision. Its file aggregation accepts
   duplicate chunks: two inputs produce chunkCount=2 with one distinct chunk ID.
   Both outcomes were reproduced by transpiling the actual module in memory and
   invoking its pure functions; no database or runtime services were involved.
9. `retrieval/candidate-manifest-v1.ts` silently filters missing candidates
   against a mutable map during pagination. A pure fixture returned page one
   with a, then page two with c after b disappeared, using the same manifest
   checksum and reporting no more pages. Require frozen candidate availability
   or explicit incomplete/expired status rather than silently losing members.
10. Go Retrieval now resolves the Qdrant service hostname once at startup and
    passes the resulting numeric IP into the long-lived client. This avoids an
    IPv6-first lookup but also prevents that client from resolving a replacement
    container's new IP. Preserve hostname-based reconnect behavior or implement
    tested bounded re-resolution; include a changed-service-IP regression test.

Additional integration review: the RAPIDS service replaces PyTorch tensor
operations with CuPy and still reports canonicalAuthority=false and no lane vote.
That separation is aligned, but syntax/source inspection does not establish live
CuPy/cuVS parity, finite-input handling, or bounded GPU memory. No GPU was invoked.
The TRACE array-expression repair preserves parameterization; its pre-existing
path-only packet join remains insufficient for revision-qualified authority.

### Package boundary check

`npx tsc --noEmit -p packages/parent-atlas-retrieval/tsconfig.json` failed with
36 errors. Most are unresolved SvelteKit `$lib` application imports; others are
missing package-local TurboVec modules and type errors. Restoring the compute-only
CUDA bridge was correct, but the package as currently staged is not independently
buildable. Do not advertise it as the utility package boundary or publish it
until its exports are split into portable contracts/adapters and the build is
green.

The owning retrieval-lineage OpenSpec change still validates strictly with no
issues after the status-overlay updates. That validates artifact structure only;
it does not waive the package build or runtime identity blockers.

`go test ./...` now passes for `services/go-retrieval-service` (service package
and generated protobuf subpackages). This proves the hostname-resolution change
compiles, but there is still no regression test for a Qdrant container receiving
a replacement IP while the process remains alive.

Added a pure resolver test for numeric-host preservation, IPv4 preference, and
DNS-failure fallback. The service suite now passes again; this still does not
implement live reconnect after container replacement.

## Remaining review and reconciliation

### Broad syntax sweep

The primary checkout status inventory, including this new checkpoint, covered
338 paths. Read-only checks completed with no reported syntax/parse failures:

- 100 JSON files parsed (optional UTF-8 BOM removed for parsing only).
- 59 JavaScript files passed `node --check`; module code was not executed.
- 96 TypeScript files passed in-memory TypeScript transpilation diagnostics.
- 34 paths were absent locally and were not parsed.
- 49 other paths were not covered by these syntax checks (including Markdown,
  configuration formats, directories/gitlinks, and other file types).

This does not validate TypeScript types, imports, Svelte compilation, Python,
Docker configuration, test assertions, receipt truth, secrets, or behavior.
The semantic and startup blockers above remain unresolved despite syntax passing.

### Contract hardening pass

The local profile implementation was hardened without touching canonical stores.
File aggregation now rejects duplicate chunk IDs and mixed packet IDs;
directory aggregation rejects mixed repository/workspace authority; pagination
rejects an incomplete candidate map. The focused pure suites pass 14/14 after
these changes. Live lineage and PostgreSQL validation remain unproven.

### Focused existing tests

An isolated Vitest Node run (no app config/setup, one worker) passed 15/15 tests:
chunk-retrieval-profile-v1 (7), candidate-manifest-v1 (4), and
projection-candidate-v1 (4), all under the primary frontend retrieval/search
directories. These tests do not cover the reproduced mixed-workspace directory,
duplicate chunk, or disappearing-page-member cases. The file aggregation test
even supplies different packet keys for chunks of one file and accepts them.
Projection mapping tests validate transport shape, not PostgreSQL hydration.
Do not use this green suite to close canonical identity or pagination gates.

- Preserve an independently verifiable copy of local/index/untracked work before
  reconciling checkout state; no such backup was created by this review.
- Compare intended changes with origin/main, distinguishing stale index state
  from genuinely new work. Do not reset or blanket-stage the checkout.
- Complete file-by-file review across runtime, packages, scripts, tests, ledgers,
  generated reports, and nested repositories. This checkpoint is not that proof.
- Reconcile the untracked retrieval/chunk profile with the already-merged atlas
  retrieval contracts before introducing a competing contract owner.
- Run focused regression suites covering actual changed behavior, including
  revision admission, concurrent startup, capacity accounting, packet mismatch,
  package import/build boundaries, and semantic executor vote deduplication.
- Validate the owning OpenSpec changes actually touched; validation of an
  unrelated change does not qualify this work.
- Commit reviewed groups only after resolving the blockers. No force push,
  deletion, stash application, image rebuild, or datastore apply is implied.

likely_cause: Primary staged content differs from already-merged safeguards and contains additional unreviewed runtime changes.

evidence: Git index/worktree diffs, remote main lookup, nested status inventories, report JSON parsing, and the read-only retention fixture.

patch_targets: This checkpoint only; source paths above are review targets, not repaired files.

safe_next_command: git diff --cached --name-status

smoke_command: Focused behavioral suites remain pending; no full test pass is claimed.

report_path: docs/reports/primary-checkout-merge-review-20260912.md
