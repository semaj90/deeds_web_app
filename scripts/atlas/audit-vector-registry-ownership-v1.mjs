#!/usr/bin/env node
/**
 * Read-only ownership census for the legacy/current vector and topology
 * registry relations. This report classifies existing storage; it never
 * creates, updates, deletes, or promotes a registry.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = process.cwd();
const REPORT = path.join(ROOT, 'docs/reports/vector-registry-ownership-audit-v1.json');
const RELATIONS = [
  {
    name: 'atlas_vector_registry',
    expectedRole: 'vector identity and lineage metadata',
    fallbackClass: 'CANONICAL_OWNER',
    notes: 'PostgreSQL-owned vector identity/lineage metadata; not a cache-key registry.',
  },
  {
    name: 'vector_index_registry',
    expectedRole: 'index configuration/status registry',
    fallbackClass: 'LEGACY_REGISTRY',
    notes: 'Retained registry for index configuration; legacy dimensions/status must not authorize current vectors.',
  },
  {
    name: 'registry_topology_projection',
    expectedRole: 'derived topology projection',
    fallbackClass: 'STALE_PROJECTION',
    notes: 'Derived graph/topology projection; never canonical identity.',
  },
  {
    name: 'registry_projection_stats',
    expectedRole: 'projection reporting view',
    fallbackClass: 'REPORTING_VIEW',
    notes: 'Reporting-only aggregate; not an ownership or write surface.',
  },
];

function relationClass(meta, definition) {
  if (!meta.exists) return 'UNUSED_DUPLICATE';
  if (meta.kind === 'view' || meta.kind === 'materialized_view') return 'REPORTING_VIEW';
  if (definition.name === 'atlas_vector_registry') return 'CANONICAL_OWNER';
  if (definition.name === 'vector_index_registry') return 'LEGACY_REGISTRY';
  if (definition.name === 'registry_topology_projection') return meta.rowCount === 0 ? 'STALE_PROJECTION' : 'ACTIVE_PROJECTION';
  return definition.fallbackClass;
}

function pick(columns, candidates) {
  return candidates.find((candidate) => columns.includes(candidate)) ?? null;
}

async function inspectRelation(client, definition) {
  const relationResult = await client.query(`
    SELECT c.relkind, n.nspname AS schema_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema() AND c.relname = $1
  `, [definition.name]);
  if (relationResult.rowCount === 0) {
    return { name: definition.name, expectedRole: definition.expectedRole, exists: false, classification: 'UNUSED_DUPLICATE', notes: definition.notes };
  }

  const relkind = relationResult.rows[0].relkind;
  const kind = relkind === 'v' ? 'view' : relkind === 'm' ? 'materialized_view' : relkind === 'r' ? 'table' : relkind;
  const columnResult = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = $1
    ORDER BY ordinal_position
  `, [definition.name]);
  const columns = columnResult.rows.map((row) => row.column_name);
  const rowCountResult = await client.query(`SELECT count(*)::bigint AS count FROM ${definition.name}`);
  const rowCount = Number(rowCountResult.rows[0].count);
  const timestampColumns = ['updated_at', 'last_updated', 'created_at', 'last_validated', 'validated_at'].filter((column) => columns.includes(column));
  const dimensions = pick(columns, ['dimensions', 'vector_dimensions', 'dimension', 'embedding_dim', 'vector_dimension']);
  const status = pick(columns, ['status', 'index_status', 'state', 'validation_status']);
  const vectorName = pick(columns, ['vector_name', 'representation_id', 'representation', 'embedding_model', 'index_name', 'index_backend', 'projection_type']);
  const timestampSummary = {};
  for (const column of timestampColumns) {
    const result = await client.query(`SELECT min(${column}) AS min_value, max(${column}) AS max_value FROM ${definition.name}`);
    timestampSummary[column] = result.rows[0];
  }
  const distinctSummary = {};
  for (const column of [dimensions, status, vectorName].filter(Boolean)) {
    const result = await client.query(`SELECT ${column}::text AS value, count(*)::bigint AS count FROM ${definition.name} GROUP BY ${column} ORDER BY count DESC, value NULLS LAST LIMIT 20`);
    distinctSummary[column] = result.rows.map((row) => ({ value: row.value, count: Number(row.count) }));
  }
  const meta = { name: definition.name, expectedRole: definition.expectedRole, exists: true, kind, schema: relationResult.rows[0].schema_name, columns, rowCount };
  return { ...meta, classification: relationClass(meta, definition), notes: definition.notes, dimensionColumn: dimensions, statusColumn: status, vectorIdentityColumn: vectorName, timestampSummary, distinctSummary };
}

const env = loadRepoEnv(process.env);
const databaseUrl = resolveDatabaseUrl(env);
const report = {
  schema: 'atlas.vector-registry-ownership-audit.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_LIVE_SCHEMA_CENSUS',
  policy: { canonicalAuthority: false, registryWritesPerformed: false, cacheWritesPerformed: false, deletesPerformed: false },
  relations: [],
  nextGate: 'REVIEW_STALE_VECTOR_AND_TOPOLOGY_REGISTRIES',
  semanticChecksum: null,
  writesPerformed: false,
};

if (!databaseUrl) {
  report.status = 'DATABASE_URL_UNAVAILABLE';
  report.error = 'No database URL was resolved from repository environment configuration.';
} else {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 15000 });
  try {
    const client = await pool.connect();
    try {
      report.database = { schema: (await client.query('SELECT current_schema() AS schema')).rows[0].schema };
      for (const definition of RELATIONS) report.relations.push(await inspectRelation(client, definition));
      report.status = 'AUDIT_COMPLETE';
    } finally {
      client.release();
    }
  } catch (error) {
    report.status = 'DATABASE_READ_FAILED';
    report.error = error instanceof Error ? error.message : String(error);
  } finally {
    await pool.end();
  }
}

report.semanticChecksum = `sha256:${crypto.createHash('sha256').update(JSON.stringify({ ...report, generatedAt: null, semanticChecksum: null }), 'utf8').digest('hex')}`;
fs.mkdirSync(path.dirname(REPORT), { recursive: true });
const temp = `${REPORT}.${process.pid}.${Date.now()}.tmp`;
fs.writeFileSync(temp, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.renameSync(temp, REPORT);
console.log(JSON.stringify({ reportPath: REPORT, status: report.status, relations: report.relations.map(({ name, exists, kind, rowCount, classification }) => ({ name, exists, kind, rowCount, classification })), writesPerformed: false }, null, 2));
