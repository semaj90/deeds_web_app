# Phase 6 Verification Guide

## Quick Verification Steps

### 1. Verify Database Tables Exist

```bash
# Connect to PostgreSQL
psql postgresql://legal_admin:123456@localhost:5432/legal_ai_db

# List NES Command Center tables
\dt route_metadata error_cluster route_health_event error_brain_analysis error_brain_patch route_interaction_log

# Expected output: 6 tables listed
```

### 2. Check Table Structure

```sql
-- Check route_metadata structure
\d route_metadata

-- Expected columns:
-- id, route_id, path, kind, "group", status, priority, badges, created_at, updated_at, archived_at
```

### 3. Verify All-Routes Page Works

```bash
# Start dev server
cd sveltekit-frontend
npm run dev
```

Navigate to: `http://localhost:5173/all-routes`

**Expected Console Output:**
```
[Phase 78] Loaded 150 routes from Phase 72 AST
[Phase 6] Starting database enrichment...
[Phase 6.1] Loaded 0 route metadata records from database
[Phase 6] Database enrichment complete
[Phase 78] Built 23 error clusters
```

**Expected UI:**
- Page loads without errors
- Shows debug information panel
- Lists routes from AST graph
- No database enrichment yet (database is empty)

### 4. Test Database Connection (Alternative Method)

Create a simple test file:

```typescript
// sveltekit-frontend/src/routes/api/test-db/+server.ts
import { json } from '@sveltejs/kit';
import { testConnection, healthCheck } from '$lib/db/pool';
import { getAllRouteMetadata } from '$lib/db/queries/nes-command-center';

export async function GET() {
  const isConnected = await testConnection();
  const health = await healthCheck();
  const routes = await getAllRouteMetadata();

  return json({
    connected: isConnected,
    health,
    routeCount: routes.length,
    timestamp: new Date().toISOString(),
  });
}
```

Then test:
```bash
curl http://localhost:5173/api/test-db
```

Expected response:
```json
{
  "connected": true,
  "health": {
    "healthy": true,
    "responseTime": 15
  },
  "routeCount": 0,
  "timestamp": "2025-12-21T..."
}
```

## What to Expect

### Current State (Empty Database)

Since the database tables are empty, you'll see:
- ✅ Database connection works
- ✅ Queries execute without errors
- ✅ All-routes page loads successfully
- ⚠️ No enrichment data (errorCount, suggestionCount all 0)
- ⚠️ Routes display AST data only

### After Phase 2 (Route Scanner)

Once you populate the database:
- ✅ Routes show enriched metadata
- ✅ Error counts display
- ✅ Health status indicators work
- ✅ Suggestion counts appear

## Troubleshooting

### Issue: "Database connection failed"

**Solution:**
```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Check connection string
echo $DATABASE_URL

# Test connection manually
psql postgresql://legal_admin:123456@localhost:5432/legal_ai_db -c "SELECT 1"
```

### Issue: "Tables not found"

**Solution:**
```bash
# Check if migration was applied
psql postgresql://legal_admin:123456@localhost:5432/legal_ai_db

# List all tables
\dt

# If tables missing, re-run migration
psql postgresql://legal_admin:123456@localhost:5432/legal_ai_db < sveltekit-frontend/drizzle/migrations/20251221_add_nes_command_center_tables.sql
```

### Issue: "Import errors in +page.server.ts"

**Solution:**
```bash
# Check TypeScript compilation
cd sveltekit-frontend
npm run check

# Rebuild if needed
npm run build
```

## Success Criteria Checklist

- [ ] Database tables exist (6 tables)
- [ ] Database connection works
- [ ] All-routes page loads without errors
- [ ] Console shows Phase 6 enrichment logs
- [ ] No TypeScript errors
- [ ] No runtime errors

## Next Steps

Once verification is complete:

1. **Phase 2: Route Scanner** - Populate database with real routes
2. **Import Error Logs** - Add error clusters
3. **Phase 7: Interaction Logging** - Track user interactions
4. **Phase 8: UI Enhancements** - Visual improvements (already done)

## Files to Review

- `sveltekit-frontend/src/routes/(app)/all-routes/+page.server.ts` - Server-side loading
- `sveltekit-frontend/src/lib/db/pool.ts` - Connection pool
- `sveltekit-frontend/src/lib/db/queries/nes-command-center.ts` - Query helpers
- `sveltekit-frontend/src/lib/db/schema/nes-command-center.ts` - Schema definitions
