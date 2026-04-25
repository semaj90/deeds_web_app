'use strict';

// Simple Postgres extension checker for Windows-friendly environments.
// Usage: node scripts/check-postgres-extensions.cjs
// Config via env: PG_CONNECTION_STRING or PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE

const { Client } = require('pg');

const DEFAULT_CONN = 'postgresql://postgres:postgres@localhost:5432/legal_ai_db';
const connStr = process.env.PG_CONNECTION_STRING || process.env.PGCONN || DEFAULT_CONN;

async function main() {
  const client = new Client({ connectionString: connStr });
  try {
    await client.connect();

    const installed = await client.query(
      'SELECT extname AS name, extversion AS version FROM pg_extension ORDER BY name;'
    );

    // Alias map: logical names -> actual extension names in Postgres
    const alias = {
      pgvector: 'vector' // the pgvector project installs the "vector" extension
    };

    const availNames = [
      'pgai',
      'pgvector',
      'pg_trgm',
      'uuid-ossp',
      'pgcrypto',
      'hstore',
      'citext',
      'pg_stat_statements',
      'pg_hint_plan',
      'pg_partman',
      'timescaledb'
    ];
    // Query for both requested names and their alias targets so availability is accurate
    const namesToQuery = Array.from(new Set([
      ...availNames,
      ...Object.values(alias)
    ]));
    const available = await client.query(
      `SELECT name, default_version, installed_version
       FROM pg_available_extensions
       WHERE name = ANY($1)
       ORDER BY name;`,
      [namesToQuery]
    );

    const payload = {
      connection: connStr.replace(/:[^:@/]+@/, ':***@'), // hide password
      installed: installed.rows,
      available: available.rows
    };

    // Human summary
    const installedSet = new Set(installed.rows.map((r) => r.name));
    const summary = availNames.map((n) => {
      const realName = alias[n] || n;
      const row = available.rows.find((r) => r.name === realName);
      const canInstall = !!row && !!row.default_version;
      const isInstalled = installedSet.has(n) || installedSet.has(realName);
      return {
        name: n,
        installed: isInstalled,
        available: canInstall,
        default_version: row?.default_version || null,
        installed_version: row?.installed_version || null
      };
    });

    console.log('PostgreSQL extensions status:\n');
    for (const s of summary) {
      const status = s.installed
        ? `✅ installed (${s.installed_version || 'unknown version'})`
        : s.available
        ? `⬇️ available (default ${s.default_version})`
        : '❌ not available on this server';
      console.log(`- ${s.name}: ${status}`);
    }

    console.log('\nRaw data (JSON):');
    console.log(JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error('Failed to query PostgreSQL extensions:', err.message);
    process.exitCode = 1;
  } finally {
    try { await client.end(); } catch {}
  }
}

main();
