const { Client } = require('pg');

const TARGET_DB =
  process.argv[2] || process.env.TARGET_DB || process.env.LEGAL_AI_DB || 'legal_ai_db';

function buildConnConfig(dbName = 'postgres') {
  // Prefer a full connection string if provided
  const connString = process.env.PG_CONNECTION_STRING || process.env.DATABASE_URL;
  if (connString) {
    // Prefer using URL parsing for robust replacement of the path/dbname
    try {
      const url = new URL(connString);
      // Replace the pathname (which contains the database) with the requested name
      url.pathname = `/${dbName}`;
      return { connectionString: url.toString() };
    } catch (e) {
      // Fallback to a safer regex replace of the final path segment
      try {
        return { connectionString: connString.replace(/\/[^\/?]+(?=$|[?])/u, `/${dbName}`) };
      } catch (e2) {
        return { connectionString: connString };
      }
    }
  }

  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || process.env.USER || 'postgres',
    password: process.env.PGPASSWORD || undefined,
    database: dbName,
  };
}

async function ensureDatabaseExists(adminClient, dbName) {
  const res = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if ((res?.rowCount ?? 0) === 0) {
    console.log(`Creating database '${dbName}'...`);
    // Escape double-quotes for SQL identifier quoting (replace " with "")
    const safeName = dbName.replace(/"/g, '""');
    await adminClient.query(`CREATE DATABASE "${safeName}"`);
    console.log(`Database '${dbName}' created.`);
  } else {
    console.log(`Database '${dbName}' already exists.`);
  }
}

async function ensurePgvectorExtension(targetClient) {
  console.log('Ensuring pgvector extension (vector) is installed...');
  await targetClient.query('CREATE EXTENSION IF NOT EXISTS vector;');
  console.log('pgvector extension ensured.');
}

(async function main() {
  const adminConfig = buildConnConfig('postgres');
  const adminClient = new Client(adminConfig);

  try {
    await adminClient.connect();
    await ensureDatabaseExists(adminClient, TARGET_DB);
  } catch (err) {
    console.error('Failed to ensure database exists:', err?.message ?? err);
    try {
      await adminClient.end();
    } catch (_) {}
    process.exit(2);
  } finally {
    try {
      await adminClient.end();
    } catch (_) {}
  }

  const targetConfig = buildConnConfig(TARGET_DB);
  const targetClient = new Client(targetConfig);

  try {
    await targetClient.connect();
    await ensurePgvectorExtension(targetClient);

    const ext = await targetClient.query(
      "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'"
    );
    if ((ext?.rowCount ?? 0) > 0) {
      console.log('Installed extension:', ext.rows?.[0]);
    } else {
      console.log('pgvector not found after install attempt (unexpected).');
    }

    console.log('Initialization complete.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to initialize target database:', err?.message ?? err);
    process.exit(3);
  } finally {
    try {
      await targetClient.end();
    } catch (_) {}
  }
})().catch((err) => {
  console.error('Unexpected error:', err?.message ?? err);
  process.exit(4);
});
