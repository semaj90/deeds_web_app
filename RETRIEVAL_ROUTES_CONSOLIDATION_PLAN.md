# Retrieval Routes Consolidation Plan

**Goal**: Collapse legacy code retrieval routes onto the canonical unified runtime. End the dual control-plane problem.

---

## Current State: 8 Code Retrieval Endpoints

### ✅ CANONICAL (Unified Runtime)
These use `SearchRuntime` and must be the single source of truth.

| Route | Path | Status | Purpose |
|-------|------|--------|---------|
| **Search Unified** | `GET/POST /api/retrieval/search-unified` | ✅ CANONICAL | Core endpoint (query → retrieve → fuse → rerank → promote) |
| **HyperRAG** | `POST /api/search/hyperrag` | ✅ CANONICAL | Legacy name, wraps SearchRuntime + response transformer |

---

### ⚠️ LEGACY (Needs Consolidation)

| Route | Path | Status | Purpose | Action |
|-------|------|--------|---------|--------|
| **Unified (Old)** | `GET/POST /api/retrieval/unified` | ⚠️ DUPLICATE | Uses `unified-orchestrator.js` (pre-SearchRuntime) | REDIRECT to `/search-unified` |
| **Phase89 Search** | `GET/POST /api/phase89/search` | ⚠️ OLD | Direct Qdrant hybrid search (no RRF, no rerank) | REDIRECT to `/search-unified` |
| **Vector Search** | `POST /api/vector-search` | ⚠️ HYBRID | Searches evidence + documents (not codebase) | KEEP (different domain) |
| **RAG Search** | `GET/POST /api/rag/search` | ⚠️ HEAVY | Full chain w/ corrective RAG + TF-IDF | REDIRECT to `/search-unified` |
| **RRF Fusion** | `POST /api/retrieval/rrf` | 📊 EVAL-ONLY | Testing/debugging endpoint | KEEP (non-production) |
| **Semantic Rerank** | `GET/POST /api/retrieval/semantic-rerank` | 📊 EVAL-ONLY | Reranker testing | KEEP (non-production) |

---

## Detailed Analysis

### 1. `/api/retrieval/unified` (OLD ORCHESTRATOR)
**File**: `src/routes/api/retrieval/unified/+server.ts`
**Implementation**: Uses `unified-orchestrator.js` (executeUnifiedRetrieval)
**Problem**: 
- Pre-SearchRuntime architecture
- Doesn't use the new promotion pipeline
- Duplicates `/api/retrieval/search-unified` functionality
**Action**: 
- ✅ REDIRECT all requests to `/search-unified`
- Response shape is compatible (both return unified retrieval results)

```typescript
// Before
GET /api/retrieval/unified?q=auth&limit=10

// After
GET /api/retrieval/search-unified?q=auth&topK=10
```

### 2. `/api/phase89/search` (PHASE 89 LEGACY)
**File**: `src/routes/api/phase89/search/+server.ts`
**Implementation**: Direct Qdrant hybrid search, no fusion/rerank
**Problem**:
- Skips RRF fusion (direct Qdrant only)
- Skips reranking (scores direct from Qdrant)
- Skips promotion to other mirrors
- Used by old Phase 89 UI
**Action**:
- ✅ REDIRECT to `/search-unified`
- Clear migration message in logs

```typescript
// Before (limited)
GET /api/phase89/search?q=auth&limit=20
→ Direct Qdrant ANN, no fusion/rerank

// After (full pipeline)
GET /api/retrieval/search-unified?q=auth&topK=20
→ Postgres BM25 + Qdrant + RRF + rerank + promote
```

### 3. `/api/rag/search` (FULL-CHAIN RAG)
**File**: `src/routes/api/rag/search/+server.ts`
**Implementation**: Corrective RAG + TF-IDF + Go retrieval + cache
**Problem**:
- Heavy pipeline (TF-IDF, corrective reformulation, multiple adapters)
- Duplicates SearchRuntime work
- Harder to maintain than unified runtime
**Action**:
- ✅ REDIRECT to `/search-unified`
- SearchRuntime already includes caching via bifrost/redis

```typescript
// Before (heavy)
GET /api/rag/search?q=...
→ TF-IDF, embedding, Qdrant, reformulation, Go retrieval, ...

// After (unified + cached)
GET /api/retrieval/search-unified?q=...
→ RRF + rerank (corrective reformulation optional via Gemma4)
```

### 4. `/api/search/hyperrag` (ALREADY CANONICAL ✅)
**File**: `src/routes/api/search/hyperrag/+server.ts`
**Status**: Already uses `createSearchRuntime()`
**Action**: VERIFY and DOCUMENT
- Response format has extra fields (signals, reasons, payload)
- These are transformation-only, don't change routing
- Keep as-is, document as "wrapper around canonical runtime"

---

## Evaluation & Testing Routes (KEEP as-is)

These are NOT user-facing; they're for evaluation/debugging:
- `/api/retrieval/rrf` — RRF fusion testing
- `/api/retrieval/semantic-rerank` — Reranker testing
- `/api/retrieval/canonical-rerank` — XGBoost reranking testing

Mark them in code with `@deprecated evaluation-only` to prevent accidental adoption.

---

## Cross-Domain Routes (KEEP as-is, DIFFERENT)

- `/api/vector-search` — Evidence + documents (not codebase)
- `/api/search` — Multi-domain unified (cases, POI, citations, etc.)
- `/api/ai/vector-search` — AI-specific semantic search

These are intentionally different domains. Do NOT redirect.

---

## Implementation Plan

### Phase 1: Add Compatibility Layer (30 min)
**File**: `src/routes/api/retrieval/unified/+server.ts`
```typescript
// Before: Uses unified-orchestrator.js
// After: Forward to /api/retrieval/search-unified

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q');
  const limit = url.searchParams.get('limit') || '10';
  
  // Redirect to canonical endpoint
  return new Response(null, {
    status: 307,
    headers: {
      'Location': `/api/retrieval/search-unified?q=${encodeURIComponent(q || '')}&topK=${limit}`,
      'X-Forwarded-From': '/api/retrieval/unified (legacy)',
    }
  });
};
```

### Phase 2: Add Redirects for Legacy Routes (30 min)
Update `/api/phase89/search` and `/api/rag/search` similarly.

### Phase 3: Update Route Documentation (20 min)
- Add JSDoc `@deprecated` comments to old routes
- Update `.well-known/routes.json` (if it exists)
- Document in memory/RETRIEVAL_CONTROL_PLANES.md

### Phase 4: Update Client Code (1-2h)
Search for direct references:
```bash
grep -r "api/retrieval/unified\|api/phase89/search\|api/rag/search" src/ \
  --include="*.ts" --include="*.svelte"
```
Update to use `/api/retrieval/search-unified` instead.

### Phase 5: Validation & Testing (1h)
- Test all 3 legacy endpoints → verify they 307 redirect
- Test `/api/retrieval/search-unified` → verify it works
- Run smoke test suite
- Verify promotion pipeline fires

### Phase 6: Archive (optional, later)
Once no references exist:
- Move old route files to `deeds_labs/archived-routes/`
- Keep `+server.ts` file as a 307 permanent redirect (for external API consumers)
- Update CHANGELOG

---

## Testing Checklist

- [ ] `/api/retrieval/unified` redirects to `/search-unified` (307)
- [ ] `/api/phase89/search` redirects to `/search-unified` (307)
- [ ] `/api/rag/search` redirects to `/search-unified` (307)
- [ ] `/api/retrieval/search-unified` returns full SearchResult shape
- [ ] `/api/search/hyperrag` still works (response wrapper intact)
- [ ] Promotion pipeline fires (Postgres + Qdrant + Neo4j)
- [ ] RRF fusion applied correctly
- [ ] Reranking applied correctly
- [ ] No client-side code broken (lint check)

---

## Single Control Plane Verified ✅

After consolidation:
- **Production code entry point**: `/api/retrieval/search-unified`
- **Frontend wrapper**: `/api/search/hyperrag` (same runtime, different response shape)
- **Testing/eval**: `/api/retrieval/rrf`, `/api/retrieval/semantic-rerank` (marked @deprecated eval-only)
- **Different domains**: Keep `/api/vector-search`, `/api/search`, etc. (separate concern)

**Result**: One control plane (SearchRuntime), multiple response formats, zero duplication.

