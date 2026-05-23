import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

dotenv.config({ path: path.resolve(REPO_ROOT, '.env') });

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const args = process.argv.slice(2);
const sqlIdx = args.findIndex((arg) => arg === '--sql' || arg === '--file');
const sqlFileArg = sqlIdx >= 0 ? args[sqlIdx + 1] : null;
const sqlFilePath = path.resolve(
  REPO_ROOT,
  sqlFileArg || 'sveltekit-frontend/drizzle/manual/gpu_codebase_wiki_schema.sql',
);

async function run() {
  console.log(`Loading SQL schema from: ${sqlFilePath}`);
  if (!fs.existsSync(sqlFilePath)) {
    console.error(`File does not exist: ${sqlFilePath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlFilePath, 'utf8');
  console.log(`Connecting to Postgres database at ${DATABASE_URL}...`);
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    console.log('Executing SQL schema...');
    await pool.query(sql);
    console.log('✅ SQL schema applied successfully!');
  } catch (err) {
    console.error('❌ SQL execution failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
