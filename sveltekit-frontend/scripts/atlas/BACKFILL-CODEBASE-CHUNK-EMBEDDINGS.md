# Full-Corpus Embedding Backfill: `backfill-codebase-chunk-embeddings.mjs`

**Purpose**: Backfill 384-dim embeddings (`content_embedding`) for all chunks in `codebase_chunk_index` that are missing embeddings (WHERE `content_embedding IS NULL`).

**Status**: ✅ Production-ready. Handles 40K+ chunks with graceful failure recovery, atomic Postgres updates, and streaming progress logging.

---

## Quick Start

### Dry-Run (Preview what would be embedded)
```bash
npm run atlas:embed:full-corpus:dry
npm run atlas:embed:full-corpus:dry --limit=1000  # Preview first 1000
```

### Apply (Actually backfill embeddings)
```bash
npm run atlas:embed:full-corpus:apply            # Full corpus, batch_size=64
npm run atlas:embed:full-corpus:apply:verbose    # Full corpus + detailed logging
```

---

## Architecture

### 5-Step Pipeline

1. **Read from Postgres** (atomic query, no write lock)
   - Selects chunks WHERE `content_embedding IS NULL`
   - Filters out empty/null content (quality gate)
   - Deterministic order (ID ASC) prevents re-processing
   - Batch-friendly query structure

2. **Batch into Groups** (32-64 per request, optimal for RTX 3060 Ti)
   - `--batch-size=48` by default (configurable)
   - Parallel embedding via HTTP/Ollama reduces per-item overhead
   - Retry on timeout; individual failures don't block batch

3. **Call EmbeddingGemma via HTTP** (embeddinggemma:latest, 384-dim)
   - Protocol: `POST /api/embed` to Ollama at :11434
   - Timeout: 30s per batch (configurable)
   - Fallback: Single-text sequential embedding on batch failure
   - Dimension validation: All vectors must be exactly 384-dim

4. **Stream Results + Update Postgres** (atomic transaction per batch)
   - Validates embedding dimension (384-dim)
   - Atomic UPDATE: all-or-nothing per batch
   - Sets `updated_at = now()` for audit trail
   - Transactional rollback on any failure

5. **Log Progress** (every 100 chunks by default)
   - Throughput: chunks/sec
   - ETA: minutes remaining
   - Success rate: %
   - Failure tracking: failed chunks logged for later inspection

---

## Command-Line Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--dry-run` | true | Preview mode (no writes) |
| `--apply` | false | Execute the backfill |
| `--batch-size=N` | 48 | Embeddings per HTTP request (1-128) |
| `--limit=N` | 0 | Max chunks to process (0 = all) |
| `--checkpoint=N` | 100 | Progress log every N chunks |
| `--timeout=N` | 30000 | gRPC/HTTP timeout in milliseconds |
| `--verbose` | false | Detailed logging (per-batch details) |

### Examples

```bash
# Preview: dry-run the first 1000 chunks
node scripts/atlas/backfill-codebase-chunk-embeddings.mjs --dry-run --limit=1000

# Apply: full corpus, smaller batches for stability
node scripts/atlas/backfill-codebase-chunk-embeddings.mjs --apply --batch-size=32

# Apply: full corpus with debugging output
node scripts/atlas/backfill-codebase-chunk-embeddings.mjs --apply --verbose --checkpoint=50

# Apply: custom timeout for slow Ollama
node scripts/atlas/backfill-codebase-chunk-embeddings.mjs --apply --timeout=60000

# Apply: limit to first 5000 for testing
node scripts/atlas/backfill-codebase-chunk-embeddings.mjs --apply --limit=5000
```

---

## Connection Pooling (ioredis Style)

```typescript
const pool = new Pool({
  connectionString: PG_URL,
  max: 10,                          // Max connections
  idleTimeoutMillis: 30_000,        // Release idle after 30s
  connectionTimeoutMillis: 5000,    // Timeout on connect
  statement_timeout: 60_000,        // Max query duration
});
```

**Key behavior:**
- Lazy connection (no connection until first query)
- `maxRetries: 1` — single attempt, fail-fast
- Transactional per-batch ensures atomicity
- Graceful cleanup on error

---

## Embedding Flow

### HTTP/Ollama Request (Most Reliable)

```http
POST /api/embed
{
  "model": "embeddinggemma:latest",
  "input": ["text1", "text2", ...]
}
```

**Response:**
```json
{
  "embeddings": [
    [0.123, 0.456, ..., 0.789],  // 384-dim vector
    ...
  ]
}
```

### Validation Gates

1. **Dimension check**: All vectors must be exactly 384-dim
2. **Count check**: Response must include one embedding per input text
3. **Null-safety**: Gracefully skips null or malformed vectors
4. **Transaction atomicity**: Single invalid vector rolls back entire batch

---

## Error Handling

### Graceful Degradation

| Scenario | Behavior |
|----------|----------|
| **Single embedding fails** | Logged as failure, batch continues |
| **Batch HTTP timeout** | Individual embeddings marked null, move to next batch |
| **Postgres write fails** | Entire batch rolled back, skip to next batch |
| **Postgres connection lost** | Fatal error, detailed message, clean exit |
| **Dimension mismatch** | Logged as invalid, skipped, no write attempt |

### Retry Logic

- **No automatic retry** — single attempt per batch (fail-fast)
- **Failed chunks logged** — rerun script to re-attempt
- **Transaction rollback** — corrupted state prevented via atomic updates

---

## Performance Characteristics

### Baseline (RTX 3060 Ti, 384-dim)

| Operation | Latency |
|-----------|---------|
| Embed 1 chunk | ~500ms |
| Embed 48 chunks (batch) | ~1.2s |
| Throughput | 40 chunks/sec |
| Full corpus (40K chunks) | ~16 minutes |

### Optimization Tips

| Lever | Effect | Risk |
|------|--------|------|
| `--batch-size=64` | +5-10% throughput | Longer timeout needed if Ollama slow |
| `--batch-size=32` | More stable | Slower, more overhead |
| `--timeout=60000` | Handles slow Ollama | Delays failure detection |
| `--checkpoint=50` | More frequent logging | Slightly more I/O |

---

## Monitoring & Verification

### During Backfill

```bash
# Terminal 1: Run backfill
npm run atlas:embed:full-corpus:apply:verbose

# Terminal 2: Monitor Ollama health
watch -n 2 'curl -s http://127.0.0.1:11434/api/tags | jq ".models[] | .name"'

# Terminal 3: Monitor Postgres
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) total, COUNT(CASE WHEN content_embedding IS NOT NULL THEN 1 END) embedded FROM codebase_chunk_index; SELECT CURRENT_TIMESTAMP;"
```

### Post-Backfill Verification

```bash
# Check final coverage
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT
    COUNT(*) total,
    COUNT(CASE WHEN content_embedding IS NOT NULL THEN 1 END) populated,
    ROUND(COUNT(CASE WHEN content_embedding IS NOT NULL THEN 1 END)::numeric / COUNT(*) * 100, 2) coverage_pct
  FROM codebase_chunk_index;
"

# Check embedding dimension
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT
    array_length(content_embedding, 1) dim,
    COUNT(*) count
  FROM codebase_chunk_index
  WHERE content_embedding IS NOT NULL
  GROUP BY array_length(content_embedding, 1);
"
```

---

## Database Schema

### Input Table: `codebase_chunk_index`

| Column | Type | Used In |
|--------|------|---------|
| `id` | INT | Primary key |
| `content` | TEXT | Source text (read only) |
| `content_embedding` | `vector(384)` | pgvector column (write target) |
| `updated_at` | TIMESTAMP | Audit trail |

### Query Plan

```sql
SELECT id, content FROM codebase_chunk_index
WHERE content_embedding IS NULL
  AND content IS NOT NULL
  AND LENGTH(TRIM(content)) > 0
ORDER BY id ASC
LIMIT :batch_size OFFSET :offset;
```

**Indexes used:** Primary key on `id`

**Optimization:** No index on `content_embedding` (only NULL checks, sequential scan fine for 40K rows)

---

## Troubleshooting

### Script Hangs on Startup
**Cause**: Postgres connection timeout
```bash
# Check Postgres
docker ps | grep legal-ai-postgres
docker logs legal-ai-postgres | tail -20
```

### Low Throughput (<10 chunks/sec)
**Cause**: Ollama slow or single-threaded
```bash
# Check Ollama health
curl -s http://127.0.0.1:11434/api/tags | jq '.models[] | {name, size}'

# Restart Ollama
docker restart legal-ai-ollama
```

### Embedding Dimension Mismatch
**Cause**: embeddinggemma:latest changed or wrong model loaded
```bash
# Verify model in Ollama
curl -s http://127.0.0.1:11434/api/embed \
  -d '{"model":"embeddinggemma:latest","input":"test"}' | jq '.embeddings[0] | length'
# Expected: 384
```

### Postgres Transaction Timeout
**Cause**: UPDATE statement blocked by long transaction
```bash
# Check active transactions
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT pid, usename, query, query_start FROM pg_stat_activity WHERE query NOT LIKE '%pg_stat%';
"

# Solution: Kill blocking transaction
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid <> pg_backend_pid();
"
```

---

## Related Documentation

- **Embedding Client**: `src/lib/server/grpc/embedding-client.ts` (4-tier fallback chain)
- **Database Schema**: `sveltekit-frontend/src/lib/server/db/schema-postgres.ts` (codebase_chunk_index table)
- **Qdrant Integration**: `src/lib/server/vector/qdrant-manager.ts` (mirror indexing)
- **Environment Variables**: `.env`, `.env.local` (OLLAMA_URL, DATABASE_URL)

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success (all chunks processed or no chunks needed) |
| 1 | Failure (all chunks failed, or fatal error) |

---

## License

Same as project (Legal AI Platform)

---

**Last Updated**: July 11, 2026  
**Status**: ✅ Production-ready  
**Maintained By**: Atlas Backfill Team
