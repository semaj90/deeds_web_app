# Manual Testing Guide: ACE Contextual Web Ingestion

**Task:** 6.3 - Manual Testing
**Estimated Time:** 3 hours
**Status:** Ready for execution

---

## Prerequisites

Before starting manual testing, ensure all services are running:

```bash
# Check service status
docker-compose ps

# Required services:
# - postgres (PostgreSQL 17 with pgvector)
# - qdrant (Vector database)
# - minio (Object storage)
# - rabbitmq (Message queue)
# - ollama (LLM service)
# - ace-web-worker (Python worker)
```

### Start Services (if not running)

```bash
# Start all services
docker-compose up -d postgres qdrant minio rabbitmq ollama

# Start the worker
cd backend/workers
python ace_web_worker.py
```

### Verify Service Health

```bash
# PostgreSQL
psql $DATABASE_URL -c "SELECT 1;"

# Qdrant
curl http://localhost:6333/collections

# MinIO
mc ls local/

# RabbitMQ
curl -u admin:admin http://localhost:15672/api/overview

# Ollama
curl http://localhost:11434/api/tags
```

---

## Test Scenario 1: Ingest URL and Verify Chunks

**Objective:** Test the complete ingestion pipeline from URL to database chunks

### Steps

1. **Trigger Ingestion**

```bash
curl -X POST http://localhost:5173/api/ace/web/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "urls": ["https://svelte.dev/docs/introduction"],
    "tags": ["manual-test", "svelte"],
    "priority": "high"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "jobIds": ["<uuid>"],
  "message": "Enqueued 1 jobs for processing"
}
```

2. **Monitor Worker Logs**

```bash
# Watch worker processing
docker-compose logs -f ace-web-worker

# Or if running locally:
tail -f worker.log
```

**Expected Log Output:**
- "Processing job <jobId>"
- "Crawl succeeded for https://svelte.dev/docs/introduction"
- "Stored raw HTML: crawl/<sourceId>/<timestamp>.html"
- "Stored clean markdown: crawl/<sourceId>/<timestamp>.md"
- "Created <N> chunks"
- "Generated embeddings for <N> chunks"
- "Stored chunks in Qdrant"
- "Job <jobId> completed successfully"

3. **Verify Database Records**

```sql
-- Check source was created
SELECT * FROM ace_sources
WHERE canonical_url = 'https://svelte.dev/docs/introduction';

-- Check document was created
SELECT d.*, s.canonical_url
FROM ace_docs d
JOIN ace_sources s ON d.source_id = s.id
WHERE s.canonical_url = 'https://svelte.dev/docs/introduction';

-- Check chunks were created
SELECT COUNT(*), MIN(chunk_index), MAX(chunk_index)
FROM ace_chunks c
JOIN ace_docs d ON c.doc_id = d.id
JOIN ace_sources s ON d.source_id = s.id
WHERE s.canonical_url = 'https://svelte.dev/docs/introduction';

-- Verify embeddings exist
SELECT COUNT(*)
FROM ace_chunks
WHERE embedding IS NOT NULL
AND doc_id IN (
  SELECT d.id FROM ace_docs d
  JOIN ace_sources s ON d.source_id = s.id
  WHERE s.canonical_url = 'https://svelte.dev/docs/introduction'
);
```

4. **Verify MinIO Storage**

```bash
# List raw HTML files
mc ls local/ace-web-raw/crawl/

# List cleaned markdown files
mc ls local/ace-web-raw/crawl/

# List chunks
mc ls local/ace-web-derived/chunks/

# List summaries
mc ls local/ace-web-derived/summary/
```

5. **Verify Qdrant Collection**

```bash
# Check collection stats
curl http://localhost:6333/collections/ace_chunks

# Search for a test query
curl -X POST http://localhost:6333/collections/ace_chunks/points/search \
  -H "Content-Type: application/json" \
  -d '{
    "vector": [0.1, 0.2, ...],  # Use actual embedding
    "limit": 5
  }'
```

### Success Criteria

- [x] Ingestion API returns success with job ID
- [x] Worker logs show successful processing
- [x] ace_sources table has new record
- [x] ace_docs table has new record
- [x] ace_chunks table has multiple chunks (typically 5-20)
- [x] All chunks have embeddings (embedding IS NOT NULL)
- [x] MinIO has raw HTML, markdown, chunks, and summary files
- [x] Qdrant collection has new points
- [x] No errors in logs

---

## Test Scenario 2: Query Context and Verify Hybrid Scoring

**Objective:** Test context retrieval with hybrid scoring (cosine + freshness + graph)

### Steps

1. **Query Context**

```bash
curl "http://localhost:5173/api/ace/context?query=Svelte%205%20runes&limit=10"
```

**Expected Response:**
```json
{
  "chunks": [
    {
      "id": "<uuid>",
      "text": "...",
      "score": 0.85,
      "metadata": {
        "url": "https://svelte.dev/docs/introduction",
        "domain": "svelte.dev",
        "fetchedAt": "2025-12-21T...",
        "heading": "Introduction"
      }
    }
  ],
  "entities": [...],
  "edges": [...],
  "summary": "Found 10 relevant chunks from 1 domains.",
  "totalResults": 15
}
```

2. **Verify Hybrid Scoring**

Check that scores are calculated correctly:

```javascript
// For each chunk, verify:
// score = 0.65 * cosine_sim + 0.10 * freshness_boost + 0.05 * graph_boost

// Freshness boost:
// - <7 days: +1.0
// - 7-30 days: +0.5
// - >30 days: +0.0

// Graph boost:
// - Entity match: +0.5
// - 1-hop neighbor: +0.25
```

3. **Verify Score Range**

```bash
# All scores should be between 0 and 1
# Scores should be sorted descending
# Top results should have score > 0.5 for relevant queries
```

4. **Test Different Queries**

```bash
# Relevant query (should return high scores)
curl "http://localhost:5173/api/ace/context?query=Svelte%20reactive%20state&limit=5"

# Irrelevant query (should return low scores or empty)
curl "http://localhost:5173/api/ace/context?query=quantum%20physics&limit=5"

# Query with filters
curl "http://localhost:5173/api/ace/context?query=Svelte&domain=svelte.dev&limit=5"
```

### Success Criteria

- [x] Context retrieval returns results
- [x] All scores are between 0 and 1
- [x] Scores are sorted in descending order
- [x] Relevant queries return scores > 0.5
- [x] Irrelevant queries return low scores or empty results
- [x] Filters work correctly (domain, date range, tags)
- [x] Response time < 2s (p95 latency target)
- [x] No errors in logs

---

## Test Scenario 3: Test Stale Context Detection

**Objective:** Verify that the system detects when all context is stale (>30 days old)

### Steps

1. **Create Old Test Data**

```sql
-- Insert a source with old timestamp
INSERT INTO ace_sources (canonical_url, domain, first_seen, last_crawled, crawl_status)
VALUES ('https://example.com/old-doc', 'example.com', NOW() - INTERVAL '60 days', NOW() - INTERVAL '60 days', 'ok')
RETURNING id;

-- Insert a doc with old timestamp
INSERT INTO ace_docs (source_id, fetched_at, minio_raw_key, minio_clean_key)
VALUES ('<source_id>', NOW() - INTERVAL '60 days', 'test/old.html', 'test/old.md')
RETURNING id;

-- Insert chunks with old metadata
INSERT INTO ace_chunks (doc_id, chunk_index, text, embedding, metadata)
VALUES (
  '<doc_id>',
  0,
  'Old content about Svelte',
  '[0.1, 0.2, ...]',  -- Use actual embedding
  '{"url": "https://example.com/old-doc", "fetchedAt": "2024-10-21T00:00:00Z", "domain": "example.com"}'::jsonb
);
```

2. **Query with ACE Adapter**

```typescript
import { AceAdapter } from '$lib/services/ace-web/ace-adapter';

const adapter = new AceAdapter();

const response = await adapter.processRequest({
  userRequest: 'How to use Svelte 5 runes?',
});

console.log('Context Quality:', response.metadata.contextQuality);
console.log('Tool Calls:', response.toolCalls);
```

3. **Verify Stale Detection**

**Expected Behavior:**
- `contextQuality` should be `'stale'`
- `toolCalls` should include `web_search` action
- `webSearchTriggered` should be `true`

### Success Criteria

- [x] System detects stale context (all chunks >30 days)
- [x] Context quality is assessed as 'stale'
- [x] Tool plan suggests web_search
- [x] Web search is triggered automatically
- [x] New URLs are enqueued for ingestion
- [x] Updated context is retrieved after ingestion

---

## Test Scenario 4: Test Insufficient Context Detection

**Objective:** Verify that the system detects when context is insufficient (<3 relevant chunks)

### Steps

1. **Query with Obscure Topic**

```typescript
const response = await adapter.processRequest({
  userRequest: 'How to fix error XYZ-999 in obscure-library v0.0.1?',
});

console.log('Context Quality:', response.metadata.contextQuality);
console.log('Relevant Chunks:', response.context.chunks.filter(c => c.score > 0.5).length);
```

2. **Verify Insufficient Detection**

**Expected Behavior:**
- Fewer than 3 chunks with score > 0.5
- `contextQuality` should be `'insufficient'`
- `toolCalls` should include `web_search` action
- `webSearchTriggered` should be `true`

### Success Criteria

- [x] System detects insufficient context (<3 relevant chunks)
- [x] Context quality is assessed as 'insufficient'
- [x] Tool plan suggests web_search with refined query
- [x] Web search is triggered automatically
- [x] Search results are enqueued for ingestion

---

## Test Scenario 5: Test Prompt Assembly

**Objective:** Verify that prompts are assembled correctly with all sections

### Steps

1. **Process Request with Full Context**

```typescript
const response = await adapter.processRequest({
  userRequest: 'Fix this TypeScript error',
  errorContext: {
    message: "Property 'foo' does not exist on type 'Bar'",
    filePath: 'src/test.ts',
    lineNumber: 42,
    code: 'const bar: Bar = {}; console.log(bar.foo);',
  },
  systemRules: 'Use TypeScript strict mode',
  projectRules: 'Follow Svelte 5 patterns',
});
```

2. **Verify Prompt Structure**

The prompt should include:
- System rules section
- Project rules section
- Retrieved context section
  - Summary
  - Relevant chunks with citations
  - Knowledge graph (entities + edges)
- User request section

3. **Check Prompt Content**

```typescript
// The prompt should contain:
// - "System Rules"
// - "Project Rules"
// - "Retrieved Context"
// - "Relevant Chunks"
// - "Knowledge Graph"
// - "User Request"
// - Error context details
// - Citations (URL, fetchedAt)
```

### Success Criteria

- [x] Prompt includes all required sections
- [x] System rules are included
- [x] Project rules are included
- [x] Retrieved chunks are formatted with citations
- [x] Knowledge graph is included (if available)
- [x] Error context is included in query
- [x] Prompt is within token budget (4000 tokens default)
- [x] LLM receives complete prompt

---

## Test Scenario 6: Test Worker Error Handling

**Objective:** Verify that the worker handles errors gracefully

### Test 6.1: Invalid URL

```bash
curl -X POST http://localhost:5173/api/ace/web/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "urls": ["not-a-valid-url"],
    "tags": ["error-test"]
  }'
```

**Expected Behavior:**
- Worker logs error
- Source status updated to 'error'
- Error logged to MinIO (ace-eval-logs)
- Worker continues processing other jobs

### Test 6.2: Rate Limit

```bash
# Enqueue many URLs from same domain
curl -X POST http://localhost:5173/api/ace/web/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://example.com/page1",
      "https://example.com/page2",
      "https://example.com/page3",
      ...
    ]
  }'
```

**Expected Behavior:**
- Worker respects rate limits (2s delay between requests)
- No 429 errors from target server
- All URLs processed eventually

### Test 6.3: Network Timeout

```bash
# Enqueue URL that times out
curl -X POST http://localhost:5173/api/ace/web/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "urls": ["https://httpstat.us/200?sleep=60000"],
    "tags": ["timeout-test"]
  }'
```

**Expected Behavior:**
- Worker times out after 30 seconds
- Error logged
- Source status updated to 'error'
- Worker continues with next job

### Test 6.4: Malformed HTML

```bash
# Enqueue URL with malformed HTML
curl -X POST http://localhost:5173/api/ace/web/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "urls": ["https://example.com/malformed.html"],
    "tags": ["malformed-test"]
  }'
```

**Expected Behavior:**
- Worker handles malformed HTML gracefully
- Cleaned markdown is still generated (best effort)
- No worker crash
- Job completes with warning

### Success Criteria

- [x] Invalid URLs are handled gracefully
- [x] Rate limits are respected
- [x] Network timeouts don't crash worker
- [x] Malformed HTML is handled
- [x] Errors are logged to MinIO
- [x] Source status is updated correctly
- [x] Worker continues processing after errors
- [x] No worker crashes

---

## Performance Verification

### Latency Targets

| Component | Target | Measurement |
|-----------|--------|-------------|
| Context Retrieval | <2s p95 | `curl` with `-w "@curl-format.txt"` |
| Web Search | <3s | Time from request to response |
| Ingestion | <30s | Time from enqueue to completion |
| LLM Generation | <10s | Time for Gemma3 response |
| End-to-End | <15s | Full ACE adapter flow |

### Measure Latency

```bash
# Create curl format file
cat > curl-format.txt << EOF
time_namelookup:  %{time_namelookup}s\n
time_connect:  %{time_connect}s\n
time_appconnect:  %{time_appconnect}s\n
time_pretransfer:  %{time_pretransfer}s\n
time_redirect:  %{time_redirect}s\n
time_starttransfer:  %{time_starttransfer}s\n
----------\n
time_total:  %{time_total}s\n
EOF

# Measure context retrieval
curl -w "@curl-format.txt" -o /dev/null -s \
  "http://localhost:5173/api/ace/context?query=Svelte%205&limit=10"
```

### Success Criteria

- [x] Context retrieval < 2s (p95)
- [x] Web search < 3s
- [x] Ingestion < 30s per URL
- [x] LLM generation < 10s
- [x] End-to-end < 15s

---

## Checklist

### Pre-Testing
- [ ] All services running (postgres, qdrant, minio, rabbitmq, ollama)
- [ ] Worker running (ace-web-worker)
- [ ] Database schema migrated
- [ ] MinIO buckets created
- [ ] Qdrant collection created

### Test Scenario 1: Ingestion
- [ ] URL ingestion successful
- [ ] Worker processes job
- [ ] Database records created
- [ ] MinIO files stored
- [ ] Qdrant points created
- [ ] No errors in logs

### Test Scenario 2: Context Retrieval
- [ ] Context query returns results
- [ ] Hybrid scoring correct
- [ ] Scores in valid range (0-1)
- [ ] Scores sorted descending
- [ ] Filters work correctly
- [ ] Latency < 2s

### Test Scenario 3: Stale Context
- [ ] Stale context detected
- [ ] Web search triggered
- [ ] New URLs enqueued
- [ ] Updated context retrieved

### Test Scenario 4: Insufficient Context
- [ ] Insufficient context detected
- [ ] Web search triggered
- [ ] Refined query used

### Test Scenario 5: Prompt Assembly
- [ ] All sections included
- [ ] Citations formatted correctly
- [ ] Token budget respected
- [ ] LLM receives prompt

### Test Scenario 6: Error Handling
- [ ] Invalid URLs handled
- [ ] Rate limits respected
- [ ] Timeouts handled
- [ ] Malformed HTML handled
- [ ] Errors logged
- [ ] Worker continues after errors

### Performance
- [ ] Context retrieval < 2s
- [ ] Web search < 3s
- [ ] Ingestion < 30s
- [ ] LLM generation < 10s
- [ ] End-to-end < 15s

---

## Troubleshooting

### Worker Not Processing Jobs

```bash
# Check RabbitMQ queue
curl -u admin:admin http://localhost:15672/api/queues/%2F/ace_web_ingest

# Check worker logs
docker-compose logs ace-web-worker

# Restart worker
docker-compose restart ace-web-worker
```

### Qdrant Connection Issues

```bash
# Check Qdrant health
curl http://localhost:6333/health

# Check collection
curl http://localhost:6333/collections/ace_chunks

# Recreate collection
curl -X DELETE http://localhost:6333/collections/ace_chunks
# Then restart worker to recreate
```

### MinIO Access Issues

```bash
# Check MinIO health
mc admin info local/

# List buckets
mc ls local/

# Check bucket policy
mc policy get local/ace-web-raw
```

### Database Connection Issues

```bash
# Check PostgreSQL
psql $DATABASE_URL -c "SELECT version();"

# Check pgvector extension
psql $DATABASE_URL -c "SELECT * FROM pg_extension WHERE extname = 'vector';"

# Check tables
psql $DATABASE_URL -c "\dt ace_*"
```

---

## Completion

Once all test scenarios pass and the checklist is complete, Task 6.3 is done!

**Next Steps:**
- Document any issues found
- Update STATUS.md
- Move to Phase 7: Documentation and Deployment
