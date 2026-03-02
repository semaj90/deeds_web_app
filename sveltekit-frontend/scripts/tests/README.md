# Test Scripts

Automated test suite for the Legal AI application.

## Prerequisites

- Dev server running on `http://localhost:5173`
- PostgreSQL database accessible at `127.0.0.1:5432`
- Test user ID: `00000000-0000-0000-0000-000000000001`
- Test case ID: `5814dc72-fe7e-49ab-b5d2-ff22f2e40ff1`

## Usage

### Report Routes Tests

**Quick Smoke Test** (3 tests, ~2 seconds):
```bash
node scripts/tests/test-reports-quick.mjs
```

**Full Test Suite** (20+ tests, ~30 seconds):
```bash
# Standard output
node scripts/tests/test-reports.mjs

# Verbose output (shows response bodies)
node scripts/tests/test-reports-quick.mjs --verbose
```

Tests:
- ✅ API endpoints (GET, POST, PATCH, DELETE)
- ✅ Report creation, update, publish/unpublish
- ✅ Multi-format export (HTML, Markdown, JSON)
- ✅ UI routes (listing, new, view, edit)
- ✅ Case integration

### Evidence Pipeline Tests

**Evidence Upload Test**:
```bash
node scripts/tests/test-evidence-uploads.mjs
```

**Full Evidence Pipeline**:
```bash
node scripts/tests/test-evidence-pipeline.mjs
```

## Test Database

The tests use the local PostgreSQL instance (not Docker):
- Host: `127.0.0.1:5432`
- Database: `legal_ai_db`
- User: `legal_admin`
- Password: `123456`

## Exit Codes

- `0`: All tests passed
- `1`: One or more tests failed

## Sample Output

```
📋 Testing Report Routes...

1️⃣  API Endpoints
✅ PASS (200) GET /api/reports (list)
✅ PASS (201) POST /api/reports (create)
✅ PASS (200) GET /api/reports?caseId (filter)
✅ PASS (200) PATCH /api/reports (bulk update)
✅ PASS (200) POST /api/reports/save
✅ PASS (200) POST /api/reports/[id]/publish
✅ PASS (200) DELETE /api/reports/[id]/publish (unpublish)
✅ PASS (200) GET /api/reports/[id]/export?format=html
✅ PASS (200) GET /api/reports/[id]/export?format=markdown
✅ PASS (200) GET /api/reports/[id]/export?format=json
✅ PASS (200) DELETE /api/reports (bulk delete)

2️⃣  UI Routes
✅ PASS (200) GET /reports (listing page)
✅ PASS (200) GET /reports/new (creation wizard)
✅ PASS (200) GET /reports/[id] (view page)
✅ PASS (200) GET /reports/[id]/edit (editor page)

3️⃣  Case Integration
✅ PASS (200) GET /cases/[id]/reports (case reports tab)

📊 Test Summary

Total Tests: 16
✅ Passed: 16
❌ Failed: 0

🎉 All tests passed!
```

## Troubleshooting

### Connection Refused
```bash
# Check if dev server is running
curl http://localhost:5173/api/health

# Start dev server
npm run dev
```

### Database Errors
```bash
# Verify PostgreSQL is running
psql -U legal_admin -h 127.0.0.1 -p 5432 -d legal_ai_db -c "SELECT version();"

# Check reports table exists
psql -U legal_admin -h 127.0.0.1 -p 5432 -d legal_ai_db -c "\d reports"
```

### 401 Unauthorized
- Dev server must be started with `npm run dev` (sets `DEV_BYPASS_AUTH=true`)
- Do NOT use `npx vite dev` directly

## Manual Verification

See [MANUAL_VERIFICATION_GUIDE.md](./MANUAL_VERIFICATION_GUIDE.md) for manual testing procedures.
