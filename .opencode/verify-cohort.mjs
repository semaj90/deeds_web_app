import { loadRepoEnv, resolveDatabaseUrl } from '../scripts/atlas/connection-config.mjs';
import { Pool } from 'pg';
import crypto from 'node:crypto';
const pool = new Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1 });
const target = 'bd36c163938a661f9c0b3f68dd1a0eb7e576405268ebe9c2221df689697441b0';
(async () => {
  const client = await pool.connect();
  await client.query('BEGIN');
  const res = await client.query('SELECT count(*)::int AS n FROM codebase_chunk_index WHERE content_embedding IS NOT NULL');
  const count = res.rows[0].n;
  const agg = await client.query('SELECT string_agg(content_embedding::text, E' + [String.fromCharCode(10)] + ' ORDER BY id) AS blob FROM codebase_chunk_index WHERE content_embedding IS NOT NULL');
  const hash = crypto.createHash('sha256').update(agg.rows[0].blob).digest('hex');
  console.log('live eligibleRowCount:', count);
  console.log('MATCH_COUNT:', count === 55169);
  console.log('live text-sha256:', hash);
  console.log('MATCH_TEXT_SHA:', hash === target);
  await client.query('ROLLBACK');
  pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
