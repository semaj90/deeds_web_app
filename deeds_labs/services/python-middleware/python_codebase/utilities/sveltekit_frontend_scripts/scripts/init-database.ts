import { Client } from 'pg';

/**
 * Simple DB init script:
 * - Connects to admin DB (postgres) to create target DB if missing
 * - Connects to target DB and runs: CREATE EXTENSION IF NOT EXISTS vector;
 *
 * Usage:
 *   TS (with ts-node): ts-node scripts/init-database.ts [target_db_name]
 *   Env vars supported: PGHOST, PGPORT, PGUSER, PGPASSWORD
 */

const TARGET_DB = process.argv[2] || process.env.TARGET_DB || 'prosecutor_db';

function buildConnConfig(dbName = 'postgres') {
  // Prefer a full connection string if provided
  const connString = process.env.PG_CONNECTION_STRING || process.env.DATABASE_URL;
  if (connString) return { connectionString: connString.replace(/\/\w+$/, `/${dbName}`) };

  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || process.env.USER || 'postgres',
    password: process.env.PGPASSWORD || undefined,
    database: dbName,
  };
}

async function ensureDatabaseExists(adminClient: Client, dbName: string) {
  const res = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (res.rowCount === 0) {
    console.log(`Creating database '${dbName}'...`);
    // CREATE DATABASE cannot run inside a transaction block; ensure simple query
    await adminClient.query(`CREATE DATABASE ${dbName}`);
    console.log(`Database '${dbName}' created.`);
  } else {
    console.log(`Database '${dbName}' already exists.`);
  }
}

async function ensurePgvectorExtension(targetClient: Client) {
  console.log('Ensuring pgvector extension (vector) is installed...');
  await targetClient.query('CREATE EXTENSION IF NOT EXISTS vector;');
  console.log('pgvector extension ensured.');
}

async function main() {
  const adminConfig = buildConnConfig('postgres');
  const adminClient = new Client(adminConfig);

  try {
    await adminClient.connect();
    await ensureDatabaseExists(adminClient, TARGET_DB);
  } catch (err: any) {
    console.error('Failed to ensure database exists:', err?.message ?? err);
    await adminClient.end().catch(() => {});
    process.exit(2);
  } finally {
    await adminClient.end().catch(() => {});
  }

  // Connect to target DB and ensure extension
  const targetConfig = buildConnConfig(TARGET_DB);
  const targetClient = new Client(targetConfig);

  try {
    await targetClient.connect();
    await ensurePgvectorExtension(targetClient);

    // Optionally show current extensions (helpful for debugging)
    const ext = await targetClient.query(
      "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'"
    );
    // Guard against null/undefined rowCount (pg types may allow null)
    if ((ext?.rowCount ?? 0) > 0) {
      console.log('Installed extension:', ext.rows?.[0]);
    } else {
      console.log('pgvector not found after install attempt (unexpected).');
    }

    console.log('Initialization complete.');
    process.exit(0);
  } catch (err: any) {
    console.error('Failed to initialize target database:', err?.message ?? err);
    process.exit(3);
  } finally {
    await targetClient.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err?.message ?? err);
  process.exit(4);
});
