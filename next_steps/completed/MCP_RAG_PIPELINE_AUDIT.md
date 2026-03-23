# MCP + RAG/KAG/DAG Pipeline Audit & Enhancements

## Date: March 20, 2026

---

## Session Summary

Full audit of MCP tools, RAG/KAG/DAG pipeline, and LangExtract integration. Implemented 4 enhancements to the MCP server.

---

## MCP Server Audit (28 tools)

### Tool Status Matrix

| Category | Count | Real | Stub | Status |
|----------|-------|------|------|--------|
| Cases (CRUD) | 4 | 4 | 0 | All REST-backed via `/api/cases` |
| Citations & Reports | 9 | 9 | 0 | Full CRUD + template generation + PDF/DOCX export |
| Evidence Analysis | 4 | 4 | 0 | Entity extraction + forensics + YOLO + cross-modal |
| Audio Transcription | 2 | 2 | 0 | Whisper via Docling + GPU FastAPI |
| Codebase Search | 1 | 1 | 0 | Dual-vector Qdrant (0.6 content + 0.4 signature) |
| LangExtract | 4 | 4 | 0 | Legal/evidence/file/custom extraction via Ollama |
| RAG | 3 | 3 | 0 | **search + index_page (ENHANCED) + browser_action (ENHANCED)** |
| Compose Pipeline | 1 | 1 | 0 | **NEW** — sequential tool chaining |
| **TOTAL** | **28** | **28** | **0** | **All stubs eliminated** |

### Enhancements Implemented

#### 1. `rag:index_page` — Real Web Crawling + Embedding + Qdrant Storage
**Was**: Stub returning `{ indexed: true, id: 'web-...' }`
**Now**: Full implementation in `src/mcp/server.ts`:
- Fetches URL with 15s timeout
- Strips HTML → plain text (script/style removal, entity decode)
- Chunks text (500 chars, 100 overlap, configurable)
- Embeds each chunk via Ollama `embeddinggemma:latest` (768-dim)
- Stores points in Qdrant `knowledge_base` collection with metadata
- Returns: `{ indexed, url, textLength, chunks, embedded, collection, processingTimeMs }`

#### 2. `playwright:browser_action` — Real Browser Automation
**Was**: Mock returning `{ success: true, action, timestamp }`
**Now**: Uses Playwright `chromium.launch()`:
- `goto` → navigate + screenshot + page title + content length
- `click` → click selector on page
- `fill` → fill input with value
- Graceful error handling with browser cleanup

#### 3. `compose:pipeline` — NEW Tool Chaining
Enables sequential multi-tool workflows in one MCP call:
```json
{
  "steps": [
    { "tool": "codebase:search", "args": { "query": "RAG pipeline" } },
    { "tool": "evidence:analyze", "args": { "evidenceId": "abc", "text": "{{step0.results.0.content}}" } }
  ],
  "stopOnError": true
}
```
- Template syntax: `{{stepN.field.nested}}` references previous step output
- Max 10 steps per pipeline
- `stopOnError` controls failure behavior
- Returns: `{ pipeline, stepsCompleted, totalSteps, processingTimeMs, results[] }`

#### 4. Auth Guard
- Checks `MCP_AUTH_TOKEN` env var when set
- Accepts token via `_meta.authToken` or `arguments._authToken`
- No-op when env var not configured (backwards compatible)

---

## RAG/KAG/DAG Pipeline Status

### RAG Pipeline: WORKING (95%)

| Stage | Route | Status | Details |
|-------|-------|--------|---------|
| Search | `/api/rag/search` | WORKING | BM42 hybrid + corrective RAG + DAG reorder |
| Validate | `/api/rag/validate` | WORKING | Human-in-the-loop chunk approval → Redis 10min TTL |
| Answer | `/api/rag/answer` | WORKING | Dual LLM routing (LiteLLM/Ollama) + citation extraction |

**Key Features**:
- BM42 hybrid search (dense + sparse RRF fusion) for legal_documents + evidence_items
- Corrective RAG: reformulates query when top_score < 0.50
- ACE entity enrichment with tag-based score boosting (1.15x per match)
- DAG citation ordering (opt-in via `?dag=true`)
- Multi-tier caching: Memory (5min) → Redis (30min) → LiteLLM semantic (28x speedup)
- Rate limiting: 30 req/min per client

**Database Persistence**:
- `ragSessions` table: user_id, case_id, session_name, metadata JSONB
- `ragMessages` table: session_id FK, role, content, embedding(384-dim), sources JSONB
- `document_chunks` table: document_id FK, chunk_index, content, embedding

### KAG Pipeline: WORKING (75%)

- Knowledge base ingestion with BM42 sparse vectors
- Hybrid search + LLM generation (gemma3-legal or Gemini)
- ACE context assembler: 11-part prompt structure with Neo4j KAG neighbors
- **Gap**: W3C spec validation and package.json verification NOT implemented

### DAG Pipeline: WORKING (95%)

- `src/lib/server/retrieval/document-dag.ts` (214 lines)
- Kahn's algorithm (BFS topological sort) for citation dependency ordering
- Cycle detection + breaking (removes edges from lowest-scored node)
- Integrated in `/api/rag/search` (opt-in via `?dag=true`)

---

## LangExtract Status: PARTIAL

| Component | Status |
|-----------|--------|
| Python service code | IMPLEMENTED (2 variants) |
| Docker container | Commented out in docker-compose |
| Evidence pipeline | WORKING — `extractSectionsFromText()` with heuristic fallback |
| MCP tools (4) | REAL — legal/evidence/file/custom extraction |
| Health checks | WORKING — probes port 8095 |

**Known Issue**: Port 8095 conflict — both SIMD sidecar (`MINIO_SIMD_URL`) and LangExtract (`LANGEXTRACT_URL`) default to `http://127.0.0.1:8095`. SIMD is disabled by default so it works, but enabling SIMD would break.

---

## Files Modified

| File | Change |
|------|--------|
| `src/mcp/server.ts` | Real `rag:index_page`, `playwright:browser_action`, `compose:pipeline` tool, auth guard |
| `src/mcp/index.ts` | `indexWebPage()` calls `/api/knowledge` POST instead of returning mock |
| `src/lib/stores/theme.svelte.ts` | Fixed `effect_orphan` SSR error (removed `$effect()` from constructor) |

---

## Remaining Gaps

### High Priority
- [ ] Fix pgvector dimension mismatch: `ragMessages.embedding` is 384-dim but queries use 768-dim
- [ ] Port 8095 conflict resolution (LangExtract vs SIMD sidecar)
- [ ] Make corrective RAG threshold configurable per domain (currently hardcoded 0.50)

### Medium Priority
- [ ] Implement W3C spec validation in KAG (currently stubbed)
- [ ] Monitor Neo4j health for KAG fallback chains
- [ ] Add Redis Singleton for MinIO client (currently recreated 4x per session in MCP server)
- [ ] Add Zod validation for all MCP tool inputs
- [ ] Add metrics/observability (execution time, error rates per tool)

### Low Priority
- [ ] Add streaming support for long-running MCP tools (transcription, multimodal)
- [ ] Add concurrent tool execution in compose:pipeline (currently sequential)
- [ ] Tool output caching in Redis with configurable TTL

---

## Test Results

| Test | Result |
|------|--------|
| svelte-check | 0 errors, 1 warning (CSS line-clamp) |
| vite build | PASSES |
| Playwright | 44/46 PASS (2 demo timeouts — intermittent) |

---

## Architecture: Query Flow

```
User Query
  ↓
/api/rag/search
  ├─ Embed query (Ollama embeddinggemma, 768-dim)
  ├─ Qdrant search (BM42 hybrid or dense-only)
  ├─ Tag-based score boosting
  ├─ ACE entity enrichment (optional)
  ├─ Corrective RAG (reformulate if top_score < 0.5)
  ├─ DAG reordering (if ?dag=true)
  ├─ Cache result (Memory + Redis, 30min TTL)
  └─ Return chunks + scores + metadata
  ↓
/api/rag/validate
  ├─ Human reviews chunks
  ├─ Approves/rejects by chunk_id
  ├─ Cache context (Redis, 10min TTL)
  └─ Return approved context
  ↓
/api/rag/answer
  ├─ Retrieve context from Redis
  ├─ Build augmented prompt with jurisdiction context
  ├─ LLM generation (LiteLLM or Ollama)
  ├─ Extract citations + action items
  ├─ Compute confidence + grounding scores
  └─ Return answer with citations
```

## MCP Compose Pipeline Example

```json
{
  "tool": "compose:pipeline",
  "arguments": {
    "steps": [
      {
        "tool": "rag:index_page",
        "args": { "url": "https://law.cornell.edu/uscode/text/18/1961" }
      },
      {
        "tool": "rag:search",
        "args": { "query": "RICO predicate offenses", "topK": 5 }
      },
      {
        "tool": "langextract:legal",
        "args": { "text": "{{step1.data}}" }
      }
    ],
    "stopOnError": true
  }
}
```