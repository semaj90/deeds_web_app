# Knowledge Plane Service

**Purpose**: Unified RAG+KAG retrieval, graph expansion, and prompt assembly for Phase 87 autonomous error fixing.

**Port**: 8765
**Language**: Go (concurrency, streaming, timeouts)

---

## Architecture

```
Phase 87 Autonomous Agent (Node.js)
         ↓ HTTP
Knowledge Plane Service (:8765)
    ├─ /retrieve       → RAG+KAG contextual retrieval
    ├─ /expand         → Graph expansion (edges/neighbors)
    ├─ /compose_prompt → ACE prompt pack assembly
    ├─ /runs           → Fix attempt logging (JSONL dataset)
    └─ /health         → DB identity verification
         ↓
    ┌───────┬────────┬────────┬───────┐
 Postgres Qdrant  Redis  CouchDB Ollama
  :5434   :6333   :6379   :5984  :11434
```

---

## API Endpoints

### 1. `/retrieve` - RAG+KAG Retrieval

**Input:**
```json
{
  "query": "Expected ',' or '}' but found ':'",
  "k": 5,
  "filters": ["TS1005", "lib/cache"],
  "mode": "hybrid"
}
```

**Output:**
```json
{
  "contexts": [
    {
      "text": "Remove colon from spread operator",
      "source": "phase72_ast_knowledge_base",
      "score": 0.92,
      "collection": "surgical_fixes",
      "metadata": {"pattern": "object-spread-colon"}
    }
  ],
  "latency_ms": 45
}
```

**Pipeline:**
1. Get embedding (embeddinggemma:latest via Ollama)
2. Query pgvector HNSW (`error_embeddings` table)
3. Query Qdrant (15 collections, `phase72_ast_knowledge_base`, `phase76_knowledge_base`)
4. RRF fusion: `score = w_pg*(1/(k1+rank_pg)) + w_q*(1/(k2+rank_q))`
5. Cache in Redis (`ret:<sha1(query+filters)>`, TTL 1 hour)

---

### 2. `/expand` - KAG Graph Expansion

**Input:**
```json
{
  "seed_ids": ["error_408"],
  "depth": 2,
  "edge_types": ["SIMILAR_TO", "CAUSES_ERROR", "FIXES"],
  "k": 10
}
```

**Output:**
```json
{
  "nodes": [
    {"id": "error_408", "type": "error", "data": {"code": "TS1005"}},
    {"id": "pattern_spread_colon", "type": "pattern", "data": {"fix": "remove_colon"}}
  ],
  "edges": [
    {"from": "error_408", "to": "pattern_spread_colon", "type": "matches", "weight": 0.89}
  ],
  "paths": [
    {
      "nodes": ["error_408", "pattern_spread_colon", "fix_123"],
      "edges": ["matches", "suggests"],
      "explanation": "Spread operator colon error → known pattern → proven fix"
    }
  ]
}
```

**Data Sources:**
- CouchDB `edges` view (lightweight adjacency lists)
- Postgres `knowledge_graph` table (30 links)
- Optional: Neo4j for deep graph queries

---

### 3. `/compose_prompt` - ACE Prompt Pack Assembly

**Input:**
```json
{
  "error_id": 408,
  "file_snippet": "const cache = { ...baseCache: config };",
  "retrieved_ids": ["context_1", "context_2", "context_3"],
  "graph_nodes": ["pattern_spread_colon"]
}
```

**Output:**
```json
{
  "system_prompt": "You are a TypeScript error fixing expert...",
  "tool_hints": ["use spread operator fix pattern"],
  "constraints": {"max_lines_changed": "30", "must_validate": "true"},
  "target_snippet": "const cache = { ...baseCache: config };",
  "suggested_diff_shape": "Replace { ...obj: val } with { ...obj, key: val }",
  "prompt_pack_hash": "sha256:abc123def456"
}
```

**Assembly Logic:**
- System prompt from operator docs
- Tool hints from retrieved surgical fixes
- Constraints from Phase 87 config
- Diff shape from graph pattern metadata

---

### 4. `/runs` - Fix Attempt Logging

**Input:**
```json
{
  "prompt_pack_hash": "sha256:abc123def456",
  "retrieved_ids": ["ctx_1", "ctx_2"],
  "diff": "@@ -42,1 +42,1 @@\n-const cache = { ...baseCache: config };\n+const cache = { ...baseCache, config };",
  "validation_diff": -268,
  "outcome": "success"
}
```

**Output:**
```json
{
  "status": "logged",
  "run_id": "run_1735334400"
}
```

**Storage:**
- **JSONL dataset**: `reports/phase87-ace-dataset.jsonl` (for training)
- **CouchDB**: `run:phase87:<id>` document (for map/reduce views)
- **Postgres**: Optional `fix_attempts` table

---

### 5. `/health` - Health Check

**Output:**
```json
{
  "status": "ok",
  "timestamp": 1735334400,
  "database": {
    "server_ip": "172.17.0.2",
    "current_user": "user",
    "current_database": "legal"
  }
}
```

---

### 5. `/svelte/docs/search` - Svelte 5 Documentation Search 🆕

**Purpose**: Search Svelte 5/SvelteKit 2/bits-ui docs + your codebase using ripgrep for agentic self-update with latest APIs.

**Input:**
```json
{
  "query": "$state rune|getOllamaEndpoint",
  "sources": ["svelte", "sveltekit", "codebase", "bits-ui"],
  "max_results": 20,
  "context": 3
}
```

**Output:**
```json
{
  "results": [
    {
      "source": "svelte.txt",
      "line": 842,
      "match": "$state rune - reactive state management",
      "context": "...\n$state creates reactive state in Svelte 5...\n",
      "snippet": "$state creates reactive state in Svelte 5",
      "category": "rune:state"
    },
    {
      "source": "src/lib/utils/getOllamaEndpoint.ts",
      "line": 15,
      "match": "export function getOllamaEndpoint() {",
      "context": "import { env } from '$env/dynamic/public';\nexport function getOllamaEndpoint() {\n  return env.PUBLIC_OLLAMA_URL || 'http://localhost:11434';\n}",
      "snippet": "export function getOllamaEndpoint() {...}",
      "category": "codebase-example"
    }
  ],
  "query": "$state rune|getOllamaEndpoint",
  "sources": ["svelte", "sveltekit", "codebase"],
  "timestamp": "2025-12-28T06:45:00Z",
  "meta": {
    "total_results": 2,
    "duration_ms": 45
  }
}
```

**Sources:**
- `svelte`: Search `data/svelte-docs/svelte.txt`
- `sveltekit`: Search `data/svelte-docs/sveltekit.txt`
- `codebase`: Search `src/` for Svelte 5 patterns (`$state`, `$derived`, `$effect`, `$props`, `.svelte.ts`, `bits-ui`)
- `bits-ui`: Search for bits-ui component usage

**Use Case**: Gemma3-legal:latest can call this endpoint via tool calling to get up-to-date Svelte 5/SvelteKit 2/bits-ui docs before generating code.

---

## JSONL Dataset Format

**Purpose**: Train ACE contextual engineering prompting with real RAG+KAG examples.

**File**: `reports/phase87-ace-dataset.jsonl`

**Sample Entry**:
```json
{
  "timestamp": 1735334400,
  "endpoint": "/retrieve",
  "request": {
    "query": "Expected ',' or '}' but found ':'",
    "k": 5,
    "mode": "hybrid"
  },
  "response": [
    {
      "text": "Remove colon from spread operator",
      "source": "phase72_ast_knowledge_base",
      "score": 0.92
    }
  ],
  "latency_ms": 45
}
```

**Training Use**:
- Input: `query` + `retrieved contexts`
- Output: `outcome` (success/failure) + `validation_diff`
- Fine-tune Gemma3-legal to improve retrieval quality

---

## Deployment

### Build
```bash
cd go-services/knowledge-plane
go mod download
go build -o knowledge-plane main.go
```

### Run (with .env.phase87)
```powershell
$env:DATABASE_URL="postgresql://user:pass@127.0.0.1:5434/legal"
$env:QDRANT_URL="http://127.0.0.1:6333"
$env:REDIS_URL="redis://127.0.0.1:6379"
$env:OLLAMA_URL="http://127.0.0.1:11434"
.\knowledge-plane.exe
```

### Verify
```powershell
Invoke-RestMethod -Uri "http://localhost:8765/health"
```

---

## Integration with Phase 86/87

### Update `phase86-autonomous-loop.mjs`

**Before** (direct Qdrant/Postgres calls):
```javascript
const { embedding } = await ollama.embeddings({ model: MODEL, prompt: errorMsg });
const hitsAST = await qdrant.search(COLLECTION_AST, { vector: embedding, limit: 1 });
```

**After** (via Knowledge Plane):
```javascript
const retrieveRes = await fetch('http://127.0.0.1:8765/retrieve', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: errorMsg,
    k: 5,
    filters: [error.error_code, error.file_path],
    mode: 'hybrid'
  })
}).then(r => r.json());

const contexts = retrieveRes.contexts;
```

**Benefits**:
- Single API call instead of 3 (Ollama + Qdrant + Postgres)
- Built-in caching (Redis)
- RRF fusion ranking
- JSONL dataset logging for ACE training

---

## Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| `/retrieve` (cached) | <50ms | Redis hit |
| `/retrieve` (uncached) | <500ms | Ollama + pgvector + Qdrant + RRF |
| `/expand` (depth 2) | <100ms | CouchDB edges view |
| `/compose_prompt` | <20ms | Template assembly |
| `/runs` (log) | <10ms | JSONL append |

**Throughput**:
- Concurrent retrievals: 100/sec (Go concurrency)
- JSONL writes: 1,000/sec (buffered I/O)

---

## Next Steps

1. ✅ **Create .env.phase87**
2. ✅ **Fix FastMCP DATABASE_URL** (add DB identity logging)
3. ✅ **Create Knowledge Plane Go service**
4. 🔜 **Implement retrieval pipeline** (Ollama + pgvector + Qdrant + RRF)
5. 🔜 **Add JSONL dataset collection**
6. 🔜 **Test with Phase 86/87 autonomous loop**
7. 🔜 **Add CouchDB integration** (runs + edges)

---

**Status**: Foundation complete, ready for pipeline implementation
**Estimated**: 4-6 hours to full RAG+KAG retrieval
**Dataset Collection**: Starts immediately on first `/retrieve` call
