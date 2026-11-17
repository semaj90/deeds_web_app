# Library Revision-Bound Ingestion Progress

Date: 2026-11-13
Repository revision: `05c45c5a896fc44087e0dd0a0c9191eb363d1b25`
Scope: library document authorization, durable ingestion, chunk lineage, and document-bound synthesis. No canonical OpenSpec task checkboxes or canonical database state were changed; scratch database and synthetic-only SeaweedFS objects are retained for audit.

## Status

| Gate | CREATED | WIRED | PROVEN | DONE |
|---|---|---|---|---|
| Document read authorization | Existing shared `authorizeLibraryDocumentV1`; route denial regression covers PDF and search. | PDF/image read routes authorize before metadata/storage; search authorizes before analytics, embedding, or chunk SQL; synthesis binds actor, document, and current revision. | Mocked two-actor/two-document denial proves zero downstream calls. In scratch PostgreSQL, owner PDF/image/chunk reads succeeded; a second actor received 404 for PDF, image, and chunks. | No; authenticated browser session proof remains open. |
| Durable ingestion | Existing PostgreSQL claim/lease/fencing queue and `scripts/library-ingestion-worker.mts`; package command `worker:library-ingestion`. | Worker polls canonical `ingestion_jobs`; upload stores source then creates document/version/job/case-link rows transactionally. | PostgreSQL 18 scratch: actual upload route, SeaweedFS, queue claim, PDF/Tesseract worker, and independent readback passed. A Node child claimed a job, was terminated holding fence 1, then a new Node child reclaimed it at fence 2; the worker function completed with fixture embeddings. | No; standalone worker CLI recovery with external embeddings and browser flow remain open. |
| PDF viewer fallback | Existing native open/download links and PDF.js fallback behavior. | Viewer preserves the SeaweedFS range endpoint and browser fallback. | PDFViewer fallback spec passes; the live scratch PDF route returned exact HTTP 206 bytes and `Content-Range`. | No browser-rendered open/download proof. |
| Bounded PDF/image upload | Existing raw-body stream path validates declared length, file signature, and SHA-256; database metadata/job creation is transactional. | All three library UI call sites use `uploadLibraryFileV1` and the bounded raw-body route. | Real synthetic PDF and PNG uploads reached SeaweedFS and scratch PostgreSQL; stored object SHA-256 independently matched upload/source hash. Multipart remains a capped, buffered legacy fallback. | No production/canonical database promotion. |
| Chunk identity and source spans | Existing deterministic library UUID identity, source hash, parser revision, chunk hash, and UTF-16/UTF-8 mapper. | Worker validates each chunk against canonical extracted text before derived writes; stores UTF-16 units and page bounds. | Independent PDF/PNG bytes were re-extracted; persisted chunks matched both UTF-16 slices and UTF-8 byte slices; chunk endpoint returned matching text/spans; citation manifest resolved exact document/source identity. | No full authenticated browser citation interaction. |
| Document-bound synthesis | Existing revision/hash-aware chunk loader and citation manifest. | JSON and SSE document requests resolve the actor-visible current revision, key cache by document/revision/hash, use only exact document chunks, and bypass global LangGraph retrieval and synthesis queue. | Route happy-path and denial specs pass. | No live document query or model-bound end-to-end proof. |

## Changes in this checkpoint

- Added `sveltekit-frontend/src/routes/api/library/library-document-read-auth.route.spec.ts`. It exercises two actor/document pairs against both the PDF Range route and library search, and asserts zero metadata, SeaweedFS, embedding, analytics, or chunk-query calls after denial.
- Extended `sveltekit-frontend/src/routes/api/synthesis/generate/synthesis-auth.route.spec.ts` with a document-scoped success case. It verifies the current revision and source hash are passed to the exact-document chunk loader, and that general ACE retrieval, LangGraph, queue, and cache paths are skipped.
- `sveltekit-frontend/src/routes/api/synthesis/generate/+server.ts` contains the corresponding document-scoped admission and exact-context wiring. This file had existing worktree edits; preserve and review the full diff before staging.

## Validation evidence

Focused command (exit 0):

```text
npx vitest run src/routes/api/library/library-document-read-auth.route.spec.ts src/routes/api/synthesis/generate/synthesis-auth.route.spec.ts src/routes/api/library/upload/library-upload.route.spec.ts src/lib/server/features/legal-corpus/legal/library-ingestion-queue-v1.spec.ts src/lib/server/features/legal-corpus/legal/library-upload-format-v1.spec.ts src/lib/server/features/legal-corpus/legal/library-ingestion-identity-v1.spec.ts src/lib/components/legal/PDFViewer.spec.ts src/lib/server/library/library-citation-provenance-v1.spec.ts src/lib/server/features/legal-corpus/legal/utf16-utf8-span-bridge-v1.spec.ts src/lib/library/library-upload-client-v1.spec.ts
```

The upload-client proof is a separate focused spec:

```text
npx vitest run src/lib/library/library-upload-client-v1.spec.ts
```

Result: the combined 10-file run (including `library-upload-client-v1.spec.ts`) passed 64 tests, exit 0. These are unit/route tests with mocked storage and database dependencies; they do not prove a live upload or job recovery.

Whole-app check:

```text
npm run check
```

Exit 1: `svelte-check found 63 errors and 0 warnings in 1 file`, all reported in the unchanged `sveltekit-frontend/src/lib/server/atlas/kanban/kanban-dag-prefill-v1.ts`. No diagnostics were reported in this checkpoint's changed library route/spec files. The check emitted OpenTelemetry metrics before its final result.

## Still required before completion

1. Kill/restart a separate worker process during a leased job. The integration test now forces persisted lease expiry, reclaims with fencing token 2, rejects the stale token, and completes the job; process termination itself was not exercised.
2. Prove browser/UI citation presentation end to end. The integration test calls the citation-context service on stored rows, validates its actor-visible manifest entry, and checks exact UTF-16 and UTF-8 source-text slices.
3. Decide whether the capped-but-buffered legacy multipart branch needs replacement; the active UI callers use the raw streaming branch.
4. Reconcile the unrelated `kanban-dag-prefill-v1.ts` syntax errors before claiming a green whole-app check.

## Follow-up PostgreSQL 18.4 scratch rehearsal

The earlier readiness probe found `127.0.0.1:5434` and `127.0.0.1:8333` unavailable. On follow-up, Docker was already running; no container was started or restarted. Read-only database inventory confirmed the explicitly named `legal_ai_live_integration_scratch` database is PostgreSQL 18.4. `legal_ai_db` was not queried for application data or changed.

The three candidate sidecars were rehearsed only inside a transaction guarded by `current_database() = 'legal_ai_live_integration_scratch'`, in dependency order:

1. `drizzle/manual/20261112_library_ingestion_lease_v1.sql`
2. `drizzle/manual/20261112_library_document_revision_binding_v1.sql`
3. `drizzle/manual/20261112_library_chunk_parser_revision_v1.sql`

An initial attempt used the wrong order and exited 1 because the revision-binding sidecar indexes `available_at`, which the lease sidecar adds. An independent catalog query confirmed the failed transaction left no candidate columns or indexes. The ordered rehearsal then verified all expected columns and indexes, ran the production claim CTE against a synthetic document/job, expired and reclaimed the lease, observed fencing tokens `1` then `2`, and confirmed a stale-token update affected `0` rows. The transaction was rolled back; a separate post-rollback catalog/data query confirmed the fixture rows, `fencing_token`, `source_hash`, `chunk_hash`, and claim index were absent. Result: `claim_reclaim_fencing_and_rollback_readback_passed`, exit 0.

This proves PostgreSQL DDL compatibility and the SQL claim/reclaim/fencing behavior in a rollback-only scratch rehearsal. It does **not** prove the TypeScript worker process, a real PDF/image upload, SeaweedFS object readback, OCR, chunk persistence, or citation resolution. No persistent migration or database/object-store write was made, no service was started or restarted, and no OpenSpec status was changed. Current library UI upload callers use the raw streaming client; the buffered multipart branch is a capped legacy fallback.

## Live scratch upload and worker proof (2026-11-13)

Repository `HEAD` at the time of this proof: `05c45c5a896fc44087e0dd0a0c9191eb363d1b25`; the integration spec and report are uncommitted worktree changes.

Docker Desktop was already running. No container or application service was started or restarted. All writes below targeted only `legal_ai_live_integration_scratch` and a synthetic-only `legal-library` object prefix; `legal_ai_db` and canonical OpenSpec checkboxes were not changed.

### Scratch schema preparation

The three sidecars above were applied to `legal_ai_live_integration_scratch` in one transaction guarded by `current_database()`. Dependency order was lease, source-revision binding, then chunk parser revision. The transaction exited 0 and committed only to the scratch database. The app's Drizzle baseline also declares nullable `library_document_versions.amendment_note`; the pre-existing scratch baseline lacked it, so a guarded `ADD COLUMN IF NOT EXISTS amendment_note text` was applied to scratch only. No repository migration was added for that baseline discrepancy because the checked-in canonical Drizzle schema and `drizzle/0016_redundant_rage.sql` already contain the column.

### Executed integration

Added the opt-in test `sveltekit-frontend/src/lib/server/features/legal-corpus/legal/library-seaweed-scratch.integration.spec.ts`. It invokes the real raw upload route, streams to SeaweedFS, claims jobs through the real PostgreSQL lease queue, runs the real extraction/OCR/chunk worker, and independently queries PostgreSQL and fetches/re-hashes stored object bytes. It re-extracts each stored source and verifies every returned chunk with `String.slice(utf16Start, utf16End)` and `Buffer.subarray(utf8ByteStart, utf8ByteEnd)`. No case was supplied; the route received a synthetic authenticated actor context. The embedding provider, Qdrant, and Neo4j projections are deliberately mocked, so model identity, Qdrant persistence, and graph persistence are not proven.

Command: from `sveltekit-frontend`, `DATABASE_URL` was process-overridden to `legal_ai_live_integration_scratch`, `.env` supplied the storage connection settings without printing values, then `ATLAS_LIBRARY_SEAWEED_SCRATCH_TEST=1 node --env-file=.env ./node_modules/vitest/vitest.mjs run src/lib/server/features/legal-corpus/legal/library-seaweed-scratch.integration.spec.ts --reporter=verbose`. Final run exit 0; 1 file / 2 integration tests passed.

Final successful fixture receipts:

| Kind | Document / job ID | SHA-256 | Storage key | Bytes | Extraction | Nodes / chunks | Worker / DB timings |
|---|---|---|---|---:|---|---:|---|
| PDF | `c1003610-0c40-4a4e-84b8-0735ab1790cb` / `0fe45fc1-d6b1-486b-99f5-8e0a70725ab0` | `971cafb850c66997a92fb5f0c14bf226561da286bd34da6f06e7f289b6e9733e` | `uploads/raw/library/c1003610-0c40-4a4e-84b8-0735ab1790cb.pdf` | 1,119 | native PDF text | 1 / 1 | worker 211 ms; chunk upsert 3.9 ms; pgvector write 5.2 ms |
| PNG | `2b2948f8-4bcd-44a1-882e-131ed72aa2a6` / `d3d9748d-6e4e-4d8b-90b4-f4ff925fb6df` | `4dfdde856dc25bade95d44221bc88f5f64aded77d6ea5fecf0db5b0e5eb7253e` | `uploads/raw/library/2b2948f8-4bcd-44a1-882e-131ed72aa2a6.png` | 27,900 | native Tesseract OCR | 1 / 1 | worker 733 ms; chunk upsert 5.6 ms; pgvector write 3.6 ms |

The latest run above exercised authorized and denied production read routes against the newly stored objects: the owner received HTTP 206 for PDF bytes 0–15 with an exact `Content-Range`, the image route returned `image/png` and identical stored bytes, and chunks returned the persisted text/span. A second scratch actor received 404 for PDF, image, and chunk reads. Both sources independently read back as complete, one page, one node, one chunk, valid chunk/parser metadata, and exact UTF-16/UTF-8 source-text slices. The citation manifest's document/source identity, page bounds, UTF-16 offsets, and quote were compared to the exact stored chunk and passed. The PDF fixture exercised native PDF text extraction; the PNG reached CPU Tesseract. Embedding output remains a test fixture and Qdrant/Neo4j are mocked.

Lease recovery fixture: document `d5791c5f-d991-4c7b-97c1-f11db408714e`, job `77656778-7f0c-42e8-8b2c-7bd59a7f7c76`, source SHA-256 `cb75b9affcaf86217f13c57afd687f1661dcabec229a14d3bcf277d75e0b418a`. The persisted job was claimed with fence 1, expired, reclaimed with fence 2, rejected with the stale fence-1 token, then completed with one chunk.

Cross-process crash/reclaim fixture: document `581289a7-441e-4a91-b6e2-0fd8ca6d76e7`, job `e42af1e5-70da-4d70-9aaa-2d9a45fbce85`, source SHA-256 `ccae016ed1b2bc38527ea8a932316050a9e667b3ebf70b29bd10e3f23018f472`. A separate Node child claimed fence 1 and was terminated before processing. After lease expiry, a second Node child claimed fence 2. The parent test process then ran the production worker function with fixture embedding and independently read back `complete`, `attempt_count=2`, and `fencing_token=2`. This proves cross-process queue recovery; it does not exercise the standalone worker CLI after reclaim or an external embedding service.

### Failed attempt and retained scratch artifacts

The first raw upload attempt exposed a baseline mismatch: Drizzle's version insert includes `amendment_note`, absent from the scratch schema. PostgreSQL rolled back the document/version/job transaction after SeaweedFS had accepted the upload. Per archive-not-delete policy, its unattached object is retained: `uploads/raw/library/c2031e1b-d55c-4c1f-bb51-52fe0abf3477.pdf`, source SHA-256 `59989d6d01086a99673aa08547433765b1e5487a63ed53969af21cd74819e16e`.

An earlier parser-fixture attempt completed a synthetic PDF worker job but its assertion found the fixture text had been clipped by the one-line PDF layout. That failed-assertion row/object is retained in scratch: document `7ac3ff3d-46a2-4a78-bb47-6cebd8a45298`, job `f4c21581-4325-452b-bdc4-6fedcef9f725`, SHA-256 `9fa29a94534427b6a1843d96cf7cfe4df6d96033709bc905c2982d3399e411f1`. The preceding completed PDF/PNG run remains archived in scratch: documents `c6c73160-7543-4e58-860d-d185ec2d29de` and `4df7c18e-3848-4b96-80f0-b3f6fdd21002`. A separate read-only query found eight synthetic proof documents total in scratch, all jobs complete and each with one chunk. No test object or row was deleted.

### Validation and remaining gates

- The existing focused suite passed: 10 files / 64 tests, exit 0.
- Follow-up focused checks passed: PDF viewer native fallback, two-user library read authorization, and UTF-16/UTF-8 span bridge; 3 files / 10 tests, exit 0.
- The latest opt-in live scratch integration passed: 1 file / 3 tests, exit 0, including child-process termination/reclaim and owner-versus-foreign-actor PDF/image/chunk reads.
- The citation readback asserts exact page start/end, UTF-16 character start/end, and quoted text against the persisted chunk.
- Focused command `npx svelte-check-native --workspace . --tsconfig C:\Users\james\AppData\Local\Temp\atlas-library-focused-tsconfig-8fb433bf1cc54a1f8bac68ed9c0982b6.json --output machine` passed on 2,111 scanned files with 0 errors and 0 warnings. The temporary config includes `src/app.d.ts` and the integration spec. It caught and verified the fix for converting Node `Buffer` into a web-compatible `Uint8Array` request body. The full project configuration still reports the unrelated Kanban parser failure below.
- A headless browser run was not made: neither local app port 5173 nor preview port 4173 had a listener. No app service was started under the no-restart constraint.
- Latest `npm run check:native` exited 1 after scanning 2,112 files: 24 errors, 0 warnings, all parser diagnostics in the unrelated `src/lib/server/atlas/kanban/kanban-dag-prefill-v1.ts`. No changed library file was reported. The file was left untouched to preserve concurrent work.
- `npm run check` exited 1 with 63 errors and 0 warnings, all in the unrelated, unchanged `src/lib/server/atlas/kanban/kanban-dag-prefill-v1.ts`; no changed library file was listed.
- CREATED: real scratch integration test and scratch-only sidecar schema.
- WIRED: actual raw upload route → SeaweedFS → PostgreSQL queue claim → PDF/Tesseract extraction → UTF-16 chunk spans → PostgreSQL chunks → authorized PDF Range/image/chunks read routes; model/vector/graph lanes remain mocked.
- PROVEN: synthetic PDF and PNG source hashes and stored bytes, completed jobs, chunk metadata, citation-context resolution, authorized read-route bytes/content, UTF-16/UTF-8 text slices, lease expiry, child-process termination, second-process reclaim, and stale fencing rejection independently read back.
- DONE: no. Standalone worker CLI recovery with external embeddings, authenticated browser citation interaction, canonical task status, and production promotion remain open. No canonical task status was changed.

## Follow-up checkpoint (2026-11-13, Docker already running)

Docker Desktop was already running; the existing PostgreSQL 18.4, SeaweedFS, Qdrant, Valkey, and other containers were reused. No service was started or restarted. A read-only query to `legal_ai_live_integration_scratch` reported 27 ingestion jobs/documents, all jobs `complete`, with zero queued or running jobs.

The standalone worker CLI remains a concrete wiring gap. A guarded launch against the scratch database using the package's current `tsx scripts/library-ingestion-worker.mts` entry failed before worker startup with `ERR_MODULE_NOT_FOUND: Cannot find package '$app' imported from .../src/lib/server/llm/runtime-contract.ts`; it claimed no job. A second attempt using `vite-node --config vite.config.ts` did not reach the worker's startup line within 30 seconds and was stopped; it did not claim a job. The package command was not changed because neither runner has been proven safe and functional. The production entrypoint needs an explicit SvelteKit-aware bootstrap or import-safe dependency boundary, plus a test-only provider seam before a standalone processing test can avoid real embedding/Qdrant calls.

Browser check correction: port 5173 now accepts connections, but `GET http://localhost:5173/evidence` returned HTTP 200 with a zero-byte body, and the browser showed only a blank page. This is not browser validation of the upload/read experience. The earlier note that no listener was present is stale; the current blank response is the observed blocker. No service was started, no live or canonical database was queried or changed, and no scratch objects were added in this checkpoint.

**Current gate update:** CREATED/WIRED/PROVEN remain as above for the route-to-worker-function scratch integration. Standalone worker CLI processing remains unproven and is now confirmed to have a startup-resolution defect. DONE remains no.

## Worker bootstrap follow-up (2026-11-13)

Fixed the standalone CLI resolution gap found above. Added `scripts/library-ingestion-worker-bootstrap.mjs` to load the repository's runtime environment before importing the worker, plus `scripts/library-ingestion-worker-app-environment-loader.mjs` to provide the server-only `$app/environment` values required by the worker's transitive imports. Updated `worker:library-ingestion` to use that bootstrap. Added opt-in `ATLAS_LIBRARY_INGESTION_ONCE=1`, which exits after one poll/claim attempt (or after processing at most one job); the default worker remains continuous.

Scratch-only one-pass launch used the same Node/tsx import command as the package script, with `DATABASE_URL` explicitly rewritten to `legal_ai_live_integration_scratch` and `ATLAS_LIBRARY_INGESTION_ONCE=1`. Exit code 0; output was `started` then `stopped`; independent readback remained PostgreSQL 18.4 scratch, 27 total jobs and 0 queued/running. No job existed to process, and therefore no embedding, Qdrant, Neo4j, or source-object writes occurred. This proves worker bootstrap, scratch target selection, one-poll exit, and empty-queue readback; it does not prove standalone processing after a claim.

Validation after the change: focused library tests, 8 files / 47 tests, exit 0. Focused `svelte-check-native` configuration, 2,111 files / 0 errors / 0 warnings, exit 0. The full-project checker remains independently blocked by the pre-existing unrelated Kanban parser errors described above. Browser `/evidence` remains unverified because its current local server response is empty HTTP 200.

## Standalone worker processing proof (2026-11-13)

Extended the existing opt-in PostgreSQL 18/SeaweedFS integration spec. It now launches the actual standalone worker CLI against one freshly uploaded synthetic PDF. The subprocess uses deterministic fixture modules for embeddings, Qdrant, and Neo4j; no live model or projection service is called. Fixture-provider mode is guarded before worker imports: it requires `ATLAS_LIBRARY_SEAWEED_SCRATCH_TEST=1` and the exact `legal_ai_live_integration_scratch` database name. A negative subprocess case points at `legal_ai_db` and proves the guard exits before any database client initializes.

Focused integration command (app root): the existing `node --env-file=.env --input-type=module -e ...` runner set `DATABASE_URL` to `/legal_ai_live_integration_scratch`, set `ATLAS_LIBRARY_SEAWEED_SCRATCH_TEST=1`, and ran `vitest run src/lib/server/features/legal-corpus/legal/library-seaweed-scratch.integration.spec.ts --reporter=verbose`. Exit 0; 1 file / 5 tests passed. This includes the upload-route PDF+PNG extraction/readback, stale lease fencing, cross-process lease recovery, non-scratch fixture-provider refusal, and standalone CLI processing.

Standalone receipt: document `1e31f75f-a5c6-448f-a642-f7241b54c511`, job `841d95a3-c484-48bc-b244-34c325042c2e`, source/object SHA-256 `b8b55d32e386e38d9fdfa6ed7fbba3c2830d4850cc6d0e2655a693cd19ecb676`, 1,122 bytes. Independent read-only SQL readback on PostgreSQL 18.4 scratch returned `status=complete`, `processing_status=complete`, fencing token 1, one node, and one chunk. The original object was fetched from SeaweedFS and rehashed; extracted text matched the persisted chunk and its UTF-16 span. The completed job's timing receipt: total pipeline 1,230.2 ms; SeaweedFS read/hash 194.4 ms; extraction 961.7 ms; chunk/span validation 4.8 ms; PostgreSQL node upsert 5.8 ms; chunk upsert 4.4 ms; pgvector update 4.6 ms; fixture embedding 0.3 ms; fixture Qdrant 0.4 ms; fixture Neo4j 2.8 ms.

The negative guard test exited 1 with `LIBRARY_WORKER_FIXTURE_PROVIDERS_REFUSE_NON_SCRATCH_DATABASE`, and emitted no database-client target line. This proves test fixtures cannot silently be used against the canonical database through this bootstrap.

Post-change focused native check included the integration spec and worker entry point: 2,111 scanned files, 0 errors, 0 warnings, exit 0. Scoped whitespace scan and scoped `git diff --check` passed. The earlier standalone-startup gap is resolved for the scratch fixture path. External EmbeddingGemma production output, real Qdrant/Neo4j projection, live authenticated browser citation interaction, and canonical OpenSpec task status remain unproven/unchanged.

## Evidence page route correction (2026-11-13)

The follow-up browser check exposed why `/evidence` had appeared blank: `src/routes/(app)/evidence/+server.ts` defined a GET handler that returned an empty HTTP 200 response. That handler did not pass the request through to the Svelte page. Removed the GET handler and retained the existing POST upload handler.

Verification after the change:
- `GET http://localhost:5173/evidence` with `Accept: text/html` returned HTTP 200, `text/html`, 29,923 UTF-8 bytes, and page title `YoRHa Legal AI - Evidence Management System`.
- Browser inspection showed the hydrated Evidence Management page, evidence list, filters, and upload controls. No browser upload was submitted because that running application is configured against canonical state; this task permits scratch-only writes.
- `npx vitest run 'src/routes/(app)/evidence/evidence-upload.action.spec.ts'` passed 1 file / 2 tests (exit 0).
- Focused `npx svelte-check-native --workspace . --tsconfig C:\Users\james\AppData\Local\Temp\atlas-library-focused-tsconfig-8fb433bf1cc54a1f8bac68ed9c0982b6.json --output machine` passed 2,111 files, 0 errors, 0 warnings (exit 0).
- Scoped `git diff --check -- 'sveltekit-frontend/src/routes/(app)/evidence/+server.ts'` exited 0.

This repairs page rendering and verifies existing upload-action tests. It does not prove an authenticated browser upload, nor change the ingestion proof boundary above. The Docker services were already running and were reused; no services were started or restarted. Canonical databases and OpenSpec task checkboxes remain unchanged.

## Goal-scope revalidation (2026-11-13, latest run)

Current source revision: `05c45c5a896fc44087e0dd0a0c9191eb363d1b25` (worktree remains uncommitted and contains unrelated concurrent edits; none were staged or reset).

Docker Desktop was already running. Read-only container status showed `legal-ai-postgres` healthy and the SeaweedFS master, volume, filer, and S3 gateway healthy. The integration runner began with the configured database `legal_ai_db`, then rewrote only the child test process URL to the exact `legal_ai_live_integration_scratch` database before starting Vitest. The fixture-provider guard remains enabled and refuses any other database. No canonical database was modified and no service was restarted; only the named scratch database received test fixtures.

Fresh verification:
- Scratch integration: `node --env-file=.env --input-type=module -e "import { spawnSync } from 'node:child_process'; const u=new URL(process.env.DATABASE_URL); u.pathname='/legal_ai_live_integration_scratch'; if (decodeURIComponent(u.pathname.slice(1)) !== 'legal_ai_live_integration_scratch') process.exit(90); process.env.DATABASE_URL=u.toString(); process.env.ATLAS_LIBRARY_SEAWEED_SCRATCH_TEST='1'; const r=spawnSync(process.execPath,['./node_modules/vitest/vitest.mjs','run','src/lib/server/features/legal-corpus/legal/library-seaweed-scratch.integration.spec.ts','--reporter=verbose'],{stdio:'inherit',env:process.env}); process.exit(r.status ?? 91);"` — exit 0, 1 file / 5 tests. Actual PDF + PNG upload/processing, real SeaweedFS object fetch/hash verification, PostgreSQL 18 job/node/chunk readback, lease expiry, terminated-worker reclaim, stale-fence rejection, non-scratch refusal, and standalone worker CLI processing all passed. The standalone worker used fixture embedding, Qdrant, and Neo4j providers only.
- Latest scratch PDF receipt: document `ea19436f-0c51-4ae6-bb94-a2cf3da889bd`, job `508441ca-110f-4d9b-97f0-47b3fc271f9c`, SHA-256 `22089ae5a481bbc70fdd0ac2a1f5fa09325a95cb1bfe3760e5d848ad9aceadf2`, 1,124 bytes, one node and one chunk. Ingestion timings: 241 ms total; extraction 163.5 ms; storage read/hash 5.4 ms; span validation 4.3 ms; PostgreSQL node/chunk upserts 20.3/4.7 ms; pgvector upsert 5.3 ms; fixture embedding 0.4 ms.
- Latest scratch image receipt: document `05af4d74-40ed-4d33-9c26-95164a58b7ad`, job `b4f64f57-2b79-49e0-9502-2ad4f2f3c12f`, SHA-256 `3d9e38f690cedb5f28eb72dbfdc265819389fe39ed191836173a64e8ad9103bf`, 27,340 bytes, one node and one chunk. Ingestion timings: 895.1 ms total; OCR/extraction 850.1 ms; storage read/hash 4.4 ms; span validation 1.0 ms; PostgreSQL node/chunk upserts 4.3/3.0 ms; pgvector upsert 2.9 ms; fixture embedding 0.1 ms.
- Standalone CLI receipt: document `71c930c0-ff3b-4081-a912-a26ba863c9e1`, job `3bd1ed00-8ee2-4fa2-b0b8-f291e1bacc87`, SHA-256 `063245bb4b620d5d886fabbe779677753d25a7f4a68e9adeb2d22d82cf2dca07`, 1,120 bytes, fence 1, one node and one chunk. The worker subprocess completed and the test runner independently queried PostgreSQL and fetched/rehashed the SeaweedFS object.
- Auth/upload route suites: `npx vitest run src/routes/api/library/library-document-read-auth.route.spec.ts src/routes/api/synthesis/generate/synthesis-auth.route.spec.ts src/routes/api/library/upload/library-upload.route.spec.ts --reporter=verbose` — exit 0, 3 files / 20 tests. Foreign document/case and stale revision requests are rejected before their downstream spies; authorized synthesis stays bound to its document revision.
- Span, queue, identity and citation suites: `npx vitest run src/lib/server/features/legal-corpus/legal/utf16-utf8-span-bridge-v1.spec.ts src/lib/server/features/legal-corpus/legal/library-ingestion-queue-v1.spec.ts src/lib/server/features/legal-corpus/legal/library-ingestion-identity-v1.spec.ts src/lib/server/library/library-citation-provenance-v1.spec.ts --reporter=verbose` — exit 0, 4 files / 27 tests.
- PDF.js native fallback: `npx vitest run src/lib/components/legal/PDFViewer.spec.ts --reporter=verbose` — exit 0, 1 file / 1 test. Direct browser-tab open and download remain available when PDF.js fails.
- Evidence page/upload regression: `npx vitest run 'src/routes/(app)/evidence/evidence-upload.action.spec.ts'` — exit 0, 1 file / 2 tests. `/evidence` HTML request returned 200 with 29,923 bytes and the expected page title; browser inspection showed the hydrated page and controls. No upload was submitted through the canonical app.
- Focused native checker: `npx svelte-check-native --workspace . --tsconfig C:\Users\james\AppData\Local\Temp\atlas-library-focused-tsconfig-8fb433bf1cc54a1f8bac68ed9c0982b6.json --output machine` — exit 0, 2,111 files, 0 errors, 0 warnings.
- Scoped whitespace validation for the evidence route and this report — exit 0.

### Goal status by proof level

- **CREATED:** Reused the repository's existing document-access, ingestion queue/worker, ingestion-identity, source-offset, and citation-provenance owners; did not add duplicate queue or authorization owners.
- **WIRED:** Upload admission → SeaweedFS object → durable PostgreSQL job/lease → standalone worker → extracted text/OCR → revision-qualified nodes/chunks/embeddings → authorized read/synthesis paths. The `/evidence` page GET no longer returns an empty response; the POST route is preserved.
- **PROVEN:** Scratch PDF and PNG cases, worker process recovery, hash and chunk-span readback, foreign access rejection, synthesis revision binding, native PDF fallback, and focused native checks passed as listed above.
- **DONE:** No. Production EmbeddingGemma output and real Qdrant/Neo4j projection were intentionally not invoked. Authenticated browser upload against an isolated app instance and a real model-backed cited-answer retrieval have not been proven. Canonical OpenSpec task checkboxes remain unchanged.

### Queue-owner reconciliation

The repository registers `document.parse` as a generic workflow command/routing key, but the inspected source has no library-ingestion consumer for that RabbitMQ route. The proven library path therefore uses the existing `ingestion_jobs` table as its durable queue: the source document, version, job, and optional case link commit in one PostgreSQL transaction after the bounded SeaweedFS stream succeeds; the standalone worker claims that row with a lease and fencing token. I did not add a second queue or emit an unconsumed `document.parse` event. The scratch tests prove this polling-worker path survives process termination and completes after lease reclaim. If acceptance specifically requires RabbitMQ `document.parse` delivery, that remains a separate integration gate requiring a real consumer owner and end-to-end delivery/readback.

### Generic outbox dispatch audit (2026-11-13)

A repository-wide source search for `document.parse`, `documentParse`, and `atlas.work.document.parse` found only the generic command enum, the generic workflow outbox routing map, and the topology routing key. It found no library-ingestion RabbitMQ consumer. The deployed library upload code and standalone worker instead share the existing `ingestion_jobs` PostgreSQL queue, which has already been proven in the scratch run. This confirms the boundary: database job dispatch/recovery is implemented and proven; RabbitMQ outbox delivery for library ingestion is not wired. Do not describe those as the same dispatch mechanism. No schema migration or outbox event was added because there is no consumer to process it and the existing job queue is the current working owner.

### Transactional outbox feasibility detail

The generic `enqueueTask()` in `src/lib/server/queue/outbox.ts` starts its own `db.transaction()` and inserts a `workflow_tasks` row plus `workflow_outbox` row. Its task schema requires an existing `workflow_runs` row (`run_id` foreign key), and the current library upload transaction does not create such a run. Calling `enqueueTask()` after the upload commit would introduce the exact crash window the requested atomic admission is intended to prevent. Calling it before would create dispatch for an upload that may later roll back. Repository search also found no `document.parse` consumer to process that event. Therefore the correct next engineering change—if RabbitMQ dispatch remains mandatory—is a reviewed shared-transaction enqueue API plus a real idempotent library parser consumer and scratch integration proof. Do not invoke the current helper from the upload route as a superficial fix.

### 2026-11-13 continuation — transactional Rabbit wake-up projection

This entry supersedes the earlier statements above that no library `document.parse` outbox row or consumer exists. Docker Desktop was already running; existing services were reused. No service was started or restarted, and no task was published to RabbitMQ.

- The upload transaction now inserts the canonical `ingestion_jobs` row and a `workflow_runs` / `workflow_tasks` / `workflow_outbox` wake-up projection in the same PostgreSQL transaction. `enqueueTaskInTransaction()` reuses the current outbox owner and does not open a nested transaction. The ingestion job remains canonical for retries, leases, and completion.
- The optional Rabbit consumer validates the `document.parse` envelope, capability, worker class, and task/job identity. Its targeted claim filters on job ID, document ID, source SHA-256, and a stored document version with the matching source hash before acquiring a lease. Polling remains the recovery path; Rabbit is not a second canonical job store.
- The opt-in scratch test now forces `DATABASE_URL` to `legal_ai_live_integration_scratch` in test setup before app or database modules import. This was added after a failed guard exposed that old static imports connected to `legal_ai_db` for a read-only assertion before checking the scratch database. No write was made to `legal_ai_db`.
- Scratch PostgreSQL 18 + SeaweedFS integration: `ATLAS_LIBRARY_SEAWEED_SCRATCH_TEST=1; npx vitest run src/lib/server/features/legal-corpus/legal/library-seaweed-scratch.integration.spec.ts --reporter=verbose` — exit 0, 1 file / 5 tests. It independently read back one task and one undelivered outbox message per PDF/image upload, then observed the task become `succeeded` after worker completion. It also proved source-object hashes, chunk spans, lease recovery, process-death recovery, and stale fencing rejection. Embedding, Qdrant, and Neo4j used fixtures; no Rabbit publish occurred.
- Queue/outbox/consumer tests: `npx vitest run src/lib/server/features/legal-corpus/legal/library-ingestion-queue-v1.spec.ts src/lib/server/queue/outbox-authority.spec.ts src/lib/server/queue/library-document-parse-consumer-v1.spec.ts --reporter=verbose` — exit 0, 3 files / 20 tests.
- Full `npm run check` was started after these edits but interrupted before completion because it ran over four minutes, its Node process reached approximately 6.5 GiB RSS, and Windows reported about 1 GiB free physical memory. It produced no type-check summary or exit code; this is not a passing check.
- Focused native checker after the same edits: `npx svelte-check-native --workspace . --tsconfig C:\Users\james\AppData\Local\Temp\atlas-library-focused-tsconfig-8fb433bf1cc54a1f8bac68ed9c0982b6.json --output machine` — exit 0, 2,111 files, 0 errors, 0 warnings.

**CREATED:** Caller-owned transactional outbox insertion helper, bounded `document.parse` consumer contract, target-specific worker claim, and scratch assertions for task/outbox persistence.

**WIRED:** Upload transaction → canonical PostgreSQL ingestion job plus outbox wake-up → optional Rabbit consumer → same leased ingestion job; existing DB polling remains available for restart/recovery.

**PROVEN:** Scratch database/storage path, outbox/task persistence and completion projection, standalone polling worker, and mocked consumer contract passed. This does not prove a real Rabbit publish/consume round trip.

**DONE:** No. Production Rabbit dispatch was not activated or exercised; real model/Qdrant/Neo4j behavior, authenticated browser upload, and canonical OpenSpec completion remain outside this proof. Canonical database state and task checkboxes remain unchanged.

**likely_cause:** Library ingestion previously relied on the durable PostgreSQL job table but had no transactional workflow wake-up projection or consumer binding for `document.parse`.

**evidence:** `sveltekit-frontend/src/lib/server/features/legal-corpus/legal/ingestion-worker.ts`, `sveltekit-frontend/src/lib/server/queue/outbox.ts`, `sveltekit-frontend/src/lib/server/queue/library-document-parse-consumer-v1.ts`, `sveltekit-frontend/scripts/library-ingestion-worker.mts`, and the scratch integration output above.

**patch_targets:** `sveltekit-frontend/src/lib/server/features/legal-corpus/legal/ingestion-worker.ts`; `sveltekit-frontend/src/lib/server/queue/outbox.ts`; `sveltekit-frontend/src/lib/server/queue/library-document-parse-consumer-v1.ts`; `sveltekit-frontend/scripts/library-ingestion-worker.mts`; scratch and test setup/specs.

**safe_next_command:** `git diff --check -- sveltekit-frontend/src/lib/server/queue sveltekit-frontend/src/lib/server/features/legal-corpus/legal sveltekit-frontend/scripts/library-ingestion-worker.mts sveltekit-frontend/src/test-setup.ts`

**smoke_command:** `ATLAS_LIBRARY_SEAWEED_SCRATCH_TEST=1 npx vitest run src/lib/server/features/legal-corpus/legal/library-seaweed-scratch.integration.spec.ts`

**report_path:** `docs/reports/library-revision-bound-ingestion-progress-20261113.md`

### 2026-11-13 final V1 proof audit

This is the latest verification snapshot for the revision-bound upload/ingestion V1 slice. It supersedes older “not proven” statements where a newer headless or scratch proof is listed above.

- Route authorization, upload admission, queue/fencing, and citation gate: `npx vitest run src/routes/api/library/library-document-read-auth.route.spec.ts src/routes/api/synthesis/generate/synthesis-auth.route.spec.ts src/routes/api/library/upload/library-upload.route.spec.ts src/lib/server/features/legal-corpus/legal/library-ingestion-queue-v1.spec.ts src/lib/server/library/library-citation-provenance-v1.spec.ts --reporter=verbose` — exit 0, 5 files / 40 tests. Covers two actors/two foreign documents, case and revision denial, zero downstream calls, admitted-only synthesis, upload validation, idempotent leases, stale fencing, and revision-bound citation verification.
- Current real scratch integration: `$scratchConnection = (node -e 'const fs=require("fs"),d=require("dotenv");let raw=process.env.DATABASE_URL; if(!raw){for(const p of [".env.local",".env"]) if(fs.existsSync(p)){const x=d.parse(fs.readFileSync(p)); if(x.DATABASE_URL){raw=x.DATABASE_URL;break;}}} const u=new URL(raw||""); u.pathname="/legal_ai_live_integration_scratch"; process.stdout.write(u.toString())' | Select-Object -Last 1); $env:DATABASE_URL=$scratchConnection; $env:POSTGRES_URL=$scratchConnection; $env:ATLAS_LIBRARY_SEAWEED_SCRATCH_TEST='1'; npx vitest run src/lib/server/features/legal-corpus/legal/library-seaweed-scratch.integration.spec.ts --reporter=verbose` — exit 0, 1 file / 5 tests, PostgreSQL 18 scratch and real SeaweedFS. PDF `e87bdc06-b36e-4ca4-8bec-2956cb4170f2`, SHA-256 `8e1f9ceea55963be37ec6d2b0de0bc4a2c2a440e8a8495d9bf7b54015513708a`; image `30f0c6a1-fb5f-4778-8e68-43f3fd48994d`, SHA-256 `cf0e054763898cac2dd327e83a6d83f522e8cb5a962a2a1589de004ed6acb43c`; both stored, extracted, chunked, and independently read back. The image took 1,448.5 ms in extraction/OCR; PDF extraction took 389.3 ms. Child-process death/reclaim, stale fencing, and standalone CLI processing passed. Embedding was fixture-only; Qdrant and Neo4j were mocked.
- Identity, offset bridge, and PDF native fallback: `npx vitest run src/lib/server/features/legal-corpus/legal/library-ingestion-identity-v1.spec.ts src/lib/server/features/legal-corpus/legal/utf16-utf8-span-bridge-v1.spec.ts src/lib/components/legal/PDFViewer.spec.ts --reporter=verbose` — exit 0, 3 files / 11 tests.
- Browser proof: the dedicated Playwright scratch run recorded above passed 1 test; it exercised Chromium file selection through the real upload client and real upload handler, then independently read the PostgreSQL 18 scratch records. It does not test the app session middleware.
- Focused native check: exit 0, 2,111 files, 0 errors, 0 warnings. Full `npm run check` remains unverified because the earlier run was interrupted for memory pressure.
- No live database migration, canonical task checkbox/status change, model/GPU invocation, Rabbit publish, commit, or staging occurred during these proof runs. A prior failed app-start attempt's three consumed expired `analytics.track.dlq` events and one retained duplicate SeaweedFS object are documented in the previous section for operator review.

**CREATED:** Revision-bound document and chunk identity, source-offset bridge, durable ingestion/recovery, citation context gate, native PDF fallback, and scratch/browser proof owners exist.

**WIRED:** Authorized upload → bounded SeaweedFS stream and source hash → atomic PostgreSQL document/version/job/outbox admission → leased worker/OCR/extraction → deterministic source-qualified chunks and 768D fixture-backed pgvector rows → authorized reads and citation manifest verification. Optional Rabbit wake-up dispatch is wired, but no real Rabbit round trip is claimed.

**PROVEN:** The scoped V1 contract passed 40 focused route/queue/citation tests, 5 real PostgreSQL 18 + SeaweedFS scratch integration tests, 11 identity/span/fallback tests, 1 headless real-handler browser test, and a 2,111-file native type check. Canonical IDs and task status remain untouched. Production EmbeddingGemma/Qdrant/Neo4j retrieval, full app authentication middleware in browser, Rabbit publish/consume, and the full npm check are not proven.

**DONE:** V1 scratch-verified implementation objective: yes. Production promotion or canonical OpenSpec completion: no; those remain separate and unauthorized outcomes.

**likely_cause:** Earlier evidence stopped at mocks and route-level fixtures, leaving the actual browser upload-to-storage and worker-to-citation chain only partially connected.

**evidence:** This report’s Playwright and scratch receipts; current route/queue/citation, identity, offset, and PDF fallback test outputs; focused native checker output.

**patch_targets:** `sveltekit-frontend/tests/e2e/library-upload-live-scratch.spec.ts`; `sveltekit-frontend/playwright.library-scratch.config.ts`; scratch, upload, ingestion, authorization, citation, and PDF viewer owners listed above; this report.

**safe_next_command:** Review the report and the documented Rabbit DLQ / retained scratch object; preserve both pending operator review.

**smoke_command:** Use the scratch-only Playwright command and PostgreSQL integration command recorded above; both assert/force the named scratch database.

**report_path:** `docs/reports/library-revision-bound-ingestion-progress-20261113.md`

### 2026-11-13 continuation — headless browser upload against scratch

The earlier statement that an authenticated browser upload had not been proven is superseded by the isolated Playwright proof below. It exercises the browser upload client and the real SvelteKit `POST /api/library/upload` handler, using an in-process Vite SSR module harness rather than booting the app's global hooks. The handler stores the bytes in SeaweedFS and writes only to the named PostgreSQL scratch database. This does not exercise browser authentication middleware; the harness supplies a fixed fixture actor directly to the route event.

- Command: `$scratchConnection = (node -e 'const fs=require("fs"),d=require("dotenv");let raw=process.env.DATABASE_URL; if(!raw){for(const p of [".env.local",".env"]) if(fs.existsSync(p)){const x=d.parse(fs.readFileSync(p)); if(x.DATABASE_URL){raw=x.DATABASE_URL;break;}}} const u=new URL(raw||""); u.pathname="/legal_ai_live_integration_scratch"; process.stdout.write(u.toString())' | Select-Object -Last 1); $env:DATABASE_URL=$scratchConnection; $env:POSTGRES_URL=$scratchConnection; $env:ATLAS_LIBRARY_PLAYWRIGHT_SCRATCH='1'; $env:OTEL_SDK_DISABLED='true'; npx playwright test --config playwright.library-scratch.config.ts tests/e2e/library-upload-live-scratch.spec.ts --reporter=line` — exit 0, 1 test passed in 1.2 minutes.
- Independent database identity check confirmed `legal_ai_live_integration_scratch`, PostgreSQL major 18. Browser upload round trip: 595 ms. Document `7d7a0baa-c460-40a6-8b9d-973b6c113402`, job `045a3751-9f66-4a3a-bb56-f9dbf3b7d61b`, source SHA-256 `d03ae5f1033809ca8560dedef27401ff68af3b90c90a984ffebfc5e925c23a98`. The route returned 202; independent SQL readback matched the exact source hash and `image/png` type and found the queued `document.parse` workflow task/outbox row. Rabbit publish was not exercised. This browser test did not independently fetch/re-hash the SeaweedFS object; the separate scratch worker integration above does.
- Final focused type check after adding the Playwright fixture: `npx svelte-check-native --workspace . --tsconfig C:\Users\james\AppData\Local\Temp\atlas-library-focused-tsconfig-8fb433bf1cc54a1f8bac68ed9c0982b6.json --output machine` — exit 0, 2,111 files, 0 errors, 0 warnings. Scoped `git diff --check` — exit 0. Full `npm run check` was not rerun; the prior attempt in the preceding entry was interrupted at high memory use.
- The first attempt used a temporary app web server. A shell quoting issue prefixed the database URL with a Node env-injection banner, so app config saw an invalid target. Although the app's Postgres calls failed, startup connected to the configured RabbitMQ and its logs show three expired `analytics.track.dlq` events consumed. This was unintended; the process was stopped. No Rabbit message was published. The failed run's outbox publisher logged connection errors (`ENOTFOUND base`) and did not persist an outbox delivery. Rabbit DLQ state may have changed and should be reviewed by the operator.
- A later upload attempt reused identical PNG bytes and correctly got the idempotent 200 response. It left an extra SeaweedFS object under `uploads/raw/library/ff754417-7dd2-4e9b-8f6c-2da68b3c7fa3.png` (source SHA-256 `1f3b40322c29a8108ead1415f2aae739495eaee8b1952323ffcdc1a4258ea186`) while canonical document `a7bf70a7-cf2a-4620-819e-9b3299c8441f` already represented that hash. It was preserved; no object was deleted. The passing run now uses unique fixture bytes.
- The successful harness does not start SvelteKit boot hooks or queue consumers. It was closed by Playwright after the test. No live app server, database migration, GPU/model process, canonical task status, or OpenSpec checkbox was changed by the passing run.

**CREATED:** Dedicated scratch-only headless Playwright config and browser upload test.

**WIRED:** Chromium file selection → existing browser upload client → actual SvelteKit upload handler → SeaweedFS write → PostgreSQL 18 document/job/outbox persistence.

**PROVEN:** The browser received 202 and the exact SHA-256; a separate PostgreSQL connection verified the same source hash, MIME, job, and queued outbox task. Full worker extraction, UTF-16/UTF-8 span verification, and SeaweedFS readback remain proven by the separate scratch integration, not this browser test. Auth middleware and Rabbit delivery remain unproven.

**DONE:** No. Model-backed embedding/retrieval, Rabbit publish/consume, authenticated browser session, and canonical task completion remain open.

**likely_cause:** The prior browser spec mocked upload responses, so it could not prove that the browser client reached the real upload handler or created the corresponding durable records.

**evidence:** `sveltekit-frontend/tests/e2e/library-upload-live-scratch.spec.ts`; `sveltekit-frontend/playwright.library-scratch.config.ts`; actual upload response and independent PostgreSQL row readback above; prior scratch integration for object-hash and UTF-16/UTF-8 chunk proof.

**patch_targets:** `sveltekit-frontend/tests/e2e/library-upload-live-scratch.spec.ts`; `sveltekit-frontend/playwright.library-scratch.config.ts`; this report.

**safe_next_command:** Review RabbitMQ's `analytics.track.dlq` queue and retained scratch orphan object by their reported identifiers; do not purge or delete either.

**smoke_command:** Repeat the documented PowerShell command only after verifying both `DATABASE_URL` and `POSTGRES_URL` resolve to `legal_ai_live_integration_scratch`; the dedicated harness does not start app-wide queue consumers.

**report_path:** `docs/reports/library-revision-bound-ingestion-progress-20261113.md`
