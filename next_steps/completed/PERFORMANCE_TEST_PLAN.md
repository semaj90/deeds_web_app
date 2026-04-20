# Performance Testing Plan - Session 93r28c+++++
**Status**: SUPERSEDED — cache system redesigned (Bifrost L1/L2/L3). Test metrics obsolete. Archive candidate.

**Objective**: Verify cache performance + evidence pipeline scaling
**Duration**: 1 hour
**Date**: March 2, 2026

---

## Test Scenarios

### 1. Template Cache Warmup Verification (10 min)

**Goal**: Verify Priority #10 warmup creates 11 Redis keys on startup

**Steps**:
```bash
# 1. Clear all template keys
docker exec phase66-redis redis-cli DEL $(docker exec phase66-redis redis-cli KEYS "template:*")

# 2. Start dev server (triggers warmup)
cd sveltekit-frontend && npm run dev &

# 3. Wait 5 seconds for startup
sleep 5

# 4. Check warmup keys
docker exec phase66-redis redis-cli KEYS "template:*" | wc -l
# Expected: 11 keys (template:all:v1 + 10× template:meta:*:v1)

# 5. Verify TTL
docker exec phase66-redis redis-cli TTL "template:meta:charging_memo:v1"
# Expected: ~3600 seconds (1 hour)

# 6. Check console logs
grep "Template cache warmed" logs/dev-server.log
# Expected: [Boot] Template cache warmed (XXms) - cached 10 templates
```

**Success Criteria**:
- ✅ 11 keys created on startup
- ✅ All keys have 1-hour TTL
- ✅ Console shows warmup completion
- ✅ Warmup completes in <100ms

---

### 2. Report Template Caching Performance (15 min)

**Goal**: Verify Priority #9 AI content caching (98% latency reduction)

**Test Case 1: Cold Cache (MISS)**
```bash
# Generate report with AI (first request)
time curl -X POST http://localhost:5173/api/reports/generate-from-template \
  -H "Content-Type: application/json" \
  -H "Cookie: session=..." \
  -d '{
    "templateType": "charging_memo",
    "caseId": "test-case-001",
    "useAI": true,
    "caseData": {
      "title": "State v. Smith",
      "caseNumber": "CR-2024-1234",
      "defendant": "John Smith",
      "charges": ["Robbery", "Assault"]
    }
  }'

# Expected: ~5-10 seconds (Ollama API call)
# Log: [TemplateCache] MISS (AI): template:ai:charging_memo:test-case-001:v1
```

**Test Case 2: Warm Cache (HIT)**
```bash
# Same request (second time)
time curl -X POST http://localhost:5173/api/reports/generate-from-template \
  -H "Content-Type: application/json" \
  -H "Cookie: session=..." \
  -d '{
    "templateType": "charging_memo",
    "caseId": "test-case-001",
    "useAI": true,
    "caseData": {
      "title": "State v. Smith",
      "caseNumber": "CR-2024-1234",
      "defendant": "John Smith",
      "charges": ["Robbery", "Assault"]
    }
  }'

# Expected: ~50-100ms (cache hit, no Ollama call)
# Log: [TemplateCache] HIT (AI): template:ai:charging_memo:test-case-001:v1
```

**Metrics to Capture**:
| Metric | First Request (MISS) | Second Request (HIT) | Improvement |
|--------|---------------------|---------------------|-------------|
| Template fetch | ? | ? | ? |
| Ollama API call | ? | 0ms (skipped) | 100% |
| Total latency | ? | ? | ? |

**Success Criteria**:
- ✅ First request: 5-10s (AI generation)
- ✅ Second request: <100ms (cache hit)
- ✅ Improvement: ≥98%

---

### 3. Evidence Pipeline Scaling (20 min)

**Goal**: Verify 18x speedup from batch embedding (Priority #1c)

**Test Document**: California Constitution (400 pages)
- Source: `test-documents/california-constitution.pdf`
- Size: ~2MB
- Expected chunks: ~800 (400 pages × 2 chunks/page avg)

**Baseline Metrics** (from PIPELINE_SCALING_VERIFIED.md):
- Old serial processing: 800 chunks × 300ms = 240 seconds
- New batch processing: ~13 seconds (18x speedup)

**Test Steps**:
```bash
# 1. Prepare test file
curl -o test-documents/california-constitution.pdf \
  "https://leginfo.legislature.ca.gov/faces/codes_displayexpandedbranch.xhtml?tocCode=CONS" \
  # (or use existing test PDF)

# 2. Upload via API
time curl -X POST http://localhost:5173/api/evidence/upload \
  -H "Cookie: session=..." \
  -F "file=@test-documents/california-constitution.pdf" \
  -F "caseId=test-case-001"

# Expected: ~13-20 seconds end-to-end
# Breakdown:
# - MinIO upload: ~500ms
# - Text extraction: ~2-3s
# - Chunking: ~500ms
# - Batch embedding: ~10-13s (800 chunks ÷ 8/batch ÷ 3 concurrent)
# - Qdrant store: ~1s
# - Entity extraction: ~1-2s (parallel)
# - Summary generation: ~2-3s (non-blocking)

# 3. Monitor SSE progress
# Open browser to /evidence/upload
# Watch 8-stage progress bar:
# - uploading → hashing → storing → db-insert → embedding → complete
```

**Metrics to Capture**:
| Stage | Duration | Notes |
|-------|----------|-------|
| Upload (MinIO) | ? | Should be <1s |
| Text extraction | ? | OCR fallback if needed |
| Chunking | ? | 800 chunks expected |
| Embedding | ? | **Critical: should be ~10-13s** |
| Qdrant store | ? | Batch upsert |
| Entity extraction | ? | Parallel with embedding |
| Summary | ? | Non-blocking |
| **Total** | ? | **Target: <20s** |

**Success Criteria**:
- ✅ Total upload time: <20 seconds
- ✅ Embedding time: 10-15 seconds (18x faster than serial)
- ✅ All 8 stages complete successfully
- ✅ SSE progress updates in real-time

---

### 4. Cache Monitoring Dashboard (10 min)

**Goal**: Verify real-time stats + invalidation controls

**Test Steps**:
```bash
# 1. Open dashboard
open http://localhost:5173/admin/cache

# 2. Verify overview cards
# - Redis: Connected, >0 keys
# - Memory: >0 entries
# - Template: 11 keys (after warmup)
# - LLM: Hit rate displayed

# 3. Enable auto-refresh
# - Check "Auto-refresh (5s)"
# - Watch "Last update" timestamp change

# 4. Generate cache activity
# - Make 5 template generation requests
# - Watch AI content keys increase in real-time

# 5. Test manual invalidation
# - Click "Invalidate AI Content" button
# - Confirm dialog
# - Verify keys cleared in Redis section

# 6. Verify hit rate calculation
# - Initial hit rate: ~0% (all misses)
# - After repeat requests: >70%
```

**Metrics to Capture**:
| Metric | Initial | After Tests | Notes |
|--------|---------|-------------|-------|
| Redis total keys | ? | ? | Should increase with tests |
| Template keys | 11 | ? | Metadata + AI + rendered |
| LLM hit rate | 0% | ? | Should increase with repeat requests |
| Memory cache size | ? | ? | Process-local cache |

**Success Criteria**:
- ✅ Dashboard loads without errors
- ✅ Auto-refresh updates every 5 seconds
- ✅ Manual invalidation clears keys
- ✅ Hit rates calculate correctly

---

### 5. LLM Response Cache (10 min)

**Goal**: Verify Priority #7 semantic caching

**Test Steps**:
```bash
# 1. Clear LLM cache
docker exec phase66-redis redis-cli DEL $(docker exec phase66-redis redis-cli KEYS "llm:response:*")

# 2. Generate LLM response (first time)
time curl -X POST http://localhost:5173/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Cookie: session=..." \
  -d '{
    "message": "What are the elements of robbery?",
    "caseId": "test-case-001"
  }'

# Expected: ~3-5s (Ollama inference)
# Log: [LLMCache] MISS: Generating new response

# 3. Same query (second time)
time curl -X POST http://localhost:5173/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Cookie: session=..." \
  -d '{
    "message": "What are the elements of robbery?",
    "caseId": "test-case-001"
  }'

# Expected: ~50-100ms (cache hit)
# Log: [LLMCache] HIT: Using cached response

# 4. Verify semantic similarity
# Slightly different wording
time curl -X POST http://localhost:5173/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Cookie: session=..." \
  -d '{
    "message": "What elements constitute robbery?",
    "caseId": "test-case-001"
  }'

# Expected: If semantic cache works, should hit cache (~100ms)
# If semantic matching fails, will generate new response (~3-5s)
```

**Success Criteria**:
- ✅ First request: 3-5s (LLM inference)
- ✅ Exact match: <100ms (cache hit)
- ✅ Semantic similarity: <100ms (if implemented)

---

### 6. End-to-End Performance (15 min)

**Goal**: Full workflow from evidence upload → report generation

**Workflow**:
```
1. Upload 400-page PDF
   ↓
2. Wait for processing (SSE progress)
   ↓
3. Verify evidence in database
   ↓
4. Generate report from template (with AI)
   ↓
5. View report (cached template)
   ↓
6. Invalidate cache
   ↓
7. Re-generate report (cache miss)
```

**Test Steps**:
```bash
# 1. Upload evidence
EVIDENCE_ID=$(curl -X POST http://localhost:5173/api/evidence/upload \
  -H "Cookie: session=..." \
  -F "file=@test-documents/california-constitution.pdf" \
  -F "caseId=test-case-001" \
  | jq -r '.data.evidenceId')

echo "Evidence ID: $EVIDENCE_ID"

# 2. Wait for processing
sleep 20

# 3. Generate report (first time - cache miss)
REPORT_START=$(date +%s%3N)
REPORT_ID=$(curl -X POST http://localhost:5173/api/reports/generate-from-template \
  -H "Content-Type: application/json" \
  -H "Cookie: session=..." \
  -d "{
    \"templateType\": \"evidence_review\",
    \"caseId\": \"test-case-001\",
    \"useAI\": true,
    \"evidenceId\": \"$EVIDENCE_ID\"
  }" \
  | jq -r '.data.id')
REPORT_END=$(date +%s%3N)
REPORT_DURATION=$((REPORT_END - REPORT_START))

echo "Report generated in ${REPORT_DURATION}ms (cache MISS)"

# 4. Generate same report (second time - cache hit)
CACHED_START=$(date +%s%3N)
curl -X POST http://localhost:5173/api/reports/generate-from-template \
  -H "Content-Type: application/json" \
  -H "Cookie: session=..." \
  -d "{
    \"templateType\": \"evidence_review\",
    \"caseId\": \"test-case-001\",
    \"useAI\": true,
    \"evidenceId\": \"$EVIDENCE_ID\"
  }"
CACHED_END=$(date +%s%3N)
CACHED_DURATION=$((CACHED_END - CACHED_START))

echo "Report generated in ${CACHED_DURATION}ms (cache HIT)"

# 5. Calculate improvement
IMPROVEMENT=$((100 - (CACHED_DURATION * 100 / REPORT_DURATION)))
echo "Cache improvement: ${IMPROVEMENT}%"
```

**Success Criteria**:
- ✅ Evidence upload: <20s
- ✅ Report generation (first): 5-10s
- ✅ Report generation (cached): <100ms
- ✅ Cache improvement: ≥98%

---

## Performance Metrics Summary

### Expected Results

| Component | Metric | Target | Actual | Status |
|-----------|--------|--------|--------|--------|
| **Template Warmup** | Startup keys | 11 | ? | ⏹️ |
| **Template Warmup** | Warmup duration | <100ms | ? | ⏹️ |
| **Template Cache** | First request | 5-10s | ? | ⏹️ |
| **Template Cache** | Cache hit | <100ms | ? | ⏹️ |
| **Template Cache** | Improvement | ≥98% | ? | ⏹️ |
| **Evidence Pipeline** | 400-page upload | <20s | ? | ⏹️ |
| **Evidence Pipeline** | Embedding time | 10-15s | ? | ⏹️ |
| **Evidence Pipeline** | Speedup vs serial | 18x | ? | ⏹️ |
| **LLM Response Cache** | First request | 3-5s | ? | ⏹️ |
| **LLM Response Cache** | Cache hit | <100ms | ? | ⏹️ |
| **Dashboard** | Load time | <1s | ? | ⏹️ |
| **Dashboard** | Auto-refresh | 5s interval | ? | ⏹️ |

---

## Test Environment

### Prerequisites

```bash
# 1. Services running
docker ps | grep -E "redis|postgres|qdrant|minio|rabbitmq"
# All should show "Up" status

# 2. Dev server running
cd sveltekit-frontend && npm run dev

# 3. Test document available
ls -lh test-documents/california-constitution.pdf
# Expected: ~2MB PDF

# 4. Session cookie (admin user)
# Login via browser, copy session cookie from DevTools
```

### Environment Status

| Service | Port | Status | Notes |
|---------|------|--------|-------|
| Redis | 6379 | ? | Cache layer |
| Postgres | 5434 | ? | Database |
| Qdrant | 6333 | ? | Vector search |
| MinIO | 9000 | ? | Object storage |
| RabbitMQ | 5672 | ? | Message queue |
| Ollama | 11434 | ? | LLM inference |
| Dev Server | 5173 | ? | SvelteKit |

---

## Test Execution Log

### Session Start
- Date: March 2, 2026
- Time: [TIMESTAMP]
- Tester: Claude Sonnet 4.5
- Session: 93r28c+++++

### Pre-Test Checks
- [ ] All Docker services running
- [ ] Dev server started
- [ ] Test document available
- [ ] Session cookie obtained
- [ ] Redis cleared (fresh state)

### Test Results

#### 1. Template Cache Warmup
- Warmup keys: ? / 11 expected
- Warmup duration: ? / <100ms target
- TTL verified: ⏹️
- Console logs: ⏹️

#### 2. Report Template Caching
- First request (MISS): ? / 5-10s target
- Second request (HIT): ? / <100ms target
- Improvement: ? / ≥98% target

#### 3. Evidence Pipeline
- Upload time: ? / <20s target
- Embedding time: ? / 10-15s target
- Total chunks: ? / ~800 expected
- SSE progress: ⏹️

#### 4. Cache Dashboard
- Dashboard load: ⏹️
- Auto-refresh: ⏹️
- Invalidation: ⏹️
- Hit rates: ⏹️

#### 5. LLM Response Cache
- First request: ? / 3-5s target
- Cache hit: ? / <100ms target
- Semantic match: ⏹️

#### 6. End-to-End
- Total workflow: ? / <30s target
- Cache improvement: ? / ≥98% target

---

## Issues Encountered

### Blockers
(List any critical issues that prevent testing)

### Warnings
(List non-critical issues or deviations from expected behavior)

### Notes
(Observations, insights, or recommendations)

---

## Recommendations

Based on test results, recommend:

1. **Performance Tuning**:
   - [ ] Adjust batch size if embedding too slow
   - [ ] Increase Redis memory if hit rates low
   - [ ] Optimize cache TTLs based on actual usage

2. **Infrastructure**:
   - [ ] Add cache preloading for high-traffic templates
   - [ ] Implement cache compression for large responses
   - [ ] Add Prometheus metrics for monitoring

3. **Documentation**:
   - [ ] Update performance benchmarks in README
   - [ ] Document optimal cache configuration
   - [ ] Create runbook for cache troubleshooting

---

## Success Criteria Summary

**Test PASSES if**:
- ✅ Template warmup creates 11 keys in <100ms
- ✅ Template cache hit <100ms (98% improvement)
- ✅ Evidence upload <20s for 400-page PDF
- ✅ Cache dashboard loads and refreshes correctly
- ✅ All services healthy and responsive

**Test FAILS if**:
- ❌ Any service down or unreachable
- ❌ Evidence upload >30s
- ❌ Cache hit rate <50%
- ❌ Dashboard errors or crashes

---

**Prepared By**: Claude Sonnet 4.5
**Session**: 93r28c+++++
**Status**: Ready for Execution
