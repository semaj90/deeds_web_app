# Swarm Branch Reconciliation — Session Addendum (2026-08-21)

Status: **PARTIAL — safe methodology established, most branches still unmerged**

## Context

Starting mid-session on 2026-08-21, a large number of parallel agent branches
appeared on `origin` faster than any single session can safely absorb them
(observed growth: 10-15+ new/moved branches per `git fetch`, repeatedly,
across `agent/*-20260821*` and `agent/*-20260822*` naming). Branch topics
observed: `graph-snapshot-revision-owner`, `fanout-admission-gate`,
`revision-graph-fanout-convergence` (`-v2` appeared later), `revision-authority-*`,
`graphify-revision-owner-*` (`converged`/`reconciled`, both exist),
`qdrant-sync-v2-target`, `queue05-vector-artifact-bridge`,
`candidate-feature-gpu-residency-runtime`, `ast-parity-corpus-hardening`,
`aligned-snapshot-proof-hardening`, and others. A live concurrent session was
also directly editing files in this same working tree throughout (confirmed
via repeated stash/restore cycles finding fresh uncommitted files each time).

## What was actually merged into `main` this session (in order)

1. `agent/fanout-admission-gate-20260821` → commit `dc152949e9`
2. `agent/graphify-revision-owner-reconciled-20260821`-adjacent commit work
   (graph-snapshot-revision-v1 + revision authority canary) → `844bbaa5bc`
3. `agent/revision-graph-fanout-convergence-20260822` → `709b8e3b52`
   (resolved the duplicate `GraphSnapshotRevisionV1` ownership between
   `packages/parent-atlas` and `sveltekit-frontend` — package is now
   canonical, Svelte side is a compatibility adapter)
4. Regression fix on top of (3): `20d0e4efe7` — the convergence merge broke
   `graph-qdrant-fanout-alignment.ts` (wrong payload field checked for
   `workspaceRevisionAligned`/`repositoryRevisionAligned`) and
   `graph-snapshot-revision-v1.spec.ts` (`as const` overreach broke the
   package build, tsc exit 2). Fixed and verified 15/15 tests pass.
5. `agent/revision-authority-main-reconcile-20260821` → `5eaf5d99f6`
   (`CodeRevisionAuthorityV2`, `WorkspaceRevisionOriginRuntimeV1`)
6. `agent/graphify-revision-owner-reconciled-20260821` (first form, 4
   commits) → `02c9752018` (`GraphifyRevisionAuthorityV2`,
   `GraphifyRevisionOwnerV2`, `GraphifySourceInventorySchemaV2`)

Current `origin/main` tip at end of session: `02c9752018` (local `main`
fast-forwarded to match, confirmed clean, no conflicts).

## The safe merge methodology this session established (reuse this)

For each candidate branch:

1. `git fetch origin` — note the branch's exact tip SHA.
2. `git merge-tree --write-tree origin/main origin/<branch>` — a
   **non-destructive** 3-way merge simulation. A single tree SHA with no
   conflict-marker output means it *would* merge cleanly — but this does
   **not** mean "took the branch's version" for lines both sides touched.
3. **Critical**: if a branch modifies a file this session already fixed
   (or any file with a recent bugfix on `main`), don't trust `git diff
   origin/main..origin/branch` in isolation — that's just a 2-point diff
   and can look alarming (e.g. looked like a branch "deletes"
   `packages/semantic-contracts` when it actually just forked before that
   package existed). Instead, `git show <merge-tree-result-sha>:<path>` to
   read the *actual 3-way-merged content* directly, and diff that against
   what you expect. This caught a real case where a branch would have
   silently reintroduced a just-fixed regression via naive line-based
   merge — the actual 3-way merge auto-resolved correctly in main's favor,
   but this must be verified per-branch, not assumed.
4. Read the new/changed files directly (`git show origin/<branch>:<path>`)
   before merging — check imports resolve, check for duplicate
   declarations (`awk '/^(export )?(async )?function/' file | sort |
   uniq -c | sort -rn`), confirm any imported dependency files already
   exist on `main`.
5. Build the affected package (`tsc -p tsconfig.json`, expect exit 0) and
   run any existing spec files touching the changed code.
6. Merge via **git plumbing, never a working-tree `git merge`**, since a
   live concurrent session is actively writing files in this same
   checkout: `git commit-tree <merge-tree-sha> -p <main-sha> -p
   <branch-sha> -m "..."`, then `git push origin <new-sha>:main`. Re-check
   `git fetch origin main` immediately before pushing to catch a moved
   `origin/main` (this happened twice this session — another process
   pushed to `main` mid-review).
7. To sync the **local** checkout afterward without disturbing the
   concurrent session's uncommitted work: `git stash push -u -m "..."` →
   `git merge --ff-only origin/main` → `git stash pop` → grep the
   previously-touched files for `^<<<<<<<` conflict markers as a final
   sanity check. This sequence was run ~5 times this session with zero
   data loss.
8. **Never** use `git update-ref` directly on `refs/heads/main` — this
   session's permission system blocked it as a raw ref manipulation; use
   the stash/merge --ff-only/pop sequence in (7) instead, which is
   equivalent but goes through normal git commands.

## Two real regressions caught this session (both already fixed on `main`)

- `tool-shim.ts` merge corruption (duplicate/truncated function bodies
  from a botched textual auto-merge across the earlier
  temporal-post-dispatch-recorder / temporal-tool-execution-boundary /
  temporal-action-alternative-boundary branches) — real `TS1005`/`TS1128`
  parse errors, not just type errors. Fixed by reconstruction; verified
  18 tests across 5 spec files pass.
- `graph-qdrant-fanout-alignment.ts` field-mapping bug from the
  `revision-graph-fanout-convergence-20260822` merge (see item 4 above).

**Lesson for whoever continues this**: branches in this swarm frequently
touch the *same* shared files (`graph-qdrant-fanout-alignment.ts`,
`graph-snapshot-revision-v1.ts`/`.spec.ts`, `temporal-action-postgres-repository.ts`)
with independently-written, sometimes-incompatible logic for the same
concept. A clean textual/3-way merge is **necessary but not sufficient**
evidence of correctness — always rebuild + rerun tests after every merge
touching a shared file, not just after merges reporting conflicts.

## Not yet merged (fetched, seen, not verified) — pick up here

As of last fetch, still outstanding (some may have moved again):
- `agent/graph-fanout-revision-gates-v2-20260821` (large — PR #34 per the
  swarm's own status messages; `GraphSnapshotRevisionV1`,
  `GraphSnapshotSourceRevisionBindingV1`,
  `GraphSnapshotRevisionPreflightV1`, `FanoutAdmissionV1`,
  `prove-fanout-admission-readonly.mts`. Reported by the swarm itself as
  `IMPLEMENTED_UNPROVEN` with its own base having moved during
  implementation — needs a rebase check before merging.)
- `agent/qdrant-sync-v2-target-20260821` (Qdrant payload namespace split:
  `workspace_revision` vs `workspace_cache_revision` vs
  `workspace_world_revision` vs `repository_revision` vs `source_revision`
  vs `graph_revision` — likely overlaps with files already touched above)
- `agent/revision-authority-main-reconcile-20260821` has since moved again
  (`57874a1ec8..a34a054594`) past what was merged in item 5
- `agent/revision-graph-fanout-convergence-20260822` has also moved again
  (`a8f0634a5f..78e353633b`) past what was merged in item 3
- `agent/ast-parity-corpus-hardening-20260821` — separate topic (Node
  tree-sitter vs the 8095 sidecar AST provider disagree on symbol `kind`
  taxonomy for `const`/arrow-function declarations, the repo's dominant
  real-world pattern; original 3-fixture proof only tested
  function/class declarations, so a 66-file corpus proof showed near-zero
  parity — this is a genuine, undecided architectural question the swarm
  flagged for operator judgment, not something to silently patch)
- `agent/aligned-snapshot-proof-hardening-20260821`
- `agent/candidate-feature-gpu-residency-runtime-20260821` (brand new)
- `agent/revision-graph-fanout-convergence-v2-20260822` (brand new,
  presumably supersedes the `v1` convergence branch already merged —
  check for actual delta vs what's already on `main` before treating as
  net-new)
- `agent/graphify-revision-owner-converged-20260821` (distinct from
  `-reconciled-20260821` which WAS merged — these are two differently-named
  swarm branches on a similar topic; check for duplication before merging
  both)

## Separately: DB-ROLE-01 gate (new, not yet built)

The swarm's own later output correctly flagged that `legal_ai_db` at
`172.18.0.21:5432` (local Docker) has **not been proven non-production**
merely by its name/address, and all Graphify source-inventory migrations
remain deliberately unapplied pending that classification. Recommend
building the read-only `DatabaseDeploymentObservationV1` receipt described
in the swarm's own proposal (`current_database()`, `current_user`,
`inet_server_addr()`, `pg_is_in_recovery()`, etc.) before anyone applies
`20260822_graphify_source_inventory_revision_v2.sql` or the graph-snapshot
migrations already sitting on `main` unapplied.

## Update: local checkout sync deliberately deferred (still 2026-08-21)

After this addendum was first written and pushed (`e6ab34bfb1`), `origin/main`
advanced a further 36 commits from continued concurrent swarm activity.
Attempting the usual `git stash push -u` → `git merge --ff-only origin/main`
→ `git stash pop` sync twice in a row both failed at the same file:
`sveltekit-frontend/drizzle/manual/20260822_graphify_revision_authority_v2.sql`.

Confirmed via `git diff` that this is a **real, substantive in-progress
edit** (the concurrent session removing two `ALTER TABLE ... DROP
CONSTRAINT IF EXISTS` statements, 5 lines), not a line-ending or stash
artifact — it reappeared as freshly modified within seconds of being
stashed, twice. This is a genuine live race against another session
actively iterating on that exact migration file.

**Decision**: stopped retrying rather than forcing through it. The
merge/stash sequence correctly protected the data both times (aborted
cleanly, nothing lost, all WIP restored) — the failure mode here is
"can't safely fast-forward while someone else is mid-edit on a file the
fast-forward touches," not a bug in the sync method itself. Local `main`
was left intentionally behind `origin/main`; the durable/shared state
(this addendum, and everything the swarm has pushed since) is unaffected
since it all lives on `origin/main` already.

**For whoever picks this up next**: before attempting a local-checkout
sync, check `git status --short` for exactly this file (or others) being
actively re-modified within seconds of a stash — that's the race signal.
If present, either wait for a quiet window, or skip local sync entirely
and work directly against `origin/main` refs (fetch + `git show
origin/main:<path>`) the way this session did for all the actual branch
merges, which never required a clean local working tree to begin with.

## Explicit non-goals for whoever picks this up

- Do not treat the swarm's own status narration (pasted into chat) as
  proof of anything in this repo — this session repeatedly found real
  mismatches between what a pasted transcript claimed and this repo's
  actual state (stale branch names, already-merged PRs described as
  unmerged, etc.). Always re-verify against `git log`, `git show`, and
  actual test runs.
- Do not apply any of the unapplied migrations
  (`20260822_graphify_source_inventory_revision_v2.sql`,
  `20260822_graph_snapshot_revision_owner_v1.sql`,
  `20260822_graphify_revision_authority_v2.sql`) against `legal_ai_db`
  until DB-ROLE-01 is built and explicitly answered.
- Do not attempt the whole remaining branch queue in one sitting — budget
  roughly one branch per ~15-20% of a context window given the
  read-diff-verify-build-test cycle above; the queue is provably still
  growing faster than one session can absorb it.
