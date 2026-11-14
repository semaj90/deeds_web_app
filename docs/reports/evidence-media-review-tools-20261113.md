# Evidence media review tools — 2026-11-13

## Scope

Added a bounded review layer to the existing evidence modal and image-analysis route. The original image/video object is never overwritten. No database migration, live database write, service restart, or GPU job was run.

## Changes

- Stored image analysis now returns object/layout boxes and detector/VLM readiness separately. It validates the retrieved bytes against the admitted SHA-256 before inference, returns partial detection results when the vision model is unavailable, and fences the derived database update to the same source hash.
- The evidence modal can run authorized image analysis, overlay returned boxes, request the existing Lanczos 2x preview, and download that preview as a separate copy. The UI labels the resize accurately; it does not claim to recover image detail or identify people.
- Video playback uses the browser media element. Reviewers can capture the current frame, export a PNG still, and save a case note linked to the evidence hash and millisecond timestamp. This is frame review, not a nonlinear video editor or rewritten video.
- Existing image markup export remains a separate PNG; saved notes remain case notes, not a new evidence revision or incremental reindex.
- PhotoCraft is an open-source Rust image-editing application, but it is a standalone early-alpha app with a separate web/WASM target, not an embeddable Svelte component. No PhotoCraft/FilmCraft source was copied into the application. Any future editor integration needs dependency/license review and a derivative-only import/export contract.

## Validation

- Focused Vitest: 3 files, 18 tests passed (stored-image route, image-tools helper, markup/timestamp contract).
- `git diff --check` passed for the scoped evidence files (Git emitted line-ending conversion warnings only).
- `npm run check:native` reached 2,112 files and reported 24 syntax errors, all in the unrelated pre-existing `src/lib/server/atlas/kanban/kanban-dag-prefill-v1.ts`. It reported no diagnostics in the touched evidence files.
- No live browser, object-store, model, Qdrant, or database end-to-end run was performed.

## Remaining gates

1. Verify the modal in a real authenticated browser session, including playback, frame capture, note save, and image analysis with an operator-approved model runtime.
2. Confirm deployed object-detection model availability and box-coordinate convention against a known image fixture.
3. If edited image/video derivatives must be persisted, add a separate immutable derivative revision with source hash, transformation recipe/revision, output hash, authorization, and explicit reindex job. Do not overwrite the admitted original.
4. Video object detection/keyframe analysis, person re-identification, timelines, multi-track editing, and encoded video export are not implemented here.

## GAN

- **CREATED:** modal controls, source-bound analysis response contract, timestamped video-frame review note, and focused tests.
- **WIRED:** modal → authorized evidence analysis/upscale APIs; analysis API → existing YOLO/VLM owners; video player → local frame capture and case-note route.
- **PROVEN:** focused mocked route/helper/UI-contract tests and scoped diff check.
- **DONE:** no; authenticated live browser and persistent derivative/reindex flows remain unproven or intentionally out of scope.
