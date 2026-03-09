# Database Consolidation Migration Guide

## Overview
This guide helps migrate from scattered database connection patterns to the unified database client.

## Migration Strategy

### 1. Before (Scattered Patterns)
```typescript
// OLD: Multiple imports scattered across codebase
import { db } from '$lib/server/db/client';
import { postgres } from '$lib/server/db/connection';
import { QdrantPostgreSQLService } from '$lib/server/db/qdrant-integration';
import { vectorSearchConfig } from '$lib/server/db/drizzle-vector-config';
```

### 2. After (Unified Pattern)
```typescript
// NEW: Single unified import
import { unifiedDb, db, qdrant, postgres } from '$lib/server/db/unified-client';
// Or for specific operations
import { unifiedDb } from '$lib/server/db/unified-client';
```

## Key Changes

### Database Connections
```typescript
// OLD: Multiple connection patterns
const connection1 = createConnection();
const connection2 = postgres(connectionString);
const drizzleDb = drizzle(connection);

// NEW: Unified access
const db = unifiedDb.runtime();
const adminDb = unifiedDb.admin();
const qdrantClient = unifiedDb.qdrant();
```

### Vector Operations
```typescript
// OLD: Scattered vector implementations
const results = await vectorService.search(embedding);
const qdrantResults = await qdrant.search('collection', { vector });

// NEW: Unified hybrid search
const results = await unifiedDb.vectorSearch(embedding, {
  collection: 'legal_documents',
  limit: 10,
  threshold: 0.7,
  usePostgreSQL: true,
  useQdrant: true
});
```

### Health Checks
```typescript
// OLD: Individual service health checks
const dbHealth = await testDatabaseConnection();
const qdrantHealth = await checkQdrantConnection();

// NEW: Unified health check
const health = await unifiedDb.healthCheck();
// Returns: { postgresql: bool, qdrant: bool, pgvector: bool, overallHealth: bool }
```

## File-by-File Migration

### 1. Update Import Statements
Search for these patterns and replace:

```bash
# Find files with old imports
grep -r "from.*db/client" src/
grep -r "from.*db/connection" src/
grep -r "from.*qdrant-integration" src/
```

Replace with:
```typescript
import { unifiedDb, db } from '$lib/server/db/unified-client';
```

### 2. Update Database Operations
```typescript
// OLD: Direct database calls
const result = await db.select().from(table);

// NEW: Same interface, just different import
const result = await db.select().from(table);
// OR
const result = await unifiedDb.runtime().select().from(table);
```

### 3. Update Vector Operations
```typescript
// OLD: Manual vector search
const postgres = getConnection();
const results = await postgres`
  SELECT *, similarity(embedding, ${queryVector}) as score
  FROM documents
  WHERE similarity(embedding, ${queryVector}) > 0.7
`;

// NEW: Unified hybrid search
const results = await unifiedDb.vectorSearch(queryVector, {
  collection: 'legal_documents',
  threshold: 0.7,
  limit: 20
});
```

## Schema Consolidation

### Vector Type Migration
```typescript
// OLD: Text fallback or custom implementation
const vector = text('embedding');

// NEW: Proper pgvector support
const vector = customType<{ data: number[]; config: { dimensions: number } }>({
  dataType(config) {
    return `vector(${config?.dimensions})`;
  },
  fromDriver(value: string): number[] {
    return JSON.parse(value || '[]');
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
});
```

## Testing Migration

### 1. Run Health Check
```typescript
const health = await unifiedDb.healthCheck();
console.log('Database Health:', health);
```

### 2. Test Vector Operations
```typescript
const testEmbedding = new Array(384).fill(0).map(() => Math.random());
const results = await unifiedDb.vectorSearch(testEmbedding, {
  limit: 5,
  threshold: 0.1
});
console.log('Vector Search Results:', results);
```

### 3. Test Database Operations
```typescript
const db = unifiedDb.runtime();
const testQuery = await db.execute(sql`SELECT 1 as test`);
console.log('Database Query Test:', testQuery);
```

## Rollback Strategy

If issues arise, you can selectively rollback:

1. **Keep unified-client.ts** - New consolidated pattern
2. **Preserve old files** - Don't delete connection.ts, etc. until fully tested
3. **Gradual migration** - Update imports file by file
4. **Feature flags** - Use environment variables to switch between old/new patterns

```typescript
// Rollback pattern
const useUnifiedDb = process.env.USE_UNIFIED_DB === 'true';

if (useUnifiedDb) {
  // Use new unified client
  import { unifiedDb } from '$lib/server/db/unified-client';
} else {
  // Fallback to old pattern
  import { db } from '$lib/server/db/client';
}
```

## Benefits After Migration

1. **Single Database Interface** - One import for all database operations
2. **Hybrid Vector Search** - PostgreSQL + Qdrant automatically coordinated
3. **Proper Connection Pooling** - Role-based connections with optimized pools
4. **Health Monitoring** - Unified health checks for all database services
5. **Type Safety** - Consistent TypeScript types across all operations
6. **Performance** - Optimized connections and vector operations

## Next Steps

1. ✅ Create unified-client.ts (DONE)
2. ✅ Fix schema vector types (DONE)
3. 🔄 Update imports throughout codebase
4. 🔄 Test all database operations
5. 🔄 Validate vector search functionality
6. 🔄 Remove old scattered files after confirmation