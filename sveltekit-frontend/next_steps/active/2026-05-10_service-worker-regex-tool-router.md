# Service Worker Token Offload + Regex Intent Router — Design Doc

**Status**: design-only, not implemented. Ship in a future session after operator review.
**Created**: 2026-05-10
**Scope**: two independent-but-related lanes that move "ambient intelligence" off the request path:
1. **SW token offload + offline ACE timeline buffer** — drains analytics POSTs from the main thread, survives reconnects.
2. **Regex intent detector → KAG operator router** — a 5-label cheap classifier in front of the contextual-chat fetch, picks an MCP tool chain instead of always defaulting to `kag.multi_lane_search`.

Both ride existing infrastructure. No new MCP tools, no new tables, no replacement of `/api/admin/ai-chat`.

---

## Verified prerequisites (read before reviewing)

| Asset | Path | Confirmed |
|---|---|---|
| Existing rune store pattern | `src/lib/stores/admin-chat-assistant.svelte.ts` | Class-backed `$state`, singleton export, `summarizePanel` lane |
| Timeline POST contract | `src/routes/api/analytics/context-timeline/+server.ts` | Single-event POST, Zod-validated, returns `{ id }` 201 |
| Existing SW (329 LoC) | `static/sw.js` | `CACHE_VERSION = 'v1.5.0'`, only handles static + shell caching, no fetch interception of POSTs |
| MCP tool registry | `src/mcp/trace-mcp-server.ts` (port `:8788`) | 88 tools — `kag.*` (8: `multi_lane_search`, `web_search`, `feature_lookup`, `panel_context`, `record_agent_run`, `ingest_*`, `recall_similar_fix`), `kb.*` (`hybrid_search`, `search_summary_tree`, `search_pathways`, `search_notecards`, `explain_context_pack`), `search.*` (`hybrid`, `rerank`, `postgres_fts`, `go_hybrid`, `dev_context`) |
| User ID typing | Lucia v3 `locals.user.id` is `string` | Cast `Number(locals.user.id)` for `context_timeline.user_id` (integer FK) |

**Constraint discovered (flag, do not fix)**: `/api/analytics/context-timeline` POST currently accepts **one event per request**. The SW batch contract needs many. Design here treats this as a backend constraint and keeps the SW posting one-at-a-time inside a `Promise.all` ladder — see §1.7 failure modes. A follow-up to add a `POST /api/analytics/context-timeline/batch` endpoint is listed under non-goals.

---

## Piece 1 — Service Worker token offload + offline ACE timeline sync

### 1.1 Architecture diagram

```
┌────────────────────────────────────────────────────────────────────┐
│  MAIN THREAD (Svelte 5 component)                                  │
│  ──────────────────────────────────────────────────────────────    │
│  contextualChat.send(query)                                        │
│      │                                                              │
│      ├── inferIntent(query)               (Piece 2 — see below)    │
│      ├── postTimelineEvent('chat.intent') ─┐                        │
│      └── fetch('/api/ai/contextual-chat')  │                        │
│                                            │                        │
│  $effect(() => userScrolled, dwellTimer) ──┤                        │
│      │                                     │                        │
│      └── postTimelineEvent('dwell_long')   │                        │
└─────────────────────────────────────────── │ ───────────────────────┘
                                             │
                                             ▼  POST /api/analytics/context-timeline
┌────────────────────────────────────────────────────────────────────┐
│  SERVICE WORKER (static/sw.js — extended)                          │
│  ──────────────────────────────────────────────────────────────    │
│   fetch handler:                                                    │
│     URL match? /api/analytics/context-timeline ──► try network     │
│       online   → forward, on 5xx queue, on 2xx return              │
│       offline  → enqueue IndexedDB, return 202 Accepted (synthetic)│
│                                                                     │
│   sync handler ('online' event + Background Sync):                 │
│     drainQueue() → for each row: fetch with same headers           │
│       2xx → delete row                                              │
│       5xx → increment retryCount, lastError                         │
│       4xx → mark dead, surface to console (cookie expired)         │
└────────────────────────────────────────────────────────────────────┘
                                             │
                                             ▼
                                   Postgres context_timeline
                                   (existing endpoint, no change)
```

### 1.2 What runs where

| Layer | Responsibility | NOT responsibility |
|---|---|---|
| **Main thread** | UI events, build event payload, fire `postTimelineEvent()` (no await), inject SW registration once | Stream chunking, hash computation on >1KB payloads, retry logic, IndexedDB I/O |
| **Web Worker** (existing `chat-worker.js`) | LLM streaming, ONNX inference, hash heavy payloads | Fetch interception, persistence, auth header injection |
| **Service Worker** (`static/sw.js` extended) | Intercept POSTs to whitelisted analytics URLs, IndexedDB queue, drain on `online`/`sync`, retry with backoff, NEVER touch SSE | Authentication decisions, business logic, mutating any non-analytics route, modifying request bodies |

### 1.3 URL pattern policy (load-bearing)

The SW MUST handle:
- `POST /api/analytics/context-timeline` (single-event drain)
- `POST /api/analytics/rl-signal` (already exists per CLAUDE.md "RL feedback loop" line)

The SW MUST IGNORE (passthrough only — `event.respondWith` not called):
- `text/event-stream` Accept header (any URL — guards against SSE breakage)
- `/api/auth/*` (login flow can never be cached)
- `/api/ai/*` (contextual chat, agent loop, streaming completions)
- `/api/cache/*` (Bifrost L1/L2 paths)
- `/api/admin/*` (admin actions must be online-or-fail)
- Any `Upgrade: websocket` request

**Implementation rule**: in `sw.js` fetch handler, guard with `if (req.method !== 'POST') return;` then explicit allowlist match — default-deny.

### 1.4 IndexedDB queue schema

DB name: `yorha-sw-queue`, version `1`, store `pending_events`.

```ts
interface PendingEvent {
  key:         string;        // crypto.randomUUID(), keyPath of object store
  url:         string;        // '/api/analytics/context-timeline'
  body:        string;        // JSON-stringified POST body
  headers:     [string,string][];  // serialized — Headers can't be cloned to IDB
  enqueuedAt:  number;        // Date.now()
  retryCount:  number;        // 0 on first enqueue, ++ on each failed drain
  lastError:   string | null; // last network error message (truncated 200 chars)
  deadAt:      number | null; // null = active; timestamp = abandoned (4xx or retryCount>10)
}
```

Indexes: `enqueuedAt` (for FIFO drain), `deadAt` (for purge job).

Quota policy: target ≤ 5 MB. On `QuotaExceededError`, drop the oldest 100 rows and log a `sw.queue_overflow` event when next online.

### 1.5 Files to add

| Path | Role | LoC est. |
|---|---|---|
| `static/sw.js` | Extend existing 329-LoC file with analytics interception block | +180 |
| `src/lib/client/sw-register.ts` | Idempotent `navigator.serviceWorker.register()` + version-skew detector | ~80 |
| `src/lib/client/timeline-client.ts` | `postTimelineEvent(eventType, payload)` — dispatches to SW or falls back to direct fetch when SW absent | ~60 |
| `src/app.html` | One `<script type="module">import '/sw-register.js'` line in `<head>` | +1 |

Use Vite's `?url` import for `sw-register.ts` from a tiny inline bootstrap if path resolution gets awkward; otherwise emit a static copy at `static/sw-register.js`.

### 1.6 TypeScript signatures (no implementation)

```ts
// src/lib/client/timeline-client.ts
export interface TimelineEventInput {
  eventType:   string;                    // 'chat.intent' | 'dwell_long' | ...
  pipeline?:   'ace' | 'rag' | 'kag' | 'dag' | 'codebase';
  sessionId?:  string;
  payload?:    Record<string, unknown>;
}

export function postTimelineEvent(evt: TimelineEventInput): void;     // fire-and-forget
export async function flushTimelineQueueNow(): Promise<{ drained: number; failed: number }>;
export async function getTimelineQueueDepth(): Promise<number>;       // for debug panel

// src/lib/client/sw-register.ts
export interface SwRegistrationStatus {
  registered: boolean;
  controller: 'active' | 'installing' | 'waiting' | 'none';
  version:    string | null;
  reason?:    string;          // why not registered (no-controller, http, etc.)
}
export async function registerServiceWorker(): Promise<SwRegistrationStatus>;
export function onServiceWorkerUpdate(cb: (next: string) => void): () => void;
```

### 1.7 Failure modes (Piece 1)

| Failure | Symptom | Mitigation |
|---|---|---|
| Stale SW after deploy (cached `v1.5.0` competes with `v1.6.0`) | Old fetch handler intercepts new analytics shape, payload rejected | Bump `CACHE_VERSION`, call `self.skipWaiting()` in install, broadcast `controllerchange` to main thread; surface upgrade banner via `onServiceWorkerUpdate` |
| SW rejects auth (cookie expired mid-queue) | Drained events fail 401, retry forever | Treat 401/403 as terminal: set `deadAt`, do NOT retry; expose count via `getTimelineQueueDepth()` for the admin status panel |
| Double-flush after reconnect (`online` event fires N times in 200ms on flaky links) | Same row POSTed twice → duplicate `context_timeline` rows | Guard `drainQueue()` with a SW-scope `let draining = false` mutex; check `deadAt === null` AND atomic `IDBCursor.delete()` after 2xx before next iteration |
| IndexedDB quota exceeded (5MB hit on long offline session) | New events silently dropped | `QuotaExceededError` handler purges oldest 100, logs `sw.queue_overflow` event when next online |
| SW hot-update race (new SW activates while drain in-flight) | Drain promise rejected, rows half-deleted | Wrap drain in `event.waitUntil()` inside `activate` handler; old SW finishes drain before `clients.claim()` |

---

## Piece 2 — Regex intent detector → KAG operator router

### 2.1 Architecture diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│  Svelte 5 contextual chat rune store (NEW: contextual-chat.svelte.ts)│
│  ────────────────────────────────────────────────────────────────    │
│  send(text) {                                                         │
│    const intent = inferIntent(text)              ← pure, ~2 ms       │
│    postTimelineEvent({                                                │
│      eventType: 'chat.intent',                                        │
│      payload: { label, confidence, keywords, route }                  │
│    })                                                                 │
│    fetch('/api/ai/contextual-chat', {                                 │
│      body: JSON.stringify({ text, intent })                           │
│    })                                                                 │
│  }                                                                    │
└──────────────────────────────────────────────────────────────────────┘
                            │
                            ▼  POST /api/ai/contextual-chat (NEW route)
┌──────────────────────────────────────────────────────────────────────┐
│  Backend dispatcher (src/lib/server/ai/intent-router.ts)             │
│  ────────────────────────────────────────────────────────────────    │
│  routeIntent(intent, ctx)                                             │
│    ├── confidence < 0.5 → fallback: kag.multi_lane_search             │
│    ├── label === 'legal_research'                                     │
│    │     → kag.multi_lane_search → kb.search_summary_tree → kag.feature_lookup
│    ├── label === 'graph_search'                                       │
│    │     → graph.expand_neighborhood → graph.shortest_path            │
│    ├── label === 'gpu_rerank'    → search.rerank                      │
│    ├── label === 'evidence_upload'→ kb.search_notecards               │
│    ├── label === 'schema_drift'  → kb.search_summary_tree             │
│    └── label === 'ui_bug'        → search.dev_context                 │
└──────────────────────────────────────────────────────────────────────┘
                            │
                            ▼  HTTP to TRACE MCP :8788
                  Existing 88-tool registry (no changes)
```

### 2.2 `inferIntent` signature

```ts
// src/lib/intent/regex-intent.ts (pure module, no imports beyond stdlib)
export type IntentLabel =
  | 'evidence_upload'
  | 'schema_drift'
  | 'graph_search'
  | 'gpu_rerank'
  | 'ui_bug'
  | 'legal_research';

export interface IntentResult {
  label:       IntentLabel | 'unknown';
  confidence:  number;          // 0..1
  keywords:    string[];        // matched tokens, for telemetry + UI badge
  fallback:    boolean;         // true when confidence < 0.5
}

export function inferIntent(text: string): IntentResult;

// Each label has 1 high-precision regex + 1 keyword list. Confidence rule:
//   regex hit AND ≥2 keyword hits  → 0.9
//   regex hit AND 1 keyword hit    → 0.7
//   regex hit alone                → 0.55
//   keywords only (≥3)             → 0.5
//   keywords only (≤2)             → 0.3 → fallback=true
```

Example label table (kept inline, not in a separate JSON — small enough to grep):

| Label | Regex (case-insensitive) | Keywords |
|---|---|---|
| `evidence_upload` | `\b(upload\|attach\|drop\|ingest)\b.*\b(evidence\|document\|pdf\|image)\b` | upload, evidence, file, OCR, MinIO, hash |
| `schema_drift` | `\b(schema\|column\|table\|migration)\b.*\b(drift\|mismatch\|missing)\b` | drizzle, migration, column, enum, postgres |
| `graph_search` | `\b(neighbor\|path\|hop\|expand\|trace).*\b(graph\|node\|edge)\b` | neo4j, cypher, neighborhood, hops, BFS |
| `gpu_rerank` | `\b(rerank\|score\|attention\|blend)\b` | karpathy, GPU, attention, cosine, top-K |
| `ui_bug` | `\b(button\|click\|render\|hydrat\|console\|404\|500)\b` | broken, error, doesn't work, undefined, NaN |
| `legal_research` | `\b(case law\|statute\|citation\|precedent\|holding)\b` | court, ruling, opinion, plaintiff, doctrine |

### 2.3 Router contract

```ts
// src/lib/server/ai/intent-router.ts
export interface RouterContext {
  userId:      number;
  sessionId:   string;
  caseId?:     string;
  filePath?:   string;
}

export interface OperatorChainStep {
  tool:        string;          // 'kag.multi_lane_search'
  args:        Record<string, unknown>;
  takeFrom?:   number;          // 0-indexed: which prior step's result feeds this one
}

export interface RouterDecision {
  intent:      IntentResult;
  chain:       OperatorChainStep[];
  fallback:    boolean;
  reason:      string;          // one-line audit trail
}

export function routeIntent(
  intent: IntentResult,
  text:   string,
  ctx:    RouterContext,
): RouterDecision;

// Dispatcher: walks the chain, pipes step[i].result → step[i+1] when takeFrom set
export async function executeChain(
  decision: RouterDecision,
  ctx:      RouterContext,
): Promise<{ result: unknown; trace: { tool: string; ms: number; ok: boolean }[] }>;
```

### 2.4 Files to add

| Path | Role | LoC est. |
|---|---|---|
| `src/lib/intent/regex-intent.ts` | Pure `inferIntent()` + label table | ~120 |
| `src/lib/stores/contextual-chat.svelte.ts` | Rune store mirroring `admin-chat-assistant` shape | ~180 |
| `src/lib/server/ai/intent-router.ts` | `routeIntent` + `executeChain` (calls TRACE MCP `:8788` over HTTP) | ~200 |
| `src/routes/api/ai/contextual-chat/+server.ts` | POST handler — auth guard, Zod validate, run dispatcher, write `chat.intent` to `context_timeline` server-side too (defense in depth) | ~120 |
| `tests/intent/regex-intent.spec.ts` | Vitest table tests (~30 cases) | ~150 |

### 2.5 Failure modes (Piece 2)

| Failure | Symptom | Mitigation |
|---|---|---|
| Regex over-matches (e.g. "evidence" appears in `gpu_rerank` query) | Wrong tool chain, slow useless retrieval | Confidence floor 0.5 → fallback to `kag.multi_lane_search`; log `chat.intent` with both candidate labels in `payload.alternates` for offline tuning |
| MCP tool chain step times out | First step succeeds, second hangs → user sees nothing | Per-step `AbortSignal` with 8s deadline; on abort, return partial chain trace with `ok: false` for hung step; UI degrades to "showing partial results" badge |
| Operator chain returns conflicting shapes (graph vs vector) | `takeFrom` index points at wrong-shape data | Each step contract: declare `inputShape` + `outputShape` as Zod schema in `intent-router.ts`; chain validation throws at chain-build time, not runtime |
| `chat.intent` event fires before user actually sends (e.g. typing autocomplete) | Pollutes `context_timeline` with phantom intents | Only call `inferIntent()` on send-button click / Enter — NOT on `oninput` debouncer |
| Rate-limit on TRACE MCP `:8788` | 429 mid-chain | Already handled — see CLAUDE.md "Rate limit: 20 req/user/min Redis token bucket"; surface 429 as `RouterDecision.reason = 'rate_limited'` and fall back to single `kag.multi_lane_search` |

---

## 3. Postgres schema additions

**None required.** The existing `context_timeline` table fits the `chat.intent` shape:

```sql
-- already exists per drizzle/0015_context_timeline.sql
-- INSERT (no migration needed):
--   event_type = 'chat.intent'
--   pipeline   = 'ace'
--   payload    = { label, confidence, keywords, route, fallback, alternates? }
```

If a future operator wants a dedicated index on `payload->>'label'` for intent-distribution dashboards, add this idempotent stub:

```sql
-- drizzle/manual/20260510_chat_intent_index.sql (DEFERRED — only if telemetry demands)
CREATE INDEX IF NOT EXISTS context_timeline_chat_intent_label_idx
  ON context_timeline ((payload->>'label'))
  WHERE event_type = 'chat.intent';
```

---

## 4. Test strategy

| Layer | Tool | File | What it asserts |
|---|---|---|---|
| Unit (pure) | Vitest | `tests/intent/regex-intent.spec.ts` | 30+ table cases — each label fires for typical queries, fallback fires for ambiguous ones, confidence math is monotonic |
| Unit (router) | Vitest | `tests/intent/intent-router.spec.ts` | `routeIntent` returns expected chain per label; chain Zod validation rejects bad `takeFrom` |
| Integration (SW) | Vitest + `happy-dom` shim | `tests/sw/sw-queue.spec.ts` | IDB queue insert/drain/dead-row paths; mock `fetch` for 2xx/5xx/401 branches |
| Integration (route) | Vitest (`@vitest-environment node`) | `tests/routes/api/ai/contextual-chat.spec.ts` | G26 lazy-import pattern: 401 unauth, 400 bad input, 200 happy path with mocked MCP, 502 when MCP unreachable |
| E2E | Playwright | `tests/e2e/intent-router.spec.ts` | Type each of 6 label-typical queries, assert correct tool chain badge appears in UI; assert `chat.intent` row exists in `context_timeline` (read via `/api/analytics/context-timeline?eventType=chat.intent&limit=1`) |
| E2E (SW offline) | Playwright | `tests/e2e/sw-offline-buffer.spec.ts` | `context.setOffline(true)` → fire 5 events → `setOffline(false)` → wait → assert all 5 land in `context_timeline` exactly once |

Run gates:
```bash
npm run test:unit -- tests/intent/
npm run test:unit -- tests/sw/
npm run test:integration -- tests/routes/api/ai/contextual-chat.spec.ts
npx playwright test tests/e2e/intent-router.spec.ts tests/e2e/sw-offline-buffer.spec.ts
```

---

## 5. Build order (4 phases, ≤1 day each)

### Phase A — Pure intent module + tests (≤4h)
- Write `src/lib/intent/regex-intent.ts` (pure, no I/O)
- Write `tests/intent/regex-intent.spec.ts` (30+ cases)
- **Ready for review when**: `npm run test:unit -- tests/intent/` is green, all 6 labels + fallback covered, no false-positives on the 5 ambiguous-query test cases. No other files touched.

### Phase B — Backend route + dispatcher (≤1d)
- Write `src/lib/server/ai/intent-router.ts` (`routeIntent` + `executeChain` + Zod step shapes)
- Write `src/routes/api/ai/contextual-chat/+server.ts` (auth guard, Zod, dispatch, `context_timeline` write)
- Write `tests/intent/intent-router.spec.ts` + `tests/routes/api/ai/contextual-chat.spec.ts`
- **Ready for review when**: G26-compliant route test (4 baseline cases) passes; `routeIntent` returns the expected chain for each of 6 labels; `executeChain` mocks pass; `chat.intent` rows visible via `GET /api/analytics/context-timeline?eventType=chat.intent`.

### Phase C — Rune store + UI wiring (≤1d)
- Write `src/lib/stores/contextual-chat.svelte.ts` (mirrors `admin-chat-assistant` shape)
- Wire one consumer page (suggested: `/admin/search-intelligence` Graph tab — already has the analytics surface)
- Render an intent badge on each user message (label + confidence pill, neutral if fallback)
- **Ready for review when**: typing the 6 label-typical queries lights up the right badge; `chat.intent` rows land in `context_timeline`; failing MCP step shows partial-results badge.

### Phase D — Service Worker offline lane (≤1d)
- Extend `static/sw.js` with analytics-URL allowlist + IDB queue + `online`/`sync` drain
- Write `src/lib/client/sw-register.ts` + `src/lib/client/timeline-client.ts`
- Inject one `<script type="module">` in `src/app.html` `<head>`
- Switch `contextual-chat.svelte.ts` calls from direct `fetch('/api/analytics/context-timeline')` to `postTimelineEvent()`
- Write `tests/sw/sw-queue.spec.ts` + `tests/e2e/sw-offline-buffer.spec.ts`
- **Ready for review when**: bump `CACHE_VERSION` to `v1.6.0` (forces re-install for testers); offline E2E proves 5 events queue and drain on reconnect with no duplicates; `getTimelineQueueDepth()` returns 0 after drain.

---

## 6. What this does NOT do (explicit non-goals)

- **Does NOT replace `/api/admin/ai-chat`.** The admin Copilot keeps its current direct route; only the new contextual-chat surface routes through the intent dispatcher.
- **Does NOT do server-side streaming inside the SW.** SSE responses (`text/event-stream`) are explicitly excluded from the SW fetch handler — passthrough only.
- **Does NOT add a new MCP tool.** All 6 intent labels map to existing tools in the verified 88-tool registry. Zero changes to `src/mcp/`.
- **Does NOT modify `context_timeline` schema or POST contract.** The discovered single-event constraint is documented in §0; a future `POST .../batch` endpoint is out of scope.
- **Does NOT replace the existing 329-LoC `static/sw.js` shell-cache logic.** The new analytics block is additive — same file, same `CACHE_VERSION` bump policy.
- **Does NOT do client-side ML for intent classification.** Regex + keyword counts only. Phase E (future) could swap in the gemma 270M ONNX classifier already in `static/gemma3_270m_onnx/` — but this design ships pure regex first.
- **Does NOT precompute the SW queue drain on app boot.** Drain is `online`-event-driven only. App boot is not allowed to block on IDB.
- **Does NOT cover anonymous (logged-out) users.** The `/api/analytics/context-timeline` endpoint requires `locals.user` (verified line 52); SW queue rows POSTed while logged-out will hit 401 and go to `deadAt`. The synthetic 202 from the SW is a UX lie only when the user is authenticated.

---

## 7. Cross-references

- `src/lib/stores/admin-chat-assistant.svelte.ts` — rune store shape mirrored by `contextual-chat.svelte.ts`
- `src/routes/api/analytics/context-timeline/+server.ts` — POST contract, auth requirement, Zod schema
- `src/mcp/trace-mcp-server.ts` (port `:8788`) — registry of `kag.*`, `kb.*`, `search.*`, `graph.*`, `topology.*`, `clusters.*`, `context.*` tool names
- `static/sw.js` — existing 329-LoC shell-cache SW; `CACHE_VERSION = 'v1.5.0'` → bump to `v1.6.0` on Phase D
- `next_steps/active/2026-05-09_karpathy-chr97-wiring.md` — sister design doc; same tone reference
- `memory/architecture/admin-chat-assistant.md` — rune store conventions (per CLAUDE.md cross-references)
- `memory/architecture/client-inference-policy.md` — SW vs Web Worker rules (per CLAUDE.md cross-references)
- CLAUDE.md §"Retrieval Lanes — Vector vs Hyper-Graph-RAG" — explains why labels map to specific tool chains

---

**Doc length**: 437 lines (under the 600-line cap).
