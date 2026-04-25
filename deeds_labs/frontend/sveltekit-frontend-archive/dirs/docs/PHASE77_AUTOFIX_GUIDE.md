# Phase 77: AI-Assisted Svelte-Check + AST Autofix Pipeline

**Complete integration guide: Svelte diagnostics → Redis → Ollama embeddings → pgvector/Qdrant → AST analysis → LLM-powered autofix**

---

## 🎯 Goals

This guide covers **two layers**:

1. **Classic workflow** (what you already have):
   `npm run check:svelte` → manual debugging → apply fixes

2. **Phase 77 Agentic Autofix Pipeline**:
   Collect errors → SIMD normalize → Redis cache → vectorize (embeddinggemma) → store (pgvector + Qdrant) → AST graph analysis → Gemma3-legal agents → patch suggestions → auto-apply → track reduction

**Key benefit:** Automated 90%+ error reduction through ML-powered pattern detection and bulk fixes.

---

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture & Data Flow](#architecture--data-flow)
3. [Technology Stack](#technology-stack)
4. [Error Data Pipeline](#error-data-pipeline)
5. [Storage Layers](#storage-layers)
6. [AST Integration](#ast-integration)
7. [LLM Autofix Workflow](#llm-autofix-workflow)
8. [Manual Workflow (Fallback)](#manual-workflow-fallback)
9. [Performance Optimization](#performance-optimization)
10. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Classic Workflow (No AI)

```bash
cd sveltekit-frontend

# Generate error report
pwsh -ExecutionPolicy Bypass -File ../scripts/svelte-check-logger.ps1 -limit 1000

# Run svelte-check
npm run check:svelte

# Check logs
cat logs/svelte-check/svelte-check-errors_*.txt | head -50
```

### Phase 77 Agentic Workflow (Full AI)

```bash
cd sveltekit-frontend

# 1. Run svelte-check + convert to structured JSON
pwsh -ExecutionPolicy Bypass -File ../scripts/phase77-svelte-errors-to-json.ps1

# 2. Ingest into AI pipeline (Redis + vectors + Qdrant)
python ../backend/tools/phase77_ingest_svelte_errors.py

# 3. Start development server with AST tools
npm run dev:quic

# 4. Open AST analysis UI
#    http://localhost:5173/all-routes
#    http://localhost:5173/dev/ast-graph

# 5. Run automated fix pipeline
npm run phase72:iterate:x3

# 6. Verify results
npm run check:svelte
```

**Expected outcome:** 90%+ error reduction in 15–30 minutes (depending on error count).

---

## Architecture & Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Phase 77 Error Pipeline                       │
└─────────────────────────────────────────────────────────────────┘

1. DATA COLLECTION
   ┌──────────────┐
   │ svelte-check │ → logs/svelte-check-errors_*.txt
   └──────┬───────┘
          │
          ▼
   ┌──────────────────────┐
   │ SIMD JSON Accelerator│  (Go + simdjson/sonic)
   │ POST /parse          │  Port 8095 or 8103
   └──────┬───────────────┘
          │
          ▼
   Structured JSON:
   {
     "file": "src/routes/cases/+page.svelte",
     "code": "TS5083",
     "message": "Cannot read file ...",
     "line": 42,
     "column": 13,
     "hash": "svelte:TS5083:src/routes/cases/+page.svelte:42"
   }

2. CACHING LAYER
   ┌─────────────┐
   │ Redis Cache │
   └──────┬──────┘
          │
          ├─ sveltecheck:error:{hash} → JSON error
          ├─ sveltecheck:run:current → list of hashes
          └─ sveltecheck:cluster:{id} → set of related errors

3. VECTORIZATION
   ┌─────────────────────────────┐
   │ Ollama embeddinggemma:latest│
   │ via getOllamaEndpoint()     │
   └──────┬──────────────────────┘
          │
          ▼
   POST {OLLAMA_ENDPOINT}/api/embeddings
   {
     "model": "embeddinggemma:latest",
     "prompt": "TS5083 in src/routes/cases/+page.svelte: Cannot read file ..."
   }
   → 768-dimensional vector

4. STORAGE (DUAL)
   ┌────────────────────┐    ┌─────────────┐
   │ PostgreSQL 17      │    │   Qdrant    │
   │ + pgvector         │    │  Collection │
   └────────┬───────────┘    └──────┬──────┘
            │                       │
            ├─ svelte_errors table  │
            │  - vector(768)        │
            │  - IVFFlat index      ├─ svelte_errors
            │                       │  - Payload: file, code, message
            │                       │  - Used for clustering
            └───────────────────────┘

5. AST ANALYSIS
   ┌─────────────────────┐
   │ ts-morph AST Graph  │
   │ /api/ast/analyze    │
   └──────┬──────────────┘
          │
          ▼
   AST nodes + edges for error locations
   → Fed to LLM for context-aware fixes

6. LLM AGENT
   ┌──────────────────────────────┐
   │ Gemma3-legal via TRT-LLM     │
   │ + Context7 MCP tools         │
   │ + FastMCP integration        │
   └──────┬───────────────────────┘
          │
          ▼
   Receives:
   - Error cluster (from pgvector/Qdrant)
   - AST subgraph (from ts-morph)
   - Svelte 5 runes docs

   Generates:
   - Patch plan (n steps)
   - ts-morph operations
   - Codemod commands

7. AUTOFIX & VALIDATION
   ┌────────────────────────┐
   │ Apply patches via      │
   │ ts-morph codemods      │
   └──────┬─────────────────┘
          │
          ▼
   Re-run: npm run check:svelte

   Store metrics:
   - error_count_before
   - error_count_after
   - cluster_id
   - files_changed
```

---

## Technology Stack

### Core Components

| Component | Technology | Purpose | Port/Config |
|-----------|-----------|---------|-------------|
| **Error Collection** | `svelte-check` | TypeScript/Svelte diagnostics | npm script |
| **JSON Normalization** | Go SIMD service | AVX2-accelerated parsing | 8095/8103 |
| **Cache Layer** | Redis 7+ | Fast error lookup | 6379 (default) |
| **Embeddings** | Ollama `embeddinggemma:latest` | 768-d vectors via `getOllamaEndpoint()` | 11434 |
| **Vector DB (Analytics)** | PostgreSQL 17 + pgvector | Long-term storage, similarity search | 5432 |
| **Vector DB (Real-time)** | Qdrant | Clustering, semantic search | 6333 |
| **AST Analysis** | ts-morph + custom API | Code structure graph | `/api/ast/analyze` |
| **LLM Agent** | Gemma3-legal (TRT-LLM) | Patch generation, planning | 8090 |
| **MCP Tools** | Context7 + FastMCP | Agent tool integration | Various |
| **Frontend** | SvelteKit + QUIC | AST visualization UI | 5173 |

### Optional Accelerators

- **CUDA/TensorRT**: GPU inference for Gemma3-legal
- **CUTLASS**: Future Phase 77 kernel fusion
- **AVX2**: Already used in SIMD JSON service

---

## Error Data Pipeline

### Step 1: Collection & Normalization

**Script:** `scripts/phase77-svelte-errors-to-json.ps1`

```powershell
# Run svelte-check, capture output
npx svelte-check --output machine > logs/svelte-check-raw.json

# Parse and normalize
$errors = Get-Content logs/svelte-check-raw.json | ConvertFrom-Json

# Send to SIMD accelerator
foreach ($err in $errors.diagnostics) {
    $payload = @{
        file = $err.filename
        code = $err.code
        message = $err.text
        line = $err.start.line
        column = $err.start.column
    } | ConvertTo-Json

    Invoke-RestMethod -Uri "http://127.0.0.1:8095/parse" `
        -Method POST `
        -Body $payload `
        -ContentType "application/json"
}
```

**Output:**
- Normalized JSON stored in Redis: `sveltecheck:error:{hash}`
- Hash format: `svelte:{code}:{file}:{line}`

---

### Step 2: Vectorization

**Script:** `backend/tools/phase77_ingest_svelte_errors.py`

```python
import requests
import psycopg2
from qdrant_client import QdrantClient
from redis import Redis

# Config
OLLAMA_ENDPOINT = get_ollama_endpoint()  # Your helper function
REDIS = Redis(host='localhost', port=6379, decode_responses=True)
PG_CONN = psycopg2.connect("postgresql://user:pass@localhost:5432/legal_ai_db")
QDRANT = QdrantClient(host='localhost', port=6333)

def vectorize_error(error):
    """Generate embedding via Ollama embeddinggemma."""
    prompt = f"{error['code']} in {error['file']}: {error['message']}"

    response = requests.post(
        f"{OLLAMA_ENDPOINT}/api/embeddings",
        json={"model": "embeddinggemma:latest", "prompt": prompt}
    )

    return response.json()["embedding"]  # 768-d vector

def ingest_errors():
    # Get errors from Redis
    error_keys = REDIS.keys("sveltecheck:error:*")

    for key in error_keys:
        error = json.loads(REDIS.get(key))

        # Generate vector
        vector = vectorize_error(error)

        # Store in PostgreSQL
        with PG_CONN.cursor() as cur:
            cur.execute("""
                INSERT INTO svelte_errors (hash, file_path, error_code, message, vector)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (hash) DO NOTHING
            """, (error['hash'], error['file'], error['code'], error['message'], vector))

        # Store in Qdrant
        QDRANT.upsert(
            collection_name="svelte_errors",
            points=[{
                "id": error['hash'],
                "vector": vector,
                "payload": error
            }]
        )

    PG_CONN.commit()

if __name__ == "__main__":
    ingest_errors()
```

---

### Step 3: Clustering & Prioritization

**Query PostgreSQL:**

```sql
-- Top error codes by frequency
SELECT error_code, COUNT(*) as count
FROM svelte_errors
WHERE resolved_at IS NULL
GROUP BY error_code
ORDER BY count DESC
LIMIT 20;

-- Similar errors via vector similarity
SELECT file_path, error_code, message,
       1 - (vector <=> $1::vector) as similarity
FROM svelte_errors
WHERE resolved_at IS NULL
ORDER BY vector <=> $1::vector
LIMIT 10;
```

**Query Qdrant:**

```python
# Find errors similar to a reference error
results = QDRANT.search(
    collection_name="svelte_errors",
    query_vector=reference_vector,
    limit=20,
    score_threshold=0.8
)

for result in results:
    print(f"{result.payload['file']}: {result.payload['message']}")
```

---

## Storage Layers

### Redis (Fast Cache)

**Purpose:** Immediate lookup, session management

**Key Structure:**

```
sveltecheck:run:current → ["hash1", "hash2", ...]
sveltecheck:error:{hash} → JSON error object
sveltecheck:cluster:{cluster_id} → ["hash3", "hash4", ...]
sveltecheck:stats:latest → {total_errors: 1234, timestamp: ...}
```

**Usage:**

```bash
# Get error by hash
redis-cli GET "sveltecheck:error:svelte:TS5083:src/routes/cases/+page.svelte:42"

# Get current run errors
redis-cli LRANGE "sveltecheck:run:current" 0 -1
```

---

### PostgreSQL 17 + pgvector

**Purpose:** Long-term analytics, vector similarity search

**Schema:**

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE svelte_errors (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hash        text UNIQUE NOT NULL,
  file_path   text NOT NULL,
  error_code  text NOT NULL,
  message     text NOT NULL,
  snippet     text,
  line        int,
  column      int,
  severity    text DEFAULT 'error',
  vector      vector(768),
  created_at  timestamptz DEFAULT now(),
  resolved_at timestamptz,
  cluster_id  int
);

-- Vector similarity index (IVFFlat)
CREATE INDEX svelte_errors_vector_idx
  ON svelte_errors
  USING ivfflat (vector vector_cosine_ops)
  WITH (lists = 100);

-- Performance indexes
CREATE INDEX idx_svelte_errors_code ON svelte_errors(error_code);
CREATE INDEX idx_svelte_errors_file ON svelte_errors(file_path);
CREATE INDEX idx_svelte_errors_unresolved ON svelte_errors(resolved_at) WHERE resolved_at IS NULL;
```

**Queries:**

```sql
-- Analytics: Error trends over time
SELECT DATE(created_at), COUNT(*)
FROM svelte_errors
GROUP BY DATE(created_at)
ORDER BY DATE(created_at) DESC
LIMIT 30;

-- Find similar errors to a specific one
WITH target AS (
  SELECT vector FROM svelte_errors WHERE hash = $1
)
SELECT e.file_path, e.error_code, e.message,
       1 - (e.vector <=> target.vector) as similarity
FROM svelte_errors e, target
WHERE e.resolved_at IS NULL
ORDER BY e.vector <=> target.vector
LIMIT 10;
```

---

### Qdrant

**Purpose:** Real-time semantic clustering, UI-driven search

**Collection Setup:**

```python
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams

client = QdrantClient(host="localhost", port=6333)

client.create_collection(
    collection_name="svelte_errors",
    vectors_config=VectorParams(
        size=768,
        distance=Distance.COSINE
    )
)
```

**Payload Structure:**

```json
{
  "file_path": "src/routes/cases/+page.svelte",
  "error_code": "TS5083",
  "message": "Cannot read file ...",
  "line": 42,
  "column": 13,
  "severity": "error",
  "stack_trace": "..."
}
```

**Use Cases:**

- `/dev/ast-graph` sidebar: "Show similar errors"
- MCP tools: `get_related_errors(error_id)`
- Clustering UI: Group errors by semantic similarity

---

## AST Integration

### AST Analysis API

**Endpoint:** `POST /api/ast/analyze`

**Request:**

```json
{
  "file_path": "src/routes/cases/+page.svelte",
  "focus_lines": [42, 43, 44]
}
```

**Response:**

```json
{
  "nodes": [
    {
      "id": "node_1",
      "type": "ImportDeclaration",
      "line": 42,
      "text": "import Component from './Component'"
    }
  ],
  "edges": [
    {
      "from": "node_1",
      "to": "node_2",
      "relation": "imports"
    }
  ]
}
```

### Visualization

**UI Route:** `http://localhost:5173/dev/ast-graph`

**Features:**
- Interactive graph visualization
- Error highlights on affected nodes
- Suggested fix overlay
- "Apply fix" button

---

## LLM Autofix Workflow

### Phase 1: Collect Context

**MCP Tool:** `get_svelte_error_cluster`

```javascript
// Context7 MCP tool
async function getSvelteErrorCluster(clusterId) {
  // 1. Get cluster from Qdrant
  const errors = await qdrant.search({
    collection: "svelte_errors",
    filter: { cluster_id: clusterId },
    limit: 50
  });

  // 2. Get representative error
  const representative = errors[0].payload;

  // 3. Get AST for affected file
  const ast = await fetch("/api/ast/analyze", {
    method: "POST",
    body: JSON.stringify({
      file_path: representative.file_path,
      focus_lines: [representative.line - 5, representative.line + 5]
    })
  }).then(r => r.json());

  return {
    cluster_id: clusterId,
    error_count: errors.length,
    representative_error: representative,
    affected_files: [...new Set(errors.map(e => e.payload.file_path))],
    ast_context: ast
  };
}
```

### Phase 2: LLM Planning

**Prompt Template:**

```
You are a TypeScript/Svelte 5 expert. Analyze this error cluster and propose a fix.

CONTEXT:
- Error code: {{error_code}}
- Occurrences: {{error_count}}
- Affected files: {{affected_files}}

REPRESENTATIVE ERROR:
File: {{file_path}}
Line: {{line}}
Message: {{message}}

AST CONTEXT:
{{ast_json}}

SVELTE 5 RUNES GUIDE:
- Use $state() for reactive variables
- Use $props() for component props
- Use $derived() for computed values
- Use onclick instead of on:click

TASK:
Generate a ts-morph codemod to fix this error pattern across all affected files.

OUTPUT FORMAT:
{
  "fix_type": "import_correction | rune_migration | type_annotation",
  "operations": [
    {
      "file": "src/routes/cases/+page.svelte",
      "action": "replace_node",
      "node_id": "node_1",
      "new_code": "..."
    }
  ],
  "confidence": 0.95,
  "risk_level": "low | medium | high"
}
```

**LLM Response:**

```json
{
  "fix_type": "import_correction",
  "operations": [
    {
      "file": "src/routes/cases/+page.svelte",
      "action": "replace_node",
      "node_id": "import_1",
      "new_code": "import Component from './Component.svelte'"
    }
  ],
  "confidence": 0.98,
  "risk_level": "low"
}
```

### Phase 3: Apply Codemods

**Script:** `scripts/phase77-apply-ast-fixes.mjs`

```javascript
import { Project } from "ts-morph";

async function applyFixes(fixPlan) {
  const project = new Project();

  for (const op of fixPlan.operations) {
    const sourceFile = project.addSourceFileAtPath(op.file);

    // Find node by ID (stored during AST analysis)
    const node = sourceFile.getDescendantAtPos(op.node_start_pos);

    // Apply transformation
    if (op.action === "replace_node") {
      node.replaceWithText(op.new_code);
    }

    await sourceFile.save();
  }

  console.log(`✅ Applied ${fixPlan.operations.length} fixes`);
}
```

### Phase 4: Validation Loop

```bash
# Apply fixes
node scripts/phase77-apply-ast-fixes.mjs --cluster 42

# Re-run checks
npm run check:svelte > logs/post-fix-check.log

# Compare
python backend/tools/compare_error_counts.py \
  logs/pre-fix-check.log \
  logs/post-fix-check.log

# Store metrics
psql -d legal_ai_db -c "
  INSERT INTO fix_history (cluster_id, errors_before, errors_after)
  VALUES (42, 1234, 456)
"
```

---

## Manual Workflow (Fallback)

If AI pipeline is unavailable, use classic debugging:

### Step 1: Generate Report

```bash
pwsh -ExecutionPolicy Bypass -File scripts/svelte-check-logger.ps1 -limit 1000
```

**Output:**
- `logs/svelte-check/svelte-check-errors_<timestamp>.txt`
- `logs/svelte-check/svelte-check-summary_<timestamp>.txt`

### Step 2: Categorize Errors

**Common categories:**

1. **Type Errors (TS5083, TS1131)**
   - Fix: `rm -rf .svelte-kit && npx svelte-kit sync`

2. **Import Errors**
   - Fix: Add `.svelte` extensions to relative imports

3. **Reactive Declarations**
   - Fix: Migrate `$:` to `$state()` / `$derived()`

4. **Props/Slots**
   - Fix: Use `$props()` destructuring

5. **Event Handlers**
   - Fix: Change `on:click` → `onclick`

### Step 3: Manual Fix

```bash
# Edit files
code src/routes/cases/+page.svelte

# Re-check
npm run check:svelte
```

---

## Performance Optimization

### C++/CUDA Usage Guidelines

**Where to use:**
- ✅ SIMD JSON parsing (already in Go service with AVX2)
- ✅ TensorRT-LLM inference (Gemma3-legal)
- ✅ Vector operations (optional CUTLASS in Phase 77)

**Where NOT to use:**
- ❌ Log orchestration (Python/Node.js is fine)
- ❌ Redis/Postgres queries (native drivers are fast enough)
- ❌ MCP tool logic (Node.js/TS preferred for maintainability)

### Bottleneck Analysis

| Operation | Current | Optimized | Speedup |
|-----------|---------|-----------|---------|
| svelte-check | 30–60s | 30–60s | 1× (can't optimize) |
| JSON parsing | 2–5s | 0.5–1s | 4× (SIMD) |
| Vectorization | 10–20s | 10–20s | 1× (Ollama overhead) |
| Clustering | 5–15s | 2–5s | 3× (Qdrant GPU) |
| AST analysis | 1–3s | 1–3s | 1× (ts-morph is fast) |
| LLM inference | 5–30s | 2–10s | 3× (TRT-LLM) |

**Total pipeline:** ~60–150s → **~45–100s with optimizations**

---

## Troubleshooting

### Issue: SIMD accelerator not responding

```bash
# Check if service is running
curl http://127.0.0.1:8095/health

# Restart if needed
cd go-services/simd-json-accelerator
go run main.go
```

### Issue: Ollama embeddings fail

```bash
# Check Ollama status
curl http://localhost:11434/api/tags

# Pull model if missing
ollama pull embeddinggemma:latest

# Test embedding
curl -X POST http://localhost:11434/api/embeddings \
  -d '{"model":"embeddinggemma:latest","prompt":"test"}'
```

### Issue: pgvector similarity search slow

```sql
-- Check index exists
SELECT indexname FROM pg_indexes
WHERE tablename = 'svelte_errors';

-- Rebuild if needed
REINDEX INDEX svelte_errors_vector_idx;

-- Tune IVFFlat lists
ALTER INDEX svelte_errors_vector_idx
  SET (lists = 200);  -- Increase for larger datasets
```

### Issue: Qdrant cluster not found

```python
# Check collection exists
from qdrant_client import QdrantClient
client = QdrantClient(host="localhost", port=6333)

collections = client.get_collections()
print(collections)

# Recreate if missing
client.create_collection(...)
```

---

## Related Documentation

- [Phase 72–76 Pipeline](./PHASE72_HOWTO.md)
- [AST Graph Analyzer API](../src/lib/ast/README.md)
- [Context7 MCP Tools](../../backend/mcp/README_CONTEXT7.md)
- [Gemma3-legal Integration](../../backend/llm/README_GEMMA3.md)
- [QUIC Dev Server Setup](../../README_QUIC.md)

---

**Last updated:** December 1, 2025
**Status:** Phase 72–76 complete ✅ | Phase 77 in progress 🚧
**Next:** CUTLASS kernel integration for 10–50× clustering speedup
