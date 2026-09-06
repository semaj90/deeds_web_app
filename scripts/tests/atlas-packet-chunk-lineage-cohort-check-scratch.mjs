import fs from 'node:fs';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 30000 });
try {
  const snapshot = JSON.parse(fs.readFileSync('docs/reports/pkt-lineage-08-bounded-snapshot-v1.json', 'utf8'));
  const refs = snapshot.targetSourceRefs;
  const rows = (await pool.query(
    `select count(*)::int as n from public.atlas_packet_chunk_lineage where source_ref = any($1::text[])`,
    [refs],
  )).rows;
  console.log('existing atlas_packet_chunk_lineage rows for cohort:', rows[0].n);
} finally { await pool.end(); }
