# SceneGenerationPlanV1 implementation receipt · 2026-11-20

## Scope

Implements only `CASE-SCENE-E2E-02b-1` from `openspec/changes/crime-scene-reconstruction/tasks.md`. Base repository revision: `4ae8253ab6e6`; implementation changes are uncommitted in the shared worktree.

## Result

- **CREATED — PASS:** Added a browser-safe, strict Zod contract for `parent-atlas.scene-generation-plan/v1`, plus a server-side builder that emits a canonical SHA-256 plan hash.
- **WIRED — PARTIAL:** The plan contract and hash builder are now called by the read-only case-authorized resolver route. They are not yet connected to `analysis_jobs` or a scene compiler.
- **PROVEN — PARTIAL:** Deterministic hash parity, schema constraints, canonical revision/review resolution, and adversarial rejection cases passed in the combined focused Vitest suite (16/16). No live database, queue, renderer, or browser execution was attempted.
- **DONE — PARTIAL:** The scoped contract task is marked complete. The overall generation pipeline and HTML5 scene remain open.

## Contract details

- Carries the original WHO/WHAT/WHEN/WHERE/WHY/HOW case intake only with `USER_INTAKE_UNVERIFIED` status. Explicit narrative WHY/HOW may be unknown, disputed, or a cited hypothesis requiring an accepted review label; those labels are untrusted client claims until a future canonical resolver validates them.
- Binds source refs to source revision strings and 64-character SHA-256 values; reviewed observations must match the selected source revision/hash and have unique IDs.
- Enforces unique actor, event, primitive, asset, and placement IDs; placement targets must exist and match the declared target kind. Positions stay within environment extents, scales are positive, and quaternions are normalized.
- Gives each event one source evidence item, one clock ID, interval, uncertainty, citations, and actor handles. Separate source clocks are not sorted or merged by this contract.
- Caps authored active scene memory at 8 MiB and bounds environment extents, texture dimensions, triangles, instances, sources, assets, events, actors, placements, and evidence refs.
- Allows an empty-evidence procedural blockout. Does not validate current revisions against PostgreSQL, verify registry membership, create a job, compile geometry, or persist output.

## Verification

Command, from `sveltekit-frontend`:

```text
npx vitest run src/lib/server/reconstruction/scene-generation-plan-v1.spec.ts src/lib/server/reconstruction/case-scene-fetch-parameters-v1.spec.ts
```

Observed output: `Test Files 2 passed (2); Tests 12 passed (12); Duration 5.82s`.

The eight plan tests cover canonical key-order-independent hashing, changed-input hash invalidation, duplicate IDs, unresolved placement targets, out-of-bounds and nonfinite transforms, malformed revisions, over-budget plans, stale observation/source binding, missing citations, unsupported cue kinds, cross-clock cue shape, measured-event review gating, calibration anchors, unverified intake semantics, cited/reviewed narrative hypotheses, and evidence-free blockout.

`git diff --check` passed for the scoped source, task, and report files (Git noted its configured LF-to-CRLF normalization). `openspec validate crime-scene-reconstruction --strict` reported `Change 'crime-scene-reconstruction' is valid`.

## Next steps

Complete the remaining `CASE-SCENE-E2E-02b-2` gates recorded in `docs/reports/scene-generation-plan-resolution-v1-20261120.md`: original-object readback, review-owner coverage for non-image observations and narrative claims, and revalidation at job admission. Do not treat parsed client review labels as authorization.

## AGENTS handoff

- **likely_cause:** Scene parameters had no strict, versioned contract binding case intake, sources, placements, and event timing into a reproducible request.
- **evidence:** `src/lib/reconstruction/scene-generation-plan-v1.ts`; `src/lib/server/reconstruction/scene-generation-plan-v1.ts`; `src/lib/server/reconstruction/scene-generation-plan-v1.spec.ts`; focused Vitest result above.
- **patch_targets:** The three files above, `openspec/changes/crime-scene-reconstruction/tasks.md`, and this report.
- **safe_next_command:** `npx vitest run src/lib/server/reconstruction/scene-generation-plan-v1.spec.ts src/lib/server/reconstruction/case-scene-fetch-parameters-v1.spec.ts`
- **smoke_command:** With an authorized signed-in case, submit a current candidate plan to `/api/cases/{id}/scene-reconstruction/plans`, then submit one with a stale source hash; expect the first to return a revision-bound `planHash` and the second to fail before queue admission. Not run against live services.
- **report_path:** `docs/reports/scene-generation-plan-v1-20261120.md`
