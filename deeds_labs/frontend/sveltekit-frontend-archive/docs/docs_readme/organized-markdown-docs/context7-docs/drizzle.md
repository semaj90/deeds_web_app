# Drizzle ORM Quick Reference

Drizzle ORM is a type-safe, SQL-like ORM for JavaScript/TypeScript, ideal for PostgreSQL and pgvector in SvelteKit apps.

## Key Concepts

- **Schema Definition:** Define tables and columns in TypeScript for full type safety.
- **Migrations:** Use drizzle-kit to generate and run migrations from your schema.
- **Query Builder:** Write queries using a fluent, type-safe API (no raw SQL needed for most cases).
- **PostgreSQL & pgvector:** Supports advanced types and extensions, including vector columns for AI/embedding use cases.

## Best Practices

- Always define your schema in a single source of truth (e.g., `src/lib/server/db/schema.ts`).
- Use drizzle-kit for migrations; never edit the database manually.
- Prefer the query builder for all queries; use raw SQL only for advanced cases.
- Use `eq`, `and`, `or`, etc. from drizzle-orm for conditions.
- Store embeddings in a `vector` column for pgvector integration.
- Use TypeScript types generated from your schema for all data access.

## Common Gotchas

- Always run `drizzle-kit generate:pg` after changing your schema.
- Make sure your database URL is set in `.env` for migrations and runtime.
- Use `await db.select().from(table)` for queries; avoid `db.query` unless needed.
- For pgvector, ensure the extension is enabled in your database.

## References

- [Drizzle ORM Docs](https://orm.drizzle.team/docs/overview)
- [drizzle-kit CLI](https://orm.drizzle.team/docs/cli)
- [pgvector Docs](https://github.com/pgvector/pgvector)
