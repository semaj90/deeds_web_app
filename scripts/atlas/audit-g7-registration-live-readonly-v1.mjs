import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv()), max: 1 });
const c = await pool.connect();
try {
  await c.query('BEGIN READ ONLY');
  const counts = {};
  for (const t of ['atlas_graphify_scope_repository_map_v1', 'atlas_packet_identity_registry_v1', 'atlas_packet_identity_aliases_v1', 'atlas_stable_file_identity']) {
    counts[t] = (await c.query(`select count(*)::int as n from public.${t}`)).rows[0].n;
  }
  const map = await c.query('select * from public.atlas_graphify_scope_repository_map_v1');
  const checks = await c.query(
    "select conrelid::regclass::text as rel, conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid in ('public.atlas_packet_identity_registry_v1'::regclass,'public.atlas_graphify_scope_repository_map_v1'::regclass) and contype in ('c','f') order by 1,2",
  );
  const trg = await c.query("select tgname from pg_trigger where tgrelid='public.atlas_graphify_scope_repository_map_v1'::regclass and not tgisinternal");
  const membershipScopes = await c.query(
    'select repository_id as scope, count(*)::int as n from public.graphify_execution_file_membership_v2 group by repository_id order by n desc',
  );
  const repositoryIdentities = await c.query(
    `select repository_id, source_authority_repo_id, repository_name, repository_path,
            repository_kind, gitmodule_name, origin_url, parent_repository_id
       from public.atlas_repository_identity
      where repository_id = $1::uuid
         or gitmodule_name = any($2::text[])
         or repository_path = any($2::text[])
      order by repository_id`,
    ['01a13137-1378-7df9-9968-53738dbf0e48', [
      'claude-mem', 'granite-docling-258M', 'mcp-server-mcp', 'models/embeddinggemma_300m',
      'sites/parent-atlas-gateboard', 'turbovec',
    ]],
  );
  console.log(JSON.stringify({ counts, mapRows: map.rows, constraints: checks.rows, triggers: trg.rows, membershipScopes: membershipScopes.rows, repositoryIdentities: repositoryIdentities.rows }, null, 1));
} finally {
  await c.query('ROLLBACK').catch(() => {});
  c.release();
  await pool.end();
}
