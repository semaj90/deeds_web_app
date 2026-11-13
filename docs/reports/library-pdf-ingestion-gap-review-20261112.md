# Library PDF, Evidence OCR, and Retrieval Gap Review

Date: 2026-11-12

Scope: read-only source review of the library PDF viewer and SeaweedFS route, library/evidence ingestion, OCR and Docling adapters, search, queue behavior, and current GPU memory snapshot. No services, databases, or GPU workloads were started; no tests were run.

## Stage matrix

| Stage | Existing owner/caller | What is present | Gap / proof still needed |
| --- | --- | --- | --- |
| PDF display | `src/routes/(app)/library/[documentId]/reader/+page.svelte`; `src/lib/components/legal/PDFViewer.svelte`; `src/routes/api/library/documents/[documentId]/pdf/+server.ts` | The current reader working tree has a native `<dialog>` opened synchronously, then assigns an `<iframe>` URL on click; PDF.js remains dynamically imported in its separate custom viewer. The API checks login, document MIME, and uploader ownership, streams from SeaweedFS, supports HTTP Range, and sets private caching. | Add an explicit open/download link for browsers without a built-in PDF viewer. Add/verify an ETag or object revision validator and Range edge cases. The reader file is concurrently modified and was not changed in this review. This library route is not a substitute for case-authorized evidence access. |
| Images | Existing evidence/image routes and OCR adapters | Images are supported as ingestion inputs through Tesseract/Docling/VLM paths. | PDF.js does not render standalone image documents. Use an image viewer with bounded zoom/rotation; OCR is a separate extraction/indexing result. Scanned PDF pages still render as PDF pages. |
| Library ingestion | `api/library/upload` → `features/legal-corpus/legal/ingestion-worker.ts` | Upload stores the object and creates an `ingestion_jobs` record; pipeline extracts, structures/chunks, embeds, updates PostgreSQL, and can project to Qdrant. Search has PostgreSQL FTS plus pgvector paths. | The upload route invokes `runIngestionPipeline()` as an unawaited in-process promise. A durable dequeue/claim/lease/retry path and crash recovery are not demonstrated by this caller. The response says “queued,” but this call is not itself proof of durable queue dispatch. |
| Evidence ingestion | Evidence upload / evidence queue worker | Separate evidence job path validates source SHA-256 and reports progress; Tesseract and Granite-Docling adapters exist. | Keep this separate from library documents. Verify case authorization, idempotency, bounded model concurrency, exact source/page/span lineage, and independent readback for one real evidence item. |
| OCR / Docling | `ocr/hybrid.ts`, `analysis/granite-docling.ts`, evidence and ACE routes | Native Tesseract is probed; `tesseract.js` is a fallback. Granite-Docling returns structured blocks with page/bounding-box data. | The inspected native-Tesseract probe does not prove the Windows binary is installed. Docling is document conversion/extraction, not the summarizer. The inspected library ingestion function uses PDF text extraction then hybrid OCR; its ordinary path does not show a Docling call. Pin exact model/provider and benchmark CPU/GPU fallback. |
| Summaries / ACE | Synthesis and ACE context owners | Text synthesis and ACE packet contracts exist separately from source objects. | Define a separate summary step from extraction. Keep PDF/image bytes out of JSON ACE packets; pass source refs, hash/revision, page/span refs, bounded extracted text, and model/extractor provenance. |
| Search | `api/library/search`; `legal/statute-search-v1.ts` | PostgreSQL lexical and vector query paths exist; `legal_corpus_indexes.sql` defines GIN FTS and pgvector HNSW indexes. | The search route calls PostgreSQL `ts_rank` (FTS), not BM25. Its hybrid query uses a 0.4/0.6 weighted score despite a comment saying RRF. No streamed chunk-result path was established in this review. Measure live index presence, eligible row counts, and query plan before claiming live retrieval performance. |
| PostgreSQL 18 | PostgreSQL planner | AIO and bitmap scans are planner/storage behavior, not an app-created bitmap table. | Verify actual server version/settings and use `EXPLAIN (ANALYZE, BUFFERS, SETTINGS)` on representative filters; do not require a particular scan type for correctness. |
| GPU capacity | `nvidia-smi` read-only snapshot | Latest read: RTX 3060 Ti, 8,192 MiB total, 7,077 MiB used, 948 MiB free. | Free memory is volatile and insufficient evidence that a VLM fits. No model was loaded or GPU task run. Prefer CPU Tesseract or an already-approved resident model until the human-operated GPU gate confirms headroom. |

## Recommended design

1. Keep the existing native dialog + iframe path as the zero-extra-viewer-JavaScript default. Add an explicit “open/download” link for browsers that do not render PDFs inline. Use the existing PDF.js component only when consistent controls, text selection, or citation highlights are required. Dynamically load PDF.js on demand; optionally prewarm its JavaScript/worker on focus or hover, but fetch document bytes only after the user opens it.
2. Keep the authenticated SvelteKit endpoint as the first implementation: it already proxies SeaweedFS and supports Range reads. Do not expose bucket credentials or an unrestricted object URL. Consider short-lived signed URLs only after case/document authorization is complete and the storage policy is reviewed.
3. Route non-PDF images to an image viewer. Route HTML/Markdown/text to text/HTML readers. Use separate routes and authorization for case evidence.
4. Separate user-facing viewing from background processing. Viewing needs no OCR queue. Upload/indexing should persist a job and enqueue it durably, then use bounded workers with lease, retry/idempotency, cancellation, progress, and terminal receipts.
5. For indexing, record source object checksum/revision, extractor/model revision, page/bounding boxes or exact byte spans, chunk checksum, embedding model/artifact and recipe, representation revision, and PostgreSQL row IDs. Treat Qdrant and caches as projections.
6. Make the lexical/vector fusion contract explicit: either implement actual RRF or rename the current weighted-fusion behavior. Keep PostgreSQL FTS labeled `postgres_fts`; do not call `ts_rank` BM25.
7. Test one authorized PDF and one image: range/page rendering; OCR/extraction citations; chunk-to-source equality; vector model identity; search filters; queue retry/duplicate behavior; and independent PostgreSQL readback. Use fixture tests for denied cross-case access with zero storage/model/search calls.

## Audit of the attached SNES / 50 MB / prefill-DAG proposal

Source revision inspected: `adc7460d653c41c0aa0bb49d8802d68307ed0fd0`. The working tree already contains concurrent edits to the reader page and page loader; they were read but not changed.

| Proposal claim/stage | Current source evidence | Gap / verdict |
| --- | --- | --- |
| Click-to-view with a small page window | Reader has a native `<dialog>` and sets an iframe URL on click; PDF route streams Range reads from SeaweedFS. | This is the right light path. No new queue, Redis, Web Worker, C++ or SIMD is needed for viewing. Browser PDF decoding and byte-range requests are separate from indexing. Provide a visible open/download link for browsers without inline PDF support. |
| 50 MB “compression” into an 8-byte handle | `uploadLibraryDocument` computes SHA-256 after receiving a complete `Buffer`; the document row stores the source hash and SeaweedFS key. | An 8-byte ordinal/handle is a lookup key, not compression or identity by itself. Resolve it inside an authorized document/version namespace. Keep original bytes immutable and derivatives independently checksummed. |
| Streaming upload and durable processing | `api/library/upload` calls `file.arrayBuffer()` and buffers the whole upload; `uploadLibraryDocument` writes the object, then inserts document and job rows; upload calls `runIngestionPipeline()` as an unawaited promise. | 50 MB is fully resident in app memory during this path. The storage and database writes are not one transaction, and the job execution is lost on process restart. Generic `document.parse` task/outbox routing exists, but this library path does not enqueue it and no matching library parse consumer was found. Add a durable, idempotent job handoff before claiming bounded enqueue/dequeue. |
| Extraction, OCR, previews, summary | Library ingestion uses PDF text extraction and falls back to hybrid OCR. Granite-Docling functions are used by evidence/ACE routes, but the ordinary library ingestion path inspected does not invoke them. | No page-preview derivative/manifest or summarization stage is demonstrated in this library flow. Docling extraction is not a summary. Keep extraction, optional page raster/WebP previews, summary generation, and embedding as separate versioned stages. |
| Authorized modal question → retrieval → Ornith | Library reader/search accept a document ID. The reader loader checks login and hydrates document, TOC and chunks; library search checks login and filters SQL by document ID. The synthesis route validates an optional case UUID and passes it to LangGraph. | Reader and search source inspected here have no uploader/case ownership predicate; for non-public uploaded documents, a guessed ID can reach stored content. Synthesis has no case-authorization owner call, no document ID/source revision input, and forwards `caseId` to LangGraph. Add authorization before cache/retrieval/model calls, then pass a server-built, revision-bound ContextManifest. |
| ACE prefill packet | ACE and synthesis contracts exist. | Send only bounded admitted passage IDs/text/page spans, hashes/revisions, model/extractor provenance, authorization scope and token counts. Do not include raw PDF bytes, tensors or KV state. Cache keys must include document/source revision and authorization scope. |
| FTS/vector “BM25 + RRF” | Library search calls PostgreSQL `ts_rank` (PostgreSQL FTS); its inline hybrid score is `0.4 * lexical + 0.6 * semantic`. | The inspected SQL is weighted fusion, not RRF, and `ts_rank` is not BM25. Label the lane accurately or implement/evaluate RRF with one fusion owner. Search results are JSON responses; streaming chunk delivery was not established. |
| SIMD/radix/bitsets | Existing bounded native and bitset owners exist elsewhere in the repo. | They are not on this PDF upload/view/search path. Add them only after profiling identifies a CPU-bound candidate-selection or parsing stage. They cannot reduce document transfer, PDF raster memory, OCR time, or authorize access. |

### Adversarial source probe

Command run (read-only source-pattern probe; it invoked no route, database, cache, queue, storage, or model):

```powershell
@'
const fs = require('node:fs');
const reader = fs.readFileSync('sveltekit-frontend/src/routes/(app)/library/[documentId]/reader/+page.server.ts', 'utf8');
const search = fs.readFileSync('sveltekit-frontend/src/routes/api/library/search/+server.ts', 'utf8');
const synth = fs.readFileSync('sveltekit-frontend/src/routes/api/synthesis/generate/+server.ts', 'utf8');
const result = {
  probe: 'STATIC_CROSS_OWNER_DOCUMENT_AND_CASE_SCOPE',
  readerRequiresLogin: /locals\.user\?\.id/.test(reader),
  readerOwnerOrCaseGuard: /uploaded_by|uploadedBy|getAuthorizedCase|requireOwnedCaseId|assertCaseAccess/.test(reader),
  searchRequiresLogin: /if \(!locals\.user\?\.id\)/.test(search),
  searchOwnerOrCaseGuard: /uploaded_by|uploadedBy|getAuthorizedCase|requireOwnedCaseId|assertCaseAccess/.test(search),
  synthesisValidatesCaseUuid: /caseId:\s*z\.string\(\)\.uuid\(\)/.test(synth),
  synthesisCaseAuthorization: /getAuthorizedCase|requireOwnedCaseId|assertCaseAccess/.test(synth),
  synthesisForwardsCaseToLangGraph: /case_id:\s*body\.caseId\s*\?\?\s*null/.test(synth),
  scope: 'source-pattern-only; no request, database, cache, or model call executed'
};
console.log(JSON.stringify(result));
'@ | node; $probeExit = $LASTEXITCODE; "EXIT_CODE=$probeExit"
```

Exact observed output:

```text
{"probe":"STATIC_CROSS_OWNER_DOCUMENT_AND_CASE_SCOPE","readerRequiresLogin":true,"readerOwnerOrCaseGuard":false,"searchRequiresLogin":true,"searchOwnerOrCaseGuard":false,"synthesisValidatesCaseUuid":true,"synthesisCaseAuthorization":false,"synthesisForwardsCaseToLangGraph":true,"scope":"source-pattern-only; no request, database, cache, or model call executed"}
EXIT_CODE=0
```

This is a source-pattern finding, not proof of a reachable live data leak. It establishes the first test requirement: a cross-owner document/case request must be denied before chunk, storage, cache, retrieval, or inference reads.

### Discovery MCP results

- `classify_intent`: returned retrieval / ace-pipeline, confidence `0.85`; diagnostic routing only.
- `build_agentic_rag_context`: attempted live retrieval, returned `0` cards and `LIVE_RETRIEVAL_UNAVAILABLE` (`This operation was aborted`); no fallback evidence used.
- `trace.explain_retrieval`: returned `found:false`, `trace:null`, `Error: Connection is closed.`
- `find_route("/api/library/upload")` and `trace_database("ingestion_jobs")`: unresolved Neo4j projection results with no evidence refs. No MCP result was treated as source authority.
- Command `nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free --format=csv,noheader` output: `NVIDIA GeForce RTX 3060 Ti, 8192 MiB, 7077 MiB, 948 MiB`. Read-only snapshot only.

No tests, service calls from application code, database reads/writes, migrations, model runs, or GPU workloads were performed.

## Source references

- `sveltekit-frontend/src/lib/components/legal/PDFViewer.svelte`
- `sveltekit-frontend/src/routes/api/library/documents/[documentId]/pdf/+server.ts`
- `sveltekit-frontend/src/routes/api/library/upload/+server.ts`
- `sveltekit-frontend/src/lib/server/features/legal-corpus/legal/ingestion-worker.ts`
- `sveltekit-frontend/src/routes/(app)/library/[documentId]/reader/+page.server.ts`
- `sveltekit-frontend/src/routes/(app)/library/[documentId]/reader/+page.svelte`
- `sveltekit-frontend/src/lib/server/ocr/hybrid.ts`
- `sveltekit-frontend/src/lib/server/analysis/granite-docling.ts`
- `sveltekit-frontend/src/routes/api/library/search/+server.ts`
- `sveltekit-frontend/src/routes/api/synthesis/generate/+server.ts`
- `sveltekit-frontend/src/lib/server/queue/outbox.ts`
- `sveltekit-frontend/src/lib/server/queue/commands.ts`
- `sveltekit-frontend/src/lib/server/queue/queue-worker.ts`
- `sveltekit-frontend/drizzle/manual/legal_corpus_indexes.sql`

## Classification

- **CREATED:** PDF.js viewer, SeaweedFS range route, ingestion worker, Tesseract/hybrid OCR, Granite-Docling adapter, FTS/vector search owners.
- **WIRED:** Viewer-to-range endpoint and library upload-to-in-process ingestion call; separate evidence queue path exists. Durable library dequeue is not proven.
- **PROVEN:** Source-level wiring only in this review; no tests or live document readback run.
- **DONE:** No end-to-end authorized document-to-citation search proof established here.

likely_cause: The proposal combines viewing, background extraction, retrieval and synthesis, but those paths lack a proven shared authorization and source-revision binding; library upload dispatch is also in-process rather than a durable queue handoff.
evidence: Source revision `adc7460d653c41c0aa0bb49d8802d68307ed0fd0`; full-buffer upload; in-process ingestion call; static cross-owner source probe; PostgreSQL FTS/vector SQL; MCP context unavailable and projection lookups unresolved; GPU snapshot 948 MiB free.
patch_targets: none; audit only. Concurrent reader edits were left untouched.
safe_next_command: review this report, then add route tests proving document/case denial occurs before storage, SQL chunks, caches, and LangGraph; design library job dispatch through an existing durable outbox owner.
smoke_command: not run; after implementation, exercise one authorized document and hostile cross-owner IDs, then verify one durable job through claim, retry/idempotency, completion and independent readback.
report_path: docs/reports/library-pdf-ingestion-gap-review-20261112.md

## Implementation update — PostgreSQL-backed ingestion queue V1

Implemented on the same source revision `adc7460d653c41c0aa0bb49d8802d68307ed0fd0`; work remains uncommitted. This is a local code/test update only. No live or scratch database was opened, no migration was applied, no service or worker was started, and no OpenSpec checkbox changed.

### Change

- Upload now stores the original object under a SHA-256 content-addressed SeaweedFS key, then inserts `library_documents` and a `queued` `ingestion_jobs` row in one PostgreSQL transaction. A transaction advisory lock plus an in-transaction duplicate check closes the concurrent duplicate-upload race for the same source hash.
- The upload route no longer starts extraction as a fire-and-forget promise. `worker:library-ingestion` starts an explicit worker with concurrency one per process. Workers claim queued or expired-lease jobs using `FOR UPDATE SKIP LOCKED`, a UUID lease token, heartbeat, bounded attempts, and exponential retry delay.
- Stable UUIDv8 IDs derived through the existing UUID helper bind document version, legal node path, chunk ordinal, and definition to the document source hash. This makes PostgreSQL chunk IDs and Qdrant point IDs repeatable on retry.
- An embedding failure now fails the attempt instead of allowing an embedding-empty ingestion to be marked complete. Batches must contain exactly one finite 768-dimensional vector per chunk, and the worker records model, transport, dimension, optional artifact revision, and qualification state in the job metrics. Missing artifact revision remains explicitly unqualified; this code does not promote or publish a search generation.
- Added a candidate SQL sidecar and Drizzle fields for retry/lease state. The SQL is registered as `active_candidate`, not applied. Existing legacy `running` rows with no lease are not automatically reclaimed.

### Verification

| Command | Result |
|---|---|
| `npm run test:library-ingestion-queue` | Exit 0; 2 files, 10 tests passed. Covers deterministic retry identities, source/chunk identity changes, invalid ordinals, lease boundaries, claim query shape, heartbeat, stale lease rejection, retry scheduling, and duplicate/lost-lease behavior. |
| `npm run typecheck:library-ingestion` | Exit 0; focused TypeScript check covers the worker, queue, identity helper, upload route, schema, and worker entrypoint. |
| `npm run check:native` | Exit 1 before diagnostics: `VirtualAlloc of 8192 bytes failed with errno=1455`, Go runtime out of memory. |
| `git diff --check -- <changed paths>` | Exit 0; Git printed existing LF-to-CRLF warnings for the already modified package/sidecar/schema files. |
| `node -e "JSON.parse(require('fs').readFileSync('sveltekit-frontend/drizzle/sidecar-migrations.json','utf8'))"` | Exit 0; sidecar registry parses as JSON. |

SHA-256 artifacts:

- Migration `sveltekit-frontend/drizzle/manual/20261112_library_ingestion_lease_v1.sql`: `E78066CFAB48FF7913C5396787EC5B8D560B31B90DF0668ED0E68A7B6AF83126`
- Queue implementation `sveltekit-frontend/src/lib/server/features/legal-corpus/legal/library-ingestion-queue-v1.ts`: `00BADE05AB5DA94B277B101BF7740997AA508BB7A24B4734493E793F36D45AD7`
- Identity implementation `sveltekit-frontend/src/lib/server/features/legal-corpus/legal/library-ingestion-identity-v1.ts`: `6F372D564B7FB0CC79569673950511CC75AFEB45918178DD24C6962575E3B2AA`

### Remaining gates

- **CREATED:** Candidate lease/retry schema, queue claim adapter, deterministic identities, bounded worker entrypoint, and focused tests.
- **WIRED:** Upload writes the durable queued row; the explicit worker claims it and invokes the existing pipeline. It only runs when an operator starts `npm run worker:library-ingestion` after deploying the schema migration.
- **PROVEN:** Unit contract and focused type-check only. Real `SKIP LOCKED` behavior, lease expiry/reclaim, SeaweedFS upload, retry after process death, embedding producer identity, Qdrant fanout, and independent PostgreSQL readback are not proven.
- **DONE:** No. Search publication and the authorized document-to-cited-answer path remain open.
- **Open security blocker:** The earlier source probe still found no uploader/case guard in the inspected library reader/search paths and no case-authorization call in synthesis. This implementation did not touch the concurrently modified reader files or attempt a live request.
- **Other open items:** the request body still buffers the upload in the app process; the local schema migration has not been rehearsed; embedding artifact revision can remain null; no per-generation PostgreSQL-to-TurboVec/Qdrant completion receipt or atomic publication gate is implemented; PDF/image/OCR behavior is not integration-tested.

likely_cause: The existing upload path launched ingestion in the web process and used random derived row IDs, so crashes lost work and retries could create duplicate nodes or fail to attach embeddings to existing chunks.
evidence: Source revision `adc7460d653c41c0aa0bb49d8802d68307ed0fd0`; `npm run test:library-ingestion-queue` exit 0 (10/10); `npm run typecheck:library-ingestion` exit 0; `npm run check:native` exit 1 from Windows VirtualAlloc OOM; migration and implementation SHA-256 values above.
patch_targets: [sveltekit-frontend/src/routes/api/library/upload/+server.ts, sveltekit-frontend/src/lib/server/features/legal-corpus/legal/ingestion-worker.ts, sveltekit-frontend/src/lib/server/features/legal-corpus/legal/library-ingestion-queue-v1.ts, sveltekit-frontend/src/lib/server/features/legal-corpus/legal/library-ingestion-identity-v1.ts, sveltekit-frontend/src/lib/server/db/schema-postgres.ts, sveltekit-frontend/drizzle/manual/20261112_library_ingestion_lease_v1.sql, sveltekit-frontend/drizzle/sidecar-migrations.json, sveltekit-frontend/scripts/library-ingestion-worker.mts, sveltekit-frontend/vitest.library-ingestion.config.ts, sveltekit-frontend/tsconfig.library-ingestion-check.json, sveltekit-frontend/package.json]
safe_next_command: `npm run test:library-ingestion-queue`
smoke_command: After review, rehearse the sidecar on a disposable PostgreSQL 18 database, launch one worker against one synthetic queued document, force a worker interruption and retry, then independently read back job lease/attempt state, stable chunk IDs, 768-D embeddings, and Qdrant projection counts.
report_path: docs/reports/library-pdf-ingestion-gap-review-20261112.md
