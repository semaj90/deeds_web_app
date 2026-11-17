# Planar camera calibration helper v1 — 2026-11-16

## Purpose

Provide a bounded mathematical helper for a fixed-camera video whose image observations need a candidate projection onto one operator-measured ground plane. This is a foundation for reviewed motion annotation, not automatic crime-scene reconstruction.

## Implemented

- Added `sveltekit-frontend/src/lib/splat/planar-camera-calibration-v1.ts`.
- Calibration requires an evidence UUID, source SHA-256 revision, analysis revision, calibration frame index and PTS, frame dimensions, an explicit fixed-camera assertion, four fit anchors, and separate optional validation anchors.
- The helper computes a normalized planar homography and reports fit and independent validation residuals in meters.
- Projection is blocked unless four independent validation anchors are present and all pass the configured tolerance; fewer checks remain fit-only/unverified.
- Every result remains marked `UNREVIEWED_CALIBRATION_PROPOSAL` or `UNREVIEWED_GROUND_PLANE_PROJECTION`; semantics explicitly exclude height and camera-motion compensation.
- Rejected cases include degenerate/duplicate anchors, mismatched evidence/source/run/frame dimensions, and image points outside the frame.
- Extended the existing evidence annotation revision schema/writer to validate and persist calibration proposals in the same append-only, source-hash-bound annotation record. This reuses the current evidence owner and does not upload or modify source media.
- Bound manual pose saves to the exact captured evidence/source/run/frame/timestamp/dimensions. The keyed evidence editor resets capture when a different analyzed frame is selected, and a stale capture cannot be placed or saved.
- Added a ground-plane calibration mode to the existing pose editor. It requires a fixed-camera confirmation, eight image points (four fit and four independent checks), and measured plane coordinates. It displays fit/check residual status and saves only a passing calibration as an unreviewed annotation proposal.
- After save, the editor fetches annotation history again and compares evidence/source/run/frame/PTS/dimensions and the homography before reporting the proposal as reloaded.
- Added `POST /api/evidence/[id]/calibration-review`, using the existing case authorization and review feature gate. It appends an immutable decision to `evidence_versions` only after reloading the exact annotation revision and validating source hash, analysis revision, frame identity, and SHA-256 of the calibration payload. Review requests are capped at 16 KiB. An accepted decision permits consideration in a later scene proposal only; it does not create geometry or grant canonical authority.
- The editor now offers accept/reject after authorized proposal readback, then fetches revision history again and displays the persisted decision. A rejected calibration remains excluded. The original media and calibration annotation are never edited in place.

## Verification

- `npm exec -- vitest run src/lib/splat/planar-camera-calibration-v1.spec.ts` — passed, 6 tests, including a perspective transform and held-out projection.
- `npm exec -- vitest run src/lib/server/features/evidence/evidence-revision-v1.spec.ts` — passed, 23 tests, including source-bound calibration proposal persistence, exact-calibration review binding, idempotent replay, and mismatch rejection using test ports.
- Targeted strict TypeScript check for the helper and spec — passed.
- `git diff --check -- sveltekit-frontend/src/lib/splat/planar-camera-calibration-v1.ts sveltekit-frontend/src/lib/splat/planar-camera-calibration-v1.spec.ts` — passed.
- Chromium evidence-viewer fixture passed 1/1 covering pose frame reset, calibration authoring, residual gate, proposal save/readback, accept decision, and review-history readback. The fixture APIs and media are mocked; its global setup seeded three test cases and its teardown archived those exact cases.
- `npm run check:fast` — 0 errors and 7 warnings in one file. The first run surfaced three TypeScript errors in the new homography helper; explicit 2D point tuple construction fixed them. The remaining warnings are not asserted to be caused by this change.
- Scoped `git diff --check` passed.

## Reviewed contact and track follow-up

- Added a manually marked ground-contact candidate to the existing source-frame pose editor. Its point is constrained to the captured source image and remains an annotation proposal until a separate review decision accepts it.
- The append-only pose review now records the contact decision. The scene binding reads authorized revision history and joins exact evidence/source/analysis/frame/track identities to the reviewed calibration.
- Added `reviewed-ground-plane-track-v1.ts`, which produces measured-plane 2D coordinates only when both reviews are accepted, the calibration hash and source scope match, the independent calibration checks passed, and both decisions explicitly admit a scene proposal with `canonicalAuthority: false`. The overlay labels this as a proposal; it does not create canonical scene geometry.
- Focused Vitest run: 5 files, 45 tests passed, including rejection of unadmitted or authority-marked pose decisions. Chromium scene-panel fixture passed 1/1 and verified the projected coordinates and reviewed ground-contact marker from mocked authorized revision history. Scoped `git diff --check` passed. No live authorized database or SeaweedFS readback was run.
- `npm run check:fast` completed for this follow-up: 0 errors and 7 warnings in 1 file. Warnings remain in that file; this check does not prove live database or object-storage behavior.

## Scene revision handoff follow-up

- Added an optional `groundPlaneTrackProposals` field to the existing scene-document v1 manifest. It stores the reviewed source/run/calibration scope and measured-plane points as a proposal; it does not create mesh geometry or claim height, camera-motion correction, or canonical authority.
- The existing scene revision writer now checks case ownership and the current evidence hash, reloads the evidence-version history in the transaction, and recomputes each submitted track from accepted calibration/contact reviews before appending the revision. Scene schema/fake-port tests reject wrong-case sources and tampered coordinates.
- The video timeline can append a derived track through the existing scene revision API, then performs a fresh authorized GET and compares the saved proposal and points. The Three.js scene page reads the authorized review history and displays only a recomputed matching proposal.
- The scene panel includes an equal-scale top-down plot for verified proposals. Its 16-color lookup table represents time order only, and each marker links back to the exact source timestamp. The plot is never rendered for stale or unverified proposals.
- A keyboard-accessible discrete scrubber selects a saved sample, highlights its plot point, and updates the source-frame link. It moves between observed timestamps only and does not interpolate trajectory positions.
- Verification: focused Vitest passed 4 files / 45 tests, including equal-axis scale, stationary tracks, palette endpoints, malformed input, and the 4,096-point cap. Chromium `evidence-video-viewer.spec.ts` passed 1/1 for fixture-backed scene save and independent GET readback; the full `scene-video-event-readback.spec.ts` suite passed 2/2 before the scrubber addition; its focused plot-and-scrubber test passed 1/1 afterward, covering selection, highlight, and source timestamp update. `npm run check:fast` reported 0 errors and 8 warnings in 2 files. A subsequent full human-output diagnostic scan was stopped after prolonged silence; it produced no separate diagnostic list. Fixture corrections followed two useful failures: descriptive fake revision IDs were replaced with UUIDs, then rounded hand-entered coordinates were changed to use the calibration's exact arithmetic so strict readback equality is exercised faithfully.
- Limits: browser API responses and scene storage are mocked. No live PostgreSQL/SeaweedFS authorized readback was run. Scene timeline data remains a reviewed 2D measured-plane proposal, not calibrated 3D motion or reconstructed geometry.

## Status and limits

- **CREATED:** calibration math, append-only review decision contract, bounded authorized review endpoint, and focused tests.
- **WIRED:** calibration and manual contact authoring, append-only review, authorized history readback, non-canonical measured-plane proposal overlays, and scene revision save/readback use the existing evidence and scene revision owners.
- **PROVEN:** deterministic fit/projection, independent-check gating, source-scope rejection, reviewer admission checks, fake-port persistence/idempotency, mocked browser calibration/contact authoring, projection-overlay readback, and fixture-backed scene-manifest append plus fresh GET readback. No live authorized readback is proven.
- **DONE:** no. This is fixed-camera ground-plane motion annotation only. Live PostgreSQL/SeaweedFS authorized persistence/readback, moving-camera compensation, 3D height, pose-model inference, and reconstruction validation remain open.

Use only fixed-camera, planar, operator-measured anchors. Do not project hip centers or arbitrary joints onto the floor as if they were ground contacts. Any later scene use requires a distinct reviewed calibration and an explicit reviewed contact annotation.
