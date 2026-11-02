# EmbeddingGemma 2 Relevance Evaluation Plan

**Status:** PLAN_ONLY; no new labels, model runs, or datastore writes are authorized by this document.

## Decision to answer

Does the locally imported EmbeddingGemma 2 Q8_0 artifact improve code-search relevance over the current canonical EmbeddingGemma 1 `semantic_768` recipe on the same revision-frozen corpus and independently judged queries, with acceptable runtime cost? The Apache 2.0 license is a licensing advantage, not a retrieval-quality result or a reason to change the canonical representation.

## Existing evidence and limitations

- `docs/reports/eg2-couchdb-ocr-qualification-2026-10-16.json` identifies the EG2 artifact by SHA-256 `6f1bd4ac6c5df7444f9cca7ca36cafe6cfa34cd6f49fefb1e0b4be8143aed8bc`. Its local Ollama alias is mutable. The receipt reports finite 768-D output and exact replay for a four-input probe, but `prefix: none`; it has no GPU-backend proof or peak VRAM/RAM measurement.
- The same receipt records 1,000 stored EG2 rows, 776 joined to canonical 768 rows, and a 100-query/Top-10 self-retrieval comparison. Mean overlap 0.402 and same Top-1 for 39/100 are representation agreement measures, not human relevance metrics.
- The receipt says the 1,287-pair golden-corpus relevance evaluation was not run. The existing `docs/reports/golden-review-corpus-v2.json` is blocked: 60 pending queries have no judgments; the cited database audit found zero human judgments and stale corpus/model-revision bindings. Do not relabel or reuse the derived rows as gold labels.
- Google’s EG2 documentation recommends task-specific text prompts. For code retrieval, query and document forms differ; the prior no-prefix probe cannot establish best EG2 quality. Use each model’s documented/approved recipe and report recipe revisions explicitly.
- The evidence pipeline is MIME-aware in multiple owners: `analysis-upload-pipeline-v1.ts` carries the uploaded content type; `process-evidence-document-v1.ts` has an image-specific path; `document-embed-consumer.ts` extracts text from selected document formats; the video ingest owner stores the original MIME and creates audio/frame-derived artifacts. These source paths prove different processing branches exist, not a complete per-MIME evidence-board inventory or successful native EG2 embedding for those MIME types.

## Proposed evaluation protocol

1. **Freeze corpus:** select a manageable, source-qualified code corpus; record workspace commit/revision, exact chunk IDs, each source digest and chunking revision. Exclude stale/unbound chunks. Freeze the candidate set before judging or scoring.
2. **Create query set:** recruit domain-familiar human reviewers to author real code-search tasks, stratified across routes/API behavior, symbols/callers, schemas/data lineage, tests, configuration, and cross-file workflows. Capture the task intent, not model-generated query text. Remove duplicates and near-duplicates; group related queries so they cannot leak across splits.
3. **Judge relevance:** show reviewers the query and candidate source chunks without model identity or rank. Use grades `0` irrelevant, `1` related, `2` useful, `3` directly answers. Require two independent judgments per query/chunk pair and adjudicate disagreements. Keep judgment provenance, reviewer IDs pseudonymized, rubric revision, timestamp, source/chunk digest, and workspace revision. No automatic model score is a human label.
4. **Seal splits:** maintain separate development and held-out query groups, with held-out judgments inaccessible to prompt/recipe tuning. A proposed pilot is 40–60 queries, at least 10 held out; expand if confidence intervals are too wide. These are planning targets, not claimed corpus counts.
5. **Run both encoders on identical inputs:** canonical baseline uses its frozen current recipe. EG2 uses Google’s code-retrieval query/document prompts, including title/filename formatting. Pin exact GGUF hash, tokenizer/pooling behavior, preprocessing, output dimension, normalization, and executor settings. Never mix vectors between representations.
6. **Score and compare:** report per-query and aggregate Recall@1/5/10, MRR@10, NDCG@10, and paired bootstrap confidence intervals. Also report coverage/abstentions, p50/p95 embedding and retrieval latency, throughput, peak VRAM/RAM, warm/cold load, and errors. Separate self-retrieval, semantic similarity, and human relevance results.
7. **Independent review and gate:** freeze the report and inputs, have a reviewer verify IDs, revisions, prompt recipes, metrics, and split isolation. EG2 remains challenger-only unless it improves the predeclared held-out relevance criteria without unacceptable resource or safety regressions, followed by a new representation revision, migration/re-embedding plan, rollback, and explicit admission approval.

## Evidence-board MIME cohorts

Do not treat the evidence board as one homogeneous text corpus. First create a read-only inventory grouped by normalized original MIME, evidence ID, source digest, and processing state; report counts only from a fresh snapshot. Keep the original MIME and every derivative linked by parent evidence ID, source hash, extractor/model revision, and (where applicable) page, timestamp, frame, or byte-span locator.

Evaluate distinct arms rather than pooling results:

- **Text/document MIME** (for example `text/plain`, `text/markdown`, PDF, and supported office documents): compare embeddings of the actual extracted text; record extractor, OCR/layout transformation, page spans, and text digest. A PDF-to-text or OCR derivative is still a text-input embedding, not native PDF embedding.
- **Images**: only count a native-image EG2 result after the actual local adapter accepts image bytes and returns valid finite vectors. OCR/caption text is a separate derived-text arm with its own lineage and text-embedding recipe.
- **Audio**: separate native-audio inference from Whisper transcript text. A transcript vector does not establish audio-native coverage; bind transcript segments to original audio digest and time offsets.
- **Video**: separate native-video inference from sampled frames, OCR, captions, and transcripts. Bind every derived item to the video digest plus timestamp/frame identity; don't count frame or caption vectors as native video embeddings.
- **Cross-modal retrieval** (such as text query to image/audio/video evidence): use independently judged query-to-item relevance per modality, with modality-specific denominators, metrics, and supported input contract. Do not aggregate modality scores into one headline percentage.

The current plan authorizes no live board query, upload, model inference, or vector write. Native modality support and locally accepted MIME/input formats remain `UNVERIFIED` until bounded, non-sensitive fixtures are tested under a recorded local model/runtime receipt.

## Live PostgreSQL MIME snapshot

Read-only `REPEATABLE` transaction against `legal_ai_db` PostgreSQL 18.4, querying catalog and scalar/aggregate fields only. The catalog contains `public.evidence` among the inspected candidate tables; `public.evidence_items`, `public.evidence_media_assets`, `public.evidence_transcript_segments`, and `public.evidence_frames` were absent. Therefore this is not a complete census of all source-code upload or media stores.

- `public.evidence`: 824 rows with `deleted_at IS NULL`; all 824 have `status='pending'`.
- 800 rows carry `metadata.demoSeed=true`; all 800 lack `mime_type`, `file_type`, and `type`. Their metadata keys include `demoSeed`, `entityCount`, `extractionMethod`, `textLength`, and `uploadedVia`. Treat them as seeded test/demo records, not real media candidates.
- The other 24 rows have four MIME values: 10 `application/pdf`, 10 `text/plain`, 3 `image/png`, and 1 `image/jpeg`. This classifies MIME metadata only; it does not prove their underlying object bytes are present, current, or hash-bound.
- Across all 824 active rows, `extracted_text` is nonempty for 0 and `embedding` is non-NULL for 0. These fields belong to this table snapshot only; do not infer zero coverage in other evidence stores or projections.
- A first aggregate query assumed the Drizzle `kind` column, but the live table lacks it. The follow-up used catalog-confirmed columns (`type`, `file_type`, `mime_type`, `metadata`, `deleted_at`, `extracted_text`, `embedding`) and completed read-only. No rows or services changed.

**Disposition:** `BLOCKED_NO_HUMAN_QRELS_AND_SOURCE_LINEAGE`. Before any relevance set or native modality test, reconcile the live-vs-Drizzle schema owner and establish which of the 24 unmarked records bind to accessible, hash-verified source bytes. Do not infer MIME for the 800 seeded rows or use the 24 MIME labels as a source-admission receipt.

## Required artifacts before any run

- A source/chunk manifest and checksum with no stale or ambiguous bindings.
- A human-authored query set and blinded, double-reviewed graded qrels; no fabricated labels.
- A sealed split manifest and rubric/version record.
- Exact baseline and EG2 model/recipe/executor receipts.
- A read-only evaluation runner or isolated output location; no canonical vector, Postgres, Qdrant, or cache writes.
- A report schema capturing per-query rankings, judgments, metrics, confidence intervals, resource measurements, and independent review.

## Current disposition

**BLOCKED_NO_HUMAN_QRELS_AND_SOURCE_LINEAGE.** Next actions are to reconcile the evidence-table schema owner, identify real hash-verified source bytes among the 24 MIME-tagged rows (if any), then review the query/judgment rubric and identify authorized human reviewers. Do not start a GPU/model run or create database labels until the corpus manifest and review protocol are approved.
