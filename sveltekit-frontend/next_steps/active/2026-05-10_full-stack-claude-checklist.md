# Full-Stack Legal-AI Claude Code Prompt Checklist

**Date**: 2026-05-10
**Audience**: Rails developer ramping into SvelteKit 2 + Svelte 5 runes + Drizzle + Postgres + Qdrant + gRPC.
**Scope**: One reference doc that maps Rails concepts → this stack, lists the prompts to run for each capability, and answers the architecture questions raised in chat (SSE, ACE injection, N-API ↔ Ruby gems, protobuf serialization).

---

## 1. Rails → SvelteKit mental model

| Rails concept | SvelteKit equivalent | Where in this codebase |
|---|---|---|
| ActiveRecord model | Drizzle table declaration | `src/lib/server/db/schema-postgres.ts` |
| `rails db:migrate` | `npx drizzle-kit migrate` (or sidecar `drizzle/manual/*.sql`) | `drizzle/` |
| Controller `index/show/create` | `+page.server.ts` `load` + `actions` | `src/routes/(app)/cases/+page.server.ts` |
| Strong parameters | Zod schema + Superforms v2 | `src/lib/schemas/*.ts` |
| ERB / Slim template | `+page.svelte` (Svelte 5 runes) | `src/routes/**/+page.svelte` |
| Helpers (`link_to`) | Svelte components in `$lib/components/` | `src/lib/components/` |
| ApplicationController hooks | `src/hooks.server.ts` (`handle`) | one file, runs on every request |
| `before_action :authenticate_user!` | `if (!locals.user) throw redirect(302, '/login')` | every `+page.server.ts` load |
| Sidekiq job | RabbitMQ queue + worker | `src/lib/server/queue/` |
| ActionCable WebSocket | Server-Sent Events (one-way) OR plain `ws://` | `src/routes/api/sse/`, `src/routes/api/chat/stream/` |
| Active Job + cron | `scripts/startup/*.mjs` + system cron | `scripts/` |
| Asset pipeline | Vite (built-in) | `vite.config.ts` |
| `pg` gem | `node-postgres` Pool + Drizzle | `$lib/server/db/client` |
| Redis (`redis-rb` gem) | `ioredis` | `$lib/server/redis` |
| RSpec | Vitest (unit) + Playwright (E2E) | `tests/`, `playwright.config.ts` |
| FactoryBot | Inline `pool.query('INSERT ...')` in test setup | `tests/global-setup.ts` |
| RuboCop / standardrb | `svelte-check` + `tsgo` + linter on save | `npm run check` |
| Procfile (Foreman) | `npm run dev` (cross-env vars baked in) | `package.json` |

**The single biggest difference**: Rails serves HTML; SvelteKit serves **a hydrated SPA** that the server first renders to HTML. `+page.server.ts` runs on every navigation — both on the wire (SSR) AND in the browser (client-side nav). You write the data-loading code once; SvelteKit decides where to run it.

---

## 2. The full pipeline (this codebase, today)

```
PDF Upload  →  Granite-Docling OCR  →  Legal Chunker (caption/facts/holding)
    │                                       │
    │                                       ▼
    │                              Postgres legal_documents
    │                              + content_tsv (GIN, Phase 1B ✅)
    │
    ▼
MinIO/SeaweedFS  →  pgvector  →  Qdrant codebase_chunks_768
                       (mirror)        (dense, named vector "content")
                       │                │
                       ▼                ▼
                Karpathy GPU Authority Blend (Redis gpu:karpathy:scores, 24h)
                       │
                       ▼
              ACE Context Assembler  ←  Inferred intent (Phase A ✅)
                       │                            │
                       ▼                            ▼
              Intent Dispatcher  →  MCP TRACE :8788 (88 tools)
              (Phase B ✅)              │
                       │                ▼
                       ▼          KAG operator chain
              Gemma4 synthesis  ←  Multi-lane retrieval
              + JSON-shaped output
                       │
                       ▼
              context_timeline (Postgres)
                       │
                       ▼
              Service Worker offline queue (Phase D pending)
                       │
                       ▼
              Web Research fallback → re-injected into next prompt
```

**Today's status** (verified live 2026-05-10):
- 7 schema drift items fixed
- Atlas smoke 17/17, HyperRAG smoke 10/10, tsgo 0 errors
- 88 MCP tools registered, hypergraph_edges seeded (42 edges, 16,181 members)
- Phase A intent module + Phase B dispatcher both shipped + tested (52/52 tests)
- `/api/rag/search-fused` live (RRF wired)

---

## 3. Claude Code prompt checklist (per capability)

Each row is a **single prompt** you give Claude Code. Run them in sequence; each unit is ≤1 day.

### 3.1 PDF ingestion + evidence viewer

| # | Prompt to give Claude | Done? |
|---|---|---|
| 1 | "Build `src/lib/server/pdf/granite-docling-client.ts` that POSTs PDF buffers to the Docling service at port 8085 and returns block-level extractions" | ⏳ |
| 2 | "Extend `src/lib/server/indexer/legal-chunker.ts` to tag each chunk with `legal_section: 'caption' \| 'facts' \| 'analysis' \| 'holding' \| 'disposition'` and persist to Qdrant payload" | 🟡 parallel agent in progress |
| 3 | "Wire `EvidenceMediaViewer.svelte` into `src/routes/(app)/evidence/[id]/+page.svelte` to render whatever MIME type the file is" | ✅ already done |
| 4 | "Add a `?/analyze` form action to evidence detail that posts the chunk text to `/api/ai/intent-dispatch`, reads the chain result, and persists to `llm_outputs` table" | ⏳ |
| 5 | "Add an `<AnalyzeButton>` component to `EvidenceCard.svelte` that opens an `<EvidenceAnalysisModal>` showing the `llm_outputs.created_at` timestamp + the Gemma4 synthesis" | ⏳ |

### 3.2 SSE chat with ACE injection + multiquery

| # | Prompt to give Claude | Done? |
|---|---|---|
| 6 | "Read `src/routes/api/chat/stream/+server.ts` and explain the SSE event loop in 10 lines" | reference |
| 7 | "Add a multiquery expander: before SSE start, run the user message through `kag.multi_lane_search`, collect top-5 chunks, paraphrase into 3 sub-queries via Gemma3:270m, re-search, merge with RRF" | ⏳ |
| 8 | "When the final chain trace shows < 3 hits and web search is enabled, fall through to `kag.web_search`, embed top web results into Qdrant `research_summaries`, re-query, inject into the prompt's system message" | ⏳ |
| 9 | "Every SSE event also writes a `chat.token` row to `context_timeline` with `payload.delta` so the dwell-time analytics lane has signal" | ⏳ |

### 3.3 Service Worker offline lane (Phase D of design doc)

| # | Prompt to give Claude | Done? |
|---|---|---|
| 10 | "Extend `static/sw.js` with the analytics-POST allowlist + IndexedDB queue per `next_steps/active/2026-05-10_service-worker-regex-tool-router.md` §1" | ⏳ |
| 11 | "Add `src/lib/client/sw-register.ts` + `src/lib/client/timeline-client.ts` with `postTimelineEvent()` (fire-and-forget) + `flushTimelineQueueNow()` + `getTimelineQueueDepth()`" | ⏳ |
| 12 | "Inject the SW bootstrap into `src/app.html` `<head>` as a single `<script type=\"module\">`" | ⏳ |

### 3.4 Tooling + DX

| # | Prompt to give Claude | Done? |
|---|---|---|
| 13 | "Run `npm run audit:dirs` for the directory you're touching before opening a PR" | rule |
| 14 | "Add the new test file to `vitest.config.ts` `include[]` (allowlist — no glob expansion)" | rule |
| 15 | "Apply any new schema with `drizzle/manual/YYYYMMDD_*.sql` — never `drizzle-kit push`" | rule |

---

## 4. SSE chat — how it really works (mapped from Rails ActionCable)

ActionCable streams over WebSocket — bidirectional, persistent connection. SSE is one-way (server → client) but uses plain HTTP/1.1 (no upgrade handshake, traverses corporate proxies, works with HTTP caches).

**This codebase uses SSE because**:
- LLM token streaming is one-way (server emits; client just renders)
- ChatGPT, Claude.ai, Anthropic API all use SSE
- Avoids needing a separate WebSocket server / sticky-session load balancer

**SSE wire format**:
```
data: {"delta":"Hello"}

data: {"delta":" world"}

event: done
data: {"finishReason":"stop"}

```

(Two newlines terminate each event. `event:` is optional and defaults to `message`.)

**SvelteKit pattern** (from `src/routes/api/chat/stream/+server.ts`):
```ts
export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) throw error(401);
  const query = url.searchParams.get('q') ?? '';

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (evt: string, data: object) =>
        controller.enqueue(enc.encode(`event: ${evt}\ndata: ${JSON.stringify(data)}\n\n`));

      // ACE injection happens HERE, before the LLM call
      const intent = inferIntent(query);
      const decision = routeIntent(intent, query, { userId: locals.user.id, sessionId: '' });
      const ctxExec = await executeChain(decision, { /* ctx */ });

      send('context', { chain: decision.chain.map(s => s.tool), trace: ctxExec.trace });

      const systemPrompt = `Context retrieved:\n${JSON.stringify(ctxExec.result)}\n\nAnswer:`;
      for await (const tok of streamFromOllama({ system: systemPrompt, user: query })) {
        send('delta', { delta: tok });
      }
      send('done', { finishReason: 'stop' });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  });
};
```

**Client side** (`+page.svelte`):
```svelte
<script lang="ts">
  let response = $state('');
  const src = new EventSource(`/api/chat/stream?q=${encodeURIComponent(q)}`);
  src.addEventListener('delta', (e) => { response += JSON.parse(e.data).delta; });
  src.addEventListener('done', () => src.close());
</script>
<pre>{response}</pre>
```

---

## 5. ACE-into-prompt JSON loop

The "JSON loop" pattern: the model emits structured JSON, the server validates it with Zod, fans out tool calls, feeds results back into the next prompt. Stops when `finishReason: 'stop'` OR max rounds hit.

```
User query
   │
   ▼
inferIntent (Phase A) → label, keywords, confidence
   │
   ▼
routeIntent (Phase B) → chain: [kag.multi_lane_search, kb.search_summary_tree, ...]
   │
   ▼
executeChain → trace: [{tool, ms, ok, data}, ...]
   │
   ▼
ace.build_kv_packet({ taskId, hotFiles, hotSymbols })
   │
   ▼
Gemma4 system prompt: { context: <kv_packet>, query: <text> }
   │
   ▼
Gemma4 streams tokens via SSE
   │
   ├── If response is JSON-shaped {"tool_calls": [...]}:
   │     → execute tools, append results, recurse (max 5 rounds)
   │
   ├── If trace has < 3 hits AND web search enabled:
   │     → kag.web_search → embed results → re-inject → re-query (1 round)
   │
   └── Else: emit `done` event
```

**Why JSON**: Gemma4 was fine-tuned with GRPO on Zod-validated output schemas. The model emits valid JSON >95% of the time. Zod's `.safeParse()` catches the rest and falls back to plain-text answer.

---

## 6. UnoCSS + bits-ui v2 + Svelte 5 runes — minimal pattern

```svelte
<script lang="ts">
  import { Dialog } from 'bits-ui';
  let { caseId }: { caseId: string } = $props();
  let open = $state(false);
  let analysis = $state<string | null>(null);

  async function analyze() {
    open = true;
    const r = await fetch('/api/ai/intent-dispatch', {
      method: 'POST',
      body: JSON.stringify({ text: `analyze case ${caseId}`, caseId }),
    });
    const data = await r.json();
    analysis = data.result?.summary ?? '(no result)';
  }
</script>

<button class="btn-primary" onclick={analyze}>Analyze</button>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 bg-black/60" />
    <Dialog.Content class="panel max-w-2xl p-6">
      <Dialog.Title class="text-lg font-semibold text-sand">Analysis</Dialog.Title>
      <p class="mt-3 text-sm">{analysis ?? 'Loading…'}</p>
      <Dialog.Close class="btn-base mt-4">Close</Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

**Notes**:
- `$state()` / `$props()` are the runes — no more `export let` or `writable()`
- `btn-primary`, `panel` are UnoCSS shortcuts defined in `unocss.config.ts`
- `bits-ui` is headless (no styles) — UnoCSS + your theme tokens style everything
- `Dialog.Portal` renders the content at `<body>` end (z-index sanity)

---

## 7. REST CRUD + JSON-into-SSR — the SvelteKit way

Rails: `def index; @cases = Case.all; respond_to :html, :json; end` then `index.html.erb` reads `@cases`.

SvelteKit: split SSR from API:

| Surface | Path | Returns |
|---|---|---|
| **SSR** (renders HTML) | `src/routes/(app)/cases/+page.server.ts` `load()` | Object passed to `+page.svelte` as `data` prop |
| **JSON API** (client / external consumers) | `src/routes/api/cases/+server.ts` `GET/POST/PATCH/DELETE` | JSON only |
| **Form actions** (progressive enhancement) | `src/routes/(app)/cases/+page.server.ts` `actions: { create, delete }` | Either |

The DRY rule: write the DB query **once** in a shared module (`$lib/server/db/cases.ts`) and call it from BOTH `+page.server.ts` AND `+server.ts`. That's the Rails "concern" pattern, but with explicit imports instead of magic mixin.

---

## 8. Coming from Ruby: N-API, protobuf, gRPC

You asked about the parallel between Ruby C extensions and Node's N-API. Quick mental model:

| Ruby | Node.js | This codebase |
|---|---|---|
| Ruby C extension (`mkmf`) | N-API native addon (`.node` file) | `simd-bridge/cpp/build/Release/tensorrt_bridge.node` |
| `Rice` / `RbCall` gem helpers | `node-addon-api` (C++ wrapper around N-API) | wraps LibTorch + simdjson |
| `require 'json'` (MRI built-in) | `require('./tensorrt_bridge.node')` | called from `src/lib/server/gpu/libtorch-bridge.ts` |

**The crucial similarity**: both compile to a `.so`/`.dll`/`.dylib` that the interpreter `dlopen`s. The interpreter's calling convention does the marshalling (Ruby's `VALUE` ↔ C; Node's `napi_value` ↔ C++).

**Why this matters here**: `tensorrt_bridge.node` exposes GPU functions (`attentionScoreGPU`, `pageRankGPU`, `kmeansWithCentroids`) directly to the SvelteKit server. No HTTP, no gRPC — same process, ~10μs call overhead vs ~5ms over the wire.

### gRPC / protobuf — when to use it

| Approach | When | Example here |
|---|---|---|
| **N-API in-process** | Hot path, same machine, low latency | LibTorch attention, simdjson parsing |
| **gRPC** | Cross-process, polyglot (Go ↔ TS), need streaming | `go-retrieval-service` on port 50053 |
| **Plain HTTP/JSON** | Cross-process, simple request/response, no streaming | `/api/ai/intent-dispatch` |
| **MCP (Streamable HTTP)** | Tool-calling boundary between LLM + services | TRACE MCP `:8788` |

**Protobuf** is the wire format gRPC uses. It's:
1. A schema language — you write `case.proto` and it generates Go/TS/Python stubs
2. A binary encoder — smaller + faster than JSON for repeated nested structures
3. Forward-compatible — adding a field doesn't break old clients

**This codebase generates protobufs from Zod schemas** (per CLAUDE.md):
```bash
npm run proto:from-zod
```
The Zod schema is the source of truth (used by SvelteKit routes + form validation), and gRPC services get the auto-generated `.proto` file from it. No manual sync.

### When to swap from JSON to protobuf

| Stay on JSON when | Switch to protobuf when |
|---|---|
| < 100 req/s | > 1000 req/s |
| Browser is the consumer | Server-to-server only |
| Debug-ability matters | Wire-size matters |
| Schemas evolve weekly | Contract is stable |

Today, `/api/ai/intent-dispatch` is JSON because the browser consumes it. The Go retrieval service uses gRPC because it's server↔server and embedding vectors are 768 floats × 8 bytes = 6KB per row — JSON inflation would 3x that.

---

## 9. Multiquery + web research fallback loop — concrete contract

```ts
// Pseudocode for the loop you described
async function answerWithFallback(query: string, ctx: RouterContext) {
  // 1. Initial intent + chain (Phase B)
  const intent   = inferIntent(query);
  const decision = routeIntent(intent, query, ctx);
  let   ctxExec  = await executeChain(decision, ctx);
  let   hits     = countHits(ctxExec.result);

  // 2. Multiquery expansion if intent confidence is mid-band
  if (intent.confidence < 0.7 && hits < 5) {
    const subQueries = await paraphrase(query, 3);  // Gemma3:270m, 4.5s
    const subExecs   = await Promise.all(
      subQueries.map((sq) => executeChain(routeIntent(inferIntent(sq), sq, ctx), ctx))
    );
    ctxExec = mergeRRF([ctxExec, ...subExecs]);    // src/lib/server/retrieval/rrf-fuse.ts
    hits    = countHits(ctxExec.result);
  }

  // 3. Web research fallback if STILL under-resourced
  if (hits < 3) {
    const webResults = await callTraceMcp('kag.web_search', { query });
    await embedAndUpsert(webResults, 'research_summaries');  // Qdrant + Postgres mirror
    ctxExec = await executeChain(decision, ctx);  // Re-run with fresh data
  }

  // 4. JSON-loop synthesis (Gemma4, max 5 rounds)
  return jsonLoopSynthesis(query, ctxExec.result, { maxRounds: 5 });
}
```

Each arrow above is a single Claude Code prompt (~30 min each). All four steps land in `context_timeline` so the dashboard at `/admin/search-intelligence` can show effectiveness over time.

---

## 10. Status of this design (what's already shipped)

| Layer | Status | Where |
|---|---|---|
| inferIntent (Phase A) | ✅ 31/31 tests | `src/lib/intent/regex-intent.ts` |
| routeIntent + executeChain (Phase B) | ✅ 21/21 tests | `src/lib/server/ai/intent-router.ts` |
| `/api/ai/intent-dispatch` + `/api/ai/contextual-chat` | ✅ both wired to router | `src/routes/api/ai/` |
| Rune store (Phase C) | ✅ already exists | `src/lib/stores/contextual-chat.svelte.ts` |
| IntentBadge component (Phase C) | ✅ this session | `src/lib/components/intent/IntentBadge.svelte` |
| Demo page (Phase C) | ⏳ deferred per operator request | `src/routes/(dev)/intent-chat/` |
| Service Worker (Phase D) | ⏳ design only | `next_steps/active/2026-05-10_service-worker-regex-tool-router.md` |
| RRF fusion module | ✅ 18/18 tests, wired in `/api/rag/search-fused` | `src/lib/server/retrieval/rrf-fuse.ts` |
| Sparse BM25 (Postgres GIN) | ✅ migration applied | `drizzle/manual/20260510_legal_documents_tsvector.sql` |
| Karpathy GPU blend → HyperRAG | ✅ already wired | `src/lib/server/atlas/context-for-file.ts:416` |

**52 tests added this session, all green. 8 schema drift items closed.**

---

## 11. Anti-checklist (don't do these)

| Don't | Why |
|---|---|
| `drizzle-kit push` against the prod DB | Will DROP tables not in TS schema — 24 of them per CLAUDE.md audit |
| Mock the DB in integration tests | Past incident: mock/prod divergence masked a broken migration |
| Cache an SSE response anywhere | Streams are uncacheable; intermediate proxies break the connection |
| Use Svelte 4 patterns (`export let`, `$:`, `on:click`) | tsgo + svelte-check actively reject them — see G21-G25 |
| Add a new MCP tool without updating `master_agents.md` | The 88-tool registry is load-bearing for the intent router chain mapping |
| Block on GPU work in the SvelteKit request path | GPU work goes in `compute-pool` worker_threads or RabbitMQ queues |
| Mix raw Tailwind classes with UnoCSS shortcuts | Class collisions; pick one |
| Build a "Claude design plugin" | Anthropic ships none. shadcn-svelte fills the gap if you want it |

---

## 12. References

- `next_steps/active/2026-05-10_service-worker-regex-tool-router.md` — full Phase A-D design
- `docs/master_agents.md` — 65-gate audit reference + 88-tool surface map
- `CLAUDE.md` (root + sveltekit-frontend) — operating rules, schema drift catalog, cache hierarchy
- `next_steps/active/2026-05-09_karpathy-chr97-wiring.md` — sister design doc for cartridge layer

---

**Doc length**: ~400 lines, designed to fit in a single Claude context as a starting prompt.
