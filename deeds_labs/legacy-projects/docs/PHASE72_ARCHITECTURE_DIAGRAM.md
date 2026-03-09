# Phase 72: Contextual Chat Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND LAYER                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  SvelteKit Frontend (Port 5173)                                  │  │
│  │  ├─ Terminal Chat Page (/terminal)                              │  │
│  │  ├─ YoRHa Chat Component                                        │  │
│  │  ├─ Evidence Upload                                             │  │
│  │  └─ Suggestions Panel                                           │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│                              │ HTTP POST                                │
│                              ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  API Endpoint: /api/ai/yorha/context-chat                       │  │
│  │  ├─ Parse request (message, caseId, evidenceIds)               │  │
│  │  ├─ Call Go orchestrator                                        │  │
│  │  ├─ Persist chat_turns                                          │  │
│  │  ├─ Link chat_turn_evidence                                     │  │
│  │  └─ Record chat_analytics                                       │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ HTTP JSON
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      ORCHESTRATION LAYER                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Go Context Orchestrator (Port 8085)                            │  │
│  │  ├─ HTTP Server                                                 │  │
│  │  ├─ Request validation                                          │  │
│  │  ├─ gRPC client to RAG/KAG service                             │  │
│  │  ├─ HTTP client to Ollama                                       │  │
│  │  ├─ PostgreSQL client                                           │  │
│  │  └─ Response formatting                                         │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                    │                          │
                    │ gRPC                     │ HTTP
                    ▼                          ▼
        ┌──────────────────────┐    ┌──────────────────────┐
        │  Python RAG/KAG      │    │  Ollama              │
        │  Service             │    │  (Port 11434)        │
        │  (Port 50061)        │    │                      │
        │                      │    │  Models:             │
        │  ├─ Embed query      │    │  - embeddinggemma    │
        │  ├─ Search Qdrant    │    │  - gemma3-legal      │
        │  ├─ Query Neo4j      │    │  - gemma3-vision     │
        │  └─ Compute suggest. │    │                      │
        └──────────────────────┘    └──────────────────────┘
                    │                          │
        ┌───────────┼───────────┐              │
        │           │           │              │
        ▼           ▼           ▼              │
    ┌────────┐ ┌────────┐ ┌────────┐          │
    │ Qdrant │ │ Neo4j  │ │ MinIO  │          │
    │ (6333) │ │ (7687) │ │ (9000) │          │
    └────────┘ └────────┘ └────────┘          │
        │           │           │              │
        └───────────┼───────────┘              │
                    │                          │
                    └──────────────────────────┘
                              │
                              ▼
                    ┌──────────────────────┐
                    │  PostgreSQL          │
                    │  (Port 5432)         │
                    │                      │
                    │  Tables:             │
                    │  - chat_turns        │
                    │  - chat_turn_evidence│
                    │  - chat_analytics    │
                    │  - users             │
                    │  - cases             │
                    │  - evidence          │
                    └──────────────────────┘
```

## Request Flow Sequence

```
User                SvelteKit            Go Orch.          Python RAG/KAG       Ollama          PostgreSQL
 │                    │                    │                    │                 │                 │
 │ Send message       │                    │                    │                 │                 │
 ├───────────────────>│                    │                    │                 │                 │
 │                    │ POST /context-chat │                    │                 │                 │
 │                    ├───────────────────>│                    │                 │                 │
 │                    │                    │ gRPC ContextQuery  │                 │                 │
 │                    │                    ├───────────────────>│                 │                 │
 │                    │                    │                    │ Embed query     │                 │
 │                    │                    │                    ├────────────────>│                 │
 │                    │                    │                    │<────────────────┤                 │
 │                    │                    │                    │ Embedding       │                 │
 │                    │                    │                    │                 │                 │
 │                    │                    │                    │ Search Qdrant   │                 │
 │                    │                    │                    │ Query Neo4j     │                 │
 │                    │                    │                    │ Compute suggest.│                 │
 │                    │                    │<───────────────────┤                 │                 │
 │                    │                    │ RAG/KAG context    │                 │                 │
 │                    │                    │                    │                 │                 │
 │                    │                    │ Call Gemma LLM     │                 │                 │
 │                    │                    ├────────────────────────────────────>│                 │
 │                    │                    │                    │                 │ Generate answer │
 │                    │                    │<────────────────────────────────────┤                 │
 │                    │                    │ Answer + citations │                 │                 │
 │                    │                    │                    │                 │                 │
 │                    │                    │ Save chat_turns    │                 │                 │
 │                    │                    ├─────────────────────────────────────────────────────>│
 │                    │                    │                    │                 │ Insert turn     │
 │                    │                    │<─────────────────────────────────────────────────────┤
 │                    │                    │ Turn ID            │                 │                 │
 │                    │                    │                    │                 │                 │
 │                    │<───────────────────┤                    │                 │                 │
 │                    │ Response JSON      │                    │                 │                 │
 │<───────────────────┤                    │                    │                 │                 │
 │ Display answer     │                    │                    │                 │                 │
 │ Show suggestions   │                    │                    │                 │                 │
 │                    │                    │                    │                 │                 │
```

## Component Interaction

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SVELTEKIT FRONTEND                              │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Terminal Chat Component                                         │   │
│  │ ├─ Message input                                               │   │
│  │ ├─ Evidence selector                                           │   │
│  │ ├─ Chat history display                                        │   │
│  │ └─ Suggestions panel                                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              │ fetch()                                  │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ API Route Handler (+server.ts)                                  │   │
│  │ ├─ Parse request                                               │   │
│  │ ├─ Validate user session                                       │   │
│  │ ├─ Call orchestrator                                           │   │
│  │ ├─ Persist to database                                         │   │
│  │ └─ Return response                                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ HTTP
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      GO CONTEXT ORCHESTRATOR                            │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ HTTP Handler                                                    │   │
│  │ ├─ Parse JSON request                                          │   │
│  │ ├─ Validate input                                              │   │
│  │ └─ Route to processing                                         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│         ┌────────────────────┼────────────────────┐                    │
│         │                    │                    │                    │
│         ▼                    ▼                    ▼                    │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐           │
│  │ RAG/KAG Client │  │ LLM Client     │  │ DB Client      │           │
│  │ (gRPC)         │  │ (HTTP)         │  │ (PostgreSQL)   │           │
│  └────────────────┘  └────────────────┘  └────────────────┘           │
│         │                    │                    │                    │
└─────────┼────────────────────┼────────────────────┼────────────────────┘
          │                    │                    │
          │ gRPC               │ HTTP               │ SQL
          ▼                    ▼                    ▼
    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
    │ Python       │    │ Ollama       │    │ PostgreSQL   │
    │ RAG/KAG      │    │ LLM          │    │ Database     │
    │ Service      │    │              │    │              │
    └──────────────┘    └──────────────┘    └──────────────┘
         │                    │                    │
    ┌────┴────┬────────┐      │              ┌─────┴─────┐
    │          │        │      │              │           │
    ▼          ▼        ▼      │              ▼           ▼
┌────────┐ ┌────────┐ ┌────────┐             ┌────────┐ ┌────────┐
│ Qdrant │ │ Neo4j  │ │ MinIO  │             │ Tables │ │ Indexes│
│ Vector │ │ Graph  │ │ Storage│             │        │ │        │
│ Search │ │ DB     │ │        │             │        │ │        │
└────────┘ └────────┘ └────────┘             └────────┘ └────────┘
```

## Data Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         POSTGRESQL SCHEMA                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ chat_turns                                                       │  │
│  │ ├─ id (uuid, PK)                                                │  │
│  │ ├─ case_id (uuid, FK → cases)                                   │  │
│  │ ├─ user_id (uuid, FK → users)                                   │  │
│  │ ├─ message (text)                                               │  │
│  │ ├─ llm_output (jsonb)                                           │  │
│  │ │  ├─ model: "gemma3-legal:latest"                             │  │
│  │ │  ├─ answer: "..."                                            │  │
│  │ │  ├─ citations: [{evidence_id, chunk_id}]                     │  │
│  │ │  ├─ tools_used: ["rag_retrieve", "kag_lookup"]               │  │
│  │ │  └─ latency_ms: 982                                          │  │
│  │ ├─ rag_context (jsonb)                                          │  │
│  │ │  ├─ collection: "phase_rag_evidence"                         │  │
│  │ │  ├─ top_k: 8                                                 │  │
│  │ │  └─ results: [{evidence_id, chunk_id, score, text}]          │  │
│  │ ├─ kag_context (jsonb)                                          │  │
│  │ │  └─ facts: [{node_id, label, relation, target_id}]           │  │
│  │ ├─ did_you_mean (jsonb)                                         │  │
│  │ │  └─ suggestions: [{query, reason, score}]                    │  │
│  │ ├─ created_at (timestamptz)                                     │  │
│  │ └─ updated_at (timestamptz)                                     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│                              │ 1:N                                      │
│                              ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ chat_turn_evidence                                               │  │
│  │ ├─ id (uuid, PK)                                                │  │
│  │ ├─ chat_turn_id (uuid, FK → chat_turns)                         │  │
│  │ ├─ evidence_id (uuid, FK → evidence)                            │  │
│  │ ├─ object_uri (text)                                            │  │
│  │ │  ├─ "minio://bucket/key" (uploaded)                          │  │
│  │ │  └─ "qdrant://collection/chunk" (retrieved)                  │  │
│  │ ├─ role (text) - 'uploaded' | 'retrieved'                       │  │
│  │ └─ created_at (timestamptz)                                     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│                              │ 1:N                                      │
│                              ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ chat_analytics                                                   │  │
│  │ ├─ id (uuid, PK)                                                │  │
│  │ ├─ chat_turn_id (uuid, FK → chat_turns)                         │  │
│  │ ├─ user_id (uuid, FK → users)                                   │  │
│  │ ├─ case_id (uuid, FK → cases)                                   │  │
│  │ ├─ query_embedding_source (text)                                │  │
│  │ ├─ response_latency_ms (integer)                                │  │
│  │ ├─ rag_results_count (integer)                                  │  │
│  │ ├─ kag_facts_count (integer)                                    │  │
│  │ ├─ suggestions_count (integer)                                  │  │
│  │ ├─ user_feedback (text)                                         │  │
│  │ └─ created_at (timestamptz)                                     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PRODUCTION DEPLOYMENT                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Load Balancer (Caddy/Nginx)                                     │   │
│  │ ├─ Port 80/443                                                  │   │
│  │ ├─ SSL/TLS termination                                          │   │
│  │ └─ Route to services                                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│         ┌────────────────────┼────────────────────┐                    │
│         │                    │                    │                    │
│         ▼                    ▼                    ▼                    │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐           │
│  │ SvelteKit      │  │ Go Orch.       │  │ Python RAG/KAG │           │
│  │ (3 replicas)   │  │ (3 replicas)   │  │ (2 replicas)   │           │
│  └────────────────┘  └────────────────┘  └────────────────┘           │
│         │                    │                    │                    │
│         └────────────────────┼────────────────────┘                    │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Shared Services                                                 │   │
│  │ ├─ PostgreSQL (Primary + Replicas)                              │   │
│  │ ├─ Qdrant (Cluster)                                             │   │
│  │ ├─ Neo4j (Cluster)                                              │   │
│  │ ├─ Ollama (GPU nodes)                                           │   │
│  │ ├─ MinIO (S3-compatible)                                        │   │
│  │ └─ Redis (Caching)                                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Monitoring & Logging                                            │   │
│  │ ├─ Prometheus (Metrics)                                         │   │
│  │ ├─ Grafana (Dashboards)                                         │   │
│  │ ├─ ELK Stack (Logs)                                             │   │
│  │ └─ Jaeger (Tracing)                                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Performance Characteristics

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      PERFORMANCE METRICS                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Response Latency Breakdown (typical):                                 │
│  ├─ Query embedding (embeddinggemma):     100-200ms                    │
│  ├─ Vector search (Qdrant):                50-100ms                    │
│  ├─ Graph query (Neo4j):                   50-150ms                    │
│  ├─ LLM inference (Gemma):                200-1000ms                   │
│  ├─ Database persistence:                  50-100ms                    │
│  └─ Total:                                500-2000ms                   │
│                                                                         │
│  Throughput:                                                            │
│  ├─ Single instance:                      10-20 req/s                  │
│  ├─ 3 Go orchestrators:                   30-60 req/s                  │
│  ├─ With load balancing:                  100+ req/s                   │
│  └─ Concurrent users:                     100-500                      │
│                                                                         │
│  Storage:                                                               │
│  ├─ Per chat turn:                        ~1-5 KB                      │
│  ├─ Per analytics record:                 ~500 B                       │
│  ├─ 1M chat turns:                        ~5-10 GB                     │
│  └─ 1M analytics records:                 ~500 MB                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Scaling Strategy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         HORIZONTAL SCALING                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Phase 1: Single Instance (Development)                                │
│  ├─ 1 SvelteKit                                                        │
│  ├─ 1 Go Orchestrator                                                  │
│  ├─ 1 Python RAG/KAG                                                   │
│  └─ Shared PostgreSQL/Qdrant/Neo4j                                     │
│                                                                         │
│  Phase 2: Multi-Instance (Production)                                  │
│  ├─ 3 SvelteKit (behind load balancer)                                 │
│  ├─ 3 Go Orchestrators (behind load balancer)                          │
│  ├─ 2 Python RAG/KAG (behind load balancer)                            │
│  └─ Clustered PostgreSQL/Qdrant/Neo4j                                  │
│                                                                         │
│  Phase 3: Distributed (Enterprise)                                     │
│  ├─ 10+ SvelteKit (auto-scaling)                                       │
│  ├─ 10+ Go Orchestrators (auto-scaling)                                │
│  ├─ 5+ Python RAG/KAG (auto-scaling)                                   │
│  ├─ Multi-region PostgreSQL                                            │
│  ├─ Distributed Qdrant cluster                                         │
│  ├─ Neo4j enterprise cluster                                           │
│  └─ GPU node pool for Ollama                                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

This architecture is designed to be:
- **Scalable**: Horizontal scaling at each layer
- **Resilient**: Redundancy and failover at each component
- **Observable**: Full monitoring and tracing
- **Secure**: Authentication, authorization, encryption
- **Maintainable**: Clear separation of concerns
