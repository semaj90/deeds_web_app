# Phase 7 Production Safety Audit

**Status**: Prototype-grade. Senior engineer review needed before production deployment.

**Date**: July 3, 2026  
**Reviewed**: phase7-rabbitmq-summary-queue.mjs (producer/worker dual-mode)

---

## Critical Issues (MUST FIX before production)

### 1. Error Handling & Failure Recovery
- **Issue**: Worker crashes silently if Gemma4 server is unavailable. No retry logic, no circuit breaker.
- **Current**: `catch (err) { console.warn(...); return ''; }` → writes empty string to Postgres
- **Risk**: Silent data loss (NULL vs empty string ambiguity); hard to diagnose in logs
- **Fix**: Implement exponential backoff, configurable retry count, dead-letter queue for failed messages

### 2. Contamination Sanitizer Completeness
- **Issue**: Sanitizer strips markers but may leave artifacts (whitespace collapse, incomplete marker removal)
- **Current**: `sanitizeSummary()` splits on leaked user turn but doesn't validate output is valid prose
- **Risk**: Malformed summaries stored in Postgres; downstream pipelines fail silently
- **Fix**: Add post-sanitization validation (min/max length, forbidden patterns allowlist, confidence score)

### 3. No Observability / Metrics
- **Issue**: No structured logging, no per-worker metrics, no queue depth tracking
- **Current**: Console.log timestamps, no correlation IDs, no worker_id in Postgres records
- **Risk**: Cannot debug which worker produced bad summary; hard to scale to 10+ workers
- **Fix**: Add structured logging (JSON), worker_id tag, timestamp correlation, metrics export (Prometheus or stdout)

### 4. Queue Acknowledgment Safety
- **Issue**: Message acknowledgment happens AFTER Postgres write but BEFORE Redis/Qdrant. Partial failure = data loss.
- **Current**: Line 298 `channel.ack(msg)` before updatePgAndQdrant returns
- **Risk**: Summary in Postgres but not in cache; consumer sees divergence
- **Fix**: Use distributed transaction or at least persist summary BEFORE acking message

### 5. No Connection Pooling Validation
- **Issue**: Postgres pool created but not validated. Credentials hardcoded in script (via env vars).
- **Current**: `pool = new Pool({...})` with DATABASE_PASSWORD from env
- **Risk**: Connection pool exhaustion if workers hang; plaintext password in process env
- **Fix**: Add pool.query('SELECT 1') at startup; use connection pool factory with max limits; never log passwords

### 6. Gemma4 Dependency (Hard Blocker)
- **Issue**: Worker halts completely if Gemma4 :8090 goes down. No fallback to Ollama.
- **Current**: Only retries if `!res.ok`, but doesn't try Ollama as fallback
- **Risk**: One server crash stops entire queue consumption
- **Fix**: Implement fallback chain (Gemma4 → Ollama → cached results); make summarization optional (skip if unavailable)

---

## Medium Issues (Recommended for production)

### 7. Memory Leaks
- **Issue**: Long-running worker may accumulate unclosed connections or message buffers
- **Risk**: Worker crashes after 10K+ messages due to heap exhaustion
- **Fix**: Add periodic memory profiling, explicit GC hints, connection pool reset

### 8. Duplicate Handling
- **Issue**: No idempotency check. If worker crashes after Postgres write but before ack, message is requeued → duplicate summary
- **Risk**: Same chunk summarized twice with different text; UPDATE overwrites older summary
- **Fix**: Add upsert logic (INSERT ON CONFLICT) or idempotency key to Postgres

### 9. Batch Size Configuration
- **Issue**: Hard-coded `PREFETCH = 1` (process one message at a time). Sub-optimal throughput.
- **Risk**: Under-utilizes available CPU; workers idle waiting for I/O
- **Fix**: Make PREFETCH configurable; experiment with higher values (3-5) and monitor memory

### 10. No Graceful Shutdown
- **Issue**: SIGINT handler closes connection but doesn't drain in-flight messages
- **Risk**: Messages lost if worker killed mid-processing
- **Fix**: Implement drain mode (finish current batch, then exit); set timeout for forced shutdown

---

## Low Issues (Nice-to-have)

### 11. Logging Verbosity
- Summary content not logged; hard to debug specific bad summaries
- Fix: Optional `--debug` flag to log summary content (first 200 chars)

### 12. Configuration
- EXCHANGE, QUEUE_PREFIX, PREFETCH all hard-coded
- Fix: Read from `.env` or command-line args for flexibility

---

## Recommended Action Plan

**Phase 7.0 (Prototype)**: Current state — development/testing only
- ✅ Sanitizer deployed (contamination fix)
- ⏳ Observability TBD
- ⏳ Error recovery TBD

**Phase 7.1 (Pre-Production)**: 1-2 days of hardening
1. Add structured logging + worker_id correlation
2. Implement Gemma4 → Ollama fallback
3. Add Postgres connection validation at startup
4. Implement exponential backoff for failures
5. Add metrics export (Prometheus or CSV)

**Phase 7.2 (Production-Ready)**: Code review + deployment
1. Senior engineer audit (error handling, memory, concurrency)
2. Load test with 10K+ messages
3. Failover test (kill Gemma4 mid-run)
4. Rollout to 1 worker, monitor 24h, then scale to 6+

---

## Test Plan (Before Phase 7.1)

```bash
# Sanity check: 100 messages, verify 95%+ clean
npm run phase7:test:batch -- --limit=100 --expect-clean=0.95

# Failure test: kill Gemma4, worker should retry and log
npm run phase7:test:gemma4-failure

# Duplicate test: crash worker mid-ack, verify no duplicate summaries
npm run phase7:test:idempotency

# Load test: 1000 messages, monitor memory and throughput
npm run phase7:test:load -- --batch=1000
```

---

---

## Pipeline Scripts for Next Steps

### Phase 7 Current Operations (Running Now)

```bash
# Monitor queue depth and worker progress
npm run phase7:monitor

# Producer: Enqueue remaining unsummarized chunks
node sveltekit-frontend/scripts/atlas/phase7-rabbitmq-summary-queue.mjs --produce --batch=1000

# Workers: Start 6 workers consuming from RabbitMQ
for i in {1..6}; do
  node sveltekit-frontend/scripts/atlas/phase7-rabbitmq-summary-queue.mjs --worker --id=$i &
done
```

### Phase 7.1 (Pre-Production Hardening Scripts — TBD)

```bash
# Add structured logging to worker
npm run phase7:patch:logging

# Add Gemma4 → Ollama fallback
npm run phase7:patch:fallback

# Add connection pool validation
npm run phase7:patch:db-validation

# Add exponential backoff for retries
npm run phase7:patch:retry-logic

# Run pre-production tests
npm run phase7:test:batch -- --limit=100 --expect-clean=0.95
npm run phase7:test:gemma4-failure
npm run phase7:test:idempotency
npm run phase7:test:load -- --batch=1000
```

### Phase 8 (Summary Indexing — After Phase 7 completes)

```bash
# Index clean summaries to Qdrant
npm run atlas:summaries:qdrant:index \
  --collection=codebase_summaries_384 \
  --batch=1000 \
  --dry-run

# Verify indexing
npm run atlas:summaries:qdrant:verify

# Warm BitFrost cache from indexed summaries
npm run atlas:bitfrost:warm:summaries \
  --limit=10000 \
  --batch=100 \
  --apply
```

### Phase 9 (ACE Packet Assembly — After indexing complete)

```bash
# Build ACE packet envelopes from summaries
npm run atlas:ace:packets:build \
  --source=summaries \
  --limit=10000 \
  --dry-run

# Validate packet lineage and completeness
npm run atlas:ace:packets:validate --verbose

# Emit packets to Neo4j for topology enrichment
npm run atlas:ace:packets:emit --targets=neo4j,qdrant
```

### Monitoring & Observability (Phase 7.1+)

```bash
# Tail worker logs with structured JSON output
docker logs -f $(docker ps --filter "name=phase7-worker" -q) | jq '.level, .worker_id, .message'

# Check summary quality over time (every 5 min)
watch -n 300 'docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) total, COUNT(CASE WHEN summary NOT LIKE '"'"'%<end_of_turn>%'"'"' THEN 1 END) clean FROM codebase_chunk_index WHERE summary IS NOT NULL AND LENGTH(summary) > 10;"'

# Export metrics to CSV for trending
npm run phase7:metrics:export --format=csv --output=phase7-metrics.csv
```

### Current Live Status Commands

```bash
# Check RabbitMQ queue depth
curl -s -u guest:guest http://127.0.0.1:15672/api/overview | jq '.queue_totals'

# Sample recent summaries
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT SUBSTRING(summary FROM 1 FOR 80) FROM codebase_chunk_index WHERE summary IS NOT NULL ORDER BY updated_at DESC LIMIT 5;"

# Count clean vs contaminated (audit)
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) total, COUNT(CASE WHEN summary NOT LIKE '%<end_of_turn>%' AND summary NOT LIKE '%<start_of_turn>%' THEN 1 END) clean, ROUND(100.0*COUNT(CASE WHEN summary NOT LIKE '%<end_of_turn>%' AND summary NOT LIKE '%<start_of_turn>%' THEN 1 END)/COUNT(*),1) clean_rate FROM codebase_chunk_index WHERE summary IS NOT NULL AND LENGTH(summary) > 10;"

# View progress (% complete)
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) written, ROUND(100.0*COUNT(*)/40754,1) pct_complete FROM codebase_chunk_index WHERE summary IS NOT NULL AND LENGTH(summary) > 10;"
```

---

## Sign-off

**Prototype Status**: ✅ Suitable for dev/test with the contamination sanitizer deployed.

**Current Phase 7 Status (July 3, 2026):**
- ✅ Sanitizer: 100% clean (0 contaminated summaries)
- ✅ Pipeline: Live and processing (6 workers active)
- ✅ Progress: 12,707 / 40,754 summaries (31.2%)
- ✅ Throughput: ~40 summaries/min (ETA 12 hours to completion)
- ⏳ Queue: 332,534 messages pending

**Production Status**: ❌ NOT READY. Requires:
- Error handling hardening (issues 1, 4, 6)
- Observability (issue 3)
- Testing (failover, load, duplicates)
- Senior review of concurrency model

**Estimated Effort**: 2-3 days of hardening work before production deployment.

**Next Steps (Ordered):**
1. ✅ **Phase 7 (Running):** Monitor overnight, verify sustained 100% clean rate
2. ⏳ **Phase 7.1:** Implement error handling + observability hardening
3. ⏳ **Phase 8:** Index summaries to Qdrant + warm BitFrost (after Phase 7 completes)
4. ⏳ **Phase 9:** Build ACE packet envelopes (after indexing complete)
