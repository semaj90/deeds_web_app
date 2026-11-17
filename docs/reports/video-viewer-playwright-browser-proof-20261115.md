# Video Viewer Playwright Browser Proof — 2026-11-15

## Result

Added a development-only route that mounts the real `EvidenceViewModal` and a deterministic two-second WebM fixture. The focused Playwright run passed in Chromium: the native player decoded metadata and dimensions, the transcript cue sought the video to its source-relative timestamp, and Chromium issued a byte-range request answered with `206 Partial Content`. No page errors were observed. I also ran the same browser test against the user's supplied local AV1/Opus WebM (10:14, 1280×720); it decoded and sought successfully. The test reads that file locally and intercepts the request in Playwright; it does not upload it or write evidence records. The screenshot from the deterministic fixture is [here](screenshots/evidence-video-viewer-transcript-20261115.png).

The first fixture was H.264/MP4. This bundled Playwright Chromium could not decode it, so the test uses VP8/WebM, which decoded successfully. That is a browser/runtime compatibility observation, not a claim that every installed Chrome build lacks H.264.

The browser run exposed an initialization race in `EvidenceTranscriptPanel`: when opened with `initialOpen`, it set its open state and immediately checked the stale pre-update value, so the initial transcript request never ran. The component now explicitly loads the transcript in the `initialOpen` branch. After the fix, the deterministic Chromium test passed again, the same test passed against the supplied AV1/Opus WebM, and the transcript component suite passed 7/7.

## What this proves and does not prove

- **PROVEN:** Native HTML media decode, controls, source-time transcript seeking, and byte-range loading for a synthetic WebM fixture. The later live authorized run also exercised real detail, frame, transcript, skim-tile, and range-download endpoints backed by the queued upload and persisted findings.
- **NOT PROVEN:** Production authorization outside this local authorized session, live cross-case denial in this browser run, diarization/word alignment, four-hour scale, or reviewed event publication to scene reconstruction. The dedicated audio-content vector lane remains feature-gated off.
- **PROVEN WITH LIVE FIXTURE:** The opt-in test accepts `PLAYWRIGHT_LIVE_VIDEO_CASE_ID`, `PLAYWRIGHT_LIVE_VIDEO_EVIDENCE_ID`, and optional `PLAYWRIGHT_LIVE_VIDEO_STORAGE_STATE` (or the existing `RELIEF_LIVE_STORAGE_STATE`). This run used the configured local authorized case and evidence.
- OpenSpec tasks 5.1–5.5 remain unchecked. This browser fixture does not satisfy the authorized upload-to-worker-to-durable-readback acceptance gate.

## Pipeline boundary

1. Preserve the uploaded original bytes and source SHA-256 in the existing evidence object store.
2. Queue processing through PostgreSQL `analysis_jobs`; Valkey is an optional cache, not the durable queue or source of truth.
3. Use FFmpeg/FFprobe for bounded probe, frame/skim derivatives, and mono 16 kHz PCM windows; these are app pipeline choices, not faster-whisper prerequisites. The faster-whisper library can decode audio inputs through its bundled PyAV dependencies, but this worker currently invokes external FFmpeg first to demux the video audio stream and normalize it. Persist source timestamps and processing/model revisions with findings.
4. Treat transcript text, frame observations, and optional audio vectors as separate representations. Palette quantization is only for a preview/retro texture derivative; do not quantize the transcription waveform or replace the original video.
5. Join transcript and frame observations into unreviewed, source-cited event proposals. Only reviewed proposals may enter a scene reconstruction, which must remain labeled as a simulation.
6. Serve video through the authorized evidence download route with MIME type and HTTP byte ranges. The browser's `<video controls>` handles normal play/pause/seek; JavaScript is required for the custom transcript-to-player seek and analysis UI.

LZ4, MessagePack, Parquet, DuckDB, and centroid clustering are not needed in the browser playback/dequeue path. LZ4 will not materially compress already-compressed MP4/WebM or WebP. Keep bounded PCM in short-lived worker storage or compress losslessly only if measurement shows a storage/transfer benefit. Use Parquet/DuckDB for offline analytics and MessagePack/Arrow only where an existing bulk transport needs them; do not add a second queue or vector authority.

## Changed files

- `sveltekit-frontend/src/lib/components/evidence/EvidenceViewModal.svelte`
- `sveltekit-frontend/src/lib/components/evidence/EvidenceTranscriptPanel.svelte`
- `sveltekit-frontend/src/routes/(dev)/e2e/video-viewer/+page.server.ts`
- `sveltekit-frontend/src/routes/(dev)/e2e/video-viewer/+page.svelte`
- `sveltekit-frontend/tests/e2e/evidence-video-viewer.spec.ts`
- `sveltekit-frontend/tests/fixtures/evidence-viewer-2s.webm`
- `openspec/changes/evidence-analysis-bdd-pipeline/tasks.md` (status wording only; no task checkbox changed)
- `docs/reports/screenshots/evidence-video-viewer-transcript-20261115.png`

## Validation

- `$env:PLAYWRIGHT_SKIP_GLOBAL_SETUP='true'; npm exec -- playwright test tests/e2e/evidence-video-viewer.spec.ts --project=chromium --reporter=list` — **1 passed, 1 skipped** (live test is opt-in).
- Same focused browser test with `PLAYWRIGHT_VIDEO_FIXTURE_PATH` set to the supplied local WebM — **1 passed**.
- `npm exec -- vitest run src/lib/components/evidence/EvidenceTranscriptPanel.spec.ts` — **7 passed**.
- Current focused browser suite with live case configured — **2 passed** (synthetic fixture and live authorized upload).
- Scoped `git diff --check` — passed.
- No OpenSpec task checkbox was changed.

## Structured handoff

- **likely_cause:** Transcript initialization skipped its first fetch, the WebM signature and safe inline type were missing, and the transcript action was obscured by media-preview hit testing.
- **evidence:** `EvidenceViewModal.svelte`; `EvidenceTranscriptPanel.svelte`; `upload-classification-v1.ts`; `download/+server.ts`; live PostgreSQL job/transcript/vector readback; live screenshot and Playwright response checks.
- **patch_targets:** `sveltekit-frontend/src/lib/components/evidence/EvidenceTranscriptPanel.svelte`; `sveltekit-frontend/src/lib/components/evidence/EvidenceViewModal.svelte`; `sveltekit-frontend/src/lib/styles/evidence-document-modal.css`; `sveltekit-frontend/src/lib/server/ingest/upload-classification-v1.ts`; `sveltekit-frontend/src/routes/api/evidence/[id]/download/+server.ts`; `sveltekit-frontend/tests/e2e/evidence-video-viewer.spec.ts`.
- **safe_next_command:** `git diff --check -- sveltekit-frontend/src/lib/components/evidence/EvidenceViewModal.svelte sveltekit-frontend/tests/e2e/evidence-video-viewer.spec.ts`.
- **smoke_command:** `$env:PLAYWRIGHT_SKIP_GLOBAL_SETUP='true'; $env:PLAYWRIGHT_LIVE_VIDEO_CASE_ID='b8fbe1be-dad0-4986-b51d-b28338acd71a'; $env:PLAYWRIGHT_LIVE_VIDEO_EVIDENCE_ID='0f067235-4957-4783-82a5-ad93bd71daab'; npm exec -- playwright test tests/e2e/evidence-video-viewer.spec.ts --project=chromium --reporter=list`.
- **report_path:** `docs/reports/video-viewer-playwright-browser-proof-20261115.md`.

## Live authorized upload update — 2026-11-15

The optional live path was run with the user-provided `Your Font File Is Secretly a Program.webm` in the existing authorized case. The original file SHA-256 was `f2c64f35ea2b85f8af703988ba16291c38075995c8cbf6150502cd838a04bf03`. The upload created evidence `0f067235-4957-4783-82a5-ad93bd71daab` and durable job `efef9519-cf3d-4630-9e75-b130841d76fe`. The first attempt failed because Node worker-thread cloning changed an image `Buffer` to `Uint8Array`; the worker adapter now restores the buffer type before calling the image encoder. The successful retry completed at 100% with a verified receipt and persisted count 92.

Independent PostgreSQL readback against `legal_ai_db` (PostgreSQL 18.4) found one transcript, 90 timestamped `whisper_segments` spanning 0–619760 ms, 60 `video_frame` vectors and 32 `audio_segment` vectors. The vectors read back at 768 dimensions and their outbox rows use `evidence_multimodal_semantic_768`. The audio-content encoder lane remains feature-gated off; the 32 audio-segment vectors are not proof that the dedicated audio-content representation ran. The authorized frames endpoint returned the source-bound findings and skim manifest, and the authorized skim-tile endpoint returned a JPEG with a SHA-256 ETag.

The live Chromium test now passes against the real detail, frame, transcript, skim-tile, and range-download endpoints. It confirms native media metadata load, at least one `206 Partial Content` range response, seeking to the final skim sample, loading transcript cues, and seeking a cue in the same source video. It captured [the live viewer screenshot](screenshots/evidence-video-viewer-live-20261115.png). The test found that the transcript action inside the media-preview wrapper was not pointer-accessible; it now lives in the modal header.

The authorized download route previously rejected WebM inline playback because signature detection and the safe-inline allowlist omitted `video/webm`. The WebM EBML signature is now recognized and the download route permits signature-validated WebM inline playback. Focused upload-classification and download route tests pass (29/29), and scoped `git diff --check` passes.

**Updated status:**
- **PROVEN:** This local authorized upload completed through the durable queue; transcript and vectors independently read back from PostgreSQL; frame/skim endpoints and SeaweedFS-backed tile readback served; Playwright exercised the real viewer and source-time navigation.
- **Still not proven:** Cross-case denial in this same live browser run; production-auth behavior outside this local authorized session; diarization or word alignment; the separately gated audio-content embedding lane; four-hour scale; reviewed event fusion into scene reconstruction. OpenSpec tasks 5.1–5.5 remain unchecked because their full acceptance scope is broader than this single live journey.

**Faster-Whisper / FFmpeg distinction:** faster-whisper uses PyAV for decoding supported audio inputs, so a system FFmpeg install is not a library prerequisite for transcribing a standalone audio file. This application’s video worker still invokes FFmpeg/FFprobe to inspect the video and extract/normalize its audio before calling the local Python faster-whisper shim. In this configured video path, FFmpeg remains an upstream media-preparation dependency; it is not the speech recognizer.

**Current validation:** live authorized viewer Playwright — 1 passed; upload classification + authorized download route Vitest — 29 passed; scoped whitespace check — passed. The complete suite was not run.

Additional changed paths in this update:
- `sveltekit-frontend/src/lib/server/ingest/upload-classification-v1.ts`
- `sveltekit-frontend/src/lib/server/ingest/upload-classification-v1.spec.ts`
- `sveltekit-frontend/src/routes/api/evidence/[id]/download/+server.ts`
- `sveltekit-frontend/src/routes/api/evidence/[id]/download/download.route.spec.ts`
- `sveltekit-frontend/src/lib/styles/evidence-document-modal.css`
- `docs/reports/screenshots/evidence-video-viewer-live-20261115.png`
