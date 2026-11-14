# Courtroom Video Studio V1 — 2026-11-13

## Scope

This slice adds a synthetic, editable courtroom storyboard using the existing `CourtroomScene` renderer. It is intentionally isolated from evidence upload, case mutations, reconstruction jobs, model calls, and production storage.

## Implemented

- `sveltekit-frontend/src/lib/courtroom/courtroom-video-project-v1.ts` defines the 1280×720, 30 fps, 240-frame project contract, four contiguous 60-frame beats (`WHO`, `WHAT`, `WHY`, `HOW`), fixture-only source references, evidence status, and required reconstruction disclosure.
- `sveltekit-frontend/src/lib/courtroom/courtroom-video-project-v1.spec.ts` checks exact profile/coverage and rejects unsourced documented motive, missing disclosure, invalid segment order/ranges, invalid hashes, and non-fixture sources.
- `sveltekit-frontend/src/routes/(app)/demos/courtroom-studio/+page.svelte` reuses `CourtroomScene`'s existing procedural courtroom/actors. It provides frame seeking, beat selection, editable draft headings/narration, a JSON download, captions, and a browser-recorded preview. The scene initializes only in `onMount`; no evidence bytes are loaded.
- The fixture project carries an explicit synthetic `caseId`, a deterministic SHA-256 `sourceRevision`, and one fixture-only source reference per beat. Validation rejects project/source revision drift and real-case IDs in this synthetic-only editor.
- Camera presets are editable per beat. Browser preview recording has a cancel action; cancellation discards the partial recording and timeline/story controls are disabled while capture is running.

## Proof

- Focused project contract: 3 Vitest tests passed.
- After adding the fixture-scoped case/source revision and cross-reference checks: 4 Vitest tests passed. The Svelte compiler reported 0 warnings for the edited page.
- The running SvelteKit route was inspected in a headless browser after the scene finished initializing. It rendered the scene, playback/timeline controls, four camera selectors, revision labels, and recording controls without a page error. Camera changes and recording cancellation were not interaction-tested.
- FilmCraft CLI probe of the moving retimed MP4 reported H.264, 1280×720, 30 fps, eight seconds, and 660,761 bytes. The command output does not report decoded frame count; the separate numbered-image-sequence export is the proof with an exact 240-frame count.
- Direct Svelte component compile: passed with 0 warnings.
- `git diff --check` for the new code: clean.
- Headless Microsoft Edge opened the live SvelteKit route at `/demos/courtroom-studio` with HTTP 200, rendered the editor and scene canvas, reported no browser console/page errors, sought to frame 61, and downloaded the JSON project and WebM preview. The scene controls now wait for the first renderer FPS tick (with a five-second fallback) so they do not enable over a blank first frame; the story editor has readable contrast and its own bounded scroll area.
- The WebM browser preview played to its end, but the browser-reported duration was 11.795 seconds on this CPU-rendered run. The page correctly labels this a preview and does not claim it is the fixed-rate final export.
- FilmCraft CLI v0.20.1 was downloaded from its public release and its archive checksum matched the official release checksum. Four synthetic keyframes were captured from the SvelteKit/Babylon courtroom canvas at the four story beats, labeled with the beat text and disclosure, then assembled as a numbered image sequence with 60 frames per beat. FilmCraft exported `parent-atlas-procedural-courtroom-8s.mp4`: **1280×720, H.264, 30 fps, 240 frames, eight seconds, 1,247,538 bytes**, no offline media. FilmCraft's probe confirmed the sequence properties. Installed Microsoft Edge independently decoded the scene-based MP4 and reported duration 8 seconds, 1280×720, and advancing playback (0.718 seconds observed after 700 ms).
- The MP4 contains four held scene views (one captured view for each 60-frame beat); it is not continuous 3D animation, motion interpolation, or a directly wired FilmCraft export button. The local browser recording is performance-timed. The fixed-rate CLI artifact is under `.tmp/` and is not a tracked deliverable.
- A separate FilmCraft retiming proof used the moving browser WebM (`courtroom-reconstruction-8s.webm`, browser-measured 11.795 seconds) and `clip.speedDuration` in a 30 fps sequence. FilmCraft independently probed `retimed-moving-preview-8s.mp4` as H.264, 1280×720, 30 fps, 8 seconds, 660,761 bytes. This proves the CLI can retime the browser capture to the required duration; it does not yet add that operation to the Svelte UI or verify all 240 decoded frame timestamps.
- Headless browser inspection of the running `/demos/courtroom-studio` page showed the rendered scene, enabled transport, per-beat camera selectors, fixture source revision labels, and export controls. This was a UI smoke inspection, not an interaction test of camera edits or cancellation.
- `npm run check:fast` is blocked by 24 syntax diagnostics in the already-dirty `sveltekit-frontend/src/lib/server/atlas/kanban/kanban-dag-prefill-v1.ts`. The reported errors are in that file; this change did not edit it. The full repository check is not green.

## Remaining gaps

- No FilmCraft project interchange/bridge has been wired into the Svelte editor; the browser recording is a review preview whose wall-clock duration can vary with rendering performance. The exact fixed-rate export currently uses a scratch CLI workflow.
- The verified MP4 is a four-keyframe synthetic scene proof. Continuous camera/actor motion, editor-driven FilmCraft edits, and automatic project export remain open.
- Camera presets, title, and narration are editable, but the project remains browser-local and downloadable JSON; there is no persisted project revision, autosave, source-linked factual analysis, or incremental reindex.
- The browser capture can contain continuous procedural scene motion, but its duration is wall-clock dependent. Fixed-rate retiming is demonstrated only through the standalone FilmCraft CLI; editor-driven export and exhaustive 240-frame decode verification remain open.
- There is no case/evidence authorization, real source binding, upload-to-scene queue, evidence-grounded analysis, immutable evidence revision, incremental reindex, or artifact-store readback in this editor. Its fixture-only claims cannot be treated as case findings.
- No OpenSpec checkbox was changed. SCENE-01 through SCENE-15 remain open because their case, rights, worker, renderer, and independent-readback gates are broader than this synthetic editor proof.

## GAN status

- **CREATED:** versioned storyboard contract, focused validation tests, minimal editor page.
- **WIRED:** editor drives the existing procedural courtroom scene and exports a JSON draft / browser preview.
- **TEST_PROVEN:** contract tests and browser route/preview download pass; the procedural scene was captured at all four beats, assembled in FilmCraft, exported as a fixed 240-frame MP4, and independently decoded in Edge.
- **LIVE_PROVEN:** local UI route and synthetic scene export were exercised; no real case evidence, authorization, durable scene job, or production export path was involved.
- **DONE:** no. The scene generation and evidence-grounding OpenSpec remains incomplete.

## Required structured handoff

- **likely_cause:** The repository had a procedural courtroom renderer and timeline, but no bounded, source-aware four-beat reconstruction project contract or review editor.
- **evidence:** `sveltekit-frontend/src/lib/courtroom/courtroom-video-project-v1.ts`, its spec, the `courtroom-studio` route, and the scratch FilmCraft CLI export/probe described above.
- **patch_targets:** `sveltekit-frontend/src/lib/courtroom/courtroom-video-project-v1.ts`; `sveltekit-frontend/src/lib/courtroom/courtroom-video-project-v1.spec.ts`; `sveltekit-frontend/src/routes/(app)/demos/courtroom-studio/+page.svelte`; `docs/reports/courtroom-video-studio-v1-20261113.md`.
- **safe_next_command:** Review the focused diff and the existing `SCENE-01` through `SCENE-15` gates in `openspec/changes/courtroom-upload-story-pipeline/tasks.md`.
- **smoke_command:** `cd sveltekit-frontend && npx vitest run src/lib/courtroom/courtroom-video-project-v1.spec.ts`.
- **report_path:** `docs/reports/courtroom-video-studio-v1-20261113.md`.
