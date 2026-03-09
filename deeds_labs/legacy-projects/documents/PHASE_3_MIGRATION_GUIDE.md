# Phase 3 Migration Guide: postgres-js → node-postgres (pg)

**Status**: Planning Phase
**Target**: 42+ files using `postgres-js`
**Goal**: Standardize on `node-postgres` (pg) adapter for Drizzle ORM

## ✅ Completed (Phase 1 & 2)

### Core Database Infrastructure
- ✅ `lib/server/db/drizzle.ts` - Migrated to node-postgres
- ✅ `lib/server/db/index.ts` - Canonical exports established
- ✅ `routes/evidence/+page.server.ts` - Fixed to use canonical pattern
- ✅ 7 routes with `helpers` imports - Now compatible

### Current Working Pattern
```typescript
// ✅ CANONICAL PATTERN (node-postgres + Drizzle)
import { db, pool, sql, eq, and, or, count } from '$lib/server/db';
import { cases, evidence, users } from '$lib/server/db';

// Query example
const results = await db.select().from(cases).where(eq(cases.id, caseId));

// Raw SQL with pgvector
const vectorResults = await db.execute(sql`
  SELECT * FROM documents
  WHERE embedding <-> ${embedding} < 0.5
  ORDER BY embedding <-> ${embedding}
  LIMIT 10
`);
```

## 📋 Files Requiring Migration (42+ files)

### Category A: High Priority (Active Routes)
**Routes using postgres-js directly**:
1. `routes/api/suggest/did-you-mean/+server.ts`
2. `routes/api/rag/self_prompt/+server.ts`
3. `routes/api/evidence-enhancement/+server.ts`
4. `routes/api/db/health/+server.ts`
5. `routes/api/ai-boilerplate/+server.ts`

**Migration Pattern**:
```typescript
// BEFORE (postgres-js)
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL);
const result = await sql`SELECT * FROM cases WHERE id = ${caseId}`;

// AFTER (node-postgres + Drizzle)
import { db, sql } from '$lib/server/db';
import { cases } from '$lib/server/db';
const result = await db.select().from(cases).where(eq(cases.id, caseId));
// OR for raw SQL:
const result = await db.execute(sql`SELECT * FROM cases WHERE id = ${caseId}`);
```

### Category B: Database Infrastructure
**Core database files**:
6. `lib/db/index.ts` (legacy - might be unused)
7. `lib/db/connection.ts` (legacy - might be unused)
8. `lib/db/vector-operations.ts` (needs pgvector updates)
9. `lib/database/connection.ts` (duplicate - consider removing)
10. `lib/database/migrations/migration-system.ts`

**Migration Strategy**:
- Replace direct `postgres()` calls with `db` from canonical source
- Update vector operations to use Drizzle's `sql` template
- Consolidate duplicate connection files

### Category C: Server-Side Services
**AI/RAG Services**:
11. `lib/server/ai/enhanced-ai-synthesis-orchestrator.ts`
12. `lib/server/ai/rag-pipeline-enhanced.ts`
13. `lib/ai/multi-core-mcp-vector-server.ts`

**Database Services**:
14. `lib/server/database/connection.ts`
15. `lib/server/database-pool-service.ts`
16. `lib/server/db/client.ts`
17. `lib/server/db/drizzle-vector-config.ts` ⚠️ CRITICAL
18. `lib/server/db/qdrant-integration.ts`
19. `lib/server/db/unified-client.ts`
20. `lib/server/db/migrate.ts`
21. `lib/server/db/migrate-test-rag.ts`
22. `lib/server/db/index-new.ts`

### Category D: Compatibility Shims
**Shim files (might be removable after migration)**:
23. `lib/shims/pg-compat.ts`
24. `lib/server/db-shim.ts`

### Category E: Backup/Legacy Files
**Backup directory** (`.backups/mass-fix-20251008-234923/`):
- 18+ files with `postgres-js` imports
- **Action**: Consider deleting after verification

## 🔧 Migration Workflow

### Step 1: Verify Core Infrastructure ✅ DONE
- [x] node-postgres adapter working in `lib/server/db/drizzle.ts`
- [x] Canonical exports established
- [x] All table schemas compatible with node-postgres

### Step 2: High-Priority Routes (API Endpoints)
For each file in Category A:
1. Replace `import postgres from 'postgres'` with `import { db, sql } from '$lib/server/db'`
2. Convert direct SQL queries to Drizzle ORM:
   ```typescript
   // BEFORE
   const result = await sql`SELECT * FROM ${tableName} WHERE id = ${id}`;

   // AFTER
   import { cases } from '$lib/server/db';
   const result = await db.select().from(cases).where(eq(cases.id, id));
   ```
3. Test API endpoint functionality
4. Verify type safety with TypeScript

### Step 3: Database Infrastructure Files
1. **Vector Operations** (`lib/db/vector-operations.ts`):
   ```typescript
   // Update to use Drizzle's sql template
   import { db, sql } from '$lib/server/db';

   async function vectorSearch(embedding: number[], threshold: number) {
     return await db.execute(sql`
       SELECT id, content, embedding <-> ${embedding} AS distance
       FROM documents
       WHERE embedding <-> ${embedding} < ${threshold}
       ORDER BY distance
       LIMIT 10
     `);
   }
   ```

2. **Migration Files**: Update to use node-postgres for schema migrations
3. **Connection Files**: Consolidate to single canonical source

### Step 4: AI/RAG Services
- Update `rag-pipeline-enhanced.ts` to use Drizzle ORM
- Migrate `enhanced-ai-synthesis-orchestrator.ts`
- Test RAG query functionality end-to-end

### Step 5: Cleanup
1. Remove compatibility shims if no longer needed
2. Delete backup directory after verification
3. Update documentation to reflect node-postgres as standard

## 🚨 Critical Considerations

### Vector Operations
**pgvector compatibility**:
```typescript
// ✅ WORKING: Drizzle with pgvector
import { sql } from 'drizzle-orm';

// Cosine distance
const results = await db.execute(sql`
  SELECT * FROM documents
  WHERE embedding <-> ${embedding}::vector < 0.5
`);

// Euclidean distance
const results2 = await db.execute(sql`
  SELECT * FROM documents
  WHERE embedding <-> ${embedding}::vector < 1.0
`);
```

### Type Safety
- All Drizzle queries are type-safe by default
- Raw SQL queries need explicit type casting:
  ```typescript
  const results = await db.execute<{ id: number; content: string }>(sql`...`);
  ```

### Performance
- node-postgres uses connection pooling (already configured)
- Drizzle ORM adds minimal overhead compared to raw SQL
- Vector operations maintain native PostgreSQL performance

## 📊 Progress Tracking

### Current Status
- **Phase 1**: Core infrastructure ✅ Complete
- **Phase 2**: Route fixes & helpers ✅ Complete
- **Phase 3**: postgres-js migration ⏳ Planned

### Estimated Effort
- **Category A** (5 files): 30 minutes (high priority)
- **Category B** (5 files): 45 minutes (infrastructure)
- **Category C** (12 files): 2 hours (complex services)
- **Category D** (2 files): 15 minutes (remove shims)
- **Category E** (18+ files): 15 minutes (delete backups)

**Total**: ~3.5 hours for complete migration

## 🎯 Recommended Next Steps

### Option 1: Incremental Migration (Recommended)
1. Migrate Category A (API routes) - 30 min
2. Test thoroughly with dev server
3. Migrate Category B (database infrastructure) - 45 min
4. Test vector operations and queries
5. Migrate Category C (AI services) - 2 hours
6. Final cleanup and documentation - 30 min

### Option 2: Parallel Migration (Risky)
- Migrate all categories simultaneously
- Higher risk of breaking changes
- Requires comprehensive testing afterward

### Option 3: Deferred Migration (Current State)
- Keep working pattern (node-postgres in core)
- Gradually migrate files as they're touched
- Accept mixed state for now

## 📝 Testing Checklist

After each migration:
- [ ] TypeScript compiles without errors (`npx tsc --noEmit`)
- [ ] Dev server starts without crashes
- [ ] Database queries execute successfully
- [ ] Vector search operations work correctly
- [ ] API endpoints return expected results
- [ ] No performance regressions

## 🔗 Related Documentation

- [Drizzle ORM Docs](https://orm.drizzle.team/docs/overview)
- [node-postgres (pg) Docs](https://node-postgres.com/)
- [pgvector Extension Docs](https://github.com/pgvector/pgvector)
- `DRIZZLE_ADAPTER_FIX_SESSION_2.md` - Previous migration work
- `SVELTE5_DRIZZLE_EXAMPLES.ts` - Working code examples

## 💡 Key Insights

### Why node-postgres?
1. **Official Drizzle Support**: Recommended adapter for PostgreSQL
2. **Better TypeScript Integration**: Native types for queries
3. **Connection Pooling**: Built-in pg.Pool support
4. **Community Standard**: Most widely used PostgreSQL driver for Node.js
5. **Better Error Handling**: More robust error messages and stack traces

### Why Migrate Away from postgres-js?
- Less common in Drizzle ecosystem
- Compatibility issues with some PostgreSQL features
- Harder to debug connection issues
- Mixed patterns across codebase causing confusion

### Benefits of Completion
- ✅ Single, canonical database pattern
- ✅ Better TypeScript type safety
- ✅ Easier onboarding for new developers
- ✅ Reduced maintenance burden
- ✅ Better IDE autocomplete and intellisense

---

**Created**: October 9, 2025
**Last Updated**: October 9, 2025
**Status**: Ready for execution when needed
