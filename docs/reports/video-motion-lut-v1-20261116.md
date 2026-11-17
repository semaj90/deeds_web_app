---
title: Video Motion LUT v1 Implementation Receipt
date: 2026-11-16
status: WIRED / FOCUSED TESTS PASSED
---

# Video Motion LUT v1

## Scope

Implemented a compact adjacent-frame grayscale-difference cue in the canonical video worker. Each tile is 64×128 pixels at 4 bits per pixel: 4,096 packed index bytes, plus a 16-byte format header. The cue is a derived review/LOD hint; it is not a pose, identity, event finding, or replacement for original-color frames.

## Changes

- Added the shared `atlas.video-motion-lut.v1` codec, header validation, manifest contract, and nibble-order tests.
- The worker converts sampled JPEG frames to bounded 64×128 grayscale with Sharp, computes the difference against the previous sampled frame, and writes each 4,112-byte tile through the existing private derived-artifact upload and stat-readback owner.
- Frame manifests preserve evidence ID, current source revision, analysis revision, frame index, source timestamp, previous sample timestamp, preprocessing revision, motion score, storage key, and SHA-256.
- Same-class detector boxes are linked with deterministic one-to-one IoU association. The worker records source/run-scoped track IDs, full-precision box centers, pixel-per-second deltas and an unreviewed-hypothesis state; event fusion accepts the added structured fields while retaining source-cited frame references.
- Added a separate human COCO-17 skeleton schema and a validator for explicitly species-named animal skeleton schemas. Full-precision coordinates are source-frame pixels with source hash, source/analysis revision and PTS; the 8-byte-per-joint output is only a display buffer. No pose inference model is called.
- Extended the existing source-bound evidence-annotation revision contract to store declared pose schemas and observations in revision metadata without adding a table or changing original evidence. The service verifies evidence ID and exact source revision/SHA-256, requires a model revision for model-origin rows, and rejects client-asserted `REVIEWED` state. The Evidence Inspector now captures the selected video frame locally, supports manual COCO-17 point placement, saves an unreviewed proposal through the existing revision route, and verifies it through revision-history readback. The UI browser fixture remain `canonicalAuthority:false`; live database readback and reviewer promotion are not wired.
- Added an authenticated preview endpoint. It checks case/evidence access, current source and analysis revisions, artifact key scope, exact byte length, SHA-256, and binary header before returning the tile.
- The authorized frames API exposes a small tile summary. The Evidence Inspector fetches the bytes with `no-store`, verifies response revision/timestamp headers, and draws an accessible low-resolution cue on a canvas.
- Added max-pooled 4-bit LOD levels and replaced the old reference-only swap queue with actual WebGPU texture creation/write, promotion, bounded texel-payload accounting, LRU eviction, and teardown. Motion tiles use `r8uint` GPU textures, preserving two packed indices per byte; the display shader expands the nibbles. Cache IDs include the authorized preview URL and source/analysis revisions.
- Updated the existing OpenSpec ledger; pose-model admission and end-to-end browser proof remain open.

## Verification

- Focused Vitest suites passed: 78 tests across codec/LOD generation, fake-device LOD manager, track linker/event fusion, durable worker, motion-preview route, frames route, pose schema, source-bound annotation revision, and authorized revision-history route. The route test verifies that pose metadata is returned with private no-store headers.
- The worker fixture used two actual generated PNG frames (black then white) and asserted source-relative times, adjacent-frame motion score, 4,112-byte artifact, digest, and upload call.
- Rollback-only PostgreSQL 18 media integration passed on `legal_ai_live_integration_scratch` after fixing canonical JSONB readback comparisons in `durable-video-analysis-v1.ts`. PostgreSQL reordered object keys, so raw `JSON.stringify` equality falsely rejected an otherwise matching timeline/frame receipt; readback now compares stable key-sorted JSON. The test verified source-bound frame findings, transcript segment fixture, EmbeddingGemma frame/text/audio vectors and the dedicated audio representation/outbox lane, then rolled back and asserted the evidence row (and vector rows when the schema pre-existed) were absent. Its video is generated from a still fixture image, transcript is stubbed, and artifact upload is an in-memory map; this is real local model/PG worker integration, not a live user upload, Whisper, SeaweedFS, queue, or independent fresh-connection proof.
- The rollback-only integration harness now accepts an explicit local MP4 path (bounded at 100 MiB). It passed with the supplied `gemini_generated_video_58d7bdc2.mp4` (10-second H.264/AAC source): FFmpeg decoded the real source, the configured detector and all three EmbeddingGemma ONNX lanes ran, revision-bound rows were read inside the PostgreSQL 18 scratch transaction, and rollback was confirmed. The strengthened test asserts every persisted frame has a source/analysis-bound 4,112-byte motion tile with a valid SHA-256 and frame index. This used no production evidence record. Whisper remains stubbed, derived-object upload remains an in-memory map, and the test does not establish independent authorized browser readback or SeaweedFS persistence. Runtime was 86.1 seconds.
- Transcript follow-up: the bounded fixture test calls the loopback faster-whisper worker at `127.0.0.1:8093/transcribe` with word timestamps enabled. FFmpeg-extracted audio was transcribed by the local `base` CPU/int8 model; the PostgreSQL readback asserts case/evidence/job binding, language, full transcript text, model configuration, every segment's index/text/times/revision/review state, and returned word intervals stored in `whisper_segments.metadata` JSONB. The passing run used PostgreSQL 18 database `legal_ai_live_integration_scratch`, then rolled back and verified the fixture evidence row was absent. The final run took 57.7 seconds total (30.8 seconds in the integration test). The test still uses an in-memory artifact adapter; it does not prove a live authorized upload/queue, SeaweedFS persistence, fresh-connection readback, or viewer authorization. The fixture is stylized synthetic media and supports plumbing verification only.
- Verification refresh (2026-11-16): reran the same bounded integration with `gemini_generated_video_58d7bdc2.mp4` and the healthy loopback faster-whisper endpoint. It passed in 26.3 seconds of test time (38.1 seconds total), verified the PostgreSQL 18 scratch database, persisted/read back transcript words and segments, exercised text/image/audio EmbeddingGemma encoders with audio enabled only by the rollback fixture, verified revision-bound motion-tile digests, and rolled back. The five focused motion/LOD/preview/track suites passed 18/18. This remains scratch/fixture proof; no SeaweedFS or canonical database write occurred, and hardware GPU plus calibrated world-space reconstruction remain unverified.
- Word navigation follow-up: the case-authorized transcript API validates persisted word intervals against their parent segment and returns them to the existing Evidence Transcript drawer, where each word seeks to its source-relative start time. Invalid intervals are omitted. The focused API/modal suite passed 16/16, including word-level seek behavior. This is mocked authorization/DB fixture coverage; live browser readback is not proven.
- Svelte checker follow-up: fixed two DOM event target typings and added the missing evidence-detail frame selection handler (selecting an analyzed frame now updates selection and seeks the source when its timestamp is present). The full frontend Svelte check completed with 0 errors and 8 warnings across 2 files.
- Renderer follow-up: the new `chromium-webgl2-motion` Playwright project disabled WebGPU and forced SwiftShader WebGL2. The video-viewer fixture passed (1 test; 2 live-storage tests skipped) and asserted the packed motion tile selected `webgl2`. This verifies shader compile/draw in software WebGL2, not hardware GPU performance or WebGPU behavior.
- Case-page read-path follow-up: the SSR video-analysis loader and its API now prefer the canonical `evidence` row, verify case ownership/assignment, and read only transcript segments joined to the current worker run's transcript ID, source revision, and analysis revision. Frame findings and event proposals are projected from the same revision-bound `ai_analysis.videoAnalysis` payload. A new case-authorized frame endpoint confines reads to the expected evidence/source/run key, caps bytes, verifies SHA-256, and returns private no-store JPEGs; UI frame URLs use that endpoint rather than object-store URIs. Legacy `evidence_items` reads remain as fallback when there is no canonical evidence row. Five focused read-model/SSR/API/frame-route suites passed 14/14, including case denial, stale-source rejection, key-scope rejection, and digest mismatch. This is mocked route/database proof, not a live browser read against a durable authorized case.
- Source-cited event UI follow-up: the scene list displays event review state and links each transcript/frame source reference into the matching transcript segment or analyzed frame. Transcript navigation waits for Svelte's DOM tick before scrolling. The links navigate only; events remain unreviewed proposals and are not admitted into a scene. Source-navigation and canonical read-path suites passed 16/16, including frame selection and transcript scroll-target behavior.
- Texture residency lifecycle follow-up: changing the preview URL/source/analysis scope releases the prior revision's resident texture immediately. A late response from an aborted old frame now unregisters only its own cache key, so it cannot release the newer frame's texture. Component unmount releases the resident entry and unconfigures WebGPU; fake-device tests verify underlying texture destruction and zeroed memory accounting. The combined regression passed 22/22 across 8 files (source navigation, canonical route/read-model, frame authorization, LOD manager, and WebGPU component lifecycle). The whole-app native checker completed with 9 errors and 1 warning across 8 unrelated files, with no diagnostics in the edited video-analysis page, motion preview, or server routes; hardware GPU lifecycle is not proven.
- The native workspace checker completed after the whole-app JS checker was stopped: 9 errors and 1 warning across 8 files, none in the changed video-analysis page or its API/SSR routes. Existing reported diagnostics include pose editor event typing, a selected-frame reference, OPFS chunk typing, native NES runtime types, and primitive/provenance typing. This is workspace-wide evidence, not a clean check.
- Latest full `svelte-check` completed with 9 errors and 8 warnings across 9 files; it reported no diagnostics in the changed canonical read-model or route files. The remaining diagnostics are in other worktree files, including the NES runtime/primitive code and unrelated Svelte event typing.
- Visual review of the supplied clip shows a stylized courtroom/game illustration; it is useful as a codec/worker fixture but is not real incident footage. No visual pose or event claim was made from it.

## Scene timeline event-link follow-up

- Added an optional `videoEventBindings` field to the existing scene-document v1 manifest. Each binding stores the evidence/source revision, analysis revision, event ID, start/end milliseconds, and `APPROVED_FOR_SCENE_PROPOSAL`; it records source-time lineage and does not claim a world position or create geometry.
- The existing `appendSceneDocumentRevisionV1` transaction now loads the canonical evidence `aiAnalysis` and admits a scene event link only when the evidence belongs to the requested case, its current hash matches, its timeline validates for the same source and analysis revision, and the exact event ID/interval is approved with scene admission. Stale, unapproved, altered-interval, and cross-case links fail closed.
- The Evidence Inspector event timeline offers “Add to scene timeline” for approved events. It reuses the deterministic per-case/per-evidence scene ID, appends a revision using the existing scene API, and confirms the persisted event by issuing a fresh scene revision GET.
- Focused schema/revision-validation suites passed 31/31. The Chromium video-modal Playwright fixture passed 1/1, including the event-to-scene action, mocked POST, and independent mocked GET readback. Two authorized-storage tests were skipped. The browser API was mocked, so this does not prove a live PostgreSQL write or case authorization end to end. The fixture supplies a preapproved synthetic event; it does not exercise the human approval POST.
- Svelte compiler accepted `EvidenceVideoEventTimeline.svelte` with zero warnings. The previous full workspace check reported nine unrelated errors; it was run before this final UI addition, so a fresh full type check is still needed.
- Still open: live authorized database save/readback, rendering these event/pose bindings in the Three.js scene timeline, independent durable pose review, calibrated image-to-2.5D placement, and hardware GPU memory/performance measurement. The motion preview's WebGL2 software path passed in an earlier run; a later combined WebGL2 run was intermittent while Chromium's standard project passed the new scene-link flow.
- Test-fixture preservation: inspection found the prior Playwright global setup/teardown hard-deleted `[PW-TEST]` cases. They now archive only tracked setup IDs at teardown; setup archives only matching test fixtures older than seven days. After this change the Chromium fixture passed 1/1 with two live-storage tests skipped, and teardown reported archiving the three case IDs created in that run. Earlier browser-run attempts created and then hard-deleted their own synthetic `[PW-TEST]` rows under the old teardown; no pre-existing case/evidence rows were targeted.
- Local real-media smoke (2026-11-16): FFmpeg decoded the user-supplied `gemini_generated_video_58d7bdc2.mp4` (H.264, 1280×720, 24 fps, 10 seconds; 1,237,047 bytes) at 0 and 5 seconds. The same Sharp 64×128 grayscale resize and production LUT codec produced a valid 4,112-byte artifact from 8,192 luma bytes per frame, with 5,711 changed pixels, motion score `0.0233642578125`, and artifact SHA-256 `sha256:1a5e10b59ddc69d6291f1f10e5bc9bcdcbb01e249cfa435ef1a71b31d4e80b5a`. Source SHA-256 was `sha256:02c24d3b4903798c50d6101879eeb35bfb6d215e4a3703988d11179bf5364742`. This was local decode/encode only; no upload, queue, detector, pose model, database, SeaweedFS or browser playback was exercised.
- A worker test linked two detector observations at distinct timestamps and verified the persisted track key, unreviewed state, and positive source-pixel velocity.
- Svelte compiler accepted `EvidenceMotionLutPreview.svelte` and `EvidenceViewModal.svelte` with zero warnings. Scoped `git diff --check` passed.
- Chromium fixture browser passed the native video modal flow, including motion tile rendering, revision/run-scoped track notice, and transcript-cue seeking. The browser reported the Canvas2D fallback, so WebGPU was not exercised. The Playwright report was 1 passed / 2 skipped; the two authorized-live tests were skipped because no live evidence IDs were configured. The fixture runner ran its normal setup/teardown and removed the three temporary test cases it seeded.
- Full `tsgo --noEmit` completed with six errors in other files: `opfs-video-cache.ts`, `nes-fsm-native-runtime-v1.ts`, `generated-scene-asset-provenance-v1.ts`, `scene-primitive-registry-v1.ts` (two), and the NES FSM demo route. It reported no diagnostics in the motion/LOD/tracker files changed here.
- `svelte-check --tsconfig ./tsconfig.json --threshold error` was started but did not produce a completion result within the available check window; it was stopped. Component diagnostics are therefore unverified.
- The browser fixture proves the modal flow using mocked APIs, not an authorized live upload. It exercised Canvas2D, not WebGPU; source-revision invalidation and viewer-close GPU disposal remain unproven. No live PostgreSQL or SeaweedFS readback was performed. The 4 MiB LOD limit accounts for uncompressed texel payload bytes; it is not a measurement of physical GPU allocation. The 4 KiB source tile is the packed artifact size, not N64 hardware memory in this app.

## Pose-authoring follow-up

- The Chromium fixture passed 1/1 after exercising selected-frame capture, manual COCO-17 keypoint placement, explicit association to the frame's person track hypothesis and track scope, mocked revision save/readback across two source timestamps, saved-sample seeking to the exact video time while retaining the nearest analyzed frame, and transcript seeking.
- Focused pose/schema, motion, track-linker, WebGPU LOD manager, and evidence-revision Vitest suites passed 33/33.
- The editor now reports persistence success only when it finds the exact source/frame-bound proposal in revision history. The test-only fetch fixture is not evidence of live case authorization, PostgreSQL commit, or SeaweedFS readback.
- The pose record carries the selected detection track ID only when explicitly selected, plus that frame's run-scoped track scope; the browser test asserts both values. The editor reads same-source, same-analysis, same-track pose samples from revision history and lists their frame indices/timestamps with seek controls. It labels these as unreviewed source-pixel observations, not calibrated 3D positions. The two-frame browser case uses one synthetic prior revision and one fixture save.
- Remaining gates: verify the pose write/readback against an authorized live case, exercise a real multi-frame track through independently persisted revisions, add reviewer correction/promotion controls, exercise WebGPU on a real browser device, and do not connect pose records to 2.5D/SPZ reconstruction until those gates pass.

### Multi-frame authoring follow-up

- The selected track and expanded editor state are now owned by the evidence modal, so switching analyzed frames within the same evidence/source/analysis/track scope does not clear the working selection. Changing that scope resets the local editor state.
- Added `pose-track-motion-v1.ts` to validate paired pose observations and calculate adjacent joint deltas and source-pixel-per-second rates. It sorts by source timestamp, rejects duplicate/non-increasing times and incompatible evidence/source/run/track/schema/dimensions, and requires a run-scoped track. Values are explicitly image-plane measurements; no camera calibration or 3D motion is inferred.
- The derived motion contract now carries machine-readable `UNREVIEWED_DERIVED_MEASUREMENT`, `cameraMotionCompensated:false`, `worldCalibrated:false`, and `source_frame_pixel_delta_includes_camera_motion` markers. The inspector states that camera movement is included.
- After adding those semantics, the focused motion-helper suite passed 5/5 and the Chromium fixture passed 1 test (2 live-storage tests skipped); the broader 43/43 regression run was completed immediately before this metadata-only refinement.
- The browser fixture now verifies a saved COCO-17 sample paired with a prior synthetic sample for the same track: it renders the 500 ms interval and nose delta, seeks the video to the second sample, preserves the track selection through keyframe change, and restores the matching saved proposal from fixture history.
- Latest focused checks: combined regression passed 43/43 across pose schema/motion, packed motion LUT, N64 texture LOD, track linking, authorized frame/motion-preview routes, and annotation revision routes. Chromium fixture suite passed 1 test; 2 live-storage tests were skipped. The browser used the configured renderer fallback; this does not prove live GPU behavior or authorized PostgreSQL/SeaweedFS readback. `git diff --check` passed for the scoped files.
- Still open: live authorized persistence/readback, reviewed correction/promotion, real detector track continuity across source frames, camera calibration for 3D motion, and production pose-model/checkpoint admission.

## Status

- **CREATED:** versioned packed motion-delta format, max-pooled packed LOD levels, deterministic object-track linker, and preview component.
- **WIRED:** worker artifact write, authorized read route, frames manifest summary, inspector preview, detector track metadata, event-fusion input, and N64-inspired WebGPU residency manager.
- **PROVEN:** 78 focused deterministic tests, fake-device upload/eviction tests, Svelte compilation, scoped whitespace check, mocked Chromium fixture UI plus transcript-seek proof, mocked source-bound pose metadata persistence, and mocked authorized revision-history readback.
- **DONE:** no. Live GPU lifecycle/cache invalidation, actual authorized database readback, and a reviewer UI/promotion path for pose annotations remain open.

## Files changed in this implementation slice

- `sveltekit-frontend/src/lib/shared/video-motion-lut-v1.ts`
- `sveltekit-frontend/src/lib/shared/pose-skeleton-schema-v1.ts`
- `sveltekit-frontend/src/lib/shared/pose-skeleton-schema-v1.spec.ts`
- `sveltekit-frontend/src/lib/server/features/evidence/evidence-revision-v1.ts`
- `sveltekit-frontend/src/lib/server/features/evidence/evidence-revision-v1.spec.ts`
- `sveltekit-frontend/src/routes/api/evidence/[id]/versions/versions-markup-revision.route.spec.ts`
- `sveltekit-frontend/src/lib/webgpu/N64TextureLODSystem.ts`
- `sveltekit-frontend/src/lib/webgpu/N64TextureLODSystem.spec.ts`
- `sveltekit-frontend/src/lib/server/features/evidence/video/durable-video-analysis-v1.ts`
- `sveltekit-frontend/src/lib/server/features/evidence/video/video-track-linker-v1.ts`
- `sveltekit-frontend/src/lib/server/features/evidence/video/video-track-linker-v1.spec.ts`
- `sveltekit-frontend/src/lib/server/features/evidence/video/video-event-fusion-v1.ts`
- `sveltekit-frontend/src/lib/server/features/evidence/video/video-motion-lut-v1.spec.ts`
- `sveltekit-frontend/src/lib/server/features/evidence/video/__tests__/durable-video-analysis-v1.spec.ts`
- `sveltekit-frontend/src/routes/api/evidence/[id]/frames/+server.ts`
- `sveltekit-frontend/src/routes/api/evidence/[id]/motion-preview/[frameIndex]/+server.ts`
- `sveltekit-frontend/src/routes/api/evidence/[id]/motion-preview/[frameIndex]/motion-preview.route.spec.ts`
- `sveltekit-frontend/src/lib/components/evidence/EvidenceMotionLutPreview.svelte`
- `sveltekit-frontend/src/lib/components/evidence/EvidenceMotionLutPreview.spec.ts`
- `sveltekit-frontend/src/lib/webgpu/N64TextureLODSystem.ts`
- `sveltekit-frontend/src/lib/webgpu/N64TextureLODSystem.spec.ts`
- `sveltekit-frontend/src/lib/components/evidence/EvidenceViewModal.svelte`
- `sveltekit-frontend/src/lib/server/features/evidence/video/video-analysis-read-model-v1.ts`
- `sveltekit-frontend/src/lib/server/features/evidence/video/video-analysis-read-model-v1.spec.ts`
- `sveltekit-frontend/src/routes/(analysis)/video-analysis/[evidenceId]/+page.server.ts`
- `sveltekit-frontend/src/routes/(analysis)/video-analysis/[evidenceId]/+page.svelte`
- `sveltekit-frontend/src/routes/(analysis)/video-analysis/[evidenceId]/video-analysis-canonical-page.route.spec.ts`
- `sveltekit-frontend/src/routes/(analysis)/video-analysis/[evidenceId]/video-analysis-source-navigation.spec.ts`
- `sveltekit-frontend/src/routes/api/video/analysis/[evidenceId]/+server.ts`
- `sveltekit-frontend/src/routes/api/video/analysis/[evidenceId]/video-analysis-canonical-read.route.spec.ts`
- `sveltekit-frontend/src/routes/api/evidence/[id]/video-frame/[frameIndex]/+server.ts`
- `sveltekit-frontend/src/routes/api/evidence/[id]/video-frame/video-frame.route.spec.ts`
- `openspec/changes/parent-atlas-spz-detective-renderer/tasks.md`

## Grayscale palette parity follow-up

- The packed 4-bit motion indices now use one exported 16-entry grayscale LUT (`0, 17, …, 255`) in Canvas2D, WebGL2 and WebGPU preview code. This removes the previous green/amber tint that contradicted the grayscale derivative contract.
- The codec test asserts every palette entry; focused codec and preview component tests passed 5/5.
- The isolated `chromium-webgl2-motion` Playwright fixture passed 1/1 and asserted the selected renderer was WebGL2 under SwiftShader. The fixture supplies synthetic revision-matched tile bytes. Its three `[PW-TEST]` cases were archived by the current run's teardown.
- This proves the grayscale palette contract and software WebGL2 shader path only. It does not prove hardware GPU behavior, WebGPU rendering, live authorized evidence fetch, persisted annotation readback, or world-space scene reconstruction.

## Packed motion residency follow-up

- Source inspection confirms both GPU shaders sample the packed nibble texture directly: WebGPU uses `r8uint`; WebGL2 uses `R8UI`. Both unpack the low/high nibble and use the same 16-entry grayscale LUT.
- The renderer currently selects the 32×64 LOD from the 64×128 source tile. Its packed texel payload is 1,024 bytes. The full 64×128 source payload is 4,096 bytes, plus the 16-byte artifact header. Canvas2D fallback expands to RGBA in CPU memory.
- Focused Vitest results: codec 4/4, WebGL/WebGPU preview component 1/1, texture LOD manager 4/4 (9/9 total). `git diff --check` passed.
- Payload accounting is not a measurement of physical GPU allocation. Hardware GPU memory behavior, live authorized storage/readback, reviewed pose promotion, and mapping source-frame annotations into world-space geometry remain unproven.
