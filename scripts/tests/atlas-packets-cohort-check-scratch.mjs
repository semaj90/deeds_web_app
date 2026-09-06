import fs from 'node:fs';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 30000 });
try {
  const snapshot = JSON.parse(fs.readFileSync('docs/reports/pkt-lineage-08-bounded-snapshot-v1.json', 'utf8'));
  const refs = snapshot.targetSourceRefs;
  const rows = (await pool.query(
    `select packet_key, source_ref from public.atlas_packets where source_ref = any($1::text[])`,
    [refs],
  )).rows;
  console.log('atlas_packets rows for cohort:', rows.length, 'of', refs.length);
  console.log(JSON.stringify(rows.slice(0, 5), null, 2));
} finally { await pool.end(); }
