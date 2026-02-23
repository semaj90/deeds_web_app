import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_test',
  },
  verbose: true,
  strict: true,
});
