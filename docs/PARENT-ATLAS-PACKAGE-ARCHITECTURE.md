# Parent Atlas Package Architecture — Unified Retrieval Facade

**Status**: ✅ **CORE CONTRACTS WIRED** (July 12, 2026)

## Overview

Parent Atlas has been restructured into a **unified retrieval facade with selectable policies**. This enables ACP (Agent Control Plane), production apps, and RLM (Retrieval with Long-term Memory) to share the same semantic infrastructure with different context assembly strategies.

## Package Structure

### `@deeds/parent-atlas-core`
**Pure contracts and deterministic logic — zero infrastructure dependencies**

```
packages/parent-atlas-core/src/
  contracts/
    retrieval.ts          # RetrievalFacade, RetrievalRequest, RetrievalResult
    policy-registry.ts    # RetrievalPolicy, PolicyRegistry, DEFAULT_POLICIES
    packet.ts             # RankedPacket, packet identity
    context.ts            # AceContext, RlmContext
    provenance.ts         # RetrievalTrace, execution telemetry
  identity/
    canonical-packet-id.ts   # Canonical lineage chain
    deduplicate.ts           # Identity resolution before fusion
  index.ts
```

**Exports**:
- `RetrievalFacade` — Single canonical interface
- `RetrievalRequest` — Consumer-facing input
- `RetrievalResult` — Consumer-facing output with ranked candidates + context
- `RetrievalUseCase` — "developer_chat" | "production_legal" | "code_navigation" | "agent_context" | "rlm_context"
- `RetrievalPolicy` — Per-use-case configuration (candidate limits, graph depth, CE weight, etc.)
- `DEFAULT_POLICIES` — Pre-tuned policies for each use case
- `PolicyRegistry` — Runtime policy lookup

**Does NOT export**:
- Database clients (no Postgres, Qdrant, Neo4j connections)
- HTTP servers (no SvelteKit routes)
- SvelteKit dependencies
- Gemma4-specific prompting

### `@deeds/parent-atlas-client`
**HTTP and MCP clients for consumers**

```
packages/parent-atlas-client/src/
  http-client.ts          # HTTP client for RetrievalFacade
  mcp-client.ts           # MCP protocol adapter
  errors.ts               # Error types
  index.ts
```

**Exports**:
- `HttpRetrievalClient` — HTTP client to Parent Atlas service
- `McpRetrievalClient` — MCP protocol wrapper
- Error types for graceful degradation

### `@deeds/parent-atlas-runtime`
**Infrastructure-backed implementation (database adapters, pipeline orchestration)**

```
packages/parent-atlas-runtime/src/
  facade/
    retrieval-facade.ts      # RetrievalFacade implementation
    policy-router.ts         # Route to policies
  adapters/
    postgres-bm25.adapter.ts      # BM25 recall stage
    qdrant-recall.adapter.ts       # Qdrant ANN stage
    identity-resolver.ts          # Canonical identity resolution
    rrf-fusion.adapter.ts          # Reciprocal rank fusion + dedup
    neo4j-traversal.adapter.ts     # Bounded graph expansion
    xgboost-reranker.adapter.ts    # Feature-based reranking
    crossencoder-reranker.adapter.ts  # CE final stage
  pipeline/
    retrieve-candidates.ts    # BM25 + Qdrant recall
    resolve-identities.ts     # Dedup by canonical packet_key
    fuse-candidates.ts        # RRF merge
    expand-graph.ts           # Neo4j k-hop expansion
    rerank-candidates.ts      # XGBoost + CE
    validate-evidence.ts      # Source validation gate
    assemble-context.ts       # ACE vs RLM assembly
  telemetry/
    retrieval-trace.ts        # Execution tracing
  index.ts
```

**Does NOT export**:
- Database credentials
- Direct database clients
- Hard-coded collection names
- Process-wide environment loading

## Unified Retrieval Facade

### Single Interface with Selectable Policies

```typescript
// Same facade, different behavior per use case
export interface RetrievalFacade {
  search(request: RetrievalRequest): Promise<RetrievalResult>;
  health(): Promise<boolean>;
}

// Request specifies the policy
export interface RetrievalRequest {
  query: string;
  useCase: RetrievalUseCase; // Routes to policy
  topK?: number;
  sourceScope?: string[];
  graphDepth?: number;
  tokenBudget?: number;
  requireSourceRefs?: boolean;
}

// Result includes both candidates and policy-specific context
export interface RetrievalResult {
  query: string;
  useCase: RetrievalUseCase;
  candidates: RankedCandidate[];
  context: AceContext | RlmContext; // Policy-specific assembly
  trace: RetrievalTrace;
}
```

### Policies by Use Case

| Use Case | BM25 | Qdrant | RFF | Graph | XGB | CE | Output | Context | Token Budget |
|----------|------|--------|-----|-------|-----|----|---------|---------| ------------|
| `developer_chat` | 100 | 100 | 80 | 20 | ✓ | ✓ | 8 | ACE | 8K |
| `production_legal` | 150 | 150 | 120 | 30 | ✓ | ✓ | 10 | RLM | 12K |
| `code_navigation` | 200 | 50 | 100 | 40 | ✓ | — | 20 | ACE | 4K |
| `agent_context` | 50 | 50 | 40 | 15 | ✓ | ✓ | 5 | ACE | 4K |
| `rlm_context` | 100 | 100 | 80 | 20 | ✓ | ✓ | 10 | RLM | 12K |

**Key tuning points**:
- **code_navigation** skips CrossEncoder (speed over accuracy for IDE)
- **production_legal** has higher CE weight (0.20) for ranking confidence
- **agent_context** has tight budgets for MCP tool calls
- **rlm_context** supports iterative retrieval with external memory

## Pipeline Flow

```
BM25 (100 candidates)          PostgreSQL full-text search
    ↓
Qdrant ANN (100 candidates)    768-dim semantic vectors
    ↓
Canonical Identity Resolution  Dedup by packet_key (before RRF)
    ↓
RRF Fusion (80 candidates)     Reciprocal rank fusion, dedup
    ↓
Graph Expansion (20 after XGB) Neo4j k-hop (policy determines depth)
    ↓
Feature Extraction             XGBoost or rule-based scoring
    ↓
CrossEncoder (10-20 candidates) Bounded final refinement
    ↓
Source Validation              Require source_ref if policy demands
    ↓
ACE or RLM Assembly            Policy-specific context building
    ↓
Final Output (5-10 candidates) Return to consumer
```

**Critical**: Identity resolution happens AFTER recall (BM25, Qdrant) but BEFORE fusion. This prevents duplicates from surviving as separate candidates under legacy chunk IDs, UUIDs, point IDs, and packet keys.

## Context Assembly Policies

### ACE (Agent Context Envelope)

For ACP and conversational assistants:

```typescript
export interface AceContext {
  task: string;              // Current agent task
  state: string;             // Workflow state
  packets: AcePacket[];       // Ranked packets (compact)
  constraints: string[];      // Hard constraints
  decisions: string[];        // Prior decisions
  tools?: ToolDescriptor[];   // Available tools
  tokenEstimate: number;      // For prompt fitting
}
```

**Use cases**: developer_chat, agent_context

**Characteristics**:
- Compact representation (fits MCP context windows)
- Operational focus (task + state + constraints)
- Tool integration ready

### RLM (Retrieval with Long-term Memory)

For iterative reasoning and external working memory:

```typescript
export interface RlmContext {
  objective: string;              // Goal to achieve
  workingSet: EvidencePacket[];    // Current evidence
  unresolvedQuestions: string[];   // Questions still pending
  retrievalHistory: RetrievalStep[]; // Prior retrieval attempts
  synthesisBudget: number;         // Tokens remaining for synthesis
}
```

**Use cases**: production_legal, rlm_context

**Characteristics**:
- Supports iterative retrieval loops
- Tracks unresolved questions for next query
- External memory for long synthesis sessions
- Synthesis budget tracking

## Consumer Integration

### ACP (Developer Assistant)

```typescript
// Import only contracts
import type { RetrievalFacade, RetrievalRequest } from '@deeds/parent-atlas-core';
import { HttpRetrievalClient } from '@deeds/parent-atlas-client';

const atlas = new HttpRetrievalClient('http://parent-atlas-service:3000');

const result = await atlas.search({
  query: 'How do I validate user sessions?',
  useCase: 'developer_chat',
  graphDepth: 2,
  tokenBudget: 8000,
  requireSourceRefs: true
});

// result.context is AceContext — ready for tool calling
```

### Production Application

```typescript
const atlas = new HttpRetrievalClient(process.env.ATLAS_SERVICE_URL);

const result = await atlas.search({
  query: user_query,
  useCase: 'production_legal',
  sourceScope: ['src/contracts', 'src/templates'], // Optional filtering
  tokenBudget: 12000,
  requireSourceRefs: true
});

// result.context is RlmContext — ready for iterative synthesis
```

### SvelteKit Route

Minimal, no logic:

```typescript
// src/routes/api/retrieve/+server.ts
import { json } from '@sveltejs/kit';
import { RetrievalRequestSchema } from '@deeds/parent-atlas-core';

export const POST = async ({ request, locals }) => {
  const input = RetrievalRequestSchema.parse(await request.json());

  // Route determines policy based on authenticated user/session
  const result = await locals.parentAtlas.search({
    ...input,
    useCase: 'production_legal', // Fixed for production app
    requireSourceRefs: true
  });

  return json(result);
};
```

**Route owns nothing**:
- No BM25 query construction
- No Qdrant search
- No RRF logic
- No graph traversal
- No reranking
- All delegated to Parent Atlas service

## Bounded CrossEncoder Funnel

CrossEncoder remains a **late-stage refinement** on CPU:

```
BM25/Qdrant → 80 candidates (RRF/dedup)
    ↓
Graph + XGBoost → 20 candidates (feature-aware reranking)
    ↓
CrossEncoder → 10-20 candidates (final refinement, CPU tolerable ~4s for 20)
    ↓
Output → 5-10 candidates (final ranking)
```

**Why bounded**:
- Latency on CPU: ~4s for 5 candidates, ~17.5s for 20 candidates
- Mxbai-rerank-base-v2 is a refinement pass, not primary retrieval
- Never send 100+ candidates to CE from interactive requests

## Files Created This Session

| File | Purpose | Lines |
|------|---------|-------|
| `packages/parent-atlas-core/src/contracts/retrieval.ts` | Unified facade contracts | 150 |
| `packages/parent-atlas-core/src/contracts/policy-registry.ts` | Policy lookup + defaults | 130 |
| `packages/parent-atlas-core/src/index.ts` | Core package exports | Updated |
| `packages/parent-atlas-retrieval/src/crossencoder/crossencoder-client.ts` | CE sidecar client | 170 |
| `packages/parent-atlas-retrieval/src/crossencoder/crossencoder-rerank-orchestrator.ts` | 5-signal blend | 140 |
| `packages/parent-atlas-retrieval/src/crossencoder/crossencoder-integration.test.ts` | CE tests | 380 |

## Verification

- ✅ RetrievalFacade interface defined
- ✅ RetrievalRequest/Result contracts finalized
- ✅ 5 default policies implemented (developer_chat, production_legal, code_navigation, agent_context, rlm_context)
- ✅ CrossEncoder client wired with graceful fallback
- ✅ 5-signal blend orchestrator ready (semantic + topology + latent + glyph + CE)
- ✅ ACE and RLM context types defined
- ✅ PolicyRegistry for runtime lookup
- ✅ Core package zero infrastructure (no DB, no SvelteKit)

## Next Steps

1. **Implement parent-atlas-runtime adapters** (Postgres BM25, Qdrant ANN, Neo4j traversal, XGBoost, RRF fusion)
2. **Implement identity-resolver** (canonical lineage, dedup before RRF)
3. **Wire SvelteKit routes** (thin + delegating to Parent Atlas service)
4. **Test E2E policies** (each use case through full pipeline)
5. **Benchmark NDCG@5** (XGBoost only vs. XGBoost + CE)

---

**Architectural rule**: Consumers import the Parent Atlas contract and client; the Parent Atlas runtime owns semantic infrastructure and canonical retrieval. This gives ACP and production apps shared semantic intelligence without coupling to the entire database and sidecar topology.
