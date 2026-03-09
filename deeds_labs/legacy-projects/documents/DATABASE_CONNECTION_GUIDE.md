# Database Connection Quick Reference

## ✅ ALWAYS Use This Pattern

```typescript
// Import the canonical database connection
import { db, sql, pool } from '$lib/server/db'

// Or use the index (preferred)
import { db } from '$lib/server/db/index'

// Query examples
const users = await db.select().from(usersTable);
const result = await sql`SELECT * FROM users WHERE id = ${userId}`;
```

## ❌ NEVER Do This

```typescript
// DON'T create separate database connections
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client); // ❌ WRONG - Creates duplicate connection
```

## Database Connection Architecture

```
PRIMARY CONNECTION (USE THIS)
├── src/lib/server/db/drizzle.ts  (pg.Pool + node-postgres adapter)
└── src/lib/server/db/index.ts   (re-exports db, sql, pool)

LEGACY COMPATIBILITY (Redirects to Primary)
├── src/lib/server/db.ts          (re-exports from drizzle.ts)
└── src/lib/server/database.ts    (re-exports from drizzle.ts)
```

## Import Aliases

All of these now use the **same connection pool**:

```typescript
import { db } from '$lib/server/db'          // ✅ Works (redirects to drizzle.ts)
import { db } from '$lib/server/db/index'    // ✅ Works (canonical export)
import { db } from '$lib/server/database'    // ✅ Works (redirects to drizzle.ts)
```

## Common Operations

### 1. Select Query
```typescript
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema-actual';

const allUsers = await db.select().from(users);
const specificUser = await db.select().from(users).where(eq(users.id, userId));
```

### 2. Insert Query
```typescript
import { db } from '$lib/server/db';
import { documents } from '$lib/server/db/schema-actual';

const newDoc = await db.insert(documents).values({
  filename: 'contract.pdf',
  content: 'Legal contract text...',
  metadata: { type: 'contract', jurisdiction: 'CA' }
}).returning();
```

### 3. Raw SQL Query
```typescript
import { sql } from '$lib/server/db';

const results = await sql`
  SELECT * FROM documents
  WHERE embedding <-> ${queryEmbedding}::vector < 0.5
  ORDER BY embedding <-> ${queryEmbedding}::vector
  LIMIT 10
`;
```

### 4. Vector Search with pgvector
```typescript
import { db, sql } from '$lib/server/db';

const similarDocs = await sql`
  SELECT id, content,
         1 - (embedding <=> ${queryEmbedding}::vector) AS similarity
  FROM legal_embeddings
  WHERE 1 - (embedding <=> ${queryEmbedding}::vector) > ${threshold}
  ORDER BY embedding <=> ${queryEmbedding}::vector
  LIMIT ${limit}
`;
```

### 5. Transaction
```typescript
import { db } from '$lib/server/db';
import { users, sessions } from '$lib/server/db/schema-actual';

await db.transaction(async (tx) => {
  const user = await tx.insert(users).values({ email: 'user@example.com' }).returning();
  await tx.insert(sessions).values({ userId: user[0].id, token: 'abc123' });
});
```

## Pool Management

### Check Pool Stats
```typescript
import { pool } from '$lib/server/db/drizzle';

console.log('Total connections:', pool.totalCount);
console.log('Idle connections:', pool.idleCount);
console.log('Waiting clients:', pool.waitingCount);
```

### Health Check
```typescript
import { sql } from '$lib/server/db';

export async function checkDatabaseHealth() {
  try {
    const result = await sql`SELECT 1 as healthy`;
    return result.length > 0;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}
```

## Schema Imports

```typescript
// Import tables from canonical schema
import { users, cases, documents, evidence, sessions } from '$lib/server/db/schema-actual';

// Or use the index export
import { users, cases } from '$lib/server/db/index';
```

## Error Handling

```typescript
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema-actual';

try {
  const user = await db.select().from(users).where(eq(users.id, userId));
  if (!user.length) {
    throw new Error('User not found');
  }
  return user[0];
} catch (error: unknown) {
  console.error('Database query failed:', error);
  throw error; // Re-throw or handle appropriately
}
```

## Configuration

### Environment Variables
```bash
# .env.development
DATABASE_URL="postgresql://legal_admin:123456@localhost:5432/legal_ai_db"
```

### Connection Pool Settings
```typescript
// src/lib/server/db/drizzle.ts
const pool = new Pool({
  connectionString,
  max: 10,                  // Maximum connections
  idleTimeoutMillis: 30000, // Close idle connections after 30s
  connectionTimeoutMillis: 2000
});
```

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot set properties of undefined (setting '1184')` | Using postgres-js adapter with pg.Pool | Use `import { db } from '$lib/server/db'` |
| `Module has no exported member 'db'` | Wrong import path | Check import path matches exports |
| `Connection pool exhausted` | Too many concurrent queries | Increase pool size or optimize queries |
| `relation "table_name" does not exist` | Table not created | Run migrations: `npm run db:migrate` |

## Best Practices

1. ✅ **Always use the shared db instance** - Never create separate connections
2. ✅ **Use transactions for multi-step operations** - Ensures data consistency
3. ✅ **Close connections gracefully on shutdown** - Prevents connection leaks
4. ✅ **Use prepared statements** - Drizzle handles this automatically
5. ✅ **Handle errors properly** - Use try/catch with unknown type
6. ✅ **Monitor pool stats** - Track connection usage in production

## Migration Commands

```bash
# Generate migration from schema changes
npm run db:generate

# Apply migrations to database
npm run db:migrate

# Drop database and recreate (DANGER)
npm run db:reset

# Seed database with test data
npm run db:seed
```

---

**Last Updated**: January 2025
**Architecture**: node-postgres adapter with pg.Pool
**Status**: ✅ STABLE - All connections consolidated to canonical pattern
