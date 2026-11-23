# Scene Runtime Recipe v1

## Outcome

Implemented the `CASE-SCENE-E2E-02b-3` deterministic recipe projection in the shared reconstruction module. It maps a validated generation plan into a compact description for the existing browser scene renderer: pseudonymous actors, primitive/asset references, transforms, seeded environment profile and extents, bounded cell-residency policy, event lanes, quality limits, provenance policy, and WHY/HOW claims with citations and review state. Event cues now carry typed target refs to registered actors/primitives/assets; a timed prop must target a registered primitive or asset, never an actor.

Events are grouped by source clock and ordered only within that lane. The projection rejects a clock ID that groups events from different evidence sources. An evidence-free blockout produces no actors or event lanes and retains unknown WHY/HOW. The recipe does not generate meshes or save revisions.

The module is browser-safe and does not import server crypto or persistence. It carries the plan hash as a receipt from the authorized server resolver; it is explicitly not an authorization or integrity boundary. A future job-admission owner must recompute the hash and re-resolve current case, scene, evidence, and review state before durable execution.

## Verification

- The case builder now offers **Scene time (illustrative)** for authored cues. The plan carries a scene-scoped clock with a null evidence ID. The runtime, draft validator, editor reopen, and JSON report support that clock. Evidence clocks still resolve by evidence ID on the server. A local cue with a source citation, a source clock ID, or an accepted review label is rejected.
- Five focused suites passed 26 tests. A follow-up draft suite passed seven tests, including Three.js visibility at both ends of a scene-time interval and restoring the cue in the editor.
- The native check completed with zero errors and one existing curfew beach demo warning. Strict OpenSpec validation passed. The signed-in staging case and session variables were absent.

- Focused Vitest: 4 files, 21 tests passed (parameter builder, plan schema/hash/target validation, reference resolver, runtime recipe).
- `openspec validate crime-scene-reconstruction --strict`: valid.
- `git diff --check`: passed (Git emitted only configured LF-to-CRLF notices).
- TypeScript syntax transpilation passed for the shared plan/recipe, resolver and API route files.
- Not run: `svelte-check-native`, full app checks, browser/Playwright, PostgreSQL, SeaweedFS, durable job admission, render, or save/reopen.

## Status

- **Created:** recipe schema, deterministic plan projection, source-clock partitioning, no-evidence blockout behavior, tests.
- **Wired:** the recipe is not yet called by a renderer or durable worker.
- **Proven:** focused unit behavior only; no app/browser/database proof.
- **Done:** this bounded 02b-3 contract task only. The overall reconstruction workflow remains open.

## Admission follow-up

The existing `analysis_jobs` enqueue path and worker dispatch are reusable for source-bound work, but its Drizzle schema currently requires `analysis_jobs.evidence_id` (`schema-postgres.ts` around line 352). That does not directly represent a legitimate blockout with no evidence. Do not invent or attach a fake evidence row to make queueing work. Before implementing 02b-4, decide through the owning job-schema contract whether to support a nullable source for scene jobs (including DB constraints, worker validation, indexes, and migration parity) or use an already-existing durable scene-workflow owner. No job was enqueued and no schema/migration was changed in this step.

## OpenCode execution fields

- **likely_cause:** The validated plan lacked a compact browser-facing scene recipe that preserved independent clocks and presentation-only claim status.
- **evidence:** `sveltekit-frontend/src/lib/reconstruction/scene-runtime-recipe-v1.ts`; focused Vitest result 20/20; plan resolver limitations recorded in `docs/reports/scene-generation-plan-resolution-v1-20261120.md`.
- **patch_targets:** `sveltekit-frontend/src/lib/reconstruction/scene-runtime-recipe-v1.ts`; `sveltekit-frontend/src/lib/reconstruction/scene-runtime-recipe-v1.spec.ts`; `openspec/changes/crime-scene-reconstruction/tasks.md`.
- **safe_next_command:** `npx vitest run src/lib/reconstruction/scene-runtime-recipe-v1.spec.ts src/lib/server/reconstruction/scene-generation-plan-v1.spec.ts src/lib/server/reconstruction/resolve-scene-generation-plan-v1.spec.ts src/lib/server/reconstruction/case-scene-fetch-parameters-v1.spec.ts` from `sveltekit-frontend`.
- **smoke_command:** Same focused Vitest command; it validates the recipe contract, not rendering or persistence.
- **report_path:** `docs/reports/scene-runtime-recipe-v1-20261120.md`.
