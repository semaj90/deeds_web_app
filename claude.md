# Legal AI Platform — Claude Project Instructions

## Last Updated: May 3, 2026 (GraphRAG community layer + deep compiler stack audit)
## Status: svelte-check 0 errors, 0 warnings | vite build PASSES | Playwright 20/20

---

## IDE Linter Warning

VS Code ESLint/Prettier auto-reformats files on disk change, sometimes reverting Edit tool changes.

**Workarounds** (ranked by reliability):
1. **Write tool** for full file rewrites (linter reformats style only, not logic)
2. **Batch edits** into single Write instead of multiple Edits
3. **Re-read after Edit** to verify changes survived
4. **Detection**: "file was modified by user or linter" system reminder = linter reverted

See `memory/ide-linter-workarounds.md` for full details.

---

## Technology Stack

- **Frontend**: SvelteKit 2 + Svelte 5 (runes) + bits-ui v2.16.2 + UnoCSS v66.5 (svelte-scoped)
- **Forms**: sveltekit-superforms v2 + Zod validation
- **Local Cache**: IndexedDB + Loki.js
- **Server Cache**: Redis (SSR pages + sessions)
- **Database**: PostgreSQL 18.4 + Drizzle ORM 0.44 + pgvector
- **Vector DB**: Qdrant (GPU-accelerated)
- **AI Models**: 
    - **Embeddings Lane**: Ollama (`embeddinggemma:latest` via `/api/embed`)
    - **Generation Lane**: `Gemma4` / `Qwen` via `llama-server` (TurboQuant + Bitfrost)
    - **Vision**: `gemma4-rotorquant:latest` (unified text+vision, GRPO legal LoRA merged)
- **Client AI**: ONNX Runtime (WebGPU → WASM SIMD → CPU) + gemma 270M quantized
- **Real-Time**: Server-Sent Events (SSE)
- **State Machines**: XState v5 (client orchestration) + RabbitMQ (server async)
- **Message Queue**: RabbitMQ (7 queues, 5 exchanges)
- **MCP**: FastMCP agentic tool calling (9 tools)

---

## Client-Backend Multi-Tier Architecture

### Inference Fallback Chain
```
User Query
  ↓
Client Router (src/lib/ai/client-router.ts)
  ├─ Simple query → LOCAL ONNX (gemma270m via WebGPU/WASM)
  │   ├─ WebGPU (Dawn) → WASM SIMD → CPU fallback
  │   ├─ Model: static/gemma3_270m_onnx/ (418MB, local-only)
  │   ├─ Embeddings: static/embeddinggemma_300m_onnx/ (768-dim)
  │   └─ Auto-escalate on failure → SERVER
  │
  └─ Legal/complex query → DUAL LANE
      ├─ **Embeddings/Indexing**: Ollama `/api/embed` (embeddinggemma:latest)
      │   └─ Storage: Redis (exact) → Qdrant (dense) → Postgres (mirror)
      ├─ **Generation/Chat**: llama-server (Gemma4/Qwen)
      │   └─ Optimization: TurboQuant KV Cache + Bitfrost semantic cache
      └─ Reference: [`docs/KARPATHY_PIPELINE_ARCHITECTURE.md`](./docs/KARPATHY_PIPELINE_ARCHITECTURE.md)
      └─ Reference: [`docs/ACE_STARTUP_CUDA_BRIDGE.md`](./docs/ACE_STARTUP_CUDA_BRIDGE.md)
```

### Cache Hierarchy (Client → Server)
```
L0: LokiJS (in-memory, 5-10min TTL, session-scoped)
  ↓ miss
L1: IndexedDB (persistent, 7-day TTL, survives refresh)
  ↓ miss
L2: Memory Cache (server, 5min TTL, in-process Map)
  ↓ miss
L3: Redis (server, configurable TTL, cross-request)
  ↓ miss
L4: Service Logic (DB query, Qdrant search, Ollama inference)
  ↓
Write back to L0-L3
```

### Retrieval Pipeline (RAG + KAG + DAG)
- **RAG** (Retrieval-Augmented Generation): Qdrant vector search → confidence ranking → LLM generation
- **KAG** (Knowledge-Augmented Generation): Schema validation, W3C spec checks, package.json verification
- **DAG** (Directed Acyclic Graph): Cluster dependency ordering, fix priority scheduling
- **2-stage codebase retrieval**: Fuse.js fuzzy recall → Qdrant dual-vector rerank (0.6 content + 0.4 signature)

### Qdrant Collections (768-dim)
| Collection | Purpose | Status |
|------------|---------|--------|
| `evidence_items` | Evidence chunks + metadata | Active |
| `legal_documents` | Legal document embeddings | Active |
| `legal_cases` | Case description embeddings | Active |
| `codebase_chunks_768` | Dual-vector code search | Active |
| `chat_messages` | Chat context search | Active |
| `embedding_cache` | Embedding lookup cache | Active |

### RabbitMQ Queues
`cache.invalidate`, `document.embed`, `evidence.process`, `vector.index`, `chat.context`, `analytics.track`, `codebase.index`

### FastMCP Agentic Tools (9)
`unified_ast_query`, `cross_language_similarity`, `cuda_fix_priority`, `glyph_metadata`, `neo4j_dependency_graph`, `agentic_recommendation`, `batch_error_analysis`, `redis_cache_stats`, `system_health_check`

### Evidence Pipeline (8 stages)
1. Object storage upload + SHA-256 hash + PostgreSQL record
2. Text extraction: pdf-parse → OCR fallback (Tesseract CLI → tesseract.js)
3. Structure-aware chunking via legal-chunker.ts (ARTICLE/SECTION/§)
4. Embedding: gRPC → embeddinggemma → nomic-embed-text fallback
5. Dual storage: pgvector `evidence_vectors` + Qdrant `evidence_items`
6. Entity extraction (EMAIL, PHONE, DATE, CITATION, STATUTE, MONEY)
7. Forensic pattern detection (SSN, CC, contact density, legal keywords)
8. Summarization via Ollama gemma4-rotorquant:latest (non-fatal)

### Key Client-Side Files
| File | Purpose |
|------|---------|
| `src/lib/ai/client-router.ts` | Routes local vs server inference |
| `src/lib/ai/client-cache.ts` | LokiJS + IndexedDB dual-tier cache |
| `src/lib/ai/client-embed.ts` | 768-dim ONNX embeddings (mean-pool + L2-norm) |
| `src/lib/ai/onnx/session.ts` | WebGPU → WASM → CPU session factory |
| `src/lib/ai/model-ids.ts` | Centralized model constants |
| `src/lib/models/ChatSession.svelte.ts` | Central routing hub (local ↔ server) |
| `src/lib/machines/retrieval-machine.ts` | XState v5 2-stage retrieval orchestration |

### Key Server-Side Files
| File | Purpose |
|------|---------|
| `src/lib/server/redis.ts` | Primary ioredis singleton + factory |
| `src/lib/server/cache.ts` | Dual-tier memory + Redis cache |
| `src/lib/server/vector/qdrant-manager.ts` | Qdrant client + hybrid search |
| `src/lib/server/queue/rabbitmq-manager-fixed.ts` | RabbitMQ 7-queue manager |
| `src/lib/server/grpc/embedding-client.ts` | gRPC embedding with HTTP/Ollama fallback |
| `src/lib/server/rag-pipeline.ts` | End-to-end RAG for legal Q&A |
| `src/lib/server/indexer/legal-chunker.ts` | Structure-aware legal document chunker |
| `src/lib/server/analysis/entity-extraction.ts` | LLM + regex entity extraction |
| `src/lib/server/analysis/forensics.ts` | PII/legal pattern detection |
| `src/mcp/server.ts` | MCP server (stdio transport, tool handlers) |

---

## Redis L1 + Bifrost L2 Cache System

**Status**: ✅ **PRODUCTION READY** (April 12, 2026)

### Architecture

**3-Tier Cache** (Industry Best Practice):

1. **L1: Redis Exact-Match** → 5ms (instant recall for exact duplicates)
   - Module: `src/lib/server/cache/redis-exact-match.ts`
   - Key: SHA-256 hash of `model + messages + temperature + maxTokens`
   - TTL: 1 hour
   - Hit Rate: 20-30% (exact queries)

2. **L2: Bifrost Semantic Cache** → 2-5s (vector similarity for rephrased queries)
   - Service: Port 3040 (`go-microservice/cmd/bifrost/`)
   - Backend: Qdrant vector search
   - Threshold: 0.8 (configurable via `x-bf-cache-threshold` header)
   - Hit Rate: 70-90% (semantic variants)

3. **L3: Direct Ollama GPU** → 25s (cold inference)
   - Fallback when L1 + L2 miss
   - Response stored in L1 + L2 for future hits

**Combined Hit Rate**: 90-95% → **90% cost reduction**

### Performance (Measured)

```
CPU Baseline:      32,712ms
GPU Baseline:      25,395ms
L2 Semantic Hit:    2-5,000ms  (GPU: 5-10×, CPU: 6-15×)
L1 Exact Hit:            5ms  (GPU: 5,079×, CPU: 6,542×)
```

**Throughput**: 12,000 queries/minute (vs 1-2 QPM without cache)

### Usage

**Automatic** - Cache is checked transparently in `bifrostChat()`:

```typescript
import { bifrostChat } from '$lib/server/ollama.js';

// L1 → L2 → L3 fallback happens automatically
const response = await bifrostChat(
  [{ role: 'user', content: 'What is hearsay evidence?' }],
  'gemma4-rotorquant:latest',
  { temperature: 0.3, maxTokens: 200 }
);
```

**Manual Control** - Per-request cache headers:

```typescript
// Bypass cache (force L3)
fetch('/api/ai/chat', {
  headers: { 'x-bf-cache-type': 'none' }
});

// Adjust similarity threshold
fetch('/api/ai/chat', {
  headers: { 'x-bf-cache-threshold': '0.9' }  // Higher = stricter matching
});

// Custom TTL
fetch('/api/ai/chat', {
  headers: { 'x-bf-cache-ttl': '7200' }  // 2 hours
});
```

### Monitoring

**Cache Statistics**:
```bash
curl http://localhost:5173/api/cache/exact-match/stats
```

**Langfuse Traces**: http://localhost:3030/traces
- View L1/L2/L3 latency breakdowns
- Track cache hit rates
- Monitor cost savings

### Backend Infrastructure Audit

**Before deployment, verify all services are healthy:**

```bash
bash scripts/audit/backend-infrastructure-audit.sh
```

This runs **15 infrastructure gates** checking:
- Redis connection + memory
- Bifrost semantic cache
- Qdrant vector store
- Ollama + GPU availability
- RabbitMQ message flow
- Langfuse observability

**See**: `BACKEND_INFRASTRUCTURE_AUDIT.md` for full gate definitions.

**Complement to**: 20-Gate Code Audit (below) — run both before deployment.

### Cache Tuning

**Similarity Threshold** (L2 Bifrost):
- **0.8** - Factual Q&A (default) ✅
- **0.9+** - Conversational queries (avoid false positives)
- **0.7** - Broad matching (use with caution)

**TTL Strategy**:
- **L1 Redis**: 1 hour (configurable per use case)
- **L2 Bifrost**: Configurable via headers
- **Invalidation**: Manual via `/api/cache/invalidate`

**Memory Limits** (Redis):
```bash
# Set max memory (recommended: 2GB for high-traffic)
docker exec deeds-redis-prod redis-cli config set maxmemory 2gb

# Set eviction policy (remove least-recently-used keys)
docker exec deeds-redis-prod redis-cli config set maxmemory-policy allkeys-lru
```

### Files Reference

| File | Purpose | Lines |
|------|---------|-------|
| `redis-exact-match.ts` | L1 cache module | 178 |
| `ollama.ts` (bifrostChat) | L1 integration + L2/L3 fallback | +15 |
| `/api/cache/exact-match/stats` | Monitoring endpoint | 48 |
| `authority-chain.ts` | Langfuse embedding/search traces | +8 |
| `rabbitmq-manager-fixed.ts` | Queue operation traces | +35 |
| `BACKEND_INFRASTRUCTURE_AUDIT.md` | 15-gate service health checks | 500+ |

---

## Degraded Response Contract (API Routes)

**All GET API routes MUST return the same JSON shape on error as on success.** Clients destructure responses identically — a shape mismatch causes `undefined` reads and console errors.

```typescript
// SUCCESS path
return json({ sessions: [...data], total: 5 });

// DEGRADED path (catch block) — SAME top-level keys, empty/zero defaults
return json({ sessions: [], total: 0 });

// WRONG — missing sessions/total keys, client breaks
return json({ error: 'Failed' }, { status: 500 });
```

**Rules:**
- Catch blocks on GET handlers return **200** with empty-but-valid data (not 500 with error-only JSON)
- Every top-level key from the success response must appear in the degraded response
- Use empty arrays `[]`, zero `0`, `null`, or empty string `''` as defaults
- POST/DELETE/PATCH action routes can return `{ error: '...' }` since clients check `response.ok`
- Client-side fetches for GETs should always be able to destructure without `?.` on top-level keys

**UUID validation on client fetch calls:**
- Any component that fetches `/api/cases/${caseId}/...` must validate `caseId` is a UUID before fetching
- Use `const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` guard
- Return early (skip fetch) if ID is empty string or non-UUID — prevents noisy 400s in console

---

## Svelte 5 Runes (REQUIRED — No Svelte 4 Patterns)

### Svelte 5 Runes vs. XState v5 Decision Matrix

| Use Case | State Store choice | Implementation Pattern |
|---|---|---|
| UI Toggles & Modals | Runes / Bits UI | Use `$bindable()` properties directly in Bits components |
| Linear Multi-step Wizards | Runes | Use class-backed `.svelte.ts` class with `$state.raw({ step: 1 })` |
| Async Form Validation | Runes / Superforms | Use `superValidate` with server-side Zod + client state |
| Parallel Fetch & Watchdog timers | XState v5 | Use XState machine with `Promise.race` + `watchdog` timer |
| Multi-Actor Retries & Back-offs | XState v5 | Use XState machine (`retrieval-machine.ts`, `chat-machine.ts`) |

```typescript
// State
let count = $state(0);
let user = $state({ name: '', email: '' });

// Derived (simple expression)
let doubled = $derived(count * 2);

// Derived (complex — use $derived.by for blocks)
let filtered = $derived.by(() => { /* complex logic */ return result; });

// Effects
$effect(() => { console.log(count); });

// Props
let { value, onChange }: Props = $props();
```

**Svelte 4 → 5 mapping:**
| Svelte 4 | Svelte 5 |
|----------|----------|
| `export let x` | `let { x } = $props()` |
| `$: doubled = x * 2` | `let doubled = $derived(x * 2)` |
| `$: { sideEffect() }` | `$effect(() => { sideEffect() })` |
| `on:click={fn}` | `onclick={fn}` |
| `<slot>` | `{#snippet children()}{/snippet}` + `{@render children()}` |
| `writable()` stores | `$state()` in `.svelte.ts` files |

### Store Migration Patterns (Session 63)

**In `.svelte` files** — replace `writable()` inline:
```typescript
// Before (Svelte 4)
import { writable, get } from 'svelte/store';
const items = writable<Item[]>([]);
$items.push(newItem);       // auto-subscribed via $ prefix
items.set([]);               // .set() method
items.update(i => [...i]);   // .update() method

// After (Svelte 5)
let items = $state<Item[]>([]);
items.push(newItem);         // direct mutation (proxied)
items = [];                  // direct assignment
items = [...items, newItem]; // spread for new reference
```

**In `.svelte.ts` files** — class-backed `$state` (preferred for shared stores):
```typescript
// src/lib/stores/user.svelte.ts
class UserStore {
  user = $state<User | null>(null);
  isAuthenticated = $derived(this.user !== null);

  login(u: User) { this.user = u; }
  logout() { this.user = null; }
}
export const userStore = new UserStore();
```

**In plain `.ts` files** — runes do NOT work, use plain TS:
```typescript
// Server-side or plain utility .ts files
export class SimpleStore<T> {
  private value: T;
  private subscribers = new Set<(v: T) => void>();

  constructor(initial: T) { this.value = initial; }
  get() { return this.value; }
  set(v: T) { this.value = v; this.subscribers.forEach(fn => fn(v)); }
  subscribe(fn: (v: T) => void) {
    fn(this.value);
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }
}
```

**SSR Safety Rules:**
- Global `$state` in `.svelte.ts` persists across SSR requests — **leaks user data between requests**
- Server-side per-request state → use `event.locals` in hooks, NOT global `.svelte.ts` stores
- `.svelte.ts` stores are fine for **client-only** state (auth, UI preferences, chat sessions)
- Don't export raw `$state` variables — wrap in classes or closures

---

## Bits UI v2.16.2 Import Patterns

```typescript
// Namespace imports from main entry
import { Accordion, Dialog, Select, Checkbox, ScrollArea } from "bits-ui";

// Dialog (full pattern with Portal + Overlay)
<Dialog.Root bind:open={isOpen}>
  <Dialog.Trigger>Open</Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      <Dialog.Title>Title</Dialog.Title>
      <Dialog.Description>Description</Dialog.Description>
      <Dialog.Close>Close</Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

// Dialog with transitions (forceMount + child snippet)
<Dialog.Overlay forceMount>
  {#snippet child({ props, open })}
    {#if open}
      <div {...props} transition:fade>overlay</div>
    {/if}
  {/snippet}
</Dialog.Overlay>

// ScrollArea
<ScrollArea.Root type="hover">
  <ScrollArea.Viewport><!-- content --></ScrollArea.Viewport>
  <ScrollArea.Scrollbar orientation="vertical">
    <ScrollArea.Thumb />
  </ScrollArea.Scrollbar>
  <ScrollArea.Corner />
</ScrollArea.Root>
```

**Key v1 → v2 changes:**
- Transition props removed — use `forceMount` + `child` snippet with Svelte 5 transitions
- `let:` directives → `{#snippet child({ props, open })}` for data exposure
- `multiple={true}` → `type="multiple"` (Accordion/Select)
- `el` → `ref` for element binding
- `asChild` → `child` snippet (spread `{...props}` on your element)
- Local wrapper components are obsolete — import bits-ui directly
- Use bits-ui component API, NOT melt-ui builders directly
- `onOpenChange` callback available on Root components

**Ambient type shadowing warning:** `src/types/bits-ui.d.ts` shadows bits-ui's own shipped types. bits-ui v2.16.2 ships complete `dist/index.d.ts` with proper compound namespaces. The ambient file was needed historically but may cause type mismatches with newer API features.

**Button**: Default import: `import Button from '$lib/components/ui/Button.svelte'`

---

## SSR Classification (A/B/C Buckets)

When wiring components to routes, classify each into:

**A) SSR-safe** (keep SSR enabled):
- Reads data via `load()` / server endpoints
- No browser-only globals
- Uses lucide/bits-ui primitives only
- Icons use UnoCSS `i-lucide-*` classes via `<Icon name="..." />` wrapper (SSR-safe, pure CSS)

**B) Client-only** (set `export const ssr = false`):
- Canvas/WebGL/WebGPU rendering
- Direct `window`/`document` usage in module scope
- localStorage/IndexedDB in module scope
- Heavy client-only demos
- Put behind `/dev-tools/*` or `/demos/*` routes

**C) Mixed** (prefer SSR, guard browser code):
- Mostly SSR-safe with small client-only areas
- Move browser-only code behind `onMount()` and `typeof window !== 'undefined'` guards
- Keep SSR enabled unless truly impossible

---

## UnoCSS Configuration

Config at `sveltekit-frontend/unocss.config.ts`. Svelte-scoped mode via `@unocss/svelte-scoped/vite`.

**Theme colors**: sand, sandDark, panel, panelSoft, accent, accentSoft, danger, warning, info
**Shortcuts**: `app-bg`, `panel`, `btn-base`, `btn-primary`, `tag`

**Consistency rule**: Use UnoCSS utilities everywhere — do NOT mix with raw Tailwind classes. Keep one utility system to avoid class collisions and mental overhead.

```css
/* CSS class syntax — NO spaces before pseudo-class colons */
hover:bg-accent focus:border-blue-500 disabled:opacity-50
```

---

## Superforms v2 (Zod as Source of Truth)

**Pipeline**: Zod schema → superforms adapter → Drizzle insert types from schema
- Zod schema is the runtime validator (single source of truth)
- superforms uses the Zod adapter (`import { zod } from 'sveltekit-superforms/adapters'`)
- Drizzle insert/select types come from Drizzle models (not custom `DrizzleTypes`)
- In SvelteKit routes, use `import type { RequestHandler } from './$types'` — no parallel type layers

```typescript
// Server: import from sveltekit-superforms (NOT @sveltejs/kit)
import { superValidate, fail, message } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';

// Client
const { form, errors, enhance, delayed } = superForm(data.form, {
  validators: zodClient(schema),
  dataType: 'form', // Required for file uploads
});

// File upload: use fileProxy
const file = fileProxy(form, 'file');
```

See `memory/superforms-reference.md` for full patterns.

---

## Database Migration Safety

**CRITICAL: Always use `drizzle-kit migrate` (not `push`) on databases with real data.**

**STOP if you see:**
```
Warning: You're about to delete kg_nodes table with 2764 items
```
Answer NO or Ctrl+C immediately. Drizzle marks tables not in schema for deletion.

**Safe approaches:**
1. Add missing tables to schema (prevents deletion)
2. Use `tablesFilter` in drizzle.config.ts: `['!phase89_*', '!kg_*']`
3. Use `introspect` to auto-generate schema from DB
4. Raw SQL for simple changes: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`

**Table rename pro-tip:** Drizzle generates DROP+CREATE for renames. Edit the SQL to `ALTER TABLE "old" RENAME TO "new"` before running migrate.

**Pre-flight checklist:** Review SQL for DROP statements, verify schema includes all existing tables, test on dev first.

---

## UI bugs are HOT — never deferred (May 11, 2026)

The "do not touch" lists below (Drizzle Safety Rule § 1-4, identity strategy, hypergraph write fire, CUDA Graphs, cuVS, new LangGraph workers) cover **infrastructure/data-layer changes** that need operator review. They do **NOT** cover broken UI affordances. **UI bugs jump the queue.**

**What counts as a UI bug:**
- Buttons that visually exist but click does nothing (no console.log, no network request, no state change)
- Forms that submit but no `fetch()` fires (`onsubmit` handler missing or returns false silently)
- File inputs / drop zones that don't accept files (drag/drop handler missing or `e.preventDefault()` not called)
- Modals that won't open OR won't close (state binding broken)
- Pages that render blank (uncaught exception in load() or top-level component)
- Service Worker / Web Worker registration failures (cascade into offline + analytics breakage)
- `console.error` on page load (always a real bug — not "noise")
- Network requests that never arrive at the server (intercepted by SW, blocked by COEP, CORS, or rate limiter)

**The diagnostic discipline** (use `tests/e2e/upload-button-diagnostic.spec.ts` as the template):

A Playwright test that captures EVERY browser signal — `console`, `pageerror`, `request`, `response`, `requestfailed` — for a single user action. Output is verbose by design (forensic, not CI gate). Run it BEFORE guessing what's broken.

```ts
page.on('console', (msg) => log.consoleMessages.push({type, text, location}));
page.on('pageerror', (err) => log.pageErrors.push({message, stack}));
page.on('request', (req) => log.requests.push({method, url, resourceType}));
page.on('response', async (res) => { if (status >= 400) capture body });
page.on('requestfailed', (req) => log.requestFailures.push({url, failure}));
```

**Real example (this commit, 2026-05-11):** User reports "nothing uploads". Server probe shows `POST /api/evidence/upload` returns HTTP 201 with full evidence record. Diagnostic captures `SW: Registration failed: TypeError ... script evaluation failed @ src/lib/client/sw-register.ts:24`. Root cause: 1-line syntax bug in `static/sw.js:480` (corrupted `key: value` colon-mix from a prior auto-fixer pass — same pattern as the `cache.put()` bug fixed in commit `e54bc0850e`). One-line edit + diagnostic re-run shows `Console errors: 0`. Done.

**Workflow when a UI button "doesn't work":**
1. Write a forensic Playwright test that captures all 5 signals (template above)
2. Run it once, eyeball the output
3. Fix the FIRST root-cause error (don't chase warnings)
4. Re-run, confirm signal goes 1 → 0
5. Commit with the diagnostic script committed too — the next person needs it

**Do NOT:**
- Bury UI bugs under the "operator-only" hard rules (those are for DB/infra/identity, not UX)
- Assume "the SW bug is unrelated" — SW fail cascades into upload failures, telemetry loss, analytics gaps
- Defer to "P1 mechanical batch" — broken buttons block actual users; mechanical type fixes don't

---

## Object Storage: SeaweedFS is canonical (MinIO deprecated, May 11, 2026)

**MinIO has license issues (AGPL change → commercial/restricted use).** The repo has cut over to **SeaweedFS S3 gateway** as the canonical object store. SeaweedFS is Apache 2.0, S3-compatible, and the existing MinIO SDK speaks to it unchanged.

**Architecture:**
- `legal-ai-seaweed-master` (port 9333) — metadata
- `legal-ai-seaweed-volume` (host port 8380 → container 8080) — file blobs
- `legal-ai-seaweed-filer`  (host port 8382 → container 8888) — POSIX-style file API
- `legal-ai-seaweed-s3`     (port 8333) — **AWS S3-compatible gateway, this is what the SDK talks to**
- Credentials: `minio` / `minio123` (mirrored in `etc/seaweedfs/s3.json` so the existing MinIO SDK keys work without rotation)
- Bucket: `legal-evidence` (same name as MinIO had — drop-in)

**How the cutover works** (zero code changes in `minio-client.ts` or call sites):

`src/lib/server/env.server.ts:300-307` has a SEAWEED override block:
```ts
if (privateEnv.SEAWEED_S3_PORT) {
  ENV.MINIO_PORT = privateEnv.SEAWEED_S3_PORT;
  if (privateEnv.SEAWEED_ENDPOINT) ENV.MINIO_ENDPOINT = privateEnv.SEAWEED_ENDPOINT;
  if (privateEnv.SEAWEED_ACCESS_KEY) ENV.MINIO_ACCESS_KEY = privateEnv.SEAWEED_ACCESS_KEY;
  if (privateEnv.SEAWEED_SECRET_KEY) ENV.MINIO_SECRET_KEY = privateEnv.SEAWEED_SECRET_KEY;
}
```

The MinIO SDK reads `ENV.MINIO_*` and connects to whatever those resolve to. Setting `SEAWEED_S3_PORT=8333` transparently retargets every `uploadFile` / `deleteFile` / `getMinioClient` / presign call at SeaweedFS.

**The four required env vars** (set in `package.json` `dev` script via cross-env, AND in `.env` for non-`npm run dev` callers like CI / scripts):
```
SEAWEED_S3_PORT=8333
SEAWEED_ENDPOINT=localhost
SEAWEED_ACCESS_KEY=minio
SEAWEED_SECRET_KEY=minio123
```

**Verification (2026-05-11):**
- `POST /api/evidence/upload` 1-byte file → HTTP 201
- `mc ls local/legal-evidence/.../<new-key>` → empty (NOT in MinIO)
- `HEAD /buckets/legal-evidence/.../<new-key>` on SeaweedFS filer → HTTP 200 ✅
- All `evidence.fileUrl` records continue to use the `minio://...` URL prefix (semantically just an S3 prefix; no consumer parses it strictly as MinIO)

**`.env` is gitignored** — production deployments must set the 4 SEAWEED_* env vars in their orchestrator (k8s, fly.io, docker-compose `environment:`, etc.) for the override to fire.

**Migration of existing MinIO objects to SeaweedFS** (separate ops task, not auto):
```bash
# Mirror legal-evidence bucket from MinIO to SeaweedFS
docker exec legal-ai-minio mc mirror --overwrite local/legal-evidence/ \
  http://minio:minio123@seaweed-s3:8333/legal-evidence/
```

**Deprecation timeline:**
1. ✅ 2026-05-11 — cutover env vars set; new uploads go to SeaweedFS
2. ✅ 2026-05-11 — `/api/health` probes SeaweedFS master (:9333/cluster/status) instead of MinIO `/minio/health/live`; `SEAWEED_MASTER_PORT` + `SEAWEED_FILER_PORT` exported from `env.server.ts`
3. ⏳ Pending operator decision — mirror existing MinIO objects to SeaweedFS
4. ⏳ Pending operator decision — `docker stop legal-ai-minio` once mirror complete
5. ⏳ Pending operator decision — remove `legal-ai-minio` service from `docker-compose.yml`
6. ⏳ Pending operator decision — rename `MINIO_*` env vars to `S3_*` (cosmetic; the SDK doesn't care)

**Do NOT:**
- Use `mc admin policy` / MinIO-specific admin commands going forward — they don't translate to SeaweedFS
- Rely on MinIO Console UI (port 9001) for ops — use SeaweedFS Filer UI at port 8382 instead
- Add SeaweedFS-specific multipart features without checking the AWS SDK compatibility matrix (SeaweedFS supports basic multipart but not all advanced S3 features — check before adopting)

---

## Drizzle Safety Rule (May 11, 2026 — operator-only gate)

**Do NOT run `drizzle-kit push` or apply generated DROP migrations until ALL four hold:**

1. **DB-only live tables are protected** by `tablesFilter` in [drizzle.config.ts](sveltekit-frontend/drizzle.config.ts) OR explicitly declared in the canonical Drizzle schema. As of 2026-05-11 the filter protects 50 DB-only tables (`!ace_chunks`, `!embedded_summaries`, `!trace_runs`, `!warden_*`, etc.) plus the legacy `!phase89_*` / `!kg_*` patterns.
2. **The identity strategy for `users.id` / `user_id` is decided** by the operator. See "Schema Mismatch" section below — until the operator commits to Path A (all integer), B (all uuid), C (two-tier `users.id` + `users.uuid`), or D (defer/coerce forever), broad migration work blindly hardcodes the wrong choice.
3. **Generated SQL has been manually reviewed** — every CREATE/ALTER/DROP must be eyeballed before journaling. `drizzle-kit generate --name=foo` writes to `drizzle/0NNN_foo.sql` AND `drizzle/meta/_journal.json`. To inspect without journaling: generate, copy the SQL, then `git checkout drizzle/meta/_journal.json && rm drizzle/0NNN_foo.sql`.
4. **Manual SQL sidecar migrations are accounted for.** `drizzle/manual/*.sql` files are NOT in the journal — they were applied by hand. Any auto-generated migration that re-CREATEs those tables will collide. Cross-check generated CREATEs against `ls drizzle/manual/` before applying.

**`tablesFilter` semantics** (subtle): the `!table_name` patterns suppress `drizzle-kit generate` from emitting **DROP TABLE** for DB-only tables. They do NOT suppress **CREATE TABLE** for tables declared in `schema-postgres.ts` but missing from DB. To skip a CREATE, the table must be removed from the schema file OR the generated CREATE must be manually deleted.

**Current schema state (verified 2026-05-11):**
- Drizzle declares **148 tables** in canonical `schema-postgres.ts` + ~30 in sidecar schema files
- Live DB has **247 tables** (148 declared + 50 DB-only protected + ~50 legacy/sidecar)
- Inspection-only generate run produces **34 CREATE statements** (5 are audit-approved "migrate now" — `ace_retrieval_runs`, `ace_retrieval_hits`, `memory_gain_audits`, `metadata_envelopes`, `code_llm_index`; 7 are duplicates of filter-protected tables; 22 are deferred-feature scaffolding)
- 0 DROP statements (filter working)

**Audit references:**
- [docs/audits/db-schema-drift-2026-05-10.md](sveltekit-frontend/docs/audits/db-schema-drift-2026-05-10.md) — Drizzle vs Postgres drift inventory
- [docs/audits/feature-parity-2026-05-10.md](sveltekit-frontend/docs/audits/feature-parity-2026-05-10.md) — feature-level reality check
- [docs/audits/summary-2026-05-10.md](sveltekit-frontend/docs/audits/summary-2026-05-10.md) — action list
- [docs/audit/2026-05-11_feature-spec-implementation-audit.md](sveltekit-frontend/docs/audit/2026-05-11_feature-spec-implementation-audit.md) — directory-density feature audit

**AGENTS.md authority** (clarified): treat directory-level `AGENTS.md` files as **searchable index cards**, not source-of-truth specs. Canonical authority for features lives in `docs/master_agents.md` + this CLAUDE.md + `docs/audit/*.md` + actual code/tests/DB introspection. The 383 dir-level AGENTS.md files are auto-generated retrieval cards for ACE/KAG context hints.

---

## Schema Mismatch: `user_id` columns — RESOLVED (May 30, 2026)

**Previously fragmented (May 10, 2026): 16 integer / 24 uuid / 3 text.**
**Now (verified live 2026-05-30): 45 integer / 0 uuid / 3 text.** All 24 legacy uuid `user_id` columns have been migrated to integer, aligning with Lucia's integer `users.id`.

```sql
-- Verify (should match 45 integer / 0 uuid / 3 text):
SELECT data_type, count(*) AS tables
FROM information_schema.columns
WHERE column_name IN ('user_id','uploaded_by') AND table_schema='public'
GROUP BY data_type ORDER BY data_type;
```

**Confirmed identical on pg17 production and pg18 restored side container** (`legal-ai-postgres18-test:5433`).

**Lucia contract (unchanged):** `users.id` is `serial` integer. `locals.user.id` is `string` (Lucia v3 always strings IDs). `sessions.user_id` is integer in DB ✅.

**Simplified coding pattern (post-migration):**
- Going INTO Lucia API (`createSession`, `getSession`): `String(user.id)`
- Going INTO Drizzle `eq()` against an `integer user_id` column (45 tables): `Number(locals.user.id)`
- Going INTO Drizzle `eq()` against a `text user_id` column (`admin_ai_chat_sessions`, `agent_actions`, `saved_citations`): pass `locals.user.id` as-is
- **Per-table verification still recommended** for any newly-created table: `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\d <table>"`

**Drizzle schema cleanup remaining:** Several files in `schema-postgres.ts` still declare `userId: uuid('user_id')` reflecting the OLD intent. The DB has moved on — these declarations are inert but should be migrated to `integer('user_id')` for documentation accuracy. Use `drizzle-kit introspect` to regenerate the canonical schema from the live DB.

**Migrations applied this session (2026-05-10):**
- `password_reset_tokens.user_id`: uuid → integer (0 rows; safe; matches `users.id` PK)
- `vlm_image_tags`: created (uuid PK + name unique) — was missing entirely
- `0013_codeintel_indexes.sql`, `0016_codeintel_schema.sql`, `0016_courtroom_3d_animation.sql`, `0018_output_meta_manifold4.sql`: applied (mostly idempotent — already in place)

**Until a structural fix lands:** every new auth-touching route MUST verify column types via `\d` before writing the query. JSONB `Record<string, unknown>[]` columns need `as unknown as T[]` double-cast on read AND write. New JSONB columns should use `.$type<T>()` in the schema so consumers skip the double-cast.

---

## Migration history (May 10, 2026 — applied)

5 SQL files lived on disk but were NOT in `drizzle/meta/_journal.json`. `drizzle-kit migrate` skipped them. Applied directly via `docker exec legal-ai-postgres psql`:

```bash
# All IF NOT EXISTS — applied 2026-05-10, mostly idempotent (already in place)
docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/0013_codeintel_indexes.sql
docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/0016_codeintel_schema.sql
docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/0016_courtroom_3d_animation.sql
docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/0018_output_meta_manifold4.sql

# vlm_image_tags: created from scratch (schema added the table 2026-05-10)
docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db <<SQL
CREATE TABLE IF NOT EXISTS vlm_image_tags (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  name varchar(200) UNIQUE NOT NULL,
  description text,
  source varchar(50) NOT NULL DEFAULT 'manual',
  hit_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
SQL

# password_reset_tokens.user_id: uuid → integer (0 rows in table — matches users.id)
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "ALTER TABLE password_reset_tokens ALTER COLUMN user_id TYPE integer USING NULL;"
```

**Version bumps verified clean (this session):** `drizzle-orm@0.45.2`, `drizzle-kit@0.31.10`, `@sveltejs/kit@2.59.1`, `@sveltejs/adapter-node@5.5.4`. tsgo baseline unchanged.

**SeaweedFS already wired** at `env.server.ts:300-307` — set `SEAWEED_S3_PORT=8333` in `.env` to retarget the MinIO SDK at the SeaweedFS S3 gateway. Zero code changes needed in `minio-client.ts` or call sites. SeaweedFS containers (`legal-ai-seaweed-{master,volume,filer,s3}`) confirmed up.

### Verification matrix (2026-05-10 — applied + tested)

| Lane | Result |
|---|---|
| svelte-check | **32 errors / 13 warnings in 29 files** — down from 43 errors at session start (vlmImageTags fix + reverted password_reset_tokens schema = -11 errors) |
| smoke:graphify (5-pillar + D33) | **8 present / 4 absent** — Neo4j + Redis hypergraph checkpoint absent (acceptable; Neo4j is a separate `--profile full` lane) |
| Playwright `auth-login-db` | **11/11 pass** — register, login (4 seeded users), wrong-password 401, duplicate email 409, invalid email 400, short password 400, browser-nav to /cases, logout invalidates session |
| Playwright `route-verification` | **22/22 pass** — homepage, command-center, terminal, error-analysis, topology, sidebar nav, link clicks, 404 handling, no JS errors on homepage |
| Playwright `homepage-screenshot` | **4/4 pass** — homepage load, sidebar render, action buttons, mobile viewport |
| Playwright `evidence-viewer-route` (NEW) | **3/3 pass** — not-found state for unknown UUID, invalid UUID format rejection, no JS errors |
| Playwright `service-health-probe` | 6/7 pass — 1 pre-existing failure on `/api/health` missing expected service property |
| Playwright `evidence-diagnostics-upload` | 1/2 pass — 1 timeout waiting for upload response (pre-existing, not session-introduced) |

**Wired this session:** `/evidence/[id]/view` route ([+page.server.ts](sveltekit-frontend/src/routes/(app)/evidence/[id]/view/+page.server.ts) + [+page.svelte](sveltekit-frontend/src/routes/(app)/evidence/[id]/view/+page.svelte)) using `EvidenceMediaViewer.svelte` for unified inline display of image/video/audio/PDF/text with lightbox + download fallback. Auth-guarded with `redirect(303, '/login?redirect=...')` and graceful `loadError` degradation.

**`PLAYWRIGHT_SKIP_GLOBAL_SETUP=true` is required for any Playwright run** until `cases.user_id uuid → integer` migration lands. The case-seed in `tests/global-setup.ts:60` POSTs to `/api/cases` which fails with `invalid input syntax for type uuid: "2"` (integer `users.id` won't fit into uuid `cases.user_id`).

**Known degradations (acceptable until structural fix):**
- `/cases` page renders empty-state when SSR query `WHERE cases.user_id = $1` runs with integer user.id (see `safe()` helper + `loadError` field — graceful, no 500)
- `evidence.user_id` queries (chain-of-custody, /api/evidence/[id]) return 0 rows for current Lucia users; consumer routes should switch to `evidence.uploaded_by` (integer) for ownership filters
- `db:seed` succeeds for users (4 created) but fails at cases insert with the same uuid mismatch — non-blocking for auth tests

---

## tsconfig Services Status (Updated April 7, 2026)

`src/lib/services/` is **un-excluded and fully type-checked** — 35 files across 3 subdirectories, **0 errors**.

Previously 312+ corrupted files were blanket-excluded. After archival and cleanup, only 35 clean files remain:
- **Root**: 7 files (api-client, couchdb-client, qdrant-client, tts, voice-commands, rag/source validation)
- **error-analysis/**: 17 files (DecisionEngine, FixSynthesizer, GRPOPolicy, KAGTraverser, etc.)
- **knowledge-search/**: 11 files (ACPToolRegistry, KnowledgeSearcher, KnowledgeIndexer, stores, etc.)

All 35 are actively imported by routes, components, or server modules (25 external consumers, 12 dynamic imports).

---

## Phase 99 Corruption Reference

Commit `0a2bd98929` corrupted 83 `.svelte` files via auto-migration tool. Clean versions at `fa8498dc4a`. Only ~5 imported by active routes. DO NOT run the Phase 99 tool again.

See `memory/corruption-patterns.md` for detection patterns and fix strategies.

---

## Unified Audit Gate System (47 Gates)

**Use cases:** (a) pre-archive safety, (b) post-wire verification, (c) infrastructure health audit.
**Automated:** `bash sveltekit-frontend/scripts/audit/orphan-detector.sh [dir]` covers Tier A (~10s).
**MSYS/Git Bash:** Use bash arrays for globs: `RG_GLOB=(--glob '*.ts')` then `"${RG_GLOB[@]}"`.

```bash
MODULE="ComponentName"   # or filename stem, API path, table name

# ══════════════════════════════════════════════════════════════
# TIER A: CODE CONNECTIVITY (run ALL for archive decisions)
# ══════════════════════════════════════════════════════════════

# G1: Static ESM imports
rg "from.*$MODULE" src/ --type ts --type svelte

# G2: Dynamic ESM imports (mcp/server.ts: 12, hooks.server.ts: 3, API routes: ~80+)
rg "import\(.*$MODULE" src/ --type ts --type svelte

# G3: CJS require (rare: proto, OCR, astVectorizer)
rg "require\(.*$MODULE" src/ --type ts

# G4: @vite-ignore variable imports (4 files: drizzle.ts, granite-docling.ts, fastjson.ts, CanvasBoard.svelte)
rg "@vite-ignore" src/ --type ts --type svelte -l

# G5: Barrel re-exports (37 index.ts files) — barrel consumers import MODULE transitively
rg "export.*from.*$MODULE" src/lib/ --type ts
rg "$MODULE" src/lib/components/*/index.ts src/lib/services/*/index.ts

# G6: SvelteKit load→data binding — +page.server.ts props consumed via $props().data (implicit)
# If MODULE is a route file (+page.svelte, +server.ts, +layout.svelte) → NOT an orphan

# G7: fetch('/api/...') wiring (193 files, 4865 refs) — server routes wired via client fetch()
rg "fetch.*$MODULE" src/ --type ts --type svelte

# G8: Event coupling (yorha: namespace, CustomEvent dispatch/listen)
rg "CustomEvent.*$MODULE\|addEventListener.*$MODULE\|dispatchEvent.*$MODULE" src/
rg "yorha:" src/ --type svelte -l   # 9 files use yorha: events

# G9: .svelte.ts store consumers (35 store files, 10+ consumers each)
rg "from.*$MODULE" src/ --glob "*.svelte" --glob "*.svelte.ts"

# ══════════════════════════════════════════════════════════════
# TIER B: DATA LAYER (run for DB/schema/vector changes)
# ══════════════════════════════════════════════════════════════

# G10: Drizzle schema refs — tables/enums from schema-postgres.ts (70+ tables, 14 enums)
rg "from.*schema-postgres" src/ --type ts -l
rg "$MODULE" src/lib/server/db/schema-postgres.ts

# G11: DB client import — MUST be db/client (node-postgres Pool), NOT db/index (postgres.js)
rg "from.*db/index" src/ --type ts     # WRONG — should be 0 hits
rg "from.*db/client" src/ --type ts    # CORRECT

# G12: Vector/Qdrant collection coupling — pgvector tables + Qdrant collection refs
rg "$MODULE" src/lib/server/vector/ --type ts
rg "collection.*$MODULE\|$MODULE.*collection" src/ --type ts

# ══════════════════════════════════════════════════════════════
# TIER C: INFRASTRUCTURE (run for service/infra changes)
# ══════════════════════════════════════════════════════════════

# G13: Docker service ports (5432 PG, 6379 Redis, 6333 Qdrant, 8333 SeaweedFS-S3, 9333 SeaweedFS-master, 5672 RabbitMQ)
rg "5432\|6379\|6333\|8333\|9333\|5672\|50051\|4222\|8095" src/lib/server/ --type ts -l

# G14: Native addon — .node binary via createRequire (libtorch-bridge, astVectorizer, simdjson)
rg "\.node['\")]\|createRequire" src/ --type ts -l   # 3 known consumers

# G15: Proto/gRPC contract — proto file consumers and gRPC client refs
rg "proto\|grpc\|gRPC" src/lib/server/ --type ts -l
# If changing a .proto: rg "ProtoEmbedding\|ProtoHealth" src/ --type ts

# G16: Worker thread coupling — compute-pool parent ↔ worker child refs
rg "worker_threads\|Worker\(\|compute-pool\|compute-worker" src/ --type ts --type js -l

# G17: Env variable / hardcoded URL — should use ENV.* getters, not literals
rg "localhost\|127\.0\.0\.1" src/lib/server/ --type ts   # should be 0 outside env.server.ts

# ══════════════════════════════════════════════════════════════
# TIER D: SECURITY + RUNTIME (run for API routes, new features)
# ══════════════════════════════════════════════════════════════

# G18: Auth guard — API route must check locals.user (358/386 routes covered)
rg "locals\.user\|requireAuth\|getSession" src/routes/api/$MODULE/ --type ts

# G19: Zod validation — API route should validate input (282/386 routes covered)
rg "import.*zod\|from.*zod\|z\.\|zodSchema" src/routes/api/$MODULE/ --type ts

# G20: SSR safety — browser-only APIs need onMount/typeof window guard
rg "window\.\|document\.\|localStorage\|IndexedDB" src/lib/$MODULE --type svelte
# If hits: verify guarded by onMount() or typeof window !== 'undefined'
# Or route has export const ssr = false

# ══════════════════════════════════════════════════════════════
# TIER E: SVELTE 5 RUNE COMPLIANCE (G21-G26 — added 2026-04-14/15)
# All gates MUST return 0 hits. Current baseline: all 0 ✅
# ══════════════════════════════════════════════════════════════

# G21: No Svelte 4 props (export let → $props())
rg "export\s+let\s+\w+" src/ --glob "*.svelte"

# G22: No Svelte 4 reactive declarations ($: → $derived/$effect)
rg "^\s*\$:[^:]" src/ --glob "*.svelte"

# G23: No Svelte 4 event directives (on:click → onclick)
rg "\bon:[a-z][a-z]+=" src/ --glob "*.svelte"

# G24: No createEventDispatcher in live code (callback props replace it)
rg "createEventDispatcher\(\)" src/ --glob "*.svelte"

# G25: No rune calls in plain .ts files (reactivity inert — use .svelte.ts)
rg "\$(?:state|derived|effect|props)\s*[(<]" src/lib/ --type ts --glob "!*.svelte.ts" --glob "!*.d.ts"

# G26: Route handler unit tests use the lazy-import pattern (added 2026-04-15)
# Every +server.ts and +page.server.ts test file MUST:
#   1. Declare // @vitest-environment node (top of file, before any imports)
#   2. Use vi.hoisted() for all mock variables referenced inside vi.mock() factories
#   3. Lazy-import the route handler inside beforeEach (not at module scope)
#   4. Cover 4 baseline cases: 401 unauth, 400 bad input, 200 success, degraded upstream
#
# Verify: all test files in tests/routes/ have the node env directive
rg "^// @vitest-environment node" tests/routes/ --glob "*.test.ts" --glob "*.spec.ts" -l
# Count should equal total test files in that dir (no file missing the directive)
#
# Automated: tests/runes/svelte5-rune-compliance.test.ts covers G21-G25 statically
# Automated: tests/routes/sveltekit-load-patterns.test.ts covers load() redirect + DB fallback
# Automated: tests/routes/sveltekit-form-actions.test.ts covers fail/message/redirect
```

```

```bash
# ══════════════════════════════════════════════════════════════
# TIER F: CONTEXTUAL GRAPH ANALYSIS (G27-G35 — added 2026-04-16)
# pytorch-graph N-API ops wired end-to-end through all pipelines
# ══════════════════════════════════════════════════════════════

# G27: pytorch-graph consumers — kmeansWithCentroids AND trainSOM must be imported
rg "kmeansWithCentroids|trainSOM" src/lib/server/ --type ts -l
# MUST return ≥2 files (som-topology-pipeline.ts + gpu-graph-analysis.ts)

# G28: SOM topology endpoint exists
ls src/routes/api/graph/som-topology/+server.ts
# MUST exist — draws Neo4j SIMILAR_TOPOLOGY edges from SOM BMU adjacency

# G29: Colab export endpoint exists
ls src/routes/api/graph/colab-export/+server.ts
# MUST exist — returns .ipynb JSON for Google Colab GPU processing

# G30: Compound parallel tasks — tasks.json has dependsOrder: "parallel"
rg '"dependsOrder".*"parallel"' ../.vscode/tasks.json
# MUST return ≥2 hits (Full Dataset Index + Graph Analysis Suite tasks)

# G31: Qdrant tag enrichment — som_cluster payload field written after SOM
rg "som_cluster" src/lib/server/ --type ts
# MUST return ≥1 hit — SOM BMU index written to codebase_chunks_768 payload

# G32: Neo4j topology edges — SIMILAR_TOPOLOGY relationship created
rg "SIMILAR_TOPOLOGY" src/lib/server/ --type ts
# MUST return ≥1 hit — SOM grid adjacency relationships in Neo4j

# G33: pageRankGPU wired in graph module — replaces JS loop for n≤2000
rg "pageRankGPU" src/lib/server/graph/ --type ts
# MUST return ≥1 hit (gpu-graph-analysis.ts imports + calls pytorch pageRankGPU)

# G34: attentionScoreGPU wired for ACE context weighting
rg "attentionScoreGPU" src/lib/server/ --type ts -l
# MUST return ≥1 file — used for query-weighted centroid scoring in graph analysis
# OR in context-assembler.ts for ACE chunk ranking

# G35: rewardScoreGPU available for GRPO pipeline
rg "rewardScoreGPU" src/lib/server/ --type ts -l
# Should return ≥1 file when GRPO reward scoring is wired to LangGraph service

# ── Neo4j query: verify SOM topology edges exist ──────────────────────
# Run at http://localhost:7474/browser
```cypher
MATCH ()-[r:SIMILAR_TOPOLOGY]->()
RETURN count(r) AS topologyEdges,
       count(DISTINCT startNode(r)) AS sourceNodes,
       count(DISTINCT endNode(r)) AS targetNodes
```

# ── VS Code: run all graph analysis gates ──────────────────────────────
# Task label: "🔍 Graph: Audit G27-G35 (pytorch-graph wiring gates)"
# Or run in terminal from workspace root:
node -e "
const addon = require('./simd-bridge/cpp/build/Release/tensorrt_bridge.node');
const fns = ['kmeansWithCentroids','trainSOM','pageRankGPU','attentionScoreGPU','rewardScoreGPU'];
fns.forEach(f => console.log(f + ':', typeof addon[f] === 'function' ? 'EXPORTED' : 'MISSING'));
"
# All 5 MUST print 'EXPORTED'
```

**Rune compliance Neo4j queries** (http://localhost:7474):
```cypher
MATCH (n:CodebaseFile) WHERE n.isSvelteComponent = true
RETURN count(n) AS svelteFiles,
  sum(CASE WHEN n.hasSvelte4Props    THEN 1 ELSE 0 END) AS legacyExportLet,
  sum(CASE WHEN n.hasSvelte4Reactive THEN 1 ELSE 0 END) AS legacyReactive,
  sum(CASE WHEN n.hasSvelte4Events   THEN 1 ELSE 0 END) AS legacyOnEvent,
  sum(CASE WHEN n.hasRunesInPlainTs  THEN 1 ELSE 0 END) AS runesInPlainTs
```

Also check: config refs (`unocss.config.ts`, `svelte.config.js`, `vite.config.ts`), SvelteKit route files are NEVER orphans.

```bash
# ══════════════════════════════════════════════════════════════
# TIER G: GLYPH / CARTRIDGE / ACE AUDIT (G36-G47 — added 2026-04-16)
# Verifies shared schema, staged search, cache alignment, and
# Drizzle persistence for the Glyph/CHR97/ACE integration layer.
# ══════════════════════════════════════════════════════════════

# G36: Shared GlyphRecord schema exists
# Canonical type must include semantic, vector, topology, and render layers
rg "export interface GlyphRecord|type GlyphSection|type GlyphKind" src/lib/server/ --type ts
# MUST return ≥1 hit — the core unifying type across cartridge/tile/ACE

# G37: RuneData → GlyphRecord compatibility mapper exists
# Backward-compat bridge so existing CHR97 cartridge code keeps working
rg "runeToGlyphRecord|GlyphRecord.*RuneData|RuneData.*GlyphRecord" src/lib/server/ --type ts
# MUST return ≥1 hit — mapper from CHR97 RuneData into GlyphRecord

# G38: Staged cartridge search path exists
# Search must do: 4D/topology prefilter → attention rerank → 768d rerank/reward
rg "topology prefilter|scoreAttention|rewardScoreGPU|searchCartridge.*Float32Array" src/lib/server/ --type ts
# MUST return ≥1 hit — the staged search bridge

# G39: Section-aware tiling exists
# Glyphs must carry legal section labels for tile grouping
rg "FACTS|LEGAL_AUTHORITY|CLAIMS|PRAYER_HOLDING" src/lib/server/ --type ts
# MUST return ≥1 hit — section enum/const used in glyph tile grouping

# G40: Glyph prompt cache aligns to page boundaries
# Cache keys must tie to glyphId, pageIndex, or cartridge page identity
rg "glyphId|pageIndex|tileIndex|promptCacheKey|setFragment|getFragment" src/lib/server/ --type ts
# MUST return ≥1 hit — page-aligned cache contract

# G41: Tile atlas builder is wired (not dormant)
# buildGlyphTileAtlas must be reachable from a live route or rebuild path
rg "buildGlyphTileAtlas|searchGlyphTiles|invalidateGlyphAtlas|publishGlyphRebuild" src/ --type ts
# MUST return ≥2 hits — builder + at least one consumer/trigger

# G42: Redis slim/full atlas contract is explicit
# Cached atlases omit centroids (fine for UI); search paths must rehydrate
rg "centroid omitted from Redis|source: 'redis'|searchGlyphTiles" src/lib/server/ --type ts
# MUST return ≥1 hit — explicit contract comment or rehydration logic

# G43: CouchDB topology persistence exists
# Glyph atlas writes topology docs to CouchDB with stable doc shape
rg "glyph_topology|COUCHDB_DB|_couchSave" src/lib/server/ --type ts
# MUST return ≥1 hit — topology persistence path

# G44: RabbitMQ glyph rebuild trigger exists
# glyph.tile.rebuild publish path must be live after SOM rebuild or indexing
rg "glyph.tile.rebuild" src/lib/server/ --type ts
# MUST return ≥1 hit — queue-triggered rebuild

# G45: Drizzle schema stores glyph metadata
# Postgres must have columns/JSONB for section, tags, summary, somCluster,
# centroidId, grpoRewardScore, render/cache hints
rg "glyph_records|grpoRewardScore|somCluster|centroidId|recordJson" src/lib/server/db/ --type ts
# MUST return ≥1 hit — durable schema-backed glyph records

# G46: Barrel exports are narrow and stable
# Only approved glyph/cartridge types exported from server barrels
rg "from './glyph|from './cartridge|export type .*Glyph|export .*Glyph" src/lib/server/ --type ts
# Should return controlled set — no accidental internal exposure

# G47: Frontend route coverage exists
# At least one frontend consumer for cartridge and glyph features
rg "/api/cartridge/|/api/glyph/|glyph|cartridge" src/routes/ src/lib/ --type svelte
# MUST return ≥1 hit per feature area (cartridge export/search/stats, glyph atlas/tiles)
```

```bash
# ══════════════════════════════════════════════════════════════
# TIER H: SEARCH INTELLIGENCE + ANALYTICS (G48-G55 — added 2026-04-17)
# Verifies the analytics collection pipeline, Search Patterns API,
# ACE feedback loop (P1-A prompt leaderboard, P3-A cross-source rerank),
# and cache key consolidation (P2-A).
# ══════════════════════════════════════════════════════════════

# G48: Search Patterns API exports all 9 required top-level fields
# Response must include hotQueries, clusterHeat, variancePairs, chunkQuality,
# pipelineMemory, crossPipelineChamps, trending, didYouMean, meta
rg "pipelineMemory|crossPipelineChamps|trending|didYouMean" src/routes/api/analytics/search-patterns/+server.ts
# MUST return ≥4 hits (all four new fields returned in json())

# G49: search-analytics.ts exports all 6 required read-side functions
rg "export async function get" src/lib/server/analytics/search-analytics.ts
# MUST return ≥6 hits:
#   getHotQueries, getClusterHeatMap, getChunkQualitySignals,
#   getVariancePairs, getDidYouMeanSuggestions, getAllQuerySketches

# G50: Chunk hit logging wired in ACE assembly (context-assembler.ts)
rg "recordChunkHits" src/lib/server/ace/context-assembler.ts
# MUST return ≥1 hit — analytics must fire on every ACE retrieval pass

# G51: P1-A prompt leaderboard → ACE queryTags (feedback loop closed)
rg "fetchTopQueryTags|getTopPrompts|topQueryTags" src/lib/server/ace/context-assembler.ts
# MUST return ≥1 hit — top prompts injected into ACEContext.queryTags

# G52: P3-A cross-source reranking active in context assembler
rg "webSearchToUnified|webUnified|P3-A" src/lib/server/ace/context-assembler.ts
# MUST return ≥2 hits — import + usage of webSearchToUnified in ragChunks merge

# G53: ACE_PIPELINE_VERSION reflects post-P3-A state
rg "ACE_PIPELINE_VERSION = '2\." src/lib/server/ace/context-assembler.ts
# MUST return 1 hit — version ≥ 2.x invalidates stale ace_chunks cache rows

# G54: P2-A cache key consolidation — generateCacheKey lives in cache-keys.ts
rg "export function generateCacheKey|export function generateContextHash" src/lib/server/cache-keys.ts
# MUST return 2 hits — single source of truth for LLM cache key generation

# G55: redis-exact-match.ts and llm-cache.ts import from cache-keys (not local)
rg "from.*cache-keys" src/lib/server/cache/redis-exact-match.ts src/lib/server/ai/llm-cache.ts
# MUST return 2 hits — both files import from canonical cache-keys.ts
# If either file still has a local generateCacheKey/hashContext → DRY violation remains
```

### Decision Tree (post-gate)

1. **G1-G9 all zero?** → Orphan candidate
2. **Read the file** — corrupted, <10 lines, garbled? → **ARCHIVE**
3. **Unique feature?** — superseded by another module? → **ARCHIVE**
4. **Svelte 4 syntax** (`export let`, `$:`, `on:click`) but valuable? → **REWRITE**
5. **No integration point?** — no route/layout to host it? → **ARCHIVE**
6. **< 30 min to wire?** → **WIRE** / else **DEFER**
7. **After wiring**, verify: import → render → trigger → API routes → props → data flow. Gap? → **SHALLOW**

**Shallow wiring indicators:** no-op `() => {}` callbacks, imported but never rendered, fetch to nonexistent API, props bound to unset `$state`, conditional render that never triggers.

**Automated:** `/audit-components [dir]`, `/prune-codebase [dir]`, `/wire-modules [dir]`

### Known False Negatives (LOOK dead but ARE wired)

- `$lib/webgpu/` — root layout WebGPU init (every page)
- `$lib/gpu/` — active compute pipeline (3 WGSL shaders, search reranker)
- `$lib/ai/onnx/` — client ONNX inference (WebGPU → WASM → CPU)
- `simd-bridge/cpp/` — LibTorch/CUDA N-API addon (3 GPU functions, G14)
- `AnalysisPanel.svelte` — dynamic import + `yorha:open-analysis` event (G2+G8)
- `KeyboardShortcutsPanel.svelte` — dynamic-only import in layout (G2, 0 static)
- `chr97-builder.ts` / `cartridge-tensor-bridge.ts` — tensor caching (4 API endpoints)
- `lib/server/db/drizzle.ts` — `@vite-ignore` variable import (G4)

**`deeds_labs/` is gitignored** — moving files there is permanent deletion. Measure twice, cut once.

---

## Backend Infrastructure Audit (17 Gates)

**Complement to 20-gate code audit above** — the code audit checks **static codebase health**, this audit checks **runtime service health**.

**When to run**: Pre-deployment, post-Docker restart, debugging cache/inference issues, validating observability stack.

**Quick run**: `bash scripts/audit/backend-infrastructure-audit.sh` (~30s)

**Documentation**: See [BACKEND_INFRASTRUCTURE_AUDIT.md](BACKEND_INFRASTRUCTURE_AUDIT.md) for detailed gate definitions, troubleshooting, and fix commands.

### 17-Gate System (5 Tiers)

| Tier | Gates | Services Checked |
|------|-------|------------------|
| **A: Cache** | G1-G5 | Redis connection/keys/memory, Bifrost semantic cache, Qdrant vector store |
| **B: Inference** | G6-G9 | Ollama service, GPU availability, model files, inference latency |
| **C: Message Queue** | G10-G12 | RabbitMQ service, queue consumers, message flow |
| **D: Observability** | G13-G15 | Langfuse UI, trace ingestion, cache monitoring endpoint |
| **E: Codebase Intelligence** | G16-G17 | Codebase index (Qdrant codebase_chunks_768), simdjson native addon |

### Integration with Code Audit

**Use both audits together**:

```bash
# Before deployment (full validation)
bash sveltekit-frontend/scripts/audit/orphan-detector.sh src/  # 20-gate code audit
bash scripts/audit/backend-infrastructure-audit.sh             # 17-gate backend audit

# After code changes (quick code check)
# Run specific gates: G1-G9 for imports, G18-G19 for auth/validation
rg "from.*NewModule" src/ --type ts --type svelte  # G1 example

# After Docker restart (backend health only)
bash scripts/audit/backend-infrastructure-audit.sh

# Debugging inference issues (backend Tier B only)
# Check gates G6-G9 manually or run full script
```

**Division of responsibility**:
- **20-gate code audit**: Static imports, DB schema refs, auth guards, Zod validation
- **17-gate backend audit**: Docker services, Redis cache, Ollama/GPU, RabbitMQ, Langfuse, Codebase index

**Service ports reference** (from backend audit):
| Service | Port | Health Check |
|---------|------|--------------|
| SvelteKit Dev | 5173 | `curl localhost:5173` |
| Redis | 6379 | `docker exec deeds-redis-prod redis-cli ping` |
| Bifrost | 3040 | `curl localhost:3040/health` |
| Qdrant | 6333 | `curl localhost:6333/` |
| Ollama | 11434 | `curl localhost:11434/api/tags` |
| RabbitMQ | 5672, 15672 | `curl -u guest:guest localhost:15672/api/overview` |
| Langfuse | 3030 | `curl localhost:3030` |
| SeaweedFS S3 | 8333 | `curl localhost:9333/cluster/status` (probe via master) |
| SeaweedFS Master | 9333 | `curl localhost:9333/cluster/status` |
| SeaweedFS Filer | 8382 | `curl localhost:8382/` |

**Expected performance baselines** (from your RTX 3060 Ti setup):
| Metric | Value | Acceptable Range |
|--------|-------|------------------|
| Redis GET | 5ms | <10ms |
| Bifrost L2 Hit | 2-5s | <10s |
| Ollama GPU | 25s | <60s |
| Cache Speedup | 6,542× (vs CPU) | >1,000× |

---

## gRPC Service Port Map (Audited April 19, 2026)

| Port  | Service                  | Client                   | Status        |
|-------|--------------------------|--------------------------|---------------|
| 50051 | EmbeddingService (Go)    | `grpc/embedding-client.ts` | FULLY WIRED |
| 50052 | GenerationService        | `grpc/generation-client.ts` | ORPHANED   |
| 50053 | RetrievalService (Go)    | `grpc/retrieval-client.ts` | FULLY WIRED |
| 50055 | CHR97 / LibSearch (Go)   | `grpc/chr97-agent-client.ts` | PORT COLLISION |
| 50056 | GraphML (PyTorch GPU)    | `grpc/graph-ml-client.ts` | MISSING ENV |
| 50057 | ToolCalling              | `grpc/tool-calling-client.ts` | FULLY WIRED |
| 8096  | go-search-service HTTP   | direct fetch             | OPERATIONAL   |
| 8097  | go-embedding-service HTTP| direct fetch             | COMPILED      |
| 8100  | go-retrieval-service HTTP| `grpc/retrieval-client.ts` | OPERATIONAL |

**Known issues:** Port 50055 collision (CHR97 + go-search-service), `GRAPH_ML_GRPC_URL` missing from `env.server.ts`, `generation-client.ts` has zero consumers.

**All gRPC services default to disabled** (`*_GRPC_ENABLED=false`). Each client has graceful fallback chains (gRPC → HTTP → inline TypeScript).

---

## Docker WSL2 VHDX Management

**Windows 10 limitation:** Docker's VHDX never auto-shrinks. Must compact manually after cleanup.

**Compaction steps** (after any `docker rmi` / prune):
```powershell
# 1. Prune inside Docker
docker system prune -a --volumes && docker builder prune -a
# 2. Quit Docker Desktop from system tray
# 3. Shut down WSL
wsl --shutdown
# 4. Compact via diskpart
diskpart
select vdisk file="C:\Users\james\AppData\Local\Docker\wsl\disk\docker_data.vhdx"
compact vdisk
detach vdisk
exit
```

**Set disk cap:** Docker Desktop Settings > Resources > Advanced > Disk image size (e.g., 64 GB)

**Move to another drive:** Docker Desktop Settings > Resources > Advanced > Disk image location

---

## GPU Acceleration Stack (N-API + LibTorch + simdjson)

**Overview**: Native C++ addons bridge TypeScript ↔ CUDA/LibTorch/simdjson for 2-6,500× performance gains.

### Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│ TypeScript Application (SvelteKit)                     │
│  ├─ fastJsonParse<T>() — lib/server/gpu/simdjson-bridge.ts
│  └─ computeGpuSimilarity() — lib/server/gpu/libtorch-bridge.ts
└─────────────────────────────────────────────────────────┘
                         ↓ N-API
┌─────────────────────────────────────────────────────────┐
│ C++ N-API Addon (tensorrt_bridge.node)                 │
│  ├─ simdJsonParse() — AVX2 SIMD JSON parsing           │
│  ├─ libtorchCosineSimilarity() — GPU tensor ops        │
│  └─ tensorrtInference() — TensorRT acceleration        │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Native Libraries                                        │
│  ├─ simdjson (AVX2/SSE4.2) — 2-5× faster JSON parsing │
│  ├─ LibTorch (CUDA 12.1) — GPU tensor operations       │
│  └─ TensorRT (v10.7) — INT4/INT8 quantized inference   │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ NVIDIA RTX 3060 Ti (8GB VRAM, CUDA 12.1)                │
└─────────────────────────────────────────────────────────┘
```

### 1. simdjson N-API Bridge

**Location**: `sveltekit-frontend/src/lib/server/gpu/simdjson-bridge.ts`
**Native Addon**: `simd-bridge/cpp/build/Release/tensorrt_bridge.node`

**Features**:
- **AVX2/SSE4.2 SIMD**: 2-5× faster than V8 JSON.parse for payloads >1KB
- **LRU Cache**: 200-entry cache with 30s TTL, FNV-1a hash keys
- **Auto-fallback**: Gracefully degrades to V8 JSON.parse if addon unavailable
- **Smart routing**: Payloads <1KB bypass native (V8 is faster for small strings)

**TypeScript API**:
```typescript
import { fastJsonParse, fastJsonValidate, fastJsonExtractNumbers, isSimdJsonAvailable } from '$lib/server/gpu/simdjson-bridge';

// Parse large JSON responses (Qdrant, RabbitMQ, Ollama)
const result = fastJsonParse<QdrantResponse>(largeJsonString);

// Fast structural validation (pre-parse check)
if (fastJsonValidate(untrustedInput)) { /* ... */ }

// Extract embedding vectors directly into Float64Array (zero-copy)
const embedding = fastJsonExtractNumbers(response, '/data/embedding');
```

**Performance**:
- **With addon**: 2-5× faster than V8 (for JSON >1KB)
- **Without addon**: Falls back to V8 (no performance loss, just no speedup)
- **Cache hit**: 0.1ms (200× faster than parse)

**Known Limitation**: Addon requires LibTorch/CUDA DLLs in system PATH. If DLLs missing outside dev server, falls back to V8.

### 2. LibTorch CUDA Bridge

**Location**: `sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts`
**Native Addon**: Same `tensorrt_bridge.node` (combined addon)
**C++ Source**: `simd-bridge/cpp/libtorch_graph.cc`

**Features**:
- **GPU tensor operations**: Cosine similarity, clustering, graph analytics
- **CUDA 12.1**: Direct RTX GPU access, no Docker overhead
- **Zero-copy**: TypeScript Float32Array ↔ CUDA tensors (shared memory)
- **Batching**: Process 100+ vectors in parallel on GPU

**TypeScript API**:
```typescript
import { computeGpuSimilarity, isCudaAvailable } from '$lib/server/gpu/libtorch-bridge';

// GPU cosine similarity (100× faster than CPU for large batches)
const queryVec = new Float32Array([...]); // 768-dim
const candidateVecs = [new Float32Array([...]), ...]; // 1000 candidates
const scores = computeGpuSimilarity(queryVec, candidateVecs);
```

**Performance**:
- **CPU (TypeScript)**: 2.5s for 1000 comparisons
- **GPU (LibTorch)**: 25ms for 1000 comparisons
- **Speedup**: 100× for batch operations

### 3. N-API Build System

**Build Tool**: CMake + node-gyp
**Config**: `simd-bridge/cpp/CMakeLists.txt`

**Dependencies**:
- **Node-API Headers**: Auto-detected from Node.js installation
- **LibTorch**: Downloaded from pytorch.org (CUDA 12.1, C++17)
- **simdjson**: Git submodule at `simd-bridge/cpp/simdjson/`
- **CUDA Toolkit**: 12.1.x (for LibTorch)

**Build Command**:
```bash
cd simd-bridge/cpp
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release
# Output: build/Release/tensorrt_bridge.node (299KB)
```

**Verification**:
```bash
# Check if addon loads correctly
node -e "const addon = require('./simd-bridge/cpp/build/Release/tensorrt_bridge.node'); console.log('CUDA available:', addon.isCudaAvailable());"
```

### 4. Integration Points

**Where Used**:
- **Qdrant responses** — `fastJsonParse()` in `/api/codebase-index/stats`, vector search endpoints
- **Ollama responses** — Large JSON from LLM completions (30KB+ for long responses)
- **RabbitMQ messages** — Fast deserialization of queue payloads
- **Evidence pipeline** — `computeGpuSimilarity()` for duplicate detection (Stage 9)
- **Search reranking** — GPU-accelerated cosine similarity for top-K selection

**Backend Audit Gate**:
- **G17**: Checks `isSimdJsonAvailable()` via `/api/codebase-index/stats`
- **Status**: SKIP (acceptable) — addon exists but DLLs not in system PATH, falls back to V8

### 5. Troubleshooting

**Addon not loading**:
```
Error: The specified module could not be found (ERR_DLOPEN_FAILED)
```
**Cause**: LibTorch/CUDA DLLs not in system PATH
**Fix**:
1. Add `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.1\bin` to PATH
2. Add LibTorch `lib` directory to PATH
3. Restart dev server

**Alternative**: Accept V8 fallback (2-5× slower but still functional)

**CUDA not available**:
```javascript
isCudaAvailable() === false
```
**Cause**: GPU driver issue or LibTorch built for CPU-only
**Fix**: Download CUDA-enabled LibTorch from pytorch.org, rebuild addon

### 6. Performance Impact

| Operation | V8 Native | simdjson Addon | Speedup |
|-----------|-----------|----------------|---------|
| Parse 100KB JSON | 12ms | 2.4ms | 5× |
| Parse 10KB JSON | 1.2ms | 0.8ms | 1.5× |
| Parse 1KB JSON | 0.3ms | 0.4ms | 0.75× (slower, use V8) |
| Extract Float64Array | 5ms (parse + loop) | 0.5ms (zero-copy) | 10× |

**Best for**: Qdrant responses (10-100KB JSON), Ollama completions (30KB+), RabbitMQ batch messages

---

## Drizzle ORM 0.44 (PostgreSQL 18.4 + pgvector)

**Main schema**: `src/lib/server/db/schema-postgres.ts` (70+ tables, 14 enums)

```typescript
// Imports — use .js extension (bundler resolves .js → .ts)
import { users, cases, evidence, caseStatusEnum } from '$lib/server/db/schema-postgres.js';
import type { User, NewUser } from '$lib/server/db/schema-postgres.js';
import { eq, desc, and, or, sql } from 'drizzle-orm';

// Type inference: $inferSelect (read) / $inferInsert (write) — canonical approach
// Always infer from Drizzle schema definitions, NOT custom DrizzleTypes layers
export type Case = typeof cases.$inferSelect;
export type NewCase = typeof cases.$inferInsert;

// Common query patterns
const result = await db.select().from(cases).where(eq(cases.status, 'open'));
const [newCase] = await db.insert(cases).values({ title, status: 'open', priority: 'medium' }).returning();
await db.update(cases).set({ status: 'closed' }).where(eq(cases.id, caseId));
```

**Key enums**: `userRoleEnum`, `caseStatusEnum`, `casePriorityEnum`, `evidenceTypeEnum`, `documentTypeEnum`, `documentStatusEnum`, `patchStatusEnum`, `threatLevelEnum`

**Core table groups**: Auth (users, sessions), Cases (cases, caseNotes, caseStatuteLinks), Evidence (evidence, evidenceRelationships), Documents (documents, legalDocuments, documentChunks), Legal (citations, statutes, statuteChunks, legalPrecedents), RAG (ragSessions, ragMessages), Embeddings (6 vector tables, 768 dims), Workspaces, Route Health, Error Tracking

### pgvector Column Types (Drizzle-native)

```typescript
// PREFERRED — Drizzle-native (built into drizzle-orm/pg-core since ~v0.30)
import { vector, halfvec, sparsevec, bit } from 'drizzle-orm/pg-core';

// LEGACY — pgvector npm package (experimental, DO NOT use for new code)
// import { vector } from 'pgvector/drizzle-orm';

// Distance functions — use typed API, not raw SQL operators
import { cosineDistance, l2Distance, innerProduct } from 'drizzle-orm';

// Similarity search
const results = await db.select({
  id: items.id,
  distance: cosineDistance(items.embedding, queryVec)
}).from(items)
  .orderBy(asc(cosineDistance(items.embedding, queryVec)))
  .limit(10);

// HNSW index (Drizzle 0.44 native — but keep manual SQL convention for production)
index('embedding_hnsw_idx')
  .using('hnsw', table.embedding.op('vector_cosine_ops'))
  .with({ m: 16, ef_construction: 64 }),
```

See `memory/drizzle-schema-reference.md` for full table reference.

---

## Route Map

**App routes** (23 — `src/routes/(app)/`): active-cases, admin/*, ai-dashboard, all-routes (SSE), analysis-center, cases, citations, command-center, dashboard, error-brain, evidence, evidence-library, global-search, gpu-evidence-graph, persons-of-interest, phase78, system-configuration, terminal

**API routes** (43 — `src/routes/api/`): auth, cases, chat, citations, embed, evidence, health, indexing, kb, knowledge, ollama, persons, rag (search/validate/answer), reports, routes (SSE), sse, stream, summarize, topology, tools, and more

See `memory/drizzle-schema-reference.md` for full route map.

---

## XState v5 Patterns

```typescript
// Runtime functions — NOT types
import { assign, createMachine, fromPromise } from 'xstate';

// Svelte 5 integration
import { useMachine } from '$lib/utils/xstate-svelte5';
const { snapshot, send } = useMachine(myMachine);
const isLoading = $derived(snapshot.matches('loading'));
```

---

## Graceful Error Handling Pattern (Session 35)

All page server load functions use graceful degradation instead of `throw error(500)`:

```typescript
// safe() helper — wraps DB queries to prevent 500s
const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

// Usage in load functions
const rows = await safe(
  db.select().from(table).where(eq(table.id, id)).limit(1),
  []
);

// Return loadError instead of throwing
if (!rows[0]) {
  return { data: null, loadError: 'Not found or database unavailable' };
}
return { data: rows[0], loadError: null };
```

**Rules:**
- `throw redirect()` is still correct for auth guards
- `throw error(404)` → return `{ data: null, loadError: '...' }` for missing records
- `throw error(500)` → NEVER in catch blocks; use `safe()` + `loadError` field
- API routes (`+server.ts`) can still return error JSON responses — this pattern is for page loads

---

## Test Scripts

**NEVER delete working scripts.** Move them to `scripts/tests/` if they're in the wrong place. We keep scripts that worked — we might need them later.

Visual regression / route-screenshot testing is currently delegated to Playwright in `tests/e2e/`. The `scripts/tests/test-screenshots.mjs` referenced in older sessions was never committed to the tree (and isn't in `deeds_labs/` archive either) — it was a local-only helper. Re-create as needed using Playwright's `page.screenshot({ path })` per the existing `tests/e2e/*.spec.ts` patterns.

---

## ORT WASM: Git vs Local Differences

The ONNX Runtime browser inference needs 3 `.wasm` binaries + 3 `.mjs` loaders in `sveltekit-frontend/static/ort/`:

| File | Size | In Git | In Local |
|------|------|--------|----------|
| `ort-wasm-simd-threaded.asyncify.mjs` | ~4KB | Yes | Yes |
| `ort-wasm-simd-threaded.jsep.mjs` | ~4KB | Yes | Yes |
| `ort-wasm-simd-threaded.mjs` | ~2KB | Yes | Yes |
| `ort-wasm-simd-threaded.asyncify.wasm` | 24.3MB | **No** (pre-commit hook rejects >10MB) | Yes |
| `ort-wasm-simd-threaded.jsep.wasm` | 22.7MB | **No** | Yes |
| `ort-wasm-simd-threaded.wasm` | 11.4MB | **No** | Yes |

**After cloning, copy WASM binaries from node_modules:**
```bash
cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded*.wasm sveltekit-frontend/static/ort/
```

**Verify serving:** Hit `/ort/ort-wasm-simd-threaded.wasm` in browser — should return 200.

**Cross-origin isolation:** If using threaded runtime, app needs COOP/COEP headers or threaded WASM degrades silently.

---

## UnoCSS Extraction Limitations (Session 38)

UnoCSS generates CSS only for utilities it can **extract at build time**. Dynamic Svelte class expressions prevent extraction:

```svelte
<!-- FAILS — UnoCSS can't extract "flex", "gap-3", etc. from dynamic expressions -->
<div class={`flex gap-3 ${isActive ? 'bg-accent' : 'bg-panel'}`}>
<div class="flex gap-3 {someVar}">

<!-- WORKS — static class strings are extractable -->
<div class="flex gap-3 bg-accent">
```

**Current fix:** Scoped `<style>` blocks for layout-critical components (tabs, filters, toolbars). Most deterministic approach — bypasses UnoCSS entirely.

**Alternative:** Safelist critical layout utilities in `uno.config.ts` to force generation regardless of extraction:
```typescript
safelist: [
  'flex', 'inline-flex', 'items-center', 'justify-between',
  'gap-1', 'gap-2', 'gap-3', 'gap-4',
  'px-2', 'px-3', 'px-4', 'py-1', 'py-2',
]
```

---

## Post-Audit Alignment (May 3, 2026 — Deep Compiler Stack Audit)

### Inference Cascade (8 tiers — verified live)
```
TensorRT-LLM :8099 (INT4 AWQ, GPU lease) →
Triton TensorRT :8000 →
Bifrost :3040 (ε-greedy, 500ms deadline, ~5ms hits) →
TurboQuant :8090 (llama-server, cache_prompt:true, KV q8_0) →
VLM :8085 (Gemma4 E4B HF, NF4, vision) →
LiteRT-LM :8070 (CPU MTP speculative) →
Ollama :11434 (final fallback)
```

### Compiler Stack — Correct Mental Model
- **tsgo** = type graph traversal (Go goroutines). NO GPU, NO matmul. 10× speed = CPU parallelism only.
- **tensorrt_bridge.node** = LibTorch N-API. cuBLAS GEMM on RTX 3060 Ti. 100–500× faster than WASM for matmul.
- **WASM SIMD128** = 128-bit lanes, no GPU access, ~500× slower than cuBLAS for 768×768 matmul. Browser-only last resort.
- **ioredis** = `setex` (lowercase), no `.connect()`, use `.quit()` not `.disconnect()`.

### KV Cache Policy (llama-server.exe)
- **Production-stable**: `-ctk q8_0 -ctv q8_0` (works on every llama.cpp build)
- **Recommended TurboQuant**: `-ctk q8_0 -ctv turbo3` — asymmetric. K stays at q8_0 because K-cache TurboQuant support is less mature than V-cache compression on current forks; V at turbo3 captures most of the context-length win.
- **Avoid** `-ctk turbo3 -ctv turbo4` — symmetric K-turbo is the riskier config and stock binaries reject it at flag parse, which silently no-ops if a launcher falls back. Don't hardcode it.
- **Aggressive ceiling**: `-ctk q8_0 -ctv turbo4` — only after q8_0/turbo3 passes the 20-generation stability harness
- **Fallback**: if q8_0/turbo3 fails parity on Gemma4's `head_dim=256` (CUDA mixed-quant parity is documented as "not yet verified" by upstream), drop to `-ctk q8_0 -ctv q8_0` and keep `TURBO_CTX=16384` — you still win 4× context vs the 4096 default.
- **Binary requirement (Gemma4-critical)**: `turbo2/turbo3/turbo4/tbq3_0/tbq4_0` are rejected by stock `ggml-org/llama.cpp` builds, and **picking the right fork matters more than picking the right cache type** for Gemma 4. Gemma 4 attention has `head_dim=256` on SWA layers and `head_dim=512` on global layers, but most TurboQuant forks ship `D=128`-only attention kernels:
  - **[TheTom/llama-cpp-turboquant](https://github.com/TheTom/llama-cpp-turboquant/releases) tqp-v0.1.1 (Win+CUDA12.4 prebuilt)** — D=128 only. The `-h` probe advertises turbo support so the launcher passes flags through, but the model **crashes or produces garbage at the first attention pass on `gemma4-rotorquant:latest`**. Suitable for D=128 models (Llama-3 8B, Qwen2.5 7B). **Do not pair with Gemma 4.**
  - **[test1111…/llama-cpp-turboquant-gemma4](https://github.com/test1111111111111112/llama-cpp-turboquant-gemma4)** — source build, MSVC + CUDA 13.0. Adds D=256/512 kernels with lazy K (Q pre-transform), lazy V (deferred WHT post-loop), batch centroid decode, warp-cooperative writes. Reaches 100% of f16 throughput. **The only working path to turbo4 on Gemma 4 today.**

  Build:
  ```bash
  git clone https://github.com/test1111111111111112/llama-cpp-turboquant-gemma4
  cd llama-cpp-turboquant-gemma4
  cmake -B build -S . -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=86  # 86 = RTX 3060 Ti / Ampere
  cmake --build build --config Release   # ~30 min
  ```
  Drop `build/bin/llama-server.exe` in a separate folder (e.g. `C:\Users\james\Desktop\llama-server-turboquant\`), point `LLAMA_SERVER_PATH` at it. The launcher's `-h` turbo-support probe **cannot detect head-dim incompatibility** — operator owns matching binary capability to model architecture.

  Expected on RTX 3060 Ti / 8GB vs the test1111 RTX 3090 numbers: tokens/sec roughly halves (448 GB/s vs 936 GB/s memory bandwidth), but VRAM footprint is identical. `gemma4-rotorquant:latest` (5.3 GB) + turbo4 KV @ 256K ≈ 6.3 GB total — fits 8GB.
- **Validation harness**: `npm run turbo:test:stability:turbo` (requires server already running with the matching profile — the harness does NOT start llama-server)
- **TurboQuant `cache_prompt: true`**: safe for system prompt KV reuse across communities/clusters

#### `TURBO_PROFILE` shortcut (launcher env var)

[scripts/launch-turboquant.ps1](sveltekit-frontend/scripts/launch-turboquant.ps1) accepts a single env var that picks the K/V pair:

| `TURBO_PROFILE` | K | V | When |
|------|---|---|------|
| `stock` *(default)* | q8_0 | q8_0 | Stock llama.cpp binary; safe baseline. |
| `turboquant` | q8_0 | turbo3 | TurboQuant-enabled binary at `LLAMA_SERVER_PATH`; recommended once stability harness passes. |
| `turboquant-safe` | q8_0 | q8_0 | TurboQuant binary present but you suspect parity issues — keep the larger `TURBO_CTX` without trusting the V-cache compression yet. |

`TURBO_KV_K` / `TURBO_KV_V` env vars override the profile. The launcher's failure semantics (added 2026-05-08):
- Invalid `TURBO_PROFILE` → throw before launch.
- Explicit `TURBO_KV_K` / `TURBO_KV_V` outside the allowlist (`f32, f16, bf16, q8_0, q4_0, q4_1, iq4_nl, q5_0, q5_1, turbo2, turbo3, turbo4, tbq3_0, tbq4_0`) → throw.
- Profile resolves to `turbo*` but binary's `-h` doesn't advertise turbo support → throw with the test1111 fork build URL (for Gemma 4 / D=256/512) and TheTom releases URL (for D=128 models). Silent downgrade is exactly the failure mode that hid `-ctk turbo3 -ctv turbo4` for months.
- Profile defaults that resolve to a stock-only name and the binary doesn't accept it → soft-fallback (the user did not assert intent).

Recommended sequence on RTX 3060 Ti / 8GB:

```powershell
# 1. Baseline on stock binary
$env:TURBO_PROFILE = 'stock'
$env:TURBO_CTX     = '16384'
npm run turbo:start:detached
npm run turbo:test:stability       # captures the q8_0 baseline numbers

# 2. Drop in TurboQuant binary, retest with V-cache compression only
$env:LLAMA_SERVER_PATH = 'C:\Users\james\Desktop\llama-server-turboquant\llama-server.exe'
$env:TURBO_PROFILE     = 'turboquant'
$env:TURBO_CTX         = '16384'
npm run turbo:start:detached
npm run turbo:test:stability:turbo # compares vs the baseline

# 3. Only if step 2 fails parity / stability:
$env:TURBO_PROFILE = 'turboquant-safe'
npm run turbo:start:detached
```

### Gemma4 TurboQuant caveat

For Gemma 4, do not treat generic TurboQuant support as sufficient.

Gemma 4 uses larger attention head dimensions than many llama.cpp TurboQuant examples:

- SWA layers: `head_dim = 256`
- global layers: `head_dim = 512`

Some TurboQuant binaries advertise `turbo3`, `turbo4`, `tbq3_0`, or `tbq4_0` in `--help` but only implement fast attention kernels for `D=128`. Those builds launch successfully and our launcher's `-h` probe will pass them through, but they fail, crash, or produce invalid output on Gemma 4 attention. The launcher cannot detect this — operator owns binary↔model matching.

**Stable default**:

```bash
TURBO_PROFILE=stock
# equivalent KV: -ctk q8_0 -ctv q8_0
```

**Desired experimental Gemma 4 profile** — only with D=256/D=512-capable kernels:

```bash
TURBO_PROFILE=turboquant
# equivalent KV: -ctk q8_0 -ctv turbo3
```

**Parity-safe fallback**:

```bash
TURBO_PROFILE=turboquant-safe
# equivalent KV: -ctk q8_0 -ctv q8_0
```

Do **not** use `-ctk turbo3 -ctv turbo4` as a default. Keep K-cache at `q8_0`; compress V-cache first.

**Fork pairing**:

| Fork | Head dims | Gemma 4? | Path |
|------|-----------|----------|------|
| stock `ggml-org/llama.cpp` | all | n/a (no turbo*) | baseline |
| [TheTom/llama-cpp-turboquant](https://github.com/TheTom/llama-cpp-turboquant/releases) tqp-v0.1.1 prebuilt | D=128 | **No** — treat as not recommended for Gemma 4 unless D=256/512 support is confirmed in a future tag | suits Llama-3 8B / Qwen2.5 7B |
| [test1111…/llama-cpp-turboquant-gemma4](https://github.com/test1111111111111112/llama-cpp-turboquant-gemma4) | D=128/256/512 | **Yes** | only working experimental Gemma 4 path |

**Source build for RTX 3060 Ti / Ampere sm_86**:

```bash
git clone https://github.com/test1111111111111112/llama-cpp-turboquant-gemma4
cd llama-cpp-turboquant-gemma4
cmake -B build -S . -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=86
cmake --build build --config Release   # ~30 min
```

**TurboQuant is a manual runtime milestone.** Do not block ACE / KAG / hypergraph retrieval work on it. Retrieval lanes (Lane A cluster_context shipped, Lane B shared_resource shipped, Lane C SHARES_TAGS pending) improve agent quality even when the server stays on `q8_0/q8_0`. Lane B retrieval > TurboQuant runtime as a priority call.

### TurboQuant — Google ICLR 2026 Paper (PolarQuant + QJL)
**Paper**: "TurboQuant: Redefining AI Efficiency with Extreme Compression" — Google Research + NYU  
**Algorithm** (two-stage, data-oblivious — no calibration, no learned params):
1. **PolarQuant**: Random rotation of KV vectors → simplifies geometry → scalar quantization per coordinate (Lloyd-Max optimal codebook)
2. **QJL error correction**: Captures residual error (~1 bit) via Quantized Johnson-Lindenstrauss, eliminates quantization bias

**Compression ratios vs f16 baseline**:
| Format | Bits | VRAM savings | Notes |
|--------|------|-------------|-------|
| `turbo4` | 4-bit | 74% | Higher quality, more VRAM than turbo3 |
| `turbo3` | 3-bit | 80% | Recommended — 5.1× compression |
| `turbo2` | 2-bit | 87% | Aggressive — test carefully |
| `q8_0` | 8-bit | 50% | Stable production baseline |

**Speedup**: 8× attention computation speedup, within 1% throughput of baseline. Example: 75 tok/s on Qwen3-8B / RTX 3080.

**Correct flags** (Flash Attention is MANDATORY — without `-fa on`, KV is dequantized every step → slower than no quant):
```bash
# Recommended asymmetric — K stays at q8_0, only V is pushed to turbo3
# (requires a TurboQuant-enabled llama-server binary; stock llama.cpp rejects turbo3/turbo4)
llama-server.exe -m model.gguf -ctk q8_0 -ctv turbo3 -fa on -ngl 99 -c 16384

# Aggressive (only after q8/turbo3 passes the 20-gen stability harness)
llama-server.exe -m model.gguf -ctk q8_0 -ctv turbo4 -fa on -ngl 99 -c 16384

# Production-stable baseline (works on every llama.cpp build)
llama-server.exe -m model.gguf -ctk q8_0 -ctv q8_0 -fa on -ngl 99 -c 16384
```

**RTX 3060 Ti (8GB) with gemma4-rotorquant:latest (5.3GB model)**:
- Baseline f16 KV: ~7.5GB total → barely fits
- turbo3 KV: ~3.4GB total → 4GB free for batch/context
- Enables 32K+ context without OOM
- **Test stability first**: run 20+ generations, check for NaN/repetition before prod use

### ACE Scoring Spine (verified weights)
```
semantic_vector × 0.60 + tag_score × 0.12 + ast_graph × 0.10 + som_boost × 0.08 + hyperedge × 0.10
+ community_context (GraphRAG preamble, not scored inline)
```

### A2A / MCP / ACP Wiring (verified)
- **A2A AgentCard**: `GET /.well-known/agent.json` — LIVE (`src/routes/.well-known/agent.json/+server.ts`)
- **Agent API**: `POST /api/ai/agent` — native + A2A Task + SSE streaming — LIVE
- **MCP**: `src/mcp/server.ts` — 29 tools, FastMCP, auth guard — LIVE
- **ACP**: `GET /api/acp/tools`, `POST /api/acp/execute` — LIVE

### `using` / `await using` — Available Now (TS 5.2+)
Add `"lib": ["es2025", "esnext.disposable"]` to tsconfig, then:
```typescript
class DisposableRedis extends Redis {
  async [Symbol.asyncDispose]() { await this.quit(); }
}
await using redis = new DisposableRedis(REDIS_URL, { password: REDIS_PASS });
// no explicit quit() needed — fires on scope exit even if exception thrown
```
Replaces manual `if (redisReady) await redis.quit().catch(() => {})` in all pipeline scripts.

### Full Compiler Doc
See `sveltekit-frontend/scripts/docs/compiler-stack-explainer.md` for complete reference.

---

## Graphify/Karpathy Stack (May 4, 2026)

3-layer codebase intelligence with `graphify:*` npm aliases over existing scripts:

| Layer | Command | Output | Cost |
|-------|---------|--------|------|
| 1 — Map | `graphify:daily` / `graphify:map` | `docs/graph/codebase-graph.json` + `codebase-map.md` + Redis `code:index:*` + `wiki:note:dir:*` | ~3-5s, no GPU |
| 2 — Semantic | `graphify:semantic` / `graphify:topology` | Qdrant `codebase_chunks_768` + hypergraph + Qdrant tags | ~30-60s |
| 3 — Full GPU | `graphify:full` / `graphify:gpu:turbo` | SOM + hypergraph + PageRank + Neo4j + cluster synthesis + ACE plans | ~5-10 min |

**5-pillar smoke**: `npm run smoke:graphify` (read-only, <1s) — checks graph JSON + map.md + Redis fast cache + KAG notes + Qdrant `codebase_chunks_768` + ACE `FAST_AST_SCORE_CAP ≤ 0.07`. Flags: `--strict`, `--no-redis`, `--no-qdrant`.

**ACE priority order** (verified in `context-assembler.ts`): Qdrant semantic → ACP cross-feed → Redis KAG (cap 0.08) → Redis fast-AST (`FAST_AST_SCORE_CAP = 0.07` named constant) → SOM/hypergraph/PageRank.

**Topo-byte Redis cache (May 5, 2026)**: Stage A0 in `fetchACPKnowledgeResults()` checks `ace:topo:{topoClass}:{queryHash}` (TTL 300s) before ANN. On cache hit, Qdrant is skipped entirely. `TopoPrefilterStats` flows to `ACEContext.retrievalTrace.topoPrefilter`. Implementation: `src/lib/server/cache/topo-candidate-cache.ts`.

**Topology node coloring**: `src/routes/code-intel/topology/+page.svelte` — color mode toggle (topo / node type), legend overlay for classes present in the node set, topo badge in inspector (glyph + label + hex byte).

**Topology 6-tier fallback clusters (May 5, 2026)**: `scripts/project-codebase-topology.mjs` assigns every file a `clusterKey` via a priority ladder — `gpu-kmeans` (confidence 0.90) → `directory-fallback` (0.60, `cluster:dir:<slug>`) → `topo-class-fallback` (0.50) → `kind-fallback` (0.35) → `unclassified` (0.10). Fallback cluster nodes are included in both graph JSONs so all BELONGS_TO_CLUSTER edges are non-dangling. Validator reports **real** (gpu-kmeans) and **total** coverage separately. Do NOT treat fallback clusters as GPU clusters — filter by `clusterSource` before applying authority boosts.

VS Code tasks: `🗺️ Graphify: Daily Map`, `🔎 Graphify: Semantic Index`, `🧠 Graphify: Full ACE Index`, `🏭 Graphify: Full GPU + TurboQuant`, `🩺 Graphify: Smoke (5-pillar health check)`.

---

## Karpathy GPU Authority Blend + Redis ACE Cache (May 8, 2026)

Single-pipeline composite score for "where to focus" agent recommendations. Combines Neo4j PageRank, GPU semantic attention, and graph authority into one Redis-cached blend that ACE/MCP/synthesis tools read in O(1).

### Pipeline (`scripts/karpathy-gpu-enrich.mjs`)
```
Top-N from Neo4j (graphPageRank)
  → Qdrant fetch content_embedding (768-dim, codebase_chunks_768)
  → Embed RISK_QUERY via /api/embed (Redis L1 + Bifrost L2 cached probe)
  → attentionScoreGPU(probe, 768, embeddings, n)  [direct on raw 768d]
  → autoencoderEncode 768→64  [separate output for memory paths, NOT on attention path]
  → Blend: 0.4·PR + 0.3·attn + 0.3·authority
  → Persist to Redis + write markdown report
```

**Surface**: `npm run karpathy:gpu` (top-50), `karpathy:gpu:dirty` (incremental), `karpathy:gpu:top200`, `karpathy:gpu:dry`.

### Redis ACE cache layout (canonical)

| Key | Type | TTL | Refresher |
|-----|------|-----|-----------|
| `gpu:karpathy:scores` | hash `<file> → JSON{pr,attn,authority,blend}` | 24h | `karpathy:gpu` |
| `gpu:karpathy:encoded` | hash `<file> → 64-dim CSV` (compressed memory paths) | 24h | `karpathy:gpu` |
| `gpu:karpathy:summary` | hash run metadata | 24h | `karpathy:gpu` |
| `ace:authority:top` | hash top-200 stableKey → graphAuthorityScore | varies | `graphify:authority` |
| `ace:rank:dirty_files` | set | session | `startup:ace` |
| `ace:startup:last_sha` | string git HEAD | persistent | `startup:ace` |
| `ace:startup:heavy_last_run` | string ISO timestamp | 24h | `startup:ace` heavy |
| `ace:topo:{class}:{hash}` | string topo-byte candidate cache | 300s | ACE Stage A0 |
| `agents:dir:<rel>` | string rendered AGENTS.md | 24h | `agents:write` |
| `couchdb:pagerank_scores` | string JSON | 6h | `run-pagerank.ts` |

### TurboQuant embedding constraint (important)

**TurboQuant llama-server (:8090) is chat-only** with the canonical flags `-fa on -ctk q8_0 -ctv q8_0`. It refuses `/embedding` and `/v1/embeddings` with `code: 501, "Start it with --embeddings"`. Don't route embedding work through TurboQuant.

**Canonical embed cascade** (used by `karpathy-gpu-enrich.mjs` and elsewhere):
1. **SvelteKit `/api/embed`** — wraps Ollama embeddinggemma with Redis L1 (5ms) + Bifrost L2 (2-5s) — preferred
2. **Direct Ollama `/api/embeddings`** — fallback when dev server is down
3. **TurboQuant** — chat-only, never embeddings unless restarted with `--embeddings` (which OOMs with current `ctk/ctv q8_0` config on 8GB GPU)

**Why TurboQuant chat config wins on RTX 3060 Ti (8GB)**: gemma4-rotorquant:latest + q8_0 KV uses ~5.8GB VRAM; tensorrt_bridge.node shares the remaining ~2.3GB for autoencoder/attention compute. Adding `--embeddings` would OOM or force a separate server instance.

### Why autoencoder is bypassed for attention scoring

Random Xavier-initialized weights produce flat tanh outputs at 64-dim — every vector saturates near boundaries, attention scores cluster at ~1.0 (Δ < 0.01). Direct 768-dim attention preserves embeddinggemma's semantic structure. The 64-dim autoencoder output is still cached at `gpu:karpathy:encoded` for **future MLA-style consumers** (DeepSeek-MLA path) once trained autoencoder weights become available.

`encodeProbe` and `attentionVsRiskProbe` are kept in the script (marked `@reserved` JSDoc) — don't delete on lint cleanup.

### Auto-fire policy

Wired into the heavy lane of `scripts/startup/ace-incremental-startup.mjs` via `config/startup-ace-policy.json`:
- Heavy lane fires only when GPU is warm (TurboQuant :8090 OR Ollama :11434 health probe passes)
- 24h cooldown via `ace:startup:heavy_last_run`
- Sequence: `graphify:authority → graphify:gds → graphify:cluster-summaries → graphify:bow-tiles → topology:validate → karpathy:gpu → audit:full-pipeline`
- Allowlist also permits `karpathy:gpu:dirty` and `karpathy:gpu:dry` on every folder open (incremental lane)

### Verification

```bash
# Sample scores
docker exec legal-ai-redis redis-cli HGET gpu:karpathy:scores 'src/lib/server/db/client.ts'
# → {"pr":7.06,"attn":0.999,"authority":0.555,"blend":3.291}

# 64-dim memory path for a file
docker exec legal-ai-redis redis-cli HGET gpu:karpathy:encoded 'src/lib/server/db/client.ts'

# Run metadata
docker exec legal-ai-redis redis-cli HGETALL gpu:karpathy:summary
```

---

## Route Test Pairing (G16 — May 4, 2026)

Closes the test-coverage visibility gap: every `+server.ts` without a paired test gets a placeholder stub written to `tests/routes/auto/` (already in vitest include glob).

- Generator: `scripts/generate-route-test-stubs.mjs` (NOT `scripts/tests/...` — duplicate removed)
- npm: `audit:test-stubs` / `audit:test-stubs:dry`
- Filter: `--mutating-only` targets ~355 high-risk POST/PUT/PATCH/DELETE routes
- Stub format: G26 pattern (`@vitest-environment node` + `vi.hoisted` + lazy `beforeEach` import + `it.todo()` for the 3 unimplemented baseline cases + 1 real `401-unauth` assertion)

**Important**: this G16 is *route test pairing*, distinct from the existing G16 audit gate (worker thread coupling) defined earlier in this file. Same name, different scope — don't confuse them in commit messages.

---

## SOM Topology on Neo4j (May 4, 2026)

`directory-summarizer.ts` now persists SOM coords as `HAS_DIRECTORY_SUMMARY` edge properties AND mirrors them on the `DirectorySummary` node:

```cypher
MATCH (c:GPUCluster)-[r:HAS_DIRECTORY_SUMMARY]->(d:DirectorySummary)
WHERE r.somBmuRow = $row AND r.somBmuCol = $col
RETURN d.dir, r.somCluster
```

Closes the audit gap "SOM coords stored in Qdrant but no `HAS_SOM_POSITION` edges in Neo4j; ACE topological boosting underutilized 4D structure". ACE Cypher queries can now filter directory summaries by SOM grid neighborhood.

Coords flow: `DirAuditEntry.somBmuRow/Col/Cluster` → `ingestDirectorySummaries()` → `writeNeo4jEdges()` → SET on both edge `r.*` and node `d.*`.

---

## Bounded Output for VS Code Chat (May 4, 2026)

Prevents `RangeError: Invalid string length` when running long-running audit/agent tasks that emit multi-MB markdown.

Helper: `sveltekit-frontend/scripts/lib/bounded-output.mjs` — `writeBoundedOutput({label, text, root, maxChars, silent})` and `writeSummary({label, summaryLines, fullText})`. Default `MAX_STDOUT_CHARS=12_000`, env-overridable.

Scripts with `--quiet` / `--summary-only` flags:
- `agentic-batch-fix.mjs` (parallel hotspot fix planner)
- `generate-codebase-directory-map.mjs`
- `tests/deep-directory-audit.mjs`

VS Code task pattern: `mkdir -p logs/task-output && node X.mjs --quiet > logs/task-output/X-latest.log 2>&1 && tail -40 logs/task-output/X-latest.log`. `.gitignore` excludes `logs/task-output/` and `logs/*.log`.

NPM scripts: `agent:fix:batch:{quiet,summary}`, `audit:dirs:{quiet,summary}`, `audit:dirs:map:{quiet,summary}`.

---

## Key Lessons (Proven Patterns)

- **ioredis cold-start in startup scripts**: `legal-ai-redis` Docker container may start *after* folderOpen pipelines fire. Default ioredis behavior reconnects forever and spams unhandled `error` events. Required client options for ANY standalone Node script under `scripts/startup/`, `scripts/index-*`, `scripts/seed-*`: `lazyConnect:true`, `maxRetriesPerRequest:1`, `enableOfflineQueue:false`, `retryStrategy:()=>null`, attach `redis.on('error',()=>{})`, then `await redis.connect()` BEFORE `await redis.ping()` (offlineQueue:false makes ping fail with "Stream isn't writeable" otherwise), and `redis.disconnect()` on failure. Verified in `scripts/index-codebase-fast.mjs` and `scripts/startup/ace-incremental-startup.mjs` (2026-05-08). Do NOT use this pattern in long-running server code — there `getRedis()` from `src/lib/server/redis.ts` is canonical.
- **$derived vs $derived.by**: `$derived(() => {...})` returns a function. Use `$derived.by(() => {...})` for complex computations
- **TS imports in SvelteKit**: Use `.js` extensions not `.ts` (bundler resolves `.js` → `.ts`)
- **bits-ui Tabs SSR**: `Record<string, any>` cast passes svelte-check but causes SSR 500. Use native `$state`-based tabs
- **CouchDB client**: `put(db, docId, doc)` = 3 args; `post(db, doc)` = 2 args; no `find` method — use `allDocs` + filter
- **Qdrant filter**: `match: { value: someVar }` not `match: { value, someVar }` — shorthand fails when var name != `value`
- **ioredis v5 types**: DO NOT add `declare module 'ioredis'` augmentations — they shadow bundled types
- **amqplib**: Named/namespace imports fail with `moduleResolution: "bundler"`. Use local interfaces + dynamic `await import('amqplib')`
- **Icons**: `@lucide/svelte` REMOVED (Session 93r14). Use `import Icon from '$lib/components/ui/Icon.svelte'` + `<Icon name="kebab-name" />`. UnoCSS `i-lucide-*` CSS classes, SSR-safe. Dynamic names need safelist in `unocss.config.ts`
- **bits-ui Dialog SSR TDZ**: bits-ui v2.16.2 Dialog uses `let props = $props()` which triggers TDZ in Svelte 5.46.0 SSR. Routes rendering Dialog at SSR time need `export const ssr = false`
- **Svelte 5 `{@const}` placement**: Must be direct child of `{#if}`/`{:else if}`/`{#each}` blocks — NOT inside `<div>` or other HTML elements
- **Dev server startup**: Must use `npm run dev` (sets `DEV_BYPASS_AUTH=true` + env vars via `cross-env`), NOT `npx vite dev`
- **SvelteKit handleError**: Hides real errors behind generic message. Temporarily expose `error.message + error.stack` in return value to diagnose SSR 500s
- **Corrupted files <50 lines**: Need complete rewrites, not incremental fixes
- **IDE linter reverts**: Use Write tool (not Edit) for reliable file modifications
- **writable() → $state()**: In `.svelte` files: remove import, replace `$store` with `store`, `.set(v)` → `store = v`, `.update(fn)` → direct mutation
- **Store file naming**: Runes (`$state`/`$derived`) only work in `.svelte`/`.svelte.ts` — plain `.ts` files need `SimpleStore` class or plain TS patterns
- **Global $state SSR leak**: `.svelte.ts` singletons persist across SSR requests — use `event.locals` for per-request server state
- **XState v5 fromPromise**: `fromPromise(async (ctx: any) => { const input = ctx.input as T; })` — cast `ctx.input` internally, not in setup types
- **Drizzle citations schema**: `citations` table Drizzle schema matches actual DB (16/16 columns aligned). Use standard Drizzle queries, no `sql<T>` workaround needed
- **db client import**: `import { db } from '$lib/server/db/client'` — NO `.js` extension (despite general `.js` convention). `.js` breaks named export resolution for this file
- **SvelteKit error() in try/catch**: `throw error(404)` inside try/catch → caught → becomes 500. Move not-found checks OUTSIDE try/catch in API routes
- **Manual migrations**: When `drizzle-kit migrate` fails (pre-existing enums), use `drizzle/manual/*.sql` with `CREATE TABLE IF NOT EXISTS`
- **Drizzle GIN/HNSW indexes**: Drizzle cannot express `USING gin(col gin_trgm_ops)` or `USING hnsw(col vector_cosine_ops) WITH (m=16, ef_construction=64)`. Add these to a numbered `drizzle/0NNN_*.sql` manual SQL file alongside the Drizzle schema entry. The table definition still lists plain B-tree indexes for all other columns. Pattern: `schema-postgres.ts` defines table + B-tree indexes; migration SQL adds GIN trgm + GIN array + HNSW. See `drizzle/0013_research_summaries.sql`.
- **Cursor pagination (keyset)**: Use composite B-tree `(score DESC, id DESC)` + WHERE `(score, id) < ($cursor_score::real, $cursor_id::uuid)` — O(1) seek vs O(n) OFFSET scan. Encode cursor as `"{score}:{id}"`. Never use OFFSET for user-facing pagination.
- **pg_trgm DYM**: `CREATE EXTENSION IF NOT EXISTS pg_trgm` + `USING GIN (query gin_trgm_ops)` → `similarity(query, $input) > 0.25 ORDER BY sim DESC LIMIT N` — ~5ms on 100K rows. DYM top-100 paginated via LIMIT/OFFSET on the similarity subquery. Fuse.js handles instant client-side top-3-5 hits from the current page (no extra fetch).
- **Drizzle casing option**: `drizzle(pool, { casing: 'snake_case' })` for auto camelCase→snake_case (v0.34+, NOT currently enabled)
- **bits-ui v2 Svelte 5**: Use `child` snippet (not `asChild`), `ref` (not `el`), `forceMount` + snippet for transitions, `type="multiple"` (not `multiple={true}`)
- **Svelte 5 $props**: Don't mutate props — use callback props or `$bindable` rune. `$derived` tracks dependencies at runtime, not compile time
- **MANDATORY: Wiring audit before moving files**: NEVER move/archive files without checking ALL import consumers first. Use `grep -r 'from.*module-name'` across entire `src/`. Root layout (`+layout.svelte`) imports from `$lib/webgpu/` — would have broken every page if moved. The cartridge system (`ChatSession.svelte.ts` → `/api/cartridge/export` → `chr97-builder.ts` → `cartridge-tensor-bridge.ts`) was 70% wired but appeared phantom. Always check: (1) grep for `from.*$lib/module`, (2) check root layout, (3) check `+page.svelte` dynamic imports, (4) check barrel `index.ts` re-exports, (5) check API routes. Files in `deeds_labs/` are gitignored — permanent deletion if lost
- **Phantom vs wired detection**: A file re-exported by `index.ts` but never imported downstream IS dead. A file with phantom CHR-ROM97 comments but real LokiJS/IndexedDB/Fuse.js code is NOT dead. Check call sites, not just file names
- **Cartridge API endpoints**: `/api/cartridge/export` (POST, build+cache), `/api/cartridge/search` (POST, tensor similarity), `/api/cartridge/stats` (GET, Redis cache stats), `/api/cartridge/invalidate` (POST, evict cached cartridge)
- **Unified model (April 2026)**: `gemma4-rotorquant:latest` serves BOTH text and vision — eliminates VRAM swap on 8GB GPU. Stock `gemma4:e4b-it-q4_K_M` has NO legal fine-tuning
- **pgvector imports**: Use `import { vector } from 'drizzle-orm/pg-core'` (native), NOT `'pgvector/drizzle-orm'` (legacy experimental)
- **Docker VHDX**: Never auto-shrinks on Windows 10. After `docker rmi` / prune, must `wsl --shutdown` then `diskpart` → `compact vdisk`
- **ES2025 usable now**: `Promise.withResolvers()` (SSE streams), Iterator Helpers (`.map()/.filter()` on iterators), Set methods (`.union()/.intersection()`), `Object.groupBy()`
- **UnoCSS**: `presetUno()` soft-deprecated since v66.0.0 — `preset-wind3` (stable) or `preset-wind4` (Tailwind 4-aligned) recommended. No urgency to migrate
- **gRPC port collision**: Port 50055 claimed by both `chr97-agent-client` and `go-search-service` — one must be moved

---

## TypeScript 7 Native-Preview Lane (May 5, 2026)

Microsoft's Go-based TS 7.0 compiler (`tsgo`) now runs as a parallel audit lane. **Does NOT replace `tsc` / `svelte-check`** — keep both. Per Microsoft, the stable programmatic API isn't expected until 7.1.

**Install** (already in `package.json` devDependencies; `package-lock.json` is gitignored so re-run after pulling):
```bash
cd sveltekit-frontend && npm install
npx tsgo --version   # → Version 7.0.0-dev.20260421.2
```

**Scripts**:
- `typecheck:native` — `tsgo --noEmit` (~10× faster than tsc on full repo)
- `typecheck:native:pretty` — developer-friendly output
- `typecheck:native:nightly` — pulls `@typescript/native-preview@latest` at run
- `audit:tsgo` — `pretty=false` for CI parsing
- `audit:tsgo:json` — runs tsgo + writes JSONB report to `scratch/audits/tsgo-diagnostics.json`

**JSONB diagnostics importer** (`scripts/tsgo-diagnostics-to-jsonb.mjs`): output shape feeds directly into the AGENTS.md spine tables `metadata_envelopes(source_type='diagnostic')`, `code_relations(DIAGNOSTIC_IN_FILE)`, `ace_context_sources(source_kind='tsgo_diagnostic')`. Each diagnostic carries a stable_key (sha1 of file:line:col:code:msg) so re-runs are idempotent.

**Side-by-side rule**: `typescript` package stays installed for SvelteKit, eslint, typescript-eslint, and any compiler-API consumer. CI keeps using `svelte-check` until TS 7 stable lands.

Baseline run uncovered exactly 1 real error tsc/svelte-check missed (TS2345 in `sync-to-obsidian/+server.ts:51` — wrong arg order on `listWikiNotes`). After fix: `tsgo` reports 0 errors, 0 warnings repo-wide.

---

## AGENTS.md Relationship Spine (May 5, 2026)

Path-first NES-arch memory bank now has structural backing. Three Postgres tables tie every `AGENTS.md` to the directory graph + retrieval scoring + ACE source-of-truth audit.

**Tables** (`drizzle/manual/agents_md_relations.sql`):
- `agent_context_files` — parsed envelope per AGENTS.md (rules JSONB, tools JSONB, constraints JSONB, semantic_tags TEXT[], qdrant_tags TEXT[], content_hash for idempotent re-index, schema_version for shape evolution). GIN indexes on tags + rules JSONB path ops.
- `directory_context_bindings` — walk-up resolution map. binding_type ∈ {exact, nearest-parent, inherited, override}; depth, priority, confidence. Unique on (agent_context_key, directory_path, binding_type).
- `ace_context_sources` — audit trail. source_kind ∈ {agents_md, qdrant_chunk, wiki_note, code_llm_cache, prior_answer, graph_neighbor, fast_ast}. Powers `yorha.agentsMdFiles` transparency in OpenAI facade responses.

**Code** (`src/lib/server/agents-md/`):
- `schema.ts` — Zod `agentsMdEnvelopeSchema` + `AGENTS_MD_SCHEMA_VERSION` constant
- `parse-agents-md.ts` — pure function (no I/O). Lenient extraction: title (first H1), summary (first para after H1), rules (bullets under "Rules"/"Conventions"/"Standards" with inline `[tag,tag]` suffix + severity inferred from Critical/High/Note keywords), tools (bullets OR markdown table, allowed/forbidden + scope + reason), constraints (bullets under "Forbidden"/"Constraints"), tags (bullets under "Semantic Tags"/"Qdrant Tags"). Confidence rises with structure, floor 0.5. content_hash = sha256(normalised body).
- `resolve-directory-context.ts` — pure-function resolver: `candidateAgentsMdPaths(filePath)` walks UP nearest-first; `nearestAgentsMdForFile(path, knownSet)` matches direct path, `agents:<file>` prefix, OR `agents:dir:<dir>` shape (the live Redis key form); `bindingsForAgentsMd({key, path, dirs})` produces 1 exact (depth=0, priority=100) + N inherited (priority+10*depth, confidence decays 0.1/depth, floor 0.4)

**Tests**: `tests/agents-md-relations.spec.ts` — 7 tests covering parser structured/bare/table forms + resolver walk-up + binding generation.

---

## OpenAI-Compatible v1 Facade (May 5, 2026)

OpenWebUI / Continue / Cursor / Aider can now talk to the YorHA agent brain via standard OpenAI-shape requests. Routes the request through ACE/KAG/RAG context-assembler + code-llm-index PRIOR ANSWER cache + bifrostChat cascade before returning.

**Endpoints**:
- `POST /api/v1/chat/completions` — chat (stream:false v1; streaming follow-up)
- `GET  /api/v1/models` — model list for client dropdowns

**OpenWebUI wiring**:
```
Connections → Add Provider →
  Base URL: http://localhost:5173/api/v1
  API Key:  any-non-empty-string  (real auth via session cookie)
```

Available models: `yorha-legal`, `yorha-fast`, `gemma4-rotorquant:latest`, `gemma3-legal`, `gemma3:270m`. Friendly IDs map to internal Ollama tags via `resolveInternalModel()`.

**YorHA-only request extensions** (ignored by stock OpenAI clients):
- `file_path` — triggers nes-arch AGENTS.md preflight + same-dir rerank boost
- `case_id` — case-scoped RAG retrieval
- `raw: true` — skip ACE entirely (model-layer benchmarking; tries TurboQuant first then bifrostChat fallback)

**Response includes a `yorha` block alongside `choices`** — transparency about which caches and sources fed the answer:
```json
"yorha": {
  "aceUsed": true,
  "contextChunks": 7,
  "agentsMd": true,
  "codeLlmHit": true,
  "cacheHit": "prior-answer",   // or "agents-md" or "none"
  "durationMs": 1247
}
```

**Tests**: `tests/openai-facade.spec.ts` — 7 tests (message split, raw passthrough, cacheHit reporting, 401/400 contracts).

**Skipped for v1**:
- `stream: true` — explicit 400 with `code: "streaming_not_supported"`. Follow-up wires bifrostChat's existing SSE path.
- `tools` / `tool_choice` — accepted but ignored. Use `/api/ai/agent` for tool loops.

---

## Reconstruction 3-Track Architecture (May 8, 2026)

Three connected tracks for evidence → timeline → visual reconstruction:

**Track 1 — model layer per binary** (multiple llama-server.exe paths, switch via `LLAMA_SERVER_PATH`):
- `gemma4-rotorquant:latest` → stock `-ctk q8_0 -ctv q8_0` (head dim 256+, D=128 TurboQuant kernels crash). VLM + legal reasoning.
- `qwen2.5-7b-instruct` / `qwen3-7b` → candidate for `-ctk q8_0 -ctv turbo3` (head_dim=128, 28 Q-heads / 4 KV-heads — matches stock D=128 TurboQuant prebuilts). Long-context planning, JSON timeline extraction, ComfyUI workflow generation.

**Track 2 — ComfyUI image/keyframe generation**: HTTP API only (`POST /prompt` → `GET /history/{prompt_id}` → fetch outputs). Operator builds workflow in ComfyUI Desktop, exports `workflow_api.json`, app submits as POST payload. RabbitMQ queue `comfyui.render` + SSE stream `/api/comfyui/render/stream`. **Do NOT shell out to Python** — the Desktop "Export to Python" is a dev-only debugging convenience.

**Track 3 — 3D reconstruction lanes** (build in order, do NOT skip):
- Lane A — 2D legal timeline viewer (safest first)
- Lane B — ComfyUI still frame per `TimelineEvent`
- Lane C — Blender + Mixamo MP4 (uses existing `courtroom_models` table + `courtroom_anim_type` enum: idle/speaking/objection/walk/gesture/point/sit/stand/present_evidence/react_*/nod/shake_head). Queue: `blender.render`.
- Lane D — WebGPU low-poly viewer (Threlte). Actors follow paths, Mixamo clips, evidence labels, timeline scrubber, "Demonstrative reconstruction" overlay.
- Lane E — Gaussian splatting **environments only** (pre-scanned courtroom/street/house). Defer until stable scene library exists. NOT for actors, NOT for text-to-3D, NOT for claimed-real spaces.

**Canonical TimelineEvent schema:** `{ id, time, location, who[], what, whyHypothesis?, how, evidenceIds[], confidence: 'high'|'medium'|'low', disputed: boolean, reconstructionNotes[] }`.

**Legal product rule:** every visual output must carry `"Demonstrative reconstruction — not original footage"` overlay + per-event confidence badge + evidence ID citations + disputed-fact highlights + gaps for unknowns. Hyper-realistic uncertainty-free reconstructions are indefensible. Mixamo+Blender frames trace to logged action IDs; SVD/AnimateDiff/CogVideoX/Wan invent pixels — do NOT use for evidence.

**Load-bearing principle:** LLM is planner, compiler is renderer. Gemma4/Qwen emit Zod-validated `SceneIntent` JSON only. A deterministic TypeScript scene compiler turns intent → Blender script / Three.js scene. Do NOT let the LLM write Three.js/Blender Python directly — silent failures (empty scene, wrong scale, hallucinated objects, non-repeatable). Same input → same render is load-bearing for legal audit.

**Repo audit (2026-05-08): ~70% of the renderer already exists.** `src/lib/courtroom/` is 1556 LoC including a CRT/N64 post-process shader (PS1 aesthetic foundation), 1070-line scene state machine, 276-line timeline engine. `/demos/crime-reconstruction/+page.svelte` is 690 LoC with who/what/why/how form + WebGPU scene wired. `courtroom_models` + `courtroom_animations` Drizzle tables exist. 8 detective-mode UI components exist. Missing: SceneIntent Zod schema, deterministic compiler, TRELLIS evidence-to-3D pipeline, Mixamo asset registry, RabbitMQ `scene.render`/`evidence.render` queues, mini-modal viewer, ZIP export bundle.

**Hard gates** (do not skip):
1. **Stylization IS the admissibility hedge** — PS1/N64 aesthetic on environments is non-negotiable. Going photoreal on non-evidence renders pushes the product into Daubert-hearing territory. Keep backgrounds pixelated.
2. **Evidence is near-exact** — TRELLIS-derived GLBs preserve original photo silhouette/texture; do NOT apply PS1 vertex jitter to evidence meshes. Visual contrast (sharp evidence + blocky environment) signals "reconstructed scene, real evidence."
3. **Chain of custody on every 3D asset** — extend `evidenceAuditLog` to `evidence_3d_assets`, SHA-256 every GLB at write, log `metadata.trellis_model = 'TRELLIS-image-large@<digest>'`.
4. **No GPU/3D work on Node main thread** — TRELLIS + Blender = Python sidecars on RabbitMQ. SvelteKit produces messages, never blocks on render. Queues: `scene.render` (1hr), `evidence.render` (1hr), `scene.export` (5min).
5. **Export bundles are SHA-256-verifiable** — `manifest.txt` in the ZIP lets a reviewer prove the offline bundle matches what the case file exported. Self-contained Chrome-offline `index.html` + Three.js single-file ESM (~200KB) means air-gapped review laptops work.

**Existing scaffolding** (don't rebuild): `src/lib/courtroom/{courtroom-scene,timeline-engine,crt-postprocess,courtroom-types}.svelte.ts/.ts`, `courtroom_models` + `courtroom_animations` Drizzle tables, `/api/courtroom/models`, `/api/cases/[id]/timeline`, `/api/persons-of-interest/[id]/timeline`, 8 `src/lib/components/detective/*` + `*Detective*` components, `LocalImageGenerator.svelte` with `comfyui` provider.

**Companion lane** (different tooling): `next_steps/active/2026-05-08_3dgs-forensic-roadmap.md` — photogrammetric 3DGS from real crime-scene photos (evidence-AS-environment). The 3-track lane above is the reverse: prompt-as-environment + evidence-as-objects.

See `memory/reconstruction-3-tracks.md` for full SceneIntent schema, RabbitMQ queue table, license-safe Mixamo action allowlist, TRELLIS Replicate fallback policy, and the 9-phase build order.

---

## Reference Docs

- `sveltekit-frontend/docs/architecture/trace-runtime-split.md` — TRACE/Karpathy runtime boundary rule (Gemma4 → MCP only, never raw infra)
- `sveltekit-frontend/docs/architecture/trace-kag-web-development-guide.md` — 23-section practical guide (route contract, retrieval lane decision tree, Admin Copilot safety, browser context lane, RabbitMQ/sidecar rules, production safety gates)
- `sveltekit-frontend/docs/architecture/hermes-agent-windows-gemma4-guide.md` — Hermes Agent + WSL2 + local Gemma4 integration (allowlist/blocklist of TRACE tools, port reconciliation, TurboQuant Gemma4 binary caveat)
- `sveltekit-frontend/memory/architecture/mcp-mount-smoke-2026-05-09.md` — post-restart MCP mount + smoke verification log (live `tools/list`: 42 tools after the per-request transport fix; 5 registries silent-failing — adminTools/skillTools/codebaseTools/bifrostTools/topologyMgmtTools; G33/G34/G37 green; G38 referenced in trace-runtime-split rule #8; Phase D hooks deferred)
- `memory/reconstruction-3-tracks.md` — model/image/3D pipeline architecture, build order, Qwen TurboQuant fit, ComfyUI HTTP wiring, Gaussian-splat scope
- `memory/drizzle-schema-reference.md` — 70+ tables, 14 enums, type patterns, route map
- `memory/architecture-reference.md` — DB tiers, JSONB, caching strategy, vector search
- `memory/docker-cuda-setup.md` — Docker, CUDA, GPU acceleration, FlashAttention
- `memory/corruption-patterns.md` — All 8 corruption patterns + detection commands
- `memory/superforms-reference.md` — Superforms v2 full API patterns
- `memory/ide-linter-workarounds.md` — VS Code linter revert strategies
- `memory/session-history.md` — Full session-by-session changelog (sessions 1-35)
- `memory/svelte5-migration-guide.md` — Store → runes patterns, do's/don'ts, XState v5
- `memory/docker-sveltekit.md` — Docker SSR deployment, Dockerfile, docker-compose
- `tests/e2e/*.spec.ts` — Playwright visual regression / 500-error tester (uses `page.screenshot()`)

## OpenCode / Memory Authority

- `MASTER-FEATURE-TODO-2026-05-20.md` is the master phase plan for lane completion and backlog tracking.
- `docs/agents-md-howto.md` is the directory-scoped agent guide; use it as the source of truth for per-folder instructions.
- OpenCode startup should flow through `scripts/opencode/bootstrap-workspace.mjs` and the startup artifacts it writes:
  - `.opencode/startup-context.json`
  - `.tmp/claude-mem-ensure.json`
  - `reports/claude-mem-startup.md`
- Tie OpenCode memory to Engram through:
  - `sveltekit-frontend/src/lib/server/memory/engram-memory.ts`
  - `sveltekit-frontend/src/lib/server/ai/engram-registry.ts`
  - `sveltekit-frontend/src/lib/gpu/nes-memory-architecture.ts`
  - `scripts/atlas/sync-engram-memory.mjs`
  - `scripts/atlas/engram-plugin-adapter.mjs`
- Use the repo-local memory bridge scripts rather than hand-stuffing prompt context:
  - `scripts/opencode/post-memory.mjs`
  - `scripts/opencode/monitor-claude-mem-poll.mjs`
  - `scripts/memory/import-claude-mem-observations.mjs`
- Important caveat: the local `claude-mem` plugin cache patch is cache-only. If the plugin is reinstalled or upgraded, recheck the local bundle for the `zod/v3` compatibility fix before trusting the hooks.

Sources:
- [Bits UI Docs](https://bits-ui.com/) | [Migration Guide](https://bits-ui.com/docs/migration-guide)
- [Svelte 5 Runes](https://svelte.dev/blog/runes) | [Migration Guide](https://svelte.dev/docs/svelte/v5-migration-guide)
- [UnoCSS Svelte Scoped](https://unocss.dev/integrations/svelte-scoped) | [SvelteKit Setup](https://frontavo.com/blog/setting-up-unocss-with-sveltekit)
- [Superforms Docs](https://superforms.rocks/) | [File Uploads](https://superforms.rocks/concepts/files)
