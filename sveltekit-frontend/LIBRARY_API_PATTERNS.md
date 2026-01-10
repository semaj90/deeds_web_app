# Library API Patterns - Knowledge Base

## Redis Client (`node-redis` v4+)

### Package: `redis` (NOT `ioredis`)

**Key Differences from IORedis:**
- Uses `createClient()` factory, not constructor
- Methods are camelCase: `hSet`, `hGet`, `lPush`, `lRange` (not lowercase)
- Requires explicit `.connect()` before use
- Returns `Promise<T>` for all operations

**Common Operations:**
```typescript
import { createClient } from 'redis';

const client = createClient({ url: redisUrl });
await client.connect();

// Simple KV operations
await client.set(key, value);              // ✅ Correct
await client.setEx(key, seconds, value);   // ✅ Correct (not setex)
const val = await client.get(key);

// Hash operations
await client.hSet(key, field, value);      // ✅ Correct (camelCase)
const val = await client.hGet(key, field);
const all = await client.hGetAll(key);

// List operations
await client.lPush(key, value);            // ✅ Correct (camelCase)
const range = await client.lRange(key, start, stop);

// Utility
await client.del(key);
const exists = await client.exists(key);
await client.incr(key);
```

**Wrapper Implementation** (`src/lib/server/cache/redis.ts`):
- Exports object with async methods
- All methods call `getRedisClient()` first
- Uses proper camelCase method names from node-redis v4

---

## Qdrant Client (`@qdrant/js-client-rest`)

### Package: `@qdrant/js-client-rest`

**Initialization:**
```typescript
import { QdrantClient } from '@qdrant/js-client-rest';

const client = new QdrantClient({
  url: `http://${host}:${port}`,
  apiKey: 'optional-api-key',
  timeout: 30000
});
```

**Common Operations:**
```typescript
// Collections
const collections = await client.getCollections();  // ✅ Current method
// Returns: { collections: Array<{ name: string }> }

await client.createCollection('my_collection', {
  vectors: { size: 384, distance: 'Cosine' }
});

await client.deleteCollection('my_collection');

// Vector operations
await client.upsert('collection_name', {
  points: [
    {
      id: 'uuid-or-string',
      vector: [0.1, 0.2, ...],
      payload: { key: 'value' }
    }
  ]
});

const results = await client.search('collection_name', {
  vector: [0.1, 0.2, ...],
  limit: 10,
  with_payload: true,
  with_vector: false
});
```

**Method Status:**
- ✅ `getCollections()` - Current method (not `listCollections()`)
- ✅ `createCollection(name, config)`
- ✅ `deleteCollection(name)`
- ✅ `upsert(collection, { points })`
- ✅ `search(collection, { vector, limit, ... })`

**Note:** As of `@qdrant/js-client-rest` v1.x, the method is `getCollections()`, not `listCollections()`. May change in future versions.

---

## Drizzle ORM (`drizzle-orm`)

### Package: `drizzle-orm`

**sql.raw() Template Syntax:**

**OLD (Pre-v0.30):**
```typescript
// ❌ Old syntax (deprecated)
db.execute(sql.raw(dynamicSQL));
```

**NEW (v0.30+):**
```typescript
// ✅ New template syntax
import { sql } from 'drizzle-orm';

// For dynamic SQL expressions
db.execute(sql`${sql.raw(dynamicExpression)}`);

// For pgvector operations
const embedding = '[0.1, 0.2, 0.3]';
await db.execute(
  sql`INSERT INTO embeddings (vector) VALUES (${sql.raw(embedding)}::vector)`
);
```

**Examples from Codebase:**
```typescript
// Vector embedding storage
await this.db.execute(
  sql`INSERT INTO error_embeddings (error_id, embedding, metadata)
      VALUES (${errorId}, ${sql.raw(`'[${vector.join(',')}]'`)}::vector, ${metadata})`
);

// Vector similarity search
const results = await this.db.execute(
  sql`SELECT id, metadata, 1 - (embedding <=> ${sql.raw(`'[${queryVector.join(',')}]'`)}::vector) as similarity
      FROM error_embeddings
      ORDER BY embedding <=> ${sql.raw(`'[${queryVector.join(',')}]'`)}::vector
      LIMIT ${limit}`
);
```

**Key Pattern:**
- Wrap dynamic SQL with `sql.raw()`
- Embed in template literal: `sql\`${sql.raw(...)}\``
- For pgvector: Cast with `::vector` after the raw expression

---

## PostgreSQL (`pg`)

### Package: `pg`

**Pool Initialization:**
```typescript
import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'legal',
  user: 'user',
  password: 'password',
  max: 20,
  idleTimeoutMillis: 30000
});
```

**Query Results:**
```typescript
// ✅ Correct: pg always returns { rows, fields, ... }
const result = await pool.query('SELECT * FROM users');
console.log(result.rows); // Array of row objects

// With parameters
const result = await pool.query(
  'SELECT * FROM users WHERE id = $1',
  [userId]
);
```

**Note:** Unlike Drizzle ORM, raw `pg` Pool always returns `{ rows: T[] }`, not just `T[]`.

---

## Service Integration Architecture

### Multi-Tier Pattern

```
Routes (src/routes/api/*)
    ↓
Adapter Hub (service-integrations.ts)
    ↓ (implements)
Type Contracts (external-services.ts)
    ↓ (uses)
External SDKs (node-redis, @qdrant/js-client-rest, pg, etc.)
```

### Adapter Classes (service-integrations.ts)

1. **OllamaAdapter** - AI text generation and embeddings
2. **RedisCacheAdapter** - Cache and session storage
3. **QdrantAdapter** - Vector database operations
4. **PgVectorAdapter** - PostgreSQL + pgvector similarity search
5. **MinIOAdapter** - Object storage
6. **Neo4jAdapter** - Graph database
7. **RabbitMQAdapter** - Message queue

### Environment Loading
```typescript
export function loadServiceEnvironment(): ServiceEnvironment {
  return {
    ollama: { baseUrl: process.env.OLLAMA_URL || 'http://localhost:11434' },
    redis: { url: process.env.REDIS_URL || 'redis://localhost:6379/0' },
    qdrant: { host: 'localhost', port: 6333 },
    postgres: { host: 'localhost', port: 5432, database: 'legal', ... },
    minio: { host: 'localhost', port: 9000 },
    neo4j: { uri: process.env.NEO4J_URI, username: 'neo4j' },
    rabbitmq: { host: 'localhost', port: 5672 }
  };
}
```

---

## Common Type Errors

### 1. Redis Method Names
```typescript
// ❌ Wrong (ioredis style)
await redis.hset(key, field, value);

// ✅ Correct (node-redis v4)
await redis.hSet(key, field, value);
```

### 2. Drizzle sql.raw()
```typescript
// ❌ Wrong (old syntax)
await db.execute(sql.raw(dynamicSQL));

// ✅ Correct (new syntax)
await db.execute(sql`${sql.raw(dynamicSQL)}`);
```

### 3. Query Result Destructuring
```typescript
// ❌ Wrong (assumes Drizzle returns array)
const users = await pool.query('SELECT * FROM users');

// ✅ Correct (pg returns { rows })
const { rows: users } = await pool.query('SELECT * FROM users');
```

### 4. Qdrant Collection Listing
```typescript
// ✅ Correct (current method name)
const result = await client.getCollections();
const names = result.collections.map(c => c.name);

// ⚠️ May be listCollections() in future versions
```

---

## Error Patterns from svelte-check

### High-Frequency Errors:

1. **ComponentCtor errors** (~500-1000) - bits-ui type inference limitation, cosmetic only
2. **XState type errors** (~60,000) - Major refactor needed, state machine types don't match v5 API
3. **Service adapter mismatches** (~7,000) - Type definitions don't match actual SDK APIs
4. **Query destructuring** (~2,000) - `.rows` property access on Drizzle queries

### Priority Fix Order:

1. ✅ UI components - Duplicate `$state` declarations (COMPLETED)
2. ✅ Drizzle sql.raw() - Template literal syntax (PARTIALLY COMPLETE)
3. 🔄 Redis methods - camelCase corrections (IN PROGRESS)
4. 🔄 Type definition updates - external-services.ts alignment
5. ⏳ Query result destructuring - Remove `.rows` where needed
6. ⏳ XState migration - Major refactor, deferred

---

## Last Updated
2025-01-15 - Initial knowledge base compiled from Microsoft docs search and codebase analysis
