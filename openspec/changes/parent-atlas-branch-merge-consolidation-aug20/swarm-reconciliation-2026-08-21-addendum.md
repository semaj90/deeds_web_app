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

## Update: superseded branch identified, one branch partially (not fully) merged

**`agent/gpu-resident-feature-lease-20260821` (12 commits, was listed as
"pending") is fully superseded — no action needed, don't merge it.**
Traced its true merge-base with the already-merged `-converged` sibling
and confirmed its entire unique contribution (the 6 `candidate-feature-
gpu-resident-lease-v1.*` + Python files) is byte-identical to what
`-converged` already brought into `main` this session (commit
`6d60ef29a6`), *including* the exact `sha256(JSON.stringify(...))`
checksum bug already found and fixed here. Merging it now would add
nothing and reintroduce a bug already fixed. Treat as closed.

**`agent/graphify-revision-owner-converged-20260821` (3 commits) —
merged only 3 of its 5 changed files**, as a plain (non-merge) commit
`c3f9ea745d`, not a 2-parent merge commit — because 2 of its 5 files
failed verification and were deliberately excluded:

1. Its own copy of `sveltekit-frontend/drizzle/manual/20260822_
   graphify_revision_authority_v2.sql` has a **real internal defect,
   independent of any merge conflict**: `first_seen_run_id` and
   `last_seen_run_id` are declared *twice* inside the same `CREATE
   TABLE public.graphify_files (...)` statement — once as `ON DELETE
   RESTRICT`, once immediately after as `ON DELETE CASCADE`. This is
   invalid SQL (duplicate column) that would fail outright if ever
   applied, and the `CASCADE` half directly contradicts this file's own
   safety-contract header ("no new cascading-delete path is
   introduced"). Root cause looks like a botched internal rebase/paste
   within the branch's own history, predating the safety-contract
   rewrite and the `.omit()`/checksum fixes already on `main`. `main`'s
   current version of this file (already verified working earlier this
   session — see the very first addendum update above) was kept as-is;
   the branch's version was discarded entirely, not force-reconciled.
2. Its copy of `sveltekit-frontend/scripts/atlas/prove-code-revision-
   owner-canary.mts` is a near-total independent rewrite (different
   imports, different output shape, reads a new `workspace-source-
   binding-observation.json` side-file) with an unclear relationship to
   `main`'s current version of the same script. Too large a behavioral
   delta to fold in without dedicated review of which version is
   actually current/correct — flagged, not resolved.

What *was* merged: `graphify-source-inventory-writer-v2.ts` (the
transactional Postgres writer for `WorkspaceRevisionRecordV1` +
per-file `WorkspaceSourceBindingV1` bindings into
`graphify_runs`/`graphify_files`), its spec (3/3 passing, verified),
and its CLI prove script — all pure-additive, zero dependency on the
two excluded files.

**Process note**: this is the first time this session a "branch merge"
deliberately used a single-parent commit instead of a 2-parent
`commit-tree -p main -p branch` merge commit — specifically because a
2-parent merge commit would misrepresent history (claiming the whole
branch was merged when 40% of its file changes were rejected). When
only merging part of a branch, prefer the plain-commit form so `git
log --merges` and `git rev-list` don't lie about provenance.

## Update: `agent/qdrant-768-provenance-census-20260821` merged, session pause point

Merged cleanly (pure-additive, zero deps beyond `node:crypto`) →
commit `6cf93a7ad0`. Adds `EmbeddingProvenanceV1` (Qdrant 768-dim
embedding provenance classifier: 5-status ladder
PROVEN/PROVEN_FOR_GENERATION/MIXED_HISTORY/PARTIAL/UNPROVEN × 5-level
evidence ladder COLLECTION_ONLY→NUMERICALLY_CORROBORATED) + a
read-only census CLI script. 5/5 tests pass. Also re-ran every
previously-fixed spec from earlier in this session
(`graph-snapshot-revision-v1`, `temporal-recommendation-feature-
runtime`, `temporal-action-sequence-reservation`) as a regression
check — all still green, 13/13.

**Session totals so far (2026-08-21/22, across both work blocks)**:
- 6 full merges: `fanout-admission-gate`, `graphify-revision-owner-
  reconciled` (graph-snapshot-revision-v1 + revision-authority-canary),
  `revision-graph-fanout-convergence` (v1), `revision-authority-main-
  reconcile`, `gpu-resident-feature-lease-converged`, `aligned-
  snapshot-real-corpus-proof`, `gpu-batch-request-current-main`,
  `qdrant-768-provenance-census` (8 total, not 6 — updated count)
- 1 partial merge (3 of 5 files): `graphify-revision-owner-converged`
- 1 branch identified as superseded/closed, correctly skipped:
  `gpu-resident-feature-lease-20260821`
- 5 real regressions found and fixed purely by running actual tests
  after merging (not by trusting clean 3-way merges): `tool-shim.ts`
  corruption, `graph-qdrant-fanout-alignment.ts` field bug, `.omit()`-
  on-refined-schema Zod v4 break, non-deterministic lease-checksum
  JSON key ordering, a hardcoded placeholder test checksum
- 1 architectural finding flagged for operator decision, not resolved:
  duplicate GPU-residency-lease ownership (`candidate-feature-gpu-
  residency-v1.ts` vs `candidate-feature-gpu-resident-lease-v1.ts`)
- 1 internal-defect finding flagged, not fixed (out of scope — file
  was excluded from the merge rather than repaired): duplicate-column
  SQL bug in a branch's own copy of the graphify revision-authority
  migration
- 0 force-pushes, 0 data loss, 0 unresolved conflict markers left
  anywhere

**Still pending** (re-verify ahead-count on next pickup, this queue
moves fast): `agent/revision-graph-fanout-convergence-v2-20260822` (13
commits, check for real delta vs the v1 already merged),
`agent/graph-manifest-authority-v3-20260822` (13 commits, unreviewed).
Both larger/higher-risk than what's been handled so far — budget a
fresh review pass per the existing "~one branch per 15-20% of context"
pacing guidance rather than rushing through them.

## Update: ast-parity-corpus-hardening + aligned-snapshot-qdrant-proof-v3 merged

Merged `agent/ast-parity-corpus-hardening-20260821` → commit
`e77205b430`. Adds `StructuralObservationV1` (provider-neutral AST
symbol observation: rawNodeType/rawKind→canonical symbolKind, byte-span
validity, parent-route context) + `StructuralParityComparatorV2`
(compares the Node tree-sitter challenger provider against the 8095
sidecar corpus) + a corpus-parity prove script. Also carried a real,
independently-verified Windows bug fix in `miniforge_nlp_sidecar_v2.py`:
the temp file for tree-sitter parsing was written in text mode with
utf-8 encoding, which lets Python's newline translation turn CRLF into
LF — since Tree-sitter spans are byte offsets, this silently shifted
every span after the first CRLF on Windows checkouts. Fixed by writing
exact utf-8 bytes in binary mode. 3/3 tests pass. This branch's own
findings reconfirm (does not resolve) the AST kind-taxonomy mismatch
this repo's CLAUDE.md already flags as an open operator question.
Minor process note: the commit message used a backtick around the word
"kind" inside a double-quoted `-m` string, which bash expanded as
command substitution (`kind: command not found`) — the pushed commit's
message silently lost that one word. Content unaffected; recorded here
so a future session doesn't mistake it for something worse. **Lesson:
never use backticks in git commit messages passed via bash double
quotes — escape them (`` \` ``) or avoid the character entirely.**

Merged `agent/aligned-snapshot-qdrant-proof-v3-20260822` → commit
`282610320e`. Adds `real_semantic_snapshot.py`
(`derive_real_semantic_snapshot_revision` lineage helper),
`export-frozen-semantic-v2-source.mts`/`.spec.ts` (a read-only
Postgres NDJSON source exporter that explicitly asserts
`graphify_files.code_source_revision`/`graphify_runs.workspace_revision`
as authority and `atlasPacketWorkspaceCacheEpochUsedAsAuthority: false`
— i.e. it does NOT use the legacy `atlas_packets` cache epoch as
revision authority, consistent with this repo's canonical-revision
rules), and substantial rewrites to `qdrant_scoped_ann.py`/
`cluster_softmax.py` with their test updates.

**Add/add conflict resolved**: this branch independently authored its
own `python/freeze_real_semantic_snapshot_v2.py`, colliding by name
with the one already merged from `agent/aligned-snapshot-real-corpus-
proof-20260821` this session (`f2d9ce5a36`). The two are genuinely
different, incompatible CLI tools (`--export-receipt` +
manifest/row-identity/canonical-order checksum verification, vs
`--source`/`--source-receipt` delegating to the new
`derive_real_semantic_snapshot_revision` helper). Kept main's
already-merged version, discarded this branch's competing one, after
confirming (via grep across every file this branch touches) that
nothing else in the branch's diff references the excluded file. This
is the same surgical-tree-override technique used for the SQL/canary
partial merge above (`git merge-tree` for the auto-mergeable files,
then `read-tree` + `update-index --cacheinfo` to force one specific
path back to main's blob before `write-tree`/`commit-tree`).

The new spec (`export-frozen-semantic-v2-source.spec.ts`) is a
string-assertion test against its own source file's contents, but
lives under `scripts/atlas/` — vitest's `include` glob only covers
`src/**/*.spec.ts` plus an explicit allowlist, so `scripts/**/*.spec.ts`
files (this one and 3 pre-existing `scripts/tests/probes/*.spec.ts`
files) silently never run under the normal `vitest run` invocation.
This is a **pre-existing test-harness gap**, not introduced by this
merge — flagged, not fixed (out of scope for a branch-merge pass; fixing
the vitest `include` glob is a separate, deliberate config change).
Verified all 11 of its string assertions manually via `grep -F` against
the merged `.mts` file instead — all pass.

## Update: `agent/revision-graph-fanout-convergence-v2-20260822` merged — largest/riskiest merge this session

Merged → commit `d7e2b63fbe`, with a manual SQL reconciliation (not a
side-pick) and a flagged architecture-level field-convention mismatch.
Adds `GraphifyWorkspaceManifestCompletenessV1` (proves a persisted
`graphify_runs`/`graphify_files` pair covers every
`WorkspaceRevisionRecordV1` source binding before a graph consumer may
treat a run as complete) and `GraphSnapshotSourceRevisionBindingV1`
(per-node source-ref/revision coverage receipt). Converts
`materialize-full-corpus-graph-snapshot.mts` into a documented thin
compatibility entrypoint delegating to a new revision-qualified
`materialize-full-corpus-graph-snapshot-v3.mts` (keeps the operator CLI
command stable; verified 19/19 assertions from its own spec manually,
since it hits the same `scripts/**/*.spec.ts` vitest-include gap noted
above). Substantially reworks `buildQdrantSyncPayload` in
`qdrant-sync-payload.ts`.

**SQL reconciliation (not a side-pick, an actual merge)**: this
branch's own copy of `20260822_graphify_revision_authority_v2.sql`
forked from the *same* stale pre-hardening state as the earlier
`graphify-revision-owner-converged` branch (`ON DELETE CASCADE`
instead of `RESTRICT`, missing safety-contract header, stale `DROP
CONSTRAINT` lines) — but this time the branch also added a genuinely
new, needed column: `graphify_runs.source_manifest_source_count`
(consumed by the new completeness checker). Instead of picking one
side wholesale, manually reconciled: kept main's hardened base intact
and hand-added only the new column + its `CHECK` constraint + comment
on top. This is the third time this exact migration file has
independently regressed to the CASCADE/no-safety-contract state across
different swarm branches — **worth an operator note**: whatever caused
the swarm to keep forking from that stale commit should be investigated
so a fourth branch doesn't repeat it.

**Real architecture-level finding, flagged not resolved**: the new
`buildQdrantSyncPayload` puts the canonical workspace-revision proof
directly in `payload.workspace_revision` (content-addressed sha256)
and treats `payload.repository_revision` as separate, optional
Git-only provenance — confirmed via its own spec fixtures. This
*disagrees* with the already-merged `graph-qdrant-fanout-alignment.ts`
(this session, commit `20d0e4efe7`), which checks
`payload.repository_revision === input.workspaceRevision` — i.e. it
expects the canonical proof to live in `repository_revision`, not
`workspace_revision`. The two files don't import each other and share
no test, so nothing currently red — but a real Qdrant payload built by
the new `buildQdrantSyncPayload` would fail
`evaluateGraphQdrantFanoutAlignment`'s alignment check today. Needs an
operator decision on which field convention is canonical before anyone
wires these two together.

**Real bug found and fixed**: the branch's own
`qdrant-sync-payload.spec.ts` asserted `'semantic_768'` as the expected
canonical representation ID, but this repo's frozen canonical
representation is `'semantic_512'`
(`ATLAS_CANONICAL_SEMANTIC_REPRESENTATION` in
`qdrant-semantic-projection.ts` — also independently recorded in this
session's own memory notes as a frozen decision). The real
implementation already imports and enforces the correct constant; only
the branch's own test fixtures were stale. Fixed by replacing all 3
`semantic_768` occurrences with `semantic_512`. Commit `0340688923`.
8/8 tests pass after the fix.

**Live-edit conflict, resolved by taking the reviewed merge**: the
local-sync stash/pop hit a real conflict on
`materialize-graphify-source-inventory.mts` — the concurrent session's
uncommitted WIP was rewriting this exact file with a substantially
different, incomplete (still-in-progress) implementation (its own
git-ls-files-based source enumeration, its own plan schema shape).
Rather than hand-merging two divergent, partially-finished
implementations of the same script, kept the just-merged, fully
reviewed and tested branch version and left the concurrent session's
WIP untouched in its stash entry (`stash@{0}`,
"concurrent-wip-before-fanout-v2-sync" — **not dropped, fully
recoverable** via `git stash show -p stash@{0}` if that session wants
to reconcile their approach against the new base).

**Total real bugs found and fixed this session: now 5** (Zod
`.omit()`-on-refined-schema, non-deterministic lease checksum,
hardcoded placeholder test checksum, stale `semantic_768` test
fixture — plus the ongoing SQL-migration-hardening pattern, which isn't
a "bug" per se but the same root cause recurring three times).

## Update: `agent/graph-manifest-authority-v3-20260822` — fully superseded, confirmed and skipped, tracked queue now clear

Checked merge-base with `agent/revision-graph-fanout-convergence-v2-20260822`
(the branch just merged above): both fork from the *identical* parent
commit (`02c9752018`), and their commit timestamps are 6 minutes apart
(`21:04:38` vs `21:10:59` on 2026-08-21) — textbook two-parallel-swarm-
agents-solving-the-same-problem-simultaneously. `git merge-tree`
reported **9 conflicts** against current `main` (nearly every file this
branch touches), so each core file was diffed directly against what's
already merged:

- `graphify-workspace-manifest-completeness-v1.ts` — differs from
  main's (already-merged) version by exactly one JSDoc comment block
  and one blank line. Otherwise byte-identical.
- `graph-snapshot-source-revision-binding-v1.ts` — differs only in
  code-formatting style (compact single-line `if`/arrow-chain style vs
  main's multi-line style) and cosmetic variable renames (`map` vs
  `bindingMap`, `normalize` vs `normalizeSourceRef`, `seen` vs
  `seenRefs`). Logic is identical.
- `materialize-graphify-source-inventory-v3.mts` (new filename in this
  branch, vs. an in-place edit in the branch already merged) — same
  algorithm, same imports, same error codes, just denser formatting
  and a different producer-revision string suffix (`.v3` vs `.v2`).
- The one non-duplicate artifact: `20260822_graphify_manifest_
  completeness_v3.sql`, a small additive migration re-adding
  `graphify_runs.source_manifest_source_count` (already added via the
  hand-reconciliation above, in the `_v2` migration) under a `_v3`-
  suffixed constraint name, plus one new composite index
  (`workspace_revision, source_manifest_digest,
  source_manifest_source_count`) that main's migration doesn't have.

**Decision: skip the whole branch, merge nothing.** The composite index
is the only genuinely non-duplicate content, and it isn't valuable
enough on its own to justify a *third* manual migration file in this
area (there are already two: `20260821_graphify_source_inventory.sql`
and the reconciled `20260822_graphify_revision_authority_v2.sql`) —
adding a `_v3.sql` for one already-covered column would itself be the
kind of migration-file sprawl this repo's duplication-prevention
governance rule warns against. If that composite index turns out to be
needed later, it's a one-line addition to the existing `_v2` migration,
not a new file.

**This closes the tracked branch queue** from the original addendum
list (all six branches named there are now: merged, partially merged,
or confirmed-superseded-and-skipped — see the running total in the
next section).

## Session totals, final (2026-08-21/22, all work blocks this session)

- **10 branches fully or partially merged**: `fanout-admission-gate`,
  `graphify-revision-owner-reconciled`, `revision-graph-fanout-
  convergence` (v1), `revision-authority-main-reconcile`, `gpu-
  resident-feature-lease-converged`, `aligned-snapshot-real-corpus-
  proof`, `gpu-batch-request-current-main`, `qdrant-768-provenance-
  census`, `ast-parity-corpus-hardening`, `aligned-snapshot-qdrant-
  proof-v3` (full merges); `graphify-revision-owner-converged`,
  `revision-graph-fanout-convergence-v2` (partial merges with manual
  reconciliation)
- **2 branches confirmed fully superseded and correctly skipped**:
  `gpu-resident-feature-lease-20260821`, `graph-manifest-authority-v3`
- **5 real bugs found and fixed** purely by running actual tests after
  every merge (never trusted a clean `git merge-tree` alone):
  `tool-shim.ts` corruption, `graph-qdrant-fanout-alignment.ts` field
  bug, Zod `.omit()`-on-refined-schema break, non-deterministic lease
  checksum (JSON key reordering), hardcoded placeholder test checksum,
  stale `semantic_768` test fixture (6, not 5 — running count corrected)
- **2 architecture-level findings flagged for an operator decision,
  neither silently resolved**: duplicate GPU-residency-lease ownership
  (`candidate-feature-gpu-residency-v1.ts` vs `candidate-feature-gpu-
  resident-lease-v1.ts`); Qdrant payload field-convention mismatch
  (`workspace_revision` vs `repository_revision` as the canonical-proof
  carrier) between `qdrant-sync-payload.ts` and `graph-qdrant-fanout-
  alignment.ts`
- **1 internal-defect finding flagged, file excluded from merge rather
  than repaired**: duplicate-column SQL bug (`RESTRICT`+`CASCADE` on
  the same column) in a stale branch fork of the revision-authority
  migration
- **1 recurring-root-cause pattern flagged**: the same migration file
  (`20260822_graphify_revision_authority_v2.sql`) independently
  regressed to a stale pre-hardening state (missing safety contract,
  `CASCADE` instead of `RESTRICT`) across at least 3 different swarm
  branches forked from the same parent commit — worth an operator look
  at why that commit keeps getting used as a fork point
- **1 pre-existing test-harness gap flagged, not fixed**: vitest's
  `include` glob doesn't cover `scripts/**/*.spec.ts`, so several
  merged spec files never run under normal `vitest run` — verified
  their assertions manually via grep/node instead each time
  encountered
- **0 force-pushes, 0 data loss, 0 unresolved conflict markers left
  anywhere, 0 destructive operations against any database**

Local `main` and `origin/main` are fully synced as of this update.
The concurrent live session's uncommitted WIP was preserved throughout
(never destroyed) via the stash/ff-only/pop discipline established
earlier in this addendum; one of its in-progress files
(`materialize-graphify-source-inventory.mts`) was superseded by a
now-merged, fully-reviewed branch version rather than hand-merged with
an incomplete WIP draft — that WIP remains fully recoverable from
`stash@{0}` if needed.

## Update: session resumed — full branch inventory (46 unmerged found), 3 more items processed

Re-fetched: `git branch -r` now lists **~80 `agent/*` branches total**,
of which **46 are not yet ancestors of `origin/main`** (checked via
`git merge-base --is-ancestor` per branch, not assumed from names).
Given the scale, this pass picked a few of the smallest/lowest-risk
ones rather than attempting the full set — the queue is genuinely
larger than tracked in earlier updates above, which only listed a
subset the swarm had surfaced by name at the time.

**Repo-wide finding, flagged, NOT fixed (out of scope for this pass) —
recorded here per the "record what you found" rule**: while fixing one
hardcoded-credential instance (next item), a repo-wide grep for the
same literal (`legal_admin:123456@127.0.0.1`) found it in **130+
files** across `scripts/`, `scripts/atlas/`, and a handful of `src/`
files. This is a large, genuine credential-hygiene violation of this
repo's own stated policy ("store all passwords in .env.local, never in
code"), but far too large to fix as a side-effect of branch merging —
it needs its own dedicated cleanup pass (likely a scripted
find-replace + per-file verification). Recommend a future session run
`grep -rl "legal_admin:123456@127.0.0.1"` and work through it
deliberately.

**Fixed on `main` directly (not a branch merge)**:
`scripts/atlas/audit-null-content-hash-repairability.mjs` — this file
already existed on `main` (committed directly at `ff88376b00`,
predating this session's branch-merge work entirely) with the
hardcoded password fallback above. While evaluating two small unmerged
branches that happened to touch the same filename
(`agent/qdrant-null-hash-readonly-audit-20260820` and `-20260821`, each
independently reimplementing this exact audit), found that **both are
now fully superseded** by main's own already-committed version — no
merge needed for either. Instead patched main's live file directly:
removed the hardcoded fallback (now throws if `DATABASE_URL` is unset)
and fixed `REPORT_DIR`/output-path resolution to use
`fileURLToPath(import.meta.url)`-relative repo-root resolution instead
of bare `process.cwd()`-relative paths (the exact cross-directory-
safety bug class this repo's CLAUDE.md warns about). Commit
`4f14d3dc83`.

**Merged `agent/temporal-action-ledger`** → commit `174be891e0`. Adds
`temporal-recommendation-outcome-dag.integration.spec.ts`: a genuine
live (non-mocked) proof of the previously-`NOT_PROVEN`
ACT-REC-OUT-DAG-01/02/03/04 gates — seeds a real
`FINALIZED`/`TOOL_ERROR` ledger failure via the real production
append path, then drives the actual DRY-gate decision, real
`rg_search` tool dispatch, real outcome-receipt persistence, and (for
DAG-03) a full real LangGraph `runAgentDAG()` StateGraph run — all
against a real Postgres round trip, with `afterAll` cleanup verified
(0 residual rows) in the branch's own evidence log, honestly
documenting the one real remaining gap (DAG-02's failure-injection
case can't be forced deterministically without flakiness).

**Safety fix applied before merging (not present in the original
branch)**: this spec lives under `src/lib/server/atlas/temporal/`,
which — unlike the `scripts/**/*.spec.ts` gap noted earlier — **does**
match this repo's default vitest `include` glob and would run by
default. Unguarded, it would attempt a real Postgres connection for
any developer or CI run without `DATABASE_URL` configured. Fixed by
adding the exact `RUN_DB_INTEGRATION=1`-gated `describeIf` pattern this
repo already establishes as precedent in
`tests/engram-registry-db.integration.spec.ts`. Verified locally: with
no `RUN_DB_INTEGRATION` set, all 3 tests report "skipped" and no DB
connection is attempted.

**Lesson for whoever continues this**: when a merged branch adds a
`.spec.ts` file that imports a real DB client at module or describe
scope, always check (a) whether the file's directory is actually
covered by the vitest include glob (some aren't — see the
`scripts/**/*.spec.ts` gap above), and (b) whether it's guarded by an
opt-in env var if it does real I/O. This repo already has the
`RUN_DB_INTEGRATION` convention established — reuse it, don't invent a
new one.

## Update: 3 more branches confirmed superseded, 2 more merged (verified, not just clean-merged)

**Confirmed superseded, skipped, no action needed**:
- `agent/temporal-action-ledger-convergence-20260821` — reintroduces
  the exact duplicate-ownership bug fixed earlier this session in
  `temporal-action-postgres-repository.ts` (`reserveLedgerSequence`
  reimplemented inline instead of delegating to the canonical
  `reserveTemporalActionLedgerSequence`). Its spec file tests the
  reintroduced duplicate directly rather than the canonical function.
  Its SQL migration already exists on `main`. Branch forked before the
  fix; all three of its changed files are stale relative to `main`.
- `agent/aligned-snapshot-proof-hardening-20260821` — its
  `cluster_softmax.py` diff vs `main` is pure formatting (one-line vs
  multi-line argument lists, functionally identical logic already on
  `main` via the earlier `aligned-snapshot-qdrant-proof-v3` merge). Its
  test file (`test_cluster_softmax_config.py`) is byte-identical to
  what's already on `main`.
- `agent/candidate-feature-gpu-residency-runtime-20260821` — its
  `.ts` file is byte-identical to what's already on `main` (merged via
  `gpu-batch-request-current-main` earlier this session). Its `.spec.ts`
  is the same file reformatted, but **still carries the exact
  `observationChecksum: H('observation')` placeholder bug already found
  and fixed this session** — confirms the branch forked before that fix
  and never caught up.

Pattern holding across the whole session: when two swarm branches
solve the same problem independently, diff their core files directly
against what's already merged before assuming a name-collision needs
reconciliation — a large fraction turn out to be pure reformatting or
already-fixed-elsewhere duplicates, not real conflicts.

**Merged `agent/parent-atlas-agentic-file-compiler`** → commit
`03896f74b8`. A large (55 files, 1662 lines), fully self-contained, new
feature module: query classification, retrieval planning,
exact-promotion gating, prompt/prefill-artifact planning, workflow-spec
building, a Mastra workflow compiler + snapshot bridge, search-runtime
policy, file-mutation-guard + validation-barrier +
cache-invalidation-plan, and a model-route-map, plus 26 new `.okf`
schema files. Zero existing files touched, zero external repo
dependencies beyond `zod`/`node:crypto`. Verified 18/18 tests pass
across all 13 spec files in the new directory.

**Merged `agent/git-revision-semantics-proof-20260821`** → commit
`654328944a`. Adds `GitRevisionSemanticsProofV1`: a deliberately
conservative, read-only proof contract (`canonicalWritesAllowed:
false`, `readOnly: true`, explicit `*_NOT_IMPLEMENTED` blockers) that
formally encodes the git-commit-provenance-vs-workspace-revision
distinction this addendum has tracked all session — a path-scoped
git-blob-oid-derived `sourceRevisionId` kept explicitly separate from
workspace commit binding, with `normalizeGitSourceRefV1` guarding
against path traversal and absolute paths. 7/7 tests pass. Two sibling
branches, `agent/git-revision-semantics-proof-20260820` and
`agent/git-revision-semantics-proof-current-20260820` (byte-identical
to each other), independently built a simpler, less-rigorous version of
the same concept — read in full and compared before choosing; not a
coin-flip. Both are now superseded, no action needed.

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

## Update: cross-reference doc + one more small merge (2026-08-22, session resumed)

Wrote `workstation-todo-cross-reference-2026-08-22.md` (same directory)
connecting `parent-atlas-workstation-todo.md`'s PF-G0 (packet-key
duplication) and GS1_12 (source-revision index safety audit) open
items to this session's swarm merges — confirmed PF-G0 was resolved via
`packet-identity-resolver.ts` + `atlas_packet_identity_aliases` (a
bridge, not a forced winner between the two competing schemes), and
flagged that several of this session's merges (GraphifyWorkspaceManifest
CompletenessV1, GraphSnapshotSourceRevisionBindingV1,
StructuralObservationV1, GitRevisionSemanticsProofV1) are scattered
building blocks toward GS1_12's still-unassembled consolidated receipt.

Merged `agent/openspec-domain-uuid-derivation-20260821` -> commit
`8391b5c508`. Small, pure-additive: a deterministic UUIDv8 derivation
utility (sha256-canonical-JSON of domainClass + sorted/trimmed
attributes), verify script, spec. 7/7 tests pass.

**Context budget note**: this session has been running long; pacing
back to smaller, well-verified merges rather than continuing to open
new large branches. Most of the smallest/safest branches in the queue
have now been triaged; remaining ones are larger and need a fresh
review pass in a future session.

## Session continuation - 2026-08-22

Resumed the branch queue after a compaction boundary. Full methodology
unchanged (merge-tree dry run, diff against real merge-base for duplicate-
ownership check, verify content directly, merge via plumbing or direct
commit, sync local main, run real tests/scripts, push).

### Merged / folded this continuation

- agent/ast-parity-corpus-hardening-v2-20260821 (commit 159845b637): hardens
  the node-tree-sitter-vs-8095-sidecar corpus parity proof - direct unit
  coverage for compareStructuralObservationsV2's one-to-one duplicate-name
  matching, a runtimeAvailable gate distinguishing sidecar/Node
  unavailability from a genuine mismatch, aggregate mismatch-class counts,
  and a UTF-8/CRLF byte-preservation test for _raw_chunk_file.
  agent/ast-parity-corpus-hardening-20260821 (the non-v2 sibling) confirmed
  superseded - byte-identical 4-commit sequence, forked from an earlier
  main; not merged separately.
- Graphify revision-owner branch cluster (commit b04b10ef77): reconciled 4
  branches all touching the same v2 migration/canary lineage.
  - agent/graphify-revision-owner-reconciled-20260821: folded in a
    genuinely missing graphify_runs_status_started_at_idx_v2 index and a
    post-apply gate-order comment onto main's already-hardened SQL (this
    branch predates the SAFETY CONTRACT hardening and lacked RESTRICT FKs /
    source_manifest_source_count). Cherry-picked its new
    graphify-revision-owner-v2.spec.ts (5 tests, previously uncovered on
    main); fixed one stale fixture missing source_manifest_source_count.
    5/5 passing.
  - agent/graphify-revision-owner-converged-20260821: its
    graphify-source-inventory-writer-v2.ts/.spec.ts and
    prove-graphify-source-inventory-writer-v2.mts turned out byte-identical
    to what's already on main (merged via an earlier branch this session) -
    confirmed via direct diff, no action. Its SQL variant and rewritten
    prove-code-revision-owner-canary.mts both predate main's hardening and
    reintroduce the CASCADE-FK / DROP-CONSTRAINT pattern the hardening pass
    deliberately removed - not merged. The canary rewrite itself
    (workspace-source-binding-observation-backed readback proof,
    REVISION_OWNER_PROVEN state machine) is a real architectural
    advancement over main's current single-table canary but depends on a
    companion observe-workspace-source-binding.mts that exists in neither
    main nor this branch - flagged for a dedicated follow-up rather than
    force-merged blind.
  - agent/temporal-post-dispatch-proof-20260821: net-zero relative to its
    own merge-base (self-canceling add-then-remove commits) - no unique
    content, not merged.
- agent/graph-snapshot-revision-owner-20260821 (commit 0dade05c65): its core
  contract changes (graph-snapshot-revision-v1.ts/.spec.ts: sha256:-prefixed
  content-addressed revisions, superRefine binding) are already superseded
  on main, which moved the algorithm itself into the packages/parent-atlas
  canonical owner and kept this file as a thin wire-compatibility adapter
  with equivalent test coverage already in place. Two genuinely real, still-
  open pieces were pulled in: (1) tightened the unapplied
  20260822_graph_snapshot_revision_owner_v1.sql's two non-empty-string CHECK
  constraints to real sha256:<64-hex> regex checks (confirmed unapplied via
  sidecar-migrations.json, safe to edit in place); (2) fixed a real bug in
  prove-graph-snapshot-revision-writer.mts - it called
  buildGraphSnapshotRevisionV1() with hardcoded prose literals
  ('canary:workspace:revision') that the now-stricter sha256: contract
  would reject, meaning the canary would throw the moment
  ATLAS_GRAPH_REVISION_CANARY=1 was ever set, never reaching its
  rollback-only write/readback proof. Replaced with the branch's fix (reads
  a real upstream WorkspaceRevisionRecordV1-shaped row from graphify_runs).
  Verified live against the real DATABASE_URL: runs clean, correctly
  reports GRAPH_SNAPSHOT_REVISION_MIGRATION_REQUIRED (accurate - this
  migration is unapplied), no crash. Also swapped its hardcoded
  legal_admin/123456 credential fallback for loadAtlasEnv().
- agent/git-revision-semantics-proof-current-20260820 and
  agent/git-revision-semantics-proof-20260820 confirmed superseded - both
  predate the already-merged -20260821 sibling, which replaced the entire
  buildGitRevisionSemanticsProofV1/buildGitSourceTreeEntryV1 design with
  classifyGitSourceRevisionV1/classifyGitWorkspaceRevisionV1. Not a
  duplicate-content match this time (main's version is a rewrite, not
  identical), but the whole approach was intentionally replaced - nothing
  to salvage.
- agent/query-router-v2-proof-integration (commit 6f63f2e580, plus
  verification commit 2e75c16e84): 3 new read-only/local-write-only proof
  scripts for the existing query-router-v2 ecosystem
  (query-router-dataset-v2.ts, retrieval-router-tensor-manifest-v2.ts,
  retrieval-executor-policy-v2.ts, the PyTorch/XGBoost training scripts): a
  readiness audit (file/hash + python module probes), a real EmbeddingGemma
  source materializer (writes only local JSONL, no DB), and a synthetic
  end-to-end plumbing proof (no external dependency at all). No filename
  collision with the existing query-router-v2 files confirmed before
  merging. Ran both the readiness audit and the plumbing proof live after
  merging: READY_FOR_FROZEN_CORPUS_EVAL and SYNTHETIC_PLUMBING_PROVEN
  respectively - committed the report output as evidence.

### New finding this continuation - orphaned root-level src/ tree

Discovered while investigating agent/search-runtime-domain-feature-20260822
(a fresh branch, ahead=4/behind=1, whose 4 commits are titled exactly like a
fix for the domain-reranking gap flagged in the
parent-atlas-retrieval-lod-algorithm-taxonomy OpenSpec update - see below):
its diff touches src/lib/server/atlas/runtime/search-runtime.ts at the repo
root, not sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts (the
real, 1359-line production SearchRuntime). The repo root has a completely
separate, tracked src/ tree - 202 files, 113+ historical commits dating back
to old-style commit messages ("9_11_nextsteps", "errorclean") that look
like a pre-restructure snapshot from before the app moved into
sveltekit-frontend/. It is not declared in the root package.json workspaces
array (only lists packages/*), not excluded in root tsconfig.json, not
referenced by any build/vitest config. Its search-runtime.ts is a 108-line
toy reimplementation with a different shape than the real one, and imports
classifyDomainFromText from classifier/domain-classifier.ts - the exact
dead-code function (zero real callers in the real sveltekit-frontend/src
tree) flagged in the parent-atlas-retrieval-lod-algorithm-taxonomy OpenSpec
reconciliation. Presented this to the operator with 4 options (archive,
leave-alone-skip-branch, investigate further, defer); operator chose to
defer - continue the branch queue for now, revisit the root src/ question
in a dedicated follow-up. agent/search-runtime-domain-feature-20260822 is
therefore intentionally skipped, not merged, pending that follow-up - it
would add real-looking work to a file nothing imports or runs.

### Separate OpenSpec update this session (different change directory)

Reconciled a stale July 13, 2026 "End-to-End Gaps" status doc against the
real sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts pipeline
in openspec/changes/parent-atlas-retrieval-lod-algorithm-taxonomy/tasks.md
(commit f0a2a85396). Key findings: PageRank, SOM to Neo4j fan-out, Postgres
to Neo4j fan-out, domain classification, and title generation are all
actually live (the doc called 4 of these missing) via a transactional-
outbox promotion pattern the doc didn't anticipate; domain classification
runs strictly after rerank/postProcess, so "domain-aware reranking boost"
specifically remains undone; a 5-way domain-classifier duplication was
found and classified per the root CLAUDE.md governance vocabulary (3
legitimate distinct-layer owners, 1 dead file, 1 out-of-scope). See that
file directly for the full table and evidence.

### Further continuation - same 2026-08-22 session, second batch

- agent/qdrant-null-hash-metadata-repair-20260820 merged (commit
  ed7cd7243a): adds qdrant-projection-metadata-v1.mjs (pure contract -
  validateQdrantProjectionMetadataV1 hard-fails on missing
  source_ref/content_hash/chunk_id; buildQdrantPointMetadataV1 centralizes
  the card:<path>:<hash> point-metadata format) plus its test, confirmed
  passing live (node scripts/atlas/qdrant-projection-metadata-v1.test.mjs
  -> PASS). Wires this contract into backfill-qdrant-768-v2-uuid.mjs, which
  also gets a real bug fix: a batch with zero valid points after validation
  used to break out of the ENTIRE keyset-pagination loop, silently
  abandoning all subsequent rows past that one bad batch - changed to
  continue so only the bad batch is skipped.
  **Flag, not yet resolved**: this branch also adds
  apply-null-content-hash-metadata-repair.mjs, a second repair path for the
  same content_hash IS NULL population already served by the existing
  repair-null-content-hash-from-manifest.mjs. The two scripts have
  different safety invariants - the existing one synthesizes chunk_id and
  applies via a plain Postgres UPDATE; the new one explicitly never
  synthesizes chunk_id and revalidates against live Qdrant vector identity
  (cosine >= 0.99999) before applying. Neither has been run with --apply
  against the shared DB. An operator should decide which is canonical
  before either is ever applied - do not assume they are redundant or that
  running both is safe.
- agent/revision-authority-main-reconcile-20260821 NOT merged. It proposes
  a genuinely different architecture for the graphify revision-owner
  lineage: append-only ledger tables (graphify_workspace_revisions_v2,
  graphify_source_revisions_v2) instead of the additive-columns-on-existing-
  tables approach main has been iterating on all session. Disqualifying
  problems for a blind merge: (1) it deletes
  graphify-source-inventory-writer-v2.spec.ts with no replacement, which
  would leave its rewritten writer module (single-source-per-call, integrates
  materializeWorkspaceRevisionOriginV1 + deriveCodeRevisionAuthorityV2)
  completely untested and silently drop main's existing 3 passing tests;
  (2) its SQL migration variant reintroduces the same CASCADE-FK-instead-of-
  RESTRICT regression rejected on 3 separate earlier forks this session;
  (3) its own new audit-graphify-revision-authority-migration.mts hardcodes
  a requirement for the two new ledger tables, so it fails by construction
  against main's current migration - it isn't a reusable generic gate, it's
  coupled to this branch's unmerged schema. The append-only-ledger idea
  itself may be worth pursuing deliberately (it would avoid the historical-
  UNIQUE-constraint collision problem the branch's own migration comment
  describes for dirty/untracked byte states sharing a Git revision), but
  that decision should be made explicitly, not inherited by force-merging
  this branch.

**Context budget note (second continuation)**: pausing the branch queue
here again for the same reason as before - long session, diminishing
value per additional cycle spent re-deriving context. Remaining queue
(as of this point) is dominated by larger, older, more speculative
branches (temporal-*, gpu-resident-*, parent-atlas-* fabric/compiler
branches with 100+ ahead counts) that need a fresh triage pass rather
than being squeezed into an already-long session.

### Next steps for a future session (recorded 2026-08-22, operator-requested)

Three open threads, presented to the operator at the end of this session;
none started yet. Pick up whichever the operator names first - they are
independent of each other.

1. **Continue the branch queue.** Re-fetch (`git fetch origin --prune`),
   re-list `refs/remotes/origin/agent/*` sorted by `ahead` count against
   `main`, and resume triage from the smallest untriaged branch using the
   same methodology used throughout this file: merge-tree dry run, diff
   against the branch's own merge-base (not blindly against `main`) to
   isolate real unique content, verify duplicate-ownership before assuming
   reconciliation is needed, merge via git plumbing (never touch the
   working tree mid-merge), sync local `main` separately via
   stash/ff-only/pop, then run real tests/scripts before trusting a clean
   `merge-tree` result. As of this session's last full listing, the
   remaining queue is dominated by larger/older branches: `temporal-*`
   (dozen-plus variants, mostly already flagged superseded or net-zero, a
   few genuinely unreviewed), `gpu-resident-*`, and several
   `parent-atlas-*` fabric/compiler branches with 100+ commits ahead of
   `main` that will need a fresh, focused review pass rather than the
   same drive-by triage used on the smaller branches.
2. **Resolve the XGBoost trace-label blocker.** A parallel workstream
   (separate from the branch-merge queue, running concurrently with this
   session under `packages/parent-atlas/src/core/` and possibly the
   orphaned root `src/` tree - see item 3) reported: Parent Atlas focused
   suite green (13 files, 54/54 tests, covering the XGBoost bridge,
   temporal ledger, sequence reservation, recommendation history, and
   outcome repositories), but the read-only exporter still produces zero
   rows because no trace-label mappings are approved yet - i.e. package
   contracts are healthy but live training is blocked by unresolved
   trace-to-packet lineage. Next action: review
   `docs/reports/xgboost-trace-label-candidates.json` and decide/approve
   the trace-to-packet lineage mapping before attempting a live export or
   training run. No live Postgres migration or model training has been
   performed by this workstream so far.
3. **Resolve the orphaned root-level `src/` tree question**, deferred
   earlier this session (see "New finding this continuation" above) -
   still unresolved and now higher-priority than when first flagged,
   because a second, unrelated workstream
   (`packages/parent-atlas/src/core/xgboost-trace-label-bridge.ts`,
   `src/lib/server/atlas/runtime/search-runtime-domain-classifier.spec.ts`)
   is now also writing into paths that live outside
   `sveltekit-frontend/`, and it isn't yet established whether that work
   is landing in the real, buildable location or the same orphaned
   duplicate tree as `agent/search-runtime-domain-feature-20260822`
   (confirmed a 108-line toy `search-runtime.ts` unrelated to the real
   1359-line production one, not declared in root `package.json`
   `workspaces`, not excluded in root `tsconfig.json`, not referenced by
   any build/vitest config). Recommended first step: confirm exactly
   which `src/` tree(s) the concurrent `packages/parent-atlas` /
   `xgboost-trace-label` workstream is actually writing to and whether
   `packages/parent-atlas` (a real declared workspace member) is affected
   or only the separate orphaned root `src/`, before deciding whether to
   archive the orphaned tree (per the project's archive-not-delete
   convention: move to `deeds_labs/archive/` with a manifest entry) or
   leave it in place pending further investigation.
