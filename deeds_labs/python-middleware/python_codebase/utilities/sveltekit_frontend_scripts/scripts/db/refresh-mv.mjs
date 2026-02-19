import { spawnSync } from 'child_process';
import path from 'path';

const root = process.cwd();
const sqlDir = path.join(root, 'drizzle', 'migrations');

function runSql(sql) {
  // Use psql via env DATABASE_URL if available
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn('No DATABASE_URL set; skipping actual refresh. Use DATABASE_URL env to run SQL.');
    console.log('SQL that would run:\n', sql);
    return;
  }
  const res = spawnSync('psql', [dbUrl, '-c', sql], { stdio: 'inherit', shell: true });
  if (res.status !== 0) throw new Error('psql failed');
}

function parseArgs() {
  const args = process.argv.slice(2);
  const mvIndex = args.findIndex(a => a === '--mv');
  let mvList = [];
  if (mvIndex !== -1 && args[mvIndex + 1]) mvList = args[mvIndex + 1].split(',').map(s => s.trim()).filter(Boolean);
  return { mvList };
}

async function main() {
  const { mvList } = parseArgs();
  if (mvList.length === 0) {
    console.log('No materialized views specified; nothing to refresh. Use --mv view1,view2 or set MV_LIST env var.');
    return;
  }
  for (const mv of mvList) {
    const sql = `REFRESH MATERIALIZED VIEW CONCURRENTLY ${mv};`;
    console.log('Refreshing', mv);
    runSql(sql);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
#!/usr/bin/env node
import { Client } from 'pg';
import url from 'url';

const mvArg = process.argv.slice(2);
const envList = process.env.REFRESH_MV || '';
const mvs = mvArg.length ? mvArg : envList ? envList.split(',').map(s => s.trim()).filter(Boolean) : [];
if (mvs.length === 0) {
  console.error('No materialized view names provided. Pass as args or set REFRESH_MV env var.');
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL env var required (postgres://user:pass@host:port/db).');
  process.exit(1);
}

const client = new Client({ connectionString: databaseUrl });

async function refresh(mv) {
  try {
    console.log(`Refreshing materialized view (CONCURRENTLY): ${mv}`);
    await client.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${mv};`);
    console.log(`Refreshed: ${mv} (concurrent)`);
  } catch (err) {
    console.warn(`Concurrent refresh failed for ${mv}, trying non-concurrent:`, err?.message || err);
    try {
      console.log(`Refreshing materialized view (non-concurrent): ${mv}`);
      await client.query(`REFRESH MATERIALIZED VIEW ${mv};`);
      console.log(`Refreshed: ${mv} (non-concurrent)`);
    } catch (err2) {
      console.error(`Failed to refresh materialized view ${mv}:`, err2?.message || err2);
      throw err2;
    }
  }
}

(async () => {
  try {
    await client.connect();
    for (const mv of mvs) {
      await refresh(mv);
    }
  } catch (err) {
    console.error('Error refreshing materialized views:', err?.message || err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
