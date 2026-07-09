# Phase 10 Quickstart — Team Handoff

**Status**: ✅ Phase 10a APPLY_PROVEN | ⏳ Phase 10b Ready to Execute  
**What**: Unified packet ontology + telemetry feedback loop  
**When**: Phase 10b execution starts with Task Group 2  
**Time**: 2-3 hours for full Phase 10b implementation

---

## Phase 10a ✅ DONE

**6/6 Schema Gates PASS** — Verify with:
```bash
npm run atlas:phase10:validate
```

**What's Built**:
- Postgres schema (packet_type enum, tool_execution_log, materialized view)
- API indexing scaffolds (extract → build packets → embed → persist)
- Go service wiring (search, embedding, retrieval integration)
- Daily graphify enhancement (4-stage pipeline A0-A3)
- npm scripts (20+ commands for Phase 10 operations)
- Comprehensive documentation

---

## Phase 10b ⏳ READY NOW

### Task Group 2: Materialized View Refresh (5 min)

```bash
# Test immediate refresh
npm run atlas:phase10:stats:scheduler:test

# Install pg_cron and create hourly schedule
npm run atlas:phase10:stats:scheduler:install-pg-cron
```

**What it does**: Refreshes tool_execution_stats_7d every hour with rolling 7-day stats.

---

### Task Group 3: RabbitMQ Telemetry Consumer (30 min)

**File to create**: `scripts/workers/tool-telemetry-consumer.mjs` (120 lines)

**Pattern**:
```javascript
const conn = await amqplib.connect(RABBITMQ_URL);
const channel = await conn.createChannel();
await channel.assertQueue('tool.telemetry', { durable: true });

channel.consume('tool.telemetry', async (msg) => {
  const event = JSON.parse(msg.content.toString());
  // Insert into tool_execution_log
  await pool.query(
    'INSERT INTO tool_execution_log (tool_id, query, success, latency_ms, error_type, timestamp) VALUES ($1, $2, $3, $4, $5, NOW())',
    [event.tool_id, event.query, event.success, event.latency_ms, event.error_type]
  );
  channel.ack(msg);
});
```

**Test**:
```bash
npm run atlas:phase10:telemetry:consumer:start
# In another terminal: npm run atlas:phase10:telemetry:consumer:test
```

---

### Task Group 4: Tool Embeddings (10 min)

```bash
# Regenerate 384-dim embeddings via legal-ai-go-embedding:8097
npm run atlas:phase10:tool-embeddings:regenerate
```

---

### Task Group 6: Packet Type Backfill (5 min)

```bash
# Classify packets by file type (code, test, etc.)
npm run atlas:phase10:backfill:packet-type:apply --priority=code,test
```

---

### Task Group 5: Schema Filtering (optional, 30 min)

**File to create**: `src/lib/server/heuristics/rank-tools-with-schema.ts`

**Pattern**:
```typescript
export function filterToolsBySchema(tools: ToolRegistry[], query: any): ToolRegistry[] {
  return tools.filter(tool => {
    // Validate query against tool.tool_constraints.input_schema
    // Filter incompatible tools
    return isCompatible(query, tool.tool_constraints.input_schema);
  });
}
```

---

## Complete Flow (Phase 10b)

```
Route calls selectTool(query)
  ↓
selectTool emits event to RabbitMQ 'tool.telemetry' queue
  ↓ (Task Group 3)
Telemetry consumer listens and writes to tool_execution_log
  ↓
(Every hour, Task Group 2)
Materialized view refreshes: tool_execution_stats_7d
  ↓
tool_registry.rolling_success_rate_7d updated
  ↓
HMM training sees fresh stats → learns routing policy
  ↓
Next selectTool() call uses learned policy
```

---

## Critical Database Credentials

**Postgres Connection**:
```
Host: 127.0.0.1
Port: 5434
User: legal_admin
Password: 123456
Database: legal_ai_db
```

**RabbitMQ Connection**:
```
URL: amqp://guest:guest@localhost:5672
Queue: tool.telemetry
Exchange: (default)
```

---

## Verification Gates (Before Merge)

```bash
# 1. Schema validation
npm run atlas:phase10:validate
# Expected: 6/6 gates PASS

# 2. Go services health
npm run atlas:phase10:go-integration:check-health
# Expected: All services UP

# 3. Materialized view refresh
npm run atlas:phase10:stats:scheduler:test
# Expected: Refresh completes in <5 seconds

# 4. Database state
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM tool_registry WHERE packet_type='api';"
# Expected: >0 rows (API tools indexed)

# 5. Tool execution log
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM tool_execution_log;"
# Expected: >0 rows (events being logged)

# 6. Materialized view
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM tool_execution_stats_7d;"
# Expected: >0 rows (stats aggregated)
```

---

## Troubleshooting

### "Cannot find module 'amqplib'"
```bash
npm install amqplib pg
```

### "Connection refused: 127.0.0.1:5432"
Check Postgres is running:
```bash
docker-compose ps | grep postgres
docker-compose up -d postgres
```

### "password authentication failed"
Verify credentials in script (should be `legal_admin:123456`):
```bash
grep DATABASE_URL scripts/atlas/phase10-*.mjs
```

### Materialized view refresh slow
First refresh scans all 7 days of data. Subsequent refreshes are faster (CONCURRENT mode):
```bash
# Check last refresh time
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT MAX(last_refreshed_at) FROM tool_execution_stats_7d;"
```

---

## Integration with Daily Graphify

Phase 10 enhances `graphify:daily` with 4 new stages (all optional):

```bash
# Dry-run all stages
npm run atlas:phase10:graphify-enhancement:dry

# Apply all stages
npm run atlas:phase10:graphify-enhancement:apply

# Run specific stage
npm run atlas:phase10:graphify-enhancement:stage A0  # Tool indexing
npm run atlas:phase10:graphify-enhancement:stage A1  # Telemetry sync
npm run atlas:phase10:graphify-enhancement:stage A2  # API discovery
npm run atlas:phase10:graphify-enhancement:stage A3  # Search validation
```

---

## Files Changed (Session 125)

### New
- `scripts/atlas/phase10-api-indexing-persist.mjs`
- `scripts/atlas/phase10-stats-refresh-scheduler.mjs`
- `docs/PHASE-10-INTEGRATION-GUIDE.md`
- `PHASE-10a-APPLY-PROVEN-SESSION-125.md`
- `PHASE-10-QUICKSTART.md` (this file)

### Modified
- `package.json` (+17 npm scripts)
- `scripts/atlas/phase10-validation-smoke.mjs` (fixed)

### Already Complete
- All Phase 10a files (schema, API indexing, Go service wiring)

---

## Next Milestone

**Phase 10b Target Completion**: 2-3 hours after starting Task Group 2

**Success Criteria**:
- Tool execution log populated (>10 events)
- Materialized view refreshing hourly
- Embeddings generated for all tools
- API routes indexed (>40 tools)
- Packet types backfilled (>90%)
- All 6 smoke gates pass

---

## Team Ownership

| Task Group | Owner | Duration | Status |
|-----------|-------|----------|--------|
| TG1: Schema | ✅ Done | — | APPLY_PROVEN |
| TG2: Refresh | Ready | 5 min | `npm run atlas:phase10:stats:scheduler:install-pg-cron` |
| TG3: Consumer | Ready | 30 min | Create `scripts/workers/tool-telemetry-consumer.mjs` |
| TG4: Embeddings | Ready | 10 min | `npm run atlas:phase10:tool-embeddings:regenerate` |
| TG5: Filtering | Ready | 30 min | Create `src/lib/server/heuristics/rank-tools-with-schema.ts` |
| TG6: Backfill | Ready | 5 min | `npm run atlas:phase10:backfill:packet-type:apply` |

---

**Ready to Execute Phase 10b Now** ✅  
**Start with**: `npm run atlas:phase10:stats:scheduler:install-pg-cron`  
**Time Estimate**: 2-3 hours for full Phase 10b  
**Documentation**: `docs/PHASE-10-INTEGRATION-GUIDE.md` (500+ lines, comprehensive)

---

Author: Claude Code (Session 125)  
Date: July 9, 2026
