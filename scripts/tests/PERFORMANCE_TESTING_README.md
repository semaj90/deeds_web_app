# Performance Testing Suite — README

Automated Playwright tests for validating all 5 cache layers in the Deeds Web App.

---

## Quick Start

### Prerequisites

1. **Dev server running**:
   ```bash
   cd sveltekit-frontend && npm run dev
   ```

2. **Docker services UP**:
   ```bash
   docker ps | grep phase66
   # Should show: postgres, redis, qdrant, rabbitmq, minio, couchdb
   ```

3. **Ollama running** (for LLM tests):
   ```bash
   curl http://localhost:11434/api/tags
   # Should list gemma3-legal model
   ```

### Run All Tests

**Linux/Mac**:
```bash
bash scripts/tests/run-performance-tests.sh
```

**Windows**:
```cmd
scripts\tests\run-performance-tests.bat
```

**Direct Playwright**:
```bash
npx playwright test scripts/tests/performance-cache.spec.ts
```

---

## Test Suite Overview

### Test 1: Template Cache Warmup ✅ (Already Passed)
**Status**: Completed in previous session
**Result**: 11 Redis keys verified, correct 1-hour TTL

### Test 2: Report Template Caching
**Target**: 98% latency reduction on cache hits
**Method**: Generate report twice, measure timing
**Expected**:
- First request: 5-10s (Ollama generation)
- Second request: <100ms (cache hit)
- Improvement: ≥90%

### Test 2B: Report Export Caching (NEW)
**Target**: 90-98% latency reduction on export cache hits
**Method**: Export report as HTML twice, check X-Cache-Status headers
**Expected**:
- First request: 100-500ms (HTML generation)
- Second request: 5-10ms (cache hit)
- X-Cache-Status: MISS → HIT
- Improvement: ≥85%

### Test 3: Evidence Pipeline Scaling
**Target**: <20 seconds for large PDF processing
**Method**: Upload 400-page PDF, monitor SSE progress
**Expected**:
- Batch embedding: 10-15s
- Total pipeline: <20s
- All 8 stages complete

**Note**: Requires `scripts/tests/fixtures/test-large.pdf` (400+ pages)

### Test 4: Cache Dashboard UI
**Target**: All 5 cache layers visible, auto-refresh working
**Method**: Navigate to `/admin/cache`, verify UI elements
**Expected**:
- 5 overview cards (Redis, Memory, Template, Export, LLM)
- 4+ detailed cache sections
- Auto-refresh enabled by default
- Export cache format breakdown visible

### Test 5: LLM Response Cache
**Target**: Semantic matching, <100ms on hits
**Method**: Send identical query twice to /api/chat
**Expected**:
- First request: 3-5s (Ollama inference)
- Second request: <200ms (cache hit)
- Responses identical

### Test 6: End-to-End Workflow
**Target**: <30 seconds total workflow time
**Method**: Create case → Upload evidence → Generate report → Generate cached report
**Expected**:
- Case creation: <1s
- Evidence upload: <5s
- Report generation: <10s
- Cached report: <100ms
- Total: <30s

---

## Test Configuration

### Authentication

Tests use default credentials:
```typescript
email: 'admin@example.com'
password: 'password123'
```

**To customize**: Edit `login()` function in `performance-cache.spec.ts`

### Base URL

Default: `http://localhost:5173`

**To customize**: Set `BASE_URL` constant in test file

### Timeouts

Default: 60 seconds per test

**To customize**: Add `--timeout=120000` flag (in milliseconds)

---

## Results

### JSON Output

Results saved to: `scripts/tests/performance-results/performance-results-{timestamp}.json`

**Format**:
```json
{
  "timestamp": "2026-03-02T...",
  "totalTests": 6,
  "passed": 5,
  "failed": 1,
  "results": [
    {
      "test": "Test 2: Report Template Caching",
      "timestamp": "...",
      "metrics": {
        "firstRequestMs": 7234,
        "secondRequestMs": 87,
        "improvement": "98.8%",
        "status": "PASS"
      },
      "success": true
    }
  ]
}
```

### Markdown Update

Results automatically update: `PERFORMANCE_TEST_RESULTS.md`

Status changes from `⏹️ PENDING` → `✅ PASS` or `❌ FAIL`

---

## Troubleshooting

### Error: "No session cookie found after login"

**Cause**: Login form selectors don't match actual form
**Fix**: Update selectors in `login()` function:
```typescript
await page.fill('input[name="email"]', '...');  // Check actual selector
await page.fill('input[name="password"]', '...');
```

### Error: "Cannot connect to localhost:5173"

**Cause**: Dev server not running
**Fix**: Start dev server:
```bash
cd sveltekit-frontend && npm run dev
```

### Error: "test-large.pdf not found"

**Cause**: Test 3 requires large PDF fixture
**Fix**: Either:
1. Create `scripts/tests/fixtures/test-large.pdf` (400+ pages)
2. Test will auto-skip if file missing

### Error: "Ollama connection refused"

**Cause**: Ollama not running or gemma3-legal not loaded
**Fix**:
```bash
# Check Ollama
curl http://localhost:11434/api/tags

# Pull model if missing
ollama pull gemma3-legal
```

### Error: "Docker service not running"

**Cause**: Required Docker containers DOWN
**Fix**:
```bash
# Start all services
docker-compose up -d

# Or start specific service
docker start phase66-postgres
docker start phase66-redis
```

---

## Performance Targets

| Test | Target | Priority | Status |
|------|--------|----------|--------|
| Test 1 | Warmup verified | #10 | ✅ PASS |
| Test 2 | ≥90% improvement | #9 | ⏹️ Pending |
| Test 2B | ≥85% improvement | Option #3 | ⏹️ Pending |
| Test 3 | <20s pipeline | Batch embed | ⏹️ Pending |
| Test 4 | 5 layers visible | BONUS | ⏹️ Pending |
| Test 5 | <200ms cache hit | #7 | ⏹️ Pending |
| Test 6 | <30s total | Integration | ⏹️ Pending |

---

## CI/CD Integration

### GitHub Actions (Example)

```yaml
name: Performance Tests

on:
  push:
    branches: [main]
  schedule:
    - cron: '0 0 * * *'  # Daily

jobs:
  performance:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
      redis:
        image: redis:7
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Start dev server
        run: npm run dev &
        working-directory: sveltekit-frontend

      - name: Wait for server
        run: npx wait-on http://localhost:5173

      - name: Run performance tests
        run: npx playwright test scripts/tests/performance-cache.spec.ts

      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: performance-results
          path: scripts/tests/performance-results/
```

---

## Extending Tests

### Add New Test

1. Create new test function:
   ```typescript
   test('Test 7: My Custom Test', async ({ page }) => {
     // Test logic
   });
   ```

2. Follow existing pattern:
   - Create `PerformanceResult` object
   - Measure request timing with `measureRequest()`
   - Log progress with `console.log`
   - Assert expectations
   - Push result to `results[]`

3. Update expected targets in README

---

## References

- **Test Plan**: [PERFORMANCE_TEST_PLAN.md](../../PERFORMANCE_TEST_PLAN.md)
- **Test Results**: [PERFORMANCE_TEST_RESULTS.md](../../PERFORMANCE_TEST_RESULTS.md)
- **Cache Integration**: [EXPORT_CACHE_INTEGRATION_COMPLETE.md](../../EXPORT_CACHE_INTEGRATION_COMPLETE.md)
- **Playwright Docs**: https://playwright.dev/

---

**Created**: March 2, 2026
**Session**: 93r28c+++++
**Status**: Ready for execution
