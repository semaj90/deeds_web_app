# User Analytics — Neo4j + embeddinggemma + Qdrant → ACE Contextual Chat

## Status: INCOMPLETE (pipeline wired, dashboard + Neo4j reads MISSING)
## Priority: Medium-High
## Created: 2026-03-26
## Audited: 2026-04-06

---

## Audit Results (April 6, 2026)

### What WORKS (verified in codebase)
- Client-side tracking: `analytics.svelte.ts` — 19 routes wired, batched flush
- Server API: `POST /api/analytics/events` — Zod validated, auth required
- PostgreSQL: `analytics_events` table with indexes (event_type, user_id, created_at)
- RabbitMQ: `analytics.track` queue consumer → Redis + PostgreSQL + Neo4j sync
- Neo4j write sync: `user-interaction-sync.ts` — VIEWED/CREATED/SEARCHED relationships
- Qdrant: `user_searches` collection — 768-dim embeddings of search queries
- Event logger: `event-logger.ts` — `getWeeklySummary()`, `getTopQueryPatterns()`
- Load function: `analytics/+page.server.ts` — calls summary + patterns

### What's MISSING (not in codebase)
- **Analytics dashboard UI** — NO `analytics/+page.svelte` exists
- **Neo4j reads** — Neo4j is write-only, nothing queries it for analytics/recs
- **Graph centrality** — `lib/server/neo4j/centrality.ts` does NOT exist
- **Recommendation engine** — `lib/server/recommendation/engine.ts` does NOT exist
- **ACE context enrichment** — No analytics injected into chat system prompt
- **Neo4j Cypher in RAG** — KAG uses PG `yorha_evidence_*` tables, NOT Neo4j

### Correct Path Map
| Component | File | Status |
|-----------|------|--------|
| Analytics store | `src/lib/stores/analytics.svelte.ts` | WORKING |
| Event logger | `src/lib/server/analytics/event-logger.ts` | WORKING |
| Analytics API | `src/routes/api/analytics/events/+server.ts` | WORKING |
| RabbitMQ consumer | `src/lib/server/queue/rabbitmq-manager-fixed.ts` (line 505) | WORKING |
| Neo4j driver | `src/lib/server/neo4j-driver.ts` | WORKING |
| Neo4j schema | `src/lib/server/graph/neo4j-schema.ts` | WORKING |
| Neo4j write sync | `src/lib/server/graph/user-interaction-sync.ts` | WORKING |
| PG→Neo4j case sync | `src/lib/server/graph/pg-neo4j-sync.ts` | WORKING |
| Evidence graph | `src/lib/server/graph/evidence-graph-service.ts` | WORKING |
| Page server load | `src/routes/(app)/analytics/+page.server.ts` | WORKING |
| **Dashboard UI** | `src/routes/(app)/analytics/+page.svelte` | **MISSING** |
| **Graph centrality** | `src/lib/server/graph/centrality.ts` | **MISSING** |
| **Recommendation engine** | — | **MISSING** |
| **ACE analytics context** | — | **MISSING** |
| **Neo4j read queries** | — | **MISSING** |

---

## Architecture (current reality)

```
Client Events (analytics.svelte.ts)  ← WORKING
  → Batch flush (30s / 100 events)
    → POST /api/analytics/events      ← WORKING
      → event-logger.ts → PostgreSQL   ← WORKING
      → RabbitMQ analytics.track queue ← WORKING
        → Redis sorted set             ← WORKING
        → Neo4j sync (WRITE-ONLY)      ← WORKING (but nothing reads)
        → Qdrant user_searches embed   ← WORKING (but no similarity query)

MISSING CHAIN:
  Neo4j graph → Cypher traversal queries → ❌ NOT BUILT
  Neo4j centrality → PageRank/degree → ❌ NOT BUILT
  Recommendation engine → multi-source ranking → ❌ NOT BUILT
  ACE chat context → inject analytics → ❌ NOT BUILT
  Dashboard UI → render summary + patterns → ❌ NOT BUILT (server load exists)
```

---

## Remaining TODOs

### TODO 1: Analytics Dashboard UI (~30 min)
Create `src/routes/(app)/analytics/+page.svelte`:
- `+page.server.ts` already loads `summary` + `patterns` data
- Render: total queries (weekly), avg latency, cache hit rate, top 10 query patterns
- Use existing `event-logger.ts` functions: `getWeeklySummary()`, `getTopQueryPatterns()`

### TODO 2: Neo4j Read Queries (~4 hrs)
Create `src/lib/server/graph/neo4j-analytics.ts`:
- `getRelatedCases(caseId)` — Cypher 2-3 hop traversal for case connections
- `getUserBehaviorPattern(userId)` — most viewed cases, frequent searches
- `getCaseConnections(caseId)` — entities shared between cases
- Wire into `/api/graph/connections` (route exists but uses simple query)

### TODO 3: Neo4j in KAG Pre-Retrieval (~8 hrs) — P1b from deep-review
- Current: `graph-context.ts` queries PG `yorha_evidence_connections` only
- Add: Cypher `MATCH (c:Case)-[*1..3]-(related) WHERE c.id = $caseId RETURN related`
- Wire: After PG graph context, UNION with Neo4j results, deduplicate
- This is the biggest remaining Neo4j gap

### TODO 4: Graph Centrality (~2 hrs)
Create `src/lib/server/graph/centrality.ts`:
- Run degree centrality on Case→Evidence→Entity graph
- Run PageRank on User→Case interaction graph
- Store scores as Neo4j node properties
- Use for recommendation ranking

### TODO 5: Recommendation Engine (~4 hrs)
Create recommendation function combining:
- Neo4j graph proximity (cases connected to current via shared entities)
- Qdrant vector similarity (similar user searches → similar cases)
- PostgreSQL analytics frequency (most viewed related cases)
- Existing `/api/graph/recommendations` route uses Qdrant+Ollama — extend with Neo4j

### TODO 6: ACE Context Enrichment (~2 hrs)
Inject analytics into SSE chat system prompt in `/api/sse/chat`:
- Recently viewed cases (from Neo4j VIEWED relationships)
- Frequent search patterns (from event-logger)
- Related evidence (from Neo4j graph traversal)

---

## Dependencies
- Neo4j running (`docker compose --profile full up -d`)
- Ollama with embeddinggemma loaded
- Qdrant with write access
- RabbitMQ analytics.track queue consumer (already wired)