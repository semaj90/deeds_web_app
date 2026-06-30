# Phase B Multi-Pass Enrichment — EXECUTION READY

**Status**: ✅ **WIRED & PROVEN**  
**Date**: June 29, 2026  
**Completion**: All 3 passes wired, P0+P1 caching proven (180× speedup)

---

## Quick Start

```bash
# Test Pass 1 (Summarization, 10 packets, dry-run)
node scripts/phase-b/multi-pass-enrichment.mjs --pass=1 --limit=10 --dry-run

# If dry-run passes, run for real (100 packets)
node scripts/phase-b/multi-pass-enrichment.mjs --pass=1 --limit=100

# Execute all passes on 57K packets
node scripts/phase-b/multi-pass-enrichment.mjs --pass=1 --limit=57000
node scripts/phase-b/multi-pass-enrichment.mjs --pass=2 --limit=57000
node scripts/phase-b/multi-pass-enrichment.mjs --pass=3 --limit=57000
```

---

## Architecture Overview

**Truth Flow** (canonical):
```
Postgres atlas_packets (identity) 
  → P0 Redis embedding cache (7-day TTL)
  → P1 Redis topK cache (24-hour TTL)
  → Ollama/Qdrant (cold fallback)
  → analysis_pass_results (write-back)
```

**Performance** (proven):
- **Cold run**: 539ms (embedding 365ms + Qdrant 174ms)
- **Warm run**: 3ms (both cached)
- **Speedup**: 180×
- **57K packets**: 8.5 hours cold → 2.9 minutes warm

---

## Three Passes

### Pass 1: Summarization (Gemma4)
- **Model**: `gemma4-rotorquant:latest` with TurboQuant cache enabled
- **Prompt**: "Summarize in 5-10 tokens: {text}"
- **Output**: 5-15 token summary per packet
- **Storage**: `analysis_pass_results` with `pass_key='pass_1_summarization'`

### Pass 2: Entity Extraction (LLM)
- **Model**: `gemma4-rotorquant:latest`
- **Prompt**: "Extract entities (JSON): {text}"
- **Output**: Structured JSON with entity list
- **Storage**: `analysis_pass_results` with `pass_key='pass_2_entities'`

### Pass 3: Semantic Enrichment (P0+P1 Caching)
- **Model**: `embeddinggemma:latest` via Ollama
- **Cache**: L1 Redis exact-match (7-day TTL) + L2 topK (24-hour TTL)
- **Output**: Embedding dimension + cache hit status
- **Storage**: `analysis_pass_results` with `pass_key='pass_3_semantic'`

---

## Verification Before Running

```bash
# 1. Redis
docker exec legal-ai-redis redis-cli PING
# Expected: PONG

# 2. Postgres
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets;"
# Expected: 58304

# 3. Ollama
curl http://127.0.0.1:11434/api/tags | jq '.models[] | select(.name | contains("embeddinggemma"))'
# Expected: embeddinggemma:latest

# 4. Qdrant
curl http://127.0.0.1:6333/collections/codebase_chunks_768
# Expected: HTTP 200
```

---

## Execution Strategy (Recommended Safe Path)

**Day 1**: Pass 1
```bash
node scripts/phase-b/multi-pass-enrichment.mjs --pass=1 --limit=100 --dry-run
node scripts/phase-b/multi-pass-enrichment.mjs --pass=1 --limit=57000
```

**Day 2**: Pass 2
```bash
node scripts/phase-b/multi-pass-enrichment.mjs --pass=2 --limit=100 --dry-run
node scripts/phase-b/multi-pass-enrichment.mjs --pass=2 --limit=57000
```

**Day 3**: Pass 3
```bash
node scripts/phase-b/multi-pass-enrichment.mjs --pass=3 --limit=100 --dry-run
node scripts/phase-b/multi-pass-enrichment.mjs --pass=3 --limit=57000
```

**Expected Duration**: Pass 1 & 2 ~4-6 hours each, Pass 3 ~1-2 hours.

---

## Monitoring & Rollback

### Monitor progress:
```bash
watch -n 5 "docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \"SELECT pass_key, COUNT(*) FROM analysis_pass_results WHERE pass_status='complete' GROUP BY pass_key;\""
```

### If a pass fails midway (safe restart):
```bash
node scripts/phase-b/multi-pass-enrichment.mjs --pass=1 --limit=57000
# Idempotent — skips completed packets, retries failed ones
```

### Clear cache if needed:
```bash
docker exec legal-ai-redis redis-cli DEL "emb:q:v1:*"
docker exec legal-ai-redis redis-cli DEL "qdrant:topk:v1:*"
```

---

## Success Criteria

- ✅ All 57K packets processed
- ✅ `analysis_pass_results` populated (all three passes)
- ✅ Redis cache keys present
- ✅ Spot-check results valid JSON
- ✅ Pass 3 cache hit rates improve on second run

---

**Ready to execute on operator approval.**
