# PostgreSQL Connection Migration Guide: postgres-js App-Wide

## Overview
This document tracks the migration from `pg` (node-postgres) to `postgres-js` across the entire deeds-web-app codebase, ensuring consistent database access patterns and optimal performance with Drizzle ORM.

## Why postgres-js?
- **Zero-dependency**: Pure JavaScript, smaller bundle size
- **Better TypeScript support**: Native types, better IntelliSense
- **Performance**: Faster query execution and connection pooling
- **Drizzle ORM recommended**: Official driver for Drizzle with postgres-js adapter
- **Modern async/await**: Cleaner promise-based API

## Database Configuration

### Container: legal_ai_test_db (7f42a7a862ee)
- **Image**: `pgvector/pgvector:pg17`
- **Host Port**: 5434 (mapped from container port 5432)
- **Database**: `legal_ai_test`
- **User**: `legal_admin`
- **Password**: `123456`
- **Auth Method**: `scram-sha-256` (external), `trust` (localhost)
- **Extensions**: `vector` (pgvector for embeddings)

### Connection String
```
postgresql://legal_admin:123456@localhost:5434/legal_ai_test
```

## Migration Status

### ✅ Completed Migrations

#### 1. evidence-service (100% postgres-js)
**Location**: `c:/Users/james/Videos/deeds-web-app/evidence-service/`

**Files Updated**:
- `src/db/drizzle.ts`: Uses `drizzle-orm/postgres-js` + `postgres` package
- `drizzle.config.ts`: Dialect set to `postgresql`, no driver field (drizzle-kit auto-detects)
- `.env`: `DATABASE_URL=postgresql://legal_admin:123456@localhost:5434/legal_ai_test`

**Schema Created**:
```sql
-- 5 tables with pgvector support
CREATE TABLE cases (
  id uuid PRIMARY KEY,
  case_number varchar(255) UNIQUE,
  title text NOT NULL,
  description text,
  status varchar(50) DEFAULT 'open',
  metadata jsonb DEFAULT '{}',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE evidences (
  id uuid PRIMARY KEY,
  case_id uuid REFERENCES cases(id) ON DELETE CASCADE,
  file_name varchar(512) NOT NULL,
  storage_path text NOT NULL,
  ocr_text text,
  summary text,
  entities jsonb DEFAULT '[]',
  forensic_flags jsonb DEFAULT '[]',
  status varchar(50) DEFAULT 'pending',
  created_at timestamp DEFAULT now()
);

CREATE TABLE embeddings (
  id uuid PRIMARY KEY,
  evidence_id uuid REFERENCES evidences(id) ON DELETE CASCADE,
  vector vector(768) NOT NULL, -- pgvector column
  model varchar(255) NOT NULL,
  chunk_index integer DEFAULT 0,
  text_snippet text,
  created_at timestamp DEFAULT now()
);

CREATE INDEX embedding_vector_idx ON embeddings USING hnsw (vector vector_cosine_ops);

CREATE TABLE analysis_jobs (
  id uuid PRIMARY KEY,
  evidence_id uuid REFERENCES evidences(id) ON DELETE CASCADE,
  job_type varchar(100) NOT NULL,
  status varchar(50) DEFAULT 'pending',
  result jsonb,
  error text,
  started_at timestamp,
  completed_at timestamp
);

CREATE TABLE case_timeline (
  id uuid PRIMARY KEY,
  case_id uuid REFERENCES cases(id) ON DELETE CASCADE,
  evidence_id uuid REFERENCES evidences(id),
  event_type varchar(100) NOT NULL,
  event_date timestamp NOT NULL,
  description text
);
```

**Code Pattern**:
```typescript
// src/db/drizzle.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env.js';
import * as schema from './schema.js';

const client = postgres(env.database.url);
export const db = drizzle(client, { schema });
```

#### 2. sveltekit-frontend (Partial - needs verification)
**Location**: `c:/Users/james/Videos/deeds-web-app/sveltekit-frontend/`

**Files Using postgres-js** (confirmed):
- `src/lib/db/index.ts`
- `src/lib/db/connection.ts`
- `src/lib/server/database.ts`
- `src/lib/db/vector-operations.ts`

**Drizzle Config**:
```typescript
// drizzle.config.ts
export default defineConfig({
  schema: 'src/lib/db/schema.ts',
  out: 'drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db',
  },
});
```

### ⚠️ Files Requiring Migration

Based on grep search results, the following files still use `pg` or `drizzle-orm/node-postgres`:

#### Scripts Directory
1. `scripts/agentic-controller.mjs` - Line 10: `import pg from "pg"`
2. `scripts/demo-context7-rag.js` - Line 4: `import pg from 'pg'`
3. `scripts/mcp-context7-optimized.mjs` - Line 17: `import pg from 'pg'`
4. `scripts/test-rag-insert.js` - Line 4: `import pg from 'pg'`

#### MCP Servers
5. `mcp-servers/context7-server.js`:
   - Line 214: `import { drizzle } from 'drizzle-orm/node-postgres'`
   - Line 215: `import { Client } from 'pg'`

#### Test Files
6. `direct-vector-test.mjs` - Line 6: `import { Pool } from 'pg'`
7. `generate-test-embeddings.mjs` - Line 2: `import { Client } from 'pg'`
8. `seed-test-db.mjs` - Line 3: `import { Client } from 'pg'`

## Migration Instructions

### Step 1: Update Package Dependencies
```bash
# In each project directory (sveltekit-frontend, evidence-service, etc.)
npm install postgres
npm uninstall pg pg-pool # Optional: remove if no longer needed
```

### Step 2: Update Import Statements
**Before (pg/node-postgres)**:
```typescript
import { Pool, Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool);
```

**After (postgres-js)**:
```typescript
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

const client = postgres(DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});
const db = drizzle(client, { schema });
```

### Step 3: Update Query Patterns
**Before (pg)**:
```typescript
// Raw query with pg
const result = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
const user = result.rows[0];

// Transactions with pg
await client.query('BEGIN');
try {
  await client.query('INSERT INTO ...');
  await client.query('UPDATE ...');
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
}
```

**After (postgres-js)**:
```typescript
// Raw query with postgres-js
const users = await client`SELECT * FROM users WHERE id = ${userId}`;
const user = users[0];

// Transactions with postgres-js
await client.begin(async (tx) => {
  await tx`INSERT INTO ...`;
  await tx`UPDATE ...`;
  // Automatic commit/rollback
});

// Or use Drizzle ORM (preferred)
const user = await db.query.users.findFirst({
  where: eq(users.id, userId)
});
```

### Step 4: Update Connection Pooling
**postgres-js connection options**:
```typescript
const client = postgres(DATABASE_URL, {
  // Connection pool settings
  max: 20,                    // Maximum connections
  idle_timeout: 20,           // Close idle connections after 20s
  connect_timeout: 10,        // Connection timeout

  // PostgreSQL-specific optimizations
  prepare: false,             // Disable prepared statements (better for pgvector)
  onnotice: () => {},         // Suppress notices in development

  // Type transforms
  transform: {
    undefined: null,          // Convert undefined to null
  },
});
```

### Step 5: Update drizzle.config.ts
```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  // No 'driver' field - drizzle-kit auto-detects from dialect
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_test',
  },
  verbose: true,
  strict: true,
});
```

## Common Migration Issues

### Issue 1: drizzle-kit uses 'pg' internally
**Symptom**: `Using 'pg' driver for database querying` message during `drizzle-kit push`

**Solution**: This is normal! drizzle-kit uses `pg` for schema introspection, but your app runtime uses `postgres-js`. Keep both packages installed:
```json
{
  "dependencies": {
    "postgres": "^3.4.5",      // Runtime database queries
    "drizzle-orm": "^0.36.4"
  },
  "devDependencies": {
    "drizzle-kit": "^0.30.1",  // Uses pg internally for migrations
    "pg": "^8.11.3"            // Required by drizzle-kit
  }
}
```

### Issue 2: Password Authentication Failed
**Symptom**: `error: password authentication failed for user "legal_admin"`

**Solution**: PostgreSQL container uses `scram-sha-256` authentication. Reset password inside container:
```bash
docker exec 7f42a7a862ee psql -U legal_admin -d legal_ai_test -c "ALTER USER legal_admin WITH PASSWORD '123456';"
```

### Issue 3: Vector Type Does Not Exist
**Symptom**: `error: type "vector" does not exist`

**Solution**: Enable pgvector extension before running migrations:
```bash
docker exec 7f42a7a862ee psql -U legal_admin -d legal_ai_test -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### Issue 4: Type Errors with Drizzle
**Symptom**: TypeScript errors about incompatible database types

**Solution**: Ensure you're using the correct type imports:
```typescript
// Correct
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
const db: PostgresJsDatabase = drizzle(client);

// Incorrect
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
```

## Best Practices

### 1. Single Connection Instance
```typescript
// db/connection.ts - Single source of truth
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

const client = postgres(DATABASE_URL, { max: 10 });
export const db = drizzle(client, { schema });

// Other files - import the shared instance
import { db } from './db/connection.js';
```

### 2. Environment Variables
```env
# .env
DATABASE_URL=postgresql://legal_admin:123456@localhost:5434/legal_ai_test
POSTGRES_HOST=localhost
POSTGRES_PORT=5434
POSTGRES_DB=legal_ai_test
POSTGRES_USER=legal_admin
POSTGRES_PASSWORD=123456
```

### 3. Error Handling
```typescript
try {
  const result = await db.select().from(users);
  return result;
} catch (error) {
  if (error.code === '23505') {
    // Unique constraint violation
    throw new Error('Duplicate entry');
  }
  throw error;
}
```

### 4. Transactions
```typescript
// Use Drizzle transactions (recommended)
await db.transaction(async (tx) => {
  const user = await tx.insert(users).values(newUser).returning();
  await tx.insert(cases).values({ userId: user[0].id });
  // Automatic commit on success, rollback on error
});

// Or use postgres-js directly
await client.begin(async (sql) => {
  await sql`INSERT INTO users VALUES (${data})`;
  await sql`INSERT INTO cases VALUES (${caseData})`;
});
```

## Verification Checklist

- [x] evidence-service uses `drizzle-orm/postgres-js`
- [x] evidence-service uses `postgres` package
- [x] Schema pushed successfully with pgvector support
- [x] All 5 tables created (cases, evidences, embeddings, analysis_jobs, case_timeline)
- [x] HNSW vector indexes created
- [ ] sveltekit-frontend fully migrated (needs verification)
- [ ] All scripts updated to postgres-js
- [ ] MCP servers updated to postgres-js
- [ ] Test files updated to postgres-js
- [ ] App-wide type-check passes with no pg-related errors
- [ ] Integration tests passing

## Next Steps

1. **Run app-wide search**: Find all remaining `pg` and `drizzle-orm/node-postgres` imports
2. **Update scripts**: Migrate all files in `scripts/` directory
3. **Update MCP servers**: Migrate `mcp-servers/context7-server.js`
4. **Update tests**: Migrate test files to postgres-js
5. **Type-check**: Run `npx tsc --noEmit` in all projects
6. **Integration test**: Verify evidence-service GraphQL API + workers

## References

- [postgres-js GitHub](https://github.com/porsager/postgres)
- [Drizzle ORM - PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql)
- [pgvector Documentation](https://github.com/pgvector/pgvector)
- [Evidence Service README](./evidence-service/README.md)
