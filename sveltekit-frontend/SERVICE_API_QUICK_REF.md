# Service API Quick Reference

## 🔴 Redis (node-redis v4+)

```typescript
import { createClient } from 'redis';

const client = createClient({ url: 'redis://localhost:6379' });
await client.connect(); // Required!

// ✅ Correct (camelCase)          ❌ Wrong (lowercase)
await client.hSet(k, f, v)         await client.hset(k, f, v)
await client.lPush(k, v)           await client.lpush(k, v)
await client.setEx(k, s, v)        await client.setex(k, s, v)
```

## 🟢 Drizzle ORM

```typescript
import { sql } from 'drizzle-orm';

// ✅ Correct (template literal)   ❌ Wrong (direct call)
sql`${sql.raw(expr)}`              sql.raw(expr)

// pgvector example
const emb = '[0.1, 0.2]';
sql`INSERT INTO embeddings (vector) VALUES (${sql.raw(emb)}::vector)`
```

## 🔵 Qdrant (@qdrant/js-client-rest)

```typescript
import { QdrantClient } from '@qdrant/js-client-rest';

// ✅ Correct                      ❌ Wrong
await client.getCollections()     await client.listCollections()
```

## 🟡 PostgreSQL (pg)

```typescript
// ✅ Correct (destructure rows)   ❌ Wrong (missing destructure)
const { rows } = await pool.query(...)
const users = rows;                const users = await pool.query(...)
```

---

**Full Documentation**: See `LIBRARY_API_PATTERNS.md`
**Error Guide**: See `ERROR_BREAKDOWN_REPORT.md`
**Session Summary**: See `SESSION_SUMMARY_2025-01-15.md`
