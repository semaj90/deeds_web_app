# Citation System Architecture

## Stack Summary

**Frontend**: Svelte 5 (runes) + SvelteKit 2 + bits-ui v2.16.2 + UnoCSS
**Backend**: PostgreSQL + Drizzle ORM 0.44 + REST API
**Caching**: LokiJS (L0) + IndexedDB (L1) + Redis (L2)
**Search**: Fuse.js (client fuzzy) + Qdrant (server vector)
**Rendering**: SSR with client-side hydration (hybrid)

---

## SSR vs Client-Side Strategy

### ✅ SSR-Enabled Routes (Default)
- `/citations` — List page with SEO-friendly citation content
- `/evidence` — Evidence list and modals (with `ssr=false` fallback for Dialog)
- `/statute/[id]` — Statute detail pages

**Benefits**: Fast initial load, SEO, JavaScript-optional functionality

### ❌ SSR-Disabled Routes (`export const ssr = false`)
- `/command-center` — Uses bits-ui ScrollArea (TDZ bug)
- `/evidence-library` — Uses bits-ui Dialog (TDZ bug)
- Routes with WebGPU/IndexedDB at module scope

**Reason**: bits-ui v2.16.2 uses `let props = $props()` which triggers Temporal Dead Zone error in Svelte 5.46.0 SSR

---

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ BROWSER (SvelteKit 2 + Svelte 5)                               │
│                                                                  │
│  ┌──────────────┐                                               │
│  │ Citation UI  │  (UnoCSS + bits-ui v2 + Svelte 5 runes)      │
│  └──────┬───────┘                                               │
│         │                                                        │
│         ├─► L0: LokiJS (in-memory, 5min TTL)                   │
│         │   • Session cache                                     │
│         │   • Hot-path reads (~0ms)                            │
│         │                                                        │
│         ├─► L1: IndexedDB (persistent, 7-day TTL)              │
│         │   • Offline storage                                   │
│         │   • Fuse.js fuzzy search                             │
│         │   • Sync queue                                        │
│         │                                                        │
│         └─► L2: REST API (/api/citations)                      │
│             • POST /api/citations (create)                      │
│             • GET /api/citations?caseId=...                     │
│             • POST /api/citations/export/json                   │
│             • POST /api/citations/collections                   │
└─────────────────────────────────────────────────────────────────┘
                           │
                           │ HTTP/JSON
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ SERVER (SvelteKit 2 SSR + API)                                  │
│                                                                  │
│  ┌──────────────┐                                               │
│  │ +server.ts   │  (RequestHandler with locals.user auth)      │
│  └──────┬───────┘                                               │
│         │                                                        │
│         ├─► Redis (L2 cache, cross-request)                    │
│         │   • 5min TTL                                          │
│         │   • Shared across users                               │
│         │                                                        │
│         └─► PostgreSQL (Drizzle ORM)                           │
│             • citations table (id, citationText, caseId)        │
│             • statutes table (section, title, content)          │
│             • citation_collections (future)                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

### 1. **CitationHighlighter** (Svelte 5 component)

```svelte
<!-- SSR-safe, no Dialog/ScrollArea -->
<script lang="ts">
  let { content, citations, onsave, onremove }: Props = $props();
  let selectedText = $state('');
  let showTooltip = $state(false);

  function handleTextSelection() { /* ... */ }
  async function summarizeSelection() {
    const res = await fetch('/api/summarize', {
      method: 'POST',
      body: JSON.stringify({ text: selectedText })
    });
    const data = await res.json();
    summaryResult = data;
  }
</script>

<div class="citation-highlighter" onmouseup={handleTextSelection}>
  {@html renderContent()}
</div>
```

**UnoCSS Styles**: `bg-yellow-200`, `p-2`, `rounded`, `hover:bg-yellow-300`

**Usage**:
- EvidenceModal (evidence description highlighting)
- StatuteDetail (statute full text highlighting)
- Chat responses (AI message highlighting)

---

### 2. **Collections API** (REST endpoints)

**Created Endpoints** (Session 93r28g):

| Method | Endpoint | SSR | Auth | Body |
|--------|----------|-----|------|------|
| GET | `/api/citations/collections` | ✅ | ✅ | - |
| POST | `/api/citations/collections` | ✅ | ✅ | `{ name, color, isPublic }` |
| GET | `/api/citations/collections/[id]` | ✅ | ✅ | - |
| PATCH | `/api/citations/collections/[id]` | ✅ | ✅ | `{ name?, color? }` |
| DELETE | `/api/citations/collections/[id]` | ✅ | ✅ | - |
| POST | `/api/citations/collections/[id]/citations` | ✅ | ✅ | `{ citationId }` |
| DELETE | `/api/citations/collections/[id]/citations` | ✅ | ✅ | `{ citationId }` |
| POST | `/api/citations/export/json` | ✅ | ✅ | `{ citationIds?, caseId? }` |
| POST | `/api/citations/export/pdf` | ✅ | ✅ | `{ citationIds?, caseId? }` |

**Current Implementation**: In-memory Map (demo)
**Production Path**: Drizzle schema + PostgreSQL tables

---

### 3. **Async Browser Pull Pattern**

```typescript
// citation-cache.ts — Async IndexedDB read
export const citationCache = {
  async getCitation(id: string): Promise<Citation | null> {
    // L0: Sync LokiJS read (0ms)
    const lokiEntry = citationStore.findOne({ id });
    if (lokiEntry) return lokiEntry.citation;

    // L1: Async IndexedDB read (1-5ms)
    const db = await getDB();
    const citation = await db.get('citations', id);
    if (citation) {
      // Promote to LokiJS
      citationStore.insert({ id, citation, ts: Date.now() });
      return citation;
    }

    // L2: Async server fetch (50-200ms)
    const res = await fetch(`/api/citations/${id}`);
    const serverCitation = await res.json();

    // Cache locally
    await db.put('citations', serverCitation);
    return serverCitation;
  }
};
```

**Key Pattern**: Check fastest cache first (LokiJS), then slower (IndexedDB), then slowest (network)

---

## Svelte 5 Runes Usage

### ✅ Used Patterns

```typescript
// State
let citations = $state<Citation[]>([]);
let selectedCitation = $state<Citation | null>(null);

// Derived (simple)
let count = $derived(citations.length);

// Derived (complex)
let filtered = $derived.by(() => {
  return citations.filter(c => c.caseId === selectedCase);
});

// Effects
$effect(() => {
  if (open && citation?.id) {
    viewTracker = createViewTracker(citation.id);
  }
});

// Props
let { content, citations = [], onsave }: Props = $props();
```

### ❌ Avoided Patterns (Svelte 4)

```typescript
// ❌ Don't use
export let citations;  // Use $props() instead
$: count = citations.length;  // Use $derived instead
on:click={handler}  // Use onclick={handler} instead
<slot>  // Use {#snippet children()} instead
```

---

## bits-ui v2 Integration

### ✅ Working Components (SSR-safe)

- **Icon** — Pure CSS `i-lucide-*` classes (no JS)
- **Button** — Svelte 5 runes, no TDZ issues
- **Tabs** — Native `$state`, not bits-ui (SSR issues)

### ⚠️ SSR-Disabled Components (TDZ bug)

- **Dialog** — `let props = $props()` causes SSR error
- **ScrollArea** — Same TDZ issue
- **Popover** — Same pattern

**Workaround**: Add `export const ssr = false` in `+page.ts`

---

## UnoCSS Styling Strategy

### ✅ Static Classes (Extracted)

```svelte
<div class="bg-panel border-sand/20 rounded-lg p-4 hover:bg-sand-3">
  <!-- All classes extracted at build time -->
</div>
```

### ⚠️ Dynamic Classes (Need Safelist)

```typescript
// uno.config.ts
safelist: [
  'bg-yellow-200',  // Citation highlight
  'text-accent',
  'border-info'
]
```

### ❌ Dynamic Expressions (Won't Extract)

```svelte
<!-- Won't work — UnoCSS can't extract -->
<div class={`flex ${isActive ? 'bg-accent' : 'bg-panel'}`}>

<!-- Fix: Use scoped <style> or separate classes -->
<div class:active={isActive}>
```

---

## Database Schema (Production)

```sql
-- Citations table (existing)
CREATE TABLE citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  citation_text TEXT NOT NULL,
  case_id UUID REFERENCES cases(id),
  source_url TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Collections table (to be added)
CREATE TABLE citation_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  color TEXT DEFAULT '#8B2332',
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Junction table (to be added)
CREATE TABLE collection_citations (
  collection_id UUID REFERENCES citation_collections(id) ON DELETE CASCADE,
  citation_id UUID REFERENCES citations(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (collection_id, citation_id)
);

-- Indexes
CREATE INDEX idx_citations_case_id ON citations(case_id);
CREATE INDEX idx_citations_created_at ON citations(created_at);
CREATE INDEX idx_collections_user_id ON citation_collections(user_id);
```

---

## Performance Characteristics

| Operation | L0 (LokiJS) | L1 (IndexedDB) | L2 (Server) |
|-----------|-------------|----------------|-------------|
| Read cached | ~0ms (sync) | 1-5ms (async) | - |
| Read miss | - | - | 50-200ms |
| Write | ~0ms (sync) | 5-15ms | 100-300ms |
| Search (Fuse.js) | - | 10-50ms (1000 items) | - |
| Search (Qdrant) | - | - | 50-150ms |

**Offline Mode**: Full CRUD via IndexedDB, auto-sync when online

---

## Testing Commands

```bash
# Seed citations
npx tsx src/lib/server/db/seed-citations.ts

# Test API
curl http://localhost:5173/api/citations
curl http://localhost:5173/api/citations/collections

# Run Playwright tests
node scripts/tests/test-screenshots.mjs --all

# Check types
npx svelte-check --threshold error
```

---

## Key Files Reference

| File | Purpose | Lines |
|------|---------|-------|
| `citation-cache.ts` | LokiJS + IndexedDB caching | 400+ |
| `seed-citations.ts` | Database seeding script | 150+ |
| `CitationHighlighter.svelte` | Text selection + AI summary | 389 |
| `EvidenceModal.svelte` | Evidence view with highlighting | 255 |
| `StatuteDetail.svelte` | Statute view with highlighting | 377 |
| `/api/citations/+server.ts` | Main CRUD endpoint | 94 |
| `/api/citations/collections/+server.ts` | Collections API | 64 |
| `/api/citations/export/json/+server.ts` | JSON export | 87 |

---

## Summary

✅ **SSR Strategy**: Hybrid (SSR for SEO pages, client-only for Dialog/ScrollArea)
✅ **REST API**: 10+ endpoints (citations, collections, exports)
✅ **UnoCSS**: Theme variables + utility classes (with safelist for dynamic)
✅ **bits-ui v2**: Used selectively (avoid Dialog/ScrollArea in SSR)
✅ **Svelte 5 Runes**: All modern syntax (`$state`, `$derived`, `$props`)
✅ **SvelteKit 2**: Drizzle ORM + PostgreSQL backend
✅ **Async Pull**: LokiJS → IndexedDB → Server (3-tier cache)
✅ **Offline**: Full IndexedDB persistence with auto-sync

**Architecture**: Progressive enhancement with offline-first caching
