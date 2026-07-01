# Go Retrieval Facade Wiring — Complete Integration

**Date**: July 1, 2026  
**Status**: ✅ **WIRED & READY FOR TESTING**  
**Components**: 5 services orchestrated into 1 HTTP API facade

---

## Overview

The **Go Retrieval Facade** bridges the unified orchestrator with Go Retrieval service (:8100). Clients now call a single HTTP endpoint instead of managing five independent services.

```
Client Request
  ↓
POST /api/retrieval/go
  ↓
Go Retrieval Facade (go-retrieval-facade.ts)
  ├─ Parse request
  ├─ Normalize to unified format
  └─ Call executeGoRetrievalSearch()
      ↓
      Unified Orchestrator (unified-orchestrator.ts)
        ├─ Stage 1: Embedding (embeddinggemma :11434)
        ├─ Stage 2: Qdrant search (GPU :6333)
        ├─ Stage 3: TurboVec prefilter (CUDA :8791)
        ├─ Stage 4: Postgres join (:5434)
        ├─ Stage 5: Unified ranking (6 signals)
        └─ Stage 6: Gemma4 summary (:8090)
      ↓
      Normalize to Go Retrieval format
  ↓
Response: { results[], summary?, timing, stages_completed }
```

---

## Files Created

### **`src/lib/server/retrieval/go-retrieval-facade.ts`** (280 lines)
- Main facade orchestrator
- Normalizes Go Retrieval requests → Unified Orchestrator format
- Normalizes unified responses → Go Retrieval format
- Health check endpoint (validates all 5 services)
- Graceful degradation on failure

### **`src/routes/api/retrieval/go/+server.ts`** (110 lines)
- HTTP endpoint: `POST /api/retrieval/go` (main search)
- HTTP endpoint: `GET /api/retrieval/go/health` (service health)
- GET parameter support: `GET /api/retrieval/go?q=...&summarize=true`
- Error handling + graceful fallback

---

## Service Job Boundaries (Wired)

| Service | Job | Port | Route | Status |
|---------|-----|------|-------|--------|
| **Ollama (embeddinggemma)** | Generate 768-dim vectors | 11434 | /api/embeddings | ✅ Wired |
| **Qdrant** | GPU ANN search on named-vector "content" | 6333 | /collections/.../search | ✅ Wired |
| **TurboVec** | CUDA prefilter (768→64 transform) | 8791 | /search | ✅ Wired |
| **Postgres** | Canonical truth joins | 5434 | (pool query) | ✅ Wired |
| **Gemma4** | Bounded summarization | 8090 | /v1/chat/completions | ✅ Wired |

---

## API Surface

### POST /api/retrieval/go
**Request body:**
```json
{
  "query": "authentication session validation",
  "limit": 10,
  "useRRF": true,
  "useLexical": false,
  "includeSummary": true,
  "summaryMaxTokens": 128,
  "summaryTemperature": 0.3
}
```

**Response:**
```json
{
  "results": [
    {
      "id": "...",
      "score": 0.65,
      "file_path": "src/routes/api/auth/session/+server.ts",
      "relative_path": "src/routes/api/auth/session/+server.ts",
      "symbol": "validateSession",
      "kind": "function",
      "ranks": {
        "qdrant_dense": 0.95,
        "turbovec": 0.88,
        "postgres": 1.0
      }
    }
  ],
  "summary": {
    "text": "Handles Lucia session validation with PKCE flow...",
    "confidence": 0.85,
    "extracted_entities": [],
    "key_relations": []
  },
  "timing": {
    "embedding_ms": 20925,
    "qdrant_search_ms": 436,
    "turbovec_transform_ms": 18,
    "postgres_join_ms": 294,
    "total_ms": 25043
  },
  "stages_completed": ["embedding", "qdrant_search", "turbovec_prefilter", "postgres_join", "ranking", "gemma4_summary"],
  "fallback_used": false,
  "metadata": {
    "query": "authentication session validation",
    "query_embedding_dim": 768,
    "qdrant_candidates": 20,
    "turbovec_candidates": 10,
    "postgres_join_count": 10,
    "top_k": 10
  }
}
```

### GET /api/retrieval/go/health
**Response:**
```json
{
  "ok": true,
  "services": {
    "ollama": true,
    "qdrant": true,
    "turbovec": true,
    "postgres": true,
    "gemma4": true
  },
  "details": {
    "ollama": "OK",
    "qdrant": "OK",
    "turbovec": "OK",
    "postgres": "OK",
    "gemma4": "OK"
  }
}
```

### GET /api/retrieval/go (query parameter alternative)
```bash
curl 'http://localhost:5173/api/retrieval/go?q=authentication%20session&limit=10&rrf=true&summarize=true'
```

---

## npm Scripts Added

```json
{
  "retrieval:go:health": "curl -s 'http://localhost:5173/api/retrieval/go/health' | jq '.'",
  "retrieval:go:test": "curl -X POST 'http://localhost:5173/api/retrieval/go' -H 'Content-Type: application/json' -d '{\"query\": \"authentication session\", \"limit\": 10, \"includeSummary\": true}' | jq '.'"
}
```

---

## Request Normalization (Facade)

Go Retrieval requests support both snake_case and camelCase:

```typescript
// Both formats accepted:
{
  useRRF: true,        // camelCase
  use_rrf: true,       // snake_case
  
  includeSummary: true,
  include_summary: true,
  
  summaryMaxTokens: 128,
  summary_max_tokens: 128
}

// Normalized to unified format:
{
  query: "...",
  limit: 10,
  useRRF: true,
  useLexical: false
}
```

---

## Response Normalization (Facade)

Unified orchestrator output → Go Retrieval format:

```typescript
// Unified output
{
  candidates: [{
    id: "...",
    score: 0.65,
    path: "src/...",
    symbol: "func",
    kind: "function",
    ranks: { qdrant_dense: 0.95, ... }
  }],
  summary: { summary: "...", ... },
  timing: { embedding: 20925, ... }
}

// Normalized to Go Retrieval format
{
  results: [{
    id: "...",
    score: 0.65,
    file_path: "src/...",
    relative_path: "src/...",
    symbol: "func",
    kind: "function",
    ranks: { qdrant_dense: 0.95, ... }
  }],
  summary: { text: "...", ... },
  timing: { embedding_ms: 20925, ... }
}
```

---

## Health Check Implementation

The facade validates all 5 services in parallel:

1. **Ollama** — `/api/tags` HTTP 200
2. **Qdrant** — `/collections` HTTP 200
3. **TurboVec** — `/health` HTTP 200
4. **Postgres** — Pool query `SELECT 1`
5. **Gemma4** — `/v1/models` HTTP 200

Timeout per service: 2 seconds (total ~10 seconds for full health check).

Response:
```json
{
  "ok": true,  // all 5 services UP
  "services": {
    "ollama": true,
    "qdrant": true,
    "turbovec": true,
    "postgres": true,
    "gemma4": true
  },
  "details": {
    "ollama": "OK",
    "qdrant": "OK",
    "turbovec": "OK",
    "postgres": "OK",
    "gemma4": "OK"
  }
}
```

---

## Fallback Strategy

If any stage fails:

| Failure | Fallback | Response |
|---------|----------|----------|
| Embedding fails | Error | `{ results: [], fallback_used: true, error: "..." }` |
| Qdrant fails | Use empty candidates | `{ results: [], fallback_used: true }` |
| TurboVec fails | Skip prefilter | Return Qdrant results (less filtered) |
| Postgres fails | Return without metadata | Candidates lack `symbol`, `kind` fields |
| Ranking fails | Use Qdrant score order | Fallback to primary signal |
| Gemma4 fails | Skip summary | `summary: undefined` |

**Clients check `fallback_used: true` to detect degraded results.**

---

## Request/Response Shapes

### Unified Orchestrator → Go Retrieval Facade

**Input (Unified)**:
```typescript
interface RetrievalRequest {
  query: string;
  limit?: number;
  useRRF?: boolean;
  useLexical?: boolean;
}
```

**Output (Unified)**:
```typescript
interface RetrievalResult {
  candidates: RankedCandidate[];  // id, score, path, symbol, kind, ranks
  summary?: SummarizationResult;   // summary, entities, relations, confidence
  timing: { embedding, qdrant_search, turbovec_transform, postgres_join, total };
  stages_completed: string[];
  fallback_used: boolean;
}
```

### Go Retrieval Facade → HTTP API

**Input (Go Retrieval)**:
```typescript
interface GoRetrievalFacadeRequest {
  query: string;
  limit?: number;
  topK?: number;  // alternative name
  useRRF?: boolean;
  use_rrf?: boolean;  // alternative name (snake_case)
  includeSummary?: boolean;
  include_summary?: boolean;  // alternative name
  summaryMaxTokens?: number;
  summaryTemperature?: number;
}
```

**Output (Go Retrieval)**:
```typescript
interface GoRetrievalFacadeResponse {
  results: Array<{
    id, score, file_path, relative_path, symbol, kind, ranks
  }>;
  summary?: { text, confidence, extracted_entities, key_relations };
  timing: { embedding_ms, qdrant_search_ms, turbovec_transform_ms, postgres_join_ms, total_ms };
  stages_completed: string[];
  fallback_used: boolean;
  metadata: { query, query_embedding_dim, qdrant_candidates, ... };
}
```

---

## Testing the Facade

### 1. Health Check
```bash
npm run retrieval:go:health
```

Expected: All 5 services show `true`.

### 2. Search Query (with summary)
```bash
npm run retrieval:go:test
```

Expected: Results with summary, timing breakdown, all stages completed.

### 3. Search Query (GET alternative)
```bash
curl 'http://localhost:5173/api/retrieval/go?q=authentication%20session&limit=10&rrf=true&summarize=true' | jq '.'
```

### 4. Search Query (POST curl)
```bash
curl -X POST 'http://localhost:5173/api/retrieval/go' \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "authentication session",
    "limit": 10,
    "useRRF": true,
    "includeSummary": true
  }' | jq '.'
```

---

## Integration Points

### From Go Retrieval Service
Go Retrieval (:8100) can now call:
```bash
POST http://localhost:5173/api/retrieval/go
```

Instead of orchestrating:
- Ollama directly
- Qdrant directly
- TurboVec directly
- Postgres directly
- Gemma4 directly

### From SvelteKit Routes
Routes can call:
```typescript
const response = await fetch('/api/retrieval/go', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query, includeSummary: true })
});
const result = await response.json();
```

### From Agents/MCP Tools
MCP tools can call:
```bash
curl -X POST 'http://localhost:5173/api/retrieval/go' ...
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Clients (SvelteKit, Go Retrieval, Agents, MCP)             │
└─────────────────────────────────────────────────────────────┘
                         ↓
        ┌────────────────────────────────┐
        │ POST /api/retrieval/go         │
        │ GET  /api/retrieval/go/health  │
        └────────────────────────────────┘
                         ↓
   ┌──────────────────────────────────────────────┐
   │ Go Retrieval Facade (+server.ts)             │
   │ - Normalize request (snake_case → camelCase) │
   │ - Call unified orchestrator                  │
   │ - Normalize response                         │
   │ - Handle errors                              │
   └──────────────────────────────────────────────┘
                         ↓
   ┌──────────────────────────────────────────────┐
   │ Unified Orchestrator (unified-orchestrator.ts)
   │                                              │
   │ ┌─────────────────────────────────────────┐ │
   │ │ STAGE 1: Embedding (embeddinggemma)     │ │
   │ │ ↓                                       │ │
   │ │ STAGE 2: Qdrant search (GPU ANN)        │ │
   │ │ ↓                                       │ │
   │ │ STAGE 3: TurboVec prefilter (CUDA)      │ │
   │ │ ↓                                       │ │
   │ │ STAGE 4: Postgres join (truth)          │ │
   │ │ ↓                                       │ │
   │ │ STAGE 5: Unified ranking (6 signals)    │ │
   │ │ ↓                                       │ │
   │ │ STAGE 6: Gemma4 summary (optional)      │ │
   │ └─────────────────────────────────────────┘ │
   └──────────────────────────────────────────────┘
                         ↓
        ┌────────────────────────────────┐
        │ Response with results + timing │
        └────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ Clients receive unified result format                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Configuration

### Environment Variables
No new env vars needed. Uses existing:
- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- Service endpoints hardcoded to localhost ports (configurable in code)

### Service Ports (Hardcoded)
```typescript
const SERVICES = {
  OLLAMA: 'http://127.0.0.1:11434',
  QDRANT: 'http://127.0.0.1:6333',
  TURBOVEC: 'http://127.0.0.1:8791',
  GEMMA4: 'http://127.0.0.1:8090',
  POSTGRES: { host: '127.0.0.1', port: 5434, ... }
};
```

To change ports, edit `unified-orchestrator.ts` line 34-50.

---

## Next Steps

1. ✅ **Wired facade** — Go Retrieval now has single HTTP endpoint
2. ⏳ **Test facade** — Run `npm run retrieval:go:test` before production
3. ⏳ **Implement RRF fusion** — Add rg lexical + AST payload merge
4. ⏳ **Add caching layer** — Redis for embeddings + ranking scores
5. ⏳ **Deploy** — Validate with real queries at scale

---

## Critical Rules Enforced

✅ **Postgres is truth** — all Qdrant/TurboVec results verified in Postgres  
✅ **Named-vector "content"** — not unnamed/generic vectors  
✅ **Bounded Gemma4** — temperature=0.3, max_tokens=128  
✅ **Graceful fallback** — `fallback_used: true` signals degradation  
✅ **Clear service boundaries** — each service has one clear job  
✅ **Timing transparency** — clients see per-stage milliseconds  

---

**Status**: Ready for testing  
**Date**: July 1, 2026  
**Owner**: TurboVec + Go Retrieval integration
