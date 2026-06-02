#!/usr/bin/env node
/**
 * audit-postgres-promotion-schema.mjs
 * READ-ONLY. Queries live DB (PostgreSQL 18.x) for promotion-relevant tables.
 * Emits .tmp/postgres-promotion-schema-audit.{json,md}
 */
import pg from 'pg';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env') });

const TARGET_TABLES = [
  'task_semantic_packets', 'parent_atlas_documents', 'parent_atlas_vectors',
  'code_llm_index', 'nes_chrom_packets', 'atlas_feature_profiles',
  'atlas_dependency_edges', 'atlas_hot_keyword_clusters', 'atlas_retrieval_events',
];

const KEY_COLUMNS = ['alias_id','source_ref','feature_id','workspace_task_id',
  'qdrant_point_id','payload','payload_jsonb','embedding','embedding_768'];

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const result = {};

  // 1. Postgres version
  const { rows: [{ version }] } = await client.query('SELECT version()');
  result.postgres_version = version;

  // 2. Per-table audit
  result.tables = {};
  for (const tbl of TARGET_TABLES) {
    const { rows: exists } = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [tbl]
    );
    if (!exists.length) { result.tables[tbl] = { exists: false }; continue; }

    const { rows: cols } = await client.query(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1
       ORDER BY ordinal_position`, [tbl]
    );
    const { rows: idx } = await client.query(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname='public' AND tablename=$1 ORDER BY indexname`, [tbl]
    );
    const { rows: [{ count }] } = await client.query(`SELECT count(*)::int FROM ${tbl}`);
    const { rows: pk } = await client.query(
      `SELECT kcu.column_name FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema
       WHERE tc.constraint_type='PRIMARY KEY' AND tc.table_schema='public' AND tc.table_name=$1`, [tbl]
    );
    const { rows: uq } = await client.query(
      `SELECT kcu.column_name FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema
       WHERE tc.constraint_type='UNIQUE' AND tc.table_schema='public' AND tc.table_name=$1`, [tbl]
    );

    const colNames = cols.map(c => c.column_name);
    const keyColStatus = {};
    for (const kc of KEY_COLUMNS) keyColStatus[kc] = colNames.includes(kc);

    result.tables[tbl] = {
      exists: true, row_count: count,
      columns: cols,
      primary_keys: pk.map(r => r.column_name),
      unique_constraints: uq.map(r => r.column_name),
      indexes: idx,
      key_columns: keyColStatus,
      jsonb_columns: cols.filter(c => c.data_type === 'jsonb').map(c => c.column_name),
      vector_columns: cols.filter(c => c.data_type === 'USER-DEFINED').map(c => c.column_name),
    };
  }

  // 3. pgvector extension
  const { rows: ext } = await client.query(
    `SELECT extname, extversion FROM pg_extension WHERE extname='vector'`
  );
  result.pgvector = ext[0] || null;

  await client.end();

  // 4. Gates summary
  const tsp = result.tables['task_semantic_packets'];
  const pad = result.tables['parent_atlas_documents'];
  result.gates = {
    alias_id_verified: tsp?.exists && tsp.key_columns?.alias_id === true,
    source_ref_on_tsp: tsp?.exists && tsp.key_columns?.source_ref === true,
    qdrant_point_id_on_tsp: tsp?.exists && tsp.key_columns?.qdrant_point_id === true,
    feature_id_on_tsp: tsp?.exists && tsp.key_columns?.feature_id === true,
    workspace_task_id_on_tsp: tsp?.exists && tsp.key_columns?.workspace_task_id === true,
    parent_atlas_documents_exists: pad?.exists === true,
    pgvector_installed: !!result.pgvector,
    postgres_is_18: result.postgres_version?.includes('18.'),
    task_semantic_packets_exists: tsp?.exists === true,
    parent_atlas_vectors_exists: result.tables['parent_atlas_vectors']?.exists === true,
    nes_chrom_packets_exists: result.tables['nes_chrom_packets']?.exists === true,
    code_llm_index_exists: result.tables['code_llm_index']?.exists === true,
  };

  // 5. Write outputs
  mkdirSync(resolve(ROOT, '.tmp'), { recursive: true });
  const jsonPath = resolve(ROOT, '.tmp/postgres-promotion-schema-audit.json');
  const mdPath = resolve(ROOT, '.tmp/postgres-promotion-schema-audit.md');

  writeFileSync(jsonPath, JSON.stringify(result, null, 2));

  const g = result.gates;
  const icon = (v) => v ? '✅' : '❌';
  const md = [
    '# Postgres Promotion Schema Audit',
    '',
    `**Generated:** ${new Date().toISOString()}`,
    `**DB:** ${result.postgres_version?.split(' ').slice(0,3).join(' ')}`,
    '',
    '## Gate Summary',
    '',
    `| Gate | Status |`,
    `|------|--------|`,
    ...Object.entries(g).map(([k, v]) => `| ${k} | ${icon(v)} ${v} |`),
    '',
    '## Tables',
    '',
    ...TARGET_TABLES.map(tbl => {
      const t = result.tables[tbl];
      if (!t?.exists) return `### ${tbl}\n\n❌ **MISSING**\n`;
      const keyColLines = Object.entries(t.key_columns)
        .filter(([,v]) => v).map(([k]) => `  - ${k}`).join('\n');
      return [
        `### ${tbl}`,
        `- **Rows:** ${t.row_count}`,
        `- **Primary key:** ${t.primary_keys.join(', ')}`,
        `- **JSONB cols:** ${t.jsonb_columns.join(', ') || 'none'}`,
        `- **Vector cols:** ${t.vector_columns.join(', ') || 'none'}`,
        `- **Key columns present:**\n${keyColLines || '  (none of interest)'}`,
        `- **Indexes:** ${t.indexes.length}`,
        '',
      ].join('\n');
    }),
    '## Next Step',
    '',
    `${icon(!g.parent_atlas_documents_exists)} **parent_atlas_documents is MISSING** — must be created before corpus promotion.`,
    '',
    '```sql',
    '-- See: sveltekit-frontend/drizzle/manual/20260601_add_alias_and_parent_atlas_indexes.sql',
    '```',
  ].join('\n');

  writeFileSync(mdPath, md);
  console.log('[audit-postgres] Gates:');
  for (const [k, v] of Object.entries(g)) console.log(`  ${icon(v)} ${k}`);
  console.log(`\nReports: ${jsonPath}\n         ${mdPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
