# Tasks: Evidence Analysis BDD Pipeline & Case-to-Analysis Journey

Status: IN PROGRESS (BDD scenarios verified; live/runtime gates remain)
Target: 56/56 Executable BDD Scenarios Verified across 4 Feature Suites

## 1. Durable Media Processing (`media-analysis-durable-pipeline.feature`, 18 Scenarios)
- [x] 1.1 Admission records verified source before analysis starts (`media-analysis-durable-pipeline.feature:10-20`) — Covered in `tests/bdd/media-analysis-durable-pipeline.spec.ts`
- [x] 1.2 Repeating admission request with idempotency key does not create duplicate evidence/jobs (`media-analysis-durable-pipeline.feature:21-26`) — Covered in `tests/bdd/media-analysis-durable-pipeline.spec.ts`
- [x] 1.3 Cross-case upload rejected before storage or processing (`media-analysis-durable-pipeline.feature:27-32`) — Covered in `tests/bdd/media-analysis-durable-pipeline.spec.ts`
- [x] 1.4 Worker rechecks authorization and source revision when claiming job (`media-analysis-durable-pipeline.feature:33-39`) — Covered in `tests/bdd/media-analysis-durable-pipeline.spec.ts`
- [x] 1.5 Media probe has bounded time and handles malformed input (`media-analysis-durable-pipeline.feature:40-46`) — Covered in `tests/bdd/media-analysis-durable-pipeline.spec.ts`
- [x] 1.6 Silent video skips audio extraction and continues visual analysis (`media-analysis-durable-pipeline.feature:47-53`) — Covered in `tests/bdd/media-analysis-durable-pipeline.spec.ts`
- [x] 1.7 Audio-bearing video produces source-timed transcript segments (`media-analysis-durable-pipeline.feature:54-60`) — Covered in `tests/bdd/media-analysis-durable-pipeline.spec.ts`
- [x] 1.8 Standalone audio produces transcript linked to original recording (`media-analysis-durable-pipeline.feature:61-67`) — Covered in `tests/bdd/media-analysis-durable-pipeline.spec.ts`
- [x] 1.9 Transcript correction preserves model output and audio locator (`media-analysis-durable-pipeline.feature:68-73`) — Covered in `tests/bdd/media-analysis-durable-pipeline.spec.ts`
- [x] 1.10 Unavailable analysis model cannot produce fabricated success (`media-analysis-durable-pipeline.feature:74-80`) — Covered in `tests/bdd/media-analysis-durable-pipeline.spec.ts`
- [x] 1.11 Transcription timeout does not stall other eligible video stages (`media-analysis-durable-pipeline.feature:81-87`) — Covered in `tests/bdd/media-analysis-durable-pipeline.spec.ts`
- [x] 1.12 Frame sampling is deterministic and stays within declared budget (`media-analysis-durable-pipeline.feature:88-94`) — Covered in `tests/bdd/media-analysis-durable-pipeline.spec.ts`
- [x] 1.13 Frame sampling cancellation records omissions and releases worker lease (`media-analysis-durable-pipeline.feature:95-100`) — Covered in `tests/bdd/media-analysis-durable-pipeline.spec.ts`
- [x] 1.14 Modality stages are independently retryable with CPU fallback (`media-analysis-durable-pipeline.feature:101-106`) — Covered in `tests/bdd/media-analysis-durable-pipeline.spec.ts`
- [x] 1.15 Stored frame derivatives can be independently read back (`media-analysis-durable-pipeline.feature:107-112`) — Covered in `tests/bdd/media-analysis-durable-pipeline.spec.ts`
- [x] 1.16 Worker interruption recovers without duplicate findings or lost progress (`media-analysis-durable-pipeline.feature:113-118`) — Covered in `tests/bdd/media-analysis-durable-pipeline.spec.ts`
- [x] 1.17 Object-store or database readback failure blocks successful completion (`media-analysis-durable-pipeline.feature:119-125`) — Covered in `tests/bdd/media-analysis-durable-pipeline.spec.ts`
- [x] 1.18 Exhausted retries are quarantined without discarding evidence (`media-analysis-durable-pipeline.feature:126-137`) — Covered in `tests/bdd/media-analysis-durable-pipeline.spec.ts`

## 2. Image & Video Findings (`evidence-image-and-video-findings.feature`, 11 Scenarios)
- [x] 2.1 Image finding points to original image region (`evidence-image-and-video-findings.feature:10-16`) — Covered in `tests/bdd/evidence-image-and-video-findings.spec.ts`
- [x] 2.2 Document citation resolves to exact page and text span (`evidence-image-and-video-findings.feature:17-23`) — Covered in `tests/bdd/evidence-image-and-video-findings.spec.ts`
- [x] 2.3 Video detection maps box back to source-frame coordinates (`evidence-image-and-video-findings.feature:24-30`) — Covered in `tests/bdd/evidence-image-and-video-findings.spec.ts`
- [x] 2.4 Generic person label does not identify a person (`evidence-image-and-video-findings.feature:31-36`) — Covered in `tests/bdd/evidence-image-and-video-findings.spec.ts`
- [x] 2.5 Face detection does not perform identity matching (`evidence-image-and-video-findings.feature:37-43`) — Covered in `tests/bdd/evidence-image-and-video-findings.spec.ts`
- [x] 2.6 dHash is shown only as a frame-similarity clue, never proof (`evidence-image-and-video-findings.feature:44-50`) — Covered in `tests/bdd/evidence-image-and-video-findings.spec.ts`
- [x] 2.7 VLM OCR and captions remain reviewable proposals (`evidence-image-and-video-findings.feature:51-57`) — Covered in `tests/bdd/evidence-image-and-video-findings.spec.ts`
- [x] 2.8 VLM frame selection respects combined input budget (`evidence-image-and-video-findings.feature:58-64`) — Covered in `tests/bdd/evidence-image-and-video-findings.spec.ts`
- [x] 2.9 Reviewer decision is recorded separately from model output (accept/reject/correct) (`evidence-image-and-video-findings.feature:65-77`) — Covered in `tests/bdd/evidence-image-and-video-findings.spec.ts`
- [x] 2.10 Behavioral annotations describe observable actions only (`evidence-image-and-video-findings.feature:78-83`) — Covered in `tests/bdd/evidence-image-and-video-findings.spec.ts`
- [x] 2.11 Selecting timeline result seeks to source presentation time (`evidence-image-and-video-findings.feature:84-89`) — Covered in `tests/bdd/evidence-image-and-video-findings.spec.ts`

## 3. Indexing & Readback (`evidence-analysis-indexing-and-readback.feature`, 13 Scenarios)
- [x] 3.1 Analysis metadata reconciled before multimodal vectors written (`evidence-analysis-indexing-and-readback.feature:9-15`) — Covered in `tests/bdd/evidence-analysis-indexing-and-readback.spec.ts`
- [x] 3.2 Vector projection follows canonical database and outbox path (`evidence-analysis-indexing-and-readback.feature:16-22`) — Covered in `tests/bdd/evidence-analysis-indexing-and-readback.spec.ts`
- [x] 3.3 Search returns only authorized current evidence with exact locators (`evidence-analysis-indexing-and-readback.feature:23-29`) — Covered in `tests/bdd/evidence-analysis-indexing-and-readback.spec.ts`
- [x] 3.4 Rights-cleared exhibit traceable from admission to search (doc/img/audio/video) (`evidence-analysis-indexing-and-readback.feature:30-45`) — Covered in `tests/bdd/evidence-analysis-indexing-and-readback.spec.ts`
- [x] 3.5 Unauthorized search does not disclose evidence or cached results (`evidence-analysis-indexing-and-readback.feature:46-51`) — Covered in `tests/bdd/evidence-analysis-indexing-and-readback.spec.ts`
- [x] 3.6 Cached bundles isolated by source and analysis revision (`evidence-analysis-indexing-and-readback.feature:52-58`) — Covered in `tests/bdd/evidence-analysis-indexing-and-readback.spec.ts`
- [x] 3.7 Search projections reject stale source and model revisions (`evidence-analysis-indexing-and-readback.feature:59-64`) — Covered in `tests/bdd/evidence-analysis-indexing-and-readback.spec.ts`
- [x] 3.8 Approximate retrieval evaluated against exact source-grounded results (`evidence-analysis-indexing-and-readback.feature:65-71`) — Covered in `tests/bdd/evidence-analysis-indexing-and-readback.spec.ts`
- [x] 3.9 TurboQuant and TurboVec candidates use same retrieval evaluation (`evidence-analysis-indexing-and-readback.feature:72-78`) — Covered in `tests/bdd/evidence-analysis-indexing-and-readback.spec.ts`
- [x] 3.10 Dataset lineage required before evaluation or training use (`evidence-analysis-indexing-and-readback.feature:79-85`) — Covered in `tests/bdd/evidence-analysis-indexing-and-readback.spec.ts`
- [x] 3.11 Behavioral-event model evaluation preserves held-out source separation (`evidence-analysis-indexing-and-readback.feature:86-92`) — Covered in `tests/bdd/evidence-analysis-indexing-and-readback.spec.ts`
- [x] 3.12 Authorized initial state and later access revocation respected (`evidence-analysis-indexing-and-readback.feature:93-100`) — Covered in `tests/bdd/evidence-analysis-indexing-and-readback.spec.ts`
- [x] 3.13 Viewer texture levels never replace source pixels for analysis or export (`evidence-analysis-indexing-and-readback.feature:101-108`) — Covered in `tests/bdd/evidence-analysis-indexing-and-readback.spec.ts`

## 4. Case-to-Analysis Journey (`case-evidence-analysis.feature`, 14 Scenarios)
- [x] 4.1 Newly created case opens its overview (`case-evidence-analysis.feature:9-14`) — Covered in `tests/bdd/case-evidence-analysis.spec.ts`
- [x] 4.2 Empty case guides user to add evidence (`case-evidence-analysis.feature:15-20`) — Covered in `tests/bdd/case-evidence-analysis.spec.ts`
- [x] 4.3 Open analysis for uploaded exhibit (`case-evidence-analysis.feature:21-27`) — Covered in `tests/bdd/case-evidence-analysis.spec.ts`
- [x] 4.4 Processing progress survives page refresh (`case-evidence-analysis.feature:28-36`) — Covered in `tests/bdd/case-evidence-analysis.spec.ts`
- [x] 4.5 Processing progress resumes after stream disconnect (`case-evidence-analysis.feature:37-43`) — Covered in `tests/bdd/case-evidence-analysis.spec.ts`
- [x] 4.6 Silent video analyzed without starting transcription (`case-evidence-analysis.feature:44-50`) — Covered in `tests/bdd/case-evidence-analysis.spec.ts`
- [x] 4.7 Video findings and transcript navigate to source time (`case-evidence-analysis.feature:51-58`) — Covered in `tests/bdd/case-evidence-analysis.spec.ts`
- [x] 4.8 Object detections do not claim person identity (`case-evidence-analysis.feature:59-65`) — Covered in `tests/bdd/case-evidence-analysis.spec.ts`
- [x] 4.9 Investigator reviews model finding (`case-evidence-analysis.feature:66-72`) — Covered in `tests/bdd/case-evidence-analysis.spec.ts`
- [x] 4.10 Source revision change makes earlier analysis stale (`case-evidence-analysis.feature:73-79`) — Covered in `tests/bdd/case-evidence-analysis.spec.ts`
- [x] 4.11 Cached analysis cannot cross source revisions (`case-evidence-analysis.feature:80-85`) — Covered in `tests/bdd/case-evidence-analysis.spec.ts`
- [x] 4.12 Stored evidence remains available when analysis fails (`case-evidence-analysis.feature:86-93`) — Covered in `tests/bdd/case-evidence-analysis.spec.ts`
- [x] 4.13 Retry resumes safely after worker interruption (`case-evidence-analysis.feature:94-100`) — Covered in `tests/bdd/case-evidence-analysis.spec.ts`
- [x] 4.14 Case authorization enforced when opening analysis (`case-evidence-analysis.feature:101-105`) — Covered in `tests/bdd/case-evidence-analysis.spec.ts`

## Handoff — next steps (2026-11-13, verified read-only unless stated)

Owner note: this change is the evidence-upload / image-video-analysis lane. `courtroom-upload-story-pipeline` is the courtroom-simulation lane; its Stage 1/2 checklist overlaps tasks 1.x, 2.x and 3.x here, so work and status for these items belong HERE. Do not keep two status copies.

**Done and committed (evidence markup/annotation revision save, relates to 2.x review and 3.7):** commit `1639ad65342` (not pushed). Patches: markup-revision insert rechecks parent hash, case and soft-delete inside the row lock; failure cleanup no longer deletes a content-addressed object a committed revision references; multipart body is size-capped while streaming (413 with no content-length). Specs: revision service 16 + versions route 17 passed (33/33). Not run since the last edit: `npm run check` (native checker OOM-crashed at ~2.6 GB free RAM). Review finding 4 (audit attribution: `changed_by` stays NULL, actor in metadata) is the documented design, still open for the audit log.

**Facts that gate 3.1, 3.2, 3.9, 3.13:**
- Qdrant runs 1.19.0. 1.20 (2026-10-22) adds `turbo8`/`turbo16` datatypes chosen at collection CREATION: no in-place conversion; adoption = new collection re-upserted from Postgres (https://qdrant.tech/blog/qdrant-1.20.x/). The upgrade is a datastore image change: human-only, needs a fresh snapshot (existing set is 2026-08-26), pinned digest, C: headroom (3.2 GB free at measurement).
- EmbeddingGemma 2: 8,192-token window shared by text/code/image/video/audio, one 768-d space, MRL 512/256/128 (128-d multimodal about 75%), bfloat16/float32 only (https://developers.googleblog.com/embeddinggemma-2-the-developer-guide/). No evidence its vectors are comparable to canonical v1 `semantic_768`: NEW representation lane (own representation_id + collection), v1 stays canonical until parity/eval.
- Scalar int8 quantization (`quantile 0.99`, `always_ram:false`) is ALREADY on every evidence-side Qdrant collection (verified 2026-11-13): `evidence_items` (394 pts, named `content` 768/Cosine), `evidence_vectors` (0), `legal_documents` (8), `legal_canon_chunks` (0), `case_chunks` (0), `audio_segments` (0), `document_knowledge_768` (0), `chunks_web_search` (11). It was also applied to the three code-lane collections (QDRANT-QUANTIZE-01 in `parent-atlas-ace-bitfrost-cache-correctness/tasks.md`; disk +~80 MB: it buys RAM/speed, not space). Correction: an earlier version of this bullet called quantization "not an evidence collection"; that was wrong, evidence collections are in scope.
- `evidence_vectors` / outbox CHECKs are text-only; see the canonical multimodal decision and PG-first writer slice in `implementation-progress.md`. `evidence_vectors` and `evidence_items` Qdrant collections are currently empty / 394 points (mirrors, rebuildable).

**Next steps, in order (none approved or executed past the items marked done):**
1. Finish 3.1/3.2 on the PG-first writer slice already in `implementation-progress.md`: separate modality-aware PG18 `vector(768)` owner + linked outbox, rolled-back disposable-PG18 rehearsal, then the leased projector with readback receipt. Reconcile the `evidence` vs `evidence_items` identity boundary first.
2. Decide the EmbeddingGemma 2 lane: pick representation_id, run a parity check against v1 on a fixed authorized candidate set (tie-aware recall, per CLAUDE.md), keep v1 canonical.
3. Free C: headroom (outside-Docker items in DOCKER-DISK-PRESSURE-01), snapshot the Qdrant collections, then the operator upgrades Qdrant to 1.20.
4. Create the EG2 turbo-datatype collection; benchmark turbo8/turbo16 vs the repo TurboVec challenger on the SAME candidate set with Recall@K/MRR/latency (3.8, 3.9). No cutover before that.
5. 3.13 dual-read re-index only after 3 and 4 pass. Browser acceptance (17B.12 equivalent) needs an authenticated storage state and an authorized disposable job; the BDD suite today stubs APIs and proves no live path.

**Blockers / human-only:** Docker engine was hung (restart is human-only); `analysis_job_events` migration unapplied in the live DB; Qdrant upgrade; any deletion of the August snapshots (archive with manifest + SHA-256 first). The keyless 49,493-point question in `codebase_chunks_768` (QDRANT-DUP-CENSUS-01) is code-index, not evidence, and does not block this lane.

### Quantization and TurboVec requirements (evidence analysis)
Evidence upload covers image analysis AND document analysis (plus video/audio); quantization and TurboVec evaluation must cover all of them, not only video frames.
- **Current state (measured 2026-11-13):** evidence semantic vectors barely exist yet: `evidence_items` 394 pts, `evidence_vectors` 0, `audio_segments` 0, `case_chunks` 0; PG `evidence_vectors` / outbox are text-only (Stage 2A). Image-frame, document-page and audio vectors are not written anywhere yet, so there is nothing to quantize or benchmark for them until 3.1/3.2 land.
- **TurboVec today touches evidence only through perceptual hashing:** `crates/turbovec-napi` `computeDhash64` / `batchHammingSearchTopK` in `dhash-keyframe-filter-v1.ts` and `vision-service.ts` (frame dedup), plus `evidence-canvas-dhash-mcp-tools-v1.ts`. The semantic TurboVec index (:8791, 128-d MRL, built from `codebase_chunk_index`) is code-corpus only and does NOT include evidence vectors.
- **Requirement R1 (all modalities, one lane):** image frame, document page/chunk, audio segment and video-frame vectors go through the same PG-first writer + outbox, with a modality field, so one evaluation covers them.
- **Requirement R2 (quantization candidates, same fixture):** compare (a) float32 baseline, (b) current scalar int8, (c) Qdrant 1.20 `turbo8`/`turbo16` (new collection; datatype fixed at creation), (d) TurboVec challenger (128-d MRL or other, built from the PG rows via the evidence path, not the code corpus) on the SAME authorized candidate set, tie-aware Recall@K / MRR / latency, per modality. Exact PG cosine is the oracle. Pass thresholds are not set yet: record them before running. Covers 3.8 and 3.9.
- **Requirement R3 (boundaries):** TurboVec is a challenger (no RRF vote, no identity, no writes); Qdrant stays a rebuildable projection; document vectors keep `source_ref` + `sourceRevision` + page/char locators, image vectors keep frame timestamp / source coordinates. Embedding model for these lanes (v1 text-only vs EmbeddingGemma 2) is the pending decision in step 2 above.
- **Not started:** none of R1-R3 is implemented or measured.

## Implementation follow-up — canonical video worker

The BDD tasks above prove UI/API contracts with mocks. These implementation items track the real media worker and must not be inferred complete from the BDD suite.

- [ ] 5.1 Route `upload_pipeline` video jobs through a source-revision-checked processor without creating a second legacy `evidence_items` record.
- [ ] 5.2 Probe video before audio work; persist transcript revisions and segments idempotently in canonical `audio_transcripts` / `whisper_segments`, including silent-video skip status.
- [ ] 5.3 Persist bounded frame findings against canonical evidence with presentation timestamps, original-frame coordinates, detector artifact revision, and unreviewed proposal state.
- [ ] 5.4 Read canonical video findings and transcript through authorized APIs; connect timeline selections and transcript export to the same source revision.
- [ ] 5.5 Prove one synthetic video job through PostgreSQL/SeaweedFS readback and authorized viewer navigation; report unavailable media/model runtimes separately.

Implementation note (2026-11-14): the worker has a bounded EmbeddingGemma 2 frame/transcript vector stage through the existing PostgreSQL multimodal writer and projection outbox. A rollback-only PostgreSQL 18 media integration test passes with real FFprobe/FFmpeg extraction, YOLO, EmbeddingGemma image/transcript embeddings, and independent frame/transcript/vector/outbox readback. It injects transcript text and uses a test artifact adapter; it does not prove Whisper, SeaweedFS, a real queued upload job, committed persistence, or authorized viewer navigation. Tasks 5.1–5.5 remain unchecked until those runtime boundaries are proven together. The earlier Vite generated-module error is not currently reproducible: the module and login route return 200 and a headless browser reports no failed requests or console/page errors.

Transcript readback follow-up (2026-11-16): the opt-in media integration now sends FFmpeg-extracted audio to the loopback faster-whisper `base` CPU/int8 worker with `word_timestamps=true`, persists the returned word intervals in the existing `whisper_segments.metadata` JSONB, and asserts the transcript's case/evidence/job IDs, language, full text, configured model, segment order/text/times, source/analysis revisions, review state, and word timings on PostgreSQL readback. The run passed against PostgreSQL 18 database `legal_ai_live_integration_scratch` inside a transaction and verified rollback; audio embedding was enabled only by fixture dependency injection. This is real clip/ASR/DB worker proof, not a live authorized queue/upload, SeaweedFS write, fresh-connection readback, or viewer authorization proof. Keep tasks 5.1–5.5 unchecked.

Word-timing viewer follow-up (2026-11-16): the case-authorized transcript GET now returns only validated word intervals within each source-bound segment, and the existing Evidence Transcript drawer renders each word as a seek control to its source-relative timestamp. Invalid/out-of-segment metadata is ignored. Route and component tests cover filtering and seeking; this is fixture proof, not a live authorized browser/database run. The transcript and annotation UI still labels machine output as unreviewed; no automatic event or scene promotion is performed.

Image/video runtime note (2026-11-14): current opt-in probes prove the installed `yolov8n.onnx` detector can find 3 people and 1 bus on the known image when `YOLO_PYTHON` points to Python 3.13, and prove the actual Q8 EmbeddingGemma 2 image encoder can write/read a 768-D PostgreSQL vector plus projection-outbox row inside a rollback-only scratch transaction. The video integration separately proves real FFmpeg/FFprobe, YOLO, EmbeddingGemma, and PostgreSQL frame/transcript/vector/outbox readback in rollback-only mode. These are separate stage proofs, not one upload-to-viewer run. A full ignored-file search of both model folders found only `sveltekit-frontend/models/yolov8n.onnx`; no Apache YOLOv10 or DocLayout model is present, so this detector bundle is not production-ready. The 8095 sidecar is reachable and has `/analyze`, but no `/analyze/frame` route; the durable video worker does not call it and does not write `evidence_frames`. No `yolov10n.onnx` is installed; the default `python` is 3.14.7 without ONNX Runtime; `.env` still has `FFMPEG_PATH` and `WHISPER_PATH` set to `REPLACE_ME`; FFprobe is only present in a temporary directory, not configured; port 8090 is closed and Ollama on 11434 has EmbeddingGemma 2 and Granite-Docling but no Ornith model. Keep all live pipeline tasks unchecked pending real worker, SeaweedFS, Whisper/VLM, authorized UI and independent readback proof.

YOLO license follow-up (2026-11-14): the official THU-MIG YOLOv10 v1.1 release includes an 8.95 MB `yolov10n.onnx`, but THU-MIG marks the repository AGPL-3.0 and the ONNX community model card labels the weights AGPL-3.0. Do not describe that release as Apache-2.0. `yolo.ts` keeps YOLOv10 available for local evaluation, excludes YOLOv8 from auto-resolution, and fails production admission for YOLOv8, YOLOv10, and unknown model filenames. Added the pinned YOLOX-Nano Apache-2.0 ONNX artifact (3,659,407 bytes, SHA-256 `c789161ed43c8269fcd4e67c67eeeb4e80c622da2eb296a20bc6007bd18a0b7d`) to the existing ignored model folder. The runtime now handles its 416×416 / 3549×85 format and production admission requires a matching `YOLO_MODEL_SHA256`. A real local CPU fixture returned person and bus detections; focused model-admission and real detector tests passed (14/14). This does not establish a production configuration, durable upload, or authorized image-result readback.

YOLO/video follow-up verification (2026-11-14): confirmed `assertProductionYoloModelAdmission` was already present and covers explicit production overrides; the follow-up did not add a duplicate gate. Verified the ignored YOLOX-Nano artifact still matches the pinned SHA-256. Fixed the scoped media typing issues and aligned the transcript-stream fixture with FFprobe's `codecType` contract. Final focused run: 4 files, 31 passed, 1 skipped; scoped `git diff --check` passed. `npm run check` now reports 3 remaining errors and 11 warnings in 6 files, all outside the server image/video patch (OPFS browser typing and NES/FSM typing). Live authorized upload, SeaweedFS/Whisper, and viewer readback remain open; do not mark implementation tasks complete.

- **Existing EmbeddingGemma 2 owner (found 2026-11-13, do not duplicate):** `openspec/changes/parent-atlas-agent-framework-integration-hardening/tasks.md` item 8.5 (EG2 `google/embeddinggemma-2` is distinct from EG1 `embeddinggemma-300m`; do not retarget `semantic_768` until runtime support, checksum, task convention, vector parity and retrieval evaluation are proven) and section 9 "Phase 23 EmbeddingGemma 2 Runtime Evaluation" (9.6: map the existing Whisper/Docling speech pipeline before audio embeddings; do not replace transcription or video analysis with EG2). Step 2 above should extend that evaluation, not start a second one. Other files mention EG2 too (`atlas-directory-first-analysis-v1`, `parent-atlas-spz-detective-renderer`, `parent-atlas-tensor-residency-integration`); not reviewed.

## Follow-up — authorized image thumbnail readback (2026-11-14)

Added `GET /api/evidence/[id]/thumbnail` for the stored thumbnail derivative. It verifies signed-in evidence access, current source revision, the validated content-addressed manifest, configured `atlas-artifacts` bucket, maximum byte size, SHA-256, and JPEG markers before returning a private `image/jpeg` response. The evidence viewer now displays this stored preview beside the source-bound image findings; it does not replace the original or the original-pixel detection coordinates.

Focused checks: thumbnail route (5/5), image-analysis client parser (3/3), canonical image processor, multimodal-analysis route, and visual-analysis adapter; combined run 5 files / 24 tests passed before the final JPEG-marker test, then the updated route and client suites passed 8/8. `git diff --check` passed. `npm run check` still reports 3 errors and 11 warnings in unrelated OPFS/NES-FSM/courtroom files; no new image-analysis diagnostic appeared.

No live SeaweedFS thumbnail request or authenticated browser screenshot was run. This does not complete OpenSpec tasks 5.1–5.5; they remain unchecked pending the real durable video pipeline and combined upload-to-authorized-viewer proof.

Image-analysis follow-up (2026-11-14): the canonical image processor now derives up to four deterministic, bounded JPEG crops from valid source-pixel detector boxes and persists their actual Q8 EmbeddingGemma 2 vectors through the existing PostgreSQL-first vector/outbox writer. Crop rows bind to the parent evidence source revision and carry crop-byte SHA-256, exact source box, policy/model preprocessing revisions, and `UNREVIEWED_PROPOSAL`. Focused unit checks passed 4/4; rollback-only PostgreSQL 18 integration passed 2/2 with independent whole-image and crop vector/outbox readback (both 768-D), then rolled back fixture DDL/rows. This is image-stage proof only; no live upload, SeaweedFS, or authorized browser readback. Do not mark video tasks 5.1–5.5 complete from this result.

Crop read-path regression (2026-11-14): the authorized multimodal-analysis, thumbnail, and depth-map routes now filter for the `whole_image` locator so a more-recent object-crop vector cannot be mistaken for the parent image vector. The three route suites passed 22/22; analysis/processor tests passed 9/9. A full Svelte check was attempted but stopped after its Node process reached approximately 7.1 GB with no checker diagnostics; compile validation remains open.

Detector license gate (2026-11-14): the local ignored YOLOX-Nano ONNX artifact is 3,659,407 bytes and matches its recorded SHA-256, but the upstream source repository's Apache-2.0 license does not separately document the official pretrained-weight grant. An upstream issue asks for clarification. Production admission now rejects `yolox_nano.onnx` even with an exact hash pin; it remains available for local evaluation only. Admission tests passed 8/8. A commercially cleared, artifact-specific detector receipt and real fixture inference remain open acceptance items.

EmbeddingGemma video audio-window follow-up (2026-11-14): the bounded audio-window worker code remains behind a feature gate. Real local model smoke passed all three EmbeddingGemma 2 Q8 ONNX towers (vision, text, audio), 8/8 adapter tests. A rollback-only PostgreSQL 18 media integration passed 1/1 with real FFmpeg/FFprobe, local YOLO, frame and transcript text embeddings, vector/outbox readback, and rollback; audio-content writes were disabled. The integration exposed and led to fixing a source-identity mismatch between raw hex stored in `evidence.hash` and the prefixed `sha256:` source revision. Keep audio writes disabled because the canonical vector schema/outbox still lacks a distinct audio representation lane; runtime shape tests do not prove audio/text/vision retrieval compatibility. No live queued upload, SeaweedFS, Whisper, or authorized viewer run was performed. Do not check tasks 5.1–5.5 complete until the audio representation and queue-to-viewer proof are finished.

Audio-lane correction (2026-11-14): audio-content vector writes are now explicitly off by default (`ATLAS_EMBEDDINGGEMMA2_AUDIO_SEGMENTS_ENABLED=false`). The existing persistence schema/writer does not yet provide a distinct audio `representation_id`/projection lane, so enabling it could mix incompatible vectors in the shared 768-D projection. Keep the gate off until that schema/outbox/readback contract, ONNX runtime compatibility, and authorized viewer readback are proven. The launch script for the separate EmbeddingGemma 2 GGUF challenger now points at `models/embeddinggemma2/unsloth-q8/embeddinggemma-2-Q8_0.gguf` and defaults to port 8082/alias `embeddinggemma2`; it does not replace the canonical 8081 lane.

ONNX/video verification receipt (2026-11-14): all three local Q8 ONNX encoders passed the real model smoke (8/8 adapter tests). The rollback-only PostgreSQL 18 media integration passed 1/1 after fixing the worker's raw-hash versus prefixed-source-revision comparison; it verified actual FFmpeg/FFprobe, YOLO, frame and transcript-text embeddings, vector/outbox readback, and rollback. Audio-content vector persistence was disabled in that integration. The effective `dev:gpu` backend resolves to `onnx_cpu` with the local EG2 model directory; the service stack itself was not launched. The local app request to `127.0.0.1:5173/evidence` timed out, so no authorized Evidence Board browser or screenshot proof exists. See the detailed exact commands and scope in `docs/reports/video-worker-canonical-integration-20261114.md`; keep tasks 5.1–5.5 unchecked.

Audio representation lane follow-up (2026-11-14): the canonical multimodal vector writer now records an explicit `representation_id`; sampled EmbeddingGemma audio-content windows require `embeddinggemma2_audio_content_768_v1` and write outbox intent to the distinct `evidence_audio_content_768` lane. The semantic/default representation retains its prior point-ID derivation. Drizzle schema and the scratch-only draft DDL validate the lane/modality pairing. Transcript-text embeddings remain on the existing semantic lane. Production audio writes remain disabled. Focused persistence, projector, and video-worker tests passed 21/21. The rollback-only PostgreSQL 18 media integration was rerun with audio enabled only in its injected dependencies and passed 1/1: actual FFmpeg/FFprobe, local detector evaluation, all three ONNX towers, sampled PCM audio vector write/readback, distinct representation/outbox lane readback, and rollback. This is not a live upload/job/SeaweedFS/Whisper/viewer proof; no migration was applied and OpenSpec tasks 5.1–5.5 remain unchecked.

Full-duration video skim implementation follow-up (2026-11-14): created a separate bounded FFmpeg preview stage that samples the source duration at a capped interval, processes windows of at most 600 samples, and composes 160×90 frames into hash-addressed JPEG sprite tiles in `atlas-artifacts`. The manifest is stored with the canonical video analysis JSONB and binds source hash, analysis/processing revisions, sample timestamps, dimensions, and tile digests; an authorized tile endpoint checks case access, current source revision, object key, size, and SHA-256 before serving. The existing EvidenceViewModal now has a full-film sample scrubber and a rapid scan that traverses the duration in about 23 seconds; selecting a sample seeks the original video. The scrubber retains every sample even though rapid scan skips between sample positions. This is implementation only: no tests, FFmpeg execution, SeaweedFS readback, or authenticated browser proof were run in this change. Existing OpenSpec tasks 5.1–5.5 remain unchecked.

Skim preview verification continuation (2026-11-14): added schema tests for timestamp and tile-range integrity, worker coverage for artifact upload and exact canonical manifest readback (including mismatch rejection), and tile-route checks for authorized access, stale revisions, and byte-integrity failure. Focused Vitest passed 22/22 across those three files. `npm run check:fast` completed but reported two errors in unrelated `opfs-video-cache.ts` and `nes-fsm-native-runtime-v1.ts`; it showed no errors in the skim implementation files. The worker test caught an undefined source hash in the new tile object key; it was corrected and the suite rerun successfully. This remains fixture-proven only: no real FFmpeg, SeaweedFS, or authenticated browser run. Tasks 5.1–5.5 remain unchecked.

Evidence Inspector browser-fixture follow-up (2026-11-14): the existing case-scoped evidence detail page now presents the authorized original-file preview/download, source provenance, processing progress, stored image/video observations, source-coordinate boxes, transcript segments and source/analysis revisions. Transcript selection seeks the media element and highlights the selected segment; transcript JSON/VTT export links are qualified by the selected case/evidence route. A Playwright fixture test passed 1/1 and saved `docs/reports/evidence-inspector-source-context.png`; it mocks the detail, transcript and original-media APIs and therefore proves the UI interaction only, not live authorization, source storage or media decoding. The test's temporary `[PW-TEST]` cases were cleaned up. The screenshot contrast was corrected and the test rerun. OpenSpec tasks 5.1–5.5 remain unchecked pending a real authorized upload-to-worker-to-SeaweedFS-to-PostgreSQL-to-viewer journey, Whisper/alignment, and independent live readback.

Current dev:gpu/audio verification (2026-11-14): frontend `.env` selects `EMBEDDING_BACKEND=onnx_cpu` and the local `models/embeddinggemma2/onnx-q8` bundle; `ATLAS_EMBEDDINGGEMMA2_AUDIO_SEGMENTS_ENABLED=false` remains the normal runtime setting. The existing app answered `GET /evidence` with HTTP 200; no service was restarted. Re-ran the opt-in, rollback-only media integration with the audio stage enabled in the test dependency injection: 1/1 passed, including all three ONNX towers, sampled audio vector and distinct `embeddinggemma2_audio_content_768_v1` / `evidence_audio_content_768` PostgreSQL readback, then rollback. This is still not a real `dev:gpu` upload through the durable queue, SeaweedFS, Whisper, or authorized viewer readback. Keep production audio writes gated off and tasks 5.1–5.5 unchecked.

## Speaker-aware transcript lane follow-up (2026-11-14)

Audit at repository revision `a8c0d17c362` found that the durable video worker extracts a single 16 kHz mono WAV and passes it to the existing transcription helper. It does not call VAD, diarization, or forced alignment. Canonical `whisper_segments` already has a nullable `speaker` column and JSONB metadata; `EvidenceTranscriptPanel` already renders and filters `speakerId`. These are storage/UI affordances, not proof of speaker inference. The separate longform speaker ledger is not invoked by the durable video worker. Keep this lane disabled until an admitted runtime and source-bound readback are proven.

The transcript route review also found a write-boundary gap: GET resolves `speakerId` from JSON metadata but does not select the canonical `whisper_segments.speaker` column. POST only updates legacy `evidence_transcript_segments`, does not repeat GET's evidence/case authorization check, and does not Zod-validate JSON. Fix and adversarially verify that route before enabling transcript review or speaker corrections.

- [ ] 5.6 Create bounded, resumable audio-window work with source PTS/sample mapping, stable window IDs, retry idempotency, overlap reconciliation, and independent stage status.
- [ ] 5.7 Add VAD as a separately versioned stage; persist speech intervals and explicit unavailable/skipped states without treating silence as speaker identity.
- [ ] 5.8 Add a license- and checksum-admitted diarization provider that emits anonymous speaker-cluster IDs only; preserve overlapping turns and route ambiguous attribution to review.
- [ ] 5.9 Align transcript words to source-relative time and reconcile words with diarization turns; persist speaker ID, source/evidence revision, ASR/aligner/diarizer revisions, and review state through the existing PostgreSQL transcript owner.
- [ ] 5.10 Secure and complete the transcript API: select canonical `speaker`, expose only anonymous speaker IDs, validate review payloads, enforce current evidence/case authorization on writes, and update only current-revision canonical rows. Verify seek, export, review correction, cross-case denial, worker recovery, and independent PostgreSQL readback before enabling the feature gate.

Report: `docs/reports/video-speaker-diarization-gap-audit-20261114.md`. These follow-up tasks are separate from 5.1–5.5; no existing task was marked complete.

EG2 audio runtime integration (2026-11-14, Phases 1–4 of the audio-runtime brief): `onnxruntime-node` 1.29.0 (the app's direct dependency, pinned exact in `sveltekit-frontend/package.json`; the loader imports it; 1.24.3 is superseded) loads `audio_encoder_quantized.onnx`. Parity on identical 2 s audio: 1.29.0 vs 1.24.3 cosine 1.0000000, max abs diff 3.4e-7; 18-run measurement on 1.29.0: p50 1,236 ms, p95 4,222 ms, peak RSS 1,024 MB and the app adapter produces a 768-D, unit-norm, finite vector for 2 s, 3 s and 5 s synthetic tones/noise; repeated runs give identical output SHA-256 per input; the scratch process exits 0. Adapter spec 8/8 (vision, text, audio pinned smoke), persistence/projector specs 7/7. The opt-in media integration (`ATLAS_EVIDENCE_VIDEO_MEDIA_E2E=1`) passed 1/1 with audio readback on `embeddinggemma2_audio_content_768_v1` / `evidence_audio_content_768`, inside BEGIN/ROLLBACK on the scratch database. Its fixture previously stored the raw SHA-256 hex in `evidence.hash`, which the worker now (correctly) rejects; the fixture now stores the `sha256:` form that the upload route writes. Not proven: production audio writes stay disabled, `video-ingest-service.ts` still inserts an unlabelled `checksum` into `evidence.hash`, latency/RAM are measured on a synthetic fixture only, and Phase 5 windowing (5.6–5.10) is not implemented.

Audio coverage slice (2026-11-14, toward 5.6): the durable worker now records explicit `substages.audioEmbedding.coverage` (policy, source duration, candidate/selected/completed window counts, covered ms), so a sampled long recording is never reported as full coverage. The existing vector writer is already idempotent on retry (conflict key includes locator hash, analysis revision and model revision), so a re-run does not duplicate windows. Durable-worker spec 17/17. A failing window no longer discards later independent windows: coverage records `failedWindowCount`, the first error is kept, and the stage stays UNAVAILABLE (never COMPLETED) when any window fails (test: 8 selected, 7 completed, 1 failed, 210 s covered). Not done: resumable per-window checkpoints across job restarts (needs a persisted window ledger, a schema change requiring operator approval), and full-recording coverage (the policy samples at most 8 windows of 30 s). Found, not fixed: `video-ingest-service.ts` (`/api/evidence/video/ingest`) inserts into the `schema/evidence.ts` table shape (`kind`, `fileKey`, `hashAlgorithm`, `sizeBytes`), which the live `evidence` table does not have (read-only column check: live columns are `file_url`, `file_type`, `hash`, …), and writes an unprefixed checksum. That route is therefore unverified against the live database and should be retired or rewired onto the canonical upload owner.

Decisions and checks (2026-11-14, operator answers): (1) Window ledger approved as a manual SQL migration. `drizzle/manual/20261114_evidence_audio_window_ledger_v1.sql` is written and rehearsed in `legal_ai_live_integration_scratch` inside BEGIN/ROLLBACK (table absent afterwards; malformed `source_revision` rejected by CHECK). It is registered in `drizzle/sidecar-migrations.json` as `rehearsed_not_applied`. Not applied to `legal_ai_db`; applying needs a second explicit go-ahead, and worker wiring waits on that. (2) VAD and diarization deferred; no provider installed. (3) Legacy `/api/evidence/video/ingest`: requires login (401 without a user, 403 under `DEV_BYPASS_AUTH` when no user id). Default `async` mode uploads the object to storage before its database insert, which fails on the scratch database with `column "kind" of relation "evidence" does not exist` (rolled back). A failed insert after upload leaves an orphaned object. No UI caller was found in `src`. Still unchanged: retire versus rewire is open.

Window ledger wiring (2026-11-14, code only; task 5.6 partial): the durable worker accepts an optional `audioWindowLedger` dependency. When supplied, it skips windows already COMPLETED for the same source and analysis revision (counted in `coverage.resumedWindowCount`), records each COMPLETED or FAILED window with the persisted locator hash, and surfaces ledger write errors instead of hiding them. Production defaults do not supply a ledger, so no database behaviour changes until the migration is applied and a ledger implementation is wired. Durable-worker spec 18/18; rollback-only media integration 1/1 after the change. Still pending: applying `20261114_evidence_audio_window_ledger_v1.sql` to `legal_ai_db` (needs explicit go-ahead), the SQL-backed ledger implementation, and retiring or rewiring the legacy video ingest route (operator decision open).

Window ledger implementation (2026-11-14, code and rehearsal only): `src/lib/server/features/evidence/video/audio-window-ledger-v1.ts` provides a PostgreSQL-backed ledger that is returned only when `to_regclass` finds `evidence_audio_window_ledger`; otherwise the factory returns undefined and issues no writes. Its spec passes 3/3. The ledger SQL was run against `legal_ai_live_integration_scratch` inside BEGIN/ROLLBACK: a retried FAILED window increments attempt_count to 2, a later COMPLETED keeps its locator, and nothing persisted. Not applied to `legal_ai_db`; applying the migration still needs an explicit go-ahead, and the legacy video ingest route decision is still open.

Window ledger APPLIED (2026-11-14, operator-approved): `drizzle/manual/20261114_evidence_audio_window_ledger_v1.sql` (sha256 25f338718e923bc3a1af2177794de78428b264c7aec7c1b37ea4c27954513367) committed to `legal_ai_db` after a pre-image check (table absent). Readback: table present, 0 rows, CHECK, unique, FK and PK constraints and both indexes present. Registered in `drizzle/sidecar-migrations.json` as `applied`. Worker wiring is still feature-detected and not enabled by default, so no production write path uses the ledger yet. Still open: the legacy video ingest route decision and tasks 5.7–5.10.

Transcript review fix (2026-11-14, toward 5.10): every POST to `/api/evidence/[id]/transcript` returned 500. The canonical update targeted `whisper_segments` but filtered on `evidence_transcript_segments.id`; PostgreSQL rejects that with `missing FROM-clause entry` (reproduced in a rollback on the scratch database), and the error skipped the legacy path. The filter now references `whisper_segments.id`. Already present and checked: Zod strict body validation, evidence ownership before any write, anonymous speaker-ID regex, canonical `speaker` column on GET. New route spec `transcript-review.spec.ts` passes 3/3, including a regression assertion that the rendered WHERE clause does not reference the legacy table. Still open for 5.10: a live authorized review round-trip with independent PostgreSQL readback, cross-case denial exercised against a second case, and the feature gate. VAD and diarization (5.7–5.8) remain deferred.

Follow-up (2026-11-14, operator answers): (a) Window ledger wired into the audio stage behind `ATLAS_EMBEDDINGGEMMA2_AUDIO_SEGMENTS_ENABLED`. The ledger is feature-detected per job (`to_regclass`); a probe failure disables resume for that job with a warning and never fails the stage. Durable worker + ledger specs 21/21. (b) `formatEvidenceSourceRevisionV1` now accepts the stored `sha256:` form. Before, the transcript, skim-preview and frames routes threw for every live evidence row (853/853 hashes are prefixed). Spec 6/6 with the transcript route spec. (c) Legacy `/api/evidence/video/ingest`: async admission now inserts the canonical `evidence` row (rendered INSERT verified against the scratch schema in a rollback) and enqueues the same `upload_pipeline` job shape as the canonical route. Sync mode returns 501 `SYNC_VIDEO_INGEST_RETIRED`, because its target table `evidence_items` does not exist live. Video ingest service spec 7/7 (mocked). Open: an object stored before a failed insert is not removed (no delete helper found in seaweed-client), and no live authorized upload has been run. (d) Transcript live round-trip BLOCKED: `whisper_segments` and `evidence_transcript_segments` both have 0 rows in legal_ai_db, so there is no existing segment to review. Creating one would be a new live record, so it was not done. (e) Production worker uses the ledger only when the audio flag is on; audio writes remain off by default.

Orphan compensation (2026-11-14): `admitVideoEvidenceV1` now wraps its evidence insert and job enqueue. On failure it soft-deletes the just-inserted canonical row and removes the stored object (`deleteSeaweedFile`), both best-effort, then rethrows the original error. Cleanup failures are logged, not thrown. The ingest service spec passes 8/8, including a failed-insert case that asserts the object is removed and no job is enqueued. Still open: no live authorized upload through the rewired route has run, and the transcript live round-trip is blocked by the absence of canonical transcript rows.

Live transcript review round-trip (2026-11-14, operator-approved; one seeded row, removed afterwards): seeded one `audio_transcripts` row and one `whisper_segments` row on evidence `3b48625a-…` (case `b8fbe1be-…`, owner user 1), marked with `metadata.seed = round-trip-2026-11-14`. The real `POST /api/evidence/[id]/transcript` handler returned 200 for the owner; independent psql readback showed reviewStatus approved, reviewedBy 1 and a reviewedAt timestamp. A non-owner (user 999) received 404 and the row was unchanged. Both seeded rows were deleted and both tables read 0 rows. Disclosure: a diagnostic script also wrote reviewStatus approved to the seeded row before the route call (no rollback in that script); the seeded rows were removed, so no residue remains. The earlier 500 came from the harness, not the route: tsx did not load DATABASE_URL until `--env-file=.env` was passed. Still open: 5.10 feature gate and a live upload through the rewired ingest route.

Live identity constraint APPLIED (2026-11-15, operator-approved): `evidence_multimodal_vectors_identity_uq` on `legal_ai_db` now includes `representation_id`, matching the draft and the writer's ON CONFLICT target. Before, every video vector write failed with a missing unique-constraint match (job 822d3f98). Rehearsed first in the scratch database inside a rollback, including a writer-shaped upsert. Applied in one transaction with a pre-check (old definition), post-check (new definition) and row count (52 before, 52 after), then independently read back. Test evidence 20774880 was soft-deleted after its failed run. Still open: SeaweedFS object cleanup for test runs (not approved yet); the WebM retry result is recorded separately.

Status update (2026-11-15):
- DONE: Video metadata columns `video_codec`, `audio_codec`, `duration_seconds`, `frame_count` applied to `legal_ai_db` (`drizzle/manual/20261115_evidence_video_metadata_columns_v1.sql`, registered as applied). Worker writes them for new uploads; verified on a real upload (av1, opus, 416.741 s, 60 frames). Drizzle schema declares them.
- DONE: Backfill of the four columns from `ai_analysis.videoAnalysis.probe` and frames, one transaction. 7 rows populated, 0 rows with probe data left null.
- DONE: Live identity constraint `evidence_multimodal_vectors_identity_uq` includes `representation_id` (applied, readback verified).
- DONE: Live outbox `representation_id` column and two-lane CHECKs (applied, readback verified).
- DONE: Transcription enabled: faster-whisper 1.2.1 in `.venv`, `WHISPER_MODEL=base`. Full upload produced 115 timestamped segments and transcript vectors.
- VERIFIED: Tesseract 5.5.0 native at `C:\Program Files\Tesseract-OCR\tesseract.exe`, `eng` language data present. Not yet wired into the video worker.
- OPEN: Embed all sampled frames. Worker still caps frame embeddings at 8 of 60 keyframes.
- DONE (code, 2026-11-15): per-frame progress. The worker reports `frame_ocr` and `frame_embedding` progress with a linear ETA (`frameProgressV1`). `queue-worker.ts` persists a coarse 0-100 percent to `analysis_jobs.progress` (OCR 0-50, embedding 50-100) through `updateAnalysisJobProgressV1`, which updates only `running` rows and never fails analysis. ETA is NOT persisted or shown in the UI. Video spec and queue specs pass. Not verified live.
- DONE (code, 2026-11-15): OCR per frame via the existing `$lib/server/ocr/tesseract.ts` helper (tesseract 5.5.0 on PATH). Each frame in `ai_analysis.videoAnalysis.frames` carries `ocr: { engine, status: COMPLETED|EMPTY|FAILED, text (max 4000 chars), error? }`. Failed OCR is per-frame and non-fatal. Durable video spec 19/19 incl. new OCR test. Not verified live. No schema change.
- OPEN: Move EmbeddingGemma 2 ONNX encoders off the Node main thread (worker_threads recommended; child process is the alternative). Measure intra-op thread count (8 physical vs 16 logical).
- OPEN, decision needed: keep the DB-backed `analysis_jobs` queue (recommended) or move video jobs to RabbitMQ.
- OPEN: SeaweedFS cleanup of test objects from all test uploads (archive vs delete not yet decided). Test evidence rows are soft-deleted.
- NOT DONE: Whisper transcription is not yet verified for a long-form clip beyond the 7-minute test. Video RAG answer test with Ornith not run.

Decisions pending (2026-11-15, recorded for the next session):
- D1 Encoder isolation: worker_threads (recommended) or child process for the EmbeddingGemma 2 ONNX encoders.
- D2 Queue owner: keep the DB-backed analysis_jobs queue with its concurrency gate (recommended), or move video jobs to RabbitMQ. RabbitMQ would be a second queue owner for the same jobs.
- D3 Intra-op threads: 8 (physical cores) or 16 (logical); measure both before choosing.
- D4 SeaweedFS test objects from all test uploads: archive or delete.
- Status line was corrected to distinguish verified BDD coverage from the still-open live/runtime gates.

Next-session order once D1 to D3 are answered: frame embedding cap (embed all sampled frames), per-frame OCR with tesseract (C:\Program Files\Tesseract-OCR\tesseract.exe, eng), per-frame progress and ETA, then encoder isolation.

## Handoff (2026-11-15)

State at handoff:
- Live DB changes applied: identity constraint (representation_id), outbox representation_id column and lane CHECKs, four video metadata columns, backfill of seven rows. Registry: drizzle/sidecar-migrations.json.
- Working: frame embedding (8 of 60 sampled frames), transcription (faster-whisper, WHISPER_MODEL=base), metadata columns for new uploads.
- Not done: embed all frames, per-frame OCR, per-frame progress and ETA, encoder isolation off the main thread.
- Test artifacts: test evidence rows soft-deleted; SeaweedFS objects remain (D4).
- Not run: /deep-audit (the 20-plus gate sweep). Not run: Ornith answer test.

Open decisions: D1 encoder isolation, D2 queue owner, D3 intra-op threads, D4 SeaweedFS cleanup, status line (COMPLETED vs IN PROGRESS).

Next session starts with: answer D1 to D3, then the frame cap, per-frame OCR, progress and ETA.

## Handoff for compaction (2026-11-15)

Deep audit (`/deep-audit`, partial, source-scoped, all PROVISIONAL): G4 834 pass, 0 fail; G5 533 pass, 0 fail, 1 manual review; G63 15 stale labels, 2 real artifacts, 107 manual review; G14 0 hits; G11 21 files with hardcoded localhost (manual review); G16 122 of 889 route handlers have a test sibling; G26 0 hits. Not run: G1-G3, G6-G8, G10, G20, G22-G25, G27-G62. Graph `docs/graph/codebase-graph.json` is STALE (last written 2026-11-01); no admitted snapshot exists.

G21 Svelte 4 check: the two `createEventDispatcher` hits (`src/lib/components/yorha/PoliceReportGenerator.svelte` and its demo copy) are comments only; both already use callback props. Live code has no `createEventDispatcher` call. The remaining match is a detection regex in `src/lib/server/codeintel/fix-recommender.ts:475`, which is not a Svelte 4 pattern. No code change needed.

Next session, in order:
1. Decide D1 (encoder isolation), D2 (queue owner), D3 (intra-op threads), D4 (SeaweedFS cleanup), and the status line.
2. DONE (code, 2026-11-15): frame embedding cap removed. `durable-video-analysis-v1.ts` embeds every sampled frame (sampler max 60); `MAX_VIDEO_FRAME_EMBEDDINGS_V1` deleted; revision records `frameEmbeddingPolicy: ALL_SAMPLED_FRAMES_V1`. Durable video and ingest specs 26/26. Not verified live. Videos analysed before this change keep their 8-frame vectors until re-run, because the analysis revision changed.
3. Per-frame OCR with tesseract (`C:\Program Files\Tesseract-OCR\tesseract.exe`, eng), stored with frame timestamp.
4. Per-frame progress and ETA events.
5. DONE (code, 2026-11-15, option a): EmbeddingGemma 2 encoders run in a bundled worker thread. Entry `src/lib/server/evidence/eg2-onnx-worker-entry.ts` is built by `npm run build:workers` into `build/workers/eg2-onnx-worker.mjs` (esbuild, `onnxruntime-node`/`sharp`/`@huggingface/transformers` external). Main-thread client `eg2-onnx-worker-client.ts` keeps the same signatures; the video worker's default embed deps use it. One request at a time. Missing bundle fails explicitly with `EG2_WORKER_BUNDLE_MISSING`, with no silent fallback. Real-model parity: text vector via worker equals in-process (identical input/output hashes and 768 values). Not yet measured: main-thread stall reduction during a full video, and a live app upload.
6. Ornith source-grounded answer test over the case.
7. Refresh the graph (`npm run index:codebase:fast`), then re-run the deep audit serially for G1-G3, G6-G8, G10, G20, G22-G25.
8. G11 localhost literals (21 files) and G63 manual reviews, one file at a time.

## Handoff update (2026-11-15, short)

Decision: D1 answered as option (a), bundled worker thread for the EmbeddingGemma 2 ONNX encoders. Build with `npm run build:workers` before running the app; a missing bundle fails explicitly (`EG2_WORKER_BUNDLE_MISSING`).

Done this session (code only, all unverified live):
- Frame embedding cap removed; every sampled frame (max 60) is embedded.
- Per-frame OCR via the existing tesseract helper, stored per frame in `ai_analysis.videoAnalysis.frames[].ocr`.
- Per-frame progress: `frame_ocr` and `frame_embedding` percentages persisted to `analysis_jobs.progress`; ETA is computed but not persisted or shown.
- Encoder isolation: worker entry, bundle script, main-thread client; text embedding parity with in-process verified on the real model.

Verified: durable video spec 19/19; worker protocol and real-model text parity; queue and analysis suites pass except unrelated failures (see below).

Not verified: image and audio encoders through the worker against the real model; main-thread stall reduction; any live upload through the running app.

Unrelated failures (not caused by this work): `process-evidence-document-v1.spec.ts` (`db.update is not a function`, mock shape); `task-outbox-confirm-channel-live.spec.ts` (`UNRELATED_PENDING_OUTBOX_ROWS`, live database); `duckdb-registry.test.ts` and `k-best-viterbi.spec.ts` failed once and passed in the later run (looks flaky).

Still open:
- D2 queue owner, D3 intra-op threads, D4 SeaweedFS test-object cleanup, status line.
- ETA in the UI (needs a read path and a UI change).
- Live upload of a WebM clip through the app to confirm OCR, progress and worker embedding end to end.
- Ornith source-grounded answer test.
- Graph refresh and serial deep-audit re-run (graph last written 2026-11-01).

## Transcript API follow-up (2026-11-15)

- The authorized transcript GET now reads the canonical `audio_transcripts` / `whisper_segments` owner first and uses the legacy transcript table only when no current-revision canonical rows are available. This prevents stale legacy rows from masking canonical speaker attribution.
- Added focused checks for canonical-first readback, anonymous-only speaker IDs, review-write feature gating, strict payload validation, and unauthorized evidence access.
- Verification: transcript route, durable video worker, and audio-window-ledger specs passed (28 tests). These are mocked/unit checks, not live PostgreSQL or viewer authorization proof.
- No diarization, VAD, or forced-alignment runtime is connected to the durable worker; the worker still calls whole-file transcription. Leave the speaker-analysis work and its runtime gate open; do not mark tasks 5.6–5.10 complete.
- The transcript drawer now exposes approve/edit actions only when the review feature gate is enabled. Corrections update the current source-bound canonical row, save the original model text in JSONB on first correction, and show both corrected and original wording after reload. Focused API/UI validation passed 15 tests; this is mocked persistence proof only.

## Live video viewer update (2026-11-15)

- Uploaded the user-provided WebM into the existing authorized case through the normal upload path. Job `efef9519-cf3f-4630-9e75-b130841d76fe` completed with a verified receipt; independent PostgreSQL 18.4 readback found 90 timestamped transcript segments, 60 video-frame vectors, 32 transcript/audio-segment vectors, and 768-D embeddings. The audio-content encoder feature gate remains off; no dedicated audio-content vectors were written.
- Live Chromium Playwright passed against detail, frames, transcript, skim tile, and source download endpoints. It verified HTTP range delivery, seeking to the last skim sample, transcript cue loading/seeking, and no page errors. Screenshot: `docs/reports/screenshots/evidence-video-viewer-live-20261115.png`.
- Fixed signature detection and inline serving for WebM after the authorized route returned 415; moved the transcript button into the modal header after the media preview intercepted pointer clicks. Focused WebM classification/download specs pass 29/29.
- This does not complete tasks 5.1–5.5: live cross-case denial, production-auth run, dedicated audio-content embedding, diarization/alignment, and reviewed event-to-scene publication remain unproven. Do not check those tasks from this run alone.

## Evidence processing progress UI (2026-11-15)

- The case-scoped Evidence Detail job list now subscribes to the existing owner-authorized `api/evidence/realtime` SSE endpoint for queued/running analysis jobs and updates its accessible progress bar from durable `analysis_jobs.progress`. A queued/running job at 0% is explicitly indeterminate until the worker reports progress; no synthetic percentage is shown. CSS sweep animation follows reduced-motion settings.
- Playwright file passed 3/3: synthetic media modal, live authorized WebM/detail progress at 100%, and an adversarial `progress: 137` SSE payload that remains capped at 99% while running. Screenshot: `docs/reports/screenshots/evidence-analysis-progress-live-20261115.png`. This does not prove a still-running Whisper progress stream.
- The agent Pokémon EXP widget is a simulated demo (`AgentBattleExpWidget.svelte` / `agent-exp-tracker.ts`); it was not reused as an evidence progress source.
- The actual worker Python environment is repository-root `.venv` (Python 3.11.9, faster-whisper 1.2.1, PyAV 18.1.0, CTranslate2 4.9.0). Global Python 3.13 has PyAV 19.0.2 but is not the executable used by the shim. FFmpeg and sibling FFprobe are installed on C:; see `docs/reports/evidence-analysis-progress-ui-20261115.md` for exact paths and check output.
- `npm run check:fast` reported five diagnostics in four unrelated source files; it emitted none for the changed evidence-detail page. Do not mark video tasks 5.1–5.5 complete from this UI improvement.

## Gap closure notes (2026-11-16) — no task boxes changed

- **Correction to an earlier read:** frame and crop embeddings are written. The canonical worker persists frame/transcript EmbeddingGemma 2 vectors and crop vectors through the PostgreSQL multimodal writer and projection outbox (see the 2026-11-14 notes above). `durable-video-analysis-v1.ts` only inserts transcript rows directly; the vector writes go through the shared writer.
- **Annotation storage map (current code):**
  - `evidence_analysis_cache`: detections as JSONB `result`, `analysis_type` `yolo`, 768-d `result_embedding`, `review_status` defaults to `UNREVIEWED`. Review writer: `investigation-v1.ts`.
  - `evidence_multimodal_vectors`: EG2 vectors with `source_revision`, `source_locator_sha256`, `model_artifact_sha256`, `input_sha256`, `representation_id`.
  - `feature_ontology_tuples`: subject/predicate/object rows with JSONB `object_value`, `confidence`, `ontology_version`, `evidence`, `resolved_concept_id` (OAKLib-style resolution).
  - `canvas_annotations`: UI canvas JSONB only.
  - The `perception.v1` envelope from the planning note is NOT implemented.
- **Model provenance (unverified where marked):**
  - `docker/docling-vlm/models/yolox_x.pth` (793,463,373 bytes): no source URL or hash recorded in the repo. Provenance UNKNOWN.
  - `yolox_tiny.pth` (CPU fallback named in `app.py`): absent. Not fetched, because the weight license is not cleared.
  - `sveltekit-frontend/models/yolox_nano.onnx`: SHA-256 `c789161e…b7d`, local evaluation only per the 2026-11-14 gate.
  - `yolov8x.pt` (AGPL-3.0): ARCHIVED 2026-11-16 to `deeds_labs/archive/2026-11-16/yolov8x.pt` (sha256 `3df4ada6…524c8`), manifest entry in `docs/archive-manifest.json`.
- **Bifrost:** added `gemma4-legal-iq4xs-direct.gguf` alongside `ornith-1.5-9b` in the `openai` key's model list (`docker/bifrost/config.json`, JSON validated). Takes effect only after the Bifrost container restarts. Restart is not done; it needs operator approval.
- **Still open (not closed by this note):**
  1. Detector owner decision: `yolo.ts` (ONNX, local evaluation) and `docker/docling-vlm/app.py` (YOLOX `.pth`) are two paths. Pick one owner.
  2. Commercially cleared, artifact-specific detector receipt, plus real fixture inference (see the 2026-11-14 detector license gate).
  3. Bifrost restart and a live `/v1/models` check showing the Gemma 4 alias.
  4. Tasks 5.1–5.5 remain open until the authorized upload-to-viewer run is proven live (SeaweedFS, Whisper, viewer readback).

## 6. Detector lane — weight-free operation and admission (2026-11-16)

Status key: `[x]` verified in this repo; `[ ]` open. Weights (`yolox_x.pth` ~793 MB, `yolox_tiny.pth` absent) are gitignored and are NOT in git. Weight-free operation is the production default until DET-05/DET-06 clear.

- [x] DET-01 Archive the AGPL-3.0 `yolov8x.pt` under the archive rule. Done: `deeds_labs/archive/2026-11-16/yolov8x.pt`, SHA-256 `3df4ada6…524c8`, entry in `docs/archive-manifest.json`.
- [x] DET-02 Weight-free video path. Verified: `durable-video-analysis-v1.spec.ts` gained `runs weight-free: no admitted detector records yolo UNAVAILABLE and keeps frame proposals`; the file's other 19 tests passed earlier this session. The worker records `detectorStatus: UNAVAILABLE` and keeps frame proposals (`UNREVIEWED_PROPOSAL`). Owner: `loadDetectorV1` in `durable-video-analysis-v1.ts`.
- [x] BIF-01 Bifrost config carries the served alias `gemma4-legal-iq4xs-direct.gguf` beside `ornith-1.5-9b` (`docker/bifrost/config.json`, JSON valid).
- [x] BIF-02 (done 2026-11-16, operator-approved, `docker restart legal-ai-bifrost` only; healthy; `/v1/models` lists `openai/gemma4-legal-iq4xs-direct.gguf`; routed chat completion returned from `:8090`) Restart the Bifrost container, then confirm `GET /v1/models` lists the Gemma 4 alias and a routed request reaches `:8090`. Needs operator approval (container lifecycle).
- [x] DET-03 DECIDED 2026-11-16 (operator): ONE detector owner = `sveltekit-frontend/src/lib/server/yolo.ts` (ONNX, CPU via Python 3.13 onnxruntime). `docker/docling-vlm/app.py` YOLOX path is a dormant COMPATIBILITY path (not called by the video worker; container not running); do not add GPU detection as a second owner. If a GPU backend is needed later, add it behind yolo.ts as a backend. Candidates: `sveltekit-frontend/src/lib/server/yolo.ts` (ONNX, local evaluation; current worker path) or `docker/docling-vlm/app.py` (YOLOX `.pth`, container not running). Operator decision. The other path is removed or marked `COMPATIBILITY` after the choice.
- [ ] DET-04 Provenance for `yolox_x.pth` and `yolox_tiny.pth`: record the upstream source URL, release tag and SHA-256, plus the upstream license evidence for the WEIGHTS (the repo LICENSE is Apache-2.0 but does not cover the pretrained grant). Clear the upstream issue or get a written grant. Operator/legal.
- [ ] DET-05 Admission: add an admission manifest entry only for a weight that passed DET-04. Production stays UNAVAILABLE for every weight without a grant.
- [x] DET-06 CPU fixture inference with saved receipt: `docs/reports/yolox-nano-cpu-fixture-receipt-20261116.json` (Python 3.13.5, onnxruntime 1.27.0 CPU, 4 detections). Status is NOT production admission; the sample photo is scratch-only and not committed. Committed inference test still needs a rights-cleared fixture.
- [ ] DET-07 Docker `docling-vlm` build and `/detect` smoke. Only if DET-03 selects the container path; the container is not running today.
- [ ] DET-08 `yolox_tiny.pth` CPU fallback: fetch only after DET-04. Until then `app.py` tier 2 stays empty and reports UNAVAILABLE.
- [ ] VID-01 Tasks 5.1–5.5 above remain open until a live upload-to-viewer run passes (SeaweedFS, Whisper, viewer readback).

Not done in this section: no weight was downloaded, no detector was admitted, and no service was restarted.

### 6a. CPU detector check (2026-11-16)

- CPU path = `yolox_nano.onnx` (`sveltekit-frontend/models/`) run through `yolo.ts` by Python 3.13 (`YOLO_PYTHON=C:\Python313\python.exe`, onnxruntime 1.27, `CPUExecutionProvider`). The default `python` on PATH has no onnxruntime, so an unset `YOLO_PYTHON` fails the detector.
- Real inference, scratch-only input (public sample photo, 810×1080, not committed): 3 `person` (conf 0.87, 0.67, 0.57) + 1 `bus` (conf 0.59), 3.7 s CPU including Python startup. Repo fixture `tests/fixtures/test-poi-photo.png` is a synthetic red frame with text, so 0 detections is correct there.
- `yolo-model-admission-v1.spec.ts`: 8/8 pass.
- DET-06 is PARTIAL: inference verified; the saved receipt and a committed inference test are open. A committed test needs a rights-cleared photo fixture (not the downloaded sample).
- Production admission still rejects `yolox_nano.onnx` (DET-04 license gate). CPU detection is local evaluation until DET-04 clears.
- `yolox_tiny.pth` is needed only for the Docker `docling-vlm` tier 2. It is not required for the ONNX CPU path. Decide with DET-03.

### 6b. Verified facts for the CPU / keypoint / storage questions (2026-11-16)

- Sizes (bytes): `sveltekit-frontend/models/yolox_nano.onnx` 3,659,407 (CPU, local evaluation only); `docker/docling-vlm/models/yolox_x.pth` 793,463,373 (GPU tier, provenance unknown); `yolox_tiny.pth` absent.
- Cython: no `.pyx`/`.pxd` in `python/`, `simd-bridge/`, `scripts/`, or `sveltekit-frontend/src`. `python/atlas_corpus_lib/setup.py` builds a CMake/ATen `Extension`, not Cython.
- Radix sort: `simd-bridge/cpp/atlas_byte_synth_core.cpp` is scalar 8-bit LSD radix (4 passes). No AVX2 or AVX-512 radix sort exists. AVX2 kernels exist for NES LUT filtering (`nes_lut_filter_avx2.cpp`) and MRL prefix renormalisation (`mrl_prefix_renorm_avx2.cpp`). No AVX-512 code is ours; the only AVX-512 match is vendored simdjson.
- EmbeddingGemma 2 (`models/embeddinggemma2/onnx-q8/config.json`): `text_config.embedding_dim` = 768. MRL 512/256/128 is a derived projection and must stay optional under the Embedding Dimensions Policy; 768 remains canonical.
- NES palette: `NES_LUT_DOMAIN_PALETTE` / `atlas_nes_lut_v1` are DOMAIN palettes (10 entries, `lut_byte` ≠ `nes_hex`). No keypoint or pose topology exists in `sveltekit-frontend/src` (grep: no `keypoint`, `COCO_KEYPOINTS`, `pose_topology`).
- PostgreSQL 18.4: `io_method` = `worker`. `evidence_multimodal_vectors` has 232 rows (2,320 kB) and an HNSW index. `EXPLAIN (ANALYZE, BUFFERS, SETTINGS)` on a modality filter + `<=>` ORDER BY used Seq Scan + top-N heapsort (37 ms). Bitmap scan and AIO effects are NOT exercised at this size; proving them needs a scratch table of realistic size, not this table.
- Open: DET-06 receipt; PG18 bitmap/AIO proof (scratch, rollback); COCO-17 pose model admission (none exists); a separate versioned animal keypoint topology (none exists); palette-indexed skeleton renderer (none exists).

### 6c. Continuation (2026-11-16)

- DET-06 receipt written: `docs/reports/yolox-nano-cpu-fixture-receipt-20261116.json` (Python 3.13.5, onnxruntime 1.27.0 CPU, model sha256 `c789161e…b7d`, 4 detections: person 0.87/0.67/0.57, bus 0.59). Model directory stays gitignored; the receipt is not.
- Motion tile already exists and is tested: `sveltekit-frontend/src/lib/shared/video-motion-lut-v1.ts` (64×128 gray-delta, 4 bpp, low nibble first, versioned header `ATLMOT1`); spec 3/3 pass; served by `api/evidence/[id]/motion-preview/[frameIndex]` and `frames`. It is a rebuildable visualization and does not establish movement.
- Not verified this turn: N64 hardware claims, DLSS/raycasting, AVX-512 radix, or any SIMD helper. These are research notes, not repo facts.

### 6d. What else is needed (2026-11-16)

Done this round:
- Committed opt-in inference test `sveltekit-frontend/src/lib/server/yolo-cpu-inference-v1.spec.ts`: skipped unless `YOLO_TEST_IMAGE` is set (skip verified); passes on the scratch photo with `YOLO_TEST_MIN_OBJECTS=3` in 2.7 s. No photo or model is required in git.
- PostgreSQL 18.4 bitmap check (rollback-only, `legal_ai_live_integration_scratch`, 300k-row TEMP table): rare value → Index Scan, common value → Bitmap Heap Scan. Confirms planner selection. NOT an AIO measurement: TEMP tables use local buffers, so `io_method` effects are not exercised. An AIO proof needs shared-buffer tables at scale.

Still needed, grouped by who unblocks it:
- Operator decision: DET-03 (one detector owner: `yolo.ts` ONNX vs `docling-vlm` YOLOX container).
- Operator approval: BIF-02 (Bifrost container restart, then `/v1/models` shows the Gemma 4 alias).
- Legal/upstream: DET-04 (weight-level license for `yolox_nano.onnx`, `yolox_x.pth`, `yolox_tiny.pth`). Until cleared, production stays UNAVAILABLE.
- Operator approval: DET-07 (Docker `docling-vlm` build and `/detect` smoke), only if DET-03 selects the container.
- Engineering: AIO proof on a shared-buffer scratch table (size chosen to exceed shared_buffers); VID-01 live upload-to-viewer run (SeaweedFS, Whisper, viewer); pose model admission (COCO-17, none exists); separate animal keypoint topology (none exists); palette-indexed skeleton renderer (none exists).

### 6e. DET-04 licence evidence (2026-11-16, fetched from upstream)

- `Megvii-BaseDetection/YOLOX` LICENSE: Apache License 2.0; copyright holder Megvii Inc. (2021–2022). The text covers software, documentation and configuration; it does not mention model weights, checkpoints or pretrained models.
- Repository page: the only licence reference is "Apache-2.0 license" in Resources. The Model Zoo links to the .pth files with no licence terms of their own.
- Reading: the code licence is Apache-2.0. No separate grant for the weights was found, and none excludes them. This is an interpretation, not a legal opinion.
- Training data: the COCO-trained weights inherit COCO's image-rights caveat (annotations CC BY 4.0; photos carry their own rights).
- Status: DET-04 remains OPEN until the operator records a decision that accepts this basis (or obtains a written grant). Production admission for `yolox_nano.onnx` is unchanged.

### 6f. DET-04 / DET-05 decision (2026-11-16, operator)

- Operator decision: accept the Apache-2.0 reading for `yolox_nano.onnx` (see 6e: code LICENSE Apache-2.0, no separate weight grant found). Recorded as the basis, not a legal opinion.
- Code: `yolo.ts` `PRODUCTION_YOLO_MODEL_BASENAMES` now admits `yolox_nano.onnx`. Production still requires `YOLO_MODEL_SHA256` = `c789161ed43c8269fcd4e67c67eeeb4e80c622da2eb296a20bc6007bd18a0b7d` and an exact match of the artifact. Spec: `yolo-model-admission-v1.spec.ts` 9/9 pass (admits with pin; rejects without pin).
- Not admitted: `yolox_x.pth` and `yolox_tiny.pth` (same Apache reading would apply, but they are not in the `yo.ts` path and need their own hash pin and receipt). YOLOv8/YOLOv10 remain blocked.
- Video use: the durable worker calls `detector.analyze` once per sampled frame (`durable-video-analysis-v1.ts`). Each call spawns a Python 3.13 subprocess. Measured per image: ~3.7 s cold (includes Python start), ~0.6 s warm. Video cost is therefore frame-count × per-call latency; NOT measured on a real video yet.

### 6g. Gemma 4 E2B ONNX VLM — CPU feasibility (2026-11-16)

- Licence: HF metadata and the Google Gemma 4 licence page (read through a summariser, so verify clause text before production) say Apache-2.0. Same basis as the YOLOX decision; the operator accepted the Apache reading for YOLOX.
- Runtime: `@huggingface/transformers` 4.2.0 (exports `Gemma4ForConditionalGeneration`, `Gemma4ImageProcessor`) on `onnxruntime-node` 1.29.0, CPU. Python onnxruntime is not used for this path.
- Files (q4f16, gitignored under `static/gemma4_e2b_onnx/onnx/`): text decoder + embed already present; ADDED vision_encoder_q4f16.onnx (189,124 B) + `_data` (99,189,440 B), audio_encoder_q4f16.onnx (260,446 B) + `_data` (171,258,112 B). The audio encoder is required by Transformers.js even for image-only input.
- Result, scratch bus photo, prompt "List the main objects in this image in one short sentence.", max 60 new tokens, CPU: load 20.9 s, generate 29.0 s. Answer: "The image features a large electric bus and several people standing near it on a paved area."
- Speed: ~29 s per answer on CPU is too slow for "quick answers" as-is. Not a fallback latency target until measured tuning (threads, shorter image input) is tested.
- GPU: NOT run. nvidia-smi shows ~5.7 GB used by :8090 and ~2.3 GB free; the q4f16 VLM needs roughly 3.2 GB of weights plus activations. A GPU run requires stopping :8090 via the operator-run VS Code task (rules). Browser WebGPU is the repo's existing GPU path (`browser-model-policy.ts`); it has not been tested with the vision encoder.
- Not done: no router change, no admission, no Node GPU provider check.

### 6h. MTP drafter, GPU YOLOX and owner check (2026-11-16)

- Correction: `turbovec/turbovec-cy/turbovec_cy.pyx` EXISTS in this checkout (4,517 B, with setup.py and pyproject.toml). My earlier search missed the root `turbovec/` folder. Compile-check and benchmark it before reuse (pasted P1 item is valid as a task).
- Correction: live `evidence_analysis_cache` has `review_status`, reviewed_by and reviewed_at. Only the manual SQL file may lack them.
- MTP drafter: `.env` sets `ENABLE_MTP_DRAFTER=true` and `MTP_DRAFT_MODEL=.tmp/atomic-mtp/gemma-4-E4B-it-assistant.Q4_K_M.gguf`, but `.tmp/atomic-mtp/` does NOT exist. The `.tmp` cache holds only svelte/atlas outputs. Local assistant artifacts: `models/atlas-gemma4-e4b-assistant/mtp-f16/atlas-gemma4-e4b-assistant-mtp-f16.gguf` (171,766,880 B); HF safetensors assistants (159,138,208 B each) under `models/gemma4-e4b-qat-assistant-2026-07-20` and `models/gemma4_assistant_huggingface_7_3_26`. None has been loaded as a llama-server draft. `dev:gpu` runs with MTP disabled. Quick-answer use requires a draft-compatible target/draft pair and a VRAM test with :8090 running.
- YOLOX GPU review: NOT run. `yolox` Python package not installed (torch and onnxruntime are). Installing it needs the capability-guard check first. VRAM ~2.3 GB free while :8090 runs.
- Owner rule: video frames currently call `yolo.ts` (Python ONNX, CPU). A separate GPU Python helper would be a second owner. Preferred: one Python detector helper with device backends (ONNX CPU and PyTorch GPU), selected by config, behind the one `yolo.ts` contract.
- Pasted external P0–P2 ledger (`Visual Observation` tasks): treated as a proposal, not verified. Its GitHub-main premise did not match this local checkout (the `.pyx` and `review_status` checks above). Reconcile with the remote before adopting any task list.

### 6i. Local model status — what runs, what does not (2026-11-16)

| Model | Status | Evidence |
|---|---|---|
| YOLOX-Nano ONNX, CPU | WORKS (local, and production-admitted by the operator's Apache decision) | 6f; receipt `docs/reports/yolox-nano-cpu-fixture-receipt-20261116.json` |
| Gemma 4 E2B ONNX VLM, CPU (q4f16 + vision + audio encoders) | WORKS, slow (~29 s per short answer) | 6g |
| Gemma 4 E4B assistant MTP GGUF (`models/atlas-gemma4-e4b-assistant/mtp-f16/…`, 171,766,880 B) | DOES NOT LOAD | `unknown model architecture: 'gemma4-assistant'` in both local `llama-server` builds (`Desktop/llama-server-cuda`, `Downloads/llama-turboquant-triattention…`); architecture not in either binary |
| MTP drafter via AtomicBot fork | HISTORICAL ONLY | July 2026 logs (`.tmp/atomicbot-*-mtp-*.err.log`) show a draft-mtp load and `listening` on 8092; the binary, `.tmp/google-gemma4-e4b-assistant/` and `.tmp/atomic-mtp-unsloth/` are gone from `.tmp` |
| YOLOX-X `.pth`, GPU | NOT RUN | `yolox` package not installed; ~2.3 GB VRAM free while `:8090` runs |
| YOLOX-Tiny `.pth` | ABSENT | — |
| Gemma 4 E2B VLM, GPU | NOT RUN | needs ~3.2 GB VRAM; blocked by `:8090` |

To make the MTP drafter work, all of these are needed: (1) an AtomicBot-fork binary (external download, operator approval; a supply-chain trust decision); (2) a target GGUF matching the drafter's E4B-it family (the July unsloth target is gone; the current `gemma4-legal-iq4xs-direct.gguf` is unverified as a match); (3) a VRAM test, which needs `:8090` stopped via the operator-run task.

### 6j. Current chat model (operator-confirmed 2026-11-16)

- Current chat/synthesis model on `:8090`: `gemma4-legal-iq4xs-direct.gguf` (5,091,434,336 B; `/props` alias matches). Operator confirmed Gemma 4 is in use.
- `.opencode/opencode.jsonc` updated to this alias (six references; agent names unchanged).
- Still stale: `CLAUDE.md` and `AGENTS.md` describe Ornith 1.5 as the active chat model. Not edited in this pass; needs an operator decision.
- `docker/bifrost/config.json` has the Gemma alias added beside Ornith; the Bifrost container has not been restarted (BIF-02 open).

### 6k. Gemma 4 legal on :8090 — text vs vision (2026-11-16)

- The current `:8090` launch is TEXT/TOOL ONLY: the `gemma4-legal-iq4xs` profile (`scripts/launch-turboquant.ps1`) has no mmproj, and `dev:gpu` passes `-TextOnly`.
- Added profile `gemma4-legal-iq4xs-vlm` (same alias and model, `WantsVision = $true`, family projector `models/mmproj-F16.gguf`, 990,372,800 B, carries vision and audio encoders). The profile is NOT yet run or tested: confirm `/props` `modalities.vision=true` and a real image answer before relying on it. Launcher parses (PowerShell parser OK). Not started; `:8090` is unchanged.
- Starting it requires restarting `:8090`: operator-run VS Code task, or an agent restart that passes all production-hardening gates. VRAM: ~2.3 GB free while the text server runs; the 5.1 GB legal model plus projector must be placed as the Ornith vision lane did (projector on CPU via `LLAMA_ARG_MMPROJ_OFFLOAD=0`, which `dev:gpu` sets for the vision lane). Not verified for this model.
- Quick-hit speculative answers still need the AtomicBot-fork binary (not on disk; see 6h/6i).

### 6l. Gemma 4 legal vision server ON (2026-11-16, operator-approved)

- Root cause of the earlier text-only launch: root `.env` `TURBO_MMPROJ_PATH` held a mangled Ornith path (`C:SERSJAMES…MMPROJ-ORNITH…`). For the gemma4 family the launcher uses that value as the projector override, so the file test failed and the launch silently fell back to text-only. Fixed to `C:/Users/james/Videos/deeds-web-app/models/mmproj-F16.gguf` (backup `.env.bak-20261116-mmproj`).
- Restarted `:8090`: stopped the port-scoped text PID, then `launch-turboquant.ps1 -StartupProfile gemma4-legal-iq4xs-vlm -Detached` with `LLAMA_ARG_MMPROJ_OFFLOAD=0`. Log: "Multimodal projector: loading …mmproj-F16.gguf … TurboQuant ready (with VLM, kv=q8_0/q8_0)".
- Verified: `/props` `modalities.vision=true`, alias `gemma4-legal-iq4xs-direct.gguf`. Image request with the scratch bus photo answered (truncated at 60 tokens): several people and a large electric bus.
- Speed of the vision request and VRAM use under the projector were not measured in this pass.

### 6m. Measured per-frame detector cost (2026-11-16)

- Input: 10 s test clip made from the scratch bus photo with the bundled `tools/ffmpeg/ffmpeg.exe` (libx264, 640 px wide, 2 fps); 20 frames extracted. Clip is scratch-only, not committed.
- Detector: production `yolo.ts` `analyzeDocument`, one Python 3.13 subprocess per frame, ONNX Runtime CPU, `yolox_nano.onnx`.
- Result: 20 frames, 3–4 objects per frame. First call 5,796 ms (cold). Steady-state p50 1,087 ms. Total 26.7 s. The p95 figure (5.8 s) is the cold first call, not steady state.
- Not included: frame decode time and the rest of the video worker stages.
- Planning figure: roughly 1.1 s per sampled frame after warm-up. A 60-frame budget costs about 65–70 s of detection, plus the cold start.

### 6n. ASR venv and transcription check (2026-11-16)

- ASR interpreter: `C:\Users\james\atlas-asr-venv` (outside the repo), Python 3.13.5, faster-whisper 1.2.1, av 18.1.0, ctranslate2 4.9.0. Pinned as the worker expects. Worker on `:8093` runs `base` model, CPU, int8, 4 threads, allowed roots `Music` and `sveltekit-frontend/temp/media`.
- Test: 5.4 s English speech made with Windows text-to-speech (`System.Speech`), copied to `sveltekit-frontend/temp/media/asr-test-speech.wav` (scratch test file).
- Result: "The witness saw a large white bus parked outside the courthouse at 10.15 in the morning." Transcribe time 2.09 s (about 0.39 real-time factor). No ffmpeg binary used; PyAV bundles its own FFmpeg libraries.
- Not tested: video with an audio track, word timestamps, diarisation.

### 6o. ffprobe wiring and production packaging (2026-11-16)

- Root `.env` `FFMPEG_PATH` changed to `C:/Users/james/.stacher/ffmpeg.exe` (backup `.env.bak-20261116-ffmpeg`). The sibling `ffprobe.exe` is found automatically; probe of the 10 s test clip returned duration 10.0 s and one video stream.
- Licence of the stacher build: `ffmpeg -buildconf` shows `--enable-gpl --enable-version3 --enable-libx264 --enable-libx265`. This is a GPL build. Shipping it in production needs a licence review (or an LGPL build without x264/x265).
- PyAV 18.1.0 in `C:\Users\james\atlas-asr-venv` probes the same clip without any executable (duration 10.0, streams ['video']). Its bundled FFmpeg libraries' licence was not checked.
- Production needs, not yet done: a pinned ffprobe (binary + sha256 manifest, or a PyAV probe helper); the ASR worker as a managed service with a locked venv (`atlas-asr-venv` is outside the repo); `YOLO_MODEL_SHA256` set for production; model files (gitignored, several GB) delivered by checksummed artefacts; the DET-04 weight decision for anything beyond nano; the Gemma licence clause check.

### 6p. Production hardening notes (2026-11-16)

- PRODUCTION NOTE: PyAV (`av` 18.1.0, `C:\Users\james\atlas-asr-venv`) is available for ffprobe-style metadata (duration and streams) without an external ffprobe executable. Use it to remove the ffprobe packaging dependency, after its bundled FFmpeg licence is checked.
- MCP `transcribe_audio` (`sveltekit-frontend/src/mcp/server.ts`) now transcribes through `lib/server/analysis/media-processing.ts` (faster-whisper worker `:8093`, fallback whisper CLI), not the Docling module. It writes the buffer to a unique file under `temp/media`, transcribes, and removes that temporary copy. Parses with esbuild. NOT live-tested: the MCP server must be restarted to load it.
- Worker supervision: `scripts/atlas/faster-whisper-asr-worker-v1.py` (FastAPI/uvicorn) is started by `start-faster-whisper-asr-worker.ps1` as a hidden process with a PID file in `%TEMP%`. No restart on crash. Production needs a Windows service wrapper (decision pending).
- `evidence:transcribe_gpu` MCP tool posts to `FASTAPI_URL` (`http://localhost:8096`), which I have not verified is running.

### 6q. TRACE media.transcribe tool (2026-11-16)

- Added `media.transcribe` to `sveltekit-frontend/src/mcp/trace-mcp-server.ts` (before `wiki.status`). Input: `path` (must lie under an allowed worker root). Output: language, text, timed segments, word count. Calls `lib/server/analysis/media-processing.ts` `transcribeAudio`, so it uses the `:8093` ASR worker first. Parses with esbuild.
- NOT live: the running TRACE process (`:8788`) was not restarted. Restart is a service-lifecycle action gated by the production rules (operator token in the TRACE launch environment, fake-token refusal, receipt). Until it restarts, `media.transcribe` is not callable.
- Underlying path verified earlier: `transcribeAudio` on a 5.4 s speech WAV returned the expected sentence (section 6n).
- Not done: the end-to-end video run (upload → durable worker → Postgres/SeaweedFS readback → viewer), which is the open task 5.1–5.5.

### 6r. TRACE restart and media.transcribe live (2026-11-16, operator-approved)

- Restart: stopped the port-scoped TRACE PID 30332; started with `node scripts/ensure-mcp-server.mjs --spawn` (new PID 63172). Receipt: `sveltekit-frontend/logs/operations/trace-restart-20261116.json`. The ensure script printed a 15 s health timeout, but `/health` returned 200 about 4 s later.
- Operator token: `TRACE_MCP_OPERATOR_TOKEN` was not in this shell's environment, so the new process has none. The operator-gated `ops.*` tools are therefore refused. Not verified against the fake-token check; not performed by me.
- Verified: `tools/list` returns 211 tools including `media.transcribe`. `tools/call` on the 5.4 s speech WAV returned "The witness saw a large white bus parked outside the courthouse at 10.15 in the morning." (language en, 16 words, one segment). `isError: false`.
- Still open: the video end-to-end run (task 5.1–5.5).

### 6t. Read-only transcript schema and index check (2026-11-16)

- Queried only `legal_ai_live_integration_scratch` on local PostgreSQL 18.4. The connection was derived from the configured local URL, forced to the scratch database, set `default_transaction_read_only=on`, and gated on the returned database name/version before schema inspection. No writes or migrations were performed; `legal_ai_db` was not queried.
- Live tables present: `audio_transcripts`, `whisper_segments`, and `analysis_jobs`. `evidence_transcript_segments` and `evidence_frames` were absent from this scratch database. `audio_transcripts` stores evidence/case IDs, language, duration, full text, count, model, JSONB metadata; `whisper_segments` stores transcript/evidence IDs, ordinal, millisecond start/end, text/language, optional 768-D vector/model, speaker, confidence, and JSONB metadata. Run/source revisions and word intervals currently live in metadata, not dedicated columns.
- Live indexes: `audio_transcripts` and `whisper_segments` had only primary-key indexes; `analysis_jobs` had primary key plus evidence/status/job-type indexes. This differs from Drizzle declarations and from the candidate read-index SQL. Do not infer live parity from schema declarations or apply the candidate index migration to a canonical database from this observation.
- The video-analysis GET already scopes transcript readback by authorized evidence/case, current source revision, analysis revision, and transcript/job ID, then orders by `start_ms, segment_index`. This is the existing UI/API owner to reuse for the case evidence detail and scene workspace.
- Next: reconcile the scratch DB’s migration history/schema against the checked-in Drizzle journal and sidecar registry; run `EXPLAIN (ANALYZE, BUFFERS, SETTINGS)` on representative scratch queries before selecting index changes. A fresh-connection authorized viewer readback remains a separate gate. This schema check does not prove current `legal_ai_db` contents.
- Detail and reproduction: `docs/reports/video-transcript-schema-readonly-20261116.md`.

### 6s. ETA on the evidence job progress bar (2026-11-16)

- Existing before this step: the 15 Nov progress bar showed durable `analysis_jobs.progress` with no ETA. ETA existed only in the document-ingestion store (`GrpcStatusAdapter`, `DocumentProgressStore`), fed by gRPC events.
- Added `sveltekit-frontend/src/lib/utils/progress-eta.ts` (`estimateEtaSeconds`, `formatEta`) with `progress-eta.spec.ts` (3/3 pass). Shown on `cases/[id]/evidence/[evidenceId]/+page.svelte` only for running jobs with progress between 0 and 100.
- Limit: the estimate starts at `createdAt` (queue time included), so it is approximate. It refreshes only when the page re-renders (on progress events), not on a timer.
- Svelte compile of the page: OK. Not browser-tested in this step.
- Media integration spec: the test's own timeout was hard-coded to 180 s (line 320); raised to 900 s. The earlier CLI `--testTimeout` had no effect on it.
