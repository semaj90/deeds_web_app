# Scene video event readback — 2026-11-16

## Change

The case-linked Three.js scene page now displays a source-linked video event panel when the loaded scene manifest contains approved `videoEventBindings`. The panel reads the existing authorized `/api/evidence/:id/video-events` endpoint; it does not add a new API, database owner, scene object, or coordinate.

Each displayed event must match the scene binding's evidence ID, source revision, analysis revision, event ID, exact interval, and current approval/admission state. Missing or changed records are shown as stale rather than silently relabeled. A matching event opens the existing case evidence detail page with `timeMs`; that page seeks the original media after metadata is available.

## Scope and limits

- Scene event bindings remain source-time references, not 3D geometry.
- The scene editor uses case-authorized API readback; it does not elevate an event's authority.
- Event-panel browser/API integration and live authorized PostgreSQL readback remain unproven.
- Pose annotations are not yet rendered as scene-time overlays. They remain source-frame annotations until a reviewer promotion and a time-alignment contract are implemented.
- No evidence bytes or canonical analysis records are modified.

## Validation

The focused Vitest suite passed 4/4. It verifies exact event matching, stale event rejection, and pose revision filtering by source hash and analysis revision. A Chromium Playwright run passed 2/2: it rendered an exact-match event and an SVG source-frame skeleton preview for an unreviewed pose, followed source-time links through a real seeded case layout, loaded the local WebM fixture, and verified playback seek to the linked 1.25-second cue; it also verified stale-source rejection. The SVG uses stored source-frame pixel coordinates and is a 2D annotation preview, not calibrated scene geometry. Playwright global setup created three `[PW-TEST]` case fixtures and teardown archived those exact IDs. The event and pose API payloads, evidence detail payload, and video bytes were mocked, so this is UI/navigation/media-seek proof, not live evidence or PostgreSQL readback. `svelte-check --tsconfig ./tsconfig.json --threshold error` completed with 0 errors and 7 warnings in 1 file. `git diff --check` passed for the scoped patch.

## Append-only pose review follow-up — 2026-11-16

- Added `POST /api/evidence/[id]/pose-review`, using the existing evidence revision history and `EVIDENCE_TRANSCRIPT_REVIEW_ENABLED` operator gate. The request is case-authorized and must identify the exact current source SHA-256, saved annotation revision UUID, analysis revision, frame index/PTS, skeleton schema, and track scope.
- The server appends `atlas.pose-review-decision.v1` metadata to `evidence_versions` in a transaction that locks and rechecks the evidence source. Repeated identical decisions are idempotent. `ACCEPTED_FOR_SCENE_PROPOSAL` only grants proposal admission; it does not set canonical authority, edit the source pose, or supply world coordinates.
- The pose editor displays review actions only when authorized revision history reports the operator gate enabled. It reloads the appended decision after submit. The scene readback joins a decision only to its exact annotation revision and frame identity.
- Focused Vitest suites passed 44/44 across revision validation, route authorization, and scene readback. Chromium Playwright passed 1/1 for pose proposal save, accept action, revision-history reload, and accepted-status display. The browser APIs were mocked.
- An opt-in integration test ran the actual Drizzle transaction against verified `legal_ai_live_integration_scratch` on PostgreSQL 18. It inserted a source-bound pose revision and review decision, read both rows back inside the transaction, verified identical retry idempotency, rolled back, then checked from an independent connection that case, evidence, and revision row counts were all zero. Passed 1/1. No canonical `legal_ai_db` or SeaweedFS write occurred.
- Remaining: live authorized route readback, reviewed multi-frame pose series on real source video, a licensed pose inference model, camera-motion compensation/calibration, and 2.5D/SPZ mapping. Accepted screen-space pose remains a source-linked proposal only.

## Pose-model admission follow-up — 2026-11-16

The manual pose path remains the current evidence workflow. I reviewed two automatic pose candidates before choosing a runner. Google's official BlazePose GHUM model card names Apache-2.0, but explicitly places surveillance outside intended scope and says its depth is up-to-scale rather than metric. It is therefore not admitted for this evidence-video use. MMPose's code is Apache-2.0, while upstream still has an open request for exact RTMPose checkpoint and training-data terms; no checkpoint is admitted from code licensing alone. Sources: [BlazePose GHUM model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf), [MMPose checkpoint-license issue](https://github.com/open-mmlab/mmpose/issues/3282).

The next safe automatic path needs exact checkpoint rights and intended-use review, or a separately trained model with rights-cleared data and a recorded model/data revision. Neither path supplies courtroom-grade scale by itself. Keep camera calibration, per-frame depth provenance, reviewer admission, and the final 2.5D/SPZ mapping as distinct gates. No model was downloaded or executed, and runtime behavior did not change.

## Required report fields

- `likely_cause`: Saved scene events had no read-only scene-viewer presentation or exact authorized readback join.
- `evidence`: `sveltekit-frontend/src/lib/splat/scene-video-event-readback-v1.ts`; `sveltekit-frontend/src/lib/components/evidence/SceneVideoEventBindings.svelte`; existing case event API, pose revision API, scene manifest binding.
- `patch_targets`: readback helper/spec, scene panel, Three.js scene page, evidence detail time-seek behavior, dev browser fixture and Playwright test, OpenSpec task ledger.
- `safe_next_command`: `git diff --check -- sveltekit-frontend/src/lib/splat/scene-video-event-readback-v1.ts sveltekit-frontend/src/lib/components/evidence/SceneVideoEventBindings.svelte "sveltekit-frontend/src/routes/(app)/demos/spz-renderer/+page.svelte" "sveltekit-frontend/src/routes/(app)/cases/[id]/evidence/[evidenceId]/+page.svelte" openspec/changes/parent-atlas-spz-detective-renderer/tasks.md docs/reports/scene-video-event-readback-20261116.md`
- `smoke_command`: `cd sveltekit-frontend; npm exec -- vitest run src/lib/splat/scene-video-event-readback-v1.spec.ts; npm exec -- playwright test tests/e2e/scene-video-event-readback.spec.ts`
- `report_path`: `docs/reports/scene-video-event-readback-20261116.md`

## Exact pose-frame preview follow-up — 2026-11-16

- The scene event/pose panel now requests the authorized video-frame route for source-matched pose samples and places the original frame behind the SVG skeleton. The frame is shown only when source revision, analysis revision, frame index, timestamp, and aspect ratio match the stored pose record.
- Bounds: at most four previews are retained at once; each response is limited to 4 MiB. Blob URLs are revoked when the evidence/run scope changes or the component is destroyed. Frame loading does not block event and pose metadata rendering.
- The Chromium test verifies a decoded 320×180 frame beneath the skeleton and rejects a stale source-revision response. The focused scene-panel browser test passed 1/1; the pose-review route suite passed 2/2. After correcting the bounded-JSON discriminant and explicitly normalizing nullable track fields, `svelte-check --tsconfig ./tsconfig.json --threshold error` completed with 0 errors and 7 warnings in 1 file.
- This is source-frame review context only. It does not map image pixels to calibrated world coordinates, perform camera-motion compensation, or establish scene geometry. API/frame bytes are mocked in the browser test; live authorized object-storage readback remains open.

## Clip-scoped image-space motion trail follow-up — 2026-11-16

- Added a display-only hip-center trail for repeated COCO-17 samples. It connects left/right hip midpoints only when evidence ID, source revision, analysis revision, track ID, track scope, and source-frame dimensions all match. The trail is capped at 24 sample points and does not persist new observations.
- Added `trackScopeId` to the scene readback projection and sample deduplication key, preventing a reused track label from merging separate clip-scoped tracks.
- Focused readback Vitest passed 6/6, including clip-scope rejection and trail-size bounds. Chromium passed 1/1 with two same-track timestamps, matching source frames, visible trail, and selected-frame source link. Playwright setup created three test cases and teardown archived those exact IDs.
- The Chromium fixture passed 1/1 and asserted the two timestamped same-track samples, rendered hip-center path (`45,90 75,90` in the fixture frame), source-frame preview, and link to the selected timestamp. Its first rerun exposed a missing helper import and an over-broad selector; both were fixed before the passing run. Three `[PW-TEST]` cases created by setup were archived by teardown.
- Final `svelte-check --tsconfig ./tsconfig.json --threshold error` completed with 0 errors and 7 warnings in 1 file. Focused readback Vitest passed 6/6. The trail is image-plane motion only; it does not correct camera motion, estimate depth, or create world-space movement.
