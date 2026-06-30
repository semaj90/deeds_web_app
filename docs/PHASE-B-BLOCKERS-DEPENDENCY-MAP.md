# Phase B Execution Readiness — Blockers & Dependencies

**Date**: June 29, 2026  
**Status**: ✅ **READY TO EXECUTE** (with service startup prereq)

---

## Pre-Execution Checklist

### 1. Services Verification ✅

All required services must be running and healthy:

```bash
# Redis/Valkey (password: redis)
docker exec legal-ai-valkey redis-cli -a redis PING
# Expected: PONG

# Postgres (verify packet count)
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets;"
# Expected: 58304

# Qdrant (verify collection exists)
curl http://127.0.0.1:6333/collections/codebase_chunks_768
# Expected: HTTP 200 with collection metadata

# Ollama (verify embedding model)
curl http://127.0.0.1:11434/api/tags | jq '.models[] | select(.name | contains("embeddinggemma"))'
# Expected: embeddinggemma:latest present
```

### 2. Production Blocker Dependencies

From `2026-06-16-production-blockers.md`, these items **do NOT block Phase B**:

| Blocker | Status | Reason |
|---------|--------|--------|
| `npm run check` errors | ℹ️ Deferred | Phase B is a data pipeline, not frontend. Type errors don't affect enrichment. |
| `scripts/api-cleanup` TODOs | ℹ️ Deferred | Not in critical path for Phase B. |
| `src/routes/api/atlas` auth gaps | ℹ️ Deferred | Atlas API routes are not called during Phase B. |
| Hardcoded localhost URLs | ✅ Verified | Phase B uses `.env` variables only (POSTGRES_URL, REDIS_HOST, OLLAMA_URL, QDRANT_URL). |

**Deployment checklist items** (from production-blockers.md):
- ✅ Redis + Qdrant + Ollama health → **PASSING**
- ✅ TurboQuant latency < 60s → **EXPECTED** (gemma4-rotorquant:latest with cache_prompt)
- ⏳ `npm run build` → Can run in parallel with Phase B
- ⏳ Auth guard coverage → Not required for Phase B data pipeline

---

## Phase B Execution Order

### Stage 1: Dry-Run (Safety Check)
```bash
# Test all 3 passes with --limit=10 --dry-run
node scripts/phase-b/multi-pass-enrichment.mjs --pass=1 --limit=10 --dry-run
node scripts/phase-b/multi-pass-enrichment.mjs --pass=2 --limit=10 --dry-run
node scripts/phase-b/multi-pass-enrichment.mjs --pass=3 --limit=10 --dry-run

# Expected: 0 errors, no writes to DB
# If any fail: check Docker services and Ollama model availability
```

### Stage 2: Limited Run (100 packets)
```bash
# Run each pass on 100 packets
node scripts/phase-b/multi-pass-enrichment.mjs --pass=1 --limit=100
node scripts/phase-b/multi-pass-enrichment.mjs --pass=2 --limit=100
node scripts/phase-b/multi-pass-enrichment.mjs --pass=3 --limit=100

# Expected: ~15-20 minutes total
# Verify: docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM analysis_pass_results;"
```

### Stage 3: Full Production (57K packets)
```bash
# Once limited run succeeds, execute full pipeline
# Sequential (safe): 3 days, ~15 hours total
node scripts/phase-b/multi-pass-enrichment.mjs --pass=1 --limit=57000
node scripts/phase-b/multi-pass-enrichment.mjs --pass=2 --limit=57000
node scripts/phase-b/multi-pass-enrichment.mjs --pass=3 --limit=57000

# OR parallel (aggressive): Same day, staggered
# (Run in separate terminals or with &)
```

---

## Dependency Map

```
Phase B Execution
├─ Stage 1: Dry-run (10 packets per pass)
│  ├─ Prerequisite: Redis/Valkey running ✅
│  ├─ Prerequisite: Postgres accessible ✅
│  ├─ Prerequisite: Qdrant operational ✅
│  ├─ Prerequisite: Ollama with embeddinggemma:latest ✅
│  └─ Prerequisite: Gemma4 model available (gemma4-rotorquant:latest)
│
├─ Stage 2: Limited run (100 packets per pass)
│  ├─ Prerequisite: Stage 1 PASSED
│  └─ Duration: 15-20 minutes
│
└─ Stage 3: Full production (57K packets)
   ├─ Prerequisite: Stage 2 PASSED
   └─ Duration: 4-6 hours per pass (sequential)
```

---

## Blocker Resolution Matrix

### Do NOT block Phase B on:

| Item | Why |
|------|-----|
| `npm run check` failures | Frontend TypeScript, doesn't affect Node.js data pipeline |
| Scripts TODO density | Deferred to Phase D+ (post-enrichment cleanup) |
| API route coverage | Deferred to Phase D (ACE integration layer) |
| Orphaned routes audit | Deferred to Phase D (frontend cleanup) |

### DO verify for Phase B:

| Item | Status | Command |
|------|--------|---------|
| Redis/Valkey password | ✅ `redis` | `docker exec legal-ai-valkey redis-cli -a redis PING` |
| Postgres connection | ✅ Legal_admin user | `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT 1"` |
| Qdrant collection | ✅ codebase_chunks_768 | `curl http://127.0.0.1:6333/collections/codebase_chunks_768` |
| Ollama models | ✅ embeddinggemma + gemma4 | `curl http://127.0.0.1:11434/api/tags | jq '.models[].name'` |
| Environment file | ✅ .env configured | Check: `REDIS_PASSWORD=redis`, `OLLAMA_URL=http://127.0.0.1:11434` |

---

## Service Startup (if needed)

```bash
# Start all services
cd c:\Users\james\Videos\deeds-web-app
docker-compose up -d postgres valkey qdrant

# Ollama must be running separately (not in docker-compose)
# On Windows: Run ollama.exe from https://ollama.ai/download
# Verify: curl http://127.0.0.1:11434/api/tags

# Watch progress
docker-compose logs -f
```

---

## Expected Results After Phase B

### Postgres
```sql
SELECT pass_key, COUNT(*) FROM analysis_pass_results WHERE pass_status='complete' GROUP BY pass_key;

-- Expected output:
--  pass_key           | count
-- --------------------+-------
--  pass_1_summarization | 57000
--  pass_2_entities     | 57000
--  pass_3_semantic     | 57000
```

### Redis/Valkey
```bash
docker exec legal-ai-valkey redis-cli -a redis INFO stats | grep total_commands_processed
# Expected: High number (millions of cache hits + writes during Phase B)

docker exec legal-ai-valkey redis-cli -a redis KEYS "emb:q:v1:*" | wc -l
# Expected: > 5000 (embedding cache entries)

docker exec legal-ai-valkey redis-cli -a redis KEYS "qdrant:topk:v1:*" | wc -l
# Expected: > 5000 (topK cache entries)
```

---

## Safety & Rollback

### If Phase B fails midway:

1. **Identify last completed packet**
   ```bash
   docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
     "SELECT MAX(updated_at) FROM analysis_pass_results WHERE pass_key='pass_1_summarization';"
   ```

2. **Restart safely** (idempotent, resumes from last checkpoint)
   ```bash
   node scripts/phase-b/multi-pass-enrichment.mjs --pass=1 --limit=57000
   ```

3. **No cleanup needed** — ON CONFLICT handles re-runs.

### If cache corruption is suspected:

```bash
# Clear embedding cache
docker exec legal-ai-valkey redis-cli -a redis DEL "emb:q:v1:*"

# Clear topK cache
docker exec legal-ai-valkey redis-cli -a redis DEL "qdrant:topk:v1:*"

# Re-run (will be slower first run, cache rebuilds on next invocation)
node scripts/phase-b/multi-pass-enrichment.mjs --pass=3 --limit=57000
```

---

## Sign-Off Checklist

Before proceeding with Stage 3 (full production):

- [ ] Stage 1 (dry-run 10 packets) — all passes PASSED
- [ ] Stage 2 (limited run 100 packets) — all passes PASSED
- [ ] Redis/Valkey PING responding with PONG
- [ ] Postgres atlas_packets count = 58304
- [ ] Qdrant collection codebase_chunks_768 accessible
- [ ] Ollama embeddinggemma:latest and gemma4-rotorquant:latest models present
- [ ] No active `npm run dev` (to avoid resource contention)
- [ ] Disk space > 10GB free (for phase results + cache)
- [ ] Operator approval obtained

---

**READY FOR EXECUTION ON OPERATOR APPROVAL**
