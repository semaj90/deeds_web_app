# Drizzle ORM 0.44 + PostgreSQL Patterns

**Version**: drizzle-orm 0.44.6
**Database**: PostgreSQL 17
**Last Updated**: January 9, 2026

## Installation

```bash
npm install drizzle-orm pg
npm install -D drizzle-kit @types/pg
```

## Schema Definition

### Basic Table
```typescript
import { pgTable, serial, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  isActive: boolean('is_active').default(true)
});
```

### Relations
```typescript
import { pgTable, serial, text, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull()
});

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  authorId: integer('author_id').references(() => users.id)
});

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts)
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id]
  })
}));
```

### PostgreSQL-Specific Types
```typescript
import { pgTable, uuid, jsonb, vector } from 'drizzle-orm/pg-core';

export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  metadata: jsonb('metadata'),
  embedding: vector('embedding', { dimensions: 768 })
});
```

## Database Connection

### With Connection String
```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
export const db = drizzle(client);
```

### With pg Pool
```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export const db = drizzle(pool);
```

## Queries

### Select
```typescript
import { db } from './db';
import { users } from './schema';
import { eq, and, or, like, gte } from 'drizzle-orm';

// Select all
const allUsers = await db.select().from(users);

// Select specific columns
const userEmails = await db
  .select({ id: users.id, email: users.email })
  .from(users);

// Where clause
const activeUsers = await db
  .select()
  .from(users)
  .where(eq(users.isActive, true));

// Multiple conditions
const result = await db
  .select()
  .from(users)
  .where(
    and(
      eq(users.isActive, true),
      gte(users.createdAt, new Date('2024-01-01'))
    )
  );

// LIKE operator
const searchResults = await db
  .select()
  .from(users)
  .where(like(users.name, '%john%'));
```

### Insert
```typescript
// Single insert
await db.insert(users).values({
  email: 'user@example.com',
  name: 'John Doe'
});

// Multiple inserts
await db.insert(users).values([
  { email: 'user1@example.com', name: 'User 1' },
  { email: 'user2@example.com', name: 'User 2' }
]);

// Returning inserted row
const [newUser] = await db
  .insert(users)
  .values({ email: 'new@example.com' })
  .returning();
```

### Update
```typescript
// Update with where
await db
  .update(users)
  .set({ name: 'Updated Name' })
  .where(eq(users.id, 1));

// Update returning
const [updated] = await db
  .update(users)
  .set({ isActive: false })
  .where(eq(users.id, 1))
  .returning();
```

### Delete
```typescript
// Delete with where
await db
  .delete(users)
  .where(eq(users.id, 1));

// Delete returning
const [deleted] = await db
  .delete(users)
  .where(eq(users.email, 'user@example.com'))
  .returning();
```

## Joins

```typescript
import { users, posts } from './schema';

const usersWithPosts = await db
  .select({
    userId: users.id,
    userName: users.name,
    postId: posts.id,
    postTitle: posts.title
  })
  .from(users)
  .leftJoin(posts, eq(users.id, posts.authorId));
```

## Transactions

```typescript
await db.transaction(async (tx) => {
  const [user] = await tx
    .insert(users)
    .values({ email: 'tx@example.com' })
    .returning();

  await tx
    .insert(posts)
    .values({ title: 'Post 1', authorId: user.id });
});
```

## Prepared Statements

```typescript
const getUserById = db
  .select()
  .from(users)
  .where(eq(users.id, placeholder('id')))
  .prepare('get_user_by_id');

const user = await getUserById.execute({ id: 1 });
```

## Migrations

### Generate Migration
```bash
npx drizzle-kit generate
```

### Apply Migrations
```bash
npx drizzle-kit push
```

### Migration Files
```typescript
// drizzle/0001_create_users.sql
CREATE TABLE "users" (
  "id" SERIAL PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "name" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL
);
```

## SvelteKit Integration

### Server Hook
```typescript
// src/hooks.server.ts
import { db } from '$lib/server/db';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.db = db;
  return resolve(event);
};
```

### API Route
```typescript
// src/routes/api/users/+server.ts
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const allUsers = await db.select().from(users);
  return json(allUsers);
};

export const POST: RequestHandler = async ({ request }) => {
  const data = await request.json();
  const [newUser] = await db
    .insert(users)
    .values(data)
    .returning();
  return json(newUser);
};
```

### Load Function
```typescript
// src/routes/users/+page.server.ts
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const allUsers = await db.select().from(users);
  return { users: allUsers };
};
```

## Type Inference

```typescript
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';
import { users } from './schema';

// Infer types from schema
export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

// Usage
const user: User = {
  id: 1,
  email: 'user@example.com',
  name: 'John',
  createdAt: new Date(),
  isActive: true
};

const newUser: NewUser = {
  email: 'new@example.com',
  name: 'Jane'
  // id, createdAt, isActive are optional (have defaults)
};
```

## Common Patterns

### Pagination
```typescript
const page = 1;
const pageSize = 10;

const paginatedUsers = await db
  .select()
  .from(users)
  .limit(pageSize)
  .offset((page - 1) * pageSize);
```

### Counting
```typescript
import { count } from 'drizzle-orm';

const [{ value: totalUsers }] = await db
  .select({ value: count() })
  .from(users);
```

### Aggregation
```typescript
import { avg, sum, max, min } from 'drizzle-orm';

const stats = await db
  .select({
    avgAge: avg(users.age),
    totalAge: sum(users.age),
    maxAge: max(users.age),
    minAge: min(users.age)
  })
  .from(users);
```

## Resources

- [Drizzle ORM Documentation](https://orm.drizzle.team/docs/overview)
- [PostgreSQL Column Types](https://orm.drizzle.team/docs/column-types/pg)
- [Drizzle Kit CLI](https://orm.drizzle.team/kit-docs/overview)
