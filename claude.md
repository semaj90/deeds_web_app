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

## Directory Audit Protocol (MANDATORY before moving/archiving)

**Root cause**: Previous audits moved `$lib/webgpu/` as "dead" — but root layout (`+layout.svelte`) imports `$lib/webgpu/webgpu-init` + `$lib/webgpu/webgpu-cpu-fallback` on **every page load**. Moving it would have broken the entire app.

**Automated script**: `bash sveltekit-frontend/scripts/audit/orphan-detector.sh [dir]` — single-pass rg+awk, scans 545 components in ~10s. Results: 492 wired | 50 orphans | 3 edge cases (April 7, 2026).

**MSYS/Git Bash glob bug**: Never use `rg $GLOB_VAR` with `--glob *.ts` — shell expands `*`. Use bash arrays: `RG_GLOB=(--glob '*.ts')` → `"${RG_GLOB[@]}"`.

**BEFORE moving ANY directory to `deeds_labs/`, run this 10-layer checklist:**

```bash
MODULE="ComponentName"

# ── PRIMARY (must check ALL three) ──

# L1: Static ESM imports
rg "from.*$MODULE" src/ --type ts --type svelte

# L2: Dynamic ESM imports (517 files use await import(); mcp/server.ts has 12+)
rg "import\(.*$MODULE" src/ --type ts --type svelte

# L3: CJS require (rare: proto, OCR, astVectorizer)
rg "require\(.*$MODULE" src/ --type ts

# ── HIDDEN DEPENDENCY LAYERS (miss these = break production) ──

# L4: Re-export barrels (57 files) — module may be re-exported via index.ts
# A barrel importing MODULE means all barrel consumers depend on it transitively
rg "export.*from.*$MODULE" src/lib/ --type ts
rg "$MODULE" src/lib/components/*/index.ts src/lib/services/*/index.ts

# L5: SvelteKit load→data binding (88 load fns, 677 data refs)
# +page.server.ts exports props consumed by +page.svelte via $props().data
# Renaming/removing a load property breaks the page silently
# Check: is MODULE a +page.server.ts or +layout.server.ts? → consumers are implicit

# L6: fetch('/api/...') wiring (193 files, 4865 refs)
# Server routes have 0 file imports but ARE wired via client-side fetch()
rg "fetch.*$MODULE" src/ --type ts --type svelte

# ── SECONDARY (check for edge cases) ──

# L7: Component registries/maps (50 files) — string-keyed lookups
rg "componentMap\|registry\|loadComponent" src/ | grep -i "$MODULE"

# L8: Event coupling (2805 occurrences across .svelte files)
# AnalysisPanel has 0 static imports but IS wired via yorha:open-analysis event
rg "CustomEvent.*$MODULE\|addEventListener.*$MODULE\|dispatchEvent.*$MODULE" src/
rg "yorha:" src/  # known event namespace

# L9: .svelte.ts store consumers (37 store files, each has 10+ consumers)
# Moving a store breaks all components that import it
rg "from.*$MODULE" src/ --glob "*.svelte" --glob "*.svelte.ts"
```

Also check:
- Is it a SvelteKit route file (`+page.svelte`, `+server.ts`)? → NOT an orphan
- Config references (`unocss.config.ts` safelist, `svelte.config.js`, `vite.config.ts`)
- `@vite-ignore` variable imports (4 files: drizzle.ts, granite-docling.ts, fastjson.ts, CanvasBoard.svelte)

**Lesson learned (March 22, 2026):** `docling.ts` was incorrectly archived because static grep found 0 consumers. Dynamic grep found 3 active `await import('../lib/server/docling.js')` calls in `mcp/server.ts`, `api/ace/ingest`, and `api/evidence/upload`. Always check both static AND dynamic imports.

**Key directories/files that LOOK dead but ARE wired:**
- `$lib/webgpu/` — root layout WebGPU init (every page)
- `$lib/gpu/` — active compute pipeline (3 WGSL shaders, search reranker)
- `$lib/ai/onnx/` — client-side ONNX inference (WebGPU → WASM → CPU)
- `simd-bridge/cpp/` — LibTorch/CUDA N-API addon (3 GPU functions verified)
- `components/analysis/AnalysisPanel.svelte` — dynamic import in +layout.svelte + `yorha:open-analysis` event (L4+L9)
- `components/KeyboardShortcutsPanel.svelte` — dynamic-only imports in layout (L2, 0 static)
- `chr97-builder.ts` / `cartridge-tensor-bridge.ts` — active tensor caching pipeline (4 API endpoints)
- `lib/server/db/drizzle.ts` cache import — uses `@vite-ignore` variable import (L4)

**`deeds_labs/` is gitignored** — moving files there is effectively permanent deletion. Measure twice, cut once.

---

## Component Wiring Audit Methodology (8-Gate Test)

When auditing orphan components, apply this 8-gate test to decide **wire**, **rewrite**, or **archive**:

| Gate | Question | Pass | Fail |
|------|----------|------|------|
| G0: Static imports? | `grep -r "from.*MODULE" src/` finds consumers? | Continue | Continue to G0.5 |
| G0.5: Dynamic imports? | `grep -r "import(.*MODULE" src/` finds `await import()` consumers? | → HAS CONSUMERS (do not archive) | Continue to G1 |
| G1: Functional? | Clean code, compiles, Svelte 5 runes? | Continue | → ARCHIVE (corrupted) |
| G2: Feature gap? | Unique functionality no other component covers? | Continue | → ARCHIVE (redundant) |
| G3: Rewrite potential? | If broken/Svelte 4, is the feature valuable enough to rewrite? | → REWRITE candidate | Continue to G4 |
| G4: Integration point? | Natural route or layout that logically hosts it? | Continue | → ARCHIVE (homeless) |
| G5: Low effort? | Wire in < 30 min (import + render, not deep refactor)? | → WIRE | → DEFER to backlog |
| G6: Fully wired? | End-to-end: import → render → trigger path → API routes → props → data flow? | FULLY WIRED | → SHALLOW (incomplete) |

**Gate 0.5 — Dynamic Import Detection** (CRITICAL — added March 22, 2026):

115 files in `src/` use `await import()`. Static `grep -r "from.*MODULE"` misses these entirely.
Key hotspots: `mcp/server.ts` (12 dynamic imports), `hooks.server.ts` (3), `queue-worker.ts` (1), API routes (~80+).

**Before declaring any file "0 consumers":**
```bash
grep -r "from.*MODULE" src/           # static imports
grep -r "import(.*MODULE" src/        # dynamic imports (MUST CHECK)
grep -r "require(.*MODULE" src/       # CJS require (rare)
```

**Gate 6 — Deep Wiring Verification** (post-wire check):
After wiring a component, verify the full chain is connected:
1. **Import exists** — `grep -r "ComponentName" src/` shows the import (static OR dynamic)
2. **Render exists** — The importing file actually renders it (`<ComponentName` or `{@render`)
3. **Trigger reachable** — Rendered UI, `onMount`, form submit, load function, or machine transition actually calls the handler/fetch; no dead helper function or permanently-false branch
4. **API routes exist** — If component calls `fetch('/api/...')`, verify `+server.ts` exists
5. **Props connected** — Callback props wired to real handlers, NOT `() => {}` no-ops
6. **Data flows** — Component receives real data from `$props()`, not placeholders

**Shallow wiring indicators** (G6 fail):
- `onCallback={() => {}}` or `onCallback={() => console.log()}` — no-op handlers
- Component imported but never rendered in template
- Handler or `fetch('/api/...')` exists but no rendered control/state transition can trigger it
- Trigger only exists behind a branch that never becomes true with current state/data
- Component rendered but its API endpoints don't exist
- Dynamic import loaded but conditional render never triggers
- Props bound to `$state` that's declared but never set

**Automated via slash commands:**
- `/audit-components [dir]` — Scan for orphans, apply 6-gate test, report + execute
- `/prune-codebase [dir]` — Full garden audit across `src/lib/` — dead ratios, cross-cutting checks, AI-driven analysis, health report
- `/wire-modules [dir]` — Find and fix broken imports, missing API routes, stale types

**Rewrite indicators** (G3 pass):
- Clean logic but Svelte 4 syntax (`export let`, `$:`, `on:click`) — mechanical migration
- Feature exists nowhere else in codebase
- Previously imported (check `git log` for removed imports)

**Archive indicators** (any gate fail):
- Corrupted syntax, < 10 lines, garbled code
- Superseded by `$lib/services/*.ts` (e.g., `speak.ts` → `tts.ts`)
- Storybook `.stories.ts` when Storybook is inactive
- Test files for deleted/archived code

**Examples from Session 100+:**
- `KeyboardShortcutsPanel.svelte` → WIRE + G6 PASS: All 6 gates pass — clean Svelte 5, unique feature, `?` key in layout (line 58-63), `bind:open` (line 102), fully wired end-to-end
- `speak.ts` → ARCHIVE: Fails G2 — superseded by `$lib/services/tts.ts` (160-line TTSService)
- `AIChat.stories.ts` → ARCHIVE: Fails G4 — Storybook not active, references non-existent component

**Process:**
1. `grep -r "ComponentName" src/routes/ src/lib/` — check static import count
2. `grep -r "import(.*ComponentName" src/` — check dynamic import count
3. If 0 static AND 0 dynamic imports → orphan candidate
4. Read the file — assess code quality
5. Apply gates G1→G5 in order (stop at first fail)
6. Execute action: WIRE / REWRITE / ARCHIVE / DEFER
7. After wiring, apply G6 to verify end-to-end connection

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
