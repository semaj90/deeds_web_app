# Unified Platform Knowledge Graph — Complete Architecture Spec

**Last Updated**: 2026-05-03
**Status**: Design Complete, Phase 1-2 Implemented
**Vision**: Four-layer knowledge graph unifying runtime, codebase, legal, and AST graphs

---

## Overview

The **Unified Platform Knowledge Graph** integrates four distinct graph layers into a single searchable, debuggable, recommendation-friendly system across your entire legal AI stack:

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Runtime Architecture Graph                        │
│  → Cache tiers, services, lanes, routers, queues           │
│  → Storage: Neo4j (live ops graph)                          │
└─────────────────────────────────────────────────────────────┘
                         ↓ TRACES, USES, DEPENDS_ON
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Codebase Knowledge Graph                          │
│  → Files, routes, components, stores, modules              │
│  → Storage: Neo4j (structure) + Qdrant (semantics)         │
└─────────────────────────────────────────────────────────────┘
                         ↓ SERVES, FETCHES, QUERIES
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Legal / Evidence Graph                            │
│  → Cases, evidence, citations, statutes, entities          │
│  → Storage: Postgres (source) + Neo4j (graph) + Qdrant     │
└─────────────────────────────────────────────────────────────┘
                         ↓ REFERENCES, DERIVED_FROM
┌─────────────────────────────────────────────────────────────┐
│ Layer 4: AST / Symbol Graph                                │
│  → Symbols, functions, classes, imports, exports           │
│  → Storage: Neo4j (graph) + Postgres (metadata)            │
└─────────────────────────────────────────────────────────────┘
```

**Cross-layer edges** enable powerful queries:
- "Which code files call this API endpoint?" (Layer 2 → Layer 1)
- "Which evidence items use this inference lane?" (Layer 3 → Layer 1)
- "Which components import this orphaned module?" (Layer 4 → Layer 2)
- "Which cases cite statutes that are missing embeddings?" (Layer 3 → Layer 3)

## May 2026 Readiness Matrix

The architecture below remains the target model, but the live repository is unevenly implemented. Use this matrix as the current reality check before treating every later section as equally production-ready.

| Surface | Primary anchors | Readiness | Current reality |
|---------|-----------------|-----------|-----------------|
| ACE synthesis and context assembly | `sveltekit-frontend/src/lib/server/ace/context-assembler.ts`, `sveltekit-frontend/src/routes/api/synthesis/generate/+server.ts`, `sveltekit-frontend/src/routes/api/sse/chat/+server.ts` | Live | This is an active request-path surface. It assembles RAG, KAG, graph/community context, chat memory, and codebase context for synthesis routes that are already in use. |
| ACP tool plane | `sveltekit-frontend/src/lib/services/knowledge-search/ACPToolRegistry.ts`, `sveltekit-frontend/src/routes/api/acp/tools/+server.ts`, `sveltekit-frontend/src/routes/api/acp/execute/+server.ts` | Live | Tool discovery and execution are wired as a separate bounded plane. This is not just a design concept and should be documented separately from ACE. |
| Bifrost L1/L2 cache chain | `sveltekit-frontend/src/lib/server/ollama.ts`, `sveltekit-frontend/src/lib/server/cache/redis-exact-match.ts`, `sveltekit-frontend/src/routes/api/cache/bifrost/check/+server.ts`, `docker-compose.yml` | Production | Redis exact-match and Bifrost semantic caching are real runtime tiers used by synthesis, analytics, and codebase analysis flows. |
| Codebase-index pipeline | `sveltekit-frontend/src/routes/api/codebase-index/orchestrate/+server.ts`, `sveltekit-frontend/src/routes/api/codebase-index/index-stream/+server.ts`, `sveltekit-frontend/src/lib/components/admin/PipelineProgress.svelte` | Implemented | The indexing and summarization spine is live, has direct UI entrypoints, and already writes graph/search artifacts to the backing stores. |
| Community Graph / GraphRAG layer | `sveltekit-frontend/src/lib/server/graph/community-graph.ts`, `sveltekit-frontend/src/lib/server/ace/context-assembler.ts` | Implemented | Community detection is a real graph-memory layer and ACE can consume it today. This is the nearest thing to GraphRAG already present in the repo. |
| Hypergraph 4D topology | `sveltekit-frontend/scripts/run-hypergraph.ts`, `sveltekit-frontend/src/lib/server/graph/hypergraph-4d.ts`, `sveltekit-frontend/src/lib/server/retrieval/topological-search.ts`, `sveltekit-frontend/scripts/ci-smoke-hypergraph.mjs` | Implemented, build-dependent | Retrieval code reads the Redis hyperedge shape today, but freshness depends on the standalone hypergraph writer being run and the smoke guard staying green. |
| LangGraph sidecar | `sveltekit-frontend/src/lib/server/ai/langgraph-client.ts`, `sveltekit-frontend/src/routes/api/synthesis/generate/+server.ts`, `docker-compose.yml` | Optional live integration | There is real client and container wiring for LangGraph on port `8091`, but it is env-gated rather than a mandatory always-on tier. |
| Inference router and TurboQuant cascade | `sveltekit-frontend/src/lib/server/inference/inference-router.ts`, `sveltekit-frontend/src/routes/api/ai/chat/+server.ts`, `sveltekit-frontend/src/routes/api/knowledge/stream/+server.ts` | Live with optional backends | The cascade is actively consumed by server routes, but several tiers remain optional depending on which runtimes are up. |
| Unified four-layer knowledge graph | This document plus Neo4j/Qdrant/Postgres integration points above | Partial | The repo has live slices of the runtime graph, codebase graph, graph augmentation, and legal retrieval, but the full cross-layer graph described below is still only partially unified. |

### Recommended Order Of Trust

- Treat ACE, ACP, Bifrost, the inference router, and the codebase-index pipeline as live operational surfaces first.
- Treat community graph and hypergraph layers as implemented augmentation layers whose value depends on upstream build freshness.
- Treat LangGraph as a real optional sidecar, not a guaranteed baseline.
- Treat the fully unified four-layer graph below as the long-form target architecture rather than as a claim that every cross-layer edge already exists.

---

## Storage Architecture

### Storage Layer Mapping

| Storage | Purpose | Data Types |
|---------|---------|------------|
| **Neo4j** | Graph traversal, recommendations, unified queries | All 4 layers (nodes + edges) |
| **Qdrant** | Semantic chunks, vector similarity | Codebase chunks, legal corpus, evidence, summaries |
| **Postgres JSONB** | Canonical metadata, audit trail, schema truth | Route metadata, feature flags, sync state |
| **CouchDB** | Cached graph outputs, DAG cache, inference logs | Precomputed views, D3 exports, Obsidian snapshots |
| **Redis** | L1 cache, temporary graph query results | ACE bundles, retrieval bundles |

### Why This Split?

- **Neo4j**: Fast graph traversal (e.g., "find all evidence cited in this case")
- **Qdrant**: Semantic similarity (e.g., "find similar code chunks")
- **Postgres**: Source of truth for relational data (cases, evidence, citations)
- **CouchDB**: Precomputed graph snapshots (avoid re-querying Neo4j)
- **Redis**: Temporary cache for hot graph queries

---

## Layer 1: Runtime Architecture Graph

### Node Types

```typescript
// Neo4j Node Schema
type CacheTier = {
  label: 'CacheTier';
  tier: 'L1' | 'L2' | 'L3';
  type: 'exact-match' | 'semantic' | 'vector-search';
  latency_ms: number;
  hit_rate: number; // 0.0-1.0
  speedup_cpu: number;
  speedup_gpu: number;
  ttl_seconds: number;
  status: 'production' | 'experimental';
};

type Service = {
  label: 'Service';
  name: string;
  type: 'database' | 'cache' | 'vector-db' | 'message-queue' | 'object-storage' | 'observability';
  port: number;
  protocol: string;
  engine: string;
  status: 'production' | 'optional';
};

type Lane = {
  label: 'Lane';
  name: string;
  tier: number; // 0-7
  type: 'client' | 'server' | 'analysis';
  runtime: string; // 'Ollama', 'Transformers.js', 'LiteRT-LM', etc.
  model: string;
  quantization: string;
  backend: 'CUDA' | 'WebGPU' | 'WASM' | 'XNNPACK';
  latency_ms: number;
  throughput_tps: number;
  vram_gb: number;
  status: 'production' | 'implemented' | 'optional' | 'experimental';
  needs_verification: boolean;
};

type Router = {
  label: 'Router';
  name: string;
  type: 'client' | 'server';
  file: string; // TypeScript file path
  tiers: number;
  status: 'production';
};

type Queue = {
  label: 'Queue';
  name: string;
  exchange: string;
  routing_key: string;
  ttl_ms: number;
  has_consumer: boolean;
  status: 'production';
};

type Worker = {
  label: 'Worker';
  name: string;
  queue: string;
  handler_class: string;
  file: string;
  status: 'production';
};

type Collection = {
  label: 'Collection';
  name: string;
  vectors: number;
  quantization: 'INT8' | 'UINT8' | 'FLOAT32';
  dimensions: number;
  status: 'production';
};

type Table = {
  label: 'Table';
  name: string;
  columns: number;
  has_jsonb: boolean;
  has_vector: boolean;
  status: 'production';
};
```

### Edge Types

```typescript
// Neo4j Relationship Schema
type RuntimeEdge =
  | { type: 'TIER_1' | 'TIER_2' | 'TIER_3' | 'TIER_4' | 'TIER_5' | 'TIER_6' | 'TIER_7'; latency_ms: number }
  | { type: 'FALLS_BACK_TO'; when: string }
  | { type: 'BACKED_BY' }
  | { type: 'USES_FOR'; purpose: string }
  | { type: 'PUBLISHES'; queue: string }
  | { type: 'CONSUMES'; queue: string }
  | { type: 'READS_FROM'; collection: string }
  | { type: 'WRITES_TO'; collection: string }
  | { type: 'TRACES'; endpoints: number }
  | { type: 'STORES_IN' }
  | { type: 'ESCALATES_TO'; score_threshold: number };
```

### Example Nodes (Existing)

```cypher
// Redis L1 Cache
CREATE (redis_l1:CacheTier {
  tier: 'L1',
  type: 'exact-match',
  latency_ms: 5,
  hit_rate: 0.25,
  speedup_cpu: 6542,
  speedup_gpu: 5079,
  ttl_seconds: 3600,
  status: 'production'
})

// Bifrost L2 Cache
CREATE (bifrost_l2:CacheTier {
  tier: 'L2',
  type: 'semantic',
  latency_ms: 3000,
  hit_rate: 0.80,
  status: 'production'
})

// Ollama Lane
CREATE (ollama:Lane {
  name: 'Ollama',
  tier: 7,
  type: 'server',
  runtime: 'Ollama',
  model: 'gemma4-legal Q4_K_M',
  backend: 'CUDA',
  latency_ms: 25000,
  vram_gb: 5.8,
  status: 'production',
  always_succeeds: true
})

// RabbitMQ Queue
CREATE (evidence_queue:Queue {
  name: 'evidence.process',
  exchange: 'legal-ai-exchange',
  routing_key: 'evidence.process',
  ttl_ms: 3600000,
  has_consumer: true,
  status: 'production'
})

// PostgreSQL Table
CREATE (evidence_table:Table {
  name: 'evidence',
  columns: 25,
  has_jsonb: true,
  has_vector: false,
  status: 'production'
})
```

**Status**: ✅ **Layer 1 Complete** (25 nodes, 50+ edges in `runtime-architecture-graph.cypher`)

---

## Layer 2: Codebase Knowledge Graph

### Node Types

```typescript
type File = {
  label: 'File';
  path: string;
  type: 'route' | 'component' | 'server' | 'store' | 'worker' | 'proto' | 'native' | 'config';
  lines: number;
  language: 'typescript' | 'svelte' | 'javascript' | 'go' | 'cpp' | 'proto';
  last_modified: number; // timestamp
  has_tests: boolean;
  status: 'active' | 'orphan' | 'deprecated';
};

type Directory = {
  label: 'Directory';
  path: string;
  file_count: number;
  total_lines: number;
  purpose: string;
};

type Route = {
  label: 'Route';
  path: string; // SvelteKit route path
  file: string; // +page.svelte or +server.ts
  has_loader: boolean;
  has_action: boolean;
  auth_required: boolean;
  zod_validated: boolean;
  status: 'active' | 'orphan';
};

type Component = {
  label: 'Component';
  name: string;
  file: string;
  is_bits_ui: boolean;
  is_runes: boolean;
  props_count: number;
  consumers: number;
  status: 'active' | 'orphan';
};

type Store = {
  label: 'Store';
  name: string;
  file: string;
  is_runes: boolean; // $state vs writable()
  consumers: number;
  status: 'active' | 'orphan';
};

type ServerModule = {
  label: 'ServerModule';
  name: string;
  file: string;
  exports: string[];
  consumers: number;
  status: 'active' | 'orphan';
};

type QueueHandler = {
  label: 'QueueHandler';
  name: string;
  file: string;
  queue: string;
  worker_class: string;
  status: 'active';
};

type Proto = {
  label: 'Proto';
  name: string;
  file: string;
  messages: number;
  services: number;
  consumers: number;
};

type NativeModule = {
  label: 'NativeModule';
  name: string;
  file: string; // .node binary
  exports: string[]; // GPU functions
  size_kb: number;
  status: 'compiled' | 'missing';
};

type DockerService = {
  label: 'DockerService';
  name: string;
  image: string;
  port: number;
  status: 'running' | 'stopped';
};
```

### Edge Types

```typescript
type CodebaseEdge =
  | { type: 'IMPORTS'; imported_symbols: string[] }
  | { type: 'CONTAINS' } // Directory → File
  | { type: 'CALLS'; call_count: number }
  | { type: 'USES_STORE'; read_write: 'read' | 'write' | 'both' }
  | { type: 'USES_COMPONENT'; in_template: boolean }
  | { type: 'USES_ROUTE'; fetch_or_link: 'fetch' | 'link' | 'both' }
  | { type: 'USES_QUEUE'; action: 'publish' | 'consume' }
  | { type: 'USES_PROTO'; message_types: string[] }
  | { type: 'USES_NATIVE'; functions: string[] }
  | { type: 'SERVES'; method: 'GET' | 'POST' | 'PUT' | 'DELETE' }
  | { type: 'SIMILAR_TO'; similarity: number }; // Semantic similarity (Qdrant)
```

### Example Queries (Missing Components)

```cypher
// Find orphaned components (no consumers)
MATCH (c:Component)
WHERE c.consumers = 0 AND c.status = 'active'
RETURN c.name, c.file
ORDER BY c.name

// Find routes without loaders (data fetching)
MATCH (r:Route)
WHERE r.has_loader = false AND r.status = 'active'
RETURN r.path, r.file

// Find stores with no consumers
MATCH (s:Store)
WHERE s.consumers = 0
RETURN s.name, s.file

// Find queues with no consumers
MATCH (q:Queue)
WHERE q.has_consumer = false
RETURN q.name

// Find files that import nothing and are imported by nothing
MATCH (f:File)
WHERE NOT (f)-[:IMPORTS]->() AND NOT ()-[:IMPORTS]->(f)
RETURN f.path, f.type

// Find semantically similar files with no structural relation
MATCH (f1:File)-[s:SIMILAR_TO]->(f2:File)
WHERE s.similarity > 0.8
  AND NOT (f1)-[:IMPORTS|CALLS*1..2]-(f2)
RETURN f1.path, f2.path, s.similarity
ORDER BY s.similarity DESC

// Find runtime services with no code references
MATCH (s:Service)
WHERE NOT (s)<-[:USES_FOR|BACKED_BY]-()
RETURN s.name, s.port
```

**Status**: ⚠️ **Phase 2 Needed** (AST extraction + import graph + semantic similarity edges)

---

## Layer 3: Legal / Evidence Graph

### May 2026 Reality Check
The legal/evidence side is not just a conceptual mirror of the codebase graph. Its most trustworthy current substrate is the evidence upload and retrieval path backed by PostgreSQL, vector storage, and `yorha_evidence_connections`, with Neo4j and hypergraph layers acting as augmentation rather than the sole graph of record.

| Surface | What is actually live now | Current trust |
|---------|---------------------------|---------------|
| Evidence upload lifecycle | `POST /api/evidence/upload` is an auth-guarded multipart pipeline that writes to MinIO and PostgreSQL, then runs extraction, chunking, embedding, entity extraction, forensics, summaries, and downstream invalidation. It is paired with `GET /api/evidence/[docId]/status`, `GET /api/evidence/realtime`, and `GET /api/evidence/[id]/download`, which completes the upload → progress → retrieval loop. | High |
| Evidence search and KAG retrieval | `POST /api/evidence/search` is already a real RAG + KAG + DAG route, not a thin placeholder. It embeds with gRPC/HTTP fallback, caches results, reranks with legal signals, and explicitly traverses `yorha_evidence_connections` for graph-hop enrichment. Multiple pages, upload flows, and machines call it directly. | High |
| Evidence relationships and board graph | `GET/POST /api/evidence/relationships` and `POST /api/evidence/connections` are live board-level graph surfaces used by evidence board and relationship inspector components. These are concrete graph-editing/readout routes, even though they are narrower than a full unified knowledge graph. | Medium-High |
| Postgres evidence graph of record | The most concrete current graph layer is the Postgres-backed `yorha_evidence_nodes` and `yorha_evidence_connections` model. `evidence-analysis-pipeline.ts` and the upload path write into it, `graph-context.ts` traverses it, and `/api/sse/chat`, `/api/evidence/search`, and `/api/rag/search` consume it for KAG-style expansion. | High |
| Citation and authority enrichment | Legal authority logic is already present inside retrieval through `CitationGraph` and optional `legalPageRank` within `/api/evidence/search`, but this is still embedded in search/rerank logic rather than exposed as one standalone legal authority graph route. | Medium |
| Neo4j evidence graph | `evidence-graph-service.ts` can upsert Evidence, Case, and Entity nodes and create similarity links, while `pg-neo4j-sync.ts` mirrors PG evidence edges into Neo4j. In this pass, these looked like augmentation and sync layers, not the primary request-path graph of record. | Medium |
| Hypergraph 4D overlay | `/api/graph/hypergraph` and `/api/graph/hypergraph/address` are real runtime surfaces. They expose build, stats, grade-filtered edge lookup, invalidation, and ACE contextual addressing, with an observed admin consumer in `admin/search-intelligence`. This is best treated as a topological overlay on top of retrieval, not the baseline legal graph store. | Medium |
| Fully unified legal/evidence knowledge graph | The node and edge model below remains the target architecture. Pieces of it are already real, but this pass did not find one uniform runtime substrate that exposes every listed node type and edge type as a single live graph system. | Target state |

### Current Order Of Trust For Layer 3
- Trust the upload/status/realtime/download loop first when checking whether evidence storage and retrieval are truly working.
- Trust `yorha_evidence_connections` and `graph-context.ts` next when checking whether graph-aware retrieval is live in SSE chat, RAG search, or evidence search.
- Treat Neo4j sync and hypergraph routes as implemented augmentation layers that improve traversal and topology, not as the only graph source of truth.
- Treat the full node and edge taxonomy below as the desired end state, not as a claim that every legal surface is already unified behind one runtime graph.

One important seam in the current system is `graph-context.ts`: it is the live KAG bridge, and it explicitly handles mixed evidence identifiers and file-path-derived IDs before querying `yorha_evidence_connections`. That makes it part of the real retrieval path, not just a speculative helper module.

### Node Types

```typescript
type Case = {
  label: 'Case';
  id: string; // UUID
  title: string;
  status: 'open' | 'closed' | 'archived';
  priority: 'low' | 'medium' | 'high' | 'critical';
  evidence_count: number;
  citation_count: number;
};

type Evidence = {
  label: 'Evidence';
  id: string; // UUID
  title: string;
  type: 'document' | 'photo' | 'video' | 'audio';
  file_size: number;
  has_embedding: boolean;
  has_analysis: boolean;
  forensic_flags: string[]; // ['has_ssn', 'has_credit_card']
};

type Citation = {
  label: 'Citation';
  id: string; // UUID
  text: string;
  source: string;
  authority_weight: number; // 0.0-1.0
  cited_by_count: number;
};

type Statute = {
  label: 'Statute';
  id: string; // UUID
  code: string; // USC title § section
  text: string;
  has_embedding: boolean;
  chunk_count: number;
};

type Precedent = {
  label: 'Precedent';
  id: string; // UUID
  case_name: string;
  court: string;
  year: number;
  authority_weight: number;
};

type Entity = {
  label: 'Entity';
  id: string; // UUID
  name: string;
  type: 'person' | 'organization' | 'location' | 'date' | 'money';
  mention_count: number;
};

type Summary = {
  label: 'Summary';
  id: string; // UUID
  source_id: string; // Evidence or Case UUID
  text: string;
  model: string; // LLM used
  quality_score: number; // 0.0-1.0 (ACE)
  cached_at: number; // timestamp
};

type TimelineEvent = {
  label: 'TimelineEvent';
  id: string; // UUID
  date: string; // ISO8601
  description: string;
  evidence_ids: string[];
};
```

### Edge Types

```typescript
type LegalEdge =
  | { type: 'BELONGS_TO_CASE' }
  | { type: 'CITES'; context: string }
  | { type: 'AUTHORITY_FOR'; weight: number }
  | { type: 'MENTIONS'; count: number }
  | { type: 'RELATES_TO'; similarity: number }
  | { type: 'DERIVED_FROM'; inference_id: string }
  | { type: 'NEIGHBOR_OF'; hops: number } // Graph KAG
  | { type: 'SUMMARIZES'; quality_score: number };
```

### Example Queries (Legal Knowledge)

```cypher
// Find all evidence for a case
MATCH (c:Case {id: $caseId})<-[:BELONGS_TO_CASE]-(e:Evidence)
RETURN e

// Find citation chains (multi-hop authority)
MATCH path = (s1:Statute)-[:CITES*1..3]->(s2:Statute)
WHERE s1.id = $statuteId
RETURN path, length(path) AS hops

// Find evidence mentioning specific entities
MATCH (e:Evidence)-[m:MENTIONS]->(entity:Entity {name: $entityName})
RETURN e.title, m.count
ORDER BY m.count DESC

// Find cases with missing embeddings
MATCH (c:Case)<-[:BELONGS_TO_CASE]-(e:Evidence)
WHERE e.has_embedding = false
RETURN c.title, count(e) AS missing_count
ORDER BY missing_count DESC

// Find graph neighbors for KAG expansion
MATCH (e1:Evidence {id: $evidenceId})-[:NEIGHBOR_OF {hops: 1}]->(e2:Evidence)
RETURN e2

// Find orphaned summaries (source deleted)
MATCH (s:Summary)
WHERE NOT EXISTS {
  MATCH (s)-[:SUMMARIZES]->(:Evidence)
  UNION
  MATCH (s)-[:SUMMARIZES]->(:Case)
}
RETURN s.id, s.text

// Find statutes cited but not embedded
MATCH (s:Statute)
WHERE s.has_embedding = false AND s.chunk_count = 0
RETURN s.code, s.text
```

**Status**: ⚠️ **Phase 3 Needed** (Sync Postgres → Neo4j, add graph neighbor edges)

---

## Layer 4: AST / Symbol Graph

### Node Types

```typescript
type Symbol = {
  label: 'Symbol';
  name: string;
  file: string;
  line: number;
  type: 'function' | 'class' | 'interface' | 'type' | 'const' | 'let';
  is_exported: boolean;
  consumers: number;
};

type Function = {
  label: 'Function';
  name: string;
  file: string;
  line: number;
  params: number;
  is_async: boolean;
  is_exported: boolean;
  call_count: number;
};

type Class = {
  label: 'Class';
  name: string;
  file: string;
  line: number;
  methods: number;
  is_exported: boolean;
  instances: number;
};

type RouteHandler = {
  label: 'RouteHandler';
  route: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  file: string;
  line: number;
  has_auth: boolean;
  has_zod: boolean;
};

type Loader = {
  label: 'Loader';
  route: string;
  file: string; // +page.server.ts
  line: number;
  returns_data: boolean;
};

type Action = {
  label: 'Action';
  route: string;
  file: string; // +page.server.ts
  line: number;
  method: 'POST' | 'PUT' | 'DELETE';
};

type StoreUsage = {
  label: 'StoreUsage';
  store_name: string;
  file: string;
  line: number;
  operation: 'read' | 'write' | 'subscribe';
};

type DBQuery = {
  label: 'DBQuery';
  table: string;
  file: string;
  line: number;
  operation: 'select' | 'insert' | 'update' | 'delete';
};

type QueuePublish = {
  label: 'QueuePublish';
  queue: string;
  file: string;
  line: number;
};

type QueueConsume = {
  label: 'QueueConsume';
  queue: string;
  file: string;
  line: number;
  worker_class: string;
};

type FetchRoute = {
  label: 'FetchRoute';
  route: string;
  file: string;
  line: number;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
};
```

### Edge Types

```typescript
type ASTEdge =
  | { type: 'DECLARES'; exported: boolean }
  | { type: 'EXPORTS'; as_default: boolean }
  | { type: 'IMPORTS_SYMBOL'; imported_name: string }
  | { type: 'CALLS_SYMBOL'; call_count: number }
  | { type: 'USES_TABLE'; operation: string }
  | { type: 'PUBLISHES_QUEUE' }
  | { type: 'CONSUMES_QUEUE' }
  | { type: 'FETCHES_ROUTE'; method: string };
```

### Example Queries (Symbol Analysis)

```cypher
// Find exported symbols with no consumers
MATCH (s:Symbol {is_exported: true})
WHERE s.consumers = 0
RETURN s.name, s.file

// Find functions that are never called
MATCH (f:Function)
WHERE f.call_count = 0 AND f.is_exported = false
RETURN f.name, f.file

// Find tables queried but never displayed in UI
MATCH (q:DBQuery)-[:USES_TABLE]->(t:Table)
WHERE NOT EXISTS {
  MATCH (:Route)-[:FETCHES_ROUTE]->(:RouteHandler)-[:CONTAINS]->(q)
}
RETURN DISTINCT t.name

// Find queues published to but never consumed
MATCH (qp:QueuePublish)-[:PUBLISHES_QUEUE]->(q:Queue)
WHERE NOT EXISTS {
  MATCH (qc:QueueConsume)-[:CONSUMES_QUEUE]->(q)
}
RETURN q.name

// Find stores used in components but not defined
MATCH (su:StoreUsage)
WHERE NOT EXISTS {
  MATCH (s:Store {name: su.store_name})
}
RETURN su.store_name, su.file

// Find route handlers without Zod validation
MATCH (rh:RouteHandler)
WHERE rh.has_zod = false AND rh.method IN ['POST', 'PUT', 'PATCH']
RETURN rh.route, rh.method

// Find components that import but never use imports
MATCH (c:Component)-[i:IMPORTS_SYMBOL]->(s:Symbol)
WHERE NOT EXISTS {
  MATCH (c)-[:CALLS_SYMBOL]->(s)
}
RETURN c.name, s.name AS unused_import
```

**Status**: ⚠️ **Phase 2 Needed** (CPU AST extraction via TypeScript Compiler API)

---

## Cross-Layer Integration

### Cross-Layer Edge Types

```typescript
type CrossLayerEdge =
  // Runtime ↔ Codebase
  | { type: 'IMPLEMENTED_BY'; from: 'Lane' | 'Service' | 'Queue'; to: 'File' }
  | { type: 'CALLS_SERVICE'; from: 'File'; to: 'Service' }
  | { type: 'USES_LANE'; from: 'File'; to: 'Lane' }

  // Codebase ↔ Legal
  | { type: 'SERVES_CASE'; from: 'Route'; to: 'Case' }
  | { type: 'PROCESSES_EVIDENCE'; from: 'Worker'; to: 'Evidence' }
  | { type: 'QUERIES_EVIDENCE'; from: 'DBQuery'; to: 'Evidence' }

  // Legal ↔ Runtime
  | { type: 'INDEXED_IN'; from: 'Evidence'; to: 'Collection' }
  | { type: 'CACHED_IN'; from: 'Summary'; to: 'CacheTier' }
  | { type: 'PROCESSED_BY'; from: 'Evidence'; to: 'Lane' }

  // AST ↔ Runtime
  | { type: 'PUBLISHES_TO_QUEUE'; from: 'QueuePublish'; to: 'Queue' }
  | { type: 'CONSUMES_FROM_QUEUE'; from: 'QueueConsume'; to: 'Queue' }
  | { type: 'QUERIES_TABLE'; from: 'DBQuery'; to: 'Table' };
```

### Example Cross-Layer Queries

```cypher
// Find which code files use a specific lane
MATCH (f:File)-[:USES_LANE]->(l:Lane {name: 'Ollama'})
RETURN f.path

// Find which workers process evidence
MATCH (w:Worker)-[:PROCESSES_EVIDENCE]->(e:Evidence)
RETURN w.name, count(e) AS evidence_count
ORDER BY evidence_count DESC

// Find which collections have missing source tables
MATCH (c:Collection)
WHERE NOT EXISTS {
  MATCH (t:Table)-[:INDEXED_IN]->(c)
}
RETURN c.name

// Find which routes serve specific cases
MATCH (r:Route)-[:SERVES_CASE]->(c:Case)
RETURN r.path, c.title

// Find evidence processed by lanes that are not production-ready
MATCH (e:Evidence)-[:PROCESSED_BY]->(l:Lane)
WHERE l.status <> 'production'
RETURN e.title, l.name, l.status

// Find which files publish to queues that have no consumers
MATCH (qp:QueuePublish)-[:PUBLISHES_TO_QUEUE]->(q:Queue)
WHERE q.has_consumer = false
RETURN qp.file, q.name
```

---

## N-API Primitive Contract

### GPU/SIMD Functions (TypeScript Interface)

```typescript
// File: src/lib/server/gpu/n-api-contract.ts

/**
 * N-API Addon Contract — tensorrt_bridge.node
 *
 * Compiled from: simd-bridge/cpp/
 * Dependencies: LibTorch CUDA 12.1, simdjson, TensorRT
 */

export interface NAPIAddon {
  // ═══════════════════════════════════════════════════════════════
  // CUDA Runtime
  // ═══════════════════════════════════════════════════════════════

  /** Check if CUDA is available */
  isCudaAvailable(): boolean;

  /** Get number of CUDA devices */
  getDeviceCount(): number;

  /** Get device properties (VRAM, compute capability, etc.) */
  getDeviceProperties(deviceId: number): {
    name: string;
    totalMemory: number; // bytes
    computeCapability: { major: number; minor: number };
    multiProcessorCount: number;
  };

  // ═══════════════════════════════════════════════════════════════
  // simdjson (SIMD JSON Parsing)
  // ═══════════════════════════════════════════════════════════════

  /** Parse JSON string (2-5× faster than V8 for >1KB payloads) */
  simdJsonParse(jsonString: string): any;

  /** Validate JSON structure (pre-parse check) */
  simdJsonValidate(jsonString: string): boolean;

  /** Extract numbers from JSON path (zero-copy Float64Array) */
  simdJsonExtractNumbers(jsonString: string, jsonPath: string): Float64Array;

  // ═══════════════════════════════════════════════════════════════
  // LibTorch (GPU Tensor Operations)
  // ═══════════════════════════════════════════════════════════════

  /** Batch cosine similarity on GPU (100× speedup for 1000+ vectors) */
  computeGpuSimilarity(
    query: Float32Array,
    candidates: Float32Array[], // Array of vectors
  ): Float32Array; // Similarity scores

  /** K-means clustering on GPU */
  computeGpuClustering(
    vectors: Float32Array[], // All vectors
    k: number, // Number of clusters
    maxIterations: number,
  ): {
    labels: Uint32Array; // Cluster assignment per vector
    centroids: Float32Array[]; // Cluster centers
    inertia: number; // Sum of squared distances
  };

  /** Batch embedding generation (if model loaded) */
  batchGpuEmbedding(texts: string[]): Float32Array[];

  /** Matrix multiply on GPU */
  matrixMultiply(
    a: Float32Array,
    b: Float32Array,
    rowsA: number,
    colsA: number,
    colsB: number,
  ): Float32Array;

  /** Softmax on GPU */
  softmax(input: Float32Array): Float32Array;

  /** Top-K indices from scores */
  topKIndices(scores: Float32Array, k: number): Uint32Array;

  // ═══════════════════════════════════════════════════════════════
  // TensorRT (Quantized Inference) — Optional
  // ═══════════════════════════════════════════════════════════════

  /** Check if TensorRT engine is loaded */
  isTensorRTReady(): boolean;

  /** Run TensorRT inference (INT4/INT8 quantized) */
  tensorrtInference(input: Float32Array, enginePath: string): Float32Array;
}

/**
 * Import Pattern
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let addon: NAPIAddon | null = null;

export function loadNAPIAddon(): NAPIAddon | null {
  if (addon) return addon;

  try {
    addon = require('../../../simd-bridge/cpp/build/Release/tensorrt_bridge.node');
    console.log('[n-api] ✅ Addon loaded:', {
      cuda: addon.isCudaAvailable(),
      devices: addon.getDeviceCount(),
    });
    return addon;
  } catch (err) {
    console.warn('[n-api] ⚠️ Addon not available, falling back to CPU:', err);
    return null;
  }
}

export function isGPUAvailable(): boolean {
  const addon = loadNAPIAddon();
  return addon?.isCudaAvailable() ?? false;
}
```

### Usage Example

```typescript
// Example: Fast JSON parsing for Qdrant responses
import { loadNAPIAddon } from '$lib/server/gpu/n-api-contract';

const addon = loadNAPIAddon();

if (addon) {
  // Use simdjson (2-5× faster)
  const parsed = addon.simdJsonParse(largeJsonString);
} else {
  // Fallback to V8 JSON.parse
  const parsed = JSON.parse(largeJsonString);
}
```

```typescript
// Example: GPU batch similarity for search reranking
import { loadNAPIAddon } from '$lib/server/gpu/n-api-contract';

const addon = loadNAPIAddon();

if (addon && addon.isCudaAvailable()) {
  // GPU path (100× speedup for 1000 candidates)
  const queryVec = new Float32Array(embedding);
  const candidateVecs = candidates.map(c => new Float32Array(c.embedding));
  const scores = addon.computeGpuSimilarity(queryVec, candidateVecs);

  // Get top-K
  const topK = addon.topKIndices(scores, 10);
} else {
  // CPU fallback (TypeScript cosine similarity)
  const scores = candidates.map(c => cosineSimilarity(embedding, c.embedding));
}
```

**Status**: ✅ **Implemented** (293KB binary, 17 GPU functions)

---

## Qdrant Collections Schema

### Existing Collections

| Collection | Purpose | Vectors | Quantization | Dims |
|------------|---------|---------|--------------|------|
| `evidence_items` | Evidence chunks + metadata | 45K | INT8 | 768 |
| `legal_documents` | Document embeddings | 12K | INT8 | 768 |
| `case_chunks` | Case descriptions | 8K | INT8 | 768 |
| `codebase_chunks_768` | Code search (dual-vector) | 3,140 | INT8 | 768 |
| `chat_messages` | Chat context | 2K | INT8 | 768 |
| `embedding_cache` | Embedding lookup cache | 15K | INT8 | 768 |
| `court_opinions` | Legal precedents | 7,825 | INT8 | 768 |
| `statute_chunks` | Statute text | 5K | INT8 | 768 |
| `chat_documents` | Uploaded docs (Sprint 4B) | Variable | INT8 | 768 |

### Payload Schema (Common Fields)

```typescript
type QdrantPayload = {
  // Universal fields
  id: string; // UUID
  text: string; // Original text
  source_type: 'evidence' | 'document' | 'case' | 'code' | 'statute' | 'citation' | 'chat';
  created_at: number; // timestamp

  // Evidence-specific
  evidence_id?: string;
  case_id?: string;
  file_path?: string;

  // Code-specific
  file_path?: string;
  signature?: string;
  language?: string;

  // Legal-specific
  statute_code?: string;
  citation_text?: string;
  authority_weight?: number;
};
```

### New Collections (Phase 3)

| Collection | Purpose | Source | Dims |
|------------|---------|--------|------|
| `entity_mentions` | Named entities from ACE | Legal graph | 768 |
| `summary_cache` | ACE-generated summaries | Legal graph | 768 |
| `import_signatures` | Code import semantic search | AST graph | 768 |
| `function_signatures` | Function semantic search | AST graph | 768 |

---

## Postgres JSONB Schema

### Existing Tables (JSONB Columns)

| Table | JSONB Column | Purpose | GIN Index |
|-------|--------------|---------|-----------|
| `evidence` | `metadata` | File size, pages, MIME type, etc. | ✅ Yes |
| `evidence` | `forensic_flags` | SSN, CC, contact density, legal keywords | ✅ Yes |
| `case_notes` | `formatting` | Rich text formatting metadata | ❌ No |
| `poi_profiles` | `social_links` | Social media profiles | ❌ No |
| `poi_profiles` | `contact_info` | Email, phone, address | ❌ No |
| `documents` | `structure_analysis` | Document structure metadata | ❌ No |
| `route_health` | `response_samples` | API response samples | ❌ No |

### New Tables (Phase 2-4)

```sql
-- Codebase metadata (Layer 2)
CREATE TABLE codebase_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path TEXT NOT NULL UNIQUE,
  file_type TEXT NOT NULL, -- 'route' | 'component' | 'server' | 'store' | etc.
  lines INTEGER NOT NULL,
  language TEXT NOT NULL,
  last_modified TIMESTAMPTZ NOT NULL,
  has_tests BOOLEAN DEFAULT FALSE,
  metadata JSONB, -- { imports: [...], exports: [...], symbols: [...] }
  status TEXT DEFAULT 'active', -- 'active' | 'orphan' | 'deprecated'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX codebase_files_metadata_gin ON codebase_files USING gin(metadata);

-- AST symbols (Layer 4)
CREATE TABLE ast_symbols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  file_id UUID REFERENCES codebase_files(id),
  line INTEGER NOT NULL,
  symbol_type TEXT NOT NULL, -- 'function' | 'class' | 'interface' | etc.
  is_exported BOOLEAN DEFAULT FALSE,
  consumers INTEGER DEFAULT 0,
  metadata JSONB, -- { params: [...], return_type: '...', async: true }
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Graph sync state
CREATE TABLE graph_sync_state (
  entity_type TEXT PRIMARY KEY, -- 'evidence' | 'case' | 'file' | 'symbol'
  last_synced TIMESTAMPTZ NOT NULL,
  synced_count INTEGER NOT NULL,
  error_count INTEGER DEFAULT 0,
  metadata JSONB -- { errors: [...], stats: {...} }
);
```

---

## CouchDB Document Types

### Existing Docs

| Type | Purpose | Size | TTL |
|------|---------|------|-----|
| `dag_cache` | Topological ordering cache | ~10KB | 1hr |
| `inference_log` | LLM inference metadata | ~5KB | 7 days |

### New Doc Types (Phase 3-7)

```typescript
// Graph snapshot (for D3/Obsidian export)
type GraphSnapshot = {
  _id: string; // `graph_${layer}_${timestamp}`
  type: 'graph_snapshot';
  layer: 'runtime' | 'codebase' | 'legal' | 'ast';
  nodes: Array<{ id: string; label: string; properties: any }>;
  edges: Array<{ from: string; to: string; type: string; properties: any }>;
  created_at: number;
  expires_at: number; // TTL
};

// Recommendation cache
type RecommendationCache = {
  _id: string; // `rec_${context_hash}`
  type: 'recommendation';
  context: {
    file_path?: string;
    case_id?: string;
    evidence_id?: string;
  };
  recommendations: Array<{
    type: 'file' | 'component' | 'evidence' | 'citation';
    id: string;
    score: number;
    reason: string;
  }>;
  created_at: number;
  expires_at: number; // 1hr TTL
};

// D3 visualization data
type D3GraphData = {
  _id: string; // `d3_${layer}_${filter}`
  type: 'd3_graph';
  layer: 'runtime' | 'codebase' | 'legal' | 'ast';
  filter: string; // Query filter used
  nodes: Array<{ id: string; group: string; [key: string]: any }>;
  links: Array<{ source: string; target: string; value: number }>;
  created_at: number;
  expires_at: number; // 1hr TTL
};

// Obsidian export
type ObsidianExport = {
  _id: string; // `obsidian_${case_id}`
  type: 'obsidian_export';
  case_id: string;
  markdown: string; // Full Obsidian-formatted markdown
  frontmatter: {
    title: string;
    tags: string[];
    created: string;
    modified: string;
  };
  backlinks: string[]; // Other note IDs
  created_at: number;
  expires_at: number; // 7 days
};
```

---

## Implementation Roadmap

### Phase 1: Unified Graph Schema ✅ **COMPLETE**

**Duration**: 1 day
**Status**: ✅ Done (runtime architecture graph deployed)

**Deliverables**:
- ✅ Node type definitions (CacheTier, Service, Lane, Router, Queue, Worker, Collection, Table)
- ✅ Edge type definitions (TIER_*, FALLS_BACK_TO, BACKED_BY, etc.)
- ✅ Neo4j Cypher schema (25 nodes, 50+ edges)
- ✅ Documentation (RUNTIME_MATRIX.md, Neo4j README.md)

**Files**:
- `scripts/neo4j/runtime-architecture-graph.cypher` (500+ lines)
- `RUNTIME_MATRIX.md` (500+ lines)
- `scripts/neo4j/README.md` (500+ lines)

---

### Phase 2: AST CPU Graph + Codebase Layer 🟡 **NEXT**

**Duration**: 3-5 days
**Status**: ⚠️ Not started

**Tasks**:

**2A. TypeScript AST Extraction** (2 days)
- Use TypeScript Compiler API (`ts.createSourceFile`)
- Extract imports, exports, symbols, functions, classes
- Detect:
  - Route handlers (`export const GET`, `export const load`)
  - Component usage (`import Button from ...`)
  - Store usage (`import { user } from ...`)
  - Queue publishes (`rabbitmq.publishEvidenceProcess(...)`)
  - DB queries (`db.select().from(evidence)`)
  - API fetches (`fetch('/api/...')`)

**2B. Import Graph Construction** (1 day)
- Build `File` → `IMPORTS` → `File` edges
- Build `File` → `CALLS` → `Function` edges
- Build `File` → `USES_STORE` → `Store` edges

**2C. Neo4j Sync** (1 day)
- Sync AST nodes to Neo4j
- Create cross-layer edges (`File` → `USES_LANE` → `Lane`)

**2D. Orphan Detection** (1 day)
- Query for files with no consumers
- Query for components with no imports
- Query for stores with no usages
- Query for queues with no consumers

**Files to create**:
- `src/lib/server/ast/typescript-extractor.ts` (~300 lines)
- `src/lib/server/ast/import-graph-builder.ts` (~200 lines)
- `src/lib/server/ast/neo4j-sync.ts` (~150 lines)
- `scripts/neo4j/codebase-graph-schema.cypher` (~400 lines)
- `scripts/ast/find-orphans.sh` (~100 lines)

**Total**: ~1,150 lines of new code

---

### Phase 3: Legal / Evidence Graph Layer 🟡 **FUTURE**

**Duration**: 2-3 days
**Status**: ⚠️ Not started

**Tasks**:

**3A. Postgres → Neo4j Sync** (1 day)
- Sync `cases`, `evidence`, `citations`, `statutes` tables to Neo4j nodes
- Create `BELONGS_TO_CASE`, `CITES`, `AUTHORITY_FOR` edges

**3B. Graph Neighbor Expansion** (1 day)
- Add `NEIGHBOR_OF` edges based on:
  - Shared citations
  - Shared entities
  - Temporal proximity
  - Semantic similarity (Qdrant)

**3C. Summary Graph** (1 day)
- Sync ACE summaries to Neo4j
- Create `SUMMARIZES` edges
- Add quality scores as properties

**Files to create**:
- `src/lib/server/graph/legal-sync.ts` (~300 lines)
- `src/lib/server/graph/neighbor-expansion.ts` (~200 lines)
- `scripts/neo4j/legal-graph-schema.cypher` (~400 lines)

**Total**: ~900 lines

---

### Phase 4: Semantic KAG Search Endpoint 🟡 **FUTURE**

**Duration**: 2 days
**Status**: ⚠️ Not started

**Tasks**:

**4A. Unified KAG Endpoint** (1 day)
```typescript
POST /api/graph/kag-search
{
  "query": "Find evidence related to statute §1234",
  "layers": ["legal", "runtime"],
  "hops": 2,
  "similarity_threshold": 0.8
}

Response:
{
  "semantic_hits": [...], // Qdrant
  "graph_neighbors": [...], // Neo4j
  "dag_order": [...], // CouchDB
  "explanation": {...}
}
```

**4B. Cross-Layer Search** (1 day)
- Search across all 4 layers
- Return unified results with metadata

**Files to create**:
- `src/routes/api/graph/kag-search/+server.ts` (~250 lines)
- `src/lib/server/graph/unified-search.ts` (~300 lines)

**Total**: ~550 lines

---

### Phase 5: D3 Visualization Extensions 🟡 **FUTURE**

**Duration**: 3-4 days
**Status**: ⚠️ Not started

**Tasks**:

**5A. Layer Toggle UI** (1 day)
- Checkboxes for Runtime / Codebase / Legal / AST
- Dynamic graph filtering

**5B. Semantic + Graph Search** (1 day)
- Search bar queries both Qdrant + Neo4j
- Highlight results in graph

**5C. Neighbor Expansion** (1 day)
- Click node → expand neighbors
- Configurable hop depth (1-3)

**5D. Path Highlight** (1 day)
- Show shortest path between two nodes
- Animate path traversal

**Files to create**:
- `src/lib/components/graph/GraphLayerToggle.svelte` (~150 lines)
- `src/lib/components/graph/GraphSearch.svelte` (~200 lines)
- `src/lib/components/graph/GraphNeighborExpansion.svelte` (~150 lines)
- `src/lib/components/graph/GraphPathHighlight.svelte` (~200 lines)

**Total**: ~700 lines

---

### Phase 6: Recommendation Engine 🟡 **FUTURE**

**Duration**: 3 days
**Status**: ⚠️ Not started

**Tasks**:

**6A. File Recommendations** (1 day)
- "Files you might need to edit based on this change"
- Based on import graph + semantic similarity

**6B. Component Recommendations** (1 day)
- "Components similar to this one"
- Based on AST structure + props

**6C. Evidence Recommendations** (1 day)
- "Evidence related to this case"
- Based on citations + entities + temporal proximity

**Files to create**:
- `src/routes/api/graph/recommend/+server.ts` (~200 lines)
- `src/lib/server/graph/recommendation-engine.ts` (~400 lines)

**Total**: ~600 lines

---

### Phase 7: Obsidian Export + CouchDB Snapshots 🟡 **FUTURE**

**Duration**: 2 days
**Status**: ⚠️ Not started

**Tasks**:

**7A. Obsidian Markdown Export** (1 day)
- Generate Obsidian-formatted markdown for cases
- Include backlinks, frontmatter, tags

**7B. CouchDB Graph Snapshots** (1 day)
- Cache precomputed graph queries in CouchDB
- Expire after 1hr

**Files to create**:
- `src/routes/api/graph/export/obsidian/+server.ts` (~200 lines)
- `src/lib/server/graph/couchdb-snapshot.ts` (~150 lines)

**Total**: ~350 lines

---

## Total Implementation Estimate

| Phase | Duration | Lines of Code | Status |
|-------|----------|---------------|--------|
| Phase 1 | 1 day | ~1,500 | ✅ **COMPLETE** |
| Phase 2 | 3-5 days | ~1,150 | ⚠️ **NEXT** |
| Phase 3 | 2-3 days | ~900 | ⚠️ Future |
| Phase 4 | 2 days | ~550 | ⚠️ Future |
| Phase 5 | 3-4 days | ~700 | ⚠️ Future |
| Phase 6 | 3 days | ~600 | ⚠️ Future |
| Phase 7 | 2 days | ~350 | ⚠️ Future |
| **Total** | **16-22 days** | **~5,750 lines** | **6% complete** |

---

## Immediate Next Steps (Phase 2)

**Start Here** (3 days):

1. **Create AST extractor** (`typescript-extractor.ts`)
   - Use TypeScript Compiler API
   - Extract imports, exports, symbols, functions, classes
   - Detect route handlers, loaders, actions

2. **Build import graph** (`import-graph-builder.ts`)
   - Create `File` → `IMPORTS` → `File` edges
   - Create `File` → `CALLS` → `Function` edges

3. **Sync to Neo4j** (`neo4j-sync.ts`)
   - Push AST nodes to Neo4j
   - Create cross-layer edges

4. **Find orphans** (`find-orphans.sh`)
   - Query for files/components/stores/queues with no consumers

**Expected Outcome**: Discover 50-100 orphaned files/components across the codebase.

---

## Summary

**What This Document Defines**:
- ✅ 4-layer unified knowledge graph architecture
- ✅ Node types for all layers (Runtime, Codebase, Legal, AST)
- ✅ Edge types (intra-layer + cross-layer)
- ✅ N-API primitive contract (GPU/SIMD functions)
- ✅ Qdrant collection schema
- ✅ Postgres JSONB schema
- ✅ CouchDB document types
- ✅ 7-phase implementation roadmap (16-22 days, ~5,750 lines)

**What's Already Built**:
- ✅ Layer 1 (Runtime) — 25 nodes, 50+ edges, Neo4j deployed
- ✅ N-API addon — 293KB binary, 17 GPU functions
- ✅ Qdrant collections — 9 collections, INT8 quantized
- ✅ Postgres JSONB — 7 tables with GIN indexes

**What's Next**:
- ⚠️ Phase 2: AST CPU graph + codebase layer (3-5 days)
- ⚠️ Phase 3: Legal/evidence graph layer (2-3 days)
- ⚠️ Phase 4: Unified KAG search endpoint (2 days)

**How to Use This Spec**:
1. Reference node/edge schemas when adding to Neo4j
2. Use cross-layer queries to find missing components
3. Follow implementation roadmap phases in order
4. Use N-API contract for GPU acceleration decisions

---

**Last Updated**: 2026-04-12
**Next Review**: After Phase 2 completion
**Maintainer**: Legal AI Platform Team
