# Vector Search Quick Start Checklist

**Estimated Time:** 10 minutes to full setup

---

## Phase 1: Verify Infrastructure (2 minutes)

```bash
# 1. Check PostgreSQL + pgvector
psql -U legal_admin -d legal_ai_db -c "SELECT extname, extversion FROM pg_extension WHERE extname='vector';"
# Expected: vector | 0.8.0 | public | ...

# 2. Check Ollama + embeddings model
curl http://localhost:11434/api/tags | grep -i embedding
# Expected: embeddinggemma:latest should be listed

# 3. Check Redis + authentication
redis-cli -a redis ping
# Expected: PONG
```

**Status:**
- [ ] pgvector 0.8.0 verified
- [ ] Ollama embedding model available
- [ ] Redis responding to ping

---

## Phase 2: Create Performance Indexes (5 minutes)

**CRITICAL:** This makes queries 20-40x faster. Do this before production use.

```bash
# Create HNSW indexes for both tables
psql -U legal_admin -d legal_ai_db -f scripts/create-pgvector-indexes.sql
```

**Expected Output:**
```
✅ HNSW indexes created successfully!
```

**What it does:**
- Creates HNSW index on `evidence` table (768-dim embeddings)
- Creates HNSW index on `documents` table (1536-dim embeddings)
- Runs ANALYZE to update statistics
- Verifies index creation

**Status:**
- [ ] HNSW index creation script executed
- [ ] Success message confirmed
- [ ] No SQL errors in output

---

## Phase 3: Start Development Server (1 minute)

```bash
# Terminal 1: Start SvelteKit dev server
REDIS_PASSWORD=redis npm run dev

# Should see output:
# ✓ built in 2.1s
# ➜  Local:   http://localhost:5173/
```

**Status:**
- [ ] SvelteKit server started successfully
- [ ] No Redis or database connection errors

---

## Phase 4: Verify Health Endpoint (1 minute)

```bash
# Terminal 2: Check health
curl http://localhost:5173/api/search-drizzle-pgvector

# Expected response:
{
  "status": "healthy",
  "services": {
    "pgvector": "available",
    "ollama": "available"
  },
  "endpoints": {
    "search": "POST /api/search-drizzle-pgvector",
    "health": "GET /api/search-drizzle-pgvector"
  }
}
```

**Status:**
- [ ] Health endpoint responds with 200 OK
- [ ] All services show "available"

---

## Phase 5: Test Search API (1 minute)

```bash
# Test search functionality
curl -X POST http://localhost:5173/api/search-drizzle-pgvector \
  -H "Content-Type: application/json" \
  -d '{
    "query": "employment contract",
    "topK": 5,
    "threshold": 0.5,
    "searchInTable": "evidence"
  }'

# Expected: Results array with similarity scores
```

**Status:**
- [ ] API returns 200 OK
- [ ] Results array present
- [ ] Similarity scores between 0 and 1
- [ ] Response time shown in metadata

---

## Phase 6: Visit Frontend UI (1 minute)

Open browser to: **http://localhost:5173/(tools)/search**

**Features to verify:**
- [ ] Search input field loads
- [ ] Can type query text
- [ ] Advanced options toggle works
- [ ] Submit button present
- [ ] Results display after search
- [ ] Similarity percentage shows (0-100%)
- [ ] Response time displayed

---

## Complete Verification Test

**Query:** "employment contract termination"

```bash
curl -X POST http://localhost:5173/api/search-drizzle-pgvector \
  -H "Content-Type: application/json" \
  -d '{
    "query": "employment contract termination",
    "topK": 10,
    "threshold": 0.5,
    "searchInTable": "evidence"
  }'
```

**Checklist:**
- [ ] HTTP 200 response
- [ ] Results returned (if data exists)
- [ ] Similarity scores in 0.0-1.0 range
- [ ] Response time < 300ms
- [ ] Metadata shows correct table name
- [ ] modelUsed: "embeddinggemma:latest"
- [ ] indexType: "pgvector (cosine distance)"

---

## Troubleshooting Quick Reference

| Issue | Check | Fix |
|-------|-------|-----|
| "pgvector not available" | `SELECT * FROM pg_extension WHERE extname='vector';` | Extension not initialized. Run: `CREATE EXTENSION vector;` |
| "Failed to generate embedding" | `curl http://localhost:11434/api/tags` | Ollama not running. Start Ollama service |
| "NOAUTH Authentication required" | `redis-cli -a redis ping` | Redis needs password. Check REDIS_PASSWORD env var |
| "Search timeout" | Create HNSW indexes | Run: `psql ... -f scripts/create-pgvector-indexes.sql` |
| "No results returned" | Check document count | Ensure documents have embeddings: `SELECT COUNT(*) FROM evidence WHERE embedding IS NOT NULL;` |

---

## Documentation Navigation

**For Quick Setup:**
→ `VECTOR_SEARCH_QUICK_START.md` (this file)

**For Full Integration:**
→ `DRIZZLE_PGVECTOR_INTEGRATION.md` (11KB, comprehensive guide)

**For Testing & Debugging:**
→ `SEARCH_IMPLEMENTATION_GUIDE.md` (8.6KB, detailed instructions)

**For Architecture Overview:**
→ `IMPLEMENTATION_SUMMARY.md` (3.8KB, system overview)

---

## Performance Expectations

### After HNSW Index Creation

**Single Query Response Time:** 110-160ms
- Embedding generation: 100-150ms
- pgvector search: 5-10ms (HNSW accelerated)
- Result mapping: 1-2ms

**Query Throughput:**
- ~6-9 queries per second
- ~360-540 queries per minute

### Before HNSW Index (NOT RECOMMENDED)

**Single Query Response Time:** 150-350ms
- Embedding generation: 100-150ms
- pgvector search: 50-200ms (full table scan)
- Result mapping: 1-2ms

**NOTE:** Create HNSW indexes immediately for production!

---

## Next Steps After Verification

### Immediately (Do This)
1. ✅ Create HNSW indexes (Phase 2 above)
2. ✅ Verify health endpoint (Phase 4 above)
3. ✅ Test with sample queries (Phase 5 above)

### Today
1. Load some test documents/evidence
2. Run searches to verify results
3. Monitor response times in UI
4. Check database query performance

### This Week
1. Integrate with existing RAG pipeline
2. Add result caching (Redis)
3. Implement batch embedding for documents
4. Test with production-like data volume

### This Month
1. Performance optimization (quantization)
2. Advanced filtering options
3. Multi-field search
4. Monitor for scaling needs

---

## API Quick Reference

### Search Evidence
```bash
curl -X POST http://localhost:5173/api/search-drizzle-pgvector \
  -H "Content-Type: application/json" \
  -d '{"query":"your query","topK":10,"threshold":0.5,"searchInTable":"evidence"}'
```

### Search Documents
```bash
curl -X POST http://localhost:5173/api/search-drizzle-pgvector \
  -H "Content-Type: application/json" \
  -d '{"query":"your query","topK":10,"threshold":0.5,"searchInTable":"documents"}'
```

### Health Check
```bash
curl http://localhost:5173/api/search-drizzle-pgvector
```

### Monitor Performance
```sql
-- Check index usage
SELECT * FROM pg_stat_user_indexes WHERE relname LIKE '%hnsw%';

-- Check query performance
EXPLAIN ANALYZE SELECT ... FROM evidence WHERE ... LIMIT 10;
```

---

## Success Criteria

You're ready for production when:

- ✅ pgvector extension initialized
- ✅ HNSW indexes created
- ✅ Health endpoint returning "healthy"
- ✅ Search queries completing in <200ms
- ✅ Results showing relevant documents
- ✅ Frontend UI displaying results properly
- ✅ Response times logged in metadata

---

## Emergency Contacts / References

**If HNSW index creation fails:**
See DRIZZLE_PGVECTOR_INTEGRATION.md → "Troubleshooting" section

**If embedding generation fails:**
- Check Ollama: `curl http://localhost:11434/api/tags`
- Verify model: `ollama list | grep embedding`

**If search returns no results:**
- Check for documents with embeddings: `SELECT COUNT(*) FROM evidence WHERE embedding IS NOT NULL;`
- Lower threshold value: Try 0.3 or 0.2

**For performance questions:**
See VECTOR_SEARCH_STATUS_REPORT.md → "Performance Baseline" section

---

**Total Setup Time:** ~10 minutes
**Status:** Ready to implement ✅

Once all checks pass, your vector search system is production-ready!
