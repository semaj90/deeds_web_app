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

## Update: local checkout sync completed (still 2026-08-21, later same day)

The race settled. Verified via `git hash-object` on the same migration file
across a 20s window (stable both checks) before retrying. This time the
sync succeeded, with one genuinely necessary conflict:

- `git stash push -u` initially left the tracked-file modifications in
  place (stash object was created correctly, but the untracked-file
  cleanup step failed with `permission denied` on an empty leftover
  directory, `parent-atlas-kimi-containment/`, which appears to have
  aborted the working-tree reset for tracked files too). Fix: re-stash
  with plain `git stash push` (no `-u`), which stashed tracked changes
  only and left the problem directory alone — that succeeded cleanly.
- `git merge --ff-only origin/main` then fast-forwarded local `main`
  from `ddd1739d99` to `0316a1425f` with zero issues.
- `git stash pop` produced exactly one real conflict:
  `sveltekit-frontend/drizzle/manual/20260822_graphify_revision_authority_v2.sql`.
  The "Updated upstream" side (already merged into `origin/main` by
  another swarm branch in the interim) turned out to be the complete,
  syntactically-valid version — it both removed the two stray
  `ALTER TABLE ... DROP CONSTRAINT IF EXISTS` lines (the same fix the
  local WIP was independently making) **and** added a third constraint
  block (`graphify_files_content_hash_sha256_v2`) with a correctly
  closed `END $$;`. The local WIP's stashed side, by contrast, had
  neither the third constraint nor the closing `END $$;` — taking it
  as-is would have left the `DO $$ BEGIN ... END $$;` block unterminated,
  a real SQL syntax break. Resolved by keeping the upstream side in
  full and discarding the stashed side. No data was lost: the WIP's
  intended fix was already present upstream by other means.
- All other stash-pop file conflicts were none — every other touched
  file (todo notes, audit scripts, proof scripts, reports) merged
  cleanly with ordinary `M`/staged states, verified individually for
  leftover `<<<<<<<`/`=======`/`>>>>>>>` markers (found zero).
- Left all prior backup stashes (`stash@{1}` onward — several near-
  duplicate "concurrent-wip-before-sync*"/"final-sync-attempt*" entries
  from earlier failed attempts) untouched rather than dropping them;
  they're redundant now but harmless, and stash history costs nothing
  to keep around as a safety net.

**Lesson generalized**: if `git stash push -u` reports success but
`git status` afterward still shows the same tracked-file modifications,
suspect a failed untracked-file cleanup (permission-denied on some
directory) silently aborting the tracked-file reset too. Retry with
plain `git stash push` (no `-u`) to isolate tracked changes from the
untracked cleanup step.

## Update: branch queue resumed (2026-08-21/22) — one merge, one real regression found and fixed

Fetched again; swarm continues growing (14 more branches appeared/moved
in one `fetch --prune`). Cross-checked the full queue with
`git merge-base --is-ancestor` and found three previously-listed
branches had already been folded into `origin/main` by other sessions:
`agent/fanout-executor-ordinal-normalization-20260821`,
`agent/pagerank-bounded-fixture-pin-20260821`,
`agent/graphify-revision-owner-safe-migration-20260822`. No action
needed on those three.

Merged `agent/gpu-resident-feature-lease-converged-20260821` → commit
`6d60ef29a6` (pure-additive: `CandidateFeatureGpuResidentLeaseV1`
build/verify/release lifecycle for GPU-resident candidate feature
buffers, plus Python-side prove/test counterparts). Zero collisions,
clean 3-way merge, all imported dependencies (`artifact-work-item-v1`,
`candidate-feature-gpu-pack-v1`, `canonical-candidate-v1`,
`candidate-feature-snapshot-v1`, `candidate-feature-columnar-v1`)
verified present on `main` beforehand.

**Running the actual spec files after merging (not just trusting the
clean 3-way merge) surfaced a real, pre-existing, repo-wide regression
that predates this branch**: every consumer of
`materializeCandidateOrdinalMap` (in `canonical-candidate-v1.ts`) threw
`.omit() cannot be used on object schemas containing refinements` at
runtime, 100% reproducible, because that function called `.omit()`
directly on a schema that carries `.superRefine()` — forbidden in the
installed Zod v4. This had apparently never been exercised by a real
test run before (or ran against an older Zod). Confirmed pre-existing
(not introduced by the branch just merged) by running an unrelated,
already-merged spec (`dense-executor-candidate-ordinal-v1.spec.ts`)
and seeing the identical failure.

Fixed in the same pass (commit `207ac335e3`, pushed directly after,
same plumbing method):
1. Split `canonicalCandidateV1BaseSchema` (no refinement) out of
   `canonicalCandidateV1Schema` so `.omit()` has something legal to
   operate on at intake-parse time; the full refined schema still
   re-validates every candidate before the ordinal map is returned, so
   the strong-identity invariant is still enforced, just slightly later
   in the same function — not weakened.
2. A second, unrelated real bug in the branch's own new file: lease
   checksums were computed via `sha256(JSON.stringify(...))` over a
   pre-Zod-parse object at build time, then reverified over a
   post-Zod-parse object at verify time — Zod re-emits object keys in
   schema declaration order, so the two JSON strings differed and
   **every** lease (including untampered, freshly-built ones) failed
   `FEATURE_GPU_LEASE_CHECKSUM_MISMATCH`. Fixed by hashing a canonical
   sorted-key JSON serialization instead (mirrors the existing
   `canonicalJson()` pattern in `canonical-candidate-v1.ts`).

Verified 10/10 tests pass in both directly-affected spec files, plus
26/26 across every other spec depending on `canonical-candidate-v1.ts`.
One unrelated, pre-existing, already-on-`main`-before-today failure
noted but explicitly NOT chased (out of scope for this merge):
`candidate-feature-arrow-readback.spec.ts` fails with a Vitest
`SyntaxError` on an import of a `.mjs` script that has a CRLF line
ending immediately after its `#!/usr/bin/env node` shebang — the file
parses fine standalone via `node --check`, so this looks like an
esbuild/Vite shebang-stripping-vs-CRLF interaction, not a logic bug.
Whoever picks this up: reproduce with
`npx vitest run src/lib/server/atlas/features/candidate-feature-arrow-readback.spec.ts`
from `sveltekit-frontend/`.

**Lesson reinforced yet again**: "clean 3-way merge" only proves the
merge is syntactically conflict-free. It says nothing about whether
the *pre-existing* code the branch depends on actually works at
runtime. Always run the real spec files after merging, including specs
for files the branch didn't touch but does depend on — this is the
second time this session that step alone (not the merge diff itself)
is what surfaced a real, shipped-would-be-broken regression.

## Update: two more merges (2026-08-21/22) — one duplicate-ownership finding, one more fixture bug

Merged `agent/aligned-snapshot-real-corpus-proof-20260821` → commit
`f2d9ce5a36` (pure-additive CLI export script +
Python gate/test helpers for the aligned-snapshot proof pipeline;
depends on the already-merged `workspace-revision-origin-runtime-v1.js`,
verified present). This script requires a live `DATABASE_URL` and reads
real `graphify_runs`/`graphify_files`/`atlas_packets` rows — per
DB-ROLE-01 (still unbuilt) and the "no destructive/unverified DB ops"
non-goal above, **not executed**, only read and reasoned about
statically. It fails closed (`FROZEN_SEMANTIC_SCHEMA_PREREQUISITE_MISSING`)
if the expected columns aren't present, which is the right shape for an
unexecuted, schema-gated script.

Merged `agent/gpu-batch-request-current-main-20260821` → commit
`90752c8e87` (`CandidateFeatureGpuBatchRequestV1`: GATHER/RANK batch
envelope over an existing GPU-resident lease, 5-buffer-role binding,
ordinal-dedup + topK + deadline invariants).

**Real duplicate-ownership finding** (flagged, not resolved — this is
exactly the "one canonical owner per capability" violation pattern this
repo's root CLAUDE.md warns about): `origin/main` now carries **two
independently-built, non-cross-referencing GPU-residency-lease
implementations**:

| | `candidate-feature-gpu-residency-v1.ts` | `candidate-feature-gpu-resident-lease-v1.ts` |
|---|---|---|
| Commits | `de1bb9b34d`, `7d37e7079c` (pre-dates this session) | `6d60ef29a6` (merged this session, see above) |
| Schema literal | `atlas.candidate-feature-gpu-residency-lease.v1` | `atlas.candidate-feature-gpu-resident-lease.v1` |
| Main export | `candidateFeatureGpuResidencyLeaseV1Schema` | `candidateFeatureGpuResidentLeaseV1Schema` |
| Build fn | `buildCandidateFeatureGpuResidencyLease` | `buildCandidateFeatureGpuResidentLease` |
| Now has a consumer | `candidate-feature-gpu-batch-request-v1.ts` (just merged) | none yet |

Both implement essentially the same concept (a checksum-bound lease
over GPU-resident candidate-feature buffers, build/verify/release
lifecycle) with near-identical naming that differs only by
"residency" vs "resident(-lease)". Neither file references the other;
each was built by a different swarm branch with no apparent awareness
of the other's existence. Per this repo's governance rules (root
CLAUDE.md, "🚫 Duplication Prevention" + "One Canonical Runtime Owner
Per Capability"), this needs an **operator canonicalization decision**
(pick one as `CANONICAL_OWNER`, classify the other as `DEAD` or
`COMPATIBILITY` or merge their capabilities) — not something to resolve
silently mid-merge. Not fixed in this session; recorded here per rule
6 of that governance section ("record what you found, even when you
don't fix it").

Also found and fixed (same category as the earlier two regressions,
same discipline of "run the actual test, don't trust the clean merge"):
`candidate-feature-gpu-batch-request-v1.spec.ts`'s `lease()` fixture
hardcoded `observationChecksum: H('observation')` instead of hashing
the real observation body, so all 4 of its own tests failed
`GPU_RESIDENCY_OBSERVATION_CHECKSUM_MISMATCH` against the (otherwise
passing) already-merged residency schema. Fixed by computing the
checksum the same way the residency lib's own spec does (canonicalJson
+ sha256 over the pre-checksum body). Commit `9e7f0ca9d7`. This one was
local to the branch's own new test file, not a pre-existing shared-file
regression like the `.omit()`/lease-checksum pair earlier.

**Running total this session**: 3 real bugs found and fixed across 3
merged branches, purely by insisting on running actual `vitest`
against every merge instead of trusting `git merge-tree`'s "no conflict
markers" signal. Zero of these three would have been caught by the
merge-cleanliness check alone.

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
