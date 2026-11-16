# Video Event Fusion Implementation — 2026-11-15

## Change

Added a source-bound event observation timeline to the existing canonical video worker. The worker combines its already-persisted transcript segments, frame detections, and OCR observations into deterministic ten-second display windows. Every observation reference carries its evidence source revision and either a canonical transcript locator or a frame timestamp, derivative digest, and model revision.

The event text is deliberately a deterministic join of source observations. It does not use an LLM to infer actions, people, causality, intent, or legal conclusions. Timeline order is marked as display order only. All generated events start as `UNREVIEWED_PROPOSAL` and `NOT_ADMITTED`.

The timeline is stored inside the existing `evidence.ai_analysis.videoAnalysis` JSONB owner in the same source-revision-checked transaction as video findings. The existing canonical readback now validates the event timeline against the generated proposal. An authorized API returns only a timeline whose evidence ID, current source revision, and analysis revision match. A review endpoint and the existing evidence viewer transcript drawer expose seekable events; review writes use the existing `EVIDENCE_TRANSCRIPT_REVIEW_ENABLED` gate and recheck the source revision and evidence authorization. Approval only marks an event `APPROVED_FOR_SCENE_PROPOSAL`; it does not create scene geometry or trigger a reconstruction.

## Runtime choice

No new packages or inference sidecars are required for this step. TypeScript/Node is the right owner for joining canonical PostgreSQL records, revision validation, and authorized SvelteKit APIs. FFmpeg remains the media preprocessing owner, and the existing Python Whisper shim remains the transcription owner. Python diarization is a separate future stage. OpenCV does not identify speakers, and a C++ Node-API addon would not improve this database-oriented fusion step.

## Status

- **CREATED:** Zod-validated, deterministic video event timeline contract and fusion helper.
- **WIRED:** Canonical video worker persistence, authorized event read/review API, and evidence viewer timeline with seek controls.
- **PROVEN:** Scoped `git diff --check` passed. No unit test, type check, browser run, live media job, PostgreSQL concurrency test, or authorization readback was run for this change.
- **DONE:** No. The accepted-event to real scene reconstruction adapter remains open. The existing courtroom project is fixture-scoped, and its storyboard facts require a frame dHash that the canonical video worker does not currently store. Do not treat approved proposals as a reconstructed event or as evidence findings.

## Files changed

- `sveltekit-frontend/src/lib/server/features/evidence/video/video-event-fusion-v1.ts`
- `sveltekit-frontend/src/lib/server/features/evidence/video/durable-video-analysis-v1.ts`
- `sveltekit-frontend/src/routes/api/evidence/[id]/frames/+server.ts`
- `sveltekit-frontend/src/routes/api/evidence/[id]/video-events/+server.ts`
- `sveltekit-frontend/src/lib/components/evidence/EvidenceVideoEventTimeline.svelte`
- `sveltekit-frontend/src/lib/components/evidence/EvidenceViewModal.svelte`

## Follow-up validation

- Safe next command: `git diff --check -- sveltekit-frontend/src/lib/server/features/evidence/video/video-event-fusion-v1.ts sveltekit-frontend/src/lib/server/features/evidence/video/durable-video-analysis-v1.ts sveltekit-frontend/src/routes/api/evidence/[id]/video-events/+server.ts sveltekit-frontend/src/lib/components/evidence/EvidenceVideoEventTimeline.svelte`
- Smoke command: `cd sveltekit-frontend; npm exec -- vitest run src/lib/server/features/evidence/video/__tests__/durable-video-analysis-v1.spec.ts` (existing worker coverage; a dedicated event-fusion/review-route spec still needs to be added before claiming feature-level test proof).
- Browser/live acceptance still needs an authorized seeded video, enabled review gate, live worker, PostgreSQL readback, and viewer seek/reload proof.
