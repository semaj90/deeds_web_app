import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationFile = path.resolve(__dirname, '../drizzle/0000_puzzling_mongu.sql');

if (!fs.existsSync(migrationFile)) {
    console.error('Migration file not found:', migrationFile);
    process.exit(1);
}

let content = fs.readFileSync(migrationFile, 'utf-8');

// Replacements
// 1. CREATE TYPE ... AS ENUM -> Idempotent check
content = content.replace(
    /CREATE TYPE "public"\."([^"]+)" AS ENUM\(([^)]+)\);/g,
    (match, typeName, enumValues) => {
        return `DO $$ BEGIN IF to_regtype('public.${typeName}') IS NULL THEN CREATE TYPE "public"."${typeName}" AS ENUM(${enumValues}); END IF; END $$;`;
    }
);

// 2. CREATE TABLE "name" -> CREATE TABLE IF NOT EXISTS "name"
content = content.replace(/CREATE TABLE "/g, 'CREATE TABLE IF NOT EXISTS "');

// 3. ALTER TABLE ... ADD CONSTRAINT -> Idempotent (skip if exists)
content = content.replace(
    /ALTER TABLE "([^"]+)" ADD CONSTRAINT "([^"]+)" ([^;]+);/g,
    (match, tableName, constraintName, rest) => {
        return `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${constraintName}') THEN ALTER TABLE "${tableName}" ADD CONSTRAINT "${constraintName}" ${rest}; END IF; END $$;`;
    }
);

fs.writeFileSync(migrationFile, content);
console.log('Made 0000_puzzling_mongu.sql idempotent.');
