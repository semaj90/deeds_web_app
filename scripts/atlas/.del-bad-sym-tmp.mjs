import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
const SID = 'symbol:4440b9d8617796004ffab6931a2792fa75f98dfa';
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const v = await client.query(`DELETE FROM public.atlas_symbol_versions WHERE stable_symbol_id = $1`, [SID]);
  const a = await client.query(`DELETE FROM public.atlas_symbol_aliases WHERE stable_symbol_id = $1`, [SID]);
  const r = await client.query(`DELETE FROM public.atlas_symbol_registry WHERE stable_symbol_id = $1`, [SID]);
  const left = await client.query(`SELECT (SELECT count(*) FROM public.atlas_symbol_registry WHERE stable_symbol_id=$1)::int r, (SELECT count(*) FROM public.atlas_symbol_aliases WHERE stable_symbol_id=$1)::int a, (SELECT count(*) FROM public.atlas_symbol_versions WHERE stable_symbol_id=$1)::int v`, [SID]);
  console.log(JSON.stringify({ deleted: { versions: v.rowCount, aliases: a.rowCount, registry: r.rowCount }, remaining: left.rows[0] }));
  if (left.rows[0].r + left.rows[0].a + left.rows[0].v !== 0) throw new Error('READBACK_NOT_ZERO');
  await client.query('COMMIT');
  const total = await pool.query(`SELECT count(*)::int n FROM public.atlas_symbol_registry`);
  console.log('registry total after commit:', total.rows[0].n);
} catch (e) { await client.query('ROLLBACK'); console.log('ROLLED BACK:', e.message); }
finally { client.release(); await pool.end(); }
