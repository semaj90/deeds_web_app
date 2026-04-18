# Legal AI Platform — Claude Project Instructions

## Last Updated: March 15, 2026 (GPU Audit Session)
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
- **Database**: PostgreSQL 16 + Drizzle ORM 0.44 + pgvector
- **Vector DB**: Qdrant (GPU-accelerated)
- **AI Models**: Ollama (`embeddinggemma:latest` + `gemma4-legal:latest`)
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
  └─ Legal/complex query → SERVER Ollama
      ├─ LLM: gemma4-legal:latest
      ├─ Embeddings: embeddinggemma:latest (768-dim)
      └─ SSE stream via /api/sse/chat
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
1. MinIO upload + SHA-256 hash + PostgreSQL record
2. Text extraction: pdf-parse → OCR fallback (Tesseract CLI → tesseract.js)
3. Structure-aware chunking via legal-chunker.ts (ARTICLE/SECTION/§)
4. Embedding: gRPC → embeddinggemma → nomic-embed-text fallback
5. Dual storage: pgvector `evidence_vectors` + Qdrant `evidence_items`
6. Entity extraction (EMAIL, PHONE, DATE, CITATION, STATUTE, MONEY)
7. Forensic pattern detection (SSN, CC, contact density, legal keywords)
8. Summarization via Ollama gemma4-legal (non-fatal)

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
  'gemma4-legal',
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

# G13: Docker service ports (5432 PG, 6379 Redis, 6333 Qdrant, 9000 MinIO, 5672 RabbitMQ)
rg "5432\|6379\|6333\|9000\|5672\|50051\|4222\|8095" src/lib/server/ --type ts -l

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

**Expected performance baselines** (from your RTX 3060 Ti setup):
| Metric | Value | Acceptable Range |
|--------|-------|------------------|
| Redis GET | 5ms | <10ms |
| Bifrost L2 Hit | 2-5s | <10s |
| Ollama GPU | 25s | <60s |
| Cache Speedup | 6,542× (vs CPU) | >1,000× |

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

## Drizzle ORM 0.44 (PostgreSQL 16 + pgvector)

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

```bash
# Quick test (7 core routes) — requires dev server running
node scripts/tests/test-screenshots.mjs

# All app routes (23 routes)
node scripts/tests/test-screenshots.mjs --all

# Single route
node scripts/tests/test-screenshots.mjs --route /evidence

# Custom port
node scripts/tests/test-screenshots.mjs --port 3000
```

Outputs timestamped screenshots + JSON report to `scripts/tests/screenshots/`. Latest run always copied to `scripts/tests/screenshots/latest/`.

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

## Key Lessons (Proven Patterns)

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
- **Drizzle casing option**: `drizzle(pool, { casing: 'snake_case' })` for auto camelCase→snake_case (v0.34+, NOT currently enabled)
- **bits-ui v2 Svelte 5**: Use `child` snippet (not `asChild`), `ref` (not `el`), `forceMount` + snippet for transitions, `type="multiple"` (not `multiple={true}`)
- **Svelte 5 $props**: Don't mutate props — use callback props or `$bindable` rune. `$derived` tracks dependencies at runtime, not compile time
- **MANDATORY: Wiring audit before moving files**: NEVER move/archive files without checking ALL import consumers first. Use `grep -r 'from.*module-name'` across entire `src/`. Root layout (`+layout.svelte`) imports from `$lib/webgpu/` — would have broken every page if moved. The cartridge system (`ChatSession.svelte.ts` → `/api/cartridge/export` → `chr97-builder.ts` → `cartridge-tensor-bridge.ts`) was 70% wired but appeared phantom. Always check: (1) grep for `from.*$lib/module`, (2) check root layout, (3) check `+page.svelte` dynamic imports, (4) check barrel `index.ts` re-exports, (5) check API routes. Files in `deeds_labs/` are gitignored — permanent deletion if lost
- **Phantom vs wired detection**: A file re-exported by `index.ts` but never imported downstream IS dead. A file with phantom CHR-ROM97 comments but real LokiJS/IndexedDB/Fuse.js code is NOT dead. Check call sites, not just file names
- **Cartridge API endpoints**: `/api/cartridge/export` (POST, build+cache), `/api/cartridge/search` (POST, tensor similarity), `/api/cartridge/stats` (GET, Redis cache stats), `/api/cartridge/invalidate` (POST, evict cached cartridge)

---

## Reference Docs

- `memory/drizzle-schema-reference.md` — 70+ tables, 14 enums, type patterns, route map
- `memory/architecture-reference.md` — DB tiers, JSONB, caching strategy, vector search
- `memory/docker-cuda-setup.md` — Docker, CUDA, GPU acceleration, FlashAttention
- `memory/corruption-patterns.md` — All 8 corruption patterns + detection commands
- `memory/superforms-reference.md` — Superforms v2 full API patterns
- `memory/ide-linter-workarounds.md` — VS Code linter revert strategies
- `memory/session-history.md` — Full session-by-session changelog (sessions 1-35)
- `memory/svelte5-migration-guide.md` — Store → runes patterns, do's/don'ts, XState v5
- `memory/docker-sveltekit.md` — Docker SSR deployment, Dockerfile, docker-compose
- `scripts/tests/test-screenshots.mjs` — Playwright visual regression / 500-error tester

Sources:
- [Bits UI Docs](https://bits-ui.com/) | [Migration Guide](https://bits-ui.com/docs/migration-guide)
- [Svelte 5 Runes](https://svelte.dev/blog/runes) | [Migration Guide](https://svelte.dev/docs/svelte/v5-migration-guide)
- [UnoCSS Svelte Scoped](https://unocss.dev/integrations/svelte-scoped) | [SvelteKit Setup](https://frontavo.com/blog/setting-up-unocss-with-sveltekit)
- [Superforms Docs](https://superforms.rocks/) | [File Uploads](https://superforms.rocks/concepts/files)
