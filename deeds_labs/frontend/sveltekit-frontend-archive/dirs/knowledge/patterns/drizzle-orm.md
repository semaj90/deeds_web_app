---
title: Drizzle ORM Patterns & Best Practices
description: Guide to using Drizzle ORM with PostgreSQL, including schema definition, queries, and migrations.
tags: [drizzle, orm, postgres, database, sql]
type: pattern
---

# Drizzle ORM Patterns

## 1. Schema Definition

Define schemas in `src/lib/server/db/schema-postgres.ts`.

```typescript
import { pgTable, serial, text, timestamp, boolean, integer } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  role: text('role').default('user'),
  createdAt: timestamp('created_at').defaultNow(),
  isActive: boolean('is_active').default(true)
});

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content'),
  authorId: integer('author_id').references(() => users.id),
  published: boolean('published').default(false)
});
```

## 2. Queries

### Select
```typescript
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema-postgres';
import { eq, desc } from 'drizzle-orm';

// Select all
const allUsers = await db.select().from(users);

// Select with where and order
const activeUsers = await db.select()
  .from(users)
  .where(eq(users.isActive, true))
  .orderBy(desc(users.createdAt));

// Select partial
const userNames = await db.select({
    id: users.id,
    name: users.name
  })
  .from(users);
```

### Insert
```typescript
const newUser = await db.insert(users).values({
  email: 'test@example.com',
  name: 'Test User'
}).returning();
```

### Update
```typescript
await db.update(users)
  .set({ isActive: false })
  .where(eq(users.id, 1));
```

### Delete
```typescript
await db.delete(users).where(eq(users.id, 1));
```

## 3. Relations (Query Builder)

Use `db.query` for relational queries if relations are defined.

```typescript
const userWithPosts = await db.query.users.findFirst({
  where: eq(users.id, 1),
  with: {
    posts: true
  }
});
```

## 4. Migrations

Run migrations using Drizzle Kit.

```bash
# Generate migration
npx drizzle-kit generate:pg

# Push changes (dev)
npx drizzle-kit push:pg
```

## 5. Best Practices

*   **Type Safety**: Always use inferred types from Drizzle.
*   **Prepared Statements**: Use prepared statements for repeated queries.
*   **Transactions**: Use `db.transaction` for atomic operations.
*   **Environment**: Ensure `DATABASE_URL` is set in `.env`.
