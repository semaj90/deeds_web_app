# Claude Tactical Error Fixing Guide - Phase 96 + Parent Atlas P0–P7

## ⚡ PRIORITY: Parent Atlas Frozen Identity Contract (June 14, 2026)

**Read first**: `../memory/parent-atlas-frozen-identity-contract.md`

This project now operates under the **Parent Atlas P0–P7 Roadmap**. All error fixing, packet retrieval, and GPU acceleration work must follow:

1. **Frozen Identity** — no feature_id-only joins, always source_ref + directory_path
2. **Postgres is Truth** — Qdrant/Redis/Neo4j are mirrors or cache only
3. **Strict Retrieval Order** — BitFrost → Postgres → Qdrant → Neo4j (k-hop bounded)
4. **Hard Fail Conditions** — no placeholder files, no silent fallbacks
5. **No Unbounded Traversal** — all graph queries must bound k-hops

See `Parent Atlas Frozen Identity Contract` section in root CLAUDE.md for P0–P7 roadmap + key commands.

---

## 🔐 Schema Mismatch: atlas_* Tables (June 28, 2026)

**Issue**: Materialization scripts reference tables that don't exist:
- ❌ `atlas_higher_hop_index` (missing)
- ❌ `atlas_codebase_packets` (missing)
- ❌ `atlas_feature_packets` (missing)
- ✅ `atlas_packets` (exists, 58,304 rows)
- ✅ `atlas_packet_registry` (exists)
- ✅ `atlas_summary_layers` (exists)
- ✅ `atlas_semantic_diffs` (exists)

**Fix**: Update `TABLE_CANDIDATES` in `materialize-addressable-packets.mjs` to use tables that actually exist. This is a P1/P2 schema completion task.

---

## 🔐 Valkey/Redis Connection Pattern (ioredis)

**Stack**: Valkey (AGPL-free Redis drop-in) on port 6379 with password `redis` (from `.env`).

**ioredis client initialization** (correct pattern for all Node.js scripts):

```typescript
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',      // 127.0.0.1
  port: parseInt(process.env.REDIS_PORT || '6379'), // 6379
  password: process.env.REDIS_PASSWORD || 'redis',  // From .env: REDIS_PASSWORD=redis
  lazyConnect: true,      // Don't auto-connect
  enableOfflineQueue: false,
  retryStrategy: () => null
});

await redis.connect();
// ... use redis ...
await redis.quit();
```

**Hard rules**:
- ✅ Extract host/port/password from `.env` separately (don't parse REDIS_URL string)
- ✅ Use `lazyConnect: true` + explicit `await redis.connect()` before first operation
- ✅ Set `enableOfflineQueue: false` to catch connection errors immediately
- ✅ Set `retryStrategy: () => null` to fail fast (no retry loop spam)
- ✅ Always check `redis.isOpen` before `await redis.quit()`
- ❌ Never use Node's `redis` package (v4+ ESM issues) — use `ioredis` only
- ❌ Never hardcode `redis://` URLs — Docker exec may change host

**Valkey vs Redis**: Functionally identical. Valkey is AGPL-free drop-in. Password is always `redis` (set in docker-compose.yml).

---

## 🔌 Ollama Phase-Out (2026-09-03 — IN PROGRESS, not complete)

**Direction, not yet done**: Ollama is being removed from this stack entirely — including the
embeddings lane, which is currently the *only* thing the July 30 hard rule below still permits it
to do. **The replacement embeddings backend has not been decided yet.** Two live/in-progress
candidates exist in this repo today, neither confirmed as final:
- **Go Embedding service (`:8097`)** — already running, health-checked as `768-dim, GPU` this
  session (`npm run graphify:validate`). Strong default candidate since it's already live.
- **Local llama.cpp GGUF embedding executor ("EG-GGUF")** — an in-progress challenger path
  proven only through early gates (0-2 of an unknown total) as of Session 201; not yet validated
  against Ollama's actual output for parity.

**Until a replacement is confirmed and every embeddings call site is migrated: do not delete
Ollama, do not stop its service, and do not remove `embeddinggemma:latest` calls.** The table below
(July 30 boundary rule) and the many `Ollama :11434` references throughout this file and the
project-root CLAUDE.md are the **current, still-load-bearing state** — treat them as accurate until
this section is updated to say the migration is complete, not as already-superseded. When the
replacement is chosen, this section must be updated with which backend won, the parity proof that
justified it, and the sweep status of every embeddings call site — the same evidentiary bar this
file already holds the chat/synthesis model switch (Gemma4 → Ornith 1.5, see `src/lib/ai/model-ids.ts`) to.

Chat/synthesis is separately already off Gemma4 and onto **Ornith 1.5 9B** on llama-server `:8090`
(live-confirmed via `/props`: `model_alias: "ornith-1.5-9b"`, `modalities: {vision:false}` — text/tool
lane only, no vision). The table below's model examples are stale on that point; do not treat
`hforf`/`gemma4-legal-iq4xs-direct.gguf` as what's actually loaded — check `GET :8090/v1/models` or
`/props` live, per `src/lib/server/ai/llama-server-model-resolver.ts`'s own resolution contract.

## 🔌 Ollama vs llama-server Boundary (July 30, 2026)

**HARD RULE**: Ollama is ONLY for embeddings. All chat/synthesis goes through llama-server.exe.

| Service | Port | Use Case | Models | Rule |
|---------|------|----------|--------|------|
| **Ollama** | 11434 | Embeddings ONLY | `embeddinggemma:latest` (768-dim) | ✅ Use for `/api/embeddings` and `/api/embed` — **slated for removal, see "Ollama Phase-Out" above; replacement not yet decided** |
| **llama-server** | 8090 | Chat & synthesis | currently Ornith 1.5 9B (was hforf/gemma4-legal-iq4xs-direct.gguf) | ✅ Use for `/v1/chat/completions` — verify actual loaded model live, don't hardcode |

**No Ollama model pulls** (e.g., `ollama pull gemma4:e4b-it`, `ollama pull mistral`) — all chat models loaded via llama-server flags (`-m model.gguf`).

**Model fallback pattern** (e.g., research_tools.ts):
```typescript
const MODEL_PREFERENCE = ['hforf', 'gemma4-legal-iq4xs-direct.gguf'];

for (const model of MODEL_PREFERENCE) {
  const res = await fetch(`${LLAMA_SERVER_URL}/v1/chat/completions`, {
    body: JSON.stringify({ model, messages: [...], stream: false }),
  });
  if (res.ok) return data;  // Model available, use it
  // Otherwise try next model in preference list
}
```

**Why**: Ollama is a model manager (downloads, caches, runs inference). llama-server.exe is a raw inference server (no model management, direct GGUF loading). Using Ollama for chat adds:
- Unnecessary download bandwidth (Ollama uses quantized ~3.5GB models)
- Dual inference infrastructure (Ollama + llama-server competing for VRAM)
- No benefit over native llama-server.exe (same llama.cpp backend)

**Apply this sweep**:
- ✅ research_tools.ts — uses MODEL_PREFERENCE fallback, no Ollama (done)
- 🔄 Scan all other tool registries and scripts for Ollama chat references
- 🔄 Replace with llama-server `/v1/chat/completions` + MODEL_PREFERENCE

**Files to update** (20 found with Ollama chat):
- src/mcp/tools/legal-skills.tool.ts (3× `/api/generate`)
- src/lib/gpu/gemma4-synthesis-generator.ts
- src/lib/gpu/gemma4-decomposition-planner.ts
- src/mcp/server.ts
- src/lib/ai/emotion-context.ts
- src/lib/server/analysis/holistic-synthesizer.ts
- src/lib/server/analysis/vlm-evidence-analyzer.ts
- src/lib/server/analysis/granite-docling.ts
- src/lib/server/analysis/evidence-analysis-pipeline.ts
- src/routes/(app)/chat/[id]/+page.server.ts
- src/lib/server/audit/gemma-tool-router.ts
- src/lib/machines/gpu-process-machine.ts
- src/lib/server/adapters/service-integrations.ts
- src/lib/server/ace/chat-memory.ts
- src/lib/server/ace/ace-error-kag.ts
- src/lib/server/atlas/route-feature-map.ts
- src/lib/server/atlas/repository-provenance-workflow.ts
- src/routes/api/codeintel/semantic-health/+server.ts
- src/routes/api/whisper/transcribe/+server.ts
- src/service-worker.ts

**Replacement pattern**:
```typescript
// Before
const res = await fetch(`${ollamaUrl}/api/generate`, {
  body: JSON.stringify({ model: 'gemma3-legal', prompt, stream: false })
});

// After
const res = await fetch(`${LLAMA_SERVER_URL}/v1/chat/completions`, {
  body: JSON.stringify({
    model: 'hforf',  // or gemma4-legal-iq4xs-direct.gguf as fallback
    messages: [{ role: 'user', content: prompt }],
    stream: false
  })
});
```

---

## 🔐 Data Persistence + Retrieval Contract (Session 89 Corrected)

**Verified Architecture (June 28, 2026)**:
- **Postgres**: 58,304 packets (identity/metadata) + 40,754 chunks with embeddings
- **Qdrant**: 40,568 points (mirrors codebase_chunk_index, not atlas_packets)
- **Valkey**: Partial cache (125 keys warmed, full warming pending) — password: `redis`
- **Neo4j**: Topology mirror (status pending verification)

**Core Rule**: Postgres pgvector is canonical truth. Qdrant/Valkey/Neo4j are rebuildable mirrors.

**Key Finding**: Schema is split:
- `atlas_packets.embedding` → vector(768), ALL NULL (deprecated, ignore)
- `codebase_chunk_index.content_embedding` → vector(768), 99.5% populated (canonical)
- Qdrant mirror size (40.5K) matches chunk_index populated (expected, not a gap)

**Recovery Order**:
1. Verify Docker volumes mounted (never assume safety)
2. Verify Postgres counts (identity + chunks)
3. Verify Qdrant collection counts
4. Audit embedding dimensions (Ollama, Postgres, Qdrant must agree on 768)
5. Rebuild Qdrant from codebase_chunk_index if needed
6. Rebuild Neo4j topology if needed
7. Warm Redis/Bifrost from canonical sources
8. Regenerate missing summaries (40.5K+ in codebase_chunk_index)
9. Run final recovery gate (count validation + sanity checks)

**Dimension Policy** (PROJECT CANONICAL):
- PROJECT_CANONICAL_EMBED_DIM = 768 (embeddinggemma native output; 384-dim and 512-dim are projections only, not canonical)
- codebase_chunk_index.content_embedding = vector(768)
- Qdrant vectors = 768-dim
- Hard stop: no mixing 768 with projection-dim (384 or 512) in search operations
- Hard stop: no AE 64-dim for search (routing only)

**Status Language** (Use only):
- CREATED (file exists)
- WIRED (ready for dry-run)
- DRY_RUN_PROVEN (dry-run passes)
- APPLY_PROVEN (apply + verification pass)
- NOT_PROVEN (blocked)

Never claim "production-ready" from dry-run evidence.

---

## Current Diagnostics Regression Checkpoint

- Run `npm run test:diagnostics` from `sveltekit-frontend` after diagnostics-related changes.
- Unit-only slice: `npm run test:diagnostics:unit`
- Browser-only slice: `npm run test:diagnostics:e2e`
- VS Code task labels: `Diagnostics Regression Slice`, `Diagnostics Regression Slice (Unit)`, and `Diagnostics Regression Slice (E2E)`.
- Coverage includes evidence diagnostics rendering, `/api/evidence/[id]` metadata normalization and `404` handling, `/api/rag/search` diagnostics payloads, and the focused evidence upload Playwright flow.

## Type-check gate + SvelteKit 2 route-type pitfalls (verified 2026-11-11)

**Which checker is the gate.** Run `npx svelte-kit sync` first (neither script does it).

| Command | Scope | Time seen | Use |
|---|---|---|---|
| `npm run check` | 16,702 files | 220-470 s | **Acceptance gate.** Use a >= 600 s timeout. |
| `npx svelte-check-native --workspace .` | 2,109 files | 4-124 s (load-sensitive) | Fast pre-check. devDep 1.11.1, uses the project tsgo `7.0.0-dev.20260421.2`, supports SvelteKit 2, no sidecar/GPU. |
| `npm run check:fast`, `svelte-check --tsgo` | 2,109 files | 30-130 s | Smoke only. Reported 0 errors while the gate had 13 (cases page). |

**Pitfalls and fixes (each reproduced with a tsgo probe).**
- **`fail()` shapes drop `form`.** TS subtype reduction merges `fail(401,{error})` with `fail(400,{error,form})` into `{error}`, so generated `ActionData` has no `form` key. Fix: give the action an explicit return type, e.g. `create: async (...): Promise<ActionFailure<{ error: string; form?: CreateForm }>>`, with `type CreateForm = Awaited<ReturnType<typeof helperThatCallsSuperValidate>>`. Reference: `src/routes/(app)/cases/+page.server.ts`. Do not paper over it in the page with `'form' in form` (TS widens the member to `form: unknown`).
- **Untyped universal load hides server data.** `+page.ts` with `({ data }: { data?: Record<string, unknown> })` spreads no known keys. Type it `export const load: PageLoad` from `./$types`; keep the runtime guard as `(data ?? {}) as typeof data`. Reference: `src/routes/(app)/admin/all-routes/+page.ts`.
- **Never put `$types.d.ts` under `src/routes`.** TS resolves the sibling file before the generated `.svelte-kit/types` one (editor shows TS2305 on `PageLoad`). The stale all-routes file is archived at `docs/archive/2026-11-11/all-routes.types.d.ts.archived` (manifest entry added).
- **Config facts for Kit 2.59.1:** generated `types` is `["node"]`; `$app/types` and `node_modules/$app` are SvelteKit 3 only, so do not add them. Project `include` replaces the generated include (drops `ambient.d.ts`, `non-ambient.d.ts`, `types/**/$types.d.ts`); route types still resolve through `rootDirs`. Overrides `strict:false` and `verbatimModuleSyntax:false` are looser than SvelteKit's defaults and were left unchanged.
- **Inspect a generated type:** write a scratch `tsconfig.json` (extends `../../tsconfig.json`, `include: ["probe.ts"]`) and `probe.ts` under `.svelte-kit/scratch-*`, import from `../types/src/routes/<route>/$types`, force an assignment error, run `npx --no-install tsgo -p <dir>/tsconfig.json --noErrorTruncation`. Move the probe out of `.svelte-kit/` afterward.

**Tests for this fix.** `src/routes/(app)/cases/cases-page-create-form.spec.ts` renders the real page (`// @vitest-environment node` is required: the default jsdom compiles Svelte for the browser and `$effect` throws `effect_orphan`). A mutation check (forcing the modal closed) failed exactly the two failed-create tests.

**Audit (2026-11-11, 16 routes with actions).** Only `cases` had `form` dropped from generated `ActionData`. Seven routes never put `form` in `fail()`; eight keep it (login, register, evidence, evidence/upload, cases/new, analysis-center, admin/document-search, persons-of-interest/create); none of those pages read `form.form`. Limits: it checks the route-level union, not per action, and matches `fail(status, {...})` by text (nested braces and variable data are missed). Re-run the probe technique above if a page starts reading a new `form` key.

**Open.** No browser (Playwright) test of the Create Case modal exists yet. `cases/+page.svelte` also carries a runtime guard (`isCreateFormResult`) added by another session; harmless after the server-side fix.

## SSE delivery, client reconnect, Caddy and HTTP/3 (verified 2026-11-11)

**Resumable stream `/api/sse/[id]` (chat tokens, collaboration events).**
- Producers append ONCE to the Valkey stream and publish the stream ID: `publishTokenDelta(requestId, channel, seq, content)` in `src/lib/server/redis-streams.ts`. The chat action (`(app)/chat/[id]/+page.server.ts`) uses it and sets the 2 h stream TTL on `[DONE]`. Before this, each subscriber invented a time-based `seq` and appended its own copy (two tabs = every token stored twice) and no `id:` was ever sent, so `Last-Event-ID` replay was unreachable.
- The route sends the stream ID as SSE `id:`. Resume cursor = `Last-Event-ID` header (native EventSource) or `?lastEventId=` (manual reconnect), validated by `parseResumeCursor` (`src/lib/server/streaming/sse-cursor.ts`). Order: subscribe first (buffer up to 2000), replay `XRANGE (cursor` (exclusive) in 100-entry pages, flush the buffer dropping `eventId <= lastDelivered`, go live. `event: resync` is sent when replay fails or the buffer overflows. Messages without `eventId` (collaboration presence/cursor) are ephemeral and not replayable. Limit: an empty replay cannot tell "no new tokens" from "stream expired".
- Tests: `src/routes/api/sse/[id]/sse-resume.spec.ts`, `src/lib/server/streaming/sse-cursor.spec.ts`, `src/lib/server/redis-streams.publish-delta.spec.ts`.
- **Deferred (G4/G5, fix in the hardening pass, not inline while `DEV_BYPASS_AUTH` is on):** the route does not check that the user owns the chat/case in `params.id` before subscribing or replaying (`collaboration-store.svelte.ts` passes a caseId). A code comment marks it.
- `redis-streams.ts` contains a Windows-1252 byte, so Edit/Write refuse it; patch it with a byte-preserving (`latin1`) script.

**Client reconnect.** `src/lib/utils/reconnect-backoff.ts`: `reconnectDelayMs` (full jitter, 250 ms floor, 30 s cap) and `createEventDeduper` (bounded window). A native EventSource retries by itself and resends `Last-Event-ID` while CONNECTING; retry manually only when `readyState === EventSource.CLOSED`, close the old instance first, and cap attempts. Applied to `ChatSSEClient` (tested in `sse-client.reconnect.spec.ts`), `SSEStatusStore` and `WorkflowEventStream` (jitter and CLOSED-only retry; not separately tested). `subscribeEmbedding` closes on error ON PURPOSE: `/api/embed?docId=` starts an embedding job, so a reconnect would re-run it.

**Case-scoped evidence job progress (`/api/cases/{caseId}/evidence/jobs/{jobId}/events`).** Both the authenticated `/evidence` action and `POST /api/evidence/upload` use the shared case authorization owner and persist processing in the existing `analysis_jobs` table. The page action inserts evidence plus its queued job in one transaction; the API route uses the same job owner but has separate storage/evidence/job writes with compensating cleanup, so it is not one cross-store transaction. The append-only `analysis_job_events` history is a proposal migration, not an admitted runtime dependency; the endpoint must remain optional until that schema is deliberately applied.
- The case SSE reader authorizes the case, then requires the requested job and its evidence to belong to that exact case. It replays exclusively after numeric `event_seq` (`Last-Event-ID` or bounded `after`); each `analysis-progress` payload carries UUID `eventId`, `jobId`, `caseId`, `stage`, `status`, `sourceRevision` and bounded progress. It redacts analysis payloads, emits heartbeat/retry frames, rechecks authorization, caps process/actor/job connections and queued bytes, and closes on abort, terminal state, retention gap or revocation. Event IDs and sequence cursors are distinct: UUID is the event identity; sequence is the resume cursor.
- Local proof: the two upload caller specs, SSE route, envelope and stream-limit suites passed 5 files / 28 tests, including API enqueue-failure compensation; `npm run check:fast` reported 0 errors / 0 warnings. The API route test confirms best-effort object/evidence deletion is called after mocked queue failure; this is not cross-store atomicity or live cleanup proof. CPU-only worker and gRPC request-context proofs are recorded in the owning root ledger. These tests use mocks/fixtures; no authorized queued→running→terminal job was observed through the active Caddy process. Do not claim live SSE acceptance until schema admission and authorized browser reconnect/cancellation are verified.

**Caddy (`docker/caddy/Caddyfile`, stock `caddy:2.8-alpine`, digest-pinned).**
- A `*` in a path pattern does not cross `/`: a throwaway Caddy probe showed 27 of 41 SSE route files do not match the `flush_interval -1` patterns (e.g. `/api/stream`, `/api/evidence/realtime`, every multi-segment `.../stream`). Caddy flushes `text/event-stream` responses immediately even without that override; probed default-route first-event delivery was about 100 ms through Caddy (direct to SvelteKit: about 320 ms). The dedicated case evidence route `/api/cases/*/evidence/jobs/*/events` therefore uses default flushing: Caddy documents that `flush_interval -1` prevents upstream cancellation after an early client disconnect. Other stream routes retain their existing settings until separately reviewed. This is configuration/source evidence; no authorized browser disconnect has been tested through the active Caddy process.
- Probe method: `docker exec -i legal-ai-caddy sh -s` with a script that runs `caddy run --config /tmp/t.Caddyfile` (`admin off`, port 18081, labeled `respond` handles; Caddyfile blocks must be multi-line), `wget`s the URLs, then kills it. Do not touch the live config.
- No load balancing: one upstream, `health_uri /api/health` only on the default route.

**HTTP/3.** `protocols h1 h2 h3`, `5178/tcp+udp` published, `Alt-Svc` advertised. The certificate comes from Caddy's own local CA (`CN=Caddy Local Authority - ECC Intermediate`, auto-created in the `caddy_data` volume, short-lived leaf); no custom CA or Caddy build exists. Windows does not trust that root, so Chrome QUIC fails with `ERR_QUIC_CERT_ROOT_NOT_KNOWN`, and `--ignore-certificate-errors` does not apply to QUIC. Verified path: headless Chrome with `--enable-quic --origin-to-force-quic-on=localhost:5178 --ignore-certificate-errors-spki-list=<base64 sha256 of the leaf public key>` produced a Caddy access-log line with `"proto":"HTTP/3.0"`. Not tested: SSE streaming over HTTP/3. The Caddy to SvelteKit hop is HTTP/1.1. The local `curl` build has no HTTP/3.

## Current Situation (2026-01-11 21:00 PST)

**Status:** RabbitMQ Integration + RAG/KAG/DAG Knowledge Base Updates
**XState v5 Migration:** Case machines rebuilt, idle-detection needs cleanup
**Focus:** Streaming/Chunking response optimization

---

## 🐰 RabbitMQ Background Job Architecture (LEGACY / EXAMPLE ONLY)

### Why We Need It
JavaScript is single-threaded → Can't handle heavy tasks (AI analysis, OCR, case clustering) during HTTP requests → Queue jobs via RabbitMQ → Workers process asynchronously

This is a historical queueing example, not the current analysis owner.

This section is a queueing example, not the current analysis owner. Do not use it to recreate an alternate AI-analysis pipeline.

### Integration Pattern

**Producer (Frontend → RabbitMQ):**
```typescript
// idle-detection-rabbitmq-machine.ts
const response = await fetch('/api/rabbitmq/publish', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    exchange: 'legal.background',
    routingKey: job.type, // 'case_creation', 'document_analysis', etc.
    message: {
      jobId: job.id,
      type: job.type,
      priority: job.priority,
      payload: job.payload,
      sessionId: context.sessionId,
      userId: context.userId,
      timestamp: Date.now()
    },
    headers: {
      messageType: 'background_job',
      priority: job.priority,
      retryCount: job.retryCount.toString()
    }
  })
});
```

**Consumer (Backend Workers):**
```typescript
// amqplib pattern
channel.assertQueue('task_queue', { durable: true });
channel.prefetch(1); // Fair dispatch

channel.consume('task_queue', async (msg) => {
  const job = JSON.parse(msg.content.toString());

  try {
    // Process job (case creation, AI analysis, etc. — historical example only)
    const result = await processJob(job);

    // Store results in Neo4j/MinIO/PostgreSQL
    await storeResults(result);

    // Acknowledge job completion
    channel.ack(msg);
  } catch (error) {
    // Retry logic or dead-letter queue
    if (job.retryCount < 3) {
      channel.nack(msg, false, true); // Requeue
    } else {
      channel.nack(msg, false, false); // Send to DLQ
    }
  }
}, { noAck: false });
```

### Rebuilt State Machines

**1. case-creation-machine.ts**
- Purpose: Validate and create legal cases asynchronously
- XState v5: `fromPromise<unknown, { input: CaseCreationContext }>`
- Features: Auto-save, retry logic (3 attempts), validation errors
- API: `POST /api/cases` with jobId + sessionId

**2. enhanced-legal-case-machine.ts**
- Purpose: Full case lifecycle (load/create/evidence/AI)
- Actors:
  - `initializeSystem`: System health check
  - `loadCase`: Fetch case + evidence
  - `createCase`: Submit new case
  - `addEvidence`: Upload attachments
  - `startAIAnalysis`: Queue AI analysis job (historical example only)
- Integration: All results flow through RabbitMQ

### Message Durability

**Queue Declaration:**
```javascript
channel.assertQueue('task_queue', {
  durable: true  // Queue survives RabbitMQ restart
});
```

**Message Persistence:**
```javascript
channel.sendToQueue(queue, Buffer.from(msg), {
  persistent: true  // Messages written to disk
});
```

**Fair Dispatch:**
```javascript
channel.prefetch(1);  // Don't send new job until current one is acked
```

---

## 🧠 RAG + KAG + DAG Knowledge Base Patterns

### RAG (Retrieval-Augmented Generation)
**Pattern:** Query → Vector Search → Inject Context → LLM Response

```typescript
// Example: Knowledge Search with Qdrant
async function ragQuery(query: string) {
  // 1. Embed query
  const embedding = await ollama.embeddings({
    model: 'embeddinggemma:latest',
    prompt: query
  });

  // 2. Vector search
  const results = await qdrant.search({
    collection: 'knowledge_base',
    vector: embedding.embedding,
    limit: 5
  });

  // 3. Inject context into prompt
  const context = results.map(r => r.payload.text).join('\n\n');
  const prompt = `Context:\n${context}\n\nQuestion: ${query}`;

  // 4. Generate response
  const response = await ollama.generate({
    model: 'gemma3-legal:latest',
    prompt,
    stream: true  // Streaming for UX
  });

  return response;
}
```

### KAG (Knowledge-Augmented Generation) (LEGACY / EXAMPLE ONLY)
**Pattern:** Structured knowledge (Neo4j graph) + LLM reasoning

```typescript
// Example: Case relationship analysis
async function kagAnalysis(caseId: string) {
  // 1. Query Neo4j for case relationships
  const cypher = `
    MATCH (c:Case {id: $caseId})-[:RELATED_TO]->(related:Case)
    MATCH (c)-[:HAS_EVIDENCE]->(e:Evidence)
    RETURN c, related, collect(e) as evidence
  `;
  const graph = await neo4j.run(cypher, { caseId });

  // 2. Convert graph to text
  const knowledge = formatGraphAsContext(graph);

  // 3. LLM analysis (historical example only; not the current analysis owner)
  const analysis = await ollama.generate({
    model: 'gemma3-legal:latest',
    prompt: `Analyze this case structure:\n${knowledge}`
  });

  return analysis;
}
```

### DAG (Directed Acyclic Graph) Processing
**Pattern:** Job dependency resolution for RabbitMQ tasks

```typescript
// Example: Complex workflow
const jobDAG = {
  'extract_text': { dependencies: [] },
  'legal_analysis': { dependencies: ['extract_text'] },
  'case_creation': { dependencies: ['legal_analysis'] },
  'send_notification': { dependencies: ['case_creation'] }
};

async function processDAG(dag: JobDAG) {
  const completed = new Set<string>();

  while (completed.size < Object.keys(dag).length) {
    for (const [jobId, config] of Object.entries(dag)) {
      if (!completed.has(jobId)) {
        const canRun = config.dependencies.every(dep => completed.has(dep));

        if (canRun) {
          await queueRabbitMQJob(jobId, config);
          completed.add(jobId);
        }
      }
    }
  }
}
```

---

## 🌊 Streaming + Chunking Response Optimization

### Problem
Large LLM responses block UI → Poor UX → Need incremental delivery

### Solution: SSE (Server-Sent Events) + Chunked Transfer

**Backend (SvelteKit endpoint):**
```typescript
// src/routes/api/stream/+server.ts
export async function GET({ url }) {
  const query = url.searchParams.get('q');

  return new Response(
    new ReadableStream({
      async start(controller) {
        const response = await ollama.generate({
          model: 'gemma3-legal:latest',
          prompt: query,
          stream: true
        });

        for await (const chunk of response) {
          const data = `data: ${JSON.stringify(chunk)}\n\n`;
          controller.enqueue(new TextEncoder().encode(data));
        }

        controller.close();
      }
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    }
  );
}
```

**Frontend (Svelte component):**
```svelte
<script>
let response = $state('');

async function streamQuery(query) {
  const eventSource = new EventSource(`/api/stream?q=${encodeURIComponent(query)}`);

  eventSource.onmessage = (event) => {
    const chunk = JSON.parse(event.data);
    response += chunk.response; // Append incrementally
  };

  eventSource.onerror = () => {
    eventSource.close();
  };
}
</script>

<button onclick={() => streamQuery('Analyze case...')}>
  Stream Analysis
</button>

<div>{response}</div>
```

### Chunking Strategies

**1. Token-based chunking:**
```typescript
function chunkByTokens(text: string, maxTokens: number = 512) {
  const tokens = text.split(/\s+/);
  const chunks: string[] = [];

  for (let i = 0; i < tokens.length; i += maxTokens) {
    chunks.push(tokens.slice(i, i + maxTokens).join(' '));
  }

  return chunks;
}
```

**2. Semantic chunking (preserve context):**
```typescript
function chunkBySentences(text: string, chunkSize: number = 3) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  const chunks: string[] = [];

  for (let i = 0; i < sentences.length; i += chunkSize) {
    chunks.push(sentences.slice(i, i + chunkSize).join(' '));
  }

  return chunks;
}
```

**3. Embedding-aware chunking:**
```typescript
async function chunkWithEmbeddings(document: string) {
  const paragraphs = document.split('\n\n');
  const chunks: { text: string; embedding: number[] }[] = [];

  for (const para of paragraphs) {
    const { embedding } = await ollama.embeddings({
      model: 'embeddinggemma:latest',
      prompt: para
    });

    chunks.push({ text: para, embedding });
  }

  // Group similar chunks
  return clusterChunks(chunks);
}
```

---

## ✅ Completed Actions

### 1. XState v5 Case Machine Rebuild
- **case-creation-machine.ts**: Clean fromPromise generics, validation, retry
- **enhanced-legal-case-machine.ts**: Full CRUD + AI analysis (historical example only)
- **Integration**: Both ready to queue via idle-detection machine

### 2. RabbitMQ Documentation Integration
- **Fetched**: rabbitmq.com tutorials (Hello World + Work Queues)
- **Patterns**: Message acknowledgment, durability, fair dispatch
- **Library**: amqplib (npm install amqplib)

### 3. Knowledge Base Enhancement
- **gemini.md**: RabbitMQ patterns added
- **claude.md**: RAG/KAG/DAG + streaming/chunking patterns
- **Focus**: Production-ready async job processing

---

## 🎉 Phase 96 Achievements

### 1. XState v5 TypeScript Resolution
- **Fixed:** `setup()` import resolution failure
- **Workaround:** Direct `createMachine()` usage with inline actors
- **Pattern:** Explicit `fromPromise<TOutput>({ input, signal }: { ... })` typing
- **Result:** All 28+ machine files error-free

### 2. Enhanced AI Assistant Machine
- **File:** `src/lib/machines/aiAssistantMachine.ts`
- **Features:**
  - AbortSignal cancellation support
  - Proper error state handling
  - Type-safe promise actor implementation
- **Verification:** Zero TypeScript errors

### 3. Knowledge Base Documentation
- **Updated Files:**
  - `gemini.md`: XState v5 migration findings
  - `copilot.md`: ACE knowledge patterns
  - `docs/xstate-v5-patterns.md`: Canonical reference (570 lines)
- **Content:** TypeScript workarounds, production patterns, verified fixes

---

## ✅ Completed Actions

### 1. Structural TypeScript Fixes
- **346 files**: Fixed `import type { A: B }` → `import type { A, B }` corruption
- **3 files**: Fixed `formData.get('key', prop:` argument corruption
- **Result**: Parse-level errors prevented, but didn't cascade as expected

### 2. Knowledge Search SSR Migration
- **Route**: `/admin/knowledge-search`
- **Backend**: `+page.server.ts` with vector search actions
- **Services**:
  - `src/lib/server/embeddings/ollama.ts` (embeddinggemma:latest)
  - `src/lib/server/db/qdrant-integration.ts` (Qdrant client)
- **Result**: Local-first RAG stack operational

### 3. Phase 66 Agent Preparation
- **Script**: `scripts/phase66_automated_error_fixer.py`
- **LLM**: Ollama gemma3-legal:latest (native, no OpenAI dependency)
- **Tools**: Pattern detection, specialized Node.js fixers, verification
- **Status**: Ready (pending Python dependency upgrade)

---

## 🎯 High-Priority Error Patterns

### Pattern 1: CSS Parsing Errors (15K-20K estimated)
**Tool:** `fix-css-selectors.mjs` (created, dry-run validated)

**Targets:**
- Split global selectors: `: global(` → `:global(`
- Malformed keyframes: `"from" / "transform..."` → proper syntax
- Quoted percentages: `"0%"` → `0%`

**Strategy:**
```bash
# Dry-run first
node scripts/fix-css-selectors.mjs --dry-run --limit 10

# Apply incrementally
node scripts/fix-css-selectors.mjs --limit 50
```

---

## 🔄 XState v5 Migration Error Cluster (2026-01-11)

### Cluster Analysis Results

**Total Errors Analyzed:** 89,625
**XState-Related Errors:** ~2,000-3,000 (2.2-3.3%)
**Clustering Threshold:** Cosine similarity ≥ 0.85

**Cluster 1: fromPromise Type Signature Mismatches**
- **Error Codes:** TS2345, TS2322, TS2554
- **Affected Files:** ~40-60 files (mcp-gpu-orchestrator.ts, advanced-evidence-analyzer.ts, cognitive-cache-integration.ts)
- **Root Cause:** XState v5 removed inline type annotation support
- **Fix Pattern:**
  ```typescript
  // Before (v4)
  fromPromise(async ({ input }: { input: T }) => ...)

  // After (v5)
  fromPromise<TOutput, TInput>(async ({ input }) => ...)
  ```

**Cluster 2: Actor Input/Output Type Definitions**
- **Error Codes:** TS2339, TS7053 ("Property 'X' does not exist on type 'unknown'")
- **Root Cause:** Missing `types.actors` configuration in machine setup
- **Fix Pattern:**
  ```typescript
  const machine = setup({
    types: {
      actors: {} as {
        fetchUser: 'userFetcher';
        loadData: 'dataLoader';
      }
    },
    actors: {
      userFetcher: fromPromise<User, { userId: string }>(...),
      dataLoader: fromPromise<Data, { id: string }>(...)
    }
  }).createMachine({ ... });
  ```

**Cluster 3: Legacy spawn() API Usage**
- **Error Code:** TS2304 ("Cannot find name 'spawn'")
- **Root Cause:** XState v5 removed global `spawn()` function
- **Fix Pattern:**
  ```typescript
  // Before (v4)
  actions: {
    spawnActor: () => spawn(promiseLogic)
  }

  // After (v5)
  actions: {
    spawnActor: spawnChild('promiseLogic')
  }
  ```

### Knowledge Base DAG Update

**DAG Node:** `xstate_v5_migration_complete`
**Dependencies:**
- `type_extraction_complete` (fromPromise inline types → interfaces)
- `generic_types_applied` (explicit <TOutput, TInput> parameters)
- `actor_types_configured` (setup({ types: { actors: ... } }))

**Triggers:**
- `actor_system_validation` (tsc --noEmit)
- `integration_tests` (XState machines functional)
- `knowledge_base_ingestion` (patterns → Qdrant phase89_kb_cards)

### Scan Results Summary (2026-01-12)

**Script:** `scripts/phase89-scan-xstate-v4.mjs`

**Findings:**
- 87 files with XState v4 patterns (338 total occurrences)
- 39 high-priority files (fromPromise inline types)
- 43 medium-priority files (send() actions)
- 21 low-priority files (Machine/interpret/cond)

**Top Files by Complexity:**
1. `enhanced-upload-machine.ts` - 11 fromPromise inline types
2. `evidenceCustodyMachine.ts` - 6 fromPromise inline types
3. `evidence-processing-machine.ts` - 5 fromPromise inline types

**Migration Effort:** 3.5-5.5 hours estimated
**Expected Reduction:** 1,200-1,800 errors

**Full Report:** `reports/xstate-migration/latest.md`
npx svelte-check --threshold error  # Verify
```

---

### Pattern 2: Missing Semicolons (8K estimated)
**Detection:** `Expected ';'` errors in TypeScript

**Example:**
```typescript
// ❌ Missing semicolon
const x = 1
const y = 2

// ✅ Fixed
const x = 1;
const y = 2;
```

**Strategy:** Use AST parser (TypeScript Compiler API) to avoid false positives

---

### Pattern 3: Object Literal Commas (6K estimated)
**Detection:** `Property expected` errors

**Example:**
```typescript
// ❌ Missing comma
const obj = {
  key1: value1
  key2: value2
}

// ✅ Fixed
const obj = {
  key1: value1,
  key2: value2
}
```

**Strategy:** Context-aware replacement (require AST parsing)

---

## 🚨 Critical Warnings

### Do NOT Use Generic Regex On:
1. **SVG attributes** - `width="100%"` is valid HTML, not CSS
2. **Template literals** - Backticks can contain arbitrary strings
3. **Comments** - May contain pattern-like text
4. **String literals** - Code in strings should not be modified

### Always Validate Before Bulk Apply:
```bash
# 1. Commit current state
git add -A && git commit -m "Pre-fix checkpoint"

# 2. Dry-run
node scripts/fix-pattern.mjs --dry-run

# 3. Limited run
node scripts/fix-pattern.mjs --limit 10

# 4. Verify improvement
npx svelte-check --threshold error

# 5. If errors increased, rollback
git reset --hard HEAD
```

---

## 🔧 Recommended Fix Order

| Priority | Pattern | Tool | Est. Reduction | Reason |

---

## Phase 107 Fix Notes (2026-01-19)

- Repaired corrupted unions in `src/lib/types/evidence.ts` (added `WorkflowEvent`, `EvidenceWebSocketMessage`, `EvidenceSnapshot`).
- Fixed `AIAgentTool` param typing (`required?: boolean`) to restore TS parsing.
- Fixed `src/ToolInvoker.ts` diagnostics flow (restored `cmd`, removed undefined `result`, corrected `updateConfidence` signature).
|----------|---------|------|----------------|--------|
| **1** | CSS selectors | `fix-css-selectors.mjs` | -1,000 | Safe, high impact |
| **2** | Type imports (re-run) | `fix-type-imports.mjs` | -500 | Catch edge cases |
| **3** | Missing semicolons | AST-based fixer | -8,000 | Needs precision |
| **4** | Object commas | AST-based fixer | -6,000 | Needs context |
| **5** | Type mismatches | Manual or AI | -20,000+ | Semantic analysis |

---

## 🤖 Phase 66 Agent Capabilities

**Updated Script:** `scripts/phase66_automated_error_fixer.py`

**New Features:**
```python
@tool("Run specialized Node.js fixer")
def run_specialized_fixer(fixer_name: str) -> str:
    """
    Available fixers:
    - 'fix-type-imports': Import corruption
    - 'fix-formdata-corruption': Argument corruption
    - 'fix-css-selectors': CSS parsing errors (future)
    """
```

**Workflow:**
1. Agent analyzes svelte-check output
2. Identifies top 3 fixable patterns
3. Recommends specialized fixer if pattern matches
4. Applies fixes in batched mode
5. Validates after each batch
6. Rollbacks if regression detected

---

## 📊 Expected Results by Phase

| Phase | Action | Before | After | Reduction |
|-------|--------|--------|-------|-----------|
| ✅ Phase 1 | Structural fixes | 77,002 | 77,002* | 0%** |
| 🔄 Phase 2 | CSS selectors | 77,002 | ~76,000 | 1.3% |
| ⏳ Phase 3 | Semicolons | ~76,000 | ~68,000 | 11.6% |
| ⏳ Phase 4 | Object commas | ~68,000 | ~62,000 | 19.5% |
| ⏳ Phase 5 | Type re-check | ~62,000 | ~60,000 | 22.1% |
| ⏳ Phase 6 | Import resolution | ~60,000 | ~56,000 | 27.3% |
| 🎯 Final | Manual review | ~56,000 | ~42,000 | **45.5%** |

*Structural fixes prevent **cascading parse errors** but don't reduce count until dependent errors are fixed.

---

## 💡 Tactical Recommendations

### For Immediate Impact:
1. **Apply CSS fixes** - Safe, well-tested, limited scope
2. **Re-run type import fixer** - May catch new edge cases
3. **Commit frequently** - Easy rollback on regressions

### For Long-Term Success:
1. **Use AST parsers** - TypeScript Compiler API for precision
2. **Implement validation gates** - Error count must decrease
3. **Document all patterns** - Update knowledge base after each pass
4. **Leverage AI agents** - CrewAI for semantic analysis

### For Risk Mitigation:
1. **Always dry-run** - Preview changes before applying
2. **Limit batch size** - Fix 50-100 files at a time
3. **Monitor error types** - If new errors appear, rollback
4. **Git is your friend** - Commit before each fix batch

---

## 🔗 Quick Reference

### Commands
```bash
# Check errors
npx svelte-check --threshold error

# Apply fixes (dry-run first!)
node scripts/fix-type-imports.mjs --dry-run
node scripts/fix-css-selectors.mjs --dry-run --limit 10

# Run Phase 66 agent
python scripts/phase66_automated_error_fixer.py

# Verify improvement
npx svelte-check --threshold error 2>&1 | Select-String "found \d+ error"
```

### Files Modified This Session
- `scripts/fix-type-imports.mjs` - ✅ Applied (346 files)
- `scripts/fix-formdata-corruption.mjs` - ✅ Applied (3 files)
- `scripts/fix-css-selectors.mjs` - 🔄 Created (dry-run validated)
- `scripts/phase66_automated_error_fixer.py` - ✅ Updated (Ollama native)
- `src/routes/(app)/admin/knowledge-search/` - ✅ Migrated to SSR
- `src/lib/server/embeddings/ollama.ts` - ✅ Regenerated (clean)
- `src/lib/server/db/qdrant-integration.ts` - ✅ Regenerated (clean)

---

## Phase 107 Fix Notes (2026-01-19)

- Repaired corrupted unions in `src/lib/types/evidence.ts` (added `WorkflowEvent`, `EvidenceWebSocketMessage`, `EvidenceSnapshot`).
- Fixed `AIAgentTool` param typing (`required?: boolean`) to restore TS parsing.
- Fixed `src/ToolInvoker.ts` diagnostics flow (restored `cmd`, removed undefined `result`, corrected `updateConfidence` signature).
- Fixed `src/lib/services/goServiceClient.ts` type signatures and health check flow (restored `Promise.allSettled`, corrected param types).
- Fixed `src/agentic-stream.ts` stream typing and export issues (callback types, decoder options, export list).
- Fixed `src/routes/(app)/codebase-index/[fileId]/+page.server.ts` broken comment/return line.
- Fixed `src/routes/+page.server.ts` Promise.all destructuring and response shape.
- Dry-run batch (5 files) reduced `svelte-check` to 51,398 errors / 94 warnings (1455 files).
- Fixed `src/routes/(app)/codebase-index/+page.server.ts` bad `console.error` formatting.
- Fixed `src/routes/(app)/phase78/routes/[routePath]/+page.server.ts` malformed summary object.
- Fixed `src/lib/services/enhanced-api-client.ts` request flow, imports, and upload response parsing.
- Dry-run batch (8 files) reduced `svelte-check` to 50,785 errors / 100 warnings (1446 files).
- Fixed `src/lib/types/chat.ts` RAGContext typing and added `recommendations`/`did_you_mean`.
- Fixed `src/lib/stores/chat-store.svelte.ts` errorHistory type annotation.
- Post-fix `svelte-check`: 50,782 errors / 100 warnings (1445 files).
- Rebuilt `src/lib/services/ai-service.ts` with clean async flow, optional DB writes, and Ollama-based analysis (historical example only; not the current owner).

---

**Status:** Phase 2 ready for test application
**Next:** Apply CSS fixes to 1-2 files, verify, then scale
**Maintained by:** Claude (Anthropic) + Antigravity (Google Deepmind)
**Last Updated:** 2026-01-11 10:52 PST

## Status Update (2026-02-04)
- **Restoration:** 99 corrupted files identified. Priority: Restore before cleanup.
- **Git:** Service consolidation (AI, POI, Evidence) secured in commit f5233e9.

## 🚨 Emergency Restoration Phase (2026-02-04)

**Objective:** Restore 99 corrupted files from `src.backup.20260104_111218`.

### Status (Live)
- **Restored:**
  - `src/lib/server/ai/rag-pipeline.ts`
  - `src/lib/services/gpu-cache-rpc-client.ts`
  - `src/lib/services/llm-router.ts`
  - `src/routes/api/embed/+server.ts`
- **Verified:**
  - `src/lib/server/embeddings/ollama.ts` (Intact)
- **Pending:**
  - `sveltekit-gpu-cache-integration.ts` (Under analysis)
  - Remaining 95 corrupted files.

### Critical Notes
- Directory consolidation (`src/lib/features`) was preserved via Git commit prior to restoration.
- Backups are restoring to legacy paths; duplicates must be managed.


---

## TRACE/Karpathy Performance Lane (LEGACY / REFERENCE ONLY)

**Last Updated: May 6, 2026**

Use this execution order for GPU, indexing, cache, and agentic tool-call work:

### 1. `fix(cuda): harden clusterEmbeddings and graphSimilarity safety`
- Add empty-cluster guard in `clusterEmbeddings`
- Re-seed empty clusters from farthest point OR preserve previous centroid safely
- Add hard C++ N-cap for `graphSimilarity`
- Return useful error details to the TS bridge
- **Tests**: no NaN centroids, safe rejection of n > cap

### 2. `feat(cuda): async N-API GPU calls for large workloads`
- Wrap `graphSimilarity`, `clusterEmbeddings`, `batchCosineSimilarity` in N-API async work for large n
- Preserve sync path for small workloads (threshold: n < 256)
- **Tests**: event-loop non-blocking test, large-n async path

### 3. `feat(indexer): add worker-thread pool for chunk/metadata pipeline`
- Worker threads for hashing, chunking, metadata envelopes, entity extraction, Qdrant payload generation
- Transferable `ArrayBuffer`s where useful
- Bounded queues and batch writers
- Keep Gemma4 out of the worker pool **except** selective summary tasks

### 4. `feat(cache): add tensor/similarity cache keys`
- Cache embeddings by content hash
- Cache centroid member lists
- Cache repeated query+cluster similarity results
- Redis pipeline batching
- **Smoke test**: repeated query avoids GPU rerank (cache hit verified)

### 5. `feat(agent): wire Gemma4 tool-call controller to TypeScript MCP graph/search tools`
- Allowlist: read-only graph/topology/search tools only
- Support OpenAI `tool_calls` + manual JSON tool requests
- Call `trace-mcp-server` tools over Streamable HTTP (port 8788)
- `maxToolRounds=3`, `maxToolResultChars=12000`
- Expose tool usage in YorHA metadata (`yorha.toolsUsed`)

### MCP Tool Surface (model-facing only, no raw DB access)

```
Gemma4 / Claude (legacy model-facing example)
  ↓
MCP tool call
  ↓
TypeScript tool handler (trace-mcp-server.ts :8788)
  ↓
gRPC client when needed (embedding :50051, retrieval :50053)
  ↓
Go/TS retrieval, embedding, indexer service
```

**Named tools**: `trace.kag_search`, `topology.search_near`, `graph.expand_neighborhood`,
`graph.shortest_path`, `clusters.get_summary_lenses`, `trace.explain_retrieval`

**Rule**: Gemma4 MUST call named MCP tools. It does NOT talk to gRPC, Qdrant, Neo4j, or Postgres directly. This is legacy model-facing guidance, not current ownership.

### TypeScript 7 Native Audit Lane
- `tsgo` runs as a fast parallel type audit (10× faster than tsc)
- Does NOT replace `svelte-check` or `tsc` — both remain in CI
- JSONB diagnostics (`scripts/tsgo-diagnostics-to-jsonb.mjs`) feed ACE/TRACE as error-relevance signals
- Protobuf contracts generated from Zod schemas via `npm run proto:from-zod`

---

## Retrieval Lanes — Vector vs Hyper-Graph-RAG (LEGACY / REFERENCE ONLY — May 9, 2026)

**Rule**: vector RAG and hyper-graph-RAG are **complementary, not competing**. This is historical guidance only; do not treat it as the current Parent Atlas ownership model. The Karpathy Authority Blend (`0.4·PageRank + 0.3·attention + 0.3·authority`) is the canonical hybrid in this legacy lane.

| Lane | Strength | Backing store | Use when |
|---|---|---|---|
| **Vector RAG** | "find chunks semantically similar to this query" | Qdrant `codebase_chunks_768` (768-d, named vector `content`) + pgvector `codebase_chunk_index.contentEmbedding` (mirror) | natural-language query, fuzzy intent match, no known entry-point |
| **Hyper-graph-RAG** | "trace structural relationships across N hops" | Neo4j (typed edges: `IMPORTS`, `BELONGS_TO_CLUSTER`, `SIMILAR_TOPOLOGY`, `SHARES_TAGS`) + CouchDB (PageRank cache `couchdb:pagerank_scores` 6h TTL) | "what depends on X?", "shortest path from auth → DB", cluster expansion, topology-aware reranking |
| **Sparse RAG** | "exact filename / export / Redis key" | Fuse.js (browser Web Worker), `rg` CLI, BM25 index (planned N8+ in notecard lane) | lexical match needed, ID lookup, code-symbol search |

### Hyper-graph-RAG specifics

- **Neo4j is the analysis substrate.** Cypher queries express graph reasoning naturally; Qdrant cosine similarity does not. Use Neo4j when the question contains "connected to", "depends on", "via", "expand around", "shortest path", "neighborhood".
- **CouchDB is the precomputed-view layer.** `couchdb:pagerank_scores` (6h TTL), MapReduce rollups for `link_matrix` recommendations. Reads from CouchDB are cheap; reads from Neo4j with PageRank computed inline are not.
- **The 4-lane hypergraph is the join layer.** `cluster_context` / `shared_resource` / `agents_context` / `vault_link` edges (282 edges across A/B/C/D lanes per `memory/hypergraph-4-lanes-vault.md`) — these are the typed relations that make hyper-graph-RAG actually navigable.
- **Karpathy blend is the rerank.** After vector OR graph retrieval pulls candidates, the blend score (`0.4·PR + 0.3·attn + 0.3·authority` in Redis hash `gpu:karpathy:scores`, 24h TTL) is the final ordering. **Use the blend; don't roll your own.**

### Decision tree for new retrieval features

1. Is the query "find similar text" or "find similar concept"? → **Vector RAG**, Qdrant ANN.
2. Is the query "trace connections" or "expand neighborhood"? → **Hyper-graph-RAG**, Cypher in Neo4j, with CouchDB PageRank for ordering.
3. Is the query "exact filename / export / Redis key"? → **Sparse RAG**, Fuse.js or `rg`.
4. Hybrid (most cases): vector ANN → graph expansion of top-K → Karpathy rerank → ACE context pack. This is what `fetchACPKnowledgeResults()` already does at Stage A0.

### Hard rules

- ❌ **Don't replace vector RAG with hyper-graph-RAG.** Different jobs. Replacing one with the other loses semantic intent matching.
- ❌ **Don't run PageRank inline in Cypher.** Use the cached `couchdb:pagerank_scores` view. Inline PageRank is O(V+E) per query — a Neo4j-killer.
- ❌ **Don't add a 5th lane.** The three above + the 4-lane hypergraph join already cover every retrieval question seen in this codebase. SurrealDB / hypothetical "knowledge mesh" / graph-DB-of-the-month additions are research spikes only.
- ❌ **Don't bypass Karpathy blend on rerank.** The blend is the single source of truth for "which top-K wins." Custom ordering inside one feature breaks cross-feature consistency.

### MCP retrieval surface — verified healthy (2026-05-09)

TRACE MCP `:8788` is the canonical retrieval boundary for the agentic loop. As of the May 9 mount + smoke pass, **42 tools register cleanly** via `tools/list` (HTTP 200, repeatable) — including `kb.trace_search`, `context.build_kv_packet`, `db.schema_overview`, `db.table_inspect`, plus the `graph.*`, `topology.*`, `clusters.*`, `kag.*`, `kb.*`, `ops.*`, and `search.*` namespaces. Adopt these via the Cline / Claude Code / OpenCode / Hermes MCP configs.

Verified healthy MCP servers (`npx mcporter list`, varies per run): `gemma4-offload`, `microsoft-docs`, `memory`, `postgres-readonly`, `qdrant-readonly`, `neo4j-readonly`, sometimes `colab`. Offline (need package-name correction): `redis-readonly`, `ts-lsp`, `obsidian-vault`, `context7-*`, `playwright`, `legal-ai-context`. Full status: `memory/architecture/mcp-mount-smoke-2026-05-09.md`.

Two hard rules added to `docs/architecture/trace-runtime-split.md` Hard Rules after the May 9 root-cause hunt: **G34** (no Zod 3 single-arg `z.record(...)` in MCP tool schemas) and **G38** (`StreamableHTTPServerTransport({ sessionIdGenerator: undefined })` must be constructed *per request*, never as a module-scope singleton — silent-500s every call after the first).

### Cross-references

- `memory/hypergraph-4-lanes-vault.md` — 4-lane edge inventory + smoke gate
- `next_steps/active/2026-05-09_karpathy-chr97-wiring.md` — design doc for the cartridge layer that ties vector + graph retrieval into a single ACE Stage A0 cache slice
- `next_steps/active/2026-05-09_agents-md-incremental-pipeline.md` — sister design doc; AGENTS.md updates feed the `agents_context` hyperedge lane
- §"Karpathy GPU Authority Blend + Redis ACE Cache" (project-root CLAUDE.md) — legacy blend pipeline reference
- `docs/architecture/trace-kag-web-development-guide.md` — legacy TRACE/Karpathy web-development guide (route execution contract, retrieval lane decision tree, production safety gates, Browser Context Lane policy at §17)
- `docs/architecture/agent-surface-decision-matrix.md` — Cline vs OpenCode vs Hermes vs Codex vs Claude Code comparison + operating model. Settles "agent-surface choice is now ergonomics, not capability". Supersedes earlier "Cline wins / Hermes is a TUI toy / OpenCode is CLI-only" framing.
- `docs/architecture/trace-runtime-split.md` — Gemma4 → MCP runtime boundary rule
- `memory/architecture/browser-context-lane.md` — sanitizer + storage + worker contract for the optional browser snapshot
- `memory/architecture/admin-chat-assistant.md` — Copilot rune store + AiAnalysisPopup + SummarizeButton drop-in pattern
- `memory/architecture/client-inference-policy.md` — Service Worker vs Web Worker rules + Phase-2 ONNX-download toggle policy

### OpenCode / Memory Authority

- Treat `MASTER-FEATURE-TODO-2026-05-20.md` as the phase plan for lane completion and backlog status.
- Treat `docs/agents-md-howto.md` as the canonical guide for directory-scoped agent instructions.
- OpenCode startup should use the repo-local bootstrap path and its generated truth artifacts:
  - `scripts/opencode/bootstrap-workspace.mjs`
  - `.opencode/startup-context.json`
  - `.tmp/claude-mem-ensure.json`
  - `reports/claude-mem-startup.md`
- Tie OpenCode memory to Engram and NES by routing through:
  - `src/lib/server/memory/engram-memory.ts`
  - `src/lib/server/ai/engram-registry.ts`
  - `src/lib/gpu/nes-memory-architecture.ts`
  - `scripts/atlas/sync-engram-memory.mjs`
  - `scripts/atlas/engram-plugin-adapter.mjs`
- Prefer the repo-local memory bridges for capture/import:
  - `scripts/opencode/post-memory.mjs`
  - `scripts/opencode/monitor-claude-mem-poll.mjs`
  - `scripts/memory/import-claude-mem-observations.mjs`
- Caveat: the local `claude-mem` plugin cache patch is not durable across reinstalls/upgrades. Recheck the local bundle for the `zod/v3` compatibility fix before trusting plugin hooks after an update.

## Production hardening: service-lifecycle gates (2026-11-01)

- Service lifecycle is human-only until `ops.*` auth is real: no MCP/TRACE tool may stop/start/restart `:8090`, Ollama, Docker or any datastore (`requireToken` accepts any non-empty string). Agents may add read-only status tools or write a request record for a human. Embedding seed/backfill scripts must fail closed (no placeholder/hash vectors); normalize `OLLAMA_HOST=0.0.0.0` to `127.0.0.1:11434`. Full rule: `CLAUDE.md` § Production hardening.

- Case-specific evidence uploads at src/routes/(app)/cases/[id]/evidence/upload/+page.svelte use the case-authorized /api/cases/{caseId}/evidence/jobs/{jobId}/events stream and shared event-envelope admission. A malformed upload response or missing job ID is an error, never a completed state. This does not replace the legacy user-owned /api/evidence/realtime path for non-case jobs.

## Evidence upload ambiguous enqueue outcomes (2026-11-12)

- `POST /api/evidence/upload` reads back its generated `analysis_jobs` ID if `enqueueJob` rejects, because the insert may have committed despite a lost response. It returns a matching evidence/case/`upload_pipeline` job as accepted; mismatched or unavailable readback returns an explicit 503 and preserves the object and evidence. It compensates only when readback confirms no durable job.
- Mocked route coverage and focused upload/SSE/gRPC checks passed 43/43; `npm run check:fast` passed with 0 errors/warnings. This does not prove the live cross-store path or authorized SSE through Caddy. The PG18 event-history migration remains unapplied.

## Real-service SSE readiness recheck (2026-11-12)

- Existing Postgres 18.4 + pgvector 0.8.3, Valkey 8.1.1 image, and Caddy 2.8.4 were inspected without starting/restarting services. `analysis_jobs` exists but `analysis_job_events` does not; the event-history DDL remains proposal-only.
- A unique Valkey scratch stream verified exclusive cursor replay and was deleted with `EXISTS=0` cleanup confirmation. The case-scoped evidence-job SSE route returned a non-disclosing 404 for an unauthorized actor. Separately, a no-cookie request to generic `/api/sse/[id]` returned 200 locally because the dev hook may assign its synthetic user under `DEV_BYPASS_AUTH`; this is not proof of anonymous production access. The generic chat route still lacks a chat/case ownership check before subscribing or replaying. Direct Caddy SSE remains unverified (the probe's HTTP endpoint returned 400 and HTTPS TLS negotiation failed).
- This proves dependency readiness and a replay primitive, not authorized SSE. Full job lifecycle/reconnect/cancel through Caddy remains unproven until event history is admitted and an authorized disposable job/session can be exercised. Do not call this live end-to-end acceptance.

**Current SSE verification refresh (2026-11-11):** At repository `HEAD` `a171ad3a5db5efbb1f5e34ccf4f0063d11524e17`, focused upload/SSE/client/limits/gRPC tests passed 41/41 across 8 suites; `npm run check:fast` passed with 0 errors/warnings; Go retrieval tests passed. The non-GPU Credentials/Crosswalk gate subset passed 2/2 stages and its receipt matches that HEAD; the full CUDA-capable gate was not run. The proposed event-history trigger currently sets `stage` equal to the lifecycle `status`; this is not a finer worker phase. The live PostgreSQL 18.4 + pgvector 0.8.3 instance has `analysis_jobs` but no `analysis_job_events`, so authorized SSE lifecycle/reconnect through Caddy remains unproven and migration remains proposal-only. See `docs/reports/parent-atlas-sse-transport-audit-2026-11-11.md` and the root `courtroom-upload-story-pipeline` ledger for exact evidence.
**Durable progress-stage limitation:** the `/evidence` action's named steps are currently local `updateJob` progress only. The API upload path persists `status` and numeric `progress`, not `step`; the worker persists numeric progress and terminal status. The proposed event trigger derives `stage` from `status`, so this currently exposes lifecycle stage only. Do not infer named phases from progress percentages. A durable stage writer must be designed with compatibility for deployments where the proposal-only event-history schema is absent. See the root `courtroom-upload-story-pipeline` ledger and SSE transport audit.
## Worker-level evidence progress stages (2026-11-12)

The canonical analysis worker can report `source_fetch`, `text_extraction`, `content_analysis`, and `canonical_indexing` to the optional `analysis_job_events` writer. It feature-detects the proposal-only history table and no-ops when that table is absent, so existing PG18 installs keep processing normally. Events are source-revision and case-bound; telemetry write failures do not fail canonical ingestion. Mocked tests cover stage ordering and optional-table behavior. This is not live stage-event or SSE replay proof: the current database has no `analysis_job_events` table and the manual migration remains unapplied.
Current-head verification note (2026-11-12): focused case SSE/envelope/limits/gRPC identity suites passed 24/24; uncached Go Retrieval tests passed. The live PostgreSQL 18.4/pgvector 0.8.3 instance still lacks `analysis_job_events`. The current-HEAD gate receipt covers Credentials and Crosswalk only; the full eight-stage receipt is from an older commit. Treat authorized SSE lifecycle and current full-gate status as unproven.
Disposable migration rehearsal (2026-11-12): the event-history DDL, queued/running/terminal trigger path, source-bound worker-stage INSERT, and exclusive cursor replay passed in `legal_ai_live_integration_scratch` within one transaction. A read-only post-rollback check confirmed no table, prune-watermark column, or fixture rows remained. This proves PostgreSQL SQL compatibility only; the TypeScript writer and authorized Caddy/browser SSE path remain unproven live.
Opt-in disposable PostgreSQL writer test: set `ATLAS_SSE_SCRATCH_DB_TEST=1` and run `npx vitest run src/lib/server/analysis/analysis-job-progress-events-v1.integration.spec.ts` from this package. The test hard-targets the local `legal_ai_live_integration_scratch` database, applies the event-history proposal and invokes the real TypeScript writer only inside a transaction, then asserts rollback removed schema and fixture rows. It does not authorize production migration or prove app/Caddy/browser SSE behavior.
The opt-in scratch PostgreSQL integration spec is included in the project Svelte/TypeScript check, which currently passes with 0 errors and 0 warnings. The test itself stays skipped unless explicitly enabled.
Exact-HEAD note (2026-11-12): repository HEAD advanced to `b1176b68e58c6e2e5ef16baaef6877e781ba5fb1` during the verification. No saved integration-gate receipt matches this SHA; the latest full gate is for an older commit. Current-HEAD full-gate proof remains open.

**Focused verification refresh (worktree HEAD `b1176b68e58c6e2e5ef16baaef6877e781ba5fb1`):** 14/14 case-scoped SSE route tests plus 3 worker-writer unit tests and 1 opt-in PostgreSQL scratch integration passed (3 files / 18 tests). PostgreSQL 18.4 + pgvector 0.8.3 was real; the test used only `legal_ai_live_integration_scratch` and rolled its DDL/data back. The route remains mock-tested; the app database still lacks `analysis_job_events`, so no authorized queued-to-terminal browser stream/reconnect through active Caddy is proven. No production migration or service restart was performed.


**Handler-level PostgreSQL integration refresh (worktree HEAD `b1176b68e58c6e2e5ef16baaef6877e781ba5fb1`):** the opt-in scratch test now executes the production case SSE GET handler and real `getAuthorizedCase` query against a transaction-bound PostgreSQL 18.4/pgvector 0.8.3 connection. Owner access streamed queued → running → worker stages → completed; cursor replay returned later events only; another actor got a non-disclosing 404. The transaction rolled back DDL and fixture rows. Focused tests passed 18/18 and `npm run check:fast` passed with 0 errors/warnings. This does not prove the running upload worker, app HTTP server, Caddy, or browser path; the live app database still lacks `analysis_job_events`.


**Gate receipt comparison:** final HEAD advanced to `d0ab1c841a016996b0f8f62d4bdade99170f0bc5` via an unrelated precision-tier commit. The SSE route/auth source remained unchanged; the latest focused integration and `check:fast` were run on the SSE worktree. No gate receipt matches current HEAD. The latest available receipt covers Credentials/Crosswalk on older HEAD `a171ad3a5db5efbb1f5e34ccf4f0063d11524e17`; the latest full receipt is older still. The CUDA-capable full gate was not run.


**Retrieval identity parity check:** current worktree review confirms `packet_key` and `source_revision` pass unchanged through the SvelteKit request mapping. Shared protobuf request field 7 and receipt field 19 are represented in generated Go code; Go tests cover exact filtering, deterministic receipt checksums, and protobuf round trips. `go test -count=1 ./...` passed; the adapter identity spec passed 1/1. No live gRPC exchange was exercised.


**CPU native worker checks:** the C++ `graphSimilarity` CPU-fallback addon returned the exact 2×2 expected matrix through the existing worker protocol. The Rust `simd-json` N-API `parseBatch` export returned two expected nested records through the existing worker pool. Both checks were CPU-only; no CUDA addon or GPU work was involved. Existing native exports were preserved.

The event-history DDL is registered as a sidecar migration, but remains unapplied in the live app database.

Final HEAD refresh: `2bae7f688e212e3b6e91569560b88fe5a2723f3d` only changes the unrelated precision-tier policy/report/ledger. No integration receipt matches it; the current full gate remains unproven.


**Real-handler cancellation/backpressure check:** the PostgreSQL scratch integration executes the production SSE handler and actual case authorization helper. It proves event-loop progress, a per-job cap of two (third stream denied with 429), cancellation closing an in-flight poll and releasing the slot, plus queued-to-terminal delivery and resume. The combined suite passed 18/18; `npm run check:fast` passed with 0 errors/warnings. Scratch DDL/data were rolled back. Live app/Caddy/browser delivery remains open because the application database has not had the sidecar event-history migration applied.


**Upload caller regression check:** `/evidence` and `/api/evidence/upload` both authorize through `getAuthorizedCase` and use the canonical `analysis_jobs` `upload_pipeline` owner. The page action inserts evidence/job transactionally; the API route uses separate storage/database steps with durable-job readback and compensation logic. Focused mock-backed tests passed 7/7 across the two callers. This is not live SeaweedFS/worker proof.


Final live database recheck: PostgreSQL 18.4 + pgvector 0.8.3 is running; a read-only transaction confirmed `analysis_job_events` is absent from `legal_ai_db`. The page/API upload tests passed 7/7, route/writer/scratch integration passed 18/18, and `check:fast` passed 0 errors/warnings. No live migration/write or service restart occurred; authorized app/Caddy/browser SSE remains unproven.
