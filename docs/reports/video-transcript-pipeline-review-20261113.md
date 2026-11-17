# Video and transcript pipeline review — 2026-11-13

**Scope:** Source review of the existing video upload, transcription, visual-analysis, and viewer paths. No database, SeaweedFS, RabbitMQ, model, or GPU work was run. Worktree revision observed: `eadae008484bcf5318071912afd830daa35e6743`.

## Fixed

`video-ingest-service.ts` called `extractAudioTrack()` for every uploaded video and `downloadApprovedVideoSource()` for URL ingestion, but neither function was imported. `@ts-ignore` hid the unresolved names. A file upload could store the original and then fail before transcription. Both existing helpers are now imported from `transcript-service.js`; the suppressions were removed.

## Current path and remaining breaks

| Stage | Current owner/path | Finding |
|---|---|---|
| Video admission | `src/routes/api/evidence/video/ingest/+server.ts` | Authenticates, checks case ownership downstream, parses multipart form and awaits the entire ingestion service in the request. |
| Source storage | `src/lib/server/features/evidence/video/video-ingest-service.ts` | Buffers the complete upload with `File.arrayBuffer()`, hashes it, writes the original to SeaweedFS, then processes inline. |
| Durable job | `evidence_processing_jobs` | The row has status/progress/error/timestamp only. This service creates it as `running`; no lease, fencing token, attempts, outbox event, or durable worker handoff is wired here. |
| Audio extraction/transcription | `transcript-service.ts` → `analysis/media-processing.ts` | FFmpeg creates mono 16 kHz WAV; the Python Whisper shim returns segments that are converted to millisecond ranges and inserted in PostgreSQL. No probe-first audio-stream check or child-process timeout/cancellation was found. `WHISPER_PATH` is read but not used; the Python executable is a relative `.venv` path. |
| Video visual analysis | `workers/video-vlm-processor.ts` | A separate processor extracts frames every two seconds (up to 30) and calls the VLM, but no caller was found. It writes frame files under a local `uploads/video-frames` directory and updates the legacy `evidence` table metadata; no writer to the `evidence_frames` table was found. |
| Transcript vector projection | `video-ingest-service.ts` | Embeds transcript chunks and writes points directly to Qdrant. This is not the canonical PostgreSQL evidence-vector plus projection-outbox path. |
| Read/view | `routes/api/video/analysis/[evidenceId]`, analysis page, `EvidenceViewModal.svelte` | The authorized API and separate video-analysis page can read transcript segments. The evidence modal itself has no transcript fetch/render binding, so selecting a transcript segment cannot yet seek its video there. |
| dHash | `evidence/video/dhash-keyframe-filter-v1.ts` | Helper/tests exist, but the video upload service does not call it. It is not a scene detector in the live ingest path. |

## Verification

- Focused existing video suites: **5 files, 19 tests passed** (upload policy, Qdrant point contract, analysis read model, bounded mapping, dHash filter).
- `git diff --check` passed for the edited service file.
- These tests do not execute the upload service, FFmpeg, Whisper, VLM, PostgreSQL, SeaweedFS, Qdrant, or browser authorization. No end-to-end media result is claimed.

## Next implementation gate

First select/reuse the existing durable job/outbox owner for evidence media and make video admission return a queued job instead of running transcription inside the HTTP request. Bind the worker input to evidence ID, case ID, source SHA-256/revision, and idempotency key; revalidate ownership and source bytes when claimed. Then produce probe metadata, optional audio transcript segments, bounded timestamped frames, and independent PostgreSQL/SeaweedFS readback. Route embeddings through the canonical evidence-vector projection/outbox. Finally wire the authorized transcript/frame read model into the viewer and prove segment-click → exact media timestamp. Keep VLM, embeddings, and GPU work optional stages with separate readiness/results so their failure does not misreport original upload storage.

## Handoff

```yaml
likely_cause: Video upload had undefined extraction/download helper references and currently performs processing inline instead of through a durable worker.
evidence: [video-ingest-service.ts, transcript-service.ts, analysis/media-processing.ts, video-vlm-processor.ts, evidence-multi-modal.ts, api/video/analysis route, EvidenceViewModal.svelte]
patch_targets: [sveltekit-frontend/src/lib/server/features/evidence/video/video-ingest-service.ts]
safe_next_command: "Review existing durable job and outbox contracts for an evidence-media job type before changing the video route."
smoke_command: "cd sveltekit-frontend; npm exec -- vitest run src/lib/server/features/evidence/video/video-upload-policy-v1.spec.ts src/lib/server/features/evidence/video/video-qdrant-point-v1.spec.ts src/lib/server/features/evidence/video/video-analysis-read-model-v1.spec.ts src/lib/server/features/evidence/video/map-bounded-v1.spec.ts src/lib/server/evidence/video/dhash-keyframe-filter-v1.spec.ts"
report_path: docs/reports/video-transcript-pipeline-review-20261113.md
```

**GAN:** CREATED: fixes the missing helper bindings. WIRED: transcription helper imports now resolve in the service source. PROVEN: related contract tests pass, but the modified service is not directly exercised. DONE: no; durable media processing and source-to-viewer end-to-end proof remain open.

## Follow-up runtime and worker-owner check

The existing database-backed analysis worker is a better reuse candidate than a new RabbitMQ queue: `analysis-jobs.ts` provides queued rows, `FOR UPDATE SKIP LOCKED` claiming, and stale-job requeue; `analysis/worker.ts` supplies bounded stage concurrency and heartbeats. Its current `upload_pipeline` stage calls the generic `EvidenceProcessWorker`, so a modality-aware video stage still needs to be wired. This queue currently uses stale-job recovery rather than a fenced lease and is not an upload/outbox atomic commit; those boundaries must be reviewed before relying on it for video.

Environment probe results (no services or models started): Cargo `1.95.0`; installed Rust target only `x86_64-pc-windows-msvc`; `FFMPEG_PATH_CONFIGURED=false`; `FFPROBE_PATH_CONFIGURED=false`; repository has `tools/ffmpeg/ffmpeg.exe` (runs and reports FFmpeg `N-123920-g56b97c03d4-20260412`); the app's `.venv/Scripts/python.exe` exists but `faster_whisper` is unavailable there. No `ffprobe` executable or evidence-media WASM crate was found. Consequently a real Whisper-backed video run cannot pass on this host as currently configured. No Cargo WASM build was attempted because the repository has no media WASM target and it would not supply the missing server worker or Whisper runtime.

Graph dependency lookup for the video service returned `NO_OUTGOING_EDGES`, `graphRevision:null`, and `canonicalAuthority:false`; this was treated as unresolved discovery evidence and not as proof of missing source callers. Direct `rg` inspection confirms the route calls the video service and no source caller invokes `VideoVLMProcessor`.

**Next candidate implementation:** extend the existing analysis worker with a source-revision-bound video stage and keep the upload path's PostgreSQL/job creation transaction and original SeaweedFS object immutable. Before wiring, resolve whether `analysis_jobs` is the admitted owner or whether the existing evidence processing/outbox contract can be extended; do not route video through the library-only `ingestion_jobs` table or introduce a parallel queue. Actual end-to-end acceptance remains blocked until a supported FFmpeg/FFprobe pair and a configured CPU transcription runtime are available.

## Follow-up service-level proof (2026-11-13)

- Video probe failures now fail closed instead of assuming that both audio and video streams exist. A missing video stream is rejected explicitly.
- Silent video skips audio extraction and transcription, while retaining the visual-only result path.
- If analysis fails after source admission, the processing job and admitted evidence row are both marked failed; the original SeaweedFS object is retained.
- Added direct service tests for silent-video completion and FFprobe failure. Focused result: 2 test files passed, 6 tests passed (the 4 existing storyboard/manifest cases plus 2 service cases). Scoped `git diff --check` passed.
- This proves mocked service control flow only. It does not prove FFprobe/FFmpeg execution, durable queue processing, database readback, or browser navigation. The synchronous ingest route and legacy Qdrant transcript write remain unresolved owners.

```yaml
likely_cause: The service assumed streams existed when probing failed and referenced transcript-only state from the silent-video path.
evidence: [sveltekit-frontend/src/lib/server/features/evidence/video/video-ingest-service.ts, sveltekit-frontend/src/lib/server/features/evidence/video/__tests__/video-ingest-service.spec.ts]
patch_targets: [sveltekit-frontend/src/lib/server/features/evidence/video/video-ingest-service.ts, sveltekit-frontend/src/lib/server/features/evidence/video/__tests__/video-ingest-service.spec.ts]
safe_next_command: "Review the existing analysis_jobs admission and outbox contracts before moving video processing out of the request path."
smoke_command: "cd sveltekit-frontend; npm exec -- vitest run src/lib/server/features/evidence/video/__tests__/video-ingest-service.spec.ts src/lib/server/features/evidence/video/__tests__/storyboard-and-video-ingest.spec.ts --reporter=verbose"
report_path: docs/reports/video-transcript-pipeline-review-20261113.md
```

**GAN:** CREATED: fail-closed probe and silent-video handling plus service-level tests. WIRED: existing synchronous video ingest path. PROVEN: mocked service branch tests and focused diff check. DONE: no; durable worker, actual media tools, canonical PostgreSQL analysis/vector ownership, and authorized viewer readback remain open.

## Follow-up: block non-canonical vector publication (2026-11-13)

The legacy video service previously embedded transcript segments and upserted them directly to Qdrant. It now stops before vector publication and returns an explicit `deferred` index status until the source identity is joined to canonical `public.evidence` and the multimodal PostgreSQL outbox. This prevents claiming a vector is indexed when no canonical PG row/outbox receipt exists.

The focused verification run passed 3 files / 10 tests, covering silent video, probe failure, the deferred transcript-index path, and existing manifest / deterministic Qdrant point contracts. The point builder remains as a tested contract but is no longer called by this legacy service. No live media tools, Qdrant calls, database writes, or independent readback were run. The `evidence_items` and `evidence_processing_jobs` tables remain absent from the inspected scratch schema, so these service mocks are not a live-path proof.

```yaml
likely_cause: The legacy service published transcript vectors to Qdrant before canonical PostgreSQL multimodal persistence and outbox ownership were wired.
evidence: [sveltekit-frontend/src/lib/server/features/evidence/video/video-ingest-service.ts, sveltekit-frontend/src/lib/server/features/evidence/video/__tests__/video-ingest-service.spec.ts]
patch_targets:
  - sveltekit-frontend/src/lib/server/features/evidence/video/video-ingest-service.ts
  - sveltekit-frontend/src/lib/server/features/evidence/video/video-ingest-types.ts
  - sveltekit-frontend/src/lib/server/features/evidence/video/__tests__/video-ingest-service.spec.ts
safe_next_command: "Trace the canonical upload route, analysis_jobs claim, and public.evidence readback before wiring video admission."
smoke_command: "cd sveltekit-frontend; npm exec -- vitest run src/lib/server/features/evidence/video/__tests__/video-ingest-service.spec.ts src/lib/server/features/evidence/video/__tests__/storyboard-and-video-ingest.spec.ts src/lib/server/features/evidence/video/video-qdrant-point-v1.spec.ts --reporter=verbose"
report_path: docs/reports/video-transcript-pipeline-review-20261113.md
```
