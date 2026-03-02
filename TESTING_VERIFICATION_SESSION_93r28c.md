# Testing & Verification — Session 93r28c+++

**Date**: March 2, 2026
**Priorities Tested**: #9, #3, #2, #8, #7

---

## Test Plan Overview

This document provides test procedures for the 5 completed priorities:

1. **Priority #9**: Report Template Caching (Redis-backed)
2. **Priority #3**: Evidence Upload Progress (SSE real-time)
3. **Priority #2**: Qdrant Collection Health (auto-create + validation)
4. **Priority #8**: Cache Invalidation Strategy (multi-tier)
5. **Priority #7**: LLM Response Semantic Cache

---

## 1. Priority #9: Report Template Caching

### Manual Testing Procedure

**Test 1.1: Template Metadata Caching**
```bash
# Start dev server
npm run dev

# Test endpoint (manual cURL or browser)
curl -X POST http://localhost:5173/api/reports/generate-from-template \
  -H "Content-Type: application/json" \
  -d '{
    "templateType": "charging_memo",
    "caseId": "test-case-id",
    "useAI": false
  }'

# Expected: First request should log "[TemplateCache] MISS: template:meta:charging_memo:v1"
# Second identical request should log "[TemplateCache] HIT: template:meta:charging_memo:v1"
```

**Test 1.2: AI Content Caching (with Ollama)**
```bash
# Prerequisites: Ollama running with gemma3-legal:latest model

curl -X POST http://localhost:5173/api/reports/generate-from-template \
  -H "Content-Type: application/json" \
  -d '{
    "templateType": "charging_memo",
    "caseId": "test-case-id-2",
    "useAI": true
  }'

# Expected:
# - First request: ~5-10 seconds (Ollama call), logs "[TemplateCache] MISS (AI): ..."
# - Second request: ~50-100ms, logs "[TemplateCache] HIT (AI): ..."
# - Performance improvement: 98%+
```

**Test 1.3: Cache Invalidation (Integration with Priority #8)**
```bash
# Step 1: Generate cached report
curl -X POST http://localhost:5173/api/reports/generate-from-template \
  -H "Content-Type: application/json" \
  -d '{"templateType": "charging_memo", "caseId": "test-case-id-2", "useAI": true}'

# Step 2: Update the case (should invalidate template cache)
curl -X PATCH http://localhost:5173/api/cases/test-case-id-2 \
  -H "Content-Type: application/json" \
  -d '{"title": "Updated Case Title"}'

# Step 3: Generate report again (should be cache MISS)
curl -X POST http://localhost:5173/api/reports/generate-from-template \
  -H "Content-Type: application/json" \
  -d '{"templateType": "charging_memo", "caseId": "test-case-id-2", "useAI": true}'

# Expected: Third request shows cache MISS (cache was invalidated by case update)
```

**Test 1.4: Redis Verification**
```bash
# Connect to Redis
docker exec -it phase66-redis redis-cli

# Check template keys exist
KEYS template:*

# Expected output (example):
# 1) "template:meta:charging_memo:v1"
# 2) "template:all:v1"
# 3) "template:ai:charging_memo:test-case-id-2:v1"

# Get a cached template
GET "template:meta:charging_memo:v1"

# Expected: JSON object with template metadata

# Check TTL (should be ~3600 for metadata, ~1800 for AI, ~900 for rendered)
TTL "template:meta:charging_memo:v1"
TTL "template:ai:charging_memo:test-case-id-2:v1"
```

**Test 1.5: Cache Statistics**
```bash
# Add this endpoint temporarily to test stats
# GET /api/cache/template-stats
# Returns: { totalKeys, metadataKeys, aiContentKeys, renderedKeys }
```

### Expected Results
- ✅ First template request: MISS + cache write
- ✅ Second template request: HIT + fast response
- ✅ AI content cached for 30 minutes
- ✅ Template metadata cached for 1 hour
- ✅ Case update invalidates template caches
- ✅ Redis keys have correct TTL values

---

## 2. Priority #3: Evidence Upload Progress

### Manual Testing Procedure

**Test 2.1: Component Integration**
```bash
# Navigate to evidence upload page
http://localhost:5173/evidence/upload

# Steps:
1. Select or drag-drop a PDF file
2. Observe progress component appears
3. Verify 8 stages display in timeline
4. Verify connection status indicator (green = connected)
5. Wait for upload to complete
6. Verify "View Evidence" link appears
7. Verify "Upload Another File" button appears
```

**Test 2.2: SSE Connection**
```bash
# Browser DevTools → Network tab → Filter: EventSource

# Upload a file and observe SSE messages:
# Expected SSE events:
{
  "event": "progress",
  "data": {
    "progress": 25,
    "step": "hashing",
    "message": "Computing file hash..."
  }
}

# Stages should progress: uploading → hashing → storing → db-insert → embedding → complete
```

**Test 2.3: Error Handling & Retry**
```bash
# Test 1: Stop backend during upload
# Expected: Component shows "Connection lost - Reconnecting..." and retries

# Test 2: Cause upload failure (invalid file type, etc.)
# Expected: Progress moves to "error" stage, shows error message, provides retry button
```

**Test 2.4: Visual Verification**
- ✅ Timeline shows 8 stages with icons
- ✅ Current stage has pulsing animation
- ✅ Completed stages show green checkmark
- ✅ Progress percentage updates (0% → 100%)
- ✅ Connection status indicator (top-right corner)
- ✅ Stage-specific colors match design
- ✅ Error state shows red X icon

### Expected Results
- ✅ SSE connection establishes automatically
- ✅ Progress updates in real-time
- ✅ Auto-retry on connection loss (3 attempts, 2s/4s/6s delays)
- ✅ Completion actions appear when done
- ✅ Component cleans up on unmount
- ✅ No memory leaks (EventSource closed properly)

---

## 3. Priority #2: Qdrant Collection Health

### Manual Testing Procedure

**Test 3.1: Server Startup Auto-Init**
```bash
# Stop server
# Clear console
# Start server with: npm run dev

# Check console logs for:
# [Qdrant Init] Checking Qdrant health...
# [Qdrant Init] Health report: { healthy: true, collections: [...], ... }
# [Qdrant Init] All collections ready

# If collections missing:
# [Qdrant Init] Creating missing collections: [...]
# [Qdrant Init] Created collection: legal_documents
```

**Test 3.2: Health Check Endpoint**
```bash
# GET /api/health/qdrant
curl http://localhost:5173/api/health/qdrant

# Expected response:
{
  "healthy": true,
  "collections": [
    { "name": "legal_documents", "exists": true, "vectorCount": 1234, "schemaValid": true },
    { "name": "legal_cases", "exists": true, "vectorCount": 567, "schemaValid": true },
    { "name": "evidence_items", "exists": true, "vectorCount": 890, "schemaValid": true },
    { "name": "chat_messages", "exists": true, "vectorCount": 345, "schemaValid": true },
    { "name": "embedding_cache", "exists": true, "vectorCount": 2000, "schemaValid": true },
    { "name": "document_tags", "exists": true, "vectorCount": 150, "schemaValid": true },
    { "name": "topic_clusters", "exists": true, "vectorCount": 15, "schemaValid": true },
    { "name": "llm_response_cache", "exists": true, "vectorCount": 500, "schemaValid": true }
  ],
  "totalVectors": 5701,
  "missingCollections": [],
  "schemaIssues": [],
  "latencyMs": 45
}
```

**Test 3.3: Auto-Repair (Missing Collection)**
```bash
# Manually delete a collection in Qdrant
docker exec -it phase66-qdrant curl -X DELETE http://localhost:6333/collections/document_tags

# Trigger repair
curl -X POST http://localhost:5173/api/health/qdrant?repair=true

# Expected:
# - Response includes "repaired": true
# - Collection recreated with correct schema (768-dim, Cosine, INT8 quantization)
# - Console logs: [QdrantHealth] Creating collection: document_tags
```

**Test 3.4: Schema Validation**
```bash
# Check collection info directly in Qdrant
docker exec -it phase66-qdrant curl http://localhost:6333/collections/legal_documents

# Expected response includes:
{
  "result": {
    "config": {
      "params": {
        "vectors": {
          "content": { "size": 768, "distance": "Cosine" },
          "summary": { "size": 768, "distance": "Cosine" }
        }
      }
    },
    "quantization_config": {
      "scalar": { "type": "int8", "quantile": 0.99, "always_ram": true }
    }
  }
}
```

**Test 3.5: Graceful Degradation (Qdrant Down)**
```bash
# Stop Qdrant container
docker stop phase66-qdrant

# Restart server: npm run dev

# Expected:
# - Server continues to start (non-blocking)
# - Console logs: [Qdrant Init] Qdrant unavailable, skipping initialization
# - /api/health/capabilities shows qdrant: { healthy: false, ... }
# - Application still functional (falls back gracefully)

# Restart Qdrant
docker start phase66-qdrant
```

### Expected Results
- ✅ All 8 collections exist on startup
- ✅ Schema validation passes (768-dim, Cosine, INT8)
- ✅ Missing collections auto-created
- ✅ Schema issues detected and reported
- ✅ Health endpoint responds < 100ms
- ✅ Server continues if Qdrant down

---

## 4. Priority #8: Cache Invalidation Strategy

### Manual Testing Procedure

**Test 4.1: Pattern-Based Invalidation**
```bash
# Connect to Redis
docker exec -it phase66-redis redis-cli

# Populate cache with test keys
SET "report:abc123:full" "test data 1"
SET "report:abc123:summary" "test data 2"
SET "case:xyz789:details" "test data 3"

# Trigger invalidation (via case update)
curl -X PATCH http://localhost:5173/api/cases/xyz789 \
  -H "Content-Type: application/json" \
  -d '{"title": "Updated Title"}'

# Check keys were deleted
KEYS report:*
KEYS case:xyz789:*

# Expected: All matching keys removed
```

**Test 4.2: Multi-Tier Invalidation**
```bash
# Test that invalidation clears:
# 1. Memory cache (in-process Map)
# 2. Redis
# 3. RabbitMQ message published

# Steps:
1. Create a report (populates all cache tiers)
2. Update the report (triggers invalidation)
3. Check console logs for:
   - [CacheInvalidation] Invalidating pattern: report:abc123:*
   - [CacheInvalidation] Removed X keys from Redis
   - [CacheInvalidation] Published to RabbitMQ: cache.invalidate

# Expected: All 3 tiers invalidated
```

**Test 4.3: Endpoint Integration (7 CRUD APIs)**
```bash
# Test each endpoint triggers cache invalidation:

# 1. Reports PATCH
curl -X PATCH http://localhost:5173/api/reports/report-id -d '{"title":"New"}'
# Expected log: [CacheInvalidation] Invalidating REPORT report-id

# 2. Cases PATCH
curl -X PATCH http://localhost:5173/api/cases/case-id -d '{"title":"New"}'
# Expected log: [CacheInvalidation] Invalidating CASE case-id

# 3. Evidence POST
curl -X POST http://localhost:5173/api/evidence/upload -F "file=@test.pdf"
# Expected log: [CacheInvalidation] Invalidating EVIDENCE evidence-id

# 4. Citations POST
curl -X POST http://localhost:5173/api/citations -d '{"text":"Test"}'
# Expected log: [CacheInvalidation] Invalidating CITATION citation-id

# ... repeat for DELETE endpoints
```

**Test 4.4: Non-Blocking Behavior**
```bash
# Stop RabbitMQ to simulate message queue failure
docker stop phase66-rabbitmq

# Update a case (should still succeed)
curl -X PATCH http://localhost:5173/api/cases/xyz789 \
  -H "Content-Type: application/json" \
  -d '{"title": "Updated Title"}'

# Expected:
# - API returns 200 OK (not 500)
# - Console shows warning: [CacheInvalidation] RabbitMQ publish failed: ...
# - Memory + Redis invalidation still works
# - Server continues normally

# Restart RabbitMQ
docker start phase66-rabbitmq
```

**Test 4.5: RabbitMQ Message Format**
```bash
# Start RabbitMQ management UI
# http://localhost:15672 (guest/guest)

# Navigate to Queues → cache.invalidate

# Trigger an invalidation, check message payload:
{
  "type": "case_update",
  "pattern": "case:xyz789:*",
  "userId": "user-uuid",
  "metadata": {
    "caseId": "xyz789",
    "timestamp": "2026-03-02T12:34:56.789Z"
  }
}
```

### Expected Results
- ✅ Pattern-based key deletion works
- ✅ All 3 tiers invalidated (Memory, Redis, RabbitMQ)
- ✅ 7 CRUD endpoints auto-invalidate
- ✅ Non-blocking (server continues on cache errors)
- ✅ RabbitMQ messages published correctly
- ✅ No 500 errors on cache failures

---

## 5. Priority #7: LLM Response Semantic Cache

### Manual Testing Procedure

**Test 5.1: Semantic Cache Hit**
```bash
# Send first query
curl -X POST http://localhost:5173/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is probable cause?"}'

# Send semantically similar query (should hit cache)
curl -X POST http://localhost:5173/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Explain probable cause to me"}'

# Expected:
# - Second response much faster (~50ms vs 5000ms)
# - Response metadata includes: "cacheHit": true, "similarity": 0.92
```

**Test 5.2: Cache Miss (Dissimilar Query)**
```bash
# Send completely different query
curl -X POST http://localhost:5173/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the weather today?"}'

# Expected:
# - Full LLM inference (slower)
# - Response metadata: "cacheHit": false
# - New cache entry created
```

**Test 5.3: Redis Cache Structure**
```bash
docker exec -it phase66-redis redis-cli

# Check cache keys
KEYS llm:response:*

# Get a cached response
GET "llm:response:abc123def456"

# Expected JSON structure:
{
  "query": "What is probable cause?",
  "response": "Probable cause is...",
  "embedding": [0.123, 0.456, ...],  // 768-dim array
  "model": "gemma3-legal:latest",
  "timestamp": "2026-03-02T12:34:56Z",
  "tokenCount": 150
}

# Check TTL (should be 3600 = 1 hour)
TTL "llm:response:abc123def456"
```

**Test 5.4: Similarity Threshold**
```bash
# Test edge cases near 0.85 threshold

# Highly similar (> 0.85) → should HIT
"What is probable cause?" vs "Explain probable cause"

# Moderately similar (0.70-0.84) → should MISS
"What is probable cause?" vs "Define reasonable suspicion"

# Different (< 0.70) → should MISS
"What is probable cause?" vs "How to file a motion?"
```

### Expected Results
- ✅ Semantically similar queries hit cache
- ✅ Similarity threshold 0.85 works correctly
- ✅ Cache TTL = 1 hour
- ✅ 768-dim embeddings stored in Redis
- ✅ Cache hit provides 98% latency reduction
- ✅ Response metadata includes cache status

---

## Integration Tests

### Test I.1: Full Workflow (Report Generation with Caching)
```bash
# 1. Upload evidence (Priority #3 progress tracking)
# 2. Evidence triggers cache population
# 3. Generate report with AI (Priority #9 template cache)
# 4. AI query hits LLM cache (Priority #7)
# 5. Update case (Priority #8 invalidates all related caches)
# 6. Generate report again (cache miss, fresh generation)
# 7. Verify Qdrant collections healthy (Priority #2)
```

### Test I.2: Error Resilience
```bash
# Stop all optional services:
docker stop phase66-rabbitmq phase66-qdrant

# Verify app still works:
# - Evidence upload works (degrades to sync)
# - Report generation works (no cache, direct Ollama)
# - Case updates work (skip RabbitMQ publish)
# - Health endpoint shows degraded state

# Restart services:
docker start phase66-rabbitmq phase66-qdrant

# Verify recovery:
# - Next requests use cache again
# - Qdrant auto-initializes on reconnect
```

---

## Performance Benchmarks

### Expected Performance Improvements

| Operation | Before | After (Cache HIT) | Improvement |
|-----------|--------|------------------|-------------|
| Template metadata fetch | 5-10ms | 2-3ms | 60-70% |
| AI report generation | 5-10s | 50-100ms | 98% |
| Rendered template | 50-100ms | 10-20ms | 70-80% |
| LLM response (semantic match) | 3-8s | 50-100ms | 98% |
| Qdrant health check | N/A | <100ms | N/A |
| Cache invalidation | N/A | <50ms | N/A |

---

## Checklist: All Tests

### Priority #9 (Report Template Caching)
- [ ] Template metadata caching (1h TTL)
- [ ] AI content caching (30m TTL)
- [ ] Rendered template caching (15m TTL)
- [ ] Cache hit/miss logging works
- [ ] Redis keys have correct TTL
- [ ] Cache invalidation on case update
- [ ] Performance improvement 70-98%

### Priority #3 (Evidence Upload Progress)
- [ ] SSE connection establishes
- [ ] 8 stages display correctly
- [ ] Progress updates in real-time
- [ ] Auto-retry on connection loss
- [ ] Completion actions appear
- [ ] Component cleans up properly
- [ ] No memory leaks

### Priority #2 (Qdrant Collection Health)
- [ ] Server startup auto-init works
- [ ] All 8 collections created/verified
- [ ] Schema validation passes
- [ ] Auto-repair creates missing collections
- [ ] Graceful degradation when Qdrant down
- [ ] Health endpoint responds fast (<100ms)

### Priority #8 (Cache Invalidation)
- [ ] Pattern-based key deletion works
- [ ] Multi-tier invalidation (Memory+Redis+RabbitMQ)
- [ ] 7 CRUD endpoints auto-invalidate
- [ ] Non-blocking error handling
- [ ] RabbitMQ messages published
- [ ] No 500 errors on failures

### Priority #7 (LLM Response Cache)
- [ ] Semantic similarity matching works
- [ ] Cache hit on similar queries
- [ ] Cache miss on different queries
- [ ] 0.85 similarity threshold correct
- [ ] 1-hour TTL enforced
- [ ] Performance improvement 98%

### Integration
- [ ] Full evidence→report workflow
- [ ] Error resilience (services down)
- [ ] Service recovery works
- [ ] No breaking changes to existing features

---

## Next Steps After Testing

1. **If all tests pass**: Document results, update MEMORY.md, choose next priority
2. **If tests fail**: Debug issues, fix bugs, re-test
3. **Performance issues**: Profile slow operations, optimize cache keys
4. **Documentation**: Update API docs with cache behavior

---

**Testing Started**: [Pending]
**Testing Completed**: [Pending]
**Overall Status**: ⏳ Ready for Manual Testing
