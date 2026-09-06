#!/usr/bin/env node

/**
 * Ad-hoc read-only Postgres checks used while building
 * SOURCE-REGISTRY-OWNER-JOIN-01 and SOURCE-CHUNK-MATERIALIZATION-BINDING-01
 * (openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md,
 * 2026-09-05). Recreated here per this repo's "never delete working scripts,
 * move them to scripts/tests/" convention -- these were originally written
 * as disposable `_scratch-*.mjs` files and `rm`'d, which was wrong even
 * though their findings are already captured permanently in:
 *   - scripts/atlas/audit-source-registry-owner-join-v1.mjs (the real gate)
 *   - scripts/atlas/prove-source-chunk-materialization-binding-v1.mts
 *   - scripts/atlas/inspect-graphify-schema-v1.mjs
 *
 * This file is diagnostic/exploratory, not a proof gate -- it prints
 * findings and exits. Run selected checks via --check=<name>, or all of
 * them with no argument. All queries are SELECT-only.
 */
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from '../atlas/connection-config.mjs';

const args = new Map(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const [key, ...value] = a.slice(2).split('=');
  return [key, value.join('=') || 'true'];
}));
const only = args.get('check');

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 30000 });

const checks = {
  /** atlas_source_refs column shape + a small sample. */
  async 'registry-columns'() {
    const columns = (await pool.query(
      `select column_name, data_type from information_schema.columns where table_schema='public' and table_name='atlas_source_refs' order by ordinal_position`,
    )).rows;
    const sample = (await pool.query(
      `select source_ref_key, repo_id, relative_path, content_hash from public.atlas_source_refs limit 5`,
    )).rows;
    return { columns, sample };
  },

  /** Exact relative_path join between the PKT-LINEAGE-08A 50-source cohort and the registry. */
  async 'registry-cohort-join'() {
    const fs = await import('node:fs');
    const snapshot = JSON.parse(fs.readFileSync('docs/reports/pkt-lineage-08-bounded-snapshot-v1.json', 'utf8'));
    const refs = snapshot.targetSourceRefs;
    const stripped = refs.map((r) => r.replace(/^sveltekit-frontend\//, ''));
    const matches = (await pool.query(
      `select source_ref_key, repo_id, relative_path, content_hash from public.atlas_source_refs where relative_path = any($1::text[])`,
      [stripped],
    )).rows;
    return { cohortSize: refs.length, exactMatches: matches.length, matches };
  },

  /** Registry coverage stats: how many distinct files, and by extension. */
  async 'registry-coverage'() {
    const totalRows = (await pool.query(`select count(*)::int as n from public.atlas_source_refs`)).rows[0].n;
    const distinctFiles = (await pool.query(`select count(distinct relative_path)::int as n from public.atlas_source_refs`)).rows[0].n;
    const byExtension = (await pool.query(
      `select distinct substring(relative_path from '\\.([a-zA-Z0-9]+)$') as ext, count(*)::int as n from public.atlas_source_refs group by 1 order by 2 desc limit 15`,
    )).rows;
    return { totalRows, distinctFiles, byExtension };
  },

  /** Positive control: a relative_path known to be present, to sanity-check join syntax. */
  async 'registry-positive-control'(relativePath = 'src/lib/server/db/schema-postgres.ts') {
    const rows = (await pool.query(
      `select source_ref_key, repo_id, relative_path, content_hash from public.atlas_source_refs where relative_path = $1`,
      [relativePath],
    )).rows;
    return { relativePath, matchCount: rows.length, rows };
  },

  /** graphify_files identity row for one sourceRef (used to build SourceNamespaceV1). */
  async 'graphify-files-identity'(sourceRef = 'sveltekit-frontend/.codex_louvain_audit.mjs') {
    const rows = (await pool.query(
      `select source_ref, workspace_id::text, workspace_revision, code_source_revision, content_hash from public.graphify_files where source_ref = $1`,
      [sourceRef],
    )).rows;
    return { sourceRef, rows };
  },

  /** codebase_chunk_index columns + one real chunkRowId lookup (identity spot-check). */
  async 'codebase-chunk-index-identity'(chunkRowId = '44323000-991b-4c0c-885c-e5bb0dddf759') {
    const columns = (await pool.query(
      `select column_name, data_type from information_schema.columns where table_schema='public' and table_name='codebase_chunk_index' and column_name in ('id','chunk_id','source_ref','content_hash','chunker_revision','chunk_policy_revision')`,
    )).rows;
    const row = (await pool.query(
      `select id::text, source_ref, content_hash from public.codebase_chunk_index where id = $1`,
      [chunkRowId],
    )).rows;
    return { columns, chunkRowId, row };
  },
};

try {
  const names = only ? [only] : Object.keys(checks);
  for (const name of names) {
    if (!checks[name]) {
      console.error(`Unknown check: ${name}. Available: ${Object.keys(checks).join(', ')}`);
      process.exitCode = 1;
      continue;
    }
    const result = await checks[name]();
    console.log(`\n=== ${name} ===`);
    console.log(JSON.stringify(result, null, 2));
  }
} finally {
  await pool.end();
}
