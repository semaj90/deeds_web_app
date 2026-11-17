## Context

The change tracks 56 acceptance scenarios across durable media processing, image/video findings, indexing/readback, and case-to-analysis navigation. Existing code includes evidence admission and revision services, a PostgreSQL-backed `analysis_jobs` worker, SeaweedFS storage, video/audio helpers, analysis pages, and source-bound contracts. These pieces do not yet establish one complete durable path from admitted media through worker output to authorized viewer readback.

The 14-case Playwright suite is an isolated UI/contract suite. Its tests intercept analysis requests and use fixture responses; passing it does not prove the corresponding production endpoints, database writes, object storage, model runtime, or worker recovery. The other three feature files are acceptance requirements and are not currently backed by an equivalent executable suite.

## Goals / Non-Goals

**Goals:**

- Reuse existing evidence, job, event, storage, revision, and projection owners after confirming their current contracts.
- Preserve admitted source bytes and bind every derived result to the evidence ID, case ID, source revision, processing/model revision, and exact page/frame/audio locator.
- Make each processing stage bounded, retryable, idempotent, and independently readable before reporting job completion.
- Keep all source and result reads case-authorized; recheck access and source revision when a worker claims work and when a viewer reads results.
- Separate model proposals from reviewer decisions and keep generic detections non-identifying.
- Use a test ladder that distinguishes browser contract tests, focused service tests, disposable PostgreSQL/SeaweedFS integration, and authorized live-service proof.

**Non-Goals:**

- Creating a competing job queue, evidence table, media store, vector authority, cache authority, or feature registry.
- Treating mocked API responses as proof of worker behavior or durable persistence.
- Enabling GPU inference, identity matching, automatic legal conclusions, model training, or unmeasured quantization as a prerequisite for basic media analysis.
- Replacing SvelteKit with a separate FastAPI/gRPC service before existing worker ownership and throughput measurements justify that boundary.

## Decisions

### 1. PostgreSQL remains the state and identity authority

Use the existing evidence and `analysis_jobs` owners for source identity, job state, retries, and canonical analysis metadata. Use the existing transactional outbox path where already supported. Reconcile schema ownership before proposing a migration; rehearse any additive migration against a verified disposable PostgreSQL database and prove rollback before separate live admission. A job is complete only after its result rows and object references pass independent readback.

**Alternative considered:** Add a new media-job table/queue. Rejected because it would split job state, retry, and authorization ownership.

### 2. SeaweedFS stores original and derived bytes separately

Keep original uploads immutable. Put bounded thumbnails, sampled frames, waveform/sprite assets, and exports in derived object keys with checksums and source-revision bindings. PostgreSQL stores their metadata and locators. Failed processing must not remove admitted originals; cleanup of a derived object is permitted only after checking that no committed row references its content-addressed key.

**Alternative considered:** Store frame/image bytes in PostgreSQL, Valkey, or Parquet. Rejected: these are not the binary-media owner; Parquet is reserved for offline analytics/export.

### 3. Processing is a modality-aware stage in the existing durable worker

The worker first claims the existing durable job, then rechecks authorization and source revision. It probes media with bounded timeouts before extraction. Silent video skips transcription while visual stages continue. FFmpeg handles stream inspection, decode, resizing, and bounded frame sampling; existing Whisper and detector/VLM helpers are invoked only when their runtime is configured and admitted. Missing runtimes produce explicit unavailable/failed stage outcomes, never fabricated success. Retries resume idempotently from durable stage receipts and do not duplicate results.

The precise claim/lease fencing semantics, FFmpeg/FFprobe paths, Whisper runtime, detector availability, and current writer owners must be verified during implementation. Do not represent a stale-job reset as a fenced lease unless the database contract proves fencing.

**Alternative considered:** Run extraction synchronously in upload routes or in browser WASM. Rejected for durable media processing: HTTP requests and browser sessions cannot own long-running processing or recovery. Browser WASM remains a local preview capability.

### 4. Findings are revision-bound proposals with source-space locators

Persist frame and image findings with evidence ID, case ID, source SHA-256/revision, analysis revision, model/preprocessing revision, and source-space coordinates. For video, preserve the original presentation timestamp and stream time base; display timecodes are derived presentation values. dHash is only a similarity/deduplication clue. Generic `person` output must not be linked to a person's identity. OCR/captions/detections remain unreviewed proposals until a separate reviewer decision is recorded with reviewer and time.

For documents, preserve the canonical extracted text revision and exact spans. UTF-16 character offsets and UTF-8 byte offsets must be mapped at the chunk boundary so both resolve to the same canonical text slice.

**Alternative considered:** Infer identity or source truth from model confidence, embeddings, hashes, or resized previews. Rejected because these signals cannot establish legal identity, provenance, or claim truth.

### 5. PostgreSQL-first indexing with rebuildable projections

PostgreSQL 18 with pgvector is the canonical owner for every admitted embedding. Qdrant is a downstream, rebuildable projection and MUST NOT receive image, frame, crop, audio, or video-window vectors until the corresponding canonical PostgreSQL row and transactional outbox row have committed and passed readback.

The current `evidence_vectors` contract remains text-only: its constraints require `evidence_text_semantic_768` and `canonical_evidence_text`. Its `evidence_vector_projection_outbox` is coupled to that table and the `evidence_semantic_768` lane. Neither that table nor `evidence_analysis_cache.result_embedding` is an acceptable canonical owner for multimodal vectors. Do not weaken the text-only constraints to make video ingestion fit.

The read-only PostgreSQL 18.4 scratch inspection found `public.evidence`, `analysis_jobs`, `audio_transcripts`, `whisper_segments`, `evidence_vectors`, and `evidence_vector_projection_outbox`. It did not find `evidence_items`, `evidence_frames`, `evidence_transcript_segments`, or multimodal-vector tables. Therefore, the installed evidence identity for this change is `public.evidence.id`; the uninstalled `evidence_items` Drizzle declarations are not an authority and must not be used as a foreign-key target.

Add an additive multimodal vector contract referencing `public.evidence(id)` (proposal SQL: `schema/evidence-multimodal-vector-v1.sql`) with tables `evidence_multimodal_vectors` and `evidence_multimodal_vector_projection_outbox`. The canonical vector row must bind evidence ID, source revision, analysis revision, modality, exact source locator, embedding/model revision, preprocessing recipe revision, and input/output checksums. Case authorization is resolved through the canonical evidence row and its case binding. The outbox must reference that canonical row and carry a distinct multimodal projection lane/contract. Persist the canonical vector and outbox event in one PostgreSQL transaction; the projection worker reads the vector back from PostgreSQL, upserts Qdrant idempotently, verifies Qdrant readback, then records its receipt in PostgreSQL. A failed or unavailable projection leaves the canonical PostgreSQL vector intact and visibly pending/retryable.

Keep Qdrant and caches rebuildable and revision-qualified. Valkey may hold short-lived progress or small cache values keyed by case/evidence/source/analysis revision; it never owns evidence or findings. Any schema change must reconcile the `evidence` versus `evidence_items` identity boundary, Drizzle ownership, migration journal, and disposable-database rollback before live admission.

**Alternative considered:** Direct Qdrant writes from extraction or worker code, or using TurboVec/quantized indexes as canonical storage. Rejected because those bypass the existing PostgreSQL authority and outbox reconciliation.

### 6. Authorized viewer readback is the completion boundary

The case Evidence Board opens the selected exhibit in the existing modality viewer. The viewer requests authorized, revision-qualified analysis and shows upload status separately from processing status. Selecting a finding seeks to its source frame/audio time or highlights its source image/document span. If analysis fails, the original remains available and the UI exposes a safe failure/retry state without leaking cross-case details.

Browser route handlers and API paths must be reconciled against current application routes before adding new routes. The existing 14-scenario Playwright suite currently uses mocked responses and is retained as a UI contract test; separate integration tests must exercise real service writers and independent PostgreSQL/SeaweedFS readback.

### 7. Test gates are scoped and evidence-bearing

Use focused tests for validation, sampling, coordinate mapping, revision isolation, idempotency, and retry logic. Use isolated Playwright configs without global seed/teardown for browser contracts. Use disposable PostgreSQL/SeaweedFS tests for durable worker and readback behavior. Use authorized live service/browser tests only with an explicit case/evidence fixture and session. Record command, exact result, revision, and limitations. Do not mark an OpenSpec implementation task complete solely from feature declarations or mocked browser tests.

## Risks / Trade-offs

- [Required media/model runtimes may be absent] → Probe and report readiness per stage; keep uploads usable and do not mark analysis complete when a stage cannot run.
- [Existing job recovery may not fence concurrent workers] → Verify database lease semantics and add fencing only through the canonical job owner; test interruption and duplicate execution.
- [Large media can exhaust memory or worker capacity] → Bound upload bodies, probe/decode time, frame count, image dimensions, process concurrency, and model input budget.
- [Derived locator drift can mislead review] → Preserve source revision, source dimensions, frame PTS/time base, and document dual-encoding spans; validate ranges before persistence.
- [Out-of-date analysis can appear current] → Key result reads and caches by source revision plus analysis/model revision; invalidate current views on source revision change.
- [Mocks can be mistaken for end-to-end proof] → Label the 14-test case suite as UI contract coverage and require separate storage/worker readback receipts.
- [Schema work can affect shared state] → Reconcile Drizzle and migration journal ownership, rehearse only on a verified disposable database, and defer production migration admission.

## Migration Plan

1. Inventory current evidence, job, outbox, frame/transcript, revision, authorization, and projection contracts and map every feature scenario to an existing owner or a specific gap.
2. Implement the smallest modality-aware worker slice against current owners; add schema changes only after reconciliation and disposable rollback rehearsal.
3. Prove one synthetic fixture through worker processing, independent PostgreSQL/SeaweedFS readback, and authorized viewer navigation. Keep production evidence out of the first fixture.
4. Expand failure/retry, authorization, source-revision, and multimodal indexing tests; run separate browser and storage-backed gates.
5. Roll back additive migrations only through their rehearsed migration procedure. Preserve admitted originals and audit rows; do not delete or rewrite originals during rollback.
6. Promote real-case processing only after an operator-approved live fixture and readiness checks for every enabled model/runtime.

## Open Questions

- Which existing route and stage writer is canonical for persisted video frames, object detections, and timestamped transcripts?
- Does the current `analysis_jobs` implementation provide a fenced lease, or only stale-job recovery?
- Which configured FFmpeg/FFprobe and Whisper binaries are available in the current runtime, and what are their bounded process controls?
- Which existing authorized viewer API can return revision-qualified findings without introducing a duplicate endpoint family?
- The architecture decision is PostgreSQL `vector(768)` plus a transactional, modality-specific projection outbox before Qdrant. The disposable PostgreSQL 18.4 schema confirms `evidence.id` as the installed evidence owner and confirms that the multimodal Drizzle tables are not installed. The draft DDL targets `evidence.id`; application integration and migration rehearsal remain open.
- Which disposable case/evidence fixture and authenticated session are available for a real storage-backed browser acceptance run?
