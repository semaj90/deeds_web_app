# Authorized Video Frame Overlay for Pose Review

## Change

The manual pose editor now loads its background from the existing case-authorized `/api/evidence/[id]/video-frame/[frameIndex]` route. Before showing it, the client checks the response's source revision, analysis revision, frame index, timestamp, content type, and source/artifact dimensions against the selected frame. The server validates case access, the canonical video-analysis run, the expected SeaweedFS key, byte length, and SHA-256 before returning the JPEG.

When the manifest carries them, the server returns separate source-frame and resized-artifact dimensions. The client verifies the artifact dimensions against the decoded JPEG; for older manifests without dimensions it uses the authorized video element's decoded source dimensions and the JPEG's decoded dimensions, then checks their aspect ratios before display. The overlay uses source-frame dimensions for saved pixel coordinates while displaying the bounded resized JPEG preview. It labels the preview dimensions and source coordinate dimensions in the editor status. It does not treat the preview as original evidence and does not create or promote pose data automatically. In-flight requests are aborted on teardown, and the preview object URL is revoked.

The COCO-17 display LUT remains presentation-only. The numbered joint order, saved keypoint indices, and annotation coordinates are unchanged.

## Proof boundary

- CREATED: exact-frame route metadata checks and client-side scope validation.
- WIRED: the manual pose editor displays the authorized, source/run/frame-qualified analyzed JPEG under the skeleton.
- PROVEN: not yet. No browser, cross-case authorization, live database, or SeaweedFS readback check was run in this pass.
- DONE: no. `14.6`, `SCENE-08`, and the live evidence workflow remain open.

## Changed files

- `sveltekit-frontend/src/routes/api/evidence/[id]/video-frame/[frameIndex]/+server.ts`
- `sveltekit-frontend/src/lib/components/evidence/EvidencePoseAnnotationEditor.svelte`
- `openspec/changes/crime-scene-reconstruction/tasks.md`

## Validation

Scoped `git diff --check` passed; Git only reported its expected LF-to-CRLF normalization notices for the two Svelte/route files. No tests, Svelte check, browser run, database write, or object-store request was performed.

## Required report fields

- `likely_cause`: Pose landmarks were drawn over a browser-seeked frame without independently confirming the selected analysis frame's current source/run/frame identity.
- `evidence`: the case-authorized video-frame route validates source and analysis revisions and exact artifact hash; the pose editor now checks those response headers and uses the returned preview dimensions with source-frame coordinate dimensions.
- `patch_targets`: the three changed files listed above.
- `safe_next_command`: `git diff --check -- openspec/changes/crime-scene-reconstruction/tasks.md sveltekit-frontend/src/lib/components/evidence/EvidencePoseAnnotationEditor.svelte 'sveltekit-frontend/src/routes/api/evidence/[id]/video-frame/[frameIndex]/+server.ts'`.
- `smoke_command`: `cd sveltekit-frontend; npm exec -- vitest run 'src/routes/api/evidence/[id]/video-frame/video-frame.route.spec.ts'` (not run); follow with authorized browser proof.
- `report_path`: `docs/reports/pose-authorized-frame-overlay-20261117.md`.
