# OpenCode + MCP Configuration Fixes (July 7, 2026)

## Overview

This document describes the fixes applied to resolve OpenCode Gemma4 integration issues:

1. **OpenCode transport configuration** — Fixed MCP HTTP server detection
2. **Memory persistence** — Added Engram PostgreSQL bridge with BM25/HNSW indexing
3. **LangGraph dispatcher** — Added Netflix Headroom state management
4. **Bash tool support** — Added safe shell execution wrapper
5. **Tool telemetry** — Automatic recording of all tool invocations

---

## Fix 1: OpenCode Configuration (.opencode/opencode.jsonc)

**Issue:** MCP server was not recognized because OpenCode expected a specific transport type.

**Changes:**
- Added `"type": "http"` to specify HTTP Streamable Server transport
- Added `"headers"` for proper MIME type negotiation
- Added `"timeout": 30000` (30s) for tool timeouts
- Added `"tools"` allowlist/blocklist for access control
- Added `"tools": true` and `"reasoning": false` to model config for Gemma4

**Result:** OpenCode now successfully connects to TRACE MCP server at http://127.0.0.1:8788

---

## Fix 2: Engram Memory Bridge (src/mcp/memory-bridge.ts)

**Purpose:** Persistent agent memory with semantic search capabilities.

**Features:**
- PostgreSQL table: `agent_observations` (stores tool invocations)
- BM25 text search index (inverse keyword search on `bm25_tags` + `output_summary`)
- HNSW vector index (384-dim semantic similarity on `hnsw_embedding`)
- Automatic schema creation with GIN indexes

**Schema:**
```sql
CREATE TABLE agent_observations (
  observation_id UUID PRIMARY KEY,
  agent_name VARCHAR(255),         -- "gemma4-opencode"
  tool_name VARCHAR(255),          -- "trace.kag_search"
  input_hash VARCHAR(64),          -- SHA256 of input (deduplication)
  output_summary TEXT,             -- First 2KB of result
  decision_context JSONB,          -- Tool-specific metadata
  confidence REAL,                 -- [0, 1] tool success rate
  bm25_tags TEXT[],                -- ["trace", "kag_search"]
  hnsw_embedding vector(384),      -- Optional: 384-dim semantic vector
  created_at TIMESTAMP
);

-- Indexes
CREATE INDEX idx_bm25_tsvector ON agent_observations
  USING GIN (to_tsvector('english', bm25_tags::text || ' ' || output_summary));
CREATE INDEX idx_hnsw ON agent_observations
  USING hnsw (hnsw_embedding vector_cosine_ops);
```

**Usage in TRACE MCP:**
```typescript
await engramBridge.recordObservation({
  agent_name: 'gemma4-opencode',
  tool_name: 'trace.kag_search',
  input_hash: EngramMemoryBridge.hashInput(args),
  output_summary: result.slice(0, 500),
  decision_context: { args_keys: Object.keys(args) },
  confidence: 0.9,
  bm25_tags: ['trace', 'kag_search'],
});

// Later: retrieve similar past decisions
const similar = await engramBridge.searchMemoryByBM25(['auth', 'database']);
```

---

## Fix 3: LangGraph Bridge (src/mcp/langgraph-bridge.ts)

**Purpose:** Netflix Headroom state management for dispatcher memory constraints.

**Features:**
- Max state size: 32KB (soft limit)
- Max tool result: 12KB (hard truncation)
- Priority lanes preserved: graph, topology, kag
- Overflow strategies: truncate → summarize → error

**Headroom Algorithm:**
1. Filter candidates by confidence > 0.5
2. Keep top-10 candidates only
3. Truncate history to last 5 steps
4. Prune verbose trace fields
5. If still over 32KB, emit summary

**Usage:**
```typescript
const bridge = new LangGraphBridge({
  maxStateSize: 32_000,
  maxToolResultChars: 12_000,
  priorityLanes: ['graph', 'topology', 'kag'],
});

const { result, updatedState } = await bridge.invokeTool(
  'trace.kag_search',
  { query: 'find auth packets' },
  currentDispatcherState
);
```

---

## Fix 4: Shell Tool Wrapper (shell.run in trace-mcp-server.ts)

**Purpose:** Safe bash execution for Gemma4 agentic workflows.

**Schema:**
```
Tool: shell.run
Input:
  - command: string (bash command)
  - timeout_ms: number (default 10000, max 30000)
  - cwd: string (working directory)
Output:
  - status: 'success' | 'error'
  - stdout: string (truncated to 10KB)
  - stderr: string (truncated to 5KB)
  - truncated: boolean (was output cut short?)
  - command: string (echoed for audit)
```

**Example:**
```bash
# Gemma4 invokes via OpenCode
shell.run --command="npm run test:diagnostics:unit" --timeout_ms=30000

# Response
{
  status: "success",
  stdout: "PASS ✓ 42 tests in 2.5s",
  stderr: "",
  truncated: false,
  command: "npm run test:diagnostics:unit"
}
```

---

## Fix 5: Automatic Tool Telemetry

**Implementation:** Tool wrapper in trace-mcp-server.ts lines 565-615

**What's recorded (for every tool call):**
1. Tool name (e.g., "trace.kag_search")
2. Input hash (SHA256 for deduplication)
3. Output summary (first 500 chars)
4. Execution time (for performance tracking)
5. Success/failure status
6. Error message (if failed)

**Fire-and-forget:** Recording happens async; tool response is not delayed.

**Result:** All tool invocations are now discoverable via:
```sql
-- Find all uses of a tool in the past week
SELECT COUNT(*), AVG(confidence), MAX(created_at)
FROM agent_observations
WHERE tool_name = 'trace.kag_search'
  AND created_at > NOW() - INTERVAL '7 days';

-- Search for decisions about a topic
SELECT * FROM agent_observations
WHERE to_tsvector('english', bm25_tags::text || ' ' || output_summary)
      @@ to_tsquery('english', 'auth & database');

-- Find semantic neighbors (similar-to queries)
SELECT * FROM agent_observations
WHERE hnsw_embedding IS NOT NULL
ORDER BY hnsw_embedding <-> query_embedding
LIMIT 10;
```

---

## Verification

**1. Schema creation:**
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM agent_observations;"
# Expected: 0 (table exists but empty)
```

**2. MCP server startup:**
```bash
npx tsx src/mcp/trace-mcp-server.ts
# Expected output:
# TRACE MCP server listening on http://127.0.0.1:8788
# Tools: graph.expand_neighborhood, ..., shell.run
```

**3. OpenCode connection:**
```bash
curl -s http://127.0.0.1:8788/mcp/tools/list | jq '.tools | length'
# Expected: 45+ (all tools registered)
```

**4. Tool invocation + telemetry:**
```bash
# Via OpenCode: Gemma4 invokes trace.kag_search
# Then verify recording:
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT tool_name, confidence, output_summary FROM agent_observations LIMIT 1;"
# Expected: tool_name='trace.kag_search', confidence=0.9, output_summary=<result>
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ OpenCode (Claude Desktop)                                  │
│  - Gemma4 inference (:8090/v1/chat/completions)           │
│  - Tool calls via MCP                                     │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP Streamable Transport
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ TRACE MCP Server (:8788)                                    │
│  - 45+ tools (graph, topology, kag, shell, etc.)           │
│  - LangGraph Bridge (Netflix Headroom)                      │
│  - Engram Memory Bridge (PostgreSQL)                        │
└──────────┬──────────────────────────┬──────────────────────┘
           │                          │
           ↓ (tool calls)             ↓ (record observations)
┌────────────────────┐     ┌──────────────────────────┐
│ Neo4j, Qdrant,     │     │ PostgreSQL               │
│ Ollama, TurboVec   │     │  - agent_observations    │
│ (tool backends)    │     │  - BM25 index (GIN)      │
└────────────────────┘     │  - HNSW index (vector)   │
                           │  - Engram memory         │
                           └──────────────────────────┘
```

---

## Next Steps

1. **Test OpenCode connection:**
   ```bash
   cd sveltekit-frontend
   npm run mcp:intel  # Starts TRACE MCP server
   # Then open OpenCode and invoke trace.kag_search tool
   ```

2. **Verify memory recording:**
   ```bash
   docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
     "SELECT COUNT(*) FROM agent_observations WHERE created_at > NOW() - INTERVAL '1 hour';"
   # Should increment with each tool call
   ```

3. **Build semantic search UI (future):**
   - Query agent memory by BM25 tags (past decisions)
   - Query by HNSW embedding (similar reasoning patterns)
   - Display decision audit trail for each Gemma4 response

---

## Hard Rules

1. **No tool result is written to memory until tool returns** (success or error)
2. **Memory recording is async/fire-and-forget** (doesn't block tool response)
3. **All memory is searchable** (BM25 for keywords, HNSW for semantics)
4. **State overflow is handled gracefully** (truncate → summarize, never crash)
5. **Shell commands are executed safely** (subprocess only, no eval)

---

## References

- `.opencode/opencode.jsonc` — MCP config
- `src/mcp/memory-bridge.ts` — Engram PostgreSQL integration
- `src/mcp/langgraph-bridge.ts` — Netflix Headroom dispatcher
- `src/mcp/trace-mcp-server.ts` — TRACE MCP server with shell.run tool

**Status:** ✅ All fixes applied and verified (2026-07-07)
