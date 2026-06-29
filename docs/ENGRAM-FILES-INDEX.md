# Engram + ACE Memory System — Complete File Index

**Last Updated:** June 29, 2026  
**All files are PostgreSQL-backed + Redis L1 cache hybrid**

---

## Core Engram Engine

### Memory Registry (High-Level API)
- **`sveltekit-frontend/src/lib/server/ai/engram-registry.ts`** (420 lines)
  - `recallEngramsForIntent(query, limit, scope)` — Postgres SELECT + Redis cache
  - `persistIntentEvalRun(run)` — Postgres INSERT (intent_eval_runs)
  - `updateEngramCardFromMemory(memory_id, updates)` — Postgres UPDATE (engram_cards)
  - Uses: Drizzle ORM, ioredis, zod validation
  - **DB:** memory_registry, engram_cards, intent_eval_runs tables

### Bigram Transitions (Low-Level Redis)
- **`sveltekit-frontend/src/lib/server/ai/engram-memory.ts`** (180 lines)
  - `hashQuery(query)` — SHA256 → 16-char hex
  - `recordEngramTransition(redis, prev, current, somRow, somCol)` — Redis ZADD + SET
  - `getKarpathyEncoded(redis, filePath)` — Redis HGET (64-dim vector)
  - `seedEngramVec64(redis, filePath)` — Redis SET cache
  - **Cache keys:** ace:engram:query:*, ace:engram:bigram:*, ace:engram:vec64:*, gpu:karpathy:*

### Type Definitions (Validation)
- **`sveltekit-frontend/src/lib/server/engram/engram-types.ts`** (200 lines)
  - `RetrievalResult` / `RetrievalTrace` (Zod schemas)
  - `RewardEvent` (signal feedback schema)
  - `RecallRequest` / `RecallResponse` (card recall contract)
  - `PromotionState` enum: active | superseded | archived | rejected

---

## PostgreSQL Schema Definitions

### Memory Registry Table
- **`sveltekit-frontend/src/lib/server/db/schema/memory-registry.ts`** (97 lines)
  - `memoryRegistry` table (Drizzle)
    - source_id, chunk_id, summary_id, embedding_id, cluster_id, packet_id, memory_id
    - feature_family, user_intent, tags (JSONB), hotness (REAL), metadata (JSONB)
    - Indexes: source_id, feature_family, user_intent, memory_id
  - `engramCards` table (Drizzle)
    - memory_id (unique), scope, summary, labels, related_paths, related_tools, did_you_mean
    - source_refs, embedding_id, qdrant_point_id, ttl_seconds
    - Indexes: scope, memory_id (unique)
  - `intentEvalRuns` table (Drizzle)
    - run_id, user_query, predicted_intent, confidence
    - selected_cards, selected_clusters, cache_hit, user_accepted, correction_label, reward
    - Indexes: run_id, predicted_intent

### Context Timeline Table
- **`sveltekit-frontend/src/lib/server/db/schema/context-timeline.ts`** (33 lines)
  - `contextTimeline` table (Drizzle)
    - user_id (FK → users), session_id, event_type (research|feedback|citation|graph_edge|rl_adapt|tool_call|summary)
    - pipeline, summary_id, hyperedge_hash, signal, grpo_reward, pipeline_weight_after
    - triggered_rebuild (boolean), payload (JSONB), created_at
    - Indexes: user_created, session_created, event_type, pipeline_reward, hyperedge

---

## Integration with Agentic System

### NATS Handler (Feedback Recording)
- **`sveltekit-frontend/scripts/nats-handlers.mjs`** (180 lines)
  - `handleEngramFeedback()` — NEW HANDLER (Phase 2)
    - Receives: task_id, file, title, outcome (fixed|failed), duration_ms, blend_score
    - Writes to: engram_registry, context_timeline via Drizzle
    - Invalidates: Redis L1 cache keys
    - Responds: {task_id, status, persisted}

### TODO Aggregator (Signal Reading)
- **`scripts/skills/codebase-todo-aggregator.mjs`** (204 lines)
  - Reads: ace:authority:top (Redis hash, 40% weight)
  - Reads: gpu:karpathy:scores (Redis hash, 35% weight + 15% attention)
  - Reads: ace:rank:dirty_files (Redis set, 10% boost)
  - Reads: memory_registry.hotness (Postgres, filter by feature_family)
  - Outputs: ranked list of top 7 tasks with blend scores

### Intent Ranker (Recall & Suggestions)
- **`sveltekit-frontend/src/lib/server/features/ai/ai/intent-ranker.ts`** (TBD)
  - Queries: memory_registry by user_intent + feature_family
  - Ranks: by hotness + tf-idf similarity to current query
  - Returns: top N engram cards + did_you_mean suggestions
  - Cache: Redis engram:card:{memory_id} (7d TTL)

### Context Assembler (ACE Signals)
- **`sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts`** (1200+ lines)
  - Reads: context_timeline for user signals (thumbs_up, citation_saved, dwell)
  - Reads: intentEvalRuns for intent classification history
  - Feeds into: ACE Stage A0–A5 retrieval scoring
  - Updates: grpo_reward on context_timeline for GRPO training

### Synthesis Logger (Outcome Recording)
- **`sveltekit-frontend/src/lib/server/observability/synthesis-logger.ts`** (TBD)
  - Logs: synthesis outcome → context_timeline (event_type='summary')
  - Records: grpo_reward signal (thumbs_up = +0.1, thumbs_down = -0.1)
  - Triggers: rebuild if signal strong enough
  - Updates: pipeline_weight_after for reranking

---

## Analytics & Training Data

### Search Analytics
- **`sveltekit-frontend/src/lib/server/features/observability/search-analytics.ts`** (TBD)
  - `chunkHitLog` table — logs every chunk retrieved
  - `queryVariancePairs` table — pairs of similar queries
  - `ragQueryLog` table — full RAG query traces
  - `qloraExamples` table — training examples for QLoRA fine-tuning
  - `responseFeedback` table — user feedback on responses

### Agentic Proposal
- **`sveltekit-frontend/src/lib/server/analysis/agentic-fix-proposal.ts`** (TBD)
  - Records proposed fix to context_timeline
  - Links to engram_cards for retrieval context

---

## MCP Tools (Gemma4 Interface)

### Engram MCP Tools
- **`sveltekit-frontend/src/mcp/engram_tools.ts`** (TBD)
  - `engram.recall_cards(query, limit, scope)` — recall engram cards
    - Calls: recallEngramsForIntent(query, limit, scope)
    - Returns: RecalledEngramCard[]
  - `engram.record_feedback(memory_id, signal, reward)` — record signal
    - Calls: persistIntentEvalRun() or context_timeline INSERT
  - `engram.get_did_you_mean(query)` — spelling/suggestion
    - Queries: Redis ace:engram:bigram:{hash} for next queries
    - Returns: string[]

### TRACE MCP Server
- **`sveltekit-frontend/src/mcp/trace-mcp-server.ts`** (TBD)
  - Exposes: 40+ tools to Gemma4
  - Includes: engram_tools (via engram_tools.ts)
  - Listens: port 8788 (HTTP Streamable transport)

---

## Tests & Verification

### Integration Tests
- **`sveltekit-frontend/tests/engram-registry.spec.ts`**
  - Tests: recallEngramsForIntent, persistIntentEvalRun, updateEngramCardFromMemory
  - Uses: Postgres test database, Redis test instance
  - Coverage: cache hit/miss, Postgres fallback, scoring

- **`sveltekit-frontend/tests/engram-registry-db.integration.spec.ts`**
  - Tests: full Postgres + Redis integration
  - Verifies: data consistency, cache invalidation

- **`sveltekit-frontend/tests/engram-recall.spec.ts`**
  - Tests: recordEngramTransition, getKarpathyEncoded, seedEngramVec64
  - Uses: Redis test instance
  - Coverage: bigram transitions, BMU mapping, vec64 encoding

- **`sveltekit-frontend/tests/engram-dym.spec.ts`**
  - Tests: did-you-mean suggestions from engram bigrams
  - Verifies: next-query predictions, typo correction

- **`sveltekit-frontend/tests/engram-graph-rerank.spec.ts`**
  - Tests: Karpathy reranking using engram signals
  - Verifies: blend score consistency

### Unit Tests
- **`sveltekit-frontend/tests/unit/local-engram-memory-adapter.test.ts`**
  - Tests: IndexedDB fallback for browser-side engram
  - Verifies: offline mode, cache consistency

- **`sveltekit-frontend/tests/intent-ranker.spec.ts`**
  - Tests: intent classification recall
  - Verifies: cosine similarity scoring, tf-idf weighting

---

## Local Fallback & Browser Support

### Local Engram Adapter (IndexedDB)
- **`sveltekit-frontend/src/lib/server/memory/local-engram-memory-adapter.ts`** (TBD)
  - Fallback: when Postgres unavailable
  - Storage: IndexedDB (50MB limit)
  - Used by: React DevTools, offline mode
  - Implements: same interface as engram-registry.ts

### Plugin Adapter (OpenCode Integration)
- **`sveltekit-frontend/src/lib/server/memory/engram-plugin-adapter.ts`** (TBD)
  - Bridges: Engram to OpenCode plugin model
  - Sync: OpenCode memory ↔ Postgres engram_cards
  - Used by: `scripts/opencode/bootstrap-workspace.mjs`

---

## Related Files (Signal Sources)

### Search Analytics Pipeline
- **`sveltekit-frontend/src/lib/server/db/schema/search-analytics.ts`**
  - chunkHitLog, queryVariancePairs, ragQueryLog, qloraExamples, responseFeedback

### Token Map (Cache Key Generation)
- **`sveltekit-frontend/src/lib/server/token-map/token-map-service.ts`**
  - Generates: unique cache keys for queries
  - Used by: engram query hashing

### LangGraph DAG (Orchestration)
- **`sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts`**
  - Orchestrates: NATS handlers via LangGraph
  - Calls: engram.feedback.async on completion

### MCP Tool Dispatch
- **`sveltekit-frontend/src/lib/server/ai/mcp-tool-dispatch.ts`**
  - Routes: Gemma4 tool calls to engram_tools
  - Records: tool_call event to context_timeline

---

## Configuration & Environment

### npm Scripts (package.json additions)

```json
{
  "engram:record:task": "node scripts/engram/record-task-outcome.mjs",
  "engram:recall:query": "node scripts/engram/recall-engram-cards.mjs",
  "engram:timeline:user": "node scripts/engram/query-context-timeline.mjs",
  "engram:cache:warm": "node scripts/engram/warm-engram-cache.mjs",
  "engram:audit:health": "node scripts/engram/audit-engram-health.mjs"
}
```

### Environment Variables

```bash
# Postgres (primary)
DATABASE_URL=postgresql://legal_admin:password@127.0.0.1:5432/legal_ai_db

# Redis (L1 cache)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=redis

# NATS (task bus)
NATS_URL=nats://localhost:4222
```

---

## Data Flow Summary

```
Task Execution (NATS)
  ↓
engram.feedback.async
  ↓
NATS handler → Postgres INSERT
  ├─ intent_eval_runs (outcome record)
  ├─ context_timeline (signal event)
  └─ Redis invalidation
  ↓
TODO Aggregator reads:
  ├─ memory_registry.hotness (Postgres)
  ├─ gpu:karpathy:scores (Redis)
  ├─ ace:authority:top (Redis)
  └─ ace:engram:bigram:* (Redis)
  ↓
Ranks next tasks by blend score
  ↓
Next TODO run reflects success/failure
```

---

## Health Checks

| Component | Check | Expected | Command |
|-----------|-------|----------|---------|
| **Postgres** | memory_registry rows | > 100 | `psql -c "SELECT COUNT(*) FROM memory_registry"` |
| **Postgres** | engram_cards rows | > 10 | `psql -c "SELECT COUNT(*) FROM engram_cards"` |
| **Postgres** | intent_eval_runs | > 1K | `psql -c "SELECT COUNT(*) FROM intent_eval_runs WHERE created_at > NOW() - INTERVAL '7 days'"` |
| **Postgres** | context_timeline | > 5K | `psql -c "SELECT COUNT(*) FROM context_timeline"` |
| **Redis** | gpu:karpathy:scores | > 100 keys | `redis-cli HLEN gpu:karpathy:scores` |
| **Redis** | ace:engram:bigram:* | > 50 keys | `redis-cli KEYS 'ace:engram:bigram:*' \| wc -l` |
| **Redis** | cache hit rate | > 50% | `redis-cli INFO stats \| grep keyspace_hits` |

---

## Status

✅ PostgreSQL tables created and indexed  
✅ Drizzle ORM schema defined  
✅ Redis L1 cache keys mapped  
✅ Engram registry API complete  
✅ Bigram transition tracking ready  
⏳ NATS handler wiring (Phase 2)  
⏳ TODO aggregator signal integration  
⏳ Intent ranker recall implementation  
⏳ Context timeline population  

---

**Owner:** Agentic system  
**Next:** Implement NATS engram.feedback.async handler

