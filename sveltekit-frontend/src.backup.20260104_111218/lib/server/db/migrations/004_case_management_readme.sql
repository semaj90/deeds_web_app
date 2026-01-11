-- Migration note: case management and related tables -- The comprehensive schema for cases, evidence, timeline,
citations, -- POI relationships and detective insights has been added in migration --
003_deploy_enhanced_legal_schema.sql. If you need to re-run or adjust, -- create a new migration here with a unique
prefix (004_...) -- To apply migrations via drizzle: -- npx drizzle-kit migrate -- or if using the project's runner: --
node src/lib/server/db/migrate.ts -- If you need a separate migration adding indexes or triggers, create -- a new .sql
file in this folder and include it in the migration runner.
