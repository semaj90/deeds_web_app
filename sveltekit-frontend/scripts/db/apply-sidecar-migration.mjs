import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

const args = process.argv.slice(2);
const migrationFile = args[0];

if (!migrationFile) {
  console.error("Usage: node apply-sidecar-migration.mjs <path-to-sql-file>");
  process.exit(1);
}

const fullPath = path.resolve(process.cwd(), migrationFile);
if (!fs.existsSync(fullPath)) {
  console.error(`Migration file not found: ${fullPath}`);
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL environment variable is not set.");
  process.exit(1);
}

try {
  console.log(`Applying sidecar migration: ${migrationFile}...`);
  // Use psql to apply the raw SQL since Drizzle can't process it natively
  execSync(`psql "${dbUrl}" -f "${fullPath}"`, { stdio: 'inherit' });
  console.log("Migration applied successfully.");
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exit(1);
}
