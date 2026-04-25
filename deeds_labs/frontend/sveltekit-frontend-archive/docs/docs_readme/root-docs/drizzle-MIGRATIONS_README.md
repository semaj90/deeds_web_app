Repository migration helpers (drizzle-kit + manual templates)

This project uses drizzle-kit for schema generation and migrations, and it includes small helpers to create manual SQL migrations for database features that require careful control (Postgres enums, RLS policies, CHECK constraints, materialized views).

Scripts

- npm run db:make-migration -- <type> [--options]
  Creates a timestamped SQL migration in `drizzle/migrations` using a template.

Types and examples

1) Add enum value (safe, additive):

npm run db:make-migration -- enum-add --type my_enum --value new_value

This creates a migration that runs:

ALTER TYPE my_enum ADD VALUE IF NOT EXISTS 'new_value';

Note: For removing/renaming enum values, create a new enum and migrate values manually.

2) Create RLS policy

npm run db:make-migration -- rls --table my_table --policy "owner_id = current_setting('app.current_user_id')::uuid"

This creates migrations that enable RLS for `my_table`, create a policy, and grant access. Store them in git and use them in your deployment flow.

At runtime, set the session variable before running queries in a connection/transaction:

SET LOCAL app.current_user_id = '<uuid>';

3) Add a CHECK constraint

npm run db:make-migration -- check --table my_table --constraint "amount >= 0" --name positive_amount

4) Create a materialized view

npm run db:make-migration -- mv --name my_mv --sql "SELECT id, content FROM documents WHERE is_indexed"

This creates:

CREATE MATERIALIZED VIEW my_mv AS ...;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_my_mv_id ON my_mv (id);

Applying migrations

- Use `npx drizzle-kit migrate` to run migrations (or your CI/k8s pipeline).
- For complex operations (refreshing materialized views concurrently), consider adding separate maintenance scripts or run them as post-deploy tasks.

Notes and best practices

- Keep TypeScript schema in sync with manual SQL migrations. Code-first generation is helpful but not authoritative for DB features like RLS and enum non-additive changes.
- Write hand-crafted migrations for anything destructive (enum removals, renames, data transformations).
- Test RLS and enum migration workflows in a staging environment before production.
