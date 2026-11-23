# Pose hip-trail temporal scope v1

Date: 2026-11-17

## Change

The source-image hip-center trail is now clipped at the selected pose sample. Samples later than the selected PTS are excluded; when PTS values match, samples with a later frame index are excluded. The existing evidence ID, source revision, analysis revision, track ID/scope, image dimensions, and bounded event/calibration window checks remain in force.

This prevents future pose samples from appearing as though they are part of the selected frame's preceding trail. The trail remains a display-only image-space path; it is not camera compensated or world calibrated.

## Verification

- `npm exec -- vitest run src/lib/splat/scene-video-event-readback-v1.spec.ts`: 1 file passed, 9 tests passed, including a window that extends beyond the selected pose while confirming future samples are omitted.
- No browser, live authorized storage, or scene write was exercised.

## Files

- `sveltekit-frontend/src/lib/splat/scene-video-event-readback-v1.ts`
- `sveltekit-frontend/src/lib/splat/scene-video-event-readback-v1.spec.ts`
- `openspec/changes/crime-scene-reconstruction/tasks.md`
