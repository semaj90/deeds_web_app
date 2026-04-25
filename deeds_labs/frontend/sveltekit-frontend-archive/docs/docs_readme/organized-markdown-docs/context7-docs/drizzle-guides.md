# Drizzle ORM Guides (Summary)

Drizzle ORM is a lightweight, performant TypeScript ORM focused on developer experience. Here are key guidelines and best practices extracted from the official docs:

## Key Concepts

- **Type Safety:** Drizzle provides full TypeScript type safety for schema, queries, and results.
- **Schema Definition:** Define your database schema in TypeScript using Drizzle's schema utilities.
- **Migrations:** Use Drizzle's migration tools to manage schema changes safely and predictably.
- **Query Building:** Write SQL-like queries in TypeScript with autocompletion and type checking.
- **Performance:** Minimal runtime overhead, optimized for modern Node.js and edge runtimes.

## Best Practices

- Keep schema and queries in sync with your database using migrations.
- Use TypeScript types everywhere for safety and maintainability.
- Prefer Drizzle's query builder for complex queries; raw SQL is available for advanced use.
- Organize schema, queries, and migrations in clear, separate files.
- Use environment variables for database connection strings.
- Test migrations and queries in development before deploying to production.

## Common Gotchas

- Always run migrations after schema changes.
- Type errors often indicate schema/query mismatches—fix types, not just code.
- Drizzle is not a full ORM (no entity manager, no lazy loading)—embrace its functional, explicit style.
- Use connection pooling for production deployments.

## References

- [Drizzle ORM Docs](https://orm.drizzle.team/docs)
- [Drizzle ORM GitHub](https://github.com/drizzle-team/drizzle-orm)
