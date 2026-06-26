# P4 ACE + MCP + Telemetry Integration Guide

**Date**: June 26, 2026 (Session 81)  
**Status**: Ready for Testing  
**Critical Path**: Summary Payload → Telemetry Join → Materializer  

---

## Executive Summary

The P4 canonical packet registry is now **wired end-to-end** from Parent Atlas through ACE to go-retrieval search engine with complete telemetry collection:

```
Parent Atlas (atlas_packets)
  ↓ [canonical identity + summary]
MCP Tool Dispatch (function registry selection)
  ↓ [context enrichment]
ACE Context Assembler (validation)
  ↓ [injection guard + schema check]
Gemma4 Batch Summarization (summary payload backfill)
  ↓ [enrich missing summaries]
Go-Retrieval Search Engine (returns summary payloads)
  ↓ [ANN with rich context]
Telemetry Tracing (unified event collection)
  ↓ [cache hits, token usage, rerank scores]
Postgres/Redis Audit Trail
```

---

## Setup & Verification

### 1. Verify Startup Infrastructure (Session 81)

Run the daily validation gates:

```bash
# Check all services: Postgres, Redis, Neo4j, GPU
npm run startup:validation

# Expected: .tmp/startup-truth.json with all gates PASS
cat .tmp/startup-truth.json
```

**Gates to check**:
- ✅ postgres.tables_exist (atlas_packets, packet_topology_projection, qdrant_orphan_points)
- ✅ redis.caches_exist (atlas:pagerank:som:scores, etc.)
- ✅ neo4j.som_edges > 1000 (CRITICAL for topology routing)
- ✅ gpu.addon_loaded (N-API tensorrt_bridge)

### 2. Smoke Test Packet Registry

Validate the canonical packet registry with CPU workers:

```bash
# Fetch 100 sample packets, validate with simdjson (or V8 fallback)
npm run smoke:packet-registry

# Expected: .tmp/smoke-packet-registry.json
# Gates: table exists, columns present, rows > 0, manifold coverage 80%+, qdrant joinable 50%+
```

---

## Critical Path Execution

### Step 1: Summary Payload Backfill (15-30 min)

**Purpose**: Fill `atlas_packets.summary` for packets where summary is NULL.

```bash
# Dry-run: preview what will be summarized
npm run gemma4:batch:summarize-packets

# Expected output:
#   📦 Found N packets needing summaries
#   🔄 Processing batch 1/X
#   ✅ M/N summaries generated

# Apply: actually write summaries to DB
npm run gemma4:batch:summarize-packets:apply

# Verify: check .tmp/gemma4-batch-summarize.json
cat .tmp/gemma4-batch-summarize.json
```

**What happens**:
- Queries `atlas_packets WHERE summary IS NULL`
- Batches into 10-packet chunks
- Calls Gemma4 at :8090 with source_ref + feature_id context
- Caches summaries in Redis for reuse
- Writes summaries back to Postgres (if --apply)

**Success criteria**:
- Success rate > 90% (some Gemma4 timeouts expected)
- Average summary length 50-200 chars
- No Postgres write errors

### Step 2: ACE + MCP + Telemetry Join Test (5-10 min)

**Purpose**: Verify end-to-end integration from packet → MCP → ACE → retrieval → telemetry.

```bash
# Run the join test
npm run test:ace-mcp-telemetry-join

# Expected output:
#   🔍 Lane 1: Parent Atlas (canonical packets)
#   ✅ Loaded N packets from atlas_packets
#
#   🧰 Lane 2: MCP Tool Dispatch (function registry)
#   ✅ Dispatched N MCP tool calls (M unique tools)
#
#   🎯 Lane 3: ACE Context Assembler (validation)
#   ✅ Validated N/N packets (100% pass rate)
#
#   🔎 Lane 4: Go-Retrieval Search Engine (summary payload)
#   ✅ Retrieved N results with summary payloads
#
#   📊 Lane 5: Telemetry Tracing (unified trace collection)
#   ✅ Logged N telemetry events (trace: trace-XXXXXXXXX)

# Check the join test report
cat .tmp/ace-mcp-telemetry-join-test.json
```

**What happens in each lane**:

| Lane | Responsibility | Key Check |
|------|---|---|
| **Parent Atlas** | Fetch canonical packets from atlas_packets | summary IS NOT NULL |
| **MCP Tool Dispatch** | Select function registry tools based on packet type | tools cached in Redis |
| **ACE Context Assembler** | Validate packet schema (packet_key, feature_id, summary) | validation_status = 'pass' |
| **Go-Retrieval Search** | Return ANN results with summary payloads | text = packet.summary |
| **Telemetry Tracing** | Collect unified trace to Redis + optional Postgres | trace_id + event_count |

**Success criteria**:
- All 5 lanes PASS
- Validation pass rate 100% (no injection attacks, no schema gaps)
- Go-retrieval returns summary payloads (not just vectors)
- Telemetry events logged to Redis (check: `redis-cli KEYS 'retrieval:trace:*'`)

### Step 3: Verify Telemetry in Redis/Postgres

**Check Redis telemetry**:

```bash
# List all retrieval traces
docker exec legal-ai-redis redis-cli KEYS 'retrieval:trace:*'

# Inspect a trace
docker exec legal-ai-redis redis-cli GET 'retrieval:trace:trace-XXXXXXXXX' | jq

# Expected fields:
#   trace_id, event_count, total_results, cache_hit_rate, avg_rerank_score, token_estimate, latency_ms
```

**Check Postgres audit trail** (optional, if retrieval_cache_traces table exists):

```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT trace_id, event_count, cache_hit_rate, latency_ms FROM retrieval_cache_traces LIMIT 5"

# Expected: new rows from ace_mcp_join_test
```

---

## Understanding the Integration

### Parent Atlas → MCP Tool Dispatch

**What it does**: Packet's `feature_id` and `source_ref` determine which MCP tools to call.

```
packet.feature_id = "auth.sessions"
  → MCP tool: "security.auth_check"
  
packet.feature_id = "db.client"
  → MCP tool: "db.schema_overview"
  
packet.feature_id = "query.cache"
  → MCP tool: "kb.trace_search"
  
packet.feature_id = "graph.topology"
  → MCP tool: "graph.expand_neighborhood"
```

**Files involved**:
- `src/lib/server/mcp/tool-ranker.ts` — tool selection logic
- `src/mcp/trace-mcp-server.ts` — MCP tool definitions (42 tools)
- Redis keys: `mcp:tool:{packet_key}:{timestamp}` (trace log)

### MCP → ACE Context Assembler

**What it does**: Validates packets before ACE synthesizes with Gemma4.

```
Packet input: { packet_key, feature_id, source_ref, summary, metadata }
  ↓
Validation checks:
  • Injection guard: no SQL/XSS patterns
  • Schema validation: all required fields present
  • Confidence scoring: metadata completeness
  ↓
Output: validated=true OR errors=[list]
```

**Files involved**:
- `src/lib/server/features/ai/ace/context-assembler.ts` — main assembler (1000+ lines)
- `src/lib/server/ace/ace-packet-validator.ts` — validation logic
- Redis keys: `ace:validated:{packet_key}` (cache)

### ACE → Go-Retrieval Search

**What it does**: Go-retrieval returns search results enriched with **summary payloads** (not just vectors).

```
Query: "auth session management"
  ↓ Qdrant ANN
[hit1: packet_key=auth:001, score=0.95]
[hit2: packet_key=auth:002, score=0.93]
  ↓ Go-Retrieval enrichment
[hit1: { id, source_ref, feature_id, text="Session validation and caching...", score, cache_hit_source="parent_atlas" }]
[hit2: { id, source_ref, feature_id, text="Lucia middleware integration...", score, cache_hit_source="parent_atlas" }]
  ↓ Ready for Gemma4 synthesis
```

**Files involved**:
- `src/lib/server/retrieval/go-retrieval-client.ts` — Go-retrieval RPC
- `GoRetrievalSearchHit` interface: includes `text`, `content`, `snippet`, `metadata`, `cache_hit_source`

### Go-Retrieval → Telemetry Tracing

**What it does**: Unified trace collection across cache layers, reranking, and Gemma4 synthesis.

```
Search result
  ↓
Telemetry event: {
  trace_id: "trace-1234567890",
  event_type: "retrieval_hit",
  packet_key: "auth:001",
  feature_id: "auth.sessions",
  cache_source: "parent_atlas",
  timestamp: "2026-06-26T12:34:56Z"
}
  ↓
Redis: retrieval:trace:{trace_id} (3600s TTL)
  ↓ (Optional)
Postgres: retrieval_cache_traces (permanent audit trail)
```

**Files involved**:
- `src/lib/server/observability/langfuse.js` — trace instrumentation
- `src/lib/server/observability/outcome-ledger.js` — reward scoring
- `src/lib/server/db/schema/documents-atlas.ts` — retrieval_cache_traces table schema

---

## Troubleshooting

### Issue: "No packets needing summaries"

**Diagnosis**:
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) as total, COUNT(summary) as with_summary FROM atlas_packets"
```

**If all packets have summaries**: Good! Move to Step 2 (join test).

**If most packets lack summaries**: Run backfill:
```bash
npm run gemma4:batch:summarize-packets:apply
```

### Issue: "Gemma4 connection refused"

**Check if Gemma4 is running**:
```bash
curl http://127.0.0.1:8090/v1/models

# Expected: list of available models
# If it fails: start Gemma4 first
npm run turbo:start:detached
```

### Issue: "ACE validation pass rate < 90%"

**Check for invalid packets**:
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT packet_key, source_ref, feature_id, summary FROM atlas_packets WHERE packet_key IS NULL LIMIT 5"

# Missing packet_key? Update atlas_packets with packet_key generation logic
```

### Issue: "No telemetry events logged"

**Check Redis**:
```bash
docker exec legal-ai-redis redis-cli PING  # Should return PONG

docker exec legal-ai-redis redis-cli KEYS 'retrieval:*' | head -10
# If empty: telemetry wasn't written
```

**Check Postgres retrieval_cache_traces**:
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM retrieval_cache_traces" 2>/dev/null || echo "Table doesn't exist (OK for now)"
```

---

## Next Steps (Phase 2)

After successful join test:

### 1. Wire ACE Materializer (Phase 2.2)

```bash
# (To be implemented)
# ACE packet synthesis → Qdrant/Redis mirror sync
# Files: src/lib/server/ace/ace-materializer.ts
```

### 2. Run Full P4 Proof

```bash
npm run atlas:proof:four-lanes

# Expected: 4 lanes PASS
#   Lane 1: Directory structure validation
#   Lane 2: Topology projection (SOM, manifold, orphan detection)
#   Lane 3: ACE pipeline (validation + synthesis)
#   Lane 4: Materialization (Qdrant/Redis sync)
```

### 3. P5 GPU Acceleration Health Audit

```bash
npm run atlas:gpu:health

# Verify: GPU functions available, CUDA working, attention scoring operational
```

---

## Reference Files

| File | Purpose | Status |
|------|---------|--------|
| `sveltekit-frontend/scripts/atlas/daily-startup-validation.mjs` | 14-gate health check | ✅ Complete |
| `sveltekit-frontend/scripts/atlas/smoke-packet-registry.mjs` | Packet registry validation + worker threads | ✅ Complete |
| `sveltekit-frontend/scripts/atlas/ace-mcp-telemetry-join-test.mjs` | 5-lane integration test | ✅ Complete |
| `sveltekit-frontend/scripts/atlas/gemma4-batch-summarize-packets.mjs` | Summary payload backfill | ✅ Complete |
| `sveltekit-frontend/drizzle/manual/0047_packet_topology_projection.sql` | Canonical packet registry schema | ✅ Applied |
| `docs/reports/service-dag.md` | Execution flow diagram | ✅ Documented |
| `src/lib/server/features/ai/ace/context-assembler.ts` | ACE validation + synthesis | ✅ Exists (1000+ lines) |
| `src/lib/server/mcp/tool-ranker.ts` | MCP tool selection | ✅ Exists |
| `src/lib/server/retrieval/go-retrieval-client.ts` | Go-retrieval RPC | ✅ Exists |

---

## Commands at a Glance

```bash
# 1. Verify startup infrastructure
npm run startup:validation

# 2. Smoke test packet registry
npm run smoke:packet-registry

# 3. Backfill summaries (dry-run first!)
npm run gemma4:batch:summarize-packets

# 4. Backfill summaries (apply)
npm run gemma4:batch:summarize-packets:apply

# 5. Run ACE + MCP + Telemetry join test
npm run test:ace-mcp-telemetry-join

# 6. Check telemetry in Redis
docker exec legal-ai-redis redis-cli KEYS 'retrieval:trace:*'

# 7. View test report
cat .tmp/ace-mcp-telemetry-join-test.json | jq
```

---

## Success Criteria

✅ **P4 Phase Complete When:**

1. **Startup validation**: All 14 gates PASS
2. **Packet registry smoke test**: 5 topology gates PASS
3. **Summary backfill**: > 90% success rate, summaries written to Postgres
4. **ACE + MCP join test**: All 5 lanes PASS, telemetry logged to Redis
5. **Go-retrieval enrichment**: Returns summary payloads (text field = packet.summary)
6. **Telemetry audit trail**: Can query `retrieval:trace:*` from Redis and/or Postgres

Once these pass → Ready for **Phase 2 Materializer** (sync to Qdrant/TurboVec).

