# User Analytics — Neo4j + embeddinggemma + Qdrant → ACE Contextual Chat

## Status: PLANNED
## Priority: Medium-High
## Created: 2026-03-26

---

## Overview

Wire the existing analytics infrastructure (client event tracking → server event logger → PostgreSQL) into Neo4j graph analytics and vector-enriched ACE contextual chat. User behavior patterns inform AI recommendations and contextual search.

## Architecture

```
Client Events (analytics.svelte.ts)
  → Batch flush (30s / 100 events)
    → POST /api/analytics/events
      → event-logger.ts → PostgreSQL
      → RabbitMQ analytics.track queue
        → Neo4j sync (user→case→evidence graph)
          → Degree centrality + PageRank
            → Recommendation engine
              → ACE contextual chat context enrichment
```

## Components (Existing → To Wire)

### Client Side
| Component | File | Status |
|-----------|------|--------|
| Analytics store | `lib/stores/analytics.svelte.ts` | EXISTS — batching + flush |
| Event types | Page views, searches, evidence views, chat messages | DEFINED |
| Tracking calls | Navigation, search, evidence interaction | TO WIRE |

### Server Side
| Component | File | Status |
|-----------|------|--------|
| Event logger | `lib/server/analytics/event-logger.ts` | EXISTS |
| Analytics API | `api/analytics/events` (6 endpoints) | EXISTS |
| RabbitMQ queue | `analytics.track` | EXISTS (consumer needs work) |
| Neo4j driver | `lib/server/neo4j/driver.ts` | EXISTS |
| Neo4j schema | `lib/server/neo4j/schema.ts` | EXISTS |
| Neo4j sync | `lib/server/neo4j/sync-pipeline.ts` | EXISTS |
| Graph centrality | `lib/server/neo4j/centrality.ts` | EXISTS |
| Recommendation | `lib/server/recommendation/engine.ts` | EXISTS |

### Vector Pipeline
| Component | File | Status |
|-----------|------|--------|
| embeddinggemma | Via `/api/embed` + Ollama | ACTIVE |
| Qdrant storage | `lib/server/vector/qdrant-manager.ts` | ACTIVE |
| ACE chat | `api/ai/contextual-chat` | ACTIVE |
| RAG pipeline | `lib/server/rag-pipeline.ts` | ACTIVE |

## Implementation Plan

### Phase 1: Analytics Event Wiring
- Wire `analytics.svelte.ts` tracking calls into key pages (dashboard, cases, evidence, search)
- Verify event flush → `/api/analytics/events` → PostgreSQL storage
- Add analytics to navigation events, search queries, evidence views

### Phase 2: Neo4j Graph Sync
- Wire RabbitMQ `analytics.track` consumer to Neo4j sync pipeline
- Create User→Case, User→Evidence, User→Search graph relationships
- Run degree centrality + PageRank on user interaction graph
- Store centrality scores for recommendation ranking

### Phase 3: Vector-Enriched Recommendations
- Embed user search queries via embeddinggemma
- Store search embeddings in Qdrant `user_searches` collection
- Build semantic similarity between user queries and case/evidence embeddings
- Feed into recommendation engine multi-source ranking (RAG + Neo4j graph + vector similarity)

### Phase 4: ACE Chat Context Enrichment
- Inject user analytics context into ACE contextual chat system prompt
- Include: recently viewed cases, frequent search patterns, related evidence
- Graph-based context: cases connected to current case via shared entities
- Vector-based context: semantically similar evidence from other cases

## Success Metrics

| Metric | Target |
|--------|--------|
| Event tracking coverage | >80% of user interactions |
| Neo4j sync latency | <5s from event → graph |
| Recommendation relevance | Top-5 includes relevant case >60% of time |
| ACE chat context quality | User rates contextual answers higher than generic |

## Dependencies

- Neo4j running and accessible
- Ollama with embeddinggemma loaded
- Qdrant with write access
- RabbitMQ analytics.track queue consumer wired
