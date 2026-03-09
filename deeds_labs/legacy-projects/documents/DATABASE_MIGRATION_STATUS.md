# Database Adapter Migration Status Report

## Current Situation

### ✅ Fixed Files (4 files)
1. ✅ `src/lib/server/db.ts` - Re-exports from canonical `drizzle.ts`
2. ✅ `src/lib/server/database.ts` - Re-exports from canonical `drizzle.ts`
3. ✅ `src/routes/api/v1/vector/search/+server.ts` - Uses shared connection
4. ✅ `svelte.config.js` - Removed problematic alias

### ⚠️ Remaining postgres-js Imports (46 files)

These files still create separate `postgres-js` connections and need migration:

#### **Critical API Routes** (4 files - HIGH PRIORITY)
1. ❌ `src/routes/api/vectors/sync/+server.ts` - Vector synchronization
2. ❌ `src/routes/api/pipeline/test/+server.ts` - Pipeline testing
3. ❌ `src/routes/api/compute/+server.ts` - Compute operations
4. ❌ `src/routes/api/cases/[caseId]/evidence/+server.ts` - Evidence management

#### **Database Connection Utilities** (10 files - HIGH PRIORITY)
5. ❌ `src/lib/server/db/client.ts`
6. ❌ `src/lib/server/db/connection-manager.ts`
7. ❌ `src/lib/server/db/connections.ts`
8. ❌ `src/lib/server/db/drizzle-vector-config.ts`
9. ❌ `src/lib/server/db/embeddings-client.ts`
10. ❌ `src/lib/server/db/index-clean.ts`
11. ❌ `src/lib/server/db/index-new.ts`
12. ❌ `src/lib/server/db/pg.ts`
13. ❌ `src/lib/server/db/unified-client.ts`
14. ❌ `src/lib/server/database/connection.ts`
15. ❌ `src/lib/server/database-pool-service.ts`
16. ❌ `src/lib/server/database-simple.js`

#### **Worker Processes** (2 files - MEDIUM PRIORITY)
17. ❌ `src/lib/workers/comprehensive-worker.ts`
18. ❌ `src/lib/workers/queue-worker.ts`

#### **AI/RAG Services** (4 files - MEDIUM PRIORITY)
19. ❌ `src/lib/server/ai/enhanced-ai-synthesis-orchestrator.ts`
20. ❌ `src/lib/server/ai/enhanced-orchestrator.ts`
21. ❌ `src/lib/server/ai/rag-pipeline-enhanced.ts`
22. ❌ `src/lib/server/ai/rag-pipeline.ts`

#### **Client-Side Database** (4 files - LOW PRIORITY)
23. ❌ `src/lib/db/index.ts` - Client-side connection (might be intentional)
24. ❌ `src/lib/db/connection.ts`
25. ❌ `src/lib/db/vector-operations.ts`
26. ❌ `src/lib/database/connection.ts`

#### **Migration Scripts** (3 files - LOW PRIORITY - Keep postgres-js)
27. ⚠️ `src/lib/server/db/migrate.ts` - Migration runner (postgres-js is standard)
28. ⚠️ `src/lib/server/db/migrate-test-rag.ts` - Test migration
29. ⚠️ `src/lib/database/migrations/migration-system.ts` - Migration system

#### **MCP Services** (2 files - LOW PRIORITY)
30. ❌ `src/lib/mcp/cases.mcp.ts`
31. ❌ `src/lib/server/db/pgvector-service.ts`
32. ❌ `src/lib/server/db/qdrant-integration.ts`

#### **Utility Files** (2 files - LOW PRIORITY)
33. ❌ `src/lib/server/db/user-operations.ts`

#### **Other Projects** (1 file - IGNORE)
34. ⚠️ `sveltekit-evidence/src/lib/db/index.ts` - Different project

#### **Shim Files** (2 files - DELETE)
35. ❌ `src/lib/shims/drizzle-node-postgres.ts` - REMOVE
36. ❌ `src/lib/shims/drizzle-node-postgres.d.ts` - REMOVE

---

## Migration Strategy

### Phase 1: Critical API Routes (Immediate)
**Goal**: Fix routes that handle user requests

**Pattern**:
```typescript
// BEFORE (creates separate connection)
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
const sql = postgres(DATABASE_URL);
const db = drizzle(sql);

// AFTER (uses shared connection)
import { db, sql } from '$lib/server/db';
// Remove postgres import and db initialization
```

**Files**:
1. `src/routes/api/vectors/sync/+server.ts`
2. `src/routes/api/pipeline/test/+server.ts`
3. `src/routes/api/compute/+server.ts`
4. `src/routes/api/cases/[caseId]/evidence/+server.ts`

---

### Phase 2: Database Utilities (High Priority)
**Goal**: Consolidate connection management files

**Decision Required**: Many of these files (`client.ts`, `connections.ts`, `unified-client.ts`) seem to be **alternative** connection strategies. Options:

**Option A**: Convert them to re-export canonical connection (like we did with `db.ts`)
```typescript
// Make them redirect to drizzle.ts
export { db, sql, pool } from './drizzle';
```

**Option B**: Delete redundant files if they're not used
```bash
# Check usage first
grep -r "from.*db/client" src/
grep -r "from.*db/connections" src/
```

**Recommended**: Check usage, then either:
- If used: Convert to re-export
- If unused: Delete

---

### Phase 3: Workers & Services (Medium Priority)
**Goal**: Ensure background processes use shared pool

**Files**:
- `src/lib/workers/comprehensive-worker.ts`
- `src/lib/workers/queue-worker.ts`
- `src/lib/server/ai/*.ts` (4 files)

**Pattern**: Same as Phase 1 - replace with shared connection

---

### Phase 4: Client-Side Database (Evaluate)
**Goal**: Determine if client-side postgres-js is intentional

**Files**: `src/lib/db/*` (not `src/lib/server/db`)

**Question**: Is this for client-side WASM database? If so, keep postgres-js.
If not, migrate to server-side pattern.

---

### Phase 5: Migration Scripts (Keep postgres-js)
**Files**: `src/lib/server/db/migrate*.ts`

**Decision**: **KEEP postgres-js** for migration scripts
**Reason**: Drizzle's migration tools expect postgres-js adapter

---

### Phase 6: Cleanup
1. Delete shim files
2. Delete redundant connection files (if identified)
3. Update documentation

---

## Automated Migration Script

```typescript
// scripts/migrate-to-canonical-db.ts
import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';

const filesToMigrate = [
  'src/routes/api/vectors/sync/+server.ts',
  'src/routes/api/pipeline/test/+server.ts',
  'src/routes/api/compute/+server.ts',
  'src/routes/api/cases/[caseId]/evidence/+server.ts',
  // Add more files...
];

for (const file of filesToMigrate) {
  let content = readFileSync(file, 'utf-8');

  // Remove postgres-js imports
  content = content.replace(
    /import { drizzle } from ['"]drizzle-orm\/postgres-js['"];?\n/g,
    ''
  );
  content = content.replace(
    /import postgres from ['"]postgres['"];?\n/g,
    ''
  );
  content = content.replace(
    /import type { PostgresJsDatabase } from ['"]drizzle-orm\/postgres-js['"];?\n/g,
    ''
  );

  // Remove connection initialization
  content = content.replace(
    /const sql = postgres\([^)]+\);?\n/g,
    ''
  );
  content = content.replace(
    /const db = drizzle\(sql[^)]*\);?\n/g,
    ''
  );

  // Add canonical import (if not already present)
  if (!content.includes("from '$lib/server/db'")) {
    content = content.replace(
      /(import .* from ['"]@sveltejs\/kit['"];?\n)/,
      "$1import { db, sql } from '$lib/server/db';\n"
    );
  }

  writeFileSync(file, content);
  console.log(`✅ Migrated ${file}`);
}
```

---

## Testing Plan

### 1. Unit Tests
```bash
# Test database connection
npm run test -- src/lib/server/db/drizzle.test.ts

# Test API routes
npm run test -- src/routes/api/**/*.test.ts
```

### 2. Integration Tests
```bash
# Start dev server
npm run dev

# Test vector search
curl -X POST http://localhost:5173/api/v1/vector/search \
  -H "Content-Type: application/json" \
  -d '{"query": "contract", "limit": 5}'

# Test vector sync
curl -X POST http://localhost:5173/api/vectors/sync \
  -H "Content-Type: application/json" \
  -d '{"vectorId": "test-123"}'

# Test evidence upload
curl -X POST http://localhost:5173/api/cases/123/evidence \
  -F "file=@test.pdf"
```

### 3. Performance Tests
```bash
# Monitor connection pool
# Add to drizzle.ts:
pool.on('connect', () => console.log('[Pool] New connection:', pool.totalCount));
pool.on('error', (err) => console.error('[Pool] Error:', err));

# Check pool stats during load
setInterval(() => {
  console.log({
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount
  });
}, 5000);
```

---

## Risk Assessment

### High Risk (Immediate Impact)
- ❌ API routes creating separate connections → **Connection pool exhaustion**
- ❌ Type mismatches between adapters → **Runtime crashes**

### Medium Risk (Performance Impact)
- ⚠️ Workers creating separate connections → **Resource waste**
- ⚠️ AI services creating separate connections → **Memory leaks**

### Low Risk (Maintenance)
- ⚠️ Duplicate connection files → **Confusion for developers**
- ⚠️ Shim files → **Legacy technical debt**

---

## Recommended Action Plan

### Immediate (Today)
1. ✅ Fix 4 critical API routes
2. ✅ Delete shim files
3. ✅ Test dev server starts

### This Week
4. ⚠️ Audit connection utility files (check usage)
5. ⚠️ Migrate workers (comprehensive-worker, queue-worker)
6. ⚠️ Migrate AI services (4 files)

### Next Sprint
7. ⚠️ Evaluate client-side db (`src/lib/db/*`)
8. ⚠️ Consolidate or delete redundant connection files
9. ⚠️ Add connection pool monitoring

### Future
10. ⚠️ Add automated tests for connection pooling
11. ⚠️ Document canonical database pattern
12. ⚠️ Add pre-commit hook to prevent postgres-js imports

---

## Progress Tracking

- [x] Phase 1a: Fix svelte.config.js alias
- [x] Phase 1b: Fix src/lib/server/db.ts
- [x] Phase 1c: Fix src/lib/server/database.ts
- [x] Phase 1d: Fix vector search route
- [ ] Phase 2: Fix remaining 4 critical API routes
- [ ] Phase 3: Migrate workers
- [ ] Phase 4: Migrate AI services
- [ ] Phase 5: Audit and consolidate utilities
- [ ] Phase 6: Delete shim files
- [ ] Phase 7: Documentation update

---

**Last Updated**: January 2025
**Status**: ⚠️ IN PROGRESS - 4/46 files migrated (9%)
**Next Step**: Migrate critical API routes (vectors/sync, pipeline/test, compute, cases/evidence)
