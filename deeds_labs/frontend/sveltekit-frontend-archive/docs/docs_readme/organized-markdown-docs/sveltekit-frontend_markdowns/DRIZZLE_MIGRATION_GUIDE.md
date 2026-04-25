# Drizzle ORM Migration & Best Practices Guide

## Overview

This guide covers the best practices for using Drizzle ORM with JSON fields, custom ID generation, and proper SvelteKit integration. Your setup now includes:

- **Type-safe JSON fields** with Zod validation
- **Custom ID generation** using CUID2 (where appropriate)
- **Proper separation** of concerns between Lucia auth and custom tables
- **Vector search** capabilities with pgvector
- **Efficient migration workflow** using drizzle-kit and node-postgres

## Migration Workflow

### The Two-Step Process

1. **Generate Migration Files** (Safe)

   ```bash
   npm run db:generate
   ```

   This creates SQL migration files in `./drizzle/` that you can review before applying.

2. **Apply Migrations** (Uses your migrate.ts script)
   ```bash
   npm run db:migrate
   ```
   This runs your custom migration script that safely applies changes to your database.

### Complete Development Workflow

```bash
# 1. Start your database (if not already running)
npm run db:start

# 2. Make changes to your schema in unified-schema.ts
# (Edit your schema file)

# 3. Generate migration files
npm run db:generate

# 4. Review the generated SQL in ./drizzle/
# (Always review migrations before applying!)

# 5. Apply the migrations
npm run db:migrate

# 6. Start your development server
npm run dev
```

## JSON Fields Best Practices

### 1. Type-Safe JSON with Zod

Your setup now uses Zod schemas for type-safe JSON fields:

```typescript
// Define Zod schema
export const userSettingsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).default("system"),
  notifications: z.object({
    email: z.boolean().default(true),
    push: z.boolean().default(false),
  }),
});

// Export TypeScript type
export type UserSettings = z.infer<typeof userSettingsSchema>;

// Use in Drizzle schema
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  settings: jsonb("settings")
    .$type<UserSettings>()
    .default({
      theme: "system",
      notifications: { email: true, push: false },
    })
    .notNull(),
});
```

### 2. Validation in API Endpoints

Always validate JSON data before database operations:

```typescript
// In your API routes
import { userSettingsSchema } from "$lib/server/db/unified-schema.ts";

export async function PATCH({ request, locals }) {
  const data = await request.json();

  // Validate the settings object
  const validatedSettings = userSettingsSchema.parse(data.settings);

  // Safe to use in database
  await db
    .update(users)
    .set({ settings: validatedSettings })
    .where(eq(users.id, locals.user.id));
}
```

## Custom ID Generation

### When to Use Custom IDs vs. Lucia IDs

**Use Lucia's ID generation for:**

- `users` table
- `sessions` table
- Any auth-related tables

**Use custom CUID2 generation for:**

- `legalDocuments` table
- `notes` table
- `savedCitations` table
- Any non-auth business logic tables

### Custom ID Example

```typescript
import { createId } from "@paralleldrive/cuid2";

export const legalDocuments = pgTable("legal_documents", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  // ... other fields
});
```

### Lucia ID Example

```typescript
// In your auth code
import { generateId } from "lucia";

const userId = generateId(15);
await db.insert(users).values({
  id: userId,
  email: "user@example.com",
  // ... other fields
});
```

## SvelteKit API Best Practices

### 1. Use Form Actions for Mutations

For user-initiated actions (forms), use form actions:

```typescript
// src/routes/documents/+page.server.ts
import type { Actions } from "./$types";

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const formData = await request.formData();
    const title = formData.get("title") as string;

    const documentId = createId();
    await db.insert(legalDocuments).values({
      id: documentId,
      title,
      userId: locals.user.id,
    });

    return { success: true, documentId };
  },

  update: async ({ request, locals }) => {
    const formData = await request.formData();
    const id = formData.get("id") as string;
    const title = formData.get("title") as string;

    await db
      .update(legalDocuments)
      .set({ title, updatedAt: new Date() })
      .where(eq(legalDocuments.id, id));

    return { success: true };
  },
};
```

### 2. Use +server.ts for API Endpoints

For programmatic access (fetch from client, third-party APIs):

```typescript
// src/routes/api/documents/[id]/+server.ts
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals }) => {
  const document = await db.query.legalDocuments.findFirst({
    where: eq(legalDocuments.id, params.id),
  });

  if (!document) {
    return json({ error: "Document not found" }, { status: 404 });
  }

  return json(document);
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const data = await request.json();

  // Validate the data
  const validatedData = documentMetadataSchema.parse(data.metadata);

  await db
    .update(legalDocuments)
    .set({
      metadata: validatedData,
      updatedAt: new Date(),
    })
    .where(eq(legalDocuments.id, params.id));

  return json({ success: true });
};
```

## Database Schema Highlights

### Your Enhanced Schema Includes:

1. **Type-Safe JSON Fields:**
   - `users.settings` - User preferences with full type safety
   - `legalDocuments.metadata` - Document metadata with Zod validation
   - `legalDocuments.citations` - Strongly typed legal citations
   - `legalDocuments.autoSaveData` - Auto-save functionality data

2. **Custom ID Generation:**
   - `legalDocuments.id` - Uses CUID2 for unique, sortable IDs
   - `notes.id` - CUID2 for notes system
   - `savedCitations.id` - CUID2 for citation management

3. **Vector Search Ready:**
   - Title and content embeddings for semantic search
   - Proper HNSW indexes for fast similarity search
   - OpenAI-compatible 1536-dimension vectors

4. **Efficient Indexing:**
   - Traditional B-tree indexes for fast filtering
   - Vector indexes for semantic search
   - Composite indexes for complex queries

## Important Notes

### Migration Safety

- **Never use `drizzle-kit push`** in production
- **Always review** generated migrations before applying
- **Test migrations** on a copy of your data first
- **Backup your database** before running migrations

### JSON Field Validation

- **Always validate** JSON data with Zod before database operations
- **Use type assertions** only after validation
- **Handle validation errors** gracefully in your API endpoints

### Performance Considerations

- **Index frequently queried** JSON fields using generated columns
- **Avoid deep nesting** in JSON structures
- **Use separate tables** for complex relationships instead of JSON arrays

## Testing Your Setup

Run the migration workflow to test everything:

```bash
# Generate migrations for your new schema
npm run db:generate

# Apply the migrations
npm run db:migrate

# Start your development server
npm run dev
```

Your schema is now ready for production use with type-safe JSON fields, custom ID generation, and proper SvelteKit integration!
