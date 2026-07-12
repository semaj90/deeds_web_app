# Embedding Backfill Usage Guide

**Quick Reference** for running the full-corpus embedding backfill script.

---

## Scenario 1: Check Current Status (No Risk)

```bash
# See how many chunks need embeddings
npm run atlas:embed:full-corpus:dry

# Output:
# [INFO] Current coverage: 52380/52380 (100.00%) — 0 missing
# [INFO] ✓ Dry-run complete — no changes written
```

**Interpretation**: All chunks already have embeddings. Nothing to do.

---

## Scenario 2: Preview First 1000 Chunks (Dry-Run)

```bash
npm run atlas:embed:full-corpus:dry --limit=1000

# Output:
# [INFO] Starting backfill: batch_size=48, limit=1000, dry_run=true
# [INFO] Current coverage: 52380/52380 (100.00%) — 0 missing
# [INFO] No chunks needing embeddings — already complete
```

**What this tests:**
- Postgres connectivity ✓
- Chunk selection query ✓
- Coverage reporting ✓

---

## Scenario 3: Simulate with Null Embeddings (Test Mode)

If you want to test the full backfill pipeline, first create a test dataset:

```bash
# Create test scenario: set 100 chunks to NULL embeddings
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  UPDATE codebase_chunk_index
  SET content_embedding = NULL
  WHERE id IN (SELECT id FROM codebase_chunk_index ORDER BY RANDOM() LIMIT 100);
"

# Verify
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT COUNT(*) FROM codebase_chunk_index WHERE content_embedding IS NULL;
"
# Expected output: 100

# Run dry-run to preview
npm run atlas:embed:full-corpus:dry --limit=200

# Output:
# [INFO] Current coverage: 52280/52380 (99.81%) — 100 missing
# [INFO] Fetched batch: 48 chunks (offset 0)
# [INFO] Embedded batch: 48 chunks in 1.2s
# [INFO] Progress: 48/100 chunks (48.0%) ...
# [INFO] ✓ Dry-run complete — no changes written
```

---

## Scenario 4: Actually Run the Backfill

### Step 1: Start Ollama (if not running)

```bash
# Check if Ollama is up
curl -s http://127.0.0.1:11434/api/tags | jq '.models[] | .name'

# If not running, start it
docker start legal-ai-ollama
# or
ollama serve

# Verify embeddinggemma is loaded
curl -s http://127.0.0.1:11434/api/tags | grep embeddinggemma
```

### Step 2: Run the Backfill

```bash
# Full corpus, optimized batch size
npm run atlas:embed:full-corpus:apply

# Or with verbose logging
npm run atlas:embed:full-corpus:apply:verbose

# Expected output:
# [INFO] Mode: APPLY
# [INFO] Starting backfill: batch_size=64, limit=0, dry_run=false
# [INFO] Current coverage: 52280/52380 (99.81%) — 100 missing
# [INFO] Fetched batch: 48 chunks (offset 0)
# [INFO] Embedded batch: 48 chunks in 1.2s
# [INFO] Progress: 48/100 chunks (48.0%) ...
# ...
# [INFO] ╔════════════════════════════════════════╗
# [INFO] ║ BACKFILL COMPLETE                      ║
# [INFO] ╚════════════════════════════════════════╝
# [INFO] Total chunks:     100
# [INFO] Fetched:          100
# [INFO] Successfully embedded: 100
# [INFO] Failed:           0
# [INFO] Success rate:     100.0%
# [INFO] Duration:         0.05 minutes
# [INFO] Final coverage: 52380/52380 (100.00%)
# [INFO] ✓ Backfill complete — embeddings persisted to Postgres
```

### Step 3: Verify Results

```bash
# Check coverage
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT
    COUNT(*) total,
    COUNT(CASE WHEN content_embedding IS NOT NULL THEN 1 END) embedded,
    ROUND(COUNT(CASE WHEN content_embedding IS NOT NULL THEN 1 END)::numeric / COUNT(*) * 100, 2) coverage_pct
  FROM codebase_chunk_index;
"

# Expected: 52380 total, 52380 embedded, 100.00% coverage
```

---

## Scenario 5: Partial Run (First 5000 Chunks)

For testing or if you want to do the backfill in stages:

```bash
npm run atlas:embed:full-corpus:apply --limit=5000

# Output:
# [INFO] Current coverage: 52380/52380 (100.00%) — 0 missing
# [INFO] No chunks needing embeddings — already complete
```

(In this case, all 52K chunks already have embeddings, so nothing happens. But if 5000 were missing, you'd see progress for just those 5000.)

---

## Scenario 6: Custom Batch Size (Stability vs Speed)

### Conservative (32 per batch, slower but more stable)
```bash
node scripts/atlas/backfill-codebase-chunk-embeddings.mjs --apply --batch-size=32
```

### Aggressive (64 per batch, faster but requires fast Ollama)
```bash
node scripts/atlas/backfill-codebase-chunk-embeddings.mjs --apply --batch-size=64
```

### Balanced (48 per batch, default, recommended)
```bash
node scripts/atlas/backfill-codebase-chunk-embeddings.mjs --apply --batch-size=48
```

---

## Scenario 7: Monitor Progress in Real-Time

### Terminal 1: Run Backfill
```bash
npm run atlas:embed:full-corpus:apply:verbose
```

### Terminal 2: Watch Postgres Progress
```bash
watch -n 2 'docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT
    COUNT(*) total,
    COUNT(CASE WHEN content_embedding IS NOT NULL THEN 1 END) embedded,
    ROUND(COUNT(CASE WHEN content_embedding IS NOT NULL THEN 1 END)::numeric / COUNT(*) * 100, 2) pct
  FROM codebase_chunk_index;
"'
```

### Terminal 3: Watch Ollama
```bash
watch -n 5 'curl -s http://127.0.0.1:11434/api/status | jq "."'
```

---

## Scenario 8: Handle Failures (Retry Failed Chunks)

If some chunks failed during backfill, they're still NULL in Postgres:

```bash
# Check how many failed
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT COUNT(*) FROM codebase_chunk_index WHERE content_embedding IS NULL;
"

# Rerun to catch them (script detects NULL and retries)
npm run atlas:embed:full-corpus:apply
```

Failed chunks are logged but don't block progress. Rerun the script multiple times if needed.

---

## Scenario 9: Optimize for Slow Ollama

If Ollama is slow (>5s per batch), increase timeout and reduce batch size:

```bash
node scripts/atlas/backfill-codebase-chunk-embeddings.mjs \
  --apply \
  --batch-size=32 \
  --timeout=60000 \
  --verbose
```

---

## Scenario 10: Check Results Per-Chunk

```bash
# Sample a few embedded chunks
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT
    id,
    file_path,
    content_hash,
    array_length(content_embedding, 1) dim,
    updated_at
  FROM codebase_chunk_index
  WHERE content_embedding IS NOT NULL
  LIMIT 5;
"

# Check for any NULL dimensions (should be 384)
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT
    array_length(content_embedding, 1) as dim,
    COUNT(*) count
  FROM codebase_chunk_index
  WHERE content_embedding IS NOT NULL
  GROUP BY dim
  ORDER BY dim DESC;
"
# Expected: Only one row with dim=384
```

---

## Performance Expectations

| Phase | Chunks | Time | Rate |
|-------|--------|------|------|
| All complete | 52K | 0s | ∞ |
| 1K missing | 1K | ~25s | 40/sec |
| 10K missing | 10K | ~4.2m | 40/sec |
| 40K missing | 40K | ~16.7m | 40/sec |

**Factors affecting speed:**
- Ollama GPU availability (RTX 3060 Ti: 40/sec, CPU: 2-3/sec)
- Batch size (larger = fewer HTTP roundtrips, but timeout risk)
- Network latency (localhost: <5ms, distant: +100ms per batch)
- Postgres I/O (local SSD: <10ms, slow disk: +50ms per batch)

---

## Troubleshooting

### "Cannot read property 'length'" Error
**Cause**: Ollama /api/embed endpoint not working
```bash
# Test manually
curl -X POST http://127.0.0.1:11434/api/embed \
  -H 'Content-Type: application/json' \
  -d '{"model":"embeddinggemma:latest","input":["test"]}'

# If error, restart Ollama
docker restart legal-ai-ollama
```

### Embedding Dimension Wrong (Not 384)
**Cause**: Wrong embedding model or model version mismatch
```bash
# Verify
curl -s http://127.0.0.1:11434/api/tags | jq '.models[] | select(.name | contains("embedding"))'

# Expected: embeddinggemma:latest (384-dim)
```

### Postgres Connection Refused
**Cause**: Database not running
```bash
docker start legal-ai-postgres
```

### Timeout After N Chunks
**Cause**: Ollama ran out of VRAM or crashed
```bash
# Check Ollama logs
docker logs legal-ai-ollama | tail -50

# Restart
docker restart legal-ai-ollama

# Rerun (picks up where it left off)
npm run atlas:embed:full-corpus:apply
```

---

## Related Commands

```bash
# Check database connection
npm run atlas:embed:full-corpus:dry

# Profile embedding speed
node scripts/atlas/backfill-codebase-chunk-embeddings.mjs --apply --limit=100 --verbose

# Export embeddings for analysis
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  COPY (
    SELECT id, file_path, array_length(content_embedding, 1) as dim
    FROM codebase_chunk_index
    WHERE content_embedding IS NOT NULL
  ) TO STDOUT WITH CSV HEADER;
" > /tmp/embeddings_sample.csv
```

---

**Last Updated**: July 11, 2026  
**Status**: Ready for production  
**Questions?**: See `BACKFILL-CODEBASE-CHUNK-EMBEDDINGS.md` for technical details
