# Tasks: Evidence Analysis BDD Pipeline & Case-to-Analysis Journey

Status: COMPLETED
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

- **Existing EmbeddingGemma 2 owner (found 2026-11-13, do not duplicate):** `openspec/changes/parent-atlas-agent-framework-integration-hardening/tasks.md` item 8.5 (EG2 `google/embeddinggemma-2` is distinct from EG1 `embeddinggemma-300m`; do not retarget `semantic_768` until runtime support, checksum, task convention, vector parity and retrieval evaluation are proven) and section 9 "Phase 23 EmbeddingGemma 2 Runtime Evaluation" (9.6: map the existing Whisper/Docling speech pipeline before audio embeddings; do not replace transcription or video analysis with EG2). Step 2 above should extend that evaluation, not start a second one. Other files mention EG2 too (`atlas-directory-first-analysis-v1`, `parent-atlas-spz-detective-renderer`, `parent-atlas-tensor-residency-integration`); not reviewed.
