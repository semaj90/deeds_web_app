# OpenCode + Engram Memory Bridge — Corrected Architecture (July 7, 2026)

## Summary

EngramMemoryBridge is a **decision memory layer** for agentic loops, NOT a state orchestrator. It records past observations so LangGraph nodes can ask "Have we seen this before?" and bias their decisions accordingly.

---

## Mental Model

```
┌──────────────────────────────────────────────────────────────┐
│ LangGraph Node (Active State)                                │
│  - traceId, query, action, hmm_state, manifold4d             │
│  - Reads shared state from dispatcher                        │
│  - Executes one step                                        │
│  - Calls MCP tool or updates state                          │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ├─ Before action: query Engram
                       │  └─ searchMemoryByLexical(['auth', 'database'])
                       │  └─ searchMemoryByHNSW(query_embedding)
                       │
                       ├─ Execute MCP tool
                       │
                       └─ After action: record outcome
                          └─ recordObservation({
                               agent_name: 'dispatcher',
                               tool_name: 'trace.kag_search',
                               input_hash: sha256(...),
                               output_summary: first_500_chars,
                               decision_context: { bitmap, hmm, manifold4d },
                               confidence: 0.9,
                               bm25_tags: ['auth', 'session'],
                               hnsw_embedding: [0.1, 0.2, ...]
                             })

┌──────────────────────────────────────────────────────────────┐
│ Engram Memory (Historical)                                   │
│  - agent_observations table (PostgreSQL)                     │
│  - Stores all past decisions with metadata                   │
│  - Indexed: tsvector (Postgres full-text) + HNSW pgvector    │
│  - Used to bias decisions, avoid repeated failures           │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Supporting Services                                           │
│  - Go Retrieval (sensory/search engine)                      │
│  - Postgres + Qdrant + Neo4j (truth + mirrors)               │
│  - Valkey (hot state masks)                                  │
│  - HMM + Naive Bayes (advisory routing signals)              │
│  - RRF (final deterministic fusion)                          │
│  - Gemma4 (explanation only)                                 │
└──────────────────────────────────────────────────────────────┘
```

---

## Three Critical Bugs Fixed

### Bug 1: Missing Extension Gates ✅ FIXED
**Issue**: `ensureSchema()` tried to create `vector(384)` column without ensuring `pgvector` extension.
**Fix**: Added extension gates:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

### Bug 2: Incorrect Vector Format ✅ FIXED
**Issue**: Inserted vectors as `Buffer.from(Float32Array.buffer)` (bytea). pgvector expects string format.
**Fix**: Changed to pgvector string:
```typescript
const embeddingValue = validated.hnsw_embedding
  ? `[${validated.hnsw_embedding.join(',')}]`
  : null;

// Insert with explicit cast
VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, NOW())
```

### Bug 3: Misleading Method Name ✅ FIXED
**Issue**: `searchMemoryByBM25()` was actually Postgres full-text search (tsvector + tsquery), not true BM25.
**Fix**: Renamed to `searchMemoryByLexical()` and clarified in docs:
```typescript
/**
 * Lexical search via Postgres full-text search (tsvector + tsquery + ts_rank)
 * Note: This is Postgres full-text search, not true BM25 
 * (which is probabilistic + corpus-aware).
 */
async searchMemoryByLexical(terms: string[], limit = 10): Promise<EngramObservation[]>
```

---

## API Surface

### `recordObservation(obs: ObservationPayload): Promise<uuid>`

Records a past decision for retrieval.

```typescript
await engramBridge.recordObservation({
  agent_name: 'dispatcher-node-3',
  tool_name: 'trace.kag_search',
  input_hash: EngramMemoryBridge.hashInput({ query, filters }),
  output_summary: result.slice(0, 500),
  decision_context: {
    bitmap: currentBitmap,
    hmm_state: 'canonical',
    manifold4d: { semantic: 0.82, structural: 0.74, runtime: 0.91, temporal: 0.63 },
    topK: 25,
    lane: 'qdrant_agg'
  },
  confidence: 0.9,
  bm25_tags: ['trace', 'kag_search', 'auth'],
  hnsw_embedding: queryEmbedding  // 384-dim array
});
```

### `searchMemoryByLexical(terms: string[], limit = 10): Promise<EngramObservation[]>`

Retrieve past observations matching lexical terms (Postgres full-text).

```typescript
const similar = await engramBridge.searchMemoryByLexical(
  ['auth', 'database'],
  10
);
// Returns: array of past observations ranked by ts_rank
// Use to: check "Have we searched for auth+database before? What worked?"
```

### `searchMemoryByHNSW(embedding: number[], limit = 10): Promise<EngramObservation[]>`

Retrieve past observations semantically similar to a query embedding (pgvector HNSW ANN).

```typescript
const queryEmbed = await ollama.embed(query);
const neighbors = await engramBridge.searchMemoryByHNSW(
  queryEmbed,
  10
);
// Returns: array of past observations ranked by cosine distance
// Use to: find "similar decision patterns" when lexical search is insufficient
```

### `static hashInput(input: unknown): string`

Deterministic SHA256 hash for deduplication.

```typescript
const inputHash = EngramMemoryBridge.hashInput({
  query: "where is auth implemented?",
  filters: { node_type: 'file' }
});
// Same input always produces same hash — enables deduplication
```

---

## Database Schema

```sql
CREATE TABLE agent_observations (
  observation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name VARCHAR(255) NOT NULL,        -- "dispatcher-node-3"
  tool_name VARCHAR(255) NOT NULL,         -- "trace.kag_search"
  input_hash VARCHAR(64) NOT NULL,         -- SHA256 of input (dedup key)
  output_summary TEXT NOT NULL,            -- First 2KB of result
  decision_context JSONB NOT NULL,         -- Structured metadata
  confidence REAL NOT NULL,                -- [0, 1] success rate
  bm25_tags TEXT[] NOT NULL,               -- Lexical tags for FTS
  hnsw_embedding vector(384),              -- 384-dim semantic embedding
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_agent_observations_bm25_tsvector
  ON agent_observations USING GIN (
    to_tsvector('english', bm25_tags::text || ' ' || output_summary)
  );

CREATE INDEX idx_agent_observations_hnsw
  ON agent_observations USING hnsw (hnsw_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_agent_observations_agent_tool
  ON agent_observations (agent_name, tool_name, created_at DESC);
```

---

## Role Boundaries

| Component | Role | Owns State? | Owns Memory? |
|-----------|------|------------|--------------|
| **LangGraph Node** | Active orchestrator | ✅ Yes (current run) | ❌ No (uses Engram for context) |
| **EngramMemoryBridge** | Historical decision log | ❌ No | ✅ Yes (past observations) |
| **Go Retrieval Sidecar** | Search/execution engine | ❌ No | ❌ No |
| **Postgres** | Durable canonical truth | ❌ No | ❌ No (but mirrors all stores) |
| **Valkey** | Hot state masks | ❌ No | ❌ No (bitmap, HMM hints, cache) |
| **Qdrant** | Semantic vector index | ❌ No | ❌ No (fast ANN mirror) |
| **Neo4j** | Topology/relationships | ❌ No | ❌ No (graph mirror) |
| **HMM + Naive Bayes** | Advisory routing signals | ❌ No | ❌ No (predicts next state) |
| **RRF** | Final deterministic fusion | ❌ No | ❌ No (blends lane scores) |
| **Gemma4** | Explanation/reasoning | ❌ No | ❌ No (consumes context, produces text) |

---

## Integration with LangGraph

Pseudo-code for a dispatcher node using Engram:

```typescript
const dispatcherNode = setup({
  types: {
    input: {} as AgentState,
    output: {} as AgentState,
  },
  actors: {
    loadPastMemory: fromPromise<EngramObservation[], { query: string }>(async ({ input }) => {
      // Before action: query Engram for similar past decisions
      const lexical = await engramBridge.searchMemoryByLexical(
        input.query.split(/\s+/).slice(0, 3),
        5
      );
      return lexical;
    }),
    executeAction: fromPromise<ToolResult, { state: AgentState }>(async ({ input }) => {
      // Execute the MCP tool
      const result = await callMcpTool(input.state.action.toolName, input.state.action.inputHash);
      return result;
    }),
  },
}).createMachine({
  initial: 'loadMemory',
  states: {
    loadMemory: {
      invoke: {
        src: 'loadPastMemory',
        input: ({ context }) => ({ query: context.query }),
        onDone: {
          actions: ({ event }) => {
            // Update state with past memory context
            context.memory.bm25Matches = event.output;
          },
          target: 'execute',
        },
      },
    },
    execute: {
      invoke: {
        src: 'executeAction',
        input: ({ context }) => ({ state: context }),
        onDone: {
          actions: ({ event }) => {
            // Record the outcome for future runs
            engramBridge.recordObservation({
              agent_name: 'dispatcher-node-3',
              tool_name: context.action.toolName,
              input_hash: context.action.inputHash,
              output_summary: event.output.data.slice(0, 500),
              decision_context: context.topology,
              confidence: event.output.confidence,
              bm25_tags: context.action.toolName.split('.'),
              hnsw_embedding: context.query_embedding,
            });
          },
          target: 'done',
        },
      },
    },
    done: {
      type: 'final',
    },
  },
});
```

---

## Next Steps

1. **Wire into TRACE MCP**: `trace-mcp-server.ts` imports `EngramMemoryBridge` and calls `recordObservation()` after each tool invocation.
2. **LangGraph dispatcher nodes**: Use `searchMemoryByLexical()` + `searchMemoryByHNSW()` to check for similar past decisions before selecting tool.
3. **A/B testing**: Compare decision quality with/without Engram context bias.
4. **Tuning**: Adjust confidence thresholds and tag strategies based on retrieval quality metrics.

---

**Status**: ✅ WIRED (bugs fixed, corrected mental model applied)
**Commit**: Ready for `/opsx:apply` once integrated into dispatcher nodes
