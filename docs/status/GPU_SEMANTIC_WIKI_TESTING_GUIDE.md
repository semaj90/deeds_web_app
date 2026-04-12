# GPU Semantic Wiki Testing Strategy Guide

**Version**: 1.0
**Date**: April 9, 2026
**Status**: Ready for Testing
**Estimated Test Time**: 15-30 minutes

---

## 📋 Prerequisites Checklist

Before starting tests, verify these requirements:

- [ ] **PostgreSQL running** on port 5434 (deeds-postgres-prod-proxy)
- [ ] **Ollama running** on port 11434 with GPU enabled
- [ ] **embeddinggemma:latest** model pulled (`ollama pull embeddinggemma`)
- [ ] **Dev environment variables** loaded (`.env` configured)
- [ ] **Node.js** version 18+ installed
- [ ] **Database connection** working (`psql $DATABASE_URL -c "SELECT 1"`)

---

## 🎯 Test Objectives

1. ✅ Verify database schema is correctly deployed
2. ✅ Validate MapReduce indexing pipeline works end-to-end
3. ✅ Confirm worker threads process chunks and generate embeddings
4. ✅ Test semantic search returns relevant results with similarity scores
5. ✅ Validate real-time progress tracking updates correctly
6. ✅ Measure performance benchmarks against targets

---

## 🧪 Phase 1: Infrastructure Validation

### 1.1 Run Automated Test Suite

**Command**:
```bash
node scripts/test-semantic-wiki.mjs
```

**Expected Output**:
```
🧪 GPU Semantic Wiki Test Suite

[1/5] Testing database schema...
  ✅ Table codebase_files exists
  ✅ Table codebase_embeddings exists
  ✅ Table codebase_graph_analysis exists
  ✅ Table codebase_mapreduce_jobs exists
  ✅ Table codebase_search_cache exists
  ✅ Table codebase_wiki_pages exists
  ✅ Table mapreduce_map_queue exists
  ✅ Table mapreduce_reduce_results exists
  ✅ Table gpu_performance_metrics exists
  ✅ Function codebase_semantic_search exists
  ✅ Function increment_wiki_view_count exists

[2/5] Testing HNSW index...
  ✅ HNSW index exists: idx_codebase_embeddings_hnsw

[3/5] Testing semantic search function...
  ✅ Semantic search executed (returned 0 results)
  ℹ️  No indexed data yet - run indexing first

[4/5] Testing Ollama availability...
  ✅ Ollama connected (4 models loaded)
  ✅ embeddinggemma:latest available

[5/5] Testing indexing API...
  ℹ️  API testing requires authenticated session

✅ All automated tests passed!
```

**If Schema Missing**:
```bash
psql $DATABASE_URL -f sveltekit-frontend/drizzle/manual/gpu_codebase_wiki_schema.sql
```

**Verification Query**:
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE 'codebase_%';
```

### 1.2 Verify HNSW Index

**Check Index Exists**:
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'codebase_embeddings'
AND indexdef LIKE '%hnsw%';
```

**Expected Result**:
```
indexname                      | indexdef
-------------------------------|--------------------------------------------------
idx_codebase_embeddings_hnsw   | CREATE INDEX ... USING hnsw ((embedding::halfvec(768)) ...
```

### 1.3 Confirm Ollama GPU Mode

**Check GPU Utilization**:
```bash
curl http://localhost:11434/api/ps
```

**Expected Response**:
```json
{
  "models": [
    {
      "name": "embeddinggemma:latest",
      "size": 622395584,
      "digest": "...",
      "details": {
        "parameter_size": "307M",
        "quantization_level": "BF16"
      }
    }
  ]
}
```

**GPU Check** (if nvidia-smi available):
```bash
nvidia-smi --query-gpu=name,memory.used,utilization.gpu --format=csv
```

---

## 🚀 Phase 2: End-to-End Indexing Test

### 2.1 Start Development Server

**Command**:
```bash
cd sveltekit-frontend
npm run dev
```

**Expected Output**:
```
> sveltekit-frontend@1.0.0 dev
> cross-env DEV_BYPASS_AUTH=true vite dev

  VITE v5.x.x  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

### 2.2 Navigate to Dashboard

**URL**: `http://localhost:5173/codebase-wiki`

**Expected UI Elements**:
- ✅ "Codebase Semantic Wiki" header
- ✅ "Reindex Codebase" button (top right)
- ✅ Category filter buttons (All, Auth, RAG, Evidence, Chat, Vector, GPU)
- ✅ Search bar with placeholder text
- ✅ Empty state message: "No wiki pages found. Start by indexing your codebase."

### 2.3 Start Indexing Job

**Action**: Click "Reindex Codebase" button

**In Dialog**:
1. **Default Patterns** (pre-filled):
   ```
   sveltekit-frontend/src/lib/**/*.ts
   sveltekit-frontend/src/lib/**/*.svelte
   sveltekit-frontend/src/routes/**/*.ts
   sveltekit-frontend/src/routes/**/*.svelte
   ```

2. **Recommended Test Pattern** (smaller scope):
   ```
   sveltekit-frontend/src/lib/components/**/*.svelte
   sveltekit-frontend/src/routes/(app)/**/*.svelte
   ```

3. **Click**: "Start Indexing"

**Expected Behavior**:
- ✅ Dialog closes
- ✅ Progress bar appears at top of dashboard
- ✅ Spinner icon animates
- ✅ Progress percentage updates (0.0% → 100.0%)
- ✅ File count updates: "X / Y files"

### 2.4 Monitor Backend Logs

**Terminal Output to Watch For**:

```
[MapReduce] Queued 847 chunks for 103 files

[Worker 0] Started for job a1b2c3d4-e5f6-7890-abcd-ef1234567890 (batch size: 32)
[Worker 1] Started for job a1b2c3d4-e5f6-7890-abcd-ef1234567890 (batch size: 32)
[Worker 2] Started for job a1b2c3d4-e5f6-7890-abcd-ef1234567890 (batch size: 32)
[Worker 3] Started for job a1b2c3d4-e5f6-7890-abcd-ef1234567890 (batch size: 32)

[Worker 0] Processing 32 chunks
[Worker 1] Processing 32 chunks
[Worker 2] Processing 32 chunks
[Worker 3] Processing 32 chunks

[Worker 0] No more work, exiting
[Worker 1] No more work, exiting
[Worker 2] No more work, exiting
[Worker 3] No more work, exiting

[MapReduce] Job a1b2c3d4-e5f6-7890-abcd-ef1234567890 completed
```

### 2.5 Database Verification

**Check Job Status**:
```sql
SELECT id, job_type, status, total_files, processed_files,
       started_at, completed_at
FROM codebase_mapreduce_jobs
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Result**:
```
id           | a1b2c3d4-e5f6-7890-abcd-ef1234567890
job_type     | embed
status       | completed
total_files  | 103
processed_files | 103
started_at   | 2026-04-09 14:23:15
completed_at | 2026-04-09 14:24:32
```

**Check Embeddings Count**:
```sql
SELECT COUNT(*) as total_embeddings,
       COUNT(DISTINCT file_id) as unique_files
FROM codebase_embeddings;
```

**Expected Result**:
```
total_embeddings | 847
unique_files     | 103
```

**Check GPU Metrics**:
```sql
SELECT gpu_device, operation,
       COUNT(*) as operations,
       AVG(duration_ms) as avg_duration_ms,
       SUM(input_size) as total_tokens
FROM gpu_performance_metrics
WHERE operation = 'embed'
GROUP BY gpu_device, operation;
```

**Expected Result**:
```
gpu_device    | RTX 3060 Ti
operation     | embed
operations    | 847
avg_duration_ms | 25.3
total_tokens  | 434176
```

---

## 🔍 Phase 3: Semantic Search Testing

### 3.1 Basic Search Test

**Action**: Enter query in search bar

**Test Query 1**: `"authentication middleware"`

**Click**: "Search" button

**Expected Results**:
- ✅ Search executes within 2-5 seconds
- ✅ Results header shows: "Search Results (X)"
- ✅ Each result card displays:
  - File path in code font (e.g., `src/lib/server/auth/middleware.ts`)
  - Similarity score badge (e.g., "87.3% match")
  - Code chunk preview (up to 300 characters)
  - Chunk index metadata
- ✅ Results ordered by similarity score (highest first)

**Test Query 2**: `"vector similarity search"`

**Expected Results**:
- ✅ Returns chunks from vector/retrieval-related files
- ✅ Similarity scores between 60-95%
- ✅ Code previews contain relevant keywords

**Test Query 3**: `"button component props"`

**Expected Results**:
- ✅ Returns Svelte component files
- ✅ Shows prop declarations and usage
- ✅ High similarity for UI component files

### 3.2 Category Filtering Test

**Action**: Click category buttons while viewing search results

**Test Cases**:

| Category | Expected Behavior |
|----------|-------------------|
| All Categories | Shows all results (no filter) |
| Authentication | Filters to auth-related files only |
| RAG Pipeline | Filters to rag/retrieval files |
| Evidence | Filters to evidence-related files |
| Chat | Filters to chat/messaging files |
| Vector Search | Filters to vector/embedding files |
| GPU Compute | Filters to gpu/cuda files |

**Validation**:
- ✅ Active category button has accent background color
- ✅ Results update to match category
- ✅ Result count changes in header
- ✅ Empty state shows if no results for category

### 3.3 Performance Benchmarks

**Metric Targets**:

| Metric | Target | Acceptable Range |
|--------|--------|------------------|
| Search latency (total) | <2s | 1-5s |
| Embedding generation | <500ms | 200-1000ms |
| Vector search (HNSW) | <50ms | 10-200ms |
| Results returned | 5-10 | 1-20 |
| Similarity threshold | ≥0.5 | 0.5-1.0 |

**Measure Search Performance**:

Open browser DevTools Network tab:
1. Clear network log
2. Perform search
3. Find POST request to `/api/codebase/wiki`
4. Check timing:
   - **Time**: Should be <2000ms
   - **Size**: ~5-50KB depending on results

**Backend Timing** (check terminal logs):
```
Semantic search executed in 1823ms
  - Embedding generation: 412ms
  - Vector search: 38ms
  - Result serialization: 5ms
```

---

## 📊 Phase 4: Performance Analysis

### 4.1 Indexing Throughput

**Calculate Embeddings/Second**:

From terminal logs:
- Total chunks: 847
- Total time: 77 seconds (14:23:15 → 14:24:32)
- **Throughput**: 847 / 77 = **11 chunks/second**

**Expected Range**: 120-200 chunks/sec (4 workers × 30-50 chunks/sec each)

**If Below Target**:
- Check Ollama GPU utilization (`nvidia-smi`)
- Verify batch size is 32 (check worker logs)
- Confirm 4 workers spawned (check logs)
- Check network latency to Ollama (should be <1ms for localhost)

### 4.2 Search Relevance

**Manual Evaluation**:

For query: `"authentication middleware"`

**Score Each Result** (1-5 scale):
1. **Relevance**: Does chunk mention auth/middleware?
2. **Context**: Is surrounding code relevant?
3. **Ranking**: Are higher scores more relevant?

**Target Metrics**:
- Top 3 results: Average relevance ≥4.0
- Top 10 results: Average relevance ≥3.0
- Precision@5: ≥80% relevant

### 4.3 Database Storage

**Check Disk Usage**:
```sql
SELECT pg_size_pretty(pg_total_relation_size('codebase_embeddings')) as embeddings_size,
       pg_size_pretty(pg_total_relation_size('codebase_files')) as files_size,
       pg_size_pretty(pg_indexes_size('codebase_embeddings')) as index_size;
```

**Expected Results** (for 847 embeddings):
```
embeddings_size | ~2.5 MB (halfvec saves 50% vs float32)
files_size      | ~150 KB
index_size      | ~8 MB (HNSW index)
```

**Memory Efficiency**:
- Halfvec(768): 768 × 2 bytes = 1,536 bytes per embedding
- Float32(768): 768 × 4 bytes = 3,072 bytes per embedding
- **Savings**: 50% per embedding

---

## 🐛 Phase 5: Error Handling Tests

### 5.1 Invalid Query Test

**Action**: Submit empty query

**Expected Behavior**:
- ✅ Search button disabled when input empty
- ✅ No API call made
- ✅ No error message shown

**Action**: Submit whitespace-only query (`"   "`)

**Expected Behavior**:
- ✅ API returns 400 error
- ✅ Error message shown: "Invalid query"
- ✅ Results section remains empty

### 5.2 Ollama Offline Test

**Setup**: Stop Ollama service
```bash
# On Windows
Stop-Service ollama

# On Linux/Mac
sudo systemctl stop ollama
```

**Action**: Perform search

**Expected Behavior**:
- ✅ Search takes ~5 seconds (timeout)
- ✅ Error message: "Failed to generate embedding"
- ✅ No results shown
- ✅ No 500 error (graceful degradation)

**Cleanup**: Restart Ollama
```bash
# On Windows
Start-Service ollama

# On Linux/Mac
sudo systemctl start ollama
```

### 5.3 Database Disconnection Test

**Setup**: Stop PostgreSQL proxy
```bash
docker stop deeds-postgres-prod-proxy
```

**Action**: Start new indexing job

**Expected Behavior**:
- ✅ Job creation fails
- ✅ Error message shown in UI
- ✅ No worker threads spawned
- ✅ Graceful error handling (no crash)

**Cleanup**: Restart proxy
```bash
docker start deeds-postgres-prod-proxy
```

---

## ✅ Phase 6: Acceptance Criteria

### 6.1 Functional Requirements

- [ ] **F1**: Users can initiate indexing with custom file patterns
- [ ] **F2**: Real-time progress bar updates during indexing
- [ ] **F3**: Semantic search returns relevant code chunks
- [ ] **F4**: Similarity scores displayed as percentages
- [ ] **F5**: Category filtering works correctly
- [ ] **F6**: Results show file paths and code previews
- [ ] **F7**: Empty states displayed when no results

### 6.2 Performance Requirements

- [ ] **P1**: Indexing throughput ≥100 chunks/sec
- [ ] **P2**: Search latency <3 seconds end-to-end
- [ ] **P3**: Vector search (HNSW) <100ms
- [ ] **P4**: Supports 10,000+ embeddings without degradation
- [ ] **P5**: Memory usage <100MB per 1000 embeddings

### 6.3 Quality Requirements

- [ ] **Q1**: Search relevance (top 5) ≥80% accuracy
- [ ] **Q2**: No data loss during indexing failures
- [ ] **Q3**: Graceful degradation when Ollama offline
- [ ] **Q4**: No memory leaks in worker threads
- [ ] **Q5**: Error messages are user-friendly

---

## 🔧 Troubleshooting Guide

### Issue: Workers Not Starting

**Symptoms**: Progress bar stays at 0%, no worker logs

**Diagnosis**:
```bash
# Check if worker file exists
ls -l sveltekit-frontend/src/lib/server/gpu/mapreduce-worker.mjs

# Check for syntax errors
node --check sveltekit-frontend/src/lib/server/gpu/mapreduce-worker.mjs
```

**Fix**:
1. Verify worker file path in `mapreduce-cuda-analyzer.ts` line 122
2. Check `__dirname` resolves correctly
3. Ensure `worker_threads` module is available

### Issue: No Search Results

**Symptoms**: Search executes but returns 0 results

**Diagnosis**:
```sql
-- Check if embeddings exist
SELECT COUNT(*) FROM codebase_embeddings;

-- Check if search function works
SELECT codebase_semantic_search(
  '[0.1,0.2,...]'::vector(768),
  10, 0.0, NULL
);
```

**Fix**:
1. Re-run indexing job
2. Check similarity threshold (lower to 0.3)
3. Verify embedding dimensions (must be 768)

### Issue: Slow Indexing (<50 chunks/sec)

**Symptoms**: Job takes >5 minutes for 100 files

**Diagnosis**:
```bash
# Check Ollama GPU usage
nvidia-smi

# Check Ollama model loaded
curl http://localhost:11434/api/ps
```

**Fix**:
1. Ensure Ollama using GPU (not CPU)
2. Increase `num_gpu` layers in worker (line 41)
3. Reduce batch size if out of memory
4. Check network latency to Ollama

### Issue: High Similarity Scores (All >95%)

**Symptoms**: All results show 95-100% similarity

**Diagnosis**: Likely using identical embedding for all chunks

**Fix**:
1. Check Ollama embedding model loaded correctly
2. Verify different text produces different embeddings
3. Re-index with fresh embeddings

---

## 📈 Success Metrics

### Quantitative KPIs

| Metric | Target | Measured | Pass/Fail |
|--------|--------|----------|-----------|
| Indexing throughput | ≥100 chunks/sec | _____ | ⬜ |
| Search latency | <3s | _____ | ⬜ |
| Vector search time | <100ms | _____ | ⬜ |
| Search relevance (top 5) | ≥80% | _____ | ⬜ |
| Worker completion rate | 100% | _____ | ⬜ |
| Error rate | <1% | _____ | ⬜ |

### Qualitative Assessment

**User Experience** (1-5 scale):
- [ ] Dashboard UI is intuitive and easy to navigate
- [ ] Progress tracking provides clear feedback
- [ ] Search results are relevant and useful
- [ ] Error messages are helpful when issues occur
- [ ] Overall system feels responsive and polished

**Code Quality**:
- [ ] Worker threads handle errors gracefully
- [ ] No console errors in browser DevTools
- [ ] Backend logs are clear and actionable
- [ ] Database schema is well-designed
- [ ] API responses follow degraded response pattern

---

## 🎓 Next Steps

After completing all tests:

### If All Tests Pass ✅

1. **Document Performance Baselines**:
   - Record actual throughput achieved
   - Save example search queries and results
   - Capture screenshots of dashboard

2. **Update MEMORY.md**:
   - Add GPU Semantic Wiki to completed features
   - Document performance benchmarks
   - Note any edge cases discovered

3. **Plan Phase 2 Features**:
   - K-Means clustering (reduce phase)
   - Auto-generated wiki pages with LLM summaries
   - D3.js graph visualization
   - Incremental re-indexing

### If Tests Fail ❌

1. **Triage Issues**:
   - P0: Blocking (indexing doesn't work)
   - P1: Critical (search returns wrong results)
   - P2: Major (performance below targets)
   - P3: Minor (UI polish, edge cases)

2. **Debug Systematically**:
   - Check logs for error messages
   - Verify database state
   - Test each component in isolation
   - Use `console.log` for worker debugging

3. **Document Findings**:
   - Create GitHub issues for bugs
   - Update troubleshooting guide
   - Record workarounds if needed

---

## 📚 Reference Materials

### SQL Queries

**Reset Indexing Job** (if stuck):
```sql
UPDATE codebase_mapreduce_jobs
SET status = 'failed'
WHERE status = 'running';

DELETE FROM mapreduce_map_queue
WHERE status = 'pending';
```

**Clear All Data** (start fresh):
```sql
TRUNCATE TABLE codebase_embeddings CASCADE;
TRUNCATE TABLE codebase_files CASCADE;
TRUNCATE TABLE codebase_mapreduce_jobs CASCADE;
TRUNCATE TABLE mapreduce_map_queue CASCADE;
```

### Useful Commands

**Check Running Workers**:
```bash
ps aux | grep mapreduce-worker
```

**Monitor Ollama Logs**:
```bash
tail -f ~/.ollama/logs/server.log
```

**Database Connection Test**:
```bash
psql $DATABASE_URL -c "SELECT version();"
```

---

## 📝 Test Report Template

```markdown
# GPU Semantic Wiki Test Report

**Date**: YYYY-MM-DD
**Tester**: [Your Name]
**Environment**: Dev / Staging / Prod
**Database**: PostgreSQL 16.x
**Ollama**: v0.x.x
**GPU**: RTX 3060 Ti / Other

## Summary
- Total Tests: ____ / ____
- Passed: ____
- Failed: ____
- Skipped: ____

## Performance Results
- Indexing Throughput: ____ chunks/sec
- Search Latency: ____ ms
- Vector Search: ____ ms
- Search Relevance: ____ %

## Issues Found
1. [Issue description]
   - Severity: P0/P1/P2/P3
   - Steps to reproduce
   - Expected vs actual behavior

## Recommendations
- [Recommendation 1]
- [Recommendation 2]

## Sign-off
✅ System ready for production
❌ Blocking issues must be resolved
```

---

**Last Updated**: April 9, 2026
**Maintainer**: GPU Semantic Wiki Team
**Version**: 1.0
