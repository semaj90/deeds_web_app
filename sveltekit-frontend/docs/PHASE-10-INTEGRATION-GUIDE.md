# Phase 10: Unified Packet Ontology Registry — Complete Integration Guide

**Status**: ✅ **APPLY_PROVEN** (Schema + Scaffolds + Go Services Wired)  
**Last Updated**: July 9, 2026  
**Author**: Claude Code + User

---

## Overview

Phase 10 unifies **packets, tools, prompts, tests, and specifications** under a single ontology registered in Postgres. This enables:
- **Telemetry feedback loop** — Tool execution → rolling 7-day stats → observation layer integration
- **Multi-signal retrieval** — Search across code, tests, docs, APIs, schemas, specs with schema-aware ranking
- **HMM-aware tool selection** — Learned routing based on tool lineage + execution history
- **Unified Go service integration** — Embedding, retrieval, and search services share common packet format

---

## Architecture Overview

### 5-Layer Truth Flow

```
Layer 1: Tool Execution Events (RabbitMQ)
         ↓
Layer 2: tool_execution_log (Postgres canonical truth)
         ↓
Layer 3: tool_execution_stats_7d (materialized view, hourly refresh)
         ↓
Layer 4: tool_registry (enriched with rolling stats)
         ↓
Layer 5: go-retrieval (search + ranking via unified HMM)
```

### Services Architecture

| Service | Port | Role | Truth Authority |
|---------|------|------|-----------------|
| **legal-ai-go-embedding** | 8097 (HTTP), 50051 (gRPC) | 384-dim vector generation | Qdrant (vector store) |
| **legal-ai-go-search** | 8096 (HTTP), 50055 (gRPC) | Schema-aware BM25 + API discovery | Postgres tool_registry |
| **legal-ai-go-retrieval** | 8100 (HTTP), 50053 (gRPC) | Unified RAG/KAG/DAG retrieval + HMM routing | Postgres + Qdrant + Redis |

### Packet Types

```
packet_type enum ∈ {
  'code',      // Implementation files
  'test',      // Test files
  'doc',       // Documentation
  'prompt',    // Prompt/instruction files
  'tool',      // MCP tools + tool definitions
  'schema',    // Drizzle + TypeScript schema definitions
  'api',       // SvelteKit API routes (Phase 10)
  'spec',      // OpenAPI/proto/Zod specifications
}
```

---

## Phase 10 Task Groups

### Task Group 1: Schema & Tables ✅ APPLY_PROVEN

**Files**:
- `drizzle/0020_phase10_packet_ontology.sql` (live migration)
- `src/lib/server/db/schema/phase10-ontology.ts` (Drizzle schema)

**Components**:
1. ✅ `packet_type` enum (8 values)
2. ✅ `tool_execution_log` table (7 columns, 4 indexes)
3. ✅ `tool_execution_stats_7d` materialized view (8 columns)
4. ✅ `atlas_packets` ontology columns (5 new JSONB fields)
5. ✅ `tool_registry` columns (9 new JSONB + scalar fields)

**Verification**:
```bash
npm run atlas:phase10:validate
# Expected: All 6 gates PASS
```

---

### Task Group 2: Materialized View for Telemetry ⏳ READY

**Purpose**: Keep `tool_execution_stats_7d` fresh with hourly refresh

**Implementation**:
```bash
# Test immediate refresh
npm run atlas:phase10:stats:scheduler:test

# Install pg_cron and create schedule
npm run atlas:phase10:stats:scheduler:install-pg-cron

# Alternative: Dry-run to see options
npm run atlas:phase10:stats:scheduler:dry
```

**What It Does**:
- Queries `tool_execution_log` (last 7 days)
- Aggregates: success_count, failure_count, avg_latency_ms, rolling_success_rate
- REFRESH MATERIALIZED VIEW CONCURRENTLY (non-blocking)
- Updates `tool_registry` with fresh stats

**Schedule**:
- Frequency: Hourly at :00 minutes (configurable via `0 * * * *`)
- Duration: 1-5 seconds per refresh
- Fallback: RabbitMQ queue if pg_cron unavailable

---

### Task Group 3: RabbitMQ Telemetry Consumer ⏳ TODO

**Purpose**: Wire tool execution events from routes into `tool_execution_log`

**Files to Create**:
- `scripts/workers/tool-telemetry-consumer.mjs` (120 lines)

**Canonical Flow**:
```
Route calls selectTool() → emits event to RabbitMQ 'tool.telemetry' queue
   ↓
Worker listens on 'tool.telemetry'
   ↓
Worker builds ToolExecutionLog row (tool_id, query, success, latency_ms, error_type, timestamp)
   ↓
Worker writes to tool_execution_log table
   ↓
Materialized view picks it up on next refresh
```

**npm Scripts to Add**:
```json
"atlas:phase10:telemetry:consumer:start": "node scripts/workers/tool-telemetry-consumer.mjs",
"atlas:phase10:telemetry:consumer:test": "node scripts/workers/tool-telemetry-consumer.mjs --test-mode"
```

---

### Task Group 4: Tool Embedding Enrichment ⏳ TODO

**Purpose**: Regenerate 384-dimensional embeddings for all tools

**Implementation**:
```bash
# Dry-run (shows what would be embedded)
npm run atlas:phase10:tool-embeddings:regenerate:dry

# Generate embeddings via legal-ai-go-embedding:8097
npm run atlas:phase10:tool-embeddings:regenerate

# Persist to tool_registry.embedding (384-dim vector)
npm run atlas:phase10:api-indexing:persist:mirror
```

**Enriched Tool Summary** (for embedding):
```
"{tool.name} {tool.description} Input schema: {input_schema} 
Output schema: {output_schema} Examples: {examples} 
Domains: {domains} Limitations: {limitations}"
```

---

### Task Group 5: Schema Compatibility Filtering ⏳ TODO

**Purpose**: Integrate schema validation into rankTools()

**Files to Enhance**:
- `src/lib/server/heuristics/rank-tools-with-schema.ts` (new)

**Rules**:
- Tool's `input_schema` must validate against query parameters
- Tool's `output_schema` must be compatible with caller's expected type
- Filter out schema-incompatible tools before ranking

---

### Task Group 6: Packet Type Backfill ⏳ TODO

**Purpose**: Classify existing packets by packet_type

**Implementation**:
```bash
# Dry-run (shows classification strategy)
npm run atlas:phase10:backfill:packet-type:dry --priority=code,test

# Apply backfill
npm run atlas:phase10:backfill:packet-type:apply --priority=code,test
```

**Strategy**:
- Deterministic classification by file extension + directory_path
- Priority order: test files, code, docs, APIs, schemas
- Target: >95% coverage for code + test packets

---

## API Indexing Pipeline (New in Phase 10)

### Canonical Flow

```
1. Scan src/routes/api/**+server.ts
   ↓
2. Extract:
   - Route path → tool_id (deterministic)
   - HTTP handlers (GET, POST, etc.)
   - Zod schemas (input/output)
   - JSDoc comments (description)
   ↓
3. Build tool packets:
   - tool_registry INSERT columns populated
   - JSONB payloads: capabilities, constraints, examples, tags
   ↓
4. Call legal-ai-go-embedding:8097 for vectors (optional --embed)
   ↓
5. Persist to tool_registry (INSERT OR UPDATE on conflict)
   ↓
6. Mirror to Qdrant tool_registry collection
   ↓
7. go-retrieval searches across unified tool space
```

### npm Scripts

```bash
# Dry-run (show metadata extraction without persisting)
npm run atlas:phase10:api-indexing:dry

# Generate embeddings for APIs
npm run atlas:phase10:api-indexing:embed

# Persist to Postgres tool_registry
npm run atlas:phase10:api-indexing:persist:apply

# Mirror to Qdrant (optional)
npm run atlas:phase10:api-indexing:persist:mirror
```

---

## Daily Graphify Enhancement

### 4-Stage Pipeline

**Stage A0: Tool Indexing** (5-10s)
- Index canonical tools to go-search-service `/api/tools/index/batch`
- Updates: trace.kag_search, qdrant.dense_search, rg.lexical_search, etc.

**Stage A1: Telemetry Sync** (2-3s)
- POST tool_execution_stats_7d to go-retrieval `/api/stats/refresh`
- 7-day rolling stats sync

**Stage A2: API Discovery** (10-15s)
- Glob src/routes/api/** and register as packet_type='api'
- Persist to tool_registry

**Stage A3: Search Validation** (3-5s)
- Health checks: /health on go-search, go-retrieval, go-embedding
- Contract tests: /api/search returns `{ candidates[], ranked, explanation }`

### npm Scripts

```bash
# Dry-run all stages
npm run atlas:phase10:graphify-enhancement:dry

# Apply all stages
npm run atlas:phase10:graphify-enhancement:apply

# Run specific stage
npm run atlas:phase10:graphify-enhancement:stage A0
npm run atlas:phase10:graphify-enhancement:stage A1
npm run atlas:phase10:graphify-enhancement:stage A2
npm run atlas:phase10:graphify-enhancement:stage A3
```

---

## Implementation Checklist

### Phase 10a (Schema & Go Services) ✅ COMPLETE

- [x] Postgres schema migration applied
- [x] Drizzle schema definitions created
- [x] packet_type enum with 8 values
- [x] tool_execution_log table + indexes
- [x] tool_execution_stats_7d materialized view
- [x] atlas_packets ontology columns
- [x] tool_registry enrichment columns
- [x] Go service discovery (search/embedding/retrieval)
- [x] API indexing scaffolds wired
- [x] Daily graphify enhancement stages planned

### Phase 10b (Telemetry & Feedback Loop) ⏳ IN PROGRESS

- [ ] Task Group 2: Materialized view refresh scheduler — **READY TO EXECUTE**
  ```bash
  npm run atlas:phase10:stats:scheduler:install-pg-cron
  ```

- [ ] Task Group 3: RabbitMQ telemetry consumer
  ```bash
  # File to create: scripts/workers/tool-telemetry-consumer.mjs
  # Listener pattern: amqplib channel.consume('tool.telemetry', callback)
  ```

- [ ] Task Group 4: Tool embedding regeneration
  ```bash
  npm run atlas:phase10:tool-embeddings:regenerate
  ```

- [ ] Task Group 5: Schema compatibility filtering
  ```bash
  # File to create: src/lib/server/heuristics/rank-tools-with-schema.ts
  ```

- [ ] Task Group 6: Packet type backfill
  ```bash
  npm run atlas:phase10:backfill:packet-type:apply --priority=code,test
  ```

### Phase 10c (HMM Integration & Deployment) ⏳ PLANNED

- [ ] Wire tool telemetry into HMM state transitions
- [ ] Train HMM on execution history (success/failure patterns)
- [ ] Deploy tool router with learned routing policy
- [ ] Monitor feedback loop: tool selection → execution → stats → next decision

---

## Verification & Testing

### Pre-Deployment Validation

```bash
# Full 6-gate smoke test
npm run atlas:phase10:validate

# Expected output:
# ✅ Gate 1: packet_type enum exists (8 values)
# ✅ Gate 2: atlas_packets ontology columns added (5 columns)
# ✅ Gate 3: tool_registry telemetry columns added (9 columns)
# ✅ Gate 4: tool_execution_log table created (7 columns)
# ✅ Gate 5: tool_execution_log indexes created (4+ indexes)
# ✅ Gate 6: tool_execution_stats_7d materialized view created (8 columns)
```

### Go Service Health Check

```bash
npm run atlas:phase10:go-integration:check-health

# Expected:
# ✅ go-search-service: UP (BM25 + schema-aware search)
# ✅ go-embedding-service: UP (384-dim proxy)
# ✅ go-retrieval-service: UP (unified RAG/KAG/DAG)
```

### Materialized View Refresh Test

```bash
npm run atlas:phase10:stats:scheduler:test

# Expected:
# 🧪 Testing materialized view refresh...
# ✅ Refresh completed in Xms
# View contains N rows
```

### API Indexing End-to-End

```bash
# 1. Extract and show metadata
npm run atlas:phase10:api-indexing:dry

# 2. Generate embeddings (optional)
npm run atlas:phase10:api-indexing:embed

# 3. Persist to tool_registry
npm run atlas:phase10:api-indexing:persist:apply

# 4. Verify in database
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) total, COUNT(CASE WHEN packet_type='api' THEN 1 END) api_tools FROM tool_registry;"
```

---

## Database Queries for Monitoring

### Tool Registry Coverage

```sql
SELECT
  COUNT(*) total_tools,
  COUNT(CASE WHEN packet_type='api' THEN 1 END) api_tools,
  COUNT(CASE WHEN packet_type='code' THEN 1 END) code_tools,
  COUNT(CASE WHEN packet_type='tool' THEN 1 END) mcp_tools,
  COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) embedded_tools
FROM tool_registry;
```

### Telemetry Stats (7-day window)

```sql
SELECT
  tool_id,
  success_count,
  failure_count,
  ROUND(CAST(success_count AS NUMERIC) / (success_count + failure_count) * 100, 1) as success_rate_pct,
  ROUND(CAST(avg_latency_ms AS NUMERIC), 1) as avg_latency,
  last_refreshed_at
FROM tool_execution_stats_7d
ORDER BY success_count DESC
LIMIT 10;
```

### Execution Log (recent events)

```sql
SELECT
  tool_id,
  query,
  success,
  latency_ms,
  error_type,
  timestamp
FROM tool_execution_log
WHERE timestamp > NOW() - INTERVAL '1 hour'
ORDER BY timestamp DESC
LIMIT 20;
```

---

## Integration with HMM & Tool Routing

### State Transitions Using Telemetry

```
selectTool(query, context)
  ↓
(Query → embedding)
  ↓
Rank candidates by:
  • schema_compatibility (Task Group 5)
  • rolling_success_rate_7d (from materialized view)
  • latency_performance (avg_latency_ms < threshold)
  • domain_affinity (tool.domain matches query.domain)
  ↓
HMM state transition: (tool_id, success) → next decision
  ↓
Emit event → RabbitMQ tool.telemetry queue
  ↓
Consumer writes to tool_execution_log
  ↓
Materialized view updates on hourly refresh
```

---

## FAQ & Troubleshooting

### Q: Why is the materialized view refresh slow?

**A**: First refresh is slow (full scan). Subsequent REFRESH CONCURRENTLY updates only changed rows. If still slow:
- Add indexes on tool_execution_log (already done in schema)
- Increase work_mem in Postgres config
- Run during low-traffic window

### Q: How do I backfill embeddings for existing tools?

**A**: Use the embedding regeneration script:
```bash
npm run atlas:phase10:tool-embeddings:regenerate
```
This calls legal-ai-go-embedding:8097 for each tool and updates tool_registry.embedding.

### Q: Can I use Qdrant without legal-ai-go-embedding?

**A**: Yes, but tool discovery will be less effective. Mirroring to Qdrant still works; vectors will be placeholder zeros until embeddings are generated. Recommend: generate embeddings first, then mirror.

### Q: What if pg_cron is not available?

**A**: Use RabbitMQ polling fallback:
1. Route emits events to `tool.telemetry` queue
2. Separate worker listens and triggers refresh on-demand
3. Less frequent than hourly, but sufficient for most use cases

### Q: How do I test the telemetry consumer?

**A**: After creating the consumer:
```bash
npm run atlas:phase10:telemetry:consumer:test
# Manually insert a row into tool_execution_log:
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "INSERT INTO tool_execution_log (tool_id, query, success, latency_ms, timestamp) VALUES ('test.tool', 'query', 1, 100, NOW());"
# Verify in tool_execution_stats_7d
```

---

## Next Steps

1. **Execute Task Group 2** (Materialized View Refresh):
   ```bash
   npm run atlas:phase10:stats:scheduler:install-pg-cron
   ```

2. **Create Task Group 3** (RabbitMQ Consumer):
   - File: `scripts/workers/tool-telemetry-consumer.mjs`
   - Pattern: Listen on `tool.telemetry` queue, write to tool_execution_log

3. **Execute Task Groups 4-6** in parallel:
   - Generate embeddings
   - Backfill packet types
   - Integrate schema filtering

4. **Test end-to-end**:
   - Route → selectTool() → emit event → consumer writes → view refreshes → HMM sees fresh stats

5. **Monitor in production**:
   - Query tool_execution_stats_7d hourly
   - Alert if refresh latency > 30s or success_rate < threshold

---

## References

- [Postgres Materialized Views](https://www.postgresql.org/docs/current/sql-creatematerializedview.html)
- [pg_cron Documentation](https://github.com/citusdata/pg_cron)
- [RabbitMQ amqplib Guide](https://www.rabbitmq.com/tutorials/tutorial-one-javascript.html)
- [Qdrant REST API](https://qdrant.tech/documentation/concepts/api/)
- [OpenAPI tool_registry Schema](./TOOL-REGISTRY-SCHEMA.md)

---

**Author**: Claude Code (Session 125+)  
**Status**: ✅ Ready for Phase 10b Execution
