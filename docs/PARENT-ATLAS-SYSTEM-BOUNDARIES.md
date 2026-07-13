# Parent Atlas: System Boundaries & Protocol Separation

**Status**: ✅ **BOUNDARIES CORRECTED** (July 12, 2026)

## Core Principle

**One canonical retrieval operation. Multiple protocol adapters.**

Protocols (REST, gRPC, MCP, A2A, QUIC) are **replaceable adapters**, not core logic.

```
┌─────────────────────────────────────────┐
│   RetrievalFacade (canonical)           │
│                                         │
│   search(request) → RetrievalResult     │
│   health() → boolean                    │
└─────────────────────────────────────────┘
                   ↑
    ┌──────────────┼──────────────┐
    │              │              │
    ↓              ↓              ↓
  HTTP          gRPC             MCP
 (REST)       (internal)        (tools)
                                  │
                                  ↓
                              A2A
                        (task delegation)
```

## System Layers

### Layer 1: @deeds/parent-atlas-core
**Contracts and policies — zero infrastructure, zero protocols**

```
src/
  contracts/
    retrieval.ts        ← RetrievalFacade, RetrievalRequest, RetrievalResult
    policy-registry.ts  ← RetrievalPolicy, PolicyRegistry, DEFAULT_POLICIES
    packet.ts           ← RankedPacket, identity contract
    context.ts          ← AceContext, RlmContext
    provenance.ts       ← RetrievalTrace
  identity/
    canonical-packet-id.ts
  index.ts
```

**Exports**: Pure TypeScript interfaces and types
**Dependencies**: None (no npm imports)
**Protocol usage**: None (JSON-serializable types only)

**Hard rules**:
- ❌ NO HTTP, gRPC, MCP, A2A imports
- ❌ NO SvelteKit, Vercel AI SDK imports
- ✅ ONLY TypeScript types and Zod schemas

---

### Layer 2: @deeds/parent-atlas-runtime
**Infrastructure-backed implementation — database and service adapters**

```
src/
  adapters/
    postgres-bm25.adapter.ts       ← BM25 recall (Postgres full-text)
    qdrant-recall.adapter.ts        ← ANN recall (Qdrant HNSW)
    identity-resolver.ts            ← Canonical deduplication (CRITICAL)
    rrf-fusion.adapter.ts           ← RRF merge (reciprocal rank fusion)
  facade/
    retrieval-facade.ts             ← RetrievalFacade implementation
    policy-router.ts                ← (TODO)
  pipeline/
    retrieve-candidates.ts          ← (TODO)
    expand-graph.ts                 ← (TODO)
    rerank-candidates.ts            ← (TODO)
    assemble-context.ts             ← (TODO)
  index.ts
```

**Exports**: RetrievalFacade implementation, adapters
**Dependencies**: Drizzle ORM, @deeds/parent-atlas-core
**Protocol usage**: None (internal only)

**Hard rules**:
- ❌ NO HTTP/gRPC/MCP/A2A in adapters or facade
- ✅ CAN import from @deeds/parent-atlas-core
- ✅ CAN use Postgres, Qdrant, Neo4j clients
- ✅ All I/O is via adapter functions (no hardcoded network calls)

---

### Layer 3: @deeds/parent-atlas-client
**Protocol adapters and transport implementations**

```
src/
  errors.ts                   ← TransportError, McpTransportError, etc.
  mcp/
    client.ts                 ← Generic MCP client (JSON-RPC + SSE)
  http/
    client.ts                 ← HTTP/REST client (implements RetrievalFacade)
  grpc/
    client.ts                 ← gRPC client (TODO: full implementation)
  a2a/
    client.ts                 ← A2A client (task delegation)
  index.ts
```

**Exports**: Protocol clients, transport errors
**Dependencies**: @deeds/parent-atlas-core (contracts only)
**Protocol usage**: ✅ HTTP, gRPC, MCP, A2A

**Hard rules**:
- ✅ LIVES HERE: Protocol handling, transport errors, retries, timeout
- ✅ CAN import from @deeds/parent-atlas-core (contracts)
- ❌ CANNOT import from parent-atlas-runtime (no server-side logic in client)
- ❌ NO business logic (ranking, deduplication, graph traversal)

---

### Layer 4: @acp-runtime
**Agent-specific tool wrappers and execution**

```
src/
  tools/
    vercel-ai-tool-adapter.ts   ← Converts MCP tools to Vercel AI SDK
    trace-tool-policies.ts      ← Authorization policies (metadata)
    tool-registry.ts            ← Allowlist + policy enforcement
  a2a/
    parent-atlas-agent-client.ts ← Maps A2A tasks to RetrievalFacade
  execution/
    shell-executor.ts           ← (developer tools only)
    filesystem-executor.ts      ← (developer tools only)
  index.ts
```

**Exports**: Tool adapters, authorization middleware
**Dependencies**: Vercel AI SDK, @deeds/parent-atlas-client, SvelteKit/locals
**Protocol usage**: MCP (as input), A2A (as output)

**Hard rules**:
- ✅ LIVES HERE: Vercel AI SDK conversion, authorization, tool allowlists
- ✅ CAN import from @deeds/parent-atlas-client (transport clients)
- ✅ CAN import from @deeds/parent-atlas-core (contracts)
- ❌ CANNOT call parent-atlas-runtime directly (use clients instead)

---

### Layer 5: apps/parent-atlas-service
**Main service application — orchestrates runtime + exposes protocols**

```
src/
  rest/
    routes/
      +server.ts              ← GET/POST /v1/retrieval/search
      health.ts               ← GET /v1/health
  grpc/
    server.ts                 ← (TODO)
  mcp/
    server.ts                 ← MCP tools (TODO)
  app.ts
```

**Exports**: HTTP service, gRPC server, MCP tools
**Dependencies**: All layers (runtime, client, core)

**Responsibility**:
- Route HTTP requests → RetrievalFacade
- Expose gRPC interface (internal only)
- Publish MCP tools (agent tooling)
- Implement authorization & telemetry

---

## Transport Responsibilities

### HTTP/REST (Browser + External Apps)
```
Browser/SvelteKit
    ↓ HTTPS
POST /v1/retrieval/search
Request:  RetrievalRequest (JSON)
Response: RetrievalResult (JSON)
    ↓
@deeds/parent-atlas-client/http/client.ts
    ↓
@deeds/parent-atlas-runtime/facade/retrieval-facade.ts
    ↓
Postgres BM25 + Qdrant ANN + Neo4j + RRF
```

**When to use**: Public application API, browser, external tools
**Transport**: HTTP/3 (QUIC) at edge via Caddy, HTTP/2 internally

---

### gRPC (Internal Service-to-Service)
```
Go retrieval service
    ↓ gRPC over HTTP/2
/parent_atlas.RetrievalService/Search
Request:  RetrievalRequest (protobuf)
Response: RetrievalResult (protobuf)
    ↓
@deeds/parent-atlas-client/grpc/client.ts
    ↓
@deeds/parent-atlas-runtime/facade/retrieval-facade.ts
```

**When to use**: Low-latency internal calls (Go services, microservices)
**Transport**: HTTP/2 (persistent, multiplexed)

---

### MCP (Agent/Model Tool Execution)
```
ACP Agent / LLM
    ↓ HTTP + SSE (JSON-RPC)
POST /mcp
Method: tools/call
    ↓
@acp-runtime/tools/vercel-ai-tool-adapter.ts
    ↓
@deeds/parent-atlas-client/mcp/client.ts
    ↓
@deeds/parent-atlas-runtime/facade/retrieval-facade.ts
```

**When to use**: Tool calling from agents, embedding in LLM systems
**Transport**: Streamable HTTP (POST with optional SSE response)

**MCP tools to expose** (bounded set):
- `atlas.search` — single search request
- `atlas.expand_neighborhood` — graph expansion
- `atlas.validate_references` — source validation
- (NOT low-level adapter functions)

---

### A2A (Agent-to-Agent Task Delegation)
```
ACP Agent
    ↓ A2A JSON-RPC or gRPC
SendMessage(..., goal)
    ↓
Parent Atlas Agent
    ↓
@deeds/parent-atlas-client/a2a/client.ts
    ↓
@acp-runtime/a2a/parent-atlas-agent-client.ts
    ↓
RetrievalFacade.search()
```

**When to use**: Multihop investigations, task state tracking, streaming artifacts
**Transport**: A2A protocol (JSON-RPC or gRPC binding)

**Difference from MCP**:
- MCP: tool call → single result (synchronous)
- A2A: task submission → stream of artifacts → completion (asynchronous)

---

### QUIC/HTTP3 (Edge Transport)
```
External Client
    ↓ HTTP/3 over QUIC
Caddy (reverse proxy)
    ↓ HTTP/2 or gRPC (internal)
Parent Atlas Service
```

**QUIC terminates at Caddy** (edge). Internal network uses HTTP/2 or gRPC.

**Do NOT**:
- Rewrite Postgres/Qdrant/gRPC to speak QUIC
- Couple QUIC to runtime code
- Treat QUIC as a separate API

---

## Critical Architectural Rules

### Rule 1: Identity Resolution BEFORE RRF
```
✅ CORRECT:
BM25 → Qdrant → Identity Resolution → RRF

❌ WRONG:
BM25 → Qdrant → RRF → Identity Resolution
(duplicates survive fusion, rank twice)
```

**Lives in**: @deeds/parent-atlas-runtime/adapters/identity-resolver.ts
**Called in**: retrieval-facade.ts, Stage 3

---

### Rule 2: Graceful Fallback on Transport Errors
```
HTTP call fails? → Retry with backoff (via HttpTransportError)
MCP tool unavailable? → Return empty fallback, continue
Qdrant down? → Use BM25 only
Graph expansion fails? → Skip, continue with core candidates
```

**Pattern**: TransportError on network/protocol failures → retry or escalate
**NOT error handling**: Domain-level tool failures (tool returns isError=true) → pass to agent

---

### Rule 3: One-Way Dependencies
```
@deeds/parent-atlas-core
    ↑ (no imports from below)
@deeds/parent-atlas-runtime (imports only core)
    ↑ (no imports from below)
@deeds/parent-atlas-client (imports core, NOT runtime)
    ↑
@acp-runtime (imports client + core, accesses runtime via HTTP)
```

**Do NOT**: Import parent-atlas-runtime into parent-atlas-client or ACP (breaks the layer)

---

### Rule 4: Protocols Are Adapters, Not Business Logic
```
❌ HTTP handler implements ranking:
POST /v1/retrieval/search {
  candidates.sort(...)
  candidates.slice(0, 10)
  return candidates
}

✅ HTTP handler delegates to facade:
POST /v1/retrieval/search {
  result = await facade.search(request)
  return result
}
```

**All logic belongs in**: @deeds/parent-atlas-runtime/facade

---

## Transport Protocol Selection (Decision Tree)

| Scenario | Transport | Why |
|----------|-----------|-----|
| Browser fetches search results | HTTP/REST + QUIC edge | Stateless, firewall-friendly, cacheable |
| Internal service calls retrieval | gRPC | Low latency, typed, multiplexed |
| Model calls retrieval as a tool | MCP Streamable HTTP | Standard agent integration, discoverable |
| ACP delegates multihop task | A2A (JSON-RPC or gRPC) | Async, state tracking, streaming |
| Production app embeds Parent Atlas | HTTP REST client | Simple, requires no agent runtime |

---

## Example: Consumer Integration

### Browser via HTTP
```typescript
import { createHttpClient } from '@deeds/parent-atlas-client';

const client = createHttpClient({ baseUrl: 'https://api.example.com' });
const result = await client.search({
  query: 'How do I validate sessions?',
  useCase: 'developer_chat'
});
```

### Go Service via gRPC
```go
import "parent-atlas/proto/retrieval"

conn, _ := grpc.Dial("parent-atlas:50051")
client := retrieval.NewRetrievalClient(conn)
result, _ := client.Search(ctx, &retrieval.RetrievalRequest{
  Query: "...",
  UseCase: "code_navigation",
})
```

### ACP Agent via MCP
```typescript
import { buildAiSdkToolMap } from '@acp-runtime/tools/vercel-ai-tool-adapter';
import { createMcpClient } from '@deeds/parent-atlas-client';

const mcp = createMcpClient({ url: 'http://parent-atlas-service:8788' });
const tools = await buildAiSdkToolMap(mcp, TRACE_TOOL_POLICIES, context);

const response = await generateText({
  model: gemini,
  tools,
  prompt: userQuery
});
```

---

## mcp-tool-bridge Issues (Fixed in client layer)

| Issue | Was | Now |
|-------|-----|-----|
| tools/list accepts only JSON | ❌ Fails on SSE | ✅ Handles both JSON and SSE |
| Request IDs all use 1 | ❌ Ambiguous in parallel calls | ✅ Monotonic requestIdCounter |
| SSE parser incomplete | ❌ Only first event | ✅ Extracts all messages, matches ID |
| MCP failures return success | ❌ Model feeds back as valid | ✅ McpTransportError thrown, retry logic |
| structuredContent ignored | ❌ Only content[0].text | ✅ Checks structuredContent + all content items |
| Tool allowlist strings only | ❌ No authorization metadata | ✅ ExposedToolPolicy with approval/timeout/scope |
| Tool caching permanent | ❌ Restart loses new tools | ✅ TTL 60s + stale-cache fallback |
| No ID collision detection | ❌ name collision risk | ✅ Collision detection on escapeToolName |

---

## Next Steps

1. **Implement parent-atlas-service** (REST routes, gRPC server — both thin wrappers)
2. **Implement gRPC client** in parent-atlas-client (wire @grpc/grpc-js)
3. **Implement A2A client** (wire A2A protocol to parent-atlas-runtime)
4. **Implement acp-runtime/tools** (Vercel AI SDK adapter with corrected MCP client)
5. **Wire SvelteKit routes** to use @deeds/parent-atlas-client HTTP client
6. **Add authorization middleware** (tool allowlists, per-use-case policies)
7. **Benchmark protocols** (REST vs gRPC latency, throughput)
8. **Deploy edge QUIC** (Caddy HTTP/3 termination)

---

## References

- [PARENT-ATLAS-PACKAGE-ARCHITECTURE.md](./PARENT-ATLAS-PACKAGE-ARCHITECTURE.md) — Contracts and policies
- [PARENT-ATLAS-RUNTIME-IMPLEMENTATION.md](./PARENT-ATLAS-RUNTIME-IMPLEMENTATION.md) — Adapters and facade
- `packages/parent-atlas-core/` — Contracts only
- `packages/parent-atlas-runtime/` — Infrastructure + facade
- `packages/parent-atlas-client/` — Protocol adapters
- `packages/acp-runtime/` — Agent tool wrappers (TODO)
- `apps/parent-atlas-service/` — Main service application (TODO)
