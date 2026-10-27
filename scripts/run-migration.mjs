import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

dotenv.config({ path: path.resolve(REPO_ROOT, '.env') });

/** Credentials come from the environment only; there is no fallback connection string. */
export function resolveDatabaseUrl(env = process.env) {
  const value = env.DATABASE_URL;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('DATABASE_URL_NOT_CONFIGURED: set DATABASE_URL in .env.local or the environment; no default credential is used.');
  }
  return value;
}

/** Host/database only, never the user info. */
export function redactDatabaseUrl(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return '<unparseable DATABASE_URL>';
  }
}

const args = process.argv.slice(2);
const sqlIdx = args.findIndex((arg) => arg === '--sql' || arg === '--file');
const sqlFileArg = sqlIdx >= 0 ? args[sqlIdx + 1] : null;
const sqlFilePath = path.resolve(
  REPO_ROOT,
  sqlFileArg || 'sveltekit-frontend/drizzle/manual/gpu_codebase_wiki_schema.sql',
);

async function run() {
  const DATABASE_URL = resolveDatabaseUrl();
  console.log(`Loading SQL schema from: ${sqlFilePath}`);
  if (!fs.existsSync(sqlFilePath)) {
    console.error(`File does not exist: ${sqlFilePath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlFilePath, 'utf8');
  console.log(`Connecting to Postgres database at ${redactDatabaseUrl(DATABASE_URL)}...`);
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    console.error(String(err?.message ?? err));
    process.exit(1);
  });
}
