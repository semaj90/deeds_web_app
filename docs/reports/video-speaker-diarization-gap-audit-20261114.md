# Speaker-aware video transcript gap audit

Date: 2026-11-14 (America/Los_Angeles)
Repository revision: `a8c0d17c362` (shared worktree contains unrelated uncommitted changes)

## Result

The proposed architecture fits the existing durable evidence pipeline, but speaker inference is not currently wired into its canonical video worker. FFmpeg provides stream probing, decode, audio extraction/resampling, and bounded media preparation. It does not perform VAD, speaker diarization, speech recognition, or forced alignment.

The current `durable-video-analysis-v1.ts` path extracts one mono 16 kHz PCM WAV, then calls `transcribeVideoAudio` once for that file. The transcript helper delegates to the existing `transcribeAudio` implementation and returns timed chunks. No VAD, diarization provider, or word aligner is invoked by this path. Consequently, a `speaker` field or speaker filter in the viewer cannot be treated as evidence that speakers were detected.

## Existing owners to reuse

- FFmpeg and FFprobe helpers: `src/lib/server/features/evidence/video/transcript-service.ts` and the durable video analysis worker.
- Canonical transcript persistence: `audio_transcripts` and `whisper_segments` in `src/lib/server/db/schema-postgres.ts`. `whisper_segments.speaker` exists; `metadata` already carries source and analysis revisions, model and review fields.
- Transcript UI: `src/lib/components/evidence/EvidenceTranscriptPanel.svelte` accepts `speakerId`, displays speaker badges, and filters cues.
- `src/lib/server/evidence/video/longform-video-speaker-ledger-v1.ts` is a separate speaker-ledger/analysis contract. No importer or call from the canonical durable video worker was found in the scoped search.
- Transcript API: `src/routes/api/evidence/[id]/transcript/+server.ts` reads `speakerId` from JSON metadata but does not select the canonical `whisper_segments.speaker` column. Its POST review handler updates only `evidence_transcript_segments`; it does not repeat GET's evidence/case authorization query and does not Zod-validate the request body. Do not enable transcript review until this write route is fixed and cross-case denial is tested.
- The existing transcript-panel unit fixture uses display names such as `Detective Miller`; future inference must instead enforce anonymous `spk_*` IDs and must not accept labels as verified identity.

No new table, queue, or service is justified by this audit. Prefer a bounded window child-work design under the existing durable job owner, and persist through the existing transcript tables unless a concrete schema gap is proven.

## Search evidence and scope

Command:

```text
rg -n "diariz|speaker|voice activity|VAD|Whisper|transcri|audioSegment|audio_transcripts|whisper_segments" src/lib/server/features/evidence/video src/lib/server/db/schema-postgres.ts src/lib/components/evidence/EvidenceViewModal.svelte -g "*.ts" -g "*.svelte"
```

Observed output included `transcript-service.ts:117` (`transcribeVideoAudio`), the durable worker's `dependencies.transcribe(...)` call around lines 625–655, `whisper_segments.speaker` around `schema-postgres.ts:4121`, and the transcript drawer in `EvidenceViewModal.svelte`. The scoped output showed no VAD or diarization call in the canonical worker.

Command:

```text
rg -n "audioTranscripts|whisperSegments|speaker_id|speakerId|speaker_review_required|diarizationRevision|VAD" src/lib/server src/lib/components/evidence -g "*.ts" -g "*.svelte"
```

Observed output found the transcript panel's `speakerId` rendering/filtering and a separate `longform-video-speaker-ledger-v1.ts`; no diarization runtime caller in the durable worker. MCP live retrieval was marked `UNADMITTED_RETRIEVAL_CANDIDATES` with missing source revision and was not used as proof.

## Required implementation gates

1. Build bounded, resumable audio windows with integer sample offsets mapped to source presentation time. Keep the original channel layout and source audio immutable; use mono 16 kHz derivatives only as model inputs.
2. Treat VAD, ASR, diarization, and forced alignment as independent stages with revisioned model/policy identities and visible skipped/unavailable/failure states.
3. Keep speaker IDs anonymous and revision-local (`spk_*`). Preserve overlap and uncertainty; never infer a person's identity from diarization.
4. Persist source hash/revision, processing revision, model revisions, time locator, speaker ID, and review state with each cue. Preserve model output when a reviewer corrects a proposal.
5. Leave the feature gate off until runtime compatibility, persistence/readback, authorization, and viewer seek/export are verified. Secure the current transcript review POST before enabling any correction flow.

## GAN status

- CREATED: OpenSpec follow-up tasks 5.6–5.10 and this gap report.
- WIRED: existing FFmpeg/transcript persistence and transcript-panel owners already provide the integration points; VAD/diarization/alignment are not wired.
- PROVEN: source inspection at revision `a8c0d17c362`; no live inference, database write, or browser proof was performed in this audit.
- DONE: no. A qualified runtime, bounded scheduling, durable speaker attribution, review and authorized end-to-end readback remain open.

## Structured handoff

- likely_cause: The durable worker invokes whole-file transcription only; its existing speaker column and UI affordances have no diarization producer connected to them.
- evidence: `src/lib/server/features/evidence/video/durable-video-analysis-v1.ts`; `src/lib/server/features/evidence/video/transcript-service.ts`; `src/lib/server/db/schema-postgres.ts`; `src/routes/api/evidence/[id]/transcript/+server.ts`; `src/lib/components/evidence/EvidenceTranscriptPanel.svelte`; scoped `rg` output above.
- patch_targets: `sveltekit-frontend/src/lib/server/features/evidence/video/durable-video-analysis-v1.ts`; `sveltekit-frontend/src/lib/server/features/evidence/video/transcript-service.ts`; `sveltekit-frontend/src/lib/server/db/schema-postgres.ts`; `sveltekit-frontend/src/routes/api/evidence/[id]/transcript/+server.ts`; `sveltekit-frontend/src/lib/components/evidence/EvidenceTranscriptPanel.svelte`; `openspec/changes/evidence-analysis-bdd-pipeline/tasks.md`.
- safe_next_command: `git diff --check -- openspec/changes/evidence-analysis-bdd-pipeline/tasks.md docs/reports/video-speaker-diarization-gap-audit-20261114.md`.
- smoke_command: `cd sveltekit-frontend; npm exec -- vitest run src/lib/server/features/evidence/video/__tests__/durable-video-analysis-v1.spec.ts src/lib/components/evidence/EvidenceTranscriptPanel.spec.ts`.
- report_path: `docs/reports/video-speaker-diarization-gap-audit-20261114.md`.
