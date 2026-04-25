import type { defineConfig  } from 'drizzle-kit';

export default defineConfig({
  // point to your TS schema files
  schema: 'src/lib/db/schema/*.ts',
  // where generated introspection/migrations / client code will be written
  out: 'drizzle',
  // use the postgres-js driver
  driver: 'postgres',
  dbCredentials: {
    // postgres-js expects a full connection URL
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/deeds',
  },
  // optional: keep your migrations in a specific folder
  migrationsFolder: 'drizzle/migrations',
});
