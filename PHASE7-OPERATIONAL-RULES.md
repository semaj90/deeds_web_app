# Phase 7 Operational Rules (5-8h Target)

**Status**: ACTIVE | 11,406/40,754 (28.0%) | 512 messages queued | 25 consumers

---

## ⚠️ CRITICAL: Use the Correct Launcher

### ❌ WRONG (single-worker default)
```bash
npm run phase7:worker:start
```
- Only 1 worker
- Designed for testing/validation
- Takes 24+ hours for full dataset

### ✅ CORRECT (4-worker throughput path)
```bash
npm run phase7:throughput
```
- 4 RabbitMQ batch workers
- Producer auto-enqueues remaining chunks
- 5-8 hour target on RTX 3060 Ti

**Alternative (manual 4-worker cluster)**:
```bash
npm run phase7:worker:cluster:4
```
(Same as throughput but requires manual producer startup)

---

## Architecture: Summary != Label

### Phase 7 Output (Current)
```
source_ref: "src/lib/server/api/response-helper.ts"
summary: "The code defines various helper functions for handling API responses 
          including error codes (5xx), success codes (2xx), and specific handlers 
          for 404 not found..."
```
**Purpose**: Human-readable explanation of chunk functionality

### Phase 9 Output (Next)
```
source_ref: "src/lib/server/api/response-helper.ts"
packet_key: "sha256:..."
semantic_label: "api_response_helpers"
title_id: "helpers.response"
feature_id: "api.responses"
concepts: ["http", "status-codes", "error", "helper", "response"]
nouns: ["responses", "errors", "codes", "handlers", "functions"]
verbs: ["handle", "return", "check", "format"]
relations: [
  { "type": "DEFINES", "to": "http_status_handler" },
  { "type": "USES", "to": "error_formatter" }
]
routing_hints: ["api", "http", "helpers", "cpu_lane"]
```
**Purpose**: Machine-actionable routing for Neo4j, Qdrant, Redis, ACE planner

---

## Critical Configuration (Proven on RTX 3060 Ti)

**DO NOT CHANGE** without throughput measurement:

| Setting | Value | Why |
|---------|-------|-----|
| Worker count | 4 | Saturates RabbitMQ + Gemma4 on 8GB GPU |
| Queue batch size | 32 | Fits Gemma4 attention window; fits in prefetch buffer |
| LLM_CONCURRENCY | 1 | No multi-slot parallelism on single endpoint (2 slots fight VRAM) |
| GEMMA4_TIMEOUT_MS | 120000 | Allows full KV cache + reasoning (~65s observed max) |
| Prefetch | 1 | One batch in-flight per worker (minimal memory pressure) |
| llama-server parallel | 1 | Single slot (no improvement on RTX 3060 Ti 8GB) |
| Context | 65536 | Full context for legal code analysis |
| KV cache | q8_0/q8_0 | Stable baseline (TurboQuant optional, requires binary change) |

**If you want more throughput**: Scale workers (5-6 on RTX 4090), NOT llama-server parallelism.

---

## Producer Keep-Alive

The producer in `npm run phase7:throughput` enqueues ~5000 chunks at startup. If queue depth falls to 0:

```bash
# Enqueue more chunks manually
node phase7-rabbitmq-batch-worker.mjs --produce --chunk-batch-size=5000
```

Ideal state: 100-500 messages queued (producer 2-3 steps ahead of consumers).

---

## Monitoring

```bash
# Real-time worker progress
npm run atlas:phase102:step7:rabbitmq:monitor

# BitFrost warming status (concurrent)
tail -f phase8-warming.log

# Database live count
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM codebase_chunk_index WHERE summary IS NOT NULL;"
```

---

## Post-Phase-7: ACE Label Extraction (Phase 9)

Once Phase 7 completes (~5-8 hours from now):

1. **Triggers automatically** when Postgres detects 100% summarization
2. **Reads summaries** from codebase_chunk_index
3. **Extracts labels** via:
   - AST structure (tree-sitter)
   - Lexical features (nouns/verbs)
   - Semantic synthesis (Gemma4 via `npm run phase7:throughput`)
   - Relation extraction (Neo4j edges)
4. **Validates** with hard gate (source_ref + packet_key + concepts + relations)
5. **Persists** to Postgres ACE labels table
6. **Fans out** to:
   - Qdrant (payload filters for routing hints)
   - Neo4j (DEFINES, USES, FALLS_BACK_TO relations)
   - Redis BitFrost (hot labels for Stage A0 cache)

**Status of Phase 9 implementation**: ⏳ Ready to build (architecture proven)

---

## Throughput Calculation

```
Phase 7 state: 11,406 / 40,754 (28.0%)
Remaining:     29,348 chunks
Rate:          ~72 chunks/minute (current)
ETA:           ~408 minutes = 6.8 hours
```

**Conditions for 5-8h band**:
- ✅ 4 workers active
- ✅ Producer feeding queue
- ✅ Gemma4 responsive (<5s per chunk typical, <15s with KV cache miss)
- ✅ No network/DB bottlenecks

If ETA > 12h: Check worker health, queue depth, Postgres write latency.

---

## DO NOT

- ❌ Use `npm run phase7:worker:start` (single-worker default)
- ❌ Set `LLM_CONCURRENCY > 1` without VRAM measurement
- ❌ Set `--parallel > 1` on llama-server without proving VRAM headroom
- ❌ Use TurboQuant without a compatible binary
- ❌ Run 5+ workers on RTX 3060 Ti (memory pressure kills throughput)

---

## Operational Checklist

- [ ] Gemma4 up: `curl http://127.0.0.1:8090/health`
- [ ] RabbitMQ up: `docker ps | grep rabbitmq`
- [ ] Postgres responsive: `docker exec legal-ai-postgres psql -c "SELECT 1"`
- [ ] Phase 7 workers connected: RabbitMQ shows 4 consumers
- [ ] Phase 8 warming running: `tail phase8-warming.log`
- [ ] No errors in worker logs: Check `phase7-correct-*.log`

**Start command**: `npm run phase7:throughput`

---

Last updated: July 2, 2026
Architecture: Summary (human) + Label (machine) + Extraction (Gemma4 synthesis)
