# Evidence transcript drawer — 2026-11-14

## Implemented

- Added an explicit Transcript control to the video evidence viewer and moved the existing transcript panel into an expandable right-side drawer.
- Transcript cues remain source-timed; selecting a cue seeks the active video. Escape closes the drawer before closing the evidence viewer.
- VTT, SRT, TXT, and JSON downloads now use a sanitized `<video-title>_<evidence-id>_transcript` filename. JSON export now returns an attachment while ordinary transcript GET remains JSON for the viewer.
- Added a Playwright test that opens the drawer from a case board, checks a timestamped cue and its proposal label, captures a screenshot, and checks the suggested VTT filename. It requires an authorized seeded case and video through `PLAYWRIGHT_TRANSCRIPT_CASE_ID` and `PLAYWRIGHT_TRANSCRIPT_EVIDENCE_ID`.

## Verification

- `npm exec -- vitest run src/lib/components/evidence/EvidenceTranscriptPanel.spec.ts tests/evidence-view-modal.spec.ts`: 2 files, 7 tests passed.
- Scoped `git diff --check` for the changed viewer and stylesheet passed.
- `npx playwright test tests/e2e/evidence-video-transcript.spec.ts` did not reach test execution: the configured Playwright web server timed out after 120 seconds. No screenshot was produced in this run.
- No live transcript database read, export endpoint readback, or real video playback was performed.

## Image-analysis inventory note

- `src/lib/server/yolo.ts` remains the detector owner and spawns Python ONNX Runtime, with cv2 or PIL preprocessing. `onnxruntime-node` being installed does not mean this detector uses it.
- Model discovery prioritizes DocLayout-YOLO and YOLOv10 when weights are present, with YOLOv8 as fallback. The earlier local probe reported only `yolov8n.onnx` available; no current weight inventory was run for this report.
- No Node OpenCV binding is established by this work. The existing VLM analyzer has explicit unavailable results and reasoning stripping in the inspected worktree, but this report does not establish a live VLM response or image-analysis persistence/readback.

## Status

- CREATED: transcript drawer UI, title-and-ID export naming, seeded-fixture Playwright test.
- WIRED: drawer uses the existing authorized transcript API and existing cue seek/review/export component.
- PROVEN: focused component tests and scoped whitespace check.
- DONE: no; browser screenshot, live authorized transcript retrieval, and real export response remain unverified.
