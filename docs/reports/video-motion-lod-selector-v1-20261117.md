# Video motion LOD selector v1

Date: 2026-11-17

## Change

The motion-tile preview now picks the largest packed level that fits the canvas's device-pixel dimensions. WebGL2 and WebGPU call the same selector. At the component's 48x80 CSS preview size on a 1x display, it selects the 32x64 level (1,024 packed payload bytes), one quarter of the 64x128 source tile (4,096 bytes). Larger previews can select the source level. This is a render-resolution policy, not an N64 hardware emulation or a measurement of total GPU memory.

The selector rejects empty LOD arrays, non-positive or non-finite target dimensions, invalid dimensions, and mismatched payload lengths. Existing source/run revision and frame-comparison validation stays in place.

## Verification

- `npm exec -- vitest run src/lib/webgpu/N64TextureLODSystem.spec.ts src/lib/components/evidence/EvidenceMotionLutPreview.spec.ts src/lib/server/features/evidence/video/video-motion-lut-v1.spec.ts`: 3 files passed, 15 tests passed. The component test sets a 48x80 CSS preview, verifies the WebGPU residency request selects LOD 3, and checks packed residency levels of 16, 64, 256, 1,024, and 4,096 bytes. The residency tests also cover exact payload accounting and eviction within the manager's 4 MiB GPU payload budget.
- Scoped `git diff --check`: passed.
- Browser rendering, real GPU memory, authorized case readback, automatic pose inference, and calibrated world-space reconstruction were not verified by this change.

## Files

- `sveltekit-frontend/src/lib/shared/video-motion-lut-v1.ts`
- `sveltekit-frontend/src/lib/components/evidence/EvidenceMotionLutPreview.svelte`
- `sveltekit-frontend/src/lib/components/evidence/EvidenceMotionLutPreview.spec.ts`
- `sveltekit-frontend/src/lib/server/features/evidence/video/video-motion-lut-v1.spec.ts`
- `openspec/changes/crime-scene-reconstruction/tasks.md`

## Separate motion sampling lane (2026-11-17)

The durable video worker now targets 2 FPS for its bounded analysis frames (maximum 60) and independently samples motion cues at up to 2 FPS (maximum 300). Motion-only frames are requested at 64px width, reduced to a 64×128 grayscale tile, and stored as 4bpp low-nibble-first artifacts. The cap bounds the payload to 1,233,600 bytes (about 1.18 MiB) per run. These tiles are separate from detection/keyframe frames, do not invoke YOLO, and cannot be treated as object-motion findings.

Each motion sample is bound to evidence ID, source revision, analysis revision, sequential sample index, timestamp, prior sample timestamp, artifact key/hash/length, and `UNREVIEWED_PIXEL_CHANGE_CUE`. The authorized frame-list endpoint validates that lineage and provides sample timestamps; the existing private motion-preview route validates and hash-checks the tile before returning it. The evidence modal has a separate pixel-change cue strip and seek action; pose/keyframe indices are not reused.

The worker, frame-list, and tile-route suites passed 32/32 after the review-state contract and 2 FPS changes. The LUT and preview suites also passed 11/11 earlier in this session. A project-wide Svelte check now reports 11 errors and 8 warnings in 4 files, all in the existing session and pose/calibration components; there are no remaining diagnostics in the motion worker, endpoints, or evidence modal. Browser display and real-media/object-store readback have not been proven, so VR-01 stays open.

The opt-in rollback-only real-media integration fixture was updated to assert the separate motion-sample records and artifact digests, and its extractor now honors the requested 64px motion-frame width. That gated integration was not run; its artifact adapter is in-memory and does not prove durable object-store retrieval.

Additional files modified for this slice:

- `sveltekit-frontend/src/lib/server/features/evidence/video/durable-video-analysis-v1.ts`
- `sveltekit-frontend/src/lib/server/features/evidence/video/__tests__/durable-video-analysis-v1.spec.ts`
- `sveltekit-frontend/src/lib/server/features/evidence/video/__tests__/durable-video-analysis-v1.media.integration.spec.ts`
- `sveltekit-frontend/src/routes/api/evidence/[id]/frames/+server.ts`
- `sveltekit-frontend/src/routes/api/evidence/[id]/motion-preview/[frameIndex]/+server.ts`
- `sveltekit-frontend/src/routes/api/evidence/[id]/motion-preview/[frameIndex]/motion-preview.route.spec.ts`
- `sveltekit-frontend/src/lib/components/evidence/EvidenceViewModal.svelte`

## Exact cue-to-pose-review handoff (2026-11-17)

Selecting a packed motion-only sample now seeks the authorized video and selects the pose-review frame only when `timestampMs`, `sourceRevision`, and `analysisRevision` all match an analyzed keyframe exactly. The reviewer then explicitly opens the existing manual pose editor. The new `findExactVideoMotionSampleFrameV1` helper does not choose a nearest frame. If no exact analyzed frame exists, the modal clears the old selected frame so the pose editor cannot accidentally annotate a stale frame, and tells the reviewer to select an extracted keyframe. This keeps the 4bpp tile as a pixel-change review cue, not a detector result or pose observation.

Focused verification: the exact cue matcher passed 6/6. A current combined run of the N64 texture LOD, motion LUT preview/codec, cue matching, pose motion, and scene readback suites passed 37/37 across six files. The focused Chromium WebGL2 browser test passed 1/1 through motion cue selection, exact keyframe selection, manual pose entry, reviewed calibration, and scene-proposal handoff with mocked APIs. It does not prove live authorized database/object-store readback. Automatic pose inference and calibrated 3D body motion remain open.

Files for this handoff:

- `sveltekit-frontend/src/lib/shared/video-motion-cue-v1.ts`
- `sveltekit-frontend/src/lib/shared/video-motion-cue-v1.spec.ts`
- `sveltekit-frontend/src/lib/components/evidence/EvidenceViewModal.svelte`
- `sveltekit-frontend/tests/e2e/evidence-video-viewer.spec.ts`
- `openspec/changes/crime-scene-reconstruction/tasks.md`
