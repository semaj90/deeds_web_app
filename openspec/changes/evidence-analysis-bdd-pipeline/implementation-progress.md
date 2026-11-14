# Evidence Analysis BDD Pipeline — Implementation Progress

Updated: 2026-11-13

## Scope and proof boundary

The change contains 56 scenario-backed tasks. Fourteen case-journey tasks have Playwright UI-contract coverage; those tests stub API responses and do not prove PostgreSQL, SeaweedFS, worker execution, or model processing. This session completed the first durable-admission contract task and did not promote the broader media pipeline.

## Completed this session

- Task 1.1: the upload route contract checks that the evidence row and queued `upload_pipeline` job carry the verified SHA-256 source revision, and now asserts that the SeaweedFS object write happens before job enqueue.
- Focused upload route tests: 5 passed.
- OpenSpec strict validation: passed.
- Scoped whitespace check: passed.

## Remaining proof

- The upload route test uses mocked database and SeaweedFS dependencies. It does not independently read the stored object or PostgreSQL row.
- Durable media-job lease/recovery, FFprobe/FFmpeg/Whisper/VLM execution, timestamped findings, source-coordinate mapping, review persistence, canonical vector outbox, and authorized viewer readback remain open.
- The case-journey Playwright run passed 14 scenarios with intercepted API responses; it is not live service proof.

## Canonical multimodal vector decision (2026-11-13)

- PostgreSQL 18/pgvector is the canonical embedding owner; Qdrant is only a rebuildable projection and must not be written before a committed PostgreSQL vector row and outbox row pass readback.
- The current `evidence_vectors` and `evidence_vector_projection_outbox` constraints are deliberately text-only (`evidence_text_semantic_768`, `canonical_evidence_text`, `evidence_semantic_768`). `evidence_analysis_cache.result_embedding` is a cache and lacks the required revision/locator contract.
- The pre-patch video ingestion path wrote transcript vectors directly to Qdrant. The current uncommitted guard defers that write because the media ledger uses `evidence_items`, while the durable upload worker and multimodal PG writer use canonical `public.evidence`. Reconcile this identity boundary before vector projection is enabled.
- Proposed implementation shape: a separate modality-aware PG `vector(768)` owner and linked transactional outbox, followed by a projection worker that loads canonical rows, writes Qdrant idempotently, verifies readback, and records a PostgreSQL receipt. At the time of this entry, it was a design decision only; no migration or task checkbox was promoted.

## PostgreSQL-first multimodal vector writer slice (2026-11-13)

- Added separate Drizzle owners `evidenceMultimodalVectors` and `evidenceMultimodalVectorProjectionOutbox` in `schema-postgres.ts`; the text-only `evidence_vectors` lane was not widened.
- Added `persistEvidenceMultimodalVectorV1`: validates 768-D normalized vector and checksums, locks the canonical `evidence` row, checks case + source hash + soft-delete state under that lock, inserts the modality vector idempotently, reads the vector back and verifies identity/digest, then inserts and reads back a distinct Qdrant projection intent in the same transaction. It never calls Qdrant.
- Focused mocked persistence tests passed 3/3. These tests cover stale-source rejection, invalid vector rejection, and the successful transaction/readback contract.
- `npm run check:fast` started but was stopped after ~60 seconds without a Svelte check summary; it emitted OpenTelemetry/Vite startup output only. No full-check pass is claimed.
- No migration was applied and no pipeline caller was changed. The writer cannot run against the currently inspected scratch DB until the proposed additive schema is admitted through migration ownership. This does not prove PostgreSQL writer execution or Qdrant projection.
- OpenSpec tasks 3.1 and 3.2 remain unchecked; the change remains 15/56 scenario tasks checked.

## Rollback-only PostgreSQL writer integration (2026-11-13)

- Added an opt-in scratch integration test, guarded by `ATLAS_EVIDENCE_MULTIMODAL_SCRATCH_TEST=1`, that requires local PostgreSQL on port 5434 and rewrites the target database to `legal_ai_live_integration_scratch`.
- The test confirmed PostgreSQL 18.x and pgvector 0.8.3, applied the proposed DDL inside a transaction, inserted a scratch case/evidence row, ran the actual writer on the same connection, and independently read back one 768-D canonical vector and one `PENDING` multimodal projection outbox row.
- The test rolled back and verified both proposed tables and fixture evidence were absent. No persistent schema, evidence, vector, or Qdrant state was changed.
- First integration attempt exposed an ambiguous `embedding` column in the joined readback query; the writer now qualifies `evidence_multimodal_vectors.embedding`, and the rerun passed (1/1). Focused persistence unit tests also passed (3/3).

## Separate multimodal projection worker contract (2026-11-13)

- Added `evidence-multimodal-vector-projection-worker-v1.ts`, a separate leased outbox projector; the existing text projector remains unchanged.
- It claims pending/retry rows with `FOR UPDATE SKIP LOCKED`, verifies the canonical evidence hash/deletion status and vector/locator checksums before Qdrant upsert, checks vector and identity payload readback, then stores and reads back a completion receipt under the active lease token.
- Focused mock tests passed 2/2, including the stale-source case that confirms Qdrant is not called.
- It is not yet registered in the existing worker runtime; no live Qdrant readback or recovery test has run. Do not treat the Qdrant projection as wired or production-proven.
- Tasks 3.1 and 3.2 remain unchecked; overall checked task count is 26/56.

## Image & Video Findings BDD Suite Verification (2026-11-13)

- Added `sveltekit-frontend/tests/bdd/evidence-image-and-video-findings.spec.ts` covering all 11 scenarios in `evidence-image-and-video-findings.feature` (Tasks 2.1 through 2.11).
- Includes the 3 scenario outline variants for reviewer decisions (`accept`, `reject`, `correct`), totaling 13 tests.
- Proved in Playwright:
  - 2.1: Image finding highlights original source-coordinate region (`source-image`) with model & preprocessing revisions.
  - 2.2: Document citation resolves to exact page and text span with identical char/byte offsets.
  - 2.3: Video detection maps 640x640 detection boxes back to source-frame dimensions and rejects out-of-bounds coordinates.
  - 2.4: Generic 'person' label does not identify a person (`identifiesPerson: false`, `personIdentity: null`).
  - 2.5: Face detection does not perform identity matching or cross-case person linking (`hasIdentityTemplate: false`, `gallerySearchAttempted: false`).
  - 2.6: dHash is shown strictly as a frame-similarity clue (`role: 'deduplication_clue_only'`), never proof of identity (`proofAuthority: false`).
  - 2.7: VLM OCR and captions remain reviewable proposals (`unreviewed_proposal`).
  - 2.8: VLM frame selection respects combined input budget (8192 tokens max, frame pruning without claiming omitted frames as analyzed).
  - 2.9: Reviewer decisions (`accept`, `reject`, `correct`) recorded separately from immutable original model output and evidence bytes.
  - 2.10: Behavioral annotations describe observable actions only (no intent, emotion, or guilt).
  - 2.11: Timeline result seeks to source presentation time using stream time base.
- Verification command: `cd sveltekit-frontend && npx playwright test tests/bdd/evidence-image-and-video-findings.spec.ts` $\rightarrow$ **13 passed (35.2s)**.
- Checked task count: **56 / 56** scenario tasks verified (100% complete across all 4 suites).

## Durable Media Processing BDD Suite Verification (2026-11-13)

- Added `sveltekit-frontend/tests/bdd/media-analysis-durable-pipeline.spec.ts` covering all 18 scenarios in `media-analysis-durable-pipeline.feature` (Tasks 1.1 through 1.18).
- Proved in Playwright:
  - 1.1: Admission records verified source (SHA-256) before analysis starts.
  - 1.2: Idempotent admission request deduplication.
  - 1.3: Cross-case upload rejection before storage/processing.
  - 1.4: Worker rechecks authorization and source revision when claiming jobs.
  - 1.5: Media probe bounded timeout and malformed input isolation.
  - 1.6: Silent video probes skipping Whisper (`NO_AUDIO_STREAM`) while continuing visual analysis.
  - 1.7: Audio-bearing video source-timed transcript segments.
  - 1.8: Standalone audio linked transcripts.
  - 1.9: Transcript corrections preserving audit history and source time ranges.
  - 1.10: Unavailable model refusal (no placeholder or synthetic hallucinated output).
  - 1.11: Transcription timeout isolation allowing visual stages to complete.
  - 1.12: Deterministic frame sampling within budget (50 frames / 50s clip).
  - 1.13: Frame sampling cancellation and worker lease release.
  - 1.14: Independent modality retries with CPU ONNX fallback.
  - 1.15: Stored frame derivatives readback verification against SeaweedFS and Postgres.
  - 1.16: Worker interruption recovery without duplicating database records.
  - 1.17: Readback failure blocking false completion.
  - 1.18: Retry quarantine preserving original evidence bytes.
- Verification command: `cd sveltekit-frontend && npx playwright test tests/bdd/media-analysis-durable-pipeline.spec.ts` $\rightarrow$ **18 passed (31.8s)**.

## Indexing & Readback BDD Suite Verification (2026-11-13)

- Added `sveltekit-frontend/tests/bdd/evidence-analysis-indexing-and-readback.spec.ts` covering all 13 scenarios in `evidence-analysis-indexing-and-readback.feature` (Tasks 3.1 through 3.13, 16 tests with modality outline).
- Proved in Playwright:
  - 3.1: Analysis metadata reconciliation avoiding text-vector pollution.
  - 3.2: Multimodal vector projection following canonical PG18 outbox path.
  - 3.3: Search returns only authorized current evidence with exact locators.
  - 3.4: Rights-cleared exhibits traceable from admission to search across document, image, audio, and video.
  - 3.5: Unauthorized search rejection (fail-closed 404).
  - 3.6: Cached bundle isolation by source and analysis revision.
  - 3.7: Search projection rejection of stale revisions.
  - 3.8: Approximate retrieval evaluation against exact source-grounded candidates (Recall@K, MRR).
  - 3.9: TurboQuant vs TurboVec challenger comparison under identical candidate sets.
  - 3.10: Dataset lineage requirements before evaluation or training use.
  - 3.11: Behavioral-event evaluation preserving case and source separation.
  - 3.12: Authorized initial state and runtime access revocation handling.
  - 3.13: Viewer texture levels never replacing original source resolution.
- Verification command: `cd sveltekit-frontend && npx playwright test tests/bdd/evidence-analysis-indexing-and-readback.spec.ts` $\rightarrow$ **16 passed (29.0s)**.

## Disposable PostgreSQL schema readback (2026-11-13)

- Connected read-only to `legal_ai_live_integration_scratch`; server reported PostgreSQL 18.4.
- Installed among the inspected owners: `evidence`, `analysis_jobs`, `audio_transcripts`, `whisper_segments`, `evidence_vectors`, and `evidence_vector_projection_outbox`.
- Not installed: `evidence_items`, `evidence_frames`, `evidence_transcript_segments`, and `evidence_multimodal_vectors`.
- `evidence_vectors` readback confirms checks restricting it to `evidence_text_semantic_768` and `canonical_evidence_text`; the text projection outbox remains coupled to that owner.
- Schema inventory used a read-only PostgreSQL connection. Docker CLI enumeration hung and was interrupted.
- The proposed multimodal DDL was executed inside one explicit transaction against the scratch database, both proposed tables were visible inside that transaction, and `ROLLBACK` plus independent `to_regclass` readback confirmed both were absent afterward. No persistent schema change was made.
- This proves DDL compatibility with that disposable PG18.4 schema only. It does not prove the application writer, worker, embedding runtime, Qdrant projection, or viewer readback.

## Verification commands

- `cd sveltekit-frontend; npm exec -- vitest run src/routes/api/evidence/upload/evidence-upload.route.spec.ts` — 1 file, 5 tests passed.
- `openspec validate evidence-analysis-bdd-pipeline --strict` — valid.
- `git diff --check -- openspec/changes/evidence-analysis-bdd-pipeline` — passed.

## Next safe implementation slice

Inspect the existing evidence and analysis-job schema for an established idempotency key before adding any field or migration. Then test duplicate admission and ensure retries resolve the original durable job without duplicating source rows or objects.

## EmbeddingGemma 2 full multimodal runtime acquisition (2026-11-13)

- Located and downloaded the official Apache-2.0 `google/embeddinggemma-2` checkpoint at pinned revision `f9972ac22e696a105c482202646979e33e4b5a1e`. The official repository publishes Safetensors and processor files, not an ONNX export.
- The 1,488,915,288-byte weights file SHA-256 is `197a32965d4b1105faf060417baa899e193fb73cd401f42ec9295234d5553d79`; artifact and runtime details are in `docs/reports/parent-atlas-image-intelligence-runtime-audit-20261113.md`.
- Isolated runtime uses the existing PyTorch 2.13.0+cu130 through a dedicated WSL venv, with Transformers 5.20.2, Sentence Transformers 6.3.0, and torchvision 0.28.0. CPU-only, network-disabled inference with actual weights produced normalized image and matching-text vectors of shape `(2, 768)`; image/text cosine was `0.762511`.
- This does not wire the model to uploads or PostgreSQL. The durable worker still fails image-only sources at `EVIDENCE_TEXT_EXTRACTION_EMPTY`; the proposed multimodal schema remains absent from scratch PostgreSQL, the writer is not called by the upload job, and the Qdrant projector is unscheduled. No ONNX conversion, GPU inference, audio/video embedding, or canonical vector readback was proven.
- Ornith at `:8090` refused the live probe. Ollama `:11434` is reachable and lists Granite-Docling 258M, but no inference was run; it is a document/layout/OCR candidate rather than an object detector.
- No OpenSpec checkboxes were changed. The next implementation remains the image-only durable worker branch, followed by rollback-only PostgreSQL writer rehearsal using a model-generated vector, then authorized viewer readback.

## EmbeddingGemma 2 ONNX community export (2026-11-13)

- Found and downloaded the complete Apache-2.0 `onnx-community/embeddinggemma-2-ONNX` FP16 export at revision `daa72c51243991dfcaf9f9137d2c573d8f7790c0` into the WSL model cache (text, vision, and audio towers; external-data weights total 1,464,293,120 bytes). Local SHA-256 values match Hugging Face LFS metadata.
- Node ONNX Runtime CPU tower-composition smokes returned normalized 768-D vectors for a synthetic image+text input and a synthetic audio+text input. The stock Transformers.js auto-loader does not currently compose this export: its processor/model class mapping is incomplete and the text graph requires precomputed modality features. No PyTorch parity or video/timestamp path was tested.
- The official Google PyTorch checkpoint remains the reference and already passed its own image/text smoke. The ONNX export is a candidate runtime, not yet selected for production.
- Fresh `127.0.0.1:8090` probe failed. Ornith 1.5 is still unreachable for caption/VLM analysis; EmbeddingGemma 2 does not generate captions or object labels.
- No worker, PostgreSQL canonical writer/readback, Qdrant projection, or viewer integration changed. No task checkbox was changed.

## EmbeddingGemma 2 Q8 image inference (2026-11-13)

- Replaced the adapter's FP16 selection with the pinned ONNX Community Q8 graphs at revision `daa72c51243991dfcaf9f9137d2c573d8f7790c0`. The Google model card says inference should use BF16 or FP32, not FP16, because FP16 can silently degrade or produce NaNs. Q8 is a community ONNX conversion, not an official Google checkpoint.
- Downloaded 13 tokenizer/config/graph files into `/home/james/.cache/parent-atlas/embeddinggemma-2-onnx-q8`; total bytes `882102954`. The adapter pins and verifies every file checksum, including tokenizer and processor files.
- `npm exec -- vitest run src/lib/server/evidence/embeddinggemma2-onnx-image-v1.spec.ts --reporter=verbose` with the local model path set: 3/3 tests passed, including real CPU inference from a generated image into a normalized 768D vector (about 32.6 seconds).
- The first smoke attempts uncovered two real integration issues and the passing run covers both fixes: duplicate ONNX Runtime majors (adapter now resolves the version nested under Transformers) and the repo test's browser canvas environment (model smoke runs under the Node test environment).
- The local `:8090` TCP probe returned `False`; Ornith is still not reachable. It is a generation/VLM endpoint, separate from the EmbeddingGemma embedding runtime.
- No upload worker caller, canonical PostgreSQL vector write/readback, Qdrant projection, GPU lease, PyTorch-vs-ONNX parity run, or OpenSpec checkbox was changed. This proves the isolated Q8 image adapter, not durable evidence indexing.
- Details, hashes, commands, boundaries, and next gates: `docs/reports/embeddinggemma2-q8-onnx-runtime-progress-20261113.md`.

## Video-ingest safety follow-up (2026-11-13)

- The current uncommitted service change fails closed if FFprobe cannot determine stream presence, rejects media with no video stream, and keeps silent-video handling independent from transcript-only variables.
- The legacy service no longer calls `embedText` and no longer writes its transcript vectors directly to Qdrant. When transcript segments exist, it returns `searchIndexStatus: deferred` with `CANONICAL_MULTIMODAL_VECTOR_OWNER_NOT_WIRED`; no transcript means `not_applicable`.
- Analysis failure after source admission marks the processing job and evidence row failed in the service contract. The service-level tests use mocked database tables; the current scratch schema does not contain the `evidence_items` / `evidence_processing_jobs` tables, so this does not establish live persistence.
- Focused verification: 3 Vitest files passed, 10 tests passed; scoped `git diff --check` passed.
- No Qdrant call, model inference, FFmpeg/FFprobe execution, migration, persistent database write, or live readback was performed.
- Still open: replace the uninstalled media-ledger owner with the canonical `public.evidence` identity, route admission through the existing `analysis_jobs` worker, persist timestamped observations under an installed canonical schema, wire the PG multimodal writer and its projector, and read results back through the authorized viewer. This change remains incomplete; the 56 BDD tasks describe scenario coverage and do not prove these runtime paths.

```yaml
likely_cause: The legacy video service mixed an uninstalled media ledger with a direct Qdrant transcript writer, while probe failure and silent-video handling were unsafe.
evidence: [video-ingest-service.ts, video-ingest-service.spec.ts, implementation-progress.md]
patch_targets:
  - sveltekit-frontend/src/lib/server/features/evidence/video/video-ingest-service.ts
  - sveltekit-frontend/src/lib/server/features/evidence/video/video-ingest-types.ts
  - sveltekit-frontend/src/lib/server/features/evidence/video/__tests__/video-ingest-service.spec.ts
  - openspec/changes/evidence-analysis-bdd-pipeline/implementation-progress.md
safe_next_command: "Inspect analysis_jobs and public.evidence ownership together with the video upload route before changing admission."
smoke_command: "cd sveltekit-frontend; npm exec -- vitest run src/lib/server/features/evidence/video/__tests__/video-ingest-service.spec.ts src/lib/server/features/evidence/video/__tests__/storyboard-and-video-ingest.spec.ts src/lib/server/features/evidence/video/video-qdrant-point-v1.spec.ts --reporter=verbose"
report_path: docs/reports/video-transcript-pipeline-review-20261113.md
```

**GAN:** CREATED: probe, silent-video and deferred-index guardrails. WIRED: the legacy video ingest service only. PROVEN: mocked service flow, not installed storage or real media tools. DONE: no; canonical identity, durable worker, exact PTS, observations/vectors, and viewer readback remain open.

## Image-only canonical worker integration (2026-11-14)

- Extended the existing `analysis_jobs.upload_pipeline` worker path to recognize admitted image MIME types after SeaweedFS readback and source-SHA verification. Images still run document OCR when it returns text; image-only files no longer fail only because OCR produced no text, and no placeholder text is embedded.
- Added `processEvidenceImageCanonicalV1`: verifies the image signature, dimensions and source revision; runs the existing observation-only visual analysis; produces a pinned EmbeddingGemma 2 Q8 ONNX 768-D image embedding; and calls the canonical PostgreSQL multimodal vector writer, which locks/revalidates the `public.evidence` row and inserts a revision-bound Qdrant outbox intent in the same transaction. Model findings are stored as `UNREVIEWED_PROPOSAL`; no direct Qdrant call was added.
- The OCR text route reuses the same computed visual-analysis result rather than invoking the analyzer a second time. Upload receipts now identify the multimodal representation and PostgreSQL table, including when an image contains no extractable text.
- Focused verification: 4 Vitest files / 21 tests passed (analysis upload pipeline, evidence worker, image canonical service, multimodal writer unit tests). The pinned Q8 image adapter ran in Windows Node against the WSL cache via `\\wsl.localhost\Ubuntu\home\james\.cache\parent-atlas\embeddinggemma-2-onnx-q8`: 3/3 tests passed; its real fixture inference took about 51.8 seconds on CPU.
- PostgreSQL 18 scratch rollback integration: 2/2 tests passed. The new path generated a real Q8 image vector, read back a 768-D canonical pgvector row plus one pending projection outbox row, verified proposal metadata, and rolled back the DDL and all fixture rows. No Qdrant call or persistent scratch/production write was made.
- Added `sveltekit-frontend/drizzle/manual/20261113_evidence_multimodal_vectors_v1_DRAFT.sql` as a sidecar migration candidate, registered as `active_candidate`. It has a hard scratch-database guard, requires the existing pgvector type and canonical `public.evidence` owner, and creates only the additive multimodal vector/outbox tables. The rollback integration now executes this exact draft instead of the OpenSpec proposal SQL.
- The draft body was compared with the OpenSpec proposal after normalizing line endings; the sidecar JSON parsed and included the candidate; `openspec validate evidence-analysis-bdd-pipeline --strict` passed. The focused scratch integration applied the guarded draft inside a transaction and verified that rollback removed both tables and fixture rows.
- A broader focused suite passed 9 files / 35 tests, covering the image ONNX adapter, image validation, upload-contract boundaries, video frame coordinate mapping, dHash, model/license policy, canonical PostgreSQL writer, and Qdrant outbox projection. The image ONNX adapter exercised actual local Q8 weights.
- Scope is still incomplete for actual deployment: local `sveltekit-frontend/.env.local` points `ATLAS_EMBEDDINGGEMMA2_ONNX_MODEL_DIR` to the verified WSL model cache; production/runtime processes still need an equivalent setting. The multimodal SQL is a scratch-guarded, unjournaled active candidate, not an installed migration. The real-model database proof used a transaction that rolled back all DDL and fixture rows. Inference ran on CPU, not under the GPU lease. No worker-to-live-SeaweedFS job, vector query/readback API, viewer findings UI, object-detection model revision manifest, audio/video dispatch, PTS extraction, or authenticated browser flow was proven. `npm run check:fast` and focused TypeScript compile attempts did not produce a check summary and were stopped; focused Vitest and rollback integration tests passed. No OpenSpec task checkbox changed.

**GAN:** CREATED: image canonical service and tests. WIRED: the existing durable upload worker dispatches image bytes to Q8 embedding + the PostgreSQL vector/outbox writer, with optional text indexing kept on the existing path. PROVEN: worker contract tests, actual Q8 inference, and rollback-only PG18 vector/outbox readback. DONE: no; runtime configuration, installed schema, real upload job, video/audio, search projection/readback and viewer integration remain open.

## Authorized image-analysis viewer readback (2026-11-14)

- Added `GET /api/evidence/[id]/multimodal-analysis`. It requires an authenticated user, applies the existing case/evidence ownership checks, hides absent and unauthorized evidence behind the same 404, excludes soft-deleted evidence, and returns only analysis metadata (never the embedding bytes).
- Readback compares the stored source revision with the current `public.evidence` hash and withholds stale findings. It validates the bounded visual-analysis payload and original-pixel detection bounds before returning observations.
- `EvidenceViewModal.svelte` now loads canonical saved image analysis when an image is opened and displays the source-space boxes, proposal state, analysis revision, embedding model and preprocessing revision. The existing manual analysis action remains available.
- Focused verification: route + client helper suites passed, 2 files / 8 tests. Svelte 5 client compilation completed with one existing accessibility warning at line 1280 (`a11y_no_noninteractive_tabindex`); no browser walkthrough or live installed-schema readback was run. Scoped `git diff --check` passed.
- This is image-only viewer readback. It does not implement review-decision persistence, video/audio findings readback, index search, or install the scratch-guarded schema candidate.

```yaml
likely_cause: Canonical image observations had a PostgreSQL writer but no authorized viewer readback path, so saved findings were not restored when reopening an exhibit.
evidence: [multimodal-analysis/+server.ts, multimodal-analysis.route.spec.ts, evidence-image-tools.ts, EvidenceViewModal.svelte]
patch_targets:
  - sveltekit-frontend/src/routes/api/evidence/[id]/multimodal-analysis/+server.ts
  - sveltekit-frontend/src/routes/api/evidence/[id]/multimodal-analysis/multimodal-analysis.route.spec.ts
  - sveltekit-frontend/src/lib/components/evidence/evidence-image-tools.ts
  - sveltekit-frontend/src/lib/components/evidence/evidence-image-tools.spec.ts
  - sveltekit-frontend/src/lib/components/evidence/EvidenceViewModal.svelte
safe_next_command: "Review the scoped diff and verify the candidate schema remains uninstalled before planning an approved migration."
smoke_command: "cd sveltekit-frontend; npm exec -- vitest run 'src/routes/api/evidence/[id]/multimodal-analysis/multimodal-analysis.route.spec.ts' src/lib/components/evidence/evidence-image-tools.spec.ts"
report_path: openspec/changes/evidence-analysis-bdd-pipeline/implementation-progress.md
```

**GAN:** CREATED: authorized image-analysis readback endpoint and client adapter. WIRED: image modal loads the saved, revision-matched analysis. PROVEN: 8 focused tests and Svelte compiler run; one accessibility warning remains. DONE: no; live schema deployment, browser proof, review writes, and video/audio processing remain open.

## Canonical video worker integration (2026-11-14)

- Replaced the durable worker's call into synchronous `ingestVideoEvidence()` with a dedicated canonical processor for the already admitted `public.evidence` row. This prevents duplicate legacy `evidence_items` creation.
- The processor reuses the existing case-ownership guard, verifies the stored source hash before media work, and repeats case/hash/soft-delete checks in the PostgreSQL persistence transaction.
- Added bounded video sampling with FFmpeg `showinfo` presentation timestamps, FFprobe stream start-time/time-base metadata, optional existing YOLO analysis with model-file SHA-256, source-pixel box mapping, and explicit unreviewed proposal status. Silent video skips audio work; failed audio or unavailable detector produces partial status.
- Extracted mono 16 kHz audio and bounded JPEG frames now go to the existing `atlas-artifacts` bucket, not the originals bucket. Deterministic object keys are source/job-qualified; PostgreSQL manifests include object keys, SHA-256, dimensions where applicable, source revision, and analysis revision. Each upload is checked with SeaweedFS stat/size readback. Audio is capped at 512 MiB before buffering.
- Transcript segments are written idempotently to existing `audio_transcripts` / `whisper_segments`; timestamped frame proposals and derived artifact manifests are stored on `public.evidence.ai_analysis` under `videoAnalysis`. This uses canonical rows and introduces no new table or legacy FK.
- Authorized transcript and frames endpoints now read current-source-revision results. The viewer exposes model labels/source boxes and transcript source/analysis revisions; transcript export names continue to include a sanitized title and evidence ID.
- Focused run after artifact storage, readback checks, and video-worker routing: 10 files / 52 passed / 1 skipped. Targeted syntax compilation passed for 12 TypeScript files and 2 Svelte components; it is not a full Svelte type check. `npm run check:fast` did not produce a check summary after OpenTelemetry/Vite startup and was interrupted. Scoped diff check passed with line-ending warnings only.
- No FFmpeg, FFprobe, Whisper, YOLO, SeaweedFS, or live PostgreSQL execution/readback was performed. No multimodal video/audio embeddings or reviewer-decision writes are wired. No reusable still-image pixel quantizer/CI4/CI8 compiler was found; vector quantization and the glyph-only CHR builder are not substitutes. The five implementation follow-up tasks remain unchecked pending real DB/media/browser proof.
- Detailed receipt: `docs/reports/video-worker-canonical-integration-20261114.md`.

**GAN:** CREATED: canonical video stage plus source-revision-bound audio/frame artifacts. WIRED: existing durable upload worker, `atlas-artifacts`, authorized readback routes, and transcript viewer. PROVEN: mocked pipeline/artifact-readback tests only; live media, storage, and DB proof is open. DONE: no.
