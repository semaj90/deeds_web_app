# Library ingestion and synthesis hardening

Date: 2026-11-14

## Result

Implemented a narrow source-bound synthesis guard using the existing library schema and access owners. After the user authorized the database step, the three reviewed library-ingestion sidecar migrations were rehearsed with rollback and applied to the verified PostgreSQL 18.4 `legal_ai_db`. No unrelated worktree changes were modified.

Document-specific synthesis now loads its candidate chunks once after authorization and before cache, retrieval, queue, or model access. It rejects an empty set, chunks whose document/revision/source hash differ from the admitted source, and sets containing more than one parser revision. It uses the uncached prompt builder and bypasses synthesis response-cache reads and writes because those caches do not carry a canonical retrieval-generation identity. The same validated chunk set is used for streaming and JSON requests.

The existing library chunk query now admits rows only when the document's canonical `processing_status` is `complete`, the selected version is current, the source hash matches, the actor/case scope is valid, and per-chunk integrity checks pass. This is the existing publication boundary; no new retrieval-generation table or document case column was invented. Case-wide synthesis remains unchanged.

## Schema and migration review

- `library_documents` has no `case_id`; `case_library_links` remains the case-link owner.
- `library_document_versions` owns the current source revision/hash.
- `ingestion_jobs` owns the durable job and existing lease/fencing fields.
- The three registered candidates were applied: lease/retry fields, nullable job/version source hashes, and nullable chunk/parser/offset provenance. Their checksums and application state are recorded in `sveltekit-frontend/drizzle/sidecar-migrations.json`.
- The configured app connection resolves to `127.0.0.1:5434/legal_ai_db`; the verified PostgreSQL server identity was `legal_ai_db`, PostgreSQL 18.4, user `legal_admin`, server `172.18.0.17:5432`.
- The approved rehearsal ran all three exact migration files inside a transaction with `lock_timeout=2500ms` and `statement_timeout=30000ms`. It checked the target columns, indexes, and row counts, explicitly rolled back, then confirmed no target columns or indexes remained and counts were unchanged.
- The migrations were then applied in one bounded transaction. A fresh PostgreSQL connection independently verified all 11 new column entries, four valid indexes, the `fencing_token >= 0` check, the `queued` status default, and unchanged counts: 0 jobs, 9 versions, 60,432 chunks.
- Legacy values were not inferred or backfilled: all 9 existing version `source_hash` values and all 60,432 existing chunk provenance tuples remain NULL; there were 0 jobs.
- Scratch PostgreSQL 18.4 proof now covers two concurrent claims from separate backend connections: both workers claimed different jobs with distinct lease tokens; the exact claim SQL was extracted from `library-ingestion-queue-v1.ts`. Both transactions rolled back and a fresh read confirmed the queue state matched its preimage.
- An expired-lease rehearsal reclaimed the same scratch job, incremented attempt/fencing values, and rejected the stale heartbeat and lease assertion. It rolled back and the fresh queue read matched its preimage.
- Read-only source/chunk/citation readback on the scratch database found 57 eligible source-bound chunks. For one authorized actor/document/revision scope, the source-qualified retrieval query returned one chunk, the citation lookup resolved that row, and SHA-256, source revision/hash, and UTF-16 offset checks passed. A fresh connection confirmed the 57-row eligible cohort. No rows were written.
- The opt-in SeaweedFS scratch integration passed two selected cases: synthetic PDF and image upload through the upload route handler, worker processing, object/hash readback, PostgreSQL job/document/node/chunk readback, source-span/citation checks, and foreign-actor denial; plus a synthetic PDF through the standalone worker process. A separate fresh PostgreSQL connection verified all three retained documents/jobs are complete and their source hashes match the receipt. Three synthetic scratch records and objects were intentionally retained. The `legal-corpus` bucket was created by the test. Embedding, Qdrant, and Neo4j providers were fixture/mocked; this was not a live HTTP server or model-backed proof.
- Receipts: `docs/reports/archive/2026-11-14-library-queue-concurrency-scratch.json`, `docs/reports/archive/2026-11-14-library-lease-fencing-scratch.json`, `docs/reports/archive/2026-11-14-library-source-citation-readback-scratch.json`, and `docs/reports/archive/2026-11-14-library-seaweed-worker-readback-scratch.json`.
- Receipt files: `docs/reports/archive/2026-11-14-library-migration-rehearsal-preimage.json` and `docs/reports/archive/2026-11-14-library-migration-apply.json`.

### Verification notes

- The first rehearsal post-check compared schema-qualified index names to `regclass::text`; that assertion failed and the transaction rolled back. A separate catalog query confirmed no candidate columns or indexes remained and row counts were unchanged. The rehearsal was rerun with a namespace/catalog join and passed.
- The first post-commit verifier expected 10 new column rows; it missed that `source_hash` appears on two tables. The transaction had committed. A fresh independent catalog query then confirmed all 11 expected column entries and all other post-checks; the corrected readback is stored in the apply receipt.

## Upload and object cleanup review

- The raw upload route streams `request.body` through the bounded hash/signature validator, with a 200 MiB file limit.
- Multipart compatibility requires a valid `Content-Length` and applies a 201 MiB request cap before `request.formData()`. It still buffers the multipart body; calling `file.stream()` afterward does not make that parse streaming.
- Upload failure paths log unique object keys for reconciliation and preserve objects. They do not blindly delete shared content-addressed data.
- No upload parser or storage cleanup behavior was changed. A streaming multipart parser or upload-session protocol remains a separate compatibility change.

## Verification

- Focused Vitest: 4 files passed, 34 tests passed. Coverage includes synthesis authorization/source binding, citations, queue lease contracts, and bounded streaming helpers. These are unit/route tests with mocked database and service boundaries; they do not establish live database concurrency or storage readback.
- `git diff --check` passed for the scoped code files.
- `npm run check:native` was run. It reported existing diagnostics in `EvidenceViewModal.svelte`, the untracked evidence detail page, the NES FSM route/runtime, and OPFS video cache. The scoped synthesis files were not named in its diagnostics.

## Changed files

- `sveltekit-frontend/src/routes/api/synthesis/generate/+server.ts`
- `sveltekit-frontend/src/routes/api/synthesis/generate/synthesis-auth.route.spec.ts`
- `sveltekit-frontend/src/lib/server/library/library-document-synthesis-context-v1.ts`
- `sveltekit-frontend/drizzle/sidecar-migrations.json`
- `openspec/changes/manual-migration-reconciliation/tasks.md` (receipt appended; no checkboxes changed)
- `docs/reports/archive/2026-11-14-library-migration-rehearsal-preimage.json`
- `docs/reports/archive/2026-11-14-library-migration-apply.json`
- `docs/reports/library-ingestion-synthesis-hardening-20261114.md`

## Status

- CREATED: document-revision synthesis preflight and focused route coverage.
- WIRED: preflight uses the canonical authorization, current-version, case-link, ingestion-completion, chunk-integrity, and citation-manifest owners.
- PROVEN: focused mocked route/queue/citation/stream tests; scoped diff check.
- DONE: migration slice yes—rollback rehearsal, application, and independent catalog/count readback succeeded. Scratch queue contention, lease fencing, synthetic upload through SeaweedFS and standalone worker, and source/chunk/citation readback are proven with fixture embedding and mocked projections. The larger ingestion/synthesis work remains incomplete: real model-backed embedding/projection, an HTTP synthesis request with authorized browser readback, and a genuinely streaming multipart path remain unproven.

## Structured handoff

- likely_cause: Document-scoped synthesis could proceed with an empty or mixed-parser chunk set and could reuse cache entries without a canonical retrieval-generation key.
- evidence: `library_documents.processing_status`, `library_document_versions`, `case_library_links`, existing ingestion lease columns, the source-bound chunk query, synthesis route, and the candidate migration registry.
- patch_targets: `sveltekit-frontend/src/routes/api/synthesis/generate/+server.ts`; `sveltekit-frontend/src/routes/api/synthesis/generate/synthesis-auth.route.spec.ts`; `sveltekit-frontend/src/lib/server/library/library-document-synthesis-context-v1.ts`.
- safe_next_command: `git diff --check -- sveltekit-frontend/src/routes/api/synthesis/generate/+server.ts sveltekit-frontend/src/routes/api/synthesis/generate/synthesis-auth.route.spec.ts sveltekit-frontend/src/lib/server/library/library-document-synthesis-context-v1.ts`.
- smoke_command: `cd sveltekit-frontend; npm exec -- vitest run src/routes/api/synthesis/generate/synthesis-auth.route.spec.ts src/lib/server/library/library-citation-provenance-v1.spec.ts src/lib/server/features/legal-corpus/legal/library-ingestion-queue-v1.spec.ts src/lib/server/library/library-bounded-stream-v1.spec.ts`.
- report_path: `docs/reports/library-ingestion-synthesis-hardening-20261114.md`.
