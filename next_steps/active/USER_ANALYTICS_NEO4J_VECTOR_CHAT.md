# User Analytics — Neo4j + embeddinggemma + Qdrant → ACE Contextual Chat

## Status: CODE EXISTS, NEEDS DATA + VALIDATION
## Priority: Medium-High
## Created: 2026-03-26
## Re-Audited: 2026-04-07 (codebase-verified)

---

## Re-Audit Results (April 7, 2026)

Previous audit (April 6) incorrectly marked 5 components as MISSING. Codebase verification confirms they exist.

### Correct Path Map

| Component | File | Status |
|-----------|------|--------|
| Analytics store | `src/lib/stores/analytics.svelte.ts` | WORKING — 19 routes wired, batched flush |
| Event logger | `src/lib/server/analytics/event-logger.ts` | WORKING — `getWeeklySummary()`, `getTopQueryPatterns()` |
| Analytics API | `src/routes/api/analytics/events/+server.ts` | WORKING — Zod validated, auth required |
| RabbitMQ consumer | `src/lib/server/queue/rabbitmq-manager-fixed.ts` (line 505) | WORKING — analytics.track queue |
| Neo4j driver | `src/lib/server/neo4j-driver.ts` | WORKING — bolt connection |
| Neo4j schema | `src/lib/server/graph/neo4j-schema.ts` | WORKING |
| Neo4j write sync | `src/lib/server/graph/user-interaction-sync.ts` | WORKING — VIEWED/CREATED/SEARCHED |
| PG→Neo4j case sync | `src/lib/server/graph/pg-neo4j-sync.ts` | WORKING — `syncCaseToGraph()` |
| Evidence graph | `src/lib/server/graph/evidence-graph-service.ts` | WORKING — MERGE + SIMILAR_TO |
| Page server load | `src/routes/(app)/analytics/+page.server.ts` | WORKING — loads summary + patterns |
| **Dashboard UI** | `src/routes/(app)/analytics/+page.svelte` | **EXISTS** — 473 lines, 3 tabs (overview, patterns, cache) |
| **Graph centrality** | `src/lib/server/graph/graph-centrality.ts` | **EXISTS** — 274 lines, 3 Cypher functions |
| **Recommendations API** | `src/routes/api/recommendations/+server.ts` | **EXISTS** — 477 lines, 5-signal ranking pipeline |
| **Graph recommendations** | `src/routes/api/graph/recommendations/+server.ts` | **EXISTS** — 145 lines, LLM-based |
| **Multi-modal ranker** | `src/lib/server/ml/multi-modal-ranker.ts` | **EXISTS** — `rankCombinedResults()` |
| **User history tracker** | `src/lib/server/ml/user-history.ts` | **EXISTS** — `UserHistoryTracker` class |
| **ACE analytics context** | `src/lib/server/ace/user-analytics-context.ts` | **EXISTS** — 3-source parallel fetch |
| **Neo4j multi-hop** | `src/lib/server/retrieval/graph-context.ts` | **EXISTS** — `getNeo4jMultiHopNeighbors()` |
| Neo4j seed script | `scripts/seed-neo4j.mjs` | **EXISTS** — 362 lines, PG→Neo4j MERGE |

### Neo4j Read Queries (4 distinct Cypher queries exist)

| Function | File | Cypher | Used By |
|----------|------|--------|---------|
| `fetchGraphDocuments(caseId)` | `graph-centrality.ts` | 2-hop traversal + degree centrality | `/api/recommendations` |
| `computeCentralityForNodes(nodeIds)` | `graph-centrality.ts` | Batch degree centrality | `/api/recommendations` (enrichment) |
| `findConnectedCases(caseId)` | `graph-centrality.ts` | 2-hop via shared entities | `user-analytics-context.ts` |
| `getNeo4jMultiHopNeighbors(caseId)` | `graph-context.ts` | 1-3 hop traversal, 25 results | `/api/sse/chat` (line 1050) |

### ACE Context Injection (verified in SSE chat)

`/api/sse/chat/+server.ts` dynamically imports `fetchUserAnalyticsContext()` which runs 3 parallel queries:
1. **PG**: Recent search patterns (top 3 from event-logger)
2. **Neo4j**: Related cases (top 3 from `findConnectedCases()`)
3. **Qdrant**: Similar past queries (top 3 from `user_searches` embeddings)

Injects ≤400 chars into LLM system prompt. Non-fatal catch wrapper.

---

## Architecture (current reality)

```
Client Events (analytics.svelte.ts)  ← WORKING
  → Batch flush (30s / 100 events)
    → POST /api/analytics/events      ← WORKING
      → event-logger.ts → PostgreSQL   ← WORKING
      → RabbitMQ analytics.track queue ← WORKING
        → Redis sorted set             ← WORKING
        → Neo4j sync (WRITE)           ← WORKING
        → Qdrant user_searches embed   ← WORKING

Neo4j READ chain:                      ← CODE EXISTS, RETURNS EMPTY (no data)
  graph-centrality.ts → 3 Cypher queries → recommendations API
  graph-context.ts → getNeo4jMultiHopNeighbors → SSE chat
  user-analytics-context.ts → findConnectedCases → ACE system prompt

Dashboard UI:                           ← EXISTS (473 lines)
  analytics/+page.svelte → 3 tabs (overview, patterns, cache)
  analytics/+page.server.ts → loads summary + patterns from PG

Recommendation pipeline:                ← CODE EXISTS, NEEDS VALIDATION
  /api/recommendations → embed → candidates (RAG+graph+tags) → rank → cache
  /api/graph/recommendations → LLM Ollama → GBNF JSON → Qdrant search
```

---

## Problem: Code Exists But Returns Empty

All Neo4j-reading code degrades gracefully to empty results. The graph reads are wired but produce no data because:

1. **Neo4j has no data** — needs seeding from PostgreSQL
2. **Neo4j not in essential profile** — only starts with `docker compose --profile full up -d`
3. **Recommendation pipeline not validated end-to-end** — never tested with real Neo4j data

---

## Remaining TODOs

### TODO 1: Activate Neo4j + Seed Data (~20 min)
```bash
docker compose --profile full up -d neo4j
node scripts/seed-neo4j.mjs          # PG → Neo4j (cases, persons, evidence, citations, glossary)
node scripts/seed-neo4j.mjs --verify  # Check node/relationship counts
```
This unlocks: graph centrality, multi-hop case connections, recommendations, ACE context enrichment.

### TODO 2: End-to-End Validation (~2 hrs)
After seeding:
- [ ] Test `/api/recommendations` POST with a real caseId → verify 5-signal ranking returns results
- [ ] Test `/api/graph/recommendations` POST → verify LLM-based recommendations
- [ ] Test SSE chat with a case → verify Neo4j multi-hop appears in system prompt
- [ ] Test analytics dashboard → verify 3 tabs render with real data
- [ ] Test `fetchUserAnalyticsContext()` → verify all 3 sources return non-empty

### TODO 3: User Recommendation from Graph Analysis (~4 hrs)
Currently missing: **user-specific** graph recommendations. Existing recs are case-scoped.
- [ ] Add user→case interaction graph (VIEWED, SEARCHED, ANALYZED edges)
- [ ] PageRank on user interaction graph → personalized case suggestions
- [ ] Wire user-specific recommendations into dashboard "For You" section
- [ ] Store recommendation scores as Neo4j node properties for fast retrieval

### ~~TODO 4: Qdrant user_searches Similarity Query~~ ✅ DONE (Apr 7, 2026)
- [x] `/api/analytics/similar-queries` endpoint created — embeds query → searches `user_searches` collection
- [ ] Wire into ACE context (currently `fetchUserAnalyticsContext` attempts this but may fail silently)

### TODO 5: Analytics Dashboard Enhancements (~2 hrs)
Dashboard exists but could show more:
- [ ] Neo4j-powered tab: case connections graph visualization
- [ ] Recommendation history: show past recommendations + click-through rate
- [ ] User interaction timeline (from Neo4j VIEWED/SEARCHED edges)

### TODO 6: Add Missing Env Vars to .env.example
- [ ] `SEARXNG_URL=http://localhost:8080`
- [ ] `DOCLING_SERVICE_URL=http://localhost:8085`
- [ ] `WHISPER_MODEL=base`
- [ ] `WHISPER_CUDA=true`

---

## Dependencies
- Neo4j running (`docker compose --profile full up -d neo4j`)
- Neo4j seeded (`node scripts/seed-neo4j.mjs`)
- Ollama with embeddinggemma loaded
- Qdrant with write access
- RabbitMQ analytics.track queue consumer (already wired)