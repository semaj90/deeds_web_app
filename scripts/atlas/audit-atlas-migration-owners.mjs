/**
 * Read-only audit for Atlas manual migration ownership.
 *
 * This does not apply SQL, alter schemas, or backfill rows. It compares the
 * reviewed SQL owner, Drizzle mirror, sidecar manifest, and live table shape.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const { Pool } = pg;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FRONTEND = path.join(ROOT, 'sveltekit-frontend');
const REPORT = path.join(ROOT, 'docs', 'reports', 'atlas-migration-owner-audit-v1.json');

const targets = [
  {
    id: 'graphify_source_inventory',
    table: 'graphify_files',
    sql: [
      'drizzle/manual/20260821_graphify_source_inventory.sql',
      'drizzle/manual/20260822_graphify_revision_authority_v2.sql',
      'drizzle/manual/20260825_graphify_files_compatibility_v1.sql',
    ],
    drizzle: [],
    expectedColumns: ['source_ref', 'source_revision', 'content_hash', 'workspace_revision'],
  },
  {
    id: 'graphify_file_search_projection',
    table: 'atlas_file_search_index_v1',
    sql: ['drizzle/manual/20260824_graphify_file_search_bitmap_v1.sql'],
    drizzle: [],
    expectedColumns: ['candidate_ordinal', 'packet_key', 'embedding', 'feature_bitmap', 'search_vector'],
  },
  {
    id: 'callable_search_projection',
    table: 'atlas_callable_search',
    sql: ['drizzle/manual/20260824_atlas_callable_search_v1.sql', 'drizzle/manual/20260824_atlas_callable_enrichment_v1.sql'],
    drizzle: [],
    expectedColumns: ['symbol_version_id', 'tree_node_id', 'parameter_names', 'calls', 'search_vector'],
  },
  {
    id: 'observation_feature_rows_active',
    table: 'atlas_observation_feature_rows',
    sql: ['drizzle/manual/20260819_atlas_observation_feature_rows.sql'],
    drizzle: ['src/lib/server/db/schema/atlas-observation-feature-rows.ts'],
    expectedColumns: ['packet_key', 'feature_revision', 'tree_node_id', 'ontology_mask', 'input_digest'],
  },
  {
    id: 'observation_feature_rows_superseded_candidate',
    table: 'atlas_observation_feature_rows',
    sql: ['drizzle/manual/20260819_atlas_observation_feature_rows_v1.sql'],
    drizzle: [],
    expectedColumns: ['candidate_id', 'workspace_revision', 'semantic_768', 'row_ordinal'],
    expectedStatus: 'superseded_unapplied',
  },
  {
    id: 'symbol_registry',
    table: 'atlas_symbol_registry',
    sql: ['drizzle/manual/20260818_atlas_symbol_registry_v1.sql'],
    drizzle: [],
    expectedColumns: ['stable_symbol_id'],
  },
  {
    id: 'feature_registry',
    table: 'feature_registry',
    sql: [
      'drizzle/0024_nebulous_mongoose.sql',
    ],
    // This proposal defines a different text-oriented feature_registry shape
    // and several unrelated task/agent tables. It is intentionally reported
    // as competing evidence, never as an owner or migration input.
    competingSql: ['drizzle/manual/proposed_20260530_task_semantic_packets.sql'],
    drizzle: ['src/lib/server/db/schema/feature-registry.ts'],
    expectedColumns: ['id', 'feature_key', 'title', 'status', 'source_refs'],
    expectedStatus: 'active_candidate',
  },
];

async function readOptional(file) {
  // SQL sidecars are repository-level files, while Drizzle mirror files are
  // frontend-relative. Resolve both so ownership/column audits inspect the
  // actual SQL instead of silently treating every sidecar as empty.
  for (const base of [ROOT, FRONTEND]) {
    try {
      return await fs.readFile(path.join(base, file), 'utf8');
    } catch {
      // Try the other repository root.
    }
  }
  return null;
}

function rel(file) {
  return path.relative(FRONTEND, file).replaceAll('\\', '/');
}

function columnsFromSql(text, table) {
  if (!text) return [];
  const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const columns = new Set();
  const tableToken = `"?${escaped}"?`;
  const re = new RegExp(`CREATE\\s+TABLE[^;]*?${tableToken}\\s*\\(([^]*?)\\);`, 'ig');
  for (const match of text.matchAll(re)) {
    for (const line of match[1].split(/\r?\n/)) {
      const column = line.trim().match(/^"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+/);
      if (column && !['constraint', 'primary', 'unique', 'check', 'foreign'].includes(column[1].toLowerCase())) columns.add(column[1]);
    }
  }
  for (const match of text.matchAll(/ALTER\s+TABLE[^;]*?\bADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/ig)) columns.add(match[1]);
  return [...columns].sort();
}

function manifestStatus(manifest, file) {
  const item = manifest.find((entry) => entry.file === `manual/${file.split('/').pop()}` || entry.file === file);
  return item ? { status: item.status, reason: item.reason ?? null } : null;
}

async function liveAudit() {
  const env = loadRepoEnv(process.env);
  const connectionString = resolveDatabaseUrl(env);
  if (!connectionString) return { reachable: false, error: 'DATABASE_URL_UNAVAILABLE', tables: {} };
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 3000, max: 1 });
  try {
    const names = targets.map((target) => target.table);
    const result = await pool.query(
      `SELECT c.table_name, c.column_name, c.ordinal_position
       FROM information_schema.columns c
       WHERE c.table_schema = 'public' AND c.table_name = ANY($1::text[])
       ORDER BY c.table_name, c.ordinal_position`,
      [names],
    );
    const rows = await pool.query(
      `SELECT table_name, (xpath('/row/count/text()', query_to_xml(format('SELECT count(*) AS count FROM public.%I', table_name), true, false, '')))[1]::text::bigint AS row_count
       FROM unnest($1::text[]) AS table_name
       WHERE to_regclass('public.' || table_name) IS NOT NULL`,
      [names],
    );
    const tables = {};
    for (const name of names) tables[name] = { exists: false, columns: [], rowCount: null };
    for (const row of result.rows) {
      tables[row.table_name] ??= { exists: true, columns: [], rowCount: null };
      tables[row.table_name].exists = true;
      tables[row.table_name].columns.push(row.column_name);
    }
    for (const row of rows.rows) if (tables[row.table_name]) tables[row.table_name].rowCount = Number(row.row_count);
    return { reachable: true, tables };
  } catch (error) {
    return { reachable: false, error: error instanceof Error ? error.message : String(error), tables: {} };
  } finally {
    await pool.end().catch(() => {});
  }
}

async function main() {
  const manifestText = await fs.readFile(path.join(FRONTEND, 'drizzle/sidecar-migrations.json'), 'utf8');
  const parsedManifest = JSON.parse(manifestText);
  const manifest = parsedManifest.sidecars ?? parsedManifest.migrations ?? parsedManifest;
  const live = await liveAudit();
  const results = [];
  for (const target of targets) {
    const sqlTexts = await Promise.all(target.sql.map(readOptional));
    const competingSqlTexts = await Promise.all((target.competingSql ?? []).map(readOptional));
    const drizzleTexts = await Promise.all(target.drizzle.map(readOptional));
    const sqlColumns = [...new Set(sqlTexts.flatMap((text) => columnsFromSql(text, target.table)))].sort();
    const drizzlePresent = drizzleTexts.some(Boolean);
    const manifestEntries = target.sql.map((file) => ({ file, entry: manifestStatus(manifest, file) }));
    const table = live.tables[target.table] ?? { exists: false, columns: [], rowCount: null };
    const expectedMissing = target.expectedColumns.filter((column) => !sqlColumns.includes(column));
    const liveMissing = target.expectedColumns.filter((column) => !table.columns.includes(column));
    const allRegistered = manifestEntries.every(({ entry }) => entry !== null);
    results.push({
      id: target.id,
      table: target.table,
      expectedStatus: target.expectedStatus ?? 'active_candidate',
      sql: { files: target.sql, columns: sqlColumns, expectedMissing },
      competingDefinitions: {
        files: target.competingSql ?? [],
        present: competingSqlTexts.map((text, index) => ({ file: target.competingSql[index], present: Boolean(text) })),
        excludedFromOwnership: true,
      },
      drizzle: { files: target.drizzle.map((file) => rel(path.join(FRONTEND, file))), present: drizzlePresent },
      manifest: { allRegistered, entries: manifestEntries },
      live: { exists: table.exists, columns: table.columns, rowCount: table.rowCount, expectedMissing: liveMissing },
      classification: target.expectedStatus === 'superseded_unapplied'
        ? (table.exists ? 'SUPERSEDED_TABLE_NAME_COLLISION' : 'SUPERSEDED_UNAPPLIED')
        : (!allRegistered ? 'MISSING_MANIFEST_REGISTRATION' : !table.exists ? 'SIDEcar_UNAPPLIED' : liveMissing.length ? 'LIVE_COLUMN_MISMATCH' : 'LIVE_SHAPE_ALIGNED'),
    });
  }
  const report = {
    schema: 'atlas_migration_owner_audit_v1',
    generatedAt: new Date().toISOString(),
    writes: false,
    live,
    results,
    summary: {
      missingManifestRegistration: results.filter((item) => item.classification === 'MISSING_MANIFEST_REGISTRATION').map((item) => item.id),
      sidecarUnapplied: results.filter((item) => item.classification === 'SIDEcar_UNAPPLIED').map((item) => item.id),
      liveShapeAligned: results.filter((item) => item.classification === 'LIVE_SHAPE_ALIGNED').map((item) => item.id),
      superseded: results.filter((item) => item.classification.startsWith('SUPERSEDED')).map((item) => item.id),
    },
  };
  await fs.mkdir(path.dirname(REPORT), { recursive: true });
  await fs.writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ report: path.relative(ROOT, REPORT), writes: false, live: live.reachable, summary: report.summary }, null, 2));
  if (results.some((item) => ['MISSING_MANIFEST_REGISTRATION', 'LIVE_COLUMN_MISMATCH', 'SUPERSEDED_REQUIRES_REVIEW'].includes(item.classification))) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
