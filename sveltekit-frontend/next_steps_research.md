# Next-Steps Research: Full-Stack Legal AI Chat App

> Research synthesis (2026-05-10) for a Rails-background developer building the full chat surface
> on the existing SvelteKit 2 + Svelte 5 + Drizzle + Qdrant stack. Verified against the repo —
> only gaps and concrete next steps are listed. Existing files are linked, not reimplemented.

---

## 0. Already Shipped (Skip Reimplementation)

Verified by reading the tree on 2026-05-10. **Do not** re-create these — wire to them.

- **SSE chat backbone** — `src/routes/api/chat/stream/+server.ts` plus 10+ other SSE endpoints
  (`api/admin/pipeline/events`, `api/cases/[id]/analyze/stream`, `api/ai/tensorrt/stream`, etc.).
  SSE helper utilities live in `src/lib/server/sse-utils.ts`.
- **RRF + sparse BM25 hybrid retrieval** — `src/lib/server/retrieval/rrf-fuse.ts`,
  `src/lib/server/retrieval/sparse-bm25.ts`, exposed at
  `src/routes/api/rag/search-fused/+server.ts`.
- **Regex intent router + SW telemetry** — `src/lib/intent/regex-intent.ts`,
  `src/lib/server/ai/intent-router.ts`, `src/routes/api/ai/intent-dispatch/+server.ts`,
  `static/sw.js`.
- **ACE / KAG / DAG context assembler** — `src/lib/server/ace/context-assembler.ts` (3911 LoC)
  including topo-byte cache (Stage A0), prompt leaderboard ingest, P3-A cross-source rerank.
- **31 retrieval modules already in `src/lib/server/retrieval/`** including
  `cross-encoder-reranker.ts`, `langextract-reranker.ts`, `triton-reranker.ts`,
  `gpu-reranker.ts`, `query-expander.ts`, `query-expansion.ts`, `web-search.ts`,
  `wikipedia-search.ts`, `youtube-transcript.ts`, `web-ingest.ts`, `centroid-cache.ts`,
  `manifold4-search.ts`, `topological-search.ts`, `cluster-aware-reranker.ts`,
  `authority-chain.ts`, `legal-pagerank.ts`, `qlora-boost.ts`,
  `graph-informed-retrieval.ts`, `citation-graph.ts`. Most of the "best practices" below
  are already implemented — the gap is wiring them into the chat UI.
- **Evidence pipeline** — `src/lib/server/evidence/` (audit log, Docling structure parser,
  type detector, RabbitMQ producer, OCR worker, embed worker, proto serializer + batch
  embedder/storer). OCR fallback at `src/lib/server/ocr/{extractText,hybrid,tesseract}.ts`.
- **Evidence viewer** — `src/lib/components/evidence/EvidenceMediaViewer.svelte`.
- **Legal section classifier** — `src/lib/server/indexer/legal-chunker.ts` (FACTS,
  LEGAL_AUTHORITY, CLAIMS, PRAYER_HOLDING enum + structure-aware chunker).
- **gRPC clients** — `src/lib/server/grpc/{embedding,retrieval,generation,chr97-agent,graph-ml,tool-calling,tool-router,codeintel}-client.ts`
  plus `client-options.ts` and `graph_ml.proto`. All have HTTP fallbacks.
- **MCP tool surface** — 88 tools in `src/mcp/trace-mcp-server.ts` on port 8788, plus the
  KB Retrieval Server on 8789 (`memory/kb-retrieval-server.md`).
- **N-API GPU bridge** — `tensorrt_bridge.node` exposing `kmeansWithCentroids`,
  `trainSOM`, `pageRankGPU`, `attentionScoreGPU`, `rewardScoreGPU`,
  `batchCosineSimilarity` (LibTorch CUDA on RTX 3060 Ti). simdjson via the same addon.
- **3-tier cache** — Redis L1 exact-match (`src/lib/server/cache/redis-exact-match.ts`,
  ~5ms), Bifrost L2 semantic (port 3040, ~2-5s), L3 Ollama/llama-server.
  Combined hit rate 90-95% per `BACKEND_INFRASTRUCTURE_AUDIT.md`.
- **Drizzle schema** — 183 `pgTable`/`pgEnum` declarations in `src/lib/server/db/schema-postgres.ts`,
  pgvector via `drizzle-orm/pg-core`'s native `vector()`.
- **Qdrant collections** — `evidence_items`, `legal_documents`, `legal_cases`,
  `codebase_chunks_768`, `chat_messages`, `embedding_cache`, `legal_glossary`.
- **PDF deps installed** — `pdf-parse` 1.1.1, `pdfjs-dist` 4.10.38, `pdf-lib` 1.17.1,
  `tesseract.js` (via `@types/tesseract.js`).

---

## 1. Rails → SvelteKit Mental Model Map

Quick orientation for someone coming off ActionController. SvelteKit collapses the Rails MVC
into colocated `+page.svelte` (view) + `+page.server.ts` (controller load + form actions) +
`+server.ts` (REST endpoints) inside the same route directory.

| Rails concept | SvelteKit equivalent | This repo |
|---|---|---|
| `config/routes.rb` | File-based routing under `src/routes/` | `src/routes/` (≥400 dirs) |
| `ApplicationController` action | `+page.server.ts` `load()` + `actions = {}` | `src/routes/(app)/cases/+page.server.ts` |
| ERB / view | `+page.svelte` (Svelte 5 runes only) | All `.svelte` files |
| Layouts (`application.html.erb`) | `+layout.svelte` + `+layout.server.ts` | `src/routes/+layout.svelte` |
| API JSON endpoint | `+server.ts` exporting `GET`/`POST`/etc. | `src/routes/api/**/+server.ts` |
| `params.require(:foo).permit(...)` | Zod schema + `superValidate(zod(schema))` | `sveltekit-superforms` v2 |
| ActiveRecord model | Drizzle `pgTable` + `$inferSelect`/`$inferInsert` | `schema-postgres.ts` |
| `db/migrate/*.rb` | Drizzle migrations under `drizzle/` (use `migrate`, NOT `push`) | `drizzle/` directory |
| `rails console` | `npx tsx scripts/<thing>.ts` or Drizzle Studio | `db:studio` script |
| Sidekiq / ActiveJob | RabbitMQ (7 queues) + dispatch-inline fallback | `src/lib/server/queue/rabbitmq-manager-fixed.ts` |
| Hotwire Turbo Stream | SvelteKit form actions w/ `use:enhance` + SSE | `src/routes/api/chat/stream/+server.ts` |
| ActionCable (WebSocket) | SSE (`text/event-stream`) — keep WS for bidirectional only | 10+ SSE endpoints already shipped |
| `Rails.cache.fetch` | Redis singleton + 3-tier cache | `src/lib/server/cache/*` |
| `params[:id]` validation | Inline `isUuid()` guard before fetch | UUID validation rule in CLAUDE.md |
| Strong-params + ActiveModel::Errors | superforms `form.errors` | `superValidate` returns shape |
| `before_action :authenticate!` | `event.locals.user` check at top of handler | 358/386 routes guarded |
| `flash[:notice]` | superforms `message()` helper | `from 'sveltekit-superforms'` |

**Form actions vs API routes** — per [SvelteKit docs](https://svelte.dev/docs/kit/form-actions):
form actions are preferred for HTML forms because they progressively enhance (work without JS) and
SvelteKit handles error/data wiring for you. Use `+server.ts` when you need a JSON contract a
non-Svelte client (mobile, MCP, OpenWebUI) will hit, or when the same logic is shared across
routes ([joyofcode](https://joyofcode.xyz/using-sveltekit-endpoints)). In this repo: chat input
goes through `+server.ts` because it streams; case CRUD should be form actions.

---

## 2. Feature-by-Feature Implementation Guide

### 2.1 PDF Ingest Pipeline

**Already shipped:** `pdf-parse`, `pdfjs-dist`, `pdf-lib` in `package.json`. OCR worker at
`src/lib/server/evidence/worker-ocr.ts`. Hybrid OCR router at `src/lib/server/ocr/hybrid.ts`.
Docling structural parser at `src/lib/server/evidence/docling-structure.ts`. Legal chunker at
`src/lib/server/indexer/legal-chunker.ts`.

**2026 best practice:** [PkgPulse comparison](https://www.pkgpulse.com/blog/unpdf-vs-pdf-parse-vs-pdfjs-dist-pdf-parsing-extraction-nodejs-2026)
ranks `unpdf` (~200K weekly DLs, edge-compatible, no native bindings) above `pdf-parse` for
serverless. `pdf-parse` requires `canvas` in some paths and breaks on AWS Lambda /
Cloudflare Workers ([Chudi.dev](https://chudi.dev/blog/serverless-pdf-processing-unpdf-vs-pdfparse)).
This repo runs Node SSR (not edge), so `pdf-parse` is fine — but adding `unpdf` as a fallback
is cheap and removes the canvas dependency for digitally-born PDFs.

**Chunking:** [Extend.ai](https://www.extend.ai/resources/semantic-chunking-methods-5-best-practices-rag-results)
and [Firecrawl](https://www.firecrawl.dev/blog/best-chunking-strategies-rag) both recommend
structure-aware chunking with **10-15% overlap** for legal docs, and **larger segments**
(800-1200 tokens) than typical RAG to preserve cross-clause relationships. The existing
`legal-chunker.ts` already does FACTS/LEGAL_AUTHORITY/CLAIMS/PRAYER_HOLDING detection —
verify the overlap percentage and chunk size are in this range.

**Gaps to fill:**
1. **OCR confidence threshold** — `worker-ocr.ts` should write a per-page `ocr_confidence`
   float to the evidence chunk row so the reranker can downweight low-confidence chunks.
   Tesseract returns this natively.
2. **Page-anchor preservation** — every chunk needs `{file_path, page_index, byte_offset}`
   metadata to support deep linking from chat citations into `EvidenceMediaViewer.svelte`.
   The PandaSecurity guide stresses this for legal admissibility
   ([source](https://pandasecuritysummit.com/robust-chunking-for-legal-docs-citations-that-survive-scrutiny)).
3. **Add `unpdf` as a pure-JS fallback** — keep `pdf-parse` as primary, fall back to `unpdf`
   when `pdf-parse` throws (it does, on certain compressed streams).

### 2.2 Multi-Collection Search + Web-Research Fallback

**Already shipped:** `rrf-fuse.ts`, `sparse-bm25.ts`, hybrid endpoint at `/api/rag/search-fused`,
plus `web-search.ts`, `wikipedia-search.ts`, `web-ingest.ts`, `youtube-transcript.ts` under
`src/lib/server/retrieval/`. Multi-collection search via the orchestrator at
`src/lib/server/retrieval/orchestrator.ts`.

**2026 best practice:**
- [Qdrant docs](https://qdrant.tech/documentation/search/hybrid-queries/) confirm RRF is the
  de-facto fusion standard. The Universal Query API does dense + sparse + RRF in a single call.
- [Supermemory hybrid guide](https://supermemory.ai/blog/hybrid-search-guide/) reports
  **91% recall@10** for RRF hybrid vs ~80% for dense-only, with **+6ms p50 latency**.
- [DMQR-RAG paper](https://arxiv.org/html/2411.13154v1) shows multi-query rewriting beats
  single-query by 14.45% on FreshQA's P@5. Adaptive selection wins:
  [Medium summary](https://medium.com/@mudassar.hakim/retrieval-is-the-bottleneck-hyde-query-expansion-and-multi-query-rag-explained-for-production-c1842bed7f8a)
  recommends:
  - **Short query (≤4 tokens)** → HyDE
  - **High ambiguity score** → multi-query rewriting
  - **Default** → query expansion with synonyms

**Gaps to fill:**
1. **Adaptive query rewriter** — wire `query-expander.ts` + a new HyDE generator behind
   the regex-intent router. Decision table goes in Redis at `ace:lane:routing_policy`
   (per the [karpathy-rl-som-routing-plan](sveltekit-frontend/memory/architecture/karpathy-rl-som-routing-plan.md)).
2. **Web-research JSON loop** — orchestrator should: (a) run local hybrid first,
   (b) if `top1.score < threshold` OR `chunkCount < 3`, fan out to web-search +
   wikipedia + (optionally) YouTube transcripts, (c) embed-and-cache new results into
   `legal_documents`/`evidence_items` Qdrant collections, (d) re-run hybrid, (e) inject
   the merged top-K back into the LLM prompt. The existing `web-ingest.ts` handles step
   (c). The threshold + decision logic is the missing glue.
3. **Cross-encoder rerank as L2** — `cross-encoder-reranker.ts` exists; verify it's
   called after RRF. The [Medium adaptive RAG guide](https://medium.com/@mudassar.hakim/retrieval-is-the-bottleneck-hyde-query-expansion-and-multi-query-rag-explained-for-production-c1842bed7f8a)
   recommends this as the "safe setup": `L1 = BM25 + vector RRF, L2 = cross-encoder`.

### 2.3 Evidence Viewer + AI-Analysis Button

**Already shipped:** `EvidenceMediaViewer.svelte`, evidence audit log
(`src/lib/server/evidence/audit.ts`), Gemma4 agent (`src/lib/server/ai/gemma4-agent.ts`),
RabbitMQ `synthesis.generate` queue.

**2026 best practice:** Streaming synthesis into a modal is well-served by
[sveltekit-sse](https://github.com/razshare/sveltekit-sse) or a hand-rolled `ReadableStream`
in `+server.ts`. The hand-rolled approach with a `controller.enqueue()` per token plus
`X-Accel-Buffering: no` header avoids reverse-proxy buffering
([Vercel academy](https://vercel.com/academy/svelte-on-vercel/streaming-chat)).

**Gaps to fill:**
1. **`POST /api/evidence/[id]/analyze/stream`** — new SSE route that:
   (a) checks `event.locals.user`, (b) loads the evidence chunk + page screenshot,
   (c) calls `gemma4-agent.ts` with `tools: [rag_search, citation_lookup]`, (d) streams
   tokens and tool-calls back, (e) on `done` writes a row to `evidence_audit_log` with
   `{user_id, evidence_id, prompt_hash, model, latency_ms, token_count, timestamp}`.
2. **Modal swap UX** — `EvidenceMediaViewer.svelte` adds an "Analyze" button that opens a
   bits-ui `Dialog` with the streamed result on the right. Use the `child` snippet pattern
   per the project bits-ui v2 conventions, not the legacy `asChild` API.
3. **Audit-log timestamp display** — the modal also queries
   `GET /api/evidence/[id]/audit-log?limit=10` and renders prior analyses with timestamps,
   model used, and a "diff vs previous" toggle. Useful for showing the chain of custody.

### 2.4 ACE / KAG Hit Logging via Service Worker

**Already shipped:** `static/sw.js`, ACE pipeline writes to `chunk_hit_log` (per
`memory/karpathy-rl-som-routing-plan.md`), `context_timeline` Postgres table (migration
`drizzle/0015_context_timeline.sql`).

**2026 best practice:**
- [Microsoft Edge docs](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/background-syncs)
  and [LogRocket](https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite/)
  agree the canonical pattern is: enqueue offline writes to **IndexedDB** in a named object
  store, register a `sync` event with the SW, replay batched on reconnect. Workbox provides
  `BackgroundSyncPlugin` ([docs](https://developer.chrome.com/docs/workbox/modules/workbox-background-sync))
  but the manual pattern is ~80 lines and avoids a dep.
- The sync event fires **even after the tab is closed** as long as the SW is registered
  ([OneUpTime](https://oneuptime.com/blog/post/2026-01-15-background-sync-react-pwa/view)).

**Gaps to fill:**
1. **IndexedDB queue store** — extend `static/sw.js` with an `idb-keyval`-style wrapper
   (or vanilla IDB ~40 lines) backing an `ace_hit_queue` object store.
2. **Beacon-style ingest** — replace any `fetch('/api/analytics/...')` from chat UI with
   `navigator.sendBeacon` when the page is unloading; enqueue to IDB otherwise.
3. **Batch flush endpoint** — `POST /api/analytics/ace-hits/batch` that takes
   `{events: AceHitEvent[]}` and bulk-INSERTs into `context_timeline` with
   `ON CONFLICT DO NOTHING` keyed on `(user_id, query_hash, chunk_id, ts_bucket)`.
4. **`sync` event handler** — registers `'ace-hit-flush'` tag; on fire, drains IDB
   in chunks of 100, posts to the batch endpoint, deletes drained rows on 200, leaves them
   on 5xx so Background Sync retries with exponential backoff.

### 2.5 Concurrent Neo4j + CouchDB + Qdrant + Postgres Processing

**Already shipped:** Standalone pipeline scripts (`scripts/run-pagerank.ts`,
`scripts/run-hypergraph.ts`), Neo4j writer in `directory-summarizer.ts`, CouchDB write paths
in `glyph_topology` (per AGENTS.md spine), Qdrant manager at
`src/lib/server/vector/qdrant-manager.ts`.

**2026 best practice:**
- [Drizzle discussion #893](https://github.com/drizzle-team/drizzle-orm/discussions/893)
  and the [transactions doc](https://orm.drizzle.team/docs/transactions) confirm:
  **`Promise.all` inside `db.transaction()` is unsafe** — connections are reused on a single
  underlying TCP connection and statements interleave non-deterministically. For
  cross-store fan-out (Neo4j + CouchDB + Qdrant + Postgres), use `Promise.allSettled` at the
  application layer with **separate** Postgres transactions per store.
- Run the data query and count query in parallel for paginated reads — that pattern is
  safe because each is its own statement-level connection acquire.
- The [1xAPI Drizzle 2026 guide](https://1xapi.com/blog/type-safe-rest-api-drizzle-orm-nodejs-2026)
  confirms `Promise.all` for **read-only** parallelism is the standard pagination pattern.

**Gaps to fill:**
1. **Cross-store writer with `allSettled`** — single helper
   `src/lib/server/storage/cross-store-write.ts` that takes
   `{postgres, qdrant, neo4j, couch}` payload tuple and runs each in its own promise,
   collects `PromiseRejectedResult[]`, writes failures to a `cross_store_dlq` table for
   retry. **Critical:** do not wrap this in `db.transaction()` — Postgres rollback won't
   undo Qdrant or Neo4j anyway, so prefer eventual consistency + DLQ.
2. **Read fan-out** — `Promise.all` is safe here. The orchestrator already does this in
   `src/lib/server/retrieval/orchestrator.ts` — verify all 4 stores are parallel.
3. **Connection pool sizing** — Postgres pool, Qdrant client, Neo4j driver, CouchDB nano
   each have independent pool sizes. Cap at `min(2 × CPU, 16)` per store; document in
   `env.server.ts`.

### 2.6 Local Deep-Research SSE Chat with ACE Injection

**Already shipped:** `/api/chat/stream/+server.ts`, `gemma4-agent.ts` tool loop, ACE assembler,
TurboQuant llama-server lane on :8090.

**2026 best practice:**
- [SvelteKit-sse README](https://github.com/razshare/sveltekit-sse) and the
  [Medium SSE guide](https://medium.com/version-1/sse-in-sveltekit-5c085b3b61d1) recommend
  hand-rolled `ReadableStream` for chat (you control backpressure + heartbeat). Use the
  library only if you need pub/sub semantics across multiple clients.
- Headers that matter: `Content-Type: text/event-stream`,
  `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`,
  `X-Accel-Buffering: no` (Cloudflare/nginx). 2KB minimum chunk size for
  Safari/IE buffering quirks.
- Heartbeat every 15s as `: keep-alive\n\n` comment to keep proxies from killing the
  connection.

**Gaps to fill:**
1. **Single chat route** — `src/routes/(app)/chat/+page.svelte` with a Svelte 5 runes-based
   message store (`$state<Message[]>([])`) and a `$derived` token counter. Use `EventSource`
   on the client; on receive, append delta to last assistant message via direct mutation
   (the `$state` proxy handles reactivity).
2. **ACE preflight** — chat `POST` body includes `{caseId?, file_path?}`. Server-side, the
   route calls `assembleAceContext()` first, then includes the resolved chunks as a
   system-message preamble before invoking `bifrostChat()`. Already wired in
   `/api/v1/chat/completions` — the chat UI just needs to talk to that route or its alias.
3. **Reconnect with `Last-Event-ID`** — when SSE drops mid-stream, browser re-issues
   `GET` with `Last-Event-ID`; the route should resume from a server-side ring buffer
   keyed on `messageId`. Skip for v1 — MVP can just regenerate.
4. **Tool-call rendering** — when the agent emits a `{type: 'tool_call'}` SSE event,
   the UI renders a collapsible card showing tool name + args + result. Use bits-ui
   `Accordion`.

---

## 3. Claude Code / Codex Prompt Checklist

Copy-paste these in order. Each names the file path it produces or modifies, references
existing files so the agent doesn't reinvent, and states a concrete acceptance test.

> Convention: `[FILE]` = path the prompt creates or modifies, `[REF]` = files the prompt
> must read first, `[TEST]` = the assertion that proves it's done.

### Checklist

**1. Add unpdf as PDF fallback to the evidence pipeline**

```
Modify [FILE] sveltekit-frontend/src/lib/server/evidence/worker-embed.ts to add an unpdf
fallback when pdf-parse throws. Keep pdf-parse as primary. Read [REF]
sveltekit-frontend/src/lib/server/ocr/hybrid.ts to match the existing fallback chain
pattern. Install unpdf via `npm install unpdf`. [TEST] Add a vitest spec that feeds a
mock PDF stream that pdf-parse rejects and asserts unpdf is called with the same buffer
and returns text.
```

**2. Wire OCR confidence into the evidence chunk schema**

```
Modify [FILE] sveltekit-frontend/src/lib/server/db/schema-postgres.ts to add an
`ocr_confidence real` column to the evidence chunks table (find it via grep). Generate a
Drizzle migration with `npm run db:generate` (NOT push). Modify [FILE]
sveltekit-frontend/src/lib/server/evidence/worker-ocr.ts to pass tesseract's per-block
`confidence` average through to the chunk insert. Read [REF] CLAUDE.md "Database Migration
Safety" section before running anything. [TEST] After ingesting a known-bad scanned PDF,
SELECT ocr_confidence FROM evidence_chunks WHERE evidence_id=$1 returns floats < 0.7 for
blurry pages.
```

**3. Build the adaptive query rewriter**

```
Create [FILE] sveltekit-frontend/src/lib/server/retrieval/adaptive-rewriter.ts. Read [REF]
sveltekit-frontend/src/lib/server/retrieval/query-expander.ts and
sveltekit-frontend/src/lib/intent/regex-intent.ts. Implement decision logic: if query
length <=4 tokens, call HyDE (LLM generates hypothetical answer, embed that); if intent
classifier returns `ambiguous=true`, generate 3 alternate phrasings via Gemma4; else fall
through to query-expander.ts. Cache rewrites in Redis at `qrw:{sha1(query)}` TTL 1h. [TEST]
Vitest spec: short query "hearsay" routes to HyDE; long ambiguous query "the case where"
routes to multi-query; clear keyword query "Brady v Maryland" routes to expansion.
```

**4. Wire web-research JSON loop into the orchestrator**

```
Modify [FILE] sveltekit-frontend/src/lib/server/retrieval/orchestrator.ts. Read [REF]
sveltekit-frontend/src/lib/server/retrieval/web-search.ts and
sveltekit-frontend/src/lib/server/retrieval/web-ingest.ts. Add a `webFallback` stage that
fires when (top1.score < 0.55) OR (chunkCount < 3): fan out to web-search + wikipedia in
parallel via Promise.allSettled, run each result through web-ingest's embed+upsert path
into the legal_documents Qdrant collection, then re-run RRF on the merged set. Return a
`webFallbackUsed: true` flag on the response. [TEST] POST /api/rag/search-fused with a
query that has 0 local hits returns webFallbackUsed=true and at least 1 source URL in
the result chunks.
```

**5. Cross-store write helper with DLQ**

```
Create [FILE] sveltekit-frontend/src/lib/server/storage/cross-store-write.ts. Signature:
`writeCrossStore({postgres?, qdrant?, neo4j?, couchdb?}): Promise<CrossStoreResult>`. Use
Promise.allSettled at the top level; never wrap in a Drizzle transaction. On any rejected
promise, INSERT row into `cross_store_dlq (id, store, payload jsonb, error text, retries int,
created_at)` table. Add the table to schema-postgres.ts and migrate. Read [REF]
sveltekit-frontend/src/lib/server/redis.ts for the singleton pattern. [TEST] Vitest spec
mocks Qdrant client to throw; assert Postgres insert still succeeds AND a row appears in
cross_store_dlq with the original Qdrant payload.
```

**6. SSE evidence-analysis route**

```
Create [FILE] sveltekit-frontend/src/routes/api/evidence/[id]/analyze/stream/+server.ts.
Read [REF] sveltekit-frontend/src/routes/api/chat/stream/+server.ts for the SSE pattern,
sveltekit-frontend/src/lib/server/sse-utils.ts for headers, and
sveltekit-frontend/src/lib/server/ai/gemma4-agent.ts for the tool loop. UUID-validate
params.id; require event.locals.user; load chunk + page anchors from Postgres; stream
Gemma4 response with rag_search + citation_lookup tools; on `done`, INSERT into
evidence_audit_log via writeCrossStore (no DLQ needed for audit). [TEST] curl -N
/api/evidence/{uuid}/analyze/stream returns Content-Type: text/event-stream and emits
at least one `data: {"type":"token",...}` line within 3s.
```

**7. EvidenceMediaViewer "Analyze" modal swap**

```
Modify [FILE] sveltekit-frontend/src/lib/components/evidence/EvidenceMediaViewer.svelte to
add an "Analyze" button that opens a bits-ui Dialog. Read [REF] CLAUDE.md "Bits UI v2.16.2
Import Patterns" — use Dialog.Root with the child snippet pattern, NOT asChild. Inside the
dialog, EventSource the route from prompt 6, render streamed tokens into a $state markdown
string, and after `done` event, fetch GET /api/evidence/[id]/audit-log?limit=10 and show
prior analyses below. Use UnoCSS utilities only — no inline Tailwind. [TEST] Playwright
spec: click "Analyze" on a seeded evidence row, assert dialog opens, assert text content
grows over time, assert audit log section renders at least 1 row after stream completes.
```

**8. Service Worker IndexedDB hit-log queue**

```
Modify [FILE] sveltekit-frontend/static/sw.js to add an `ace_hit_queue` IndexedDB object
store and a `sync` event handler. Read [REF] sw.js current contents and
sveltekit-frontend/src/lib/intent/regex-intent.ts (where hit events originate). Replace
any direct fetch to /api/analytics/* in chat code with a postMessage to the SW; SW
enqueues to IDB; on online + sync 'ace-hit-flush' tag, drain in batches of 100 to a new
endpoint POST /api/analytics/ace-hits/batch. Use vanilla IDB (no idb-keyval dep). [TEST]
Manual: DevTools > Application > Service Workers, throttle to Offline, perform 5 chat
queries, see 5 rows in IDB; back to Online, trigger sync, see rows drained and 5
INSERTs into context_timeline.
```

**9. Batch hit-log ingest endpoint**

```
Create [FILE] sveltekit-frontend/src/routes/api/analytics/ace-hits/batch/+server.ts.
Zod validate `{events: AceHitEvent[]}` capped at 500 events. Bulk INSERT into
context_timeline with ON CONFLICT (user_id, query_hash, chunk_id, ts_bucket) DO NOTHING.
Require event.locals.user. Read [REF] sveltekit-frontend/src/routes/api/analytics/rl-signal/+server.ts
for the analytics pattern and the rate limit (Redis token bucket). [TEST] POST 100 events
returns 200 with {inserted: number}, second POST with same events returns 200 with
inserted=0 (idempotent).
```

**10. ChatPage runes shell with ACE preflight**

```
Create [FILE] sveltekit-frontend/src/routes/(app)/chat/+page.svelte. Use Svelte 5 runes
only (no export let, no $:, no on:click). State: `let messages = $state<Message[]>([])`,
`let pending = $state(false)`. On submit: POST to /api/v1/chat/completions with
`{messages, file_path?, case_id?}` body and `stream: false` (v1) — see [REF]
sveltekit-frontend/CLAUDE.md "OpenAI-Compatible v1 Facade" section. Render messages with
a snippet, use bits-ui ScrollArea for scroll-to-bottom, UnoCSS for styling. Add a
"Sources used" accordion below each assistant message reading from `response.yorha.contextChunks`.
[TEST] Playwright: type "what is hearsay", submit, assert assistant message appears,
assert at least 1 source citation in the sources accordion.
```

**11. Streaming chat endpoint upgrade**

```
Modify [FILE] sveltekit-frontend/src/routes/api/chat/stream/+server.ts to accept the same
shape as the v1 facade ({messages, file_path?, case_id?}) and stream tokens via SSE.
Read [REF] sveltekit-frontend/src/lib/server/ace/context-assembler.ts for the
assembleAceContext call and sveltekit-frontend/src/lib/server/ollama.ts for bifrostChat.
Headers: text/event-stream, no-cache, X-Accel-Buffering: no, keep-alive. Heartbeat
`: keep-alive\n\n` every 15s. Emit events: {type:'token',delta}, {type:'tool_call',name,args},
{type:'done',usage}. [TEST] EventSource client receives at least 1 token event within 3s
and a done event with token usage.
```

**12. Chat UI streaming swap**

```
Modify [FILE] sveltekit-frontend/src/routes/(app)/chat/+page.svelte from prompt 10. Swap
the fetch POST for an EventSource against /api/chat/stream. On message event, parse JSON
delta and mutate the last messages[] entry directly (Svelte 5 $state proxy handles
reactivity). On 'tool_call' event, append a collapsible bits-ui Accordion item showing
tool + args. Show a typing indicator until 'done'. Persist messages to IndexedDB on
'done' for offline resume. [TEST] Playwright: assert assistant message text grows in
real-time (multiple snapshots show different lengths within 5s); reload page, assert
prior messages are restored from IDB.
```

**13. Cross-encoder rerank as L2**

```
Modify [FILE] sveltekit-frontend/src/lib/server/retrieval/orchestrator.ts to call
cross-encoder-reranker.ts after RRF fusion, before returning to the caller. Read [REF]
sveltekit-frontend/src/lib/server/retrieval/cross-encoder-reranker.ts for the existing
signature. Pass top-50 from RRF, return top-10 reranked. Add `rerankerLatencyMs` to the
response trace. Skip if request header `x-skip-rerank: true`. [TEST] POST
/api/rag/search-fused returns top-10 with `rerankerUsed: true` and the order differs from
RRF-only (compare via the skip header).
```

**14. Pre-deploy gate — backend infra audit**

```
Run [REF] scripts/audit/backend-infrastructure-audit.sh and
sveltekit-frontend/scripts/audit/orphan-detector.sh src/. Read [REF]
BACKEND_INFRASTRUCTURE_AUDIT.md for gate definitions. All 17 backend gates and all 47
code gates must pass (or have a documented SKIP justified in the script output).
[TEST] Both scripts exit 0; if any FAIL, fix before merging.
```

**15. Wire RL feedback loop on chat thumbs**

```
Modify [FILE] sveltekit-frontend/src/lib/components/chat/ChatMessage.svelte (or create
if missing) to add thumbs-up/down buttons. POST to existing
sveltekit-frontend/src/routes/api/feedback/+server.ts (already calls adaptFromAnalytics
per CLAUDE.md). Read [REF] CLAUDE.md "RL feedback loop" section. Fire-and-forget; show
a transient toast on success. [TEST] Click thumbs-up, observe new row in context_timeline
table with event_type='feedback', reward > 0, and same hyperedgeHash as the rendered
message metadata.
```

---

## 4. gRPC / Protobuf with SvelteKit 2

**How the existing clients work.** The repo holds 8 gRPC clients in
`src/lib/server/grpc/` (verified). Each is a thin wrapper around `@grpc/grpc-js` (1.13.4)
+ `@grpc/proto-loader` (0.8.0), exposed as a singleton with `getXxxClient()`. All have
**graceful fallback chains** — `gRPC → HTTP → inline TypeScript` — controlled by
`*_GRPC_ENABLED=false` env defaults. The port map (in CLAUDE.md) covers EmbeddingService
on 50051 (live), GenerationService on 50052 (orphaned, no consumers), RetrievalService on
50053 (live), CHR97 on 50055 (collision), GraphML on 50056 (missing env var),
ToolCalling on 50057 (live).

**How to call gRPC from a +server.ts.** Server-only — gRPC clients use Node `http2` and
**will not run in the browser**. Pattern:

```
// inside src/routes/api/embed/+server.ts (already shipped)
import { getEmbeddingClient } from '$lib/server/grpc/embedding-client';
export async function POST({ request, locals }) {
  if (!locals.user) return json({ error: 'unauthorized' }, { status: 401 });
  const { text } = await request.json();
  const client = getEmbeddingClient();         // singleton
  const { vector } = await client.embed(text); // returns Float32Array via proto
  return json({ vector: Array.from(vector) });
}
```

**Why protobuf beats JSON for embeddings.** Per
[honeybadger](https://www.honeybadger.io/blog/building-apis-with-node-js-and-grpc/) and
[Adityasridhar](https://adityasridhar.com/posts/how-to-easily-use-grpc-and-protocol-buffers-with-nodejs):
protobuf is binary, length-prefixed, and uses `repeated float vector = 1;` for embeddings.
A 768-dim Float32 vector is **3072 bytes raw** in protobuf vs **~9000-15000 bytes** as JSON
(`[0.123456789, ...]` × 768 with delimiters and float-to-string overhead). At 1k
embeddings/sec, that's ~6 MB/s saved on the wire and zero `parseFloat` calls on the
receiver. JSON also loses precision on round-trip; protobuf preserves IEEE 754 exactly.

**The `npm run proto:from-zod` workflow.** This repo (verified by grep against
package.json) has zod-to-proto generation scripts. Workflow:
1. Define Zod schema once in `src/lib/schemas/foo.ts`
2. Run `npm run proto:from-zod` → writes `src/proto/foo.proto`
3. Run protoc-equivalent (handled by the same script) → generates TS types
4. gRPC client + server reuse the same `.proto`. Single source of truth.

**Deferred deserialization with simdjson.** When Qdrant returns a 30KB JSON response with
1000 chunks, the simdjson N-API addon (`tensorrt_bridge.node.simdJsonParse`) is
**2-5× faster than V8's `JSON.parse`** for payloads >1KB ([CLAUDE.md GPU Acceleration Stack
section]). For payloads <1KB it's slower than V8 — the bridge auto-routes. For embeddings
specifically, `fastJsonExtractNumbers(response, '/data/embedding')` returns a `Float64Array`
zero-copy, ~10× faster than parse-then-loop.

**Limitations.**
1. **No gRPC-Web in browser without a proxy.** Browser can't speak HTTP/2 trailers
   directly. Use Envoy or `connect-web` if you ever need a browser → gRPC path.
   Today this repo never does — browser talks to SvelteKit which talks to gRPC. Keep it
   that way.
2. **Streaming responses + SvelteKit SSE** — pipe a gRPC server-streaming response into
   `ReadableStream` in a `+server.ts`, then SSE to the browser. Don't try to expose gRPC
   streaming directly.
3. **Connection pooling** — `@grpc/grpc-js` does internal pooling but per-channel.
   Singleton clients (one per service) are correct; do **not** new-up a client per
   request.

---

## 5. N-API ↔ Ruby Gems Comparison

**Surface similarity.** Both Ruby C extensions and Node N-API addons expose native C/C++
through a stable ABI. Both let you write performance-critical code (linear algebra, image
codecs, GPU bridges) in C++ and call it from the host language with low overhead.

**Where they actually differ.**

| Concern | Ruby C extension | Node N-API |
|---|---|---|
| Stable ABI | Yes (since Ruby 1.9) — `ruby.h` macros | Yes (since Node 8) — N-API headers, ABI-stable across Node major versions ([nodejs.org](https://nodejs.org/api/n-api.html)) |
| GC interaction | Conservative GC scans C stack — must not hide refs in non-GC memory; `rb_gc_register_address` for long-lived | Generational GC — hold refs via `Napi::Reference` / `napi_create_reference`, drop when done |
| Threading | GVL serializes Ruby calls; release GVL with `rb_thread_call_without_gvl` for pure-C work | JS is single-threaded; native code runs on **libuv worker pool** via `Napi::AsyncWorker` ([codemerx](https://codemerx.com/blog/asynchronous-c-addon-for-node-js-with-n-api-and-node-addon-api/)) |
| Calling host from any thread | Need GVL re-acquire | **Thread-safe functions** (`napi_threadsafe_function`) — only safe path back to JS from worker threads ([nodejs.org threadsafe](https://github.com/nodejs/node-addon-api/blob/main/doc/threadsafe.md)) |
| Async pattern | Block until Ruby callable resumes | `AsyncWorker::Execute` runs off-thread, `OnOK` posts result back to main loop |
| Build tool | `mkmf` + `extconf.rb` | `node-gyp` + `binding.gyp` (or CMake.js for newer projects) |
| Packaging | Compiled per-Ruby-version, bundled with gem | Compiled per-Node-major-version, fetched at install or via `prebuildify` |
| This repo's example | n/a | `simd-bridge/cpp/build/Release/tensorrt_bridge.node` — wraps LibTorch CUDA + simdjson, exposes `kmeansWithCentroids`, `attentionScoreGPU`, `simdJsonParse` |

**Don't overstate the equivalence.** Both expose C/C++ via stable ABI. Both have a
host-managed GC. **Beyond that they diverge.** Ruby's GVL means C extensions can release the
lock and run truly parallel; Node's single JS thread means native code runs on a libuv
worker pool and must use thread-safe functions to invoke any JS callback. Memory ownership
is also different — Ruby's GC is conservative and scans the C stack, Node's is generational
with explicit reference handles. A Ruby gem that does `pthread_create` and calls
`rb_funcall` from the new thread will deadlock; a Node addon that does `pthread_create`
and tries to call `napi_call_function` from the new thread will crash. Both are solvable
with the right primitive (`rb_thread_call_with_gvl` / `napi_threadsafe_function`), but the
primitives are not the same.

**For this repo specifically.** The `tensorrt_bridge.node` addon does **GPU** work — it
copies a Float32Array into a CUDA tensor, runs `attentionScoreGPU`, copies back. The copy
in/out is on the libuv worker thread (via `AsyncWorker`); the `Float32Array` is held by a
`Napi::Reference` while the worker runs so V8 GC can't move it. That last point — pinning
the buffer for the duration of off-thread work — is the most common N-API bug. Always
hold a reference until `OnOK`/`OnError` runs.

---

## 6. Open Questions / Decisions Needed

Things to resolve before checklist items 3-15 can run cleanly.

1. **HyDE LLM choice.** Use Gemma4-legal (slow, high quality) or Gemma3:270m (fast, lower
   quality) for hypothetical-answer generation? Affects checklist item 3. Recommend
   Gemma3:270m gated by Bifrost L2 cache — if cache hit rate stays >70% the latency is
   acceptable.
2. **Web-fallback similarity threshold.** Top-1 score < `0.55` triggers web fallback in
   checklist item 4 — empirically tuned or driven by `rlpolicy:pipeline_weights`? If the
   latter, prompt 4 needs to read from Redis instead of hardcoding.
3. **DLQ retry policy.** Cross-store DLQ table from prompt 5 — does a separate worker
   replay it, or do we hand-trigger via `/api/admin/dlq/replay`? Recommend a RabbitMQ
   consumer on a new `cross-store.dlq.replay` queue with exponential backoff capped at 6
   retries.
4. **Audit-log retention.** Evidence audit log from prompt 6 — keep forever (legal
   compliance) or rotate at N days? Affects table partitioning. Recommend `pg_partman`
   monthly partitions, retain 7 years.
5. **Service Worker scope.** Prompt 8 — does the SW intercept all `/api/analytics/*`
   POSTs, or only `ace-hit` events? Intercepting everything risks queueing auth/feedback
   events that should be synchronous. Recommend SW only handles requests with header
   `x-sw-queue: ace-hit`.
6. **Chat persistence schema.** Prompt 12 persists messages to IndexedDB — is there a
   server-side `chat_sessions` table to also persist to (so the user can resume across
   devices)? If yes, add a `POST /api/chat/sessions/[id]/append` route to the checklist.
   Schema-postgres.ts has 183 tables — verify whether `chat_sessions` already exists
   before adding.
7. **Cross-encoder model.** Prompt 13 wires the existing `cross-encoder-reranker.ts` —
   confirm which model it loads (likely BAAI/bge-reranker-base or similar). If it's not
   already cached locally, the first-call latency will spike. Pre-warm in a startup hook.
8. **OpenAI facade vs `/api/chat/stream`.** The repo has both `/api/v1/chat/completions`
   (non-streaming, OpenWebUI-compatible) and `/api/chat/stream` (SSE). Should the chat
   UI from prompt 10/12 hit the streaming version directly, or should the v1 facade learn
   to stream (per CLAUDE.md the streaming follow-up is deferred)? Recommend chat UI hits
   `/api/chat/stream` for now and the v1 facade stays non-streaming until external clients
   demand it.
9. **TurboQuant binary path.** If TurboQuant binary at `LLAMA_SERVER_PATH` is the
   `test1111…/llama-cpp-turboquant-gemma4` build (D=256/512 capable), set
   `TURBO_PROFILE=turboquant`. Otherwise stay on `stock`. Affects chat latency by 2-4×.
   Per CLAUDE.md, this is operator-owned — verify locally before checklist item 11.
10. **Rate limits on /api/chat/stream.** Currently? Ratifying the limit (e.g. 30 req/user/min
    on the streaming endpoint) before exposing chat UI publicly. Pattern exists in
    `gemma4-agent.ts` (Redis token bucket).

---

## Sources Cited

- [SvelteKit form actions docs](https://svelte.dev/docs/kit/form-actions)
- [SvelteKit-sse library](https://github.com/razshare/sveltekit-sse)
- [SSE in SvelteKit — Medium](https://medium.com/version-1/sse-in-sveltekit-5c085b3b61d1)
- [Vercel academy streaming chat](https://vercel.com/academy/svelte-on-vercel/streaming-chat)
- [Joy of Code SvelteKit endpoints](https://joyofcode.xyz/using-sveltekit-endpoints)
- [PkgPulse PDF library comparison 2026](https://www.pkgpulse.com/blog/unpdf-vs-pdf-parse-vs-pdfjs-dist-pdf-parsing-extraction-nodejs-2026)
- [Chudi.dev unpdf vs pdf-parse serverless](https://chudi.dev/blog/serverless-pdf-processing-unpdf-vs-pdfparse)
- [Qdrant hybrid queries doc](https://qdrant.tech/documentation/search/hybrid-queries/)
- [Qdrant hybrid search article](https://qdrant.tech/articles/hybrid-search/)
- [Supermemory hybrid search guide April 2026](https://supermemory.ai/blog/hybrid-search-guide/)
- [DMQR-RAG paper](https://arxiv.org/html/2411.13154v1)
- [HyDE + multi-query Medium](https://medium.com/@mudassar.hakim/retrieval-is-the-bottleneck-hyde-query-expansion-and-multi-query-rag-explained-for-production-c1842bed7f8a)
- [Microsoft Edge Background Sync docs](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/background-syncs)
- [LogRocket offline-first 2025](https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite/)
- [Workbox background sync](https://developer.chrome.com/docs/workbox/modules/workbox-background-sync)
- [OneUpTime PWA background sync 2026](https://oneuptime.com/blog/post/2026-01-15-background-sync-react-pwa/view)
- [pgvector HNSW Crunchy Data blog](https://www.crunchydata.com/blog/hnsw-indexes-with-postgres-and-pgvector)
- [Neon pgvector optimization](https://neon.com/docs/ai/ai-vector-search-optimization)
- [pgvector HNSW config DeepWiki](https://deepwiki.com/pgvector/pgvector/5.1.4-hnsw-configuration-parameters)
- [Drizzle Promise.all in transactions discussion](https://github.com/drizzle-team/drizzle-orm/discussions/893)
- [Drizzle transactions doc](https://orm.drizzle.team/docs/transactions)
- [1xAPI Drizzle 2026 guide](https://1xapi.com/blog/type-safe-rest-api-drizzle-orm-nodejs-2026)
- [Extend.ai semantic chunking 2026](https://www.extend.ai/resources/semantic-chunking-methods-5-best-practices-rag-results)
- [Firecrawl chunking strategies 2026](https://www.firecrawl.dev/blog/best-chunking-strategies-rag)
- [PandaSecurity legal chunking](https://pandasecuritysummit.com/robust-chunking-for-legal-docs-citations-that-survive-scrutiny)
- [Honeybadger gRPC Node.js](https://www.honeybadger.io/blog/building-apis-with-node-js-and-grpc/)
- [Aditya gRPC + protobuf](https://adityasridhar.com/posts/how-to-easily-use-grpc-and-protocol-buffers-with-nodejs)
- [protobufjs](https://github.com/protobufjs/protobuf.js/)
- [Node.js N-API docs](https://nodejs.org/api/n-api.html)
- [Codemerx async N-API addon](https://codemerx.com/blog/asynchronous-c-addon-for-node-js-with-n-api-and-node-addon-api/)
- [N-API thread-safe functions](https://github.com/nodejs/node-addon-api/blob/main/doc/threadsafe.md)
