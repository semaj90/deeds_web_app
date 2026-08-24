import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';
import { loadRepoEnv, REPO_ROOT, resolveDatabaseUrl } from './connection-config.mjs';

const { Pool } = pg;
const reportPath = process.env.ATLAS_KAG_REPORT ?? path.join(REPO_ROOT, 'docs/reports/atlas-kag-persistence-v1.json');
const tableNames = [
  'atlas_hyperedges',
  'atlas_hyperedge_members',
  'atlas_ontology_tuples',
];
const requiredColumns = {
  atlas_hyperedges: ['contract_hyperedge_id', 'packet_key', 'workspace_revision', 'source_revision', 'graph_revision', 'producer_revision', 'evidence_refs', 'checksum', 'lifecycle', 'provenance'],
  atlas_hyperedge_members: ['hyperedge_id', 'member_id', 'member_type', 'member_role', 'ordinal'],
  atlas_ontology_tuples: ['tuple_id', 'schema_id', 'packet_key', 'ontology_ids', 'concept_ids', 'participants', 'evidence_refs', 'evidence_state', 'lifecycle', 'source_revision', 'feature_revision', 'graph_revision', 'ontology_revision', 'provenance'],
};

const pool = new Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1 });
try {
  const tables = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
    ORDER BY table_name
  `, [tableNames]);
  const columns = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
  `, [tableNames]);
  const columnSet = new Set(columns.rows.map((row) => `${row.table_name}.${row.column_name}`));
  const missingColumns = Object.fromEntries(Object.entries(requiredColumns).map(([table, names]) => [
    table,
    names.filter((name) => !columnSet.has(`${table}.${name}`)),
  ]));
  const counts = await pool.query(`
    SELECT 'atlas_hyperedges' AS table_name, count(*)::bigint AS row_count FROM atlas_hyperedges
    UNION ALL SELECT 'atlas_hyperedge_members', count(*)::bigint FROM atlas_hyperedge_members
    UNION ALL SELECT 'atlas_ontology_tuples', count(*)::bigint FROM atlas_ontology_tuples
  `);
  const registry = await pool.query(`
    SELECT schema_id, schema_version, schema_kind, status
    FROM atlas_schema_registry
    WHERE schema_id IN ('atlas.hyperedge', 'atlas.ontology-linked-tuple')
    ORDER BY schema_id
  `);
  const report = {
    schema: 'atlas.kag.persistence.audit.v1',
    status: tables.rowCount === tableNames.length && Object.values(missingColumns).every((value) => value.length === 0) ? 'READY_FOR_MATERIALIZATION' : 'MIGRATION_REQUIRED',
    readOnly: true,
    tablesPresent: tables.rows.map((row) => row.table_name),
    missingColumns,
    counts: counts.rows.map((row) => ({ table: row.table_name, rows: Number(row.row_count) })),
    contractRegistry: registry.rows,
    canonicalWrites: false,
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await pool.end();
}
