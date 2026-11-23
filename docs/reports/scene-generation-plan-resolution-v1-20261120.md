# Scene generation plan resolution v1 · 2026-11-20

## Scope and status

Implements the server-side resolution portion of `CASE-SCENE-E2E-02b-2`. Base repository revision: `4ae8253ab6e6`; current edits are uncommitted in the shared worktree.

- **CREATED — PASS:** Added a read-only plan resolver and authenticated case-scoped POST route at `/api/cases/[id]/scene-reconstruction/plans`.
- **WIRED — PARTIAL:** The route uses existing `getAuthorizedCase`, scene-document revision readback, evidence rows, Storybook image analysis/review readback, and the current video-event timeline/admission contract. It is not connected to the case workspace or a durable job admission path.
- **PROVEN — PARTIAL:** Pure resolver adversarial tests and focused syntax transpilation pass. Route behavior has not been run against live PostgreSQL, object storage, or a signed-in browser.
- **DONE — PARTIAL:** 02b-2 is marked partial. Source-object byte readback, non-image review adapters, canonical case-level WHY/HOW decisions, and job-admission revalidation remain open.

## Behavior

- Requires an authenticated caller and canonical owner/assigned-attorney case access; validates a bounded Zod plan body and path/body case match.
- Compares the expected scene revision with `readSceneDocumentRevisionV1`.
- Resolves source evidence only when current, undeleted evidence rows belong to the case and their stored SHA-256 matches the submitted source revision/hash.
- Resolves image observations through the latest whole-image analysis manifest and `readStorybookImageReviewsV1`; the observation ID, source revision, analysis revision, observation revision, review decision UUID, and `ACCEPTED` decision must all match.
- Resolves linked video events from the case evidence row's canonical `videoAnalysis.eventTimeline`; case, source hash, analysis revision, event ID, interval, review status, and scene admission are checked. `measured` or accepted cues require an approved, scene-admitted event.
- Replaces client clock IDs with `evidence:<uuid>` lanes before hashing. No client value can merge unrelated source clocks in this plan.
- Replaces client-supplied case intake with the authorized case's validated `caseSceneIntakeV1` metadata.
- Allows unknown or cited unreviewed WHY/HOW hypotheses to remain proposals. Accepted or disputed narrative claims fail closed because the canonical case-level claim-review owner is not wired.
- Creates no job, scene revision, asset row, or object-store object.

## Verification

Focused command, from `sveltekit-frontend`:

```text
npx vitest run src/lib/server/reconstruction/scene-generation-plan-v1.spec.ts src/lib/server/reconstruction/resolve-scene-generation-plan-v1.spec.ts src/lib/server/reconstruction/case-scene-fetch-parameters-v1.spec.ts
```

Observed result: `Test Files 3 passed (3); Tests 16 passed (16); Duration 4.44s`.

Adversarial coverage includes cross-case scope, stale scene revision, stale source hash, deleted/missing evidence, stale/unaccepted observation review, client clock-ID spoofing, unreviewed video-event admission, accepted video-event binding, and narrative review-owner absence.

TypeScript syntax transpilation passed for the shared plan schema, plan builder and specs, reference resolver and spec, and the new API route. This is syntax validation, not TypeScript type checking. `svelte-check-native`, browser tests, live database checks, source-object byte hashing, and any worker/job run were not performed.

## Remaining gates

1. Add source-object streaming readback and verify SHA-256 against the canonical evidence row before job admission; keep large media bounded and do not buffer entire videos in memory.
2. Extend canonical reviewed-observation resolution beyond Storybook whole-image observations where needed.
3. Connect prosecutor review ownership for WHY/HOW claims; until then accepted/disputed client labels remain rejected.
4. Re-resolve source, observation, event, and scene revisions atomically or conditionally at durable job admission. The current read-only route cannot prevent later changes.
5. Add route-level tests and signed-in browser/API proof; then connect the case workspace caller and existing durable `analysis_jobs` owner.

## AGENTS handoff

- **likely_cause:** The plan contract was deterministic but still accepted client-claimed source/review references without resolving them against current case owners.
- **evidence:** `src/lib/server/reconstruction/resolve-scene-generation-plan-v1.ts`; `src/routes/api/cases/[id]/scene-reconstruction/plans/+server.ts`; `src/lib/server/reconstruction/resolve-scene-generation-plan-v1.spec.ts`; `src/lib/server/evidence/whole-image-analysis-readback-v1.ts`; `src/lib/server/scene-document-revisions-v1.ts`.
- **patch_targets:** The plan schema/builder, resolver and test, plans API route, `openspec/changes/crime-scene-reconstruction/tasks.md`, and this report.
- **safe_next_command:** `npx vitest run src/lib/server/reconstruction/scene-generation-plan-v1.spec.ts src/lib/server/reconstruction/resolve-scene-generation-plan-v1.spec.ts src/lib/server/reconstruction/case-scene-fetch-parameters-v1.spec.ts`
- **smoke_command:** With a signed-in authorized case and approved image/video reviews, POST a current plan and confirm returned hashes/review IDs/clock lanes; then alter one source/review revision and confirm rejection before any job admission. Not run against live services.
- **report_path:** `docs/reports/scene-generation-plan-resolution-v1-20261120.md`
