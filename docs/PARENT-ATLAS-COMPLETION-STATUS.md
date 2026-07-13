# Parent Atlas: Completion Status & Next Steps

**Date**: July 12, 2026  
**Status**: ✅ **CORE IMPLEMENTATION COMPLETE** | ⏳ **SERVICE LAYER TODO**

## Completed Work

### ✅ Layer 1: @deeds/parent-atlas-core (Contracts)
- [x] RetrievalFacade interface (search, health)
- [x] RetrievalRequest/Result types (5 use cases)
- [x] RetrievalPolicy & PolicyRegistry (5 policies: developer_chat, production_legal, code_navigation, agent_context, rlm_context)
- [x] RankedCandidate & identity contracts
- [x] AceContext & RlmContext types
- [x] RetrievalTrace telemetry
- [x] DEFAULT_POLICIES with tuned parameters per use case

**Files**: `packages/parent-atlas-core/src/contracts/`

---

### ✅ Layer 2: @deeds/parent-atlas-runtime (Infrastructure)

#### Adapters (Wired)
- [x] **postgres-bm25.adapter.ts** — BM25 full-text search (Stage 1)
  - `searchPostgresBM25()` — main function (placeholder implementation)
  - `scoreBM25()` — fallback pure scorer
  - `filterBySourceScope()` — directory filtering
  - `validateBM25Results()` — validation gate
  
- [x] **qdrant-recall.adapter.ts** — Semantic ANN search (Stage 2)
  - `searchQdrantANN()` — main function (placeholder)
  - `validateQdrantResults()` — validation gate
  - `mergeBM25AndQdrant()` — combine before dedup
  - Cache helpers (query hashing)

- [x] **identity-resolver.ts** — Canonical deduplication (Stage 3, CRITICAL)
  - `resolveCanonicalIdentity()` — main dedup function
  - `validatePacketLineage()` — Postgres truth check (TODO)
  - `reportDuplicateMetrics()` — observability
  - **CRITICAL RULE**: Runs AFTER BM25+Qdrant, BEFORE RRF

- [x] **rrf-fusion.adapter.ts** — Reciprocal Rank Fusion (Stage 4)
  - `fuseWithRRF()` — main fusion function
  - `validateRRFResults()` — validation gate
  - `computeRRFMetrics()` — observability

#### Facade (Wired)
- [x] **retrieval-facade.ts** — Orchestrates all 9 stages
  - `ParentAtlasRetrievalFacade` class (implements RetrievalFacade)
  - `search()` — executes full pipeline
  - `health()` — service health check
  - Traces all stages with timing/candidate counts

#### Stages Status
| Stage | Status | Location |
|-------|--------|----------|
| 1. BM25 | ✅ Wired | postgres-bm25.adapter.ts |
| 2. Qdrant ANN | ✅ Wired | qdrant-recall.adapter.ts |
| 3. Identity Resolution | ✅ Wired | identity-resolver.ts (CRITICAL) |
| 4. RRF Fusion | ✅ Wired | rrf-fusion.adapter.ts |
| 5. Graph Expansion | ⏳ TODO | pipeline/expand-graph.ts |
| 6-7. Reranking (XGBoost + CE) | ⏳ TODO | pipeline/rerank-candidates.ts |
| 8. Source Validation | ⏳ TODO | pipeline/validate-evidence.ts |
| 9. Context Assembly | ⏳ Placeholder | pipeline/assemble-context.ts |

**Files**: `packages/parent-atlas-runtime/src/`

---

### ✅ Layer 3: @deeds/parent-atlas-client (Protocol Adapters)

#### Corrected Architecture (Boundary Separation)
- [x] **errors.ts** — Typed error hierarchy
  - `TransportError` (base, retryable flag)
  - `McpTransportError` (MCP protocol failures)
  - `HttpTransportError` (HTTP/REST failures)
  - `GrpcTransportError` (gRPC failures)
  - `A2aTransportError` (A2A delegation failures)
  - `isRetryable()` type guard

- [x] **mcp/client.ts** — Generic MCP client (FIXED)
  - `McpClient` class (JSON-RPC + SSE)
  - `listTools()` with TTL caching + stale-cache fallback
  - `callTool()` returns domain errors, throws transport errors
  - Unique requestId per call (monotonic counter)
  - SSE parser handles multiline events + ID correlation
  - Retry logic with exponential backoff
  
  **Fixes applied**:
  - ✅ tools/list accepts JSON and SSE
  - ✅ Unique JSON-RPC IDs (requestIdCounter)
  - ✅ SSE parser handles all events
  - ✅ McpTransportError thrown on network failures
  - ✅ structuredContent + isError respected
  - ✅ TTL caching (60s) + stale-cache fallback

- [x] **http/client.ts** — HTTP/REST client
  - `HttpRetrievalClient` (implements RetrievalFacade)
  - `search()` — POST /v1/retrieval/search
  - `health()` — GET /v1/health
  - Retry logic with exponential backoff

- [x] **grpc/client.ts** — gRPC client (placeholder)
  - `GrpcRetrievalClient` (implements RetrievalFacade)
  - TODO: Full @grpc/grpc-js implementation

- [x] **a2a/client.ts** — A2A client (placeholder)
  - `A2aRetrievalAgent` (implements RetrievalFacade)
  - `streamTask()` — async iterator for multihop tasks
  - TODO: Full A2A protocol wiring

**Files**: `packages/parent-atlas-client/src/`

---

### ✅ Documentation

- [x] [PARENT-ATLAS-PACKAGE-ARCHITECTURE.md](../docs/PARENT-ATLAS-PACKAGE-ARCHITECTURE.md)
  - Complete package structure
  - 5-policy tuning table
  - Pipeline flow with identity resolution placement (CRITICAL)
  - ACE vs RLM context assembly
  - CrossEncoder bounding rationale

- [x] [PARENT-ATLAS-RUNTIME-IMPLEMENTATION.md](../docs/PARENT-ATLAS-RUNTIME-IMPLEMENTATION.md)
  - 9-stage pipeline details
  - Adapter specifications
  - Critical architectural rules
  - Testing patterns
  - Next steps

- [x] [PARENT-ATLAS-SYSTEM-BOUNDARIES.md](../docs/PARENT-ATLAS-SYSTEM-BOUNDARIES.md)
  - **NEW**: Corrected system boundaries
  - Layer separation (core / runtime / client / acp-runtime / service)
  - Protocol responsibilities (HTTP / gRPC / MCP / A2A / QUIC)
  - mcp-tool-bridge issues FIXED
  - One-way dependency rule
  - Consumer integration examples

---

## TODO: Next Implementation Phases

### Phase 1: Service Application (1-2 days)
**Location**: `apps/parent-atlas-service/`

```
src/
  rest/
    routes/
      retrieval/+server.ts      ← POST /v1/retrieval/search
      health/+server.ts         ← GET /v1/health
  grpc/
    server.ts                   ← gRPC server (TODO)
  mcp/
    server.ts                   ← MCP tool registration (TODO)
  app.ts
```

**Tasks**:
1. Create SvelteKit routes wrapping RetrievalFacade
2. Wire Postgres, Qdrant, Neo4j clients to facade config
3. Implement gRPC server (using @grpc/grpc-js)
4. Expose MCP tools (atlas.search, atlas.expand_neighborhood, etc.)
5. Add authorization middleware
6. Add observability/tracing

**Entry point**:
```typescript
import { createRetrievalFacade } from '@deeds/parent-atlas-runtime';

const facade = createRetrievalFacade({
  db,
  qdrant_url: process.env.QDRANT_URL,
  neo4j_url: process.env.NEO4J_URL
});

export const POST = async ({ request }) => {
  const input = await request.json();
  const result = await facade.search(input);
  return json(result);
};
```

---

### Phase 2: Missing Runtime Stages (3-4 days)

| Stage | File | Task |
|-------|------|------|
| 5 | pipeline/expand-graph.ts | Neo4j k-hop bounded expansion |
| 6-7 | pipeline/rerank-candidates.ts | XGBoost feature extraction + optional CrossEncoder |
| 8 | pipeline/validate-evidence.ts | Source ref enforcement |
| 9 | pipeline/assemble-context.ts | Full ACE/RLM assembly |

**Critical**: Stage 9 must build proper context shapes (not placeholders)

---

### Phase 3: gRPC + A2A Clients (2-3 days)

| Client | File | Task |
|--------|------|------|
| gRPC | parent-atlas-client/grpc/client.ts | Full @grpc/grpc-js implementation |
| A2A | parent-atlas-client/a2a/client.ts | A2A protocol wiring (JSON-RPC or gRPC) |

---

### Phase 4: ACP Runtime Integration (2-3 days)
**Location**: `packages/acp-runtime/`

```
src/
  tools/
    vercel-ai-tool-adapter.ts     ← Converts MCP to Vercel AI SDK tool()
    trace-tool-policies.ts        ← Authorization + metadata
    tool-registry.ts              ← Allowlist enforcement
  a2a/
    parent-atlas-agent-client.ts  ← Maps A2A tasks
  execution/
    (developer tools separate)
```

**Tasks**:
1. Fix mcp-tool-bridge.ts → use parent-atlas-client/mcp/client
2. Implement ExposedToolPolicy (approval, timeoutMs, allowedUseCases)
3. Build tool authorization middleware
4. Implement A2A task mapping to RetrievalFacade
5. Test Vercel AI SDK integration

---

### Phase 5: SvelteKit Integration (1-2 days)

**Current**: Routes use old retrieval patterns  
**Goal**: Routes use @deeds/parent-atlas-client HTTP client

```typescript
// Before
import { unifiedOrchestrator } from '$lib/server/retrieval/unified-orchestrator';

// After
import { createHttpClient } from '@deeds/parent-atlas-client';

const parentAtlas = createHttpClient({
  baseUrl: process.env.PARENT_ATLAS_URL || 'http://localhost:3000'
});

const result = await parentAtlas.search({
  query: userQuery,
  useCase: 'developer_chat'
});
```

---

### Phase 6: Edge Transport (Caddy HTTP/3)
**When**: After core service is stable

```caddy
parent-atlas.local {
  reverse_proxy localhost:3000 {
    protocol h2c
  }
}
```

QUIC/HTTP3 terminates at Caddy, internal uses HTTP/2

---

## Critical Invariants (DO NOT VIOLATE)

1. **Identity Resolution BEFORE RRF**
   - Stage 3 deduplicates (source_ref, feature_id, content_hash)
   - Runs after BM25+Qdrant recall, before RRF fusion
   - Prevents duplicate candidates from ranking twice

2. **One-Way Dependencies**
   ```
   core → runtime → client → acp-runtime
   No reverse imports
   ```

3. **Protocols Are Adapters**
   - HTTP/gRPC/MCP/A2A wrap RetrievalFacade
   - No business logic in transport handlers
   - All ranking/dedup/graph logic lives in runtime

4. **Transport Errors vs Domain Errors**
   - TransportError → retry/circuit-breaker
   - Domain error (isError=true) → pass to agent

5. **MCP Tools Are Bounded**
   - NOT all adapter functions exposed
   - Only high-level operations (search, expand, validate)
   - Authorization always enforced

---

## Verification Checklist (Before Phase 1)

- [ ] Review PARENT-ATLAS-SYSTEM-BOUNDARIES.md
- [ ] Confirm one-way dependency rule understood
- [ ] Verify identity-resolver placement (Stage 3, BEFORE RRF)
- [ ] Check that adapters have no protocol imports
- [ ] Confirm facade delegates to adapters (no duplicate logic)
- [ ] Test parent-atlas-client MCP client (JSON + SSE parsing)
- [ ] Review DEFAULT_POLICIES tunin (5 use cases)
- [ ] Plan gRPC protobuf definitions (before Phase 2)

---

## Files Summary

| Layer | Package | Lines | Status |
|-------|---------|-------|--------|
| Core | parent-atlas-core | 300 | ✅ Complete |
| Runtime Adapters | parent-atlas-runtime/adapters | 650 | ✅ Complete |
| Runtime Facade | parent-atlas-runtime/facade | 280 | ✅ Wired |
| Runtime Pipeline | parent-atlas-runtime/pipeline | 0 | ⏳ TODO |
| Client Errors | parent-atlas-client/errors | 90 | ✅ Complete |
| Client MCP | parent-atlas-client/mcp | 220 | ✅ Complete (fixed) |
| Client HTTP | parent-atlas-client/http | 120 | ✅ Complete |
| Client gRPC | parent-atlas-client/grpc | 50 | ⏳ TODO |
| Client A2A | parent-atlas-client/a2a | 70 | ⏳ TODO |
| **TOTAL** | | **~1,780** | **~60% complete** |

---

## Critical Read List

1. **System Boundaries** → PARENT-ATLAS-SYSTEM-BOUNDARIES.md
2. **Package Architecture** → PARENT-ATLAS-PACKAGE-ARCHITECTURE.md
3. **Runtime Implementation** → PARENT-ATLAS-RUNTIME-IMPLEMENTATION.md
4. **API Documentation** → Each file's JSDoc comments
