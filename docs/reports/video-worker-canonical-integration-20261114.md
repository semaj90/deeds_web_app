# Video worker canonical integration — 2026-11-14

## Scope

Wired the existing asynchronous `analysis_jobs.upload_pipeline` video path to a canonical video-analysis processor. The change targets the duplicate-write defect where the worker re-entered synchronous `ingestVideoEvidence()` and could create a legacy `evidence_items` row after the original was already admitted to `public.evidence`.

## Implemented

- Reuses the existing evidence-case ownership helper and rechecks the canonical evidence ID, case ID, SHA-256 source revision, and soft-delete state before media work and again inside the PostgreSQL persistence transaction.
- Probes the source before audio work. Silent video skips extraction and transcription; extraction/transcription failures are recorded as partial analysis while video sampling proceeds.
- Samples at most 60 frames at 1 fps, stores FFmpeg `showinfo` presentation timestamps, and records the bounded coverage window rather than claiming full-video coverage.
- Reuses the existing YOLO service only when the model runtime is available and the model artifact SHA-256 can be established. Boxes are mapped from each extracted frame's measured dimensions (Sharp metadata) to source-frame pixels; outputs stay `UNREVIEWED_PROPOSAL`.
- Stores derived mono 16 kHz audio and extracted JPEG frames in the existing `atlas-artifacts` bucket. Stable keys include case, evidence, source hash, and job ID. PostgreSQL manifests record artifact key, byte hash, content type, dimensions where applicable, source revision, and analysis revision. Each artifact write is checked with the existing SeaweedFS stat/readback helper; audio is size-checked before buffering (512 MiB cap).
- Saves transcript revisions and segments to the existing `audio_transcripts` and `whisper_segments` tables, idempotently keyed by analysis job ID. Saves frame analysis in the existing canonical `evidence.ai_analysis` JSONB field. No legacy `evidence_items`/`evidence_frames` writer or direct Qdrant write is used.
- Exposes source-revision-matched transcript rows through the authorized transcript endpoint and frame proposals through the authorized frames endpoint. The video viewer displays source boxes, model revision, and transcript provenance; transcript cues seek the original video.
- Adds five implementation follow-up tasks to the OpenSpec ledger. The original 56 BDD tasks still describe mocked contract coverage and are not implementation completion.

## Verification

- Focused Vitest run after artifact storage, artifact readback checks, and video worker routing: 10 files, 52 passed, 1 skipped. Includes an adversarial mismatched-artifact-size probe and a test that video jobs bypass document extraction and call the canonical video stage.
- Targeted syntax transpilation and Svelte client compilation after the final edits: 12 TypeScript files and 2 Svelte components passed. This is syntax/compile evidence, not a full Svelte type check.
- `npm run check:fast` emitted OpenTelemetry startup output and the Vite root warning but did not produce a check summary; it was interrupted. Type/Svelte check remains unverified.
- Scoped `git diff --check` passed; Git printed only line-ending conversion warnings.
- No real FFmpeg/FFprobe/Whisper/YOLO media job was run. No PostgreSQL, SeaweedFS, Valkey, or Qdrant writes/readbacks were performed.

## Open gates

- Verify the installed target database has the canonical transcript tables, then prove transactional write/readback against a disposable PostgreSQL 18 database.
- Exercise FFmpeg `showinfo` timestamp extraction with variable-frame-rate and non-zero stream-start fixtures; current tests mock extracted frame timestamps.
- Verify the current worker job record actually carries the user ID and source metadata, and run a single synthetic video through SeaweedFS plus the durable worker.
- Add authorized reviewer-decision persistence for canonical transcript/frame proposals. The existing transcript POST review path still targets a legacy table and was not changed here.
- Implement and read back EmbeddingGemma video/audio vectors through the canonical PostgreSQL multimodal vector writer/outbox; this worker does not generate those vectors yet.
- No existing reusable still-image pixel quantizer/CI4/CI8 asset compiler was found. Do not substitute vector quantization or the glyph-only CHR builder; the format-specific display derivative remains a separate implementation gap.
- Add Playwright browser validation for transcript open/seek/export and frame selection against a real authorized synthetic fixture.
- A transcript-drawer Playwright screenshot test already exists at `sveltekit-frontend/tests/e2e/evidence-video-transcript.spec.ts`; it requires a seeded authorized case/evidence ID. The prior configured run timed out before browser execution, so it produced no screenshot. It still does not cover selecting a persisted frame finding.

```yaml
likely_cause: The durable upload worker reused the synchronous video importer, which created a second legacy evidence identity instead of processing the already admitted canonical evidence row.
evidence: [sveltekit-frontend/src/lib/server/queue/queue-worker.ts, sveltekit-frontend/src/lib/server/features/evidence/video/durable-video-analysis-v1.ts, sveltekit-frontend/src/lib/server/features/evidence/video/vision-service.ts, sveltekit-frontend/src/routes/api/evidence/[id]/transcript/+server.ts, sveltekit-frontend/src/routes/api/evidence/[id]/frames/+server.ts]
patch_targets:
  - sveltekit-frontend/src/lib/server/queue/queue-worker.ts
  - sveltekit-frontend/src/lib/server/features/evidence/video/durable-video-analysis-v1.ts
  - sveltekit-frontend/src/lib/server/features/evidence/video/vision-service.ts
  - sveltekit-frontend/src/routes/api/evidence/[id]/transcript/+server.ts
  - sveltekit-frontend/src/routes/api/evidence/[id]/frames/+server.ts
safe_next_command: "cd sveltekit-frontend; npm exec -- vitest run src/lib/server/features/evidence/video/__tests__/durable-video-analysis-v1.spec.ts src/lib/server/features/evidence/video/ffmpeg-presentation-timestamps-v1.spec.ts src/lib/server/evidence/analysis-upload-pipeline-v1.spec.ts"
smoke_command: "Run one synthetic admitted video through the existing upload_pipeline worker and independently read back the evidence.ai_analysis, audio_transcripts, and whisper_segments rows by evidence ID and source revision."
report_path: docs/reports/video-worker-canonical-integration-20261114.md
```

**GAN:** CREATED: canonical video worker processor and revision-qualified readback. WIRED: existing upload worker, video frames endpoint, transcript panel/export path. PROVEN: mocked orchestration/persistence-boundary tests and focused contract suites; no media runtime or DB readback. DONE: no.
