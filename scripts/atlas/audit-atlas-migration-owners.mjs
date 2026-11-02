/**
 * Read-only audit for Atlas manual migration ownership.
 *
 * This does not apply SQL, alter schemas, or backfill rows. It compares the
 * reviewed SQL owner, Drizzle mirror, sidecar manifest, and live table shape.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import {
  migrationOwnerAuditHasBlockerV1,
  summarizeMigrationOwnerResultsV1,
} from './lib/migration-owner-audit-summary-v1.mjs';

const { Pool } = pg;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FRONTEND = path.join(ROOT, 'sveltekit-frontend');
const outputIndex = process.argv.indexOf('--output');
const outputValue = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;
const scratchReportRoot = path.resolve(ROOT, '.tmp', 'atlas');
const defaultReport = path.join(ROOT, 'docs', 'reports', 'atlas-migration-owner-audit-v1.json');
if (outputIndex >= 0 && !outputValue) throw new Error('--output requires a path under .tmp/atlas');
const requestedReport = outputValue ? path.resolve(ROOT, outputValue) : defaultReport;
const outputRelativeToScratch = path.relative(scratchReportRoot, requestedReport);
if (outputValue && (outputRelativeToScratch === '..' || outputRelativeToScratch.startsWith(`..${path.sep}`) || path.isAbsolute(outputRelativeToScratch))) {
  throw new Error('--output must stay under .tmp/atlas');
}
const REPORT = requestedReport;

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
    sql: [
      'drizzle/manual/20260819_atlas_observation_feature_rows.sql',
      'drizzle/manual/20261008_atlas_observation_feature_lineage_v1.sql',
    ],
    drizzle: ['src/lib/server/db/schema/atlas-observation-feature-rows.ts'],
    expectedColumns: ['packet_key', 'feature_revision', 'tree_node_id', 'ontology_mask', 'input_digest', 'source_revision', 'registry_revision'],
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
    sourceKind: 'journal_chain',
    sql: [
      'drizzle/0024_nebulous_mongoose.sql',
      'drizzle/0025_yellow_tony_stark.sql',
    ],
    manifestSql: ['drizzle/0024_nebulous_mongoose.sql'],
    // The journaled owner is the 0024 base table plus the 0025 additions.
    // The October draft is a consolidated snapshot of that resulting shape;
    // the May proposal is a separate, incompatible hierarchy proposal.
    competingSql: ['drizzle/manual/proposed_20260530_task_semantic_packets.sql'],
    drizzle: ['src/lib/server/db/schema/feature-registry.ts'],
    expectedColumns: [
      'id', 'feature_key', 'title', 'description', 'status', 'summary',
      'source_refs', 'chunk_ids', 'tags', 'code_refs', 'test_refs',
      'retry_queries', 'cluster_id', 'trust_tier', 'last_verified_at',
    ],
    expectedStatus: 'active_candidate',
    journalTags: ['0024_nebulous_mongoose', '0025_yellow_tony_stark'],
  },
  // Sibling relations declared by journal entry 0024 (absent per the 2026-11-01 history audit).
  ...[
    ['evidence_board_edges', ['id']],
    ['saved_citation_annotations', ['id']],
    ['agent_progress_log', ['id']],
    ['feature_tasks', ['id']],
  ].map(([table, expectedColumns]) => ({
    id: `journal_0024_${table}`,
    table,
    sourceKind: 'journal_chain',
    sql: ['drizzle/0024_nebulous_mongoose.sql'],
    manifestSql: ['drizzle/0024_nebulous_mongoose.sql'],
    drizzle: [],
    expectedColumns,
    journalTags: ['0024_nebulous_mongoose'],
  })),
  // 0023 only ALTERs these tables and drops columns/constraints after data
  // transformation: replay is blocked, so this is evidence only.
  ...[
    ['documents_atlas_entries', ['source_ref', 'path']],
    ['feature_index_entries', ['stable_key', 'path']],
    ['retrieval_cache_traces', ['run_id', 'query_hash']],
  ].map(([table, expectedColumns]) => ({
    id: `journal_0023_${table}`,
    table,
    sourceKind: 'journal_chain',
    sql: ['drizzle/0023_exotic_wrecker.sql'],
    manifestSql: [], // journal file, not a sidecar: no sidecar-manifest registration applies
    drizzle: [],
    expectedColumns,
    journalTags: ['0023_exotic_wrecker'],
    replayBlocked: 'DESTRUCTIVE_DDL_DROP_AFTER_BACKFILL',
  })),
  {
    id: 'sidecar_0099_atlas_svg_glyphs',
    table: 'atlas_svg_glyphs',
    sql: ['drizzle/0099_atlas_svg_glyphs.sql'],
    drizzle: [],
    expectedColumns: ['id', 'packet_key', 'source_ref', 'glyph_id', 'glyph_type', 'created_at', 'updated_at'],
    expectedIndexes: [
      'idx_svg_glyphs_packet_key',
      'idx_svg_glyphs_source_ref',
      'idx_svg_glyphs_glyph_id',
      'idx_svg_glyphs_glyph_type',
    ],
  },
  // TypeScript declaration with no DDL owner anywhere in drizzle/.
  {
    id: 'feature_registry_vectors',
    table: 'feature_registry_vectors',
    sourceKind: 'drizzle_declaration',
    sql: [],
    drizzle: ['src/lib/server/db/schema/feature-registry-vectors.ts'],
    expectedColumns: ['embedding', 'owner_file', 'status'],
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
  const base = file.split('/').pop();
  const item = manifest.find((entry) => entry.file === `manual/${base}` || entry.file === file || entry.file === base);
  return item ? { status: item.status, reason: item.reason ?? null } : null;
}

// Optional input: the report written by scripts/ops/audit-drizzle-history-readonly.mjs.
// Read-only; absence leaves every journal-backed history as HISTORY_UNRESOLVED.
async function loadHistoryReport() {
  const base = process.env.LOCALAPPDATA;
  if (!base) return null;
  const file = path.join(base, 'DeedsWebApp', 'inventory', 'drizzle-history-readonly-latest.json');
  try {
    const text = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(text);
    return {
      path: file,
      sha256: createHash('sha256').update(text).digest('hex'),
      ledgerRows: parsed.catalog?.ledger?.rows ?? null,
      journal: new Map((parsed.journalRows ?? []).map((row) => [row.tag, row])),
    };
  } catch {
    return null;
  }
}

async function liveAudit() {
  const env = loadRepoEnv(process.env);
  const connectionString = resolveDatabaseUrl(env);
  if (!connectionString) return { reachable: false, error: 'DATABASE_URL_UNAVAILABLE', tables: {} };
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 3000, max: 1 });
  let client;
  let readOnlyTransactionOpen = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN READ ONLY');
    readOnlyTransactionOpen = true;
    const names = targets.map((target) => target.table);
    const result = await client.query(
      `SELECT c.table_name, c.column_name, c.ordinal_position
       FROM information_schema.columns c
       WHERE c.table_schema = 'public' AND c.table_name = ANY($1::text[])
       ORDER BY c.table_name, c.ordinal_position`,
      [names],
    );
    const indexes = await client.query(
      `SELECT tablename AS table_name, indexname
       FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = ANY($1::text[])
       ORDER BY tablename, indexname`,
      [names],
    );
    const rows = await client.query(
      `SELECT table_name, (xpath('/row/count/text()', query_to_xml(format('SELECT count(*) AS count FROM public.%I', table_name), true, false, '')))[1]::text::bigint AS row_count
       FROM unnest($1::text[]) AS table_name
       WHERE to_regclass('public.' || table_name) IS NOT NULL`,
      [names],
    );
    const tables = {};
    for (const name of names) tables[name] = { exists: false, columns: [], indexes: [], rowCount: null };
    for (const row of result.rows) {
      tables[row.table_name] ??= { exists: true, columns: [], indexes: [], rowCount: null };
      tables[row.table_name].exists = true;
      tables[row.table_name].columns.push(row.column_name);
    }
    for (const row of indexes.rows) {
      tables[row.table_name] ??= { exists: true, columns: [], indexes: [], rowCount: null };
      tables[row.table_name].exists = true;
      tables[row.table_name].indexes.push(row.indexname);
    }
    for (const row of rows.rows) if (tables[row.table_name]) tables[row.table_name].rowCount = Number(row.row_count);
    await client.query('ROLLBACK');
    readOnlyTransactionOpen = false;
    return { reachable: true, tables };
  } catch (error) {
    if (client && readOnlyTransactionOpen) await client.query('ROLLBACK').catch(() => {});
    return { reachable: false, error: error instanceof Error ? error.message : String(error), tables: {} };
  } finally {
    client?.release();
    await pool.end().catch(() => {});
  }
}

async function main() {
  const manifestText = await fs.readFile(path.join(FRONTEND, 'drizzle/sidecar-migrations.json'), 'utf8');
  const parsedManifest = JSON.parse(manifestText);
  const manifest = parsedManifest.sidecars ?? parsedManifest.migrations ?? parsedManifest;
  const live = await liveAudit();
  const history = await loadHistoryReport();
  const results = [];
  for (const target of targets) {
    const sqlTexts = await Promise.all(target.sql.map(readOptional));
    const competingSqlTexts = await Promise.all((target.competingSql ?? []).map(readOptional));
    const drizzleTexts = await Promise.all(target.drizzle.map(readOptional));
    const sqlColumns = [...new Set(sqlTexts.flatMap((text) => columnsFromSql(text, target.table)))].sort();
    const drizzlePresent = drizzleTexts.some(Boolean);
    const manifestFiles = target.manifestSql ?? target.sql;
    const manifestEntries = manifestFiles.map((file) => ({ file, entry: manifestStatus(manifest, file) }));
    const table = live.tables[target.table] ?? { exists: false, columns: [], indexes: [], rowCount: null };
    const expectedMissing = target.expectedColumns.filter((column) => !sqlColumns.includes(column));
    const liveMissing = target.expectedColumns.filter((column) => !table.columns.includes(column));
    const liveIndexMissing = (target.expectedIndexes ?? []).filter((index) => !table.indexes.includes(index));
    const allRegistered = manifestEntries.every(({ entry }) => entry !== null);
    const declarationOnly = target.sourceKind === 'drizzle_declaration';
    const tags = target.journalTags ?? [];
    const ledgerRows = tags.map((tag) => history?.journal.get(tag)?.ledgerRowPresent ?? null);
    // Deployment provenance is tracked separately from current existence: an
    // absent object does not prove its migration never ran, and an empty
    // Drizzle ledger does not prove it did not.
    const liveState = table.exists ? (liveMissing.length || liveIndexMissing.length ? 'PRESENT_SHAPE_DRIFT' : 'PRESENT') : 'ABSENT';
    const historyState = declarationOnly ? 'NO_DDL_HISTORY'
      : tags.length && ledgerRows.every((value) => value === true) ? 'LEDGER_RECORDED'
        : 'HISTORY_UNRESOLVED';
    const ownershipState = declarationOnly ? 'UNOWNED_DECLARATION'
      : target.replayBlocked ? 'REVIEW_REQUIRED_REPLAY_BLOCKED'
        : (!table.exists || !allRegistered ? 'REVIEW_REQUIRED' : 'OWNED');
    results.push({
      liveState,
      historyState,
      ownershipState,
      proposedAction: 'NO_DDL',
      replayBlocked: target.replayBlocked ?? null,
      journalHistory: tags.length ? { tags, ledgerRowPresent: ledgerRows } : null,
      writesPerformed: false,
      id: target.id,
      table: target.table,
      sourceKind: target.sourceKind ?? 'sidecar',
      expectedStatus: target.expectedStatus ?? 'active_candidate',
      sql: { files: target.sql, columns: sqlColumns, expectedMissing },
      competingDefinitions: {
        files: target.competingSql ?? [],
        present: competingSqlTexts.map((text, index) => ({ file: target.competingSql[index], present: Boolean(text) })),
        excludedFromOwnership: true,
      },
      drizzle: { files: target.drizzle.map((file) => rel(path.join(FRONTEND, file))), present: drizzlePresent },
      manifest: { allRegistered, entries: manifestEntries },
      live: {
        exists: table.exists,
        columns: table.columns,
        indexes: table.indexes,
        rowCount: table.rowCount,
        expectedMissing: liveMissing,
        expectedIndexesMissing: liveIndexMissing,
      },
      classification: target.expectedStatus === 'superseded_unapplied'
        ? (table.exists ? 'SUPERSEDED_TABLE_NAME_COLLISION' : 'SUPERSEDED_UNAPPLIED')
        : declarationOnly ? (table.exists ? (liveMissing.length || liveIndexMissing.length ? 'LIVE_SHAPE_MISMATCH' : 'LIVE_SHAPE_ALIGNED') : 'DECLARATION_ONLY')
        : (!allRegistered ? 'MISSING_MANIFEST_REGISTRATION'
          : !table.exists ? (target.sourceKind === 'journal_chain' ? 'JOURNALED_OBJECT_ABSENT' : 'SIDECAR_UNAPPLIED')
            : liveMissing.length || liveIndexMissing.length ? 'LIVE_SHAPE_MISMATCH' : 'LIVE_SHAPE_ALIGNED'),
    });
  }
  const report = {
    schema: 'atlas_migration_owner_audit_v1',
    generatedAt: new Date().toISOString(),
    writes: false,
    live,
    historyReport: history ? { path: history.path, sha256: history.sha256, ledgerRows: history.ledgerRows } : null,
    results,
    summary: {
      ...summarizeMigrationOwnerResultsV1(results),
      declarationOnly: results.filter((item) => item.classification === 'DECLARATION_ONLY').map((item) => item.id),
      historyUnresolved: results.filter((item) => item.historyState === 'HISTORY_UNRESOLVED').map((item) => item.id),
    },
  };
  await fs.mkdir(path.dirname(REPORT), { recursive: true });
  await fs.writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ report: path.relative(ROOT, REPORT), writes: false, live: live.reachable, summary: report.summary }, null, 2));
  if (migrationOwnerAuditHasBlockerV1(results)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
