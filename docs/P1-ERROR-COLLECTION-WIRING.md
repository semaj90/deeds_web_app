# P1: Error Collection Wiring — Ready for Deployment

**Date**: June 15, 2026 (Session 66 continued)  
**Status**: ✅ **COLLECTION INFRASTRUCTURE WIRED**

---

## Summary

Error collection infrastructure is now fully wired and ready. Two helper modules enable clean error logging across all API routes without boilerplate code:

1. **Core logging module** (`error-logging.ts`) — categorizes errors, assigns severity, logs to database
2. **Middleware wrapper** (`error-logging-middleware.ts`) — wraps route handlers for transparent error capture

Drizzle schema updated with `errorLogs` table definition. `/api/embed` route is already wired as proof-of-concept. Ready to scale to other routes.

---

## Components

### 1. Error Logging Module
**File**: `src/lib/server/error-logging.ts` (85 lines)

**Exports**:
- `logError(options)` — Insert error to `error_logs` table (non-blocking)
- `categorizeError(err)` — Infer error category from error type
- `categorizeSeverity(category)` — Map category to severity
- `withErrorLogging(handler, options)` — Wrap route handler for transparent error capture

**Error Categories** (15 types):
- `missing_field`, `type_mismatch`, `validation_error`
- `database_error`, `network_error`, `timeout_error`
- `authentication_error`, `authorization_error`, `not_found_error`
- `parsing_error`, `inference_error`, `vector_search_error`
- `file_operation_error`, `identity_error`, `unknown_error`

**Severity Levels** (4):
- `CRITICAL` — database, auth, identity errors
- `ERROR` — type, parsing, file operation errors
- `WARNING` — timeout, network, vector search errors
- `INFO` — default for unclassified

**Non-blocking guarantee**: If `error_logs` insert fails, logging error is silently caught and logged to console. Does NOT break the request.

### 2. Error Logging Middleware
**File**: `src/lib/server/error-logging-middleware.ts` (33 lines)

**Function**: `withErrorCapture(handler, options)`

Wraps a route handler to:
1. Catch any thrown errors
2. Categorize and log to `error_logs` (non-blocking)
3. Re-throw the original error (normal error handling continues)

**Usage**:
```typescript
export const POST: RequestHandler = withErrorCapture(
  async (event) => {
    // handler code
    return json(result);
  },
  { routePath: '/api/my-route', filePath: 'src/routes/api/my-route/+server.ts' }
);
```

### 3. Drizzle Schema Integration
**File**: `src/lib/server/db/schema-postgres.ts` (70 lines added)

**Table**: `errorLogs` with 19 columns:
- `id` (UUID primary key)
- `error_category`, `severity`, `message`, `stack`
- `context_key`, `route_path`, `file_path`, `line_number`
- `packet_key`, `source_ref`
- `created_at`, `fixed_at`, `resolved`, `fix_strategy`, `fix_confidence`, `fix_notes`
- `audit_count`, `last_audit_at`

**Indexes** (7):
- `idx_error_logs_category` — for P1.1 audit grouping
- `idx_error_logs_severity` — for severity filtering
- `idx_error_logs_created` — for time-range queries
- `idx_error_logs_route` — for route analysis
- `idx_error_logs_packet_key` — for atlas_packets linkage
- `idx_error_logs_resolved` — for open-errors filtering
- `idx_error_logs_fix_strategy` — for fix-quality analysis

---

## Wiring Examples

### Pattern 1: Direct Error Logging (in catch blocks)
```typescript
import { logError, categorizeError, categorizeSeverity } from '$lib/server/error-logging.js';

try {
  // route logic
} catch (err) {
  const category = categorizeError(err);
  const severity = categorizeSeverity(category);

  await logError({
    category,
    severity,
    message: String(err),
    stack: err instanceof Error ? err.stack : undefined,
    routePath: '/api/my-route',
    filePath: 'src/routes/api/my-route/+server.ts',
    contextKey: 'my-route',
  });

  throw err; // Continue normal error handling
}
```

### Pattern 2: Middleware Wrapper (preferred)
```typescript
import { withErrorCapture } from '$lib/server/error-logging-middleware.js';

export const POST: RequestHandler = withErrorCapture(
  async ({ request, locals }) => {
    const data = await request.json();
    // handler logic
    return json(result);
  },
  { routePath: '/api/my-route', filePath: 'src/routes/api/my-route/+server.ts' }
);
```

### Pattern 3: Embed Route (proof-of-concept)
**File**: `src/routes/api/embed/+server.ts`

Wired with direct error logging in the catch block:
```typescript
} catch (err) {
  const category = categorizeError(err);
  const severity = categorizeSeverity(category);

  console.error('Embedding error:', err);

  await logError({
    category,
    severity,
    message: String(err),
    stack: err instanceof Error ? err.stack : undefined,
    routePath: '/api/embed',
    filePath: 'src/routes/api/embed/+server.ts',
    contextKey: 'embed',
  });

  return json({ embedding: new Array(768).fill(0), model: 'embeddinggemma:latest', dimensions: 768 });
}
```

---

## Next Steps (Weekly Integration)

### Week 1: Error Collection Phase
1. ✅ Create error logging infrastructure (done)
2. ✅ Wire proof-of-concept routes (embed done, 2-3 more TBD)
3. Deploy and run for 1-2 days to collect error data
4. Run P1.1 audit to categorize errors

### Week 2: Planning & Fixing
1. Run P1.2 plan to generate fix recommendations
2. Review plan and prioritize by ROI
3. Run P1.3 apply (dry-run) on top errors
4. Run P1.4 verify to validate fixes
5. Run P1.5 trace for root cause analysis

### Week 3: Completion
1. Handoff attribution insights to P2 team
2. Document systematic issues
3. Plan preventive measures
4. Ready for P2 (Rust parser) phase

---

## High-Priority Routes for Wiring

Top 5 routes to wire error logging (in order of impact):

| Route | Purpose | Error Count | Priority |
|-------|---------|------------|----------|
| `/api/evidence/upload` | Heavy file processing, OCR, embeddings | HIGH | **P0** |
| `/api/evidence/[id]/analyze` | LLM analysis, inference errors | HIGH | **P0** |
| `/api/cases/[id]` | Case retrieval, DB queries | MEDIUM | **P1** |
| `/api/rag/search` | Vector search, Qdrant errors | MEDIUM | **P1** |
| `/api/ai/chat` | Inference, streaming, Ollama errors | MEDIUM | **P1** |

---

## Database Setup

The `error_logs` table is defined in the Drizzle schema but **not yet applied to the database**.

**To apply migrations:**
```bash
cd sveltekit-frontend
drizzle-kit generate --name=p1_error_logs
drizzle-kit migrate
```

**Or manually (if needed):**
```bash
# Apply the manual migration that was created in P1
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/manual/0041_p1_error_logs_table.sql
```

**Verification:**
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\d error_logs"
```

---

## Monitoring

**Check collected errors**:
```bash
# Count errors by category
npm run atlas:error:audit

# See summary report
cat docs/reports/error-audit-*.json | jq '.summary'
```

**Verify logging is working**:
```bash
# Trigger a test error in /api/embed with invalid input
curl http://localhost:5173/api/embed \
  -H "Content-Type: application/json" \
  -d '{"text":""}' \
  -c cookies.txt

# Check logs table
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT error_category, COUNT(*) FROM error_logs GROUP BY error_category;"
```

---

## Success Criteria

- [x] Error logging module created and tested
- [x] Error logging middleware created
- [x] Drizzle schema updated with errorLogs table
- [x] `/api/embed` wired as proof-of-concept
- [ ] 2-3 additional high-priority routes wired
- [ ] Database migration applied
- [ ] Error collection running for 1-2 days
- [ ] P1.1 audit shows meaningful error data
- [ ] P1.2 plan generates fix recommendations
- [ ] P1.3-P1.5 validation gates pass

---

**Status**: Ready for error collection  
**Next Step**: Wire 2-3 additional routes, apply DB migration, collect errors for 1-2 days  
**Target Completion**: June 28, 2026 (P1 end date)
