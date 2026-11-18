# COCO-17 Keypoint Display LUT

## Change

The supplied YOLO pose reference numbers joints 0–16 in the same order as `humanCoco17PoseSchemaV1`. Added a display-only 16-color palette and an explicit COCO-17-index-to-palette-slot lookup, then applied it to the manual pose overlay and joint selector.

This changes no canonical keypoint index, source pixel coordinate, annotation revision, detector class ID, or grayscale motion tile. It does not add a YOLO11/pose runtime or convert the image-space skeleton into 3D. The grayscale motion tile remains 64×128 pixels, packed 4bpp: 4,096 pixel bytes plus its 16-byte versioned header.

## Proof boundary

CREATED: palette and index mapping are in the shared module.
WIRED: numbered skeleton points and pose-selector rows use the palette.
PROVEN: not yet; no browser screenshot or visual contrast review was performed.
DONE: no; an admitted pose-estimation runtime and live reviewed motion path remain separate open gates.

## Validation

No tests, Svelte check, browser run, model inference, database write, or object-store request was performed.

Tracked-file command:

```text
git diff --check -- sveltekit-frontend/src/lib/shared/pose-keypoint-render-lut-v1.ts sveltekit-frontend/src/lib/components/evidence/EvidencePoseAnnotationEditor.svelte openspec/changes/crime-scene-reconstruction/tasks.md
```

Observed output: exit code `0`; no whitespace errors. Git warned that `EvidencePoseAnnotationEditor.svelte` may be converted from LF to CRLF on a future write.

The new helper is untracked, so it was checked separately with `git diff --no-index --check -- NUL sveltekit-frontend/src/lib/shared/pose-keypoint-render-lut-v1.ts`. Observed output: exit code `1` because the file differs from the empty `NUL` input; no whitespace diagnostic. Git warned that the helper may be converted from LF to CRLF on a future write.

## Required report fields

- `likely_cause`: The manual pose editor displayed all COCO-17 joints in the same color, making the numbered keypoint reference harder to compare with a frame.
- `evidence`: `sveltekit-frontend/src/lib/shared/pose-skeleton-schema-v1.ts`; `sveltekit-frontend/src/lib/components/evidence/EvidencePoseAnnotationEditor.svelte`; `sveltekit-frontend/src/lib/shared/video-motion-lut-v1.ts`; the user-supplied YOLO11 COCO-17 keypoint reference image.
- `patch_targets`: `sveltekit-frontend/src/lib/shared/pose-keypoint-render-lut-v1.ts`; `sveltekit-frontend/src/lib/components/evidence/EvidencePoseAnnotationEditor.svelte`; `openspec/changes/crime-scene-reconstruction/tasks.md`.
- `safe_next_command`: `git diff --check -- sveltekit-frontend/src/lib/shared/pose-keypoint-render-lut-v1.ts sveltekit-frontend/src/lib/components/evidence/EvidencePoseAnnotationEditor.svelte openspec/changes/crime-scene-reconstruction/tasks.md`.
- `smoke_command`: `cd sveltekit-frontend; npm run check:fast` (not run); follow with a browser review of joint contrast on light, dark, and busy source frames.
- `report_path`: `docs/reports/pose-keypoint-render-lut-20261117.md`.
