#!/usr/bin/env node
/**
 * Read-only packet contract mirror audit.
 *
 * Compares the canonical packet spine across Drizzle schema files,
 * manual SQL sidecars, and live information_schema when available.
 *
 * Tables covered:
 * - task_semantic_packets
 * - atlas_packets
 * - nes_chrom_packets
 * - nes_chrom_kag_dag_hits
 * - parent_atlas_documents
 * - route_runtime_packets
 *
 * No mutations. Live DB unavailability is reported as a warning, not a crash.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const OUT_JSON = path.join(REPORTS_DIR, 'postgres-contract-mirrors-report.json');
const OUT_MD = path.join(REPORTS_DIR, 'postgres-contract-mirrors-report.md');

const TABLES = [
  {
    tableName: 'task_semantic_packets',
    schemaFiles: [
      path.join(FRONTEND_ROOT, 'src', 'lib', 'server', 'db', 'schema', 'tasks.ts'),
    ],
    manualFiles: [
      path.join(FRONTEND_ROOT, 'drizzle', 'manual', '9999_create_task_semantic_packets.sql'),
      path.join(FRONTEND_ROOT, 'drizzle', 'manual', '20260601_task_semantic_packets_v2.sql'),
      path.join(FRONTEND_ROOT, 'drizzle', 'manual', '20260601_task_semantic_packets_alias_id_and_atlas_profile_gin.sql'),
      path.join(FRONTEND_ROOT, 'drizzle', 'manual', '20260606_task_semantic_packets_live_alignment.sql'),
      path.join(FRONTEND_ROOT, 'drizzle', 'manual', '20260604_task_semantic_packets_backfill.sql'),
      path.join(FRONTEND_ROOT, 'drizzle', 'manual', '20260601_add_alias_and_parent_atlas_indexes.sql'),
    ],
    staticIdentityFields: ['packet_key', 'source_ref', 'feature_id', 'community_id'],
  },
  {
    tableName: 'atlas_packets',
    schemaFiles: [
      path.join(FRONTEND_ROOT, 'src', 'lib', 'server', 'db', 'schema', 'atlas-packets.ts'),
    ],
    manualFiles: [
      path.join(FRONTEND_ROOT, 'drizzle', 'manual', '20260611_atlas_packets_schema.sql'),
    ],
    staticIdentityFields: ['packet_id', 'packet_key', 'source_ref', 'feature_id', 'community_id'],
  },
  {
    tableName: 'nes_chrom_packets',
    schemaFiles: [
      path.join(FRONTEND_ROOT, 'src', 'lib', 'server', 'db', 'schema', 'nes-chrom-packets.ts'),
    ],
    manualFiles: [
      path.join(FRONTEND_ROOT, 'drizzle', 'manual', '20260601_nes_chrom_packets_and_kag_dag_hits.sql'),
      path.join(FRONTEND_ROOT, 'drizzle', 'manual', '20260606_nes_chrom_live_alignment.sql'),
      path.join(FRONTEND_ROOT, 'drizzle', 'manual', '20260601_add_alias_and_parent_atlas_indexes.sql'),
    ],
    staticIdentityFields: ['packet_key', 'source_ref', 'feature_id', 'qdrant_point_id'],
  },
  {
    tableName: 'nes_chrom_kag_dag_hits',
    schemaFiles: [
      path.join(FRONTEND_ROOT, 'src', 'lib', 'server', 'db', 'schema', 'nes-chrom-packets.ts'),
    ],
    manualFiles: [
      path.join(FRONTEND_ROOT, 'drizzle', 'manual', '20260601_nes_chrom_packets_and_kag_dag_hits.sql'),
      path.join(FRONTEND_ROOT, 'drizzle', 'manual', '20260606_nes_chrom_live_alignment.sql'),
    ],
    staticIdentityFields: ['packet_id', 'source_ref', 'node_key'],
  },
  {
    tableName: 'parent_atlas_documents',
    schemaFiles: [
      path.join(FRONTEND_ROOT, 'src', 'lib', 'server', 'db', 'schema', 'parent-atlas-documents.ts'),
    ],
    manualFiles: [
      path.join(FRONTEND_ROOT, 'drizzle', 'manual', '20260601_add_alias_and_parent_atlas_indexes.sql'),
      path.join(FRONTEND_ROOT, 'drizzle', 'manual', '20260420_route_metadata.sql'),
      path.join(FRONTEND_ROOT, 'drizzle', 'manual', '20260404_add_lod_source_kind_columns.sql'),
      path.join(FRONTEND_ROOT, 'drizzle', 'manual', '20260604_add_lod_source_kind_columns.sql'),
    ],
    staticIdentityFields: ['source_ref', 'feature_id', 'workspace_id', 'qdrant_point_id'],
  },
  {
    tableName: 'route_runtime_packets',
    schemaFiles: [
      path.join(FRONTEND_ROOT, 'src', 'lib', 'server', 'db', 'schema', 'route_runtime_packets.ts'),
    ],
    manualFiles: [
      path.join(FRONTEND_ROOT, 'drizzle', 'manual', '20260603_atlas_synthesis_tables.sql'),
      path.join(FRONTEND_ROOT, 'drizzle', 'manual', '20260606_route_packet_tables.sql'),
    ],
    staticIdentityFields: ['packet_uuid', 'source_ref', 'feature_id'],
  },
];

const JSON_MODE = process.argv.includes('--json');

function rel(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
}

function uniq(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value)))].sort((a, b) => a.localeCompare(b));
}

function diff(a, b) {
  const bSet = new Set(b);
  const aSet = new Set(a);
  return {
    onlyInA: uniq(a.filter((value) => !bSet.has(value))),
    onlyInB: uniq(b.filter((value) => !aSet.has(value))),
  };
}

async function listFiles(root) {
  const files = [];
  async function visit(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.svelte-kit' || entry.name === '.vite' || entry.name === 'dist' || entry.name === 'build') {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(full);
      } else {
        files.push(full);
      }
    }
  }
  await visit(root);
  return files;
}

const textCache = new Map();
async function readText(filePath) {
  if (!textCache.has(filePath)) {
    textCache.set(filePath, fs.readFile(filePath, 'utf8').catch(() => null));
  }
  return textCache.get(filePath);
}

function extractTableBlock(text, tableName) {
  const markers = [
    `pgTable('${tableName}'`,
    `pgTable("${tableName}"`,
  ];
  let start = -1;
  for (const marker of markers) {
    const idx = text.indexOf(marker);
    if (idx >= 0 && (start < 0 || idx < start)) start = idx;
  }
  if (start < 0) return null;
  const nextExport = text.indexOf('\nexport const ', start + 1);
  return text.slice(start, nextExport > -1 ? nextExport : text.length);
}

function parseSchemaBlock(block, tableName) {
  if (!block) return null;
  const columns = new Set();
  const indexes = new Set();
  const columnsEnd = block.indexOf('},');
  const columnsBlock = columnsEnd >= 0 ? block.slice(0, columnsEnd) : block;
  const indexesBlock = columnsEnd >= 0 ? block.slice(columnsEnd) : '';

  for (const rawLine of columnsBlock.split(/\r?\n/)) {
    const line = rawLine.trim();
    const columnMatch = line.match(/^([A-Za-z0-9_]+)\s*:\s*[A-Za-z0-9_]+\('([^']+)'/);
    if (columnMatch) {
      columns.add(columnMatch[2].toLowerCase());
      if (/\.unique\(\)\s*,?\s*$/.test(line)) {
        indexes.add(`${tableName}_${columnMatch[2].toLowerCase()}_key`);
      }
    }
  }

  for (const rawLine of indexesBlock.split(/\r?\n/)) {
    const line = rawLine.trim();
    const indexMatch = line.match(/index\('([^']+)'\)/);
    if (indexMatch) indexes.add(indexMatch[1].toLowerCase());
    const uniqueIndexMatch = line.match(/uniqueIndex\('([^']+)'\)/);
    if (uniqueIndexMatch) indexes.add(uniqueIndexMatch[1].toLowerCase());
  }

  return {
    columns: uniq([...columns]),
    indexes: uniq([...indexes]),
  };
}

function parseSqlText(text, tableName) {
  if (!text) return null;
  const columns = new Set();
  const indexes = new Set();
  let matched = false;
  const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const createTableRe = new RegExp(`CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+(?:public\\.)?"?${escaped}"?\\s*\\(([^]*?)\\);`, 'ig');
  for (const match of text.matchAll(createTableRe)) {
    matched = true;
    for (const rawLine of match[1].split(/\r?\n/)) {
      const line = rawLine.trim().replace(/,+$/, '');
      if (!line) continue;
      const uniqueConstraintMatch = line.match(/^constraint\s+"?([A-Za-z0-9_]+)"?\s+unique\b/i);
      if (uniqueConstraintMatch) {
        indexes.add(uniqueConstraintMatch[1].toLowerCase());
        continue;
      }
      if (/^(primary key|foreign key|check|unique|exclude)\b/i.test(line)) continue;
      if (/^(generated|case|when|then|else|end)\b/i.test(line)) continue;
      const columnMatch = line.match(/^"?([A-Za-z0-9_]+)"?\s+[A-Za-z][A-Za-z0-9_\s\(\)\[\],"'`.-]*/);
      if (columnMatch) {
        columns.add(columnMatch[1].toLowerCase());
        if (/\bunique\b/i.test(line)) {
          indexes.add(`${tableName}_${columnMatch[1].toLowerCase()}_key`);
        }
      }
    }
  }

  const alterAddColumnRe = new RegExp(`ALTER\\s+TABLE(?:\\s+ONLY)?\\s+(?:public\\.)?"?${escaped}"?\\s+ADD\\s+COLUMN(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+"?([A-Za-z0-9_]+)"?`, 'ig');
  for (const match of text.matchAll(alterAddColumnRe)) {
    matched = true;
    columns.add(match[1].toLowerCase());
  }

  const indexRe = new RegExp(`CREATE(?:\\s+UNIQUE)?\\s+INDEX(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+"?([A-Za-z0-9_]+)"?\\s+ON\\s+(?:public\\.)?"?${escaped}"?`, 'ig');
  for (const match of text.matchAll(indexRe)) {
    matched = true;
    indexes.add(match[1].toLowerCase());
  }

  return matched ? { columns: uniq([...columns]), indexes: uniq([...indexes]) } : null;
}

async function collectSources(rootFiles, tableName, kind) {
  const files = [];
  for (const filePath of rootFiles) {
    const text = await readText(filePath);
    if (!text || !text.includes(tableName)) continue;
    const parsed = kind === 'sql'
      ? parseSqlText(text, tableName)
      : parseSchemaBlock(extractTableBlock(text, tableName), tableName);
    if (!parsed) continue;
    files.push({
      filePath,
      columns: parsed.columns,
      indexes: parsed.indexes,
    });
  }
  return files;
}

function mergeSources(sources) {
  return {
    columns: uniq(sources.flatMap((source) => source.columns)),
    indexes: uniq(sources.flatMap((source) => source.indexes)),
  };
}

function isImplicitIndexName(indexName) {
  const name = String(indexName ?? '');
  return /(_pkey|_key|_uq|^pg_|^sqlsmith_|^btree_)/i.test(name);
}

function filterImplicitLiveIndexes(indexDiff) {
  return {
    onlyInA: indexDiff.onlyInA,
    onlyInB: indexDiff.onlyInB.filter((indexName) => !isImplicitIndexName(indexName)),
  };
}

function repairClassForTable({ staticColumnDiff, staticIndexDiff, liveColumnDiff, liveIndexDiff }) {
  if (staticColumnDiff.onlyInA.length && !staticColumnDiff.onlyInB.length) {
    return 'APPLY_EXISTING_SQL';
  }
  if (staticColumnDiff.onlyInB.length && !staticColumnDiff.onlyInA.length) {
    return 'ADD_DRIZZLE_MIRROR';
  }
  if (staticColumnDiff.onlyInA.length || staticColumnDiff.onlyInB.length) {
    return 'NEEDS_REVIEW';
  }

  if (staticIndexDiff.onlyInA.length && !staticIndexDiff.onlyInB.length) {
    return 'APPLY_EXISTING_SQL';
  }
  if (staticIndexDiff.onlyInB.length && !staticIndexDiff.onlyInA.length) {
    return 'ADD_DRIZZLE_MIRROR';
  }
  if (staticIndexDiff.onlyInA.length || staticIndexDiff.onlyInB.length) {
    return 'NEEDS_REVIEW';
  }

  if (liveColumnDiff.onlyInA.length && !liveColumnDiff.onlyInB.length) {
    return 'APPLY_EXISTING_SQL';
  }
  if (liveColumnDiff.onlyInB.length && !liveColumnDiff.onlyInA.length) {
    return 'ADD_DRIZZLE_MIRROR';
  }
  if (liveColumnDiff.onlyInA.length || liveColumnDiff.onlyInB.length) {
    return 'NEEDS_REVIEW';
  }

  if (liveIndexDiff.onlyInA.length && !liveIndexDiff.onlyInB.length) {
    return 'APPLY_EXISTING_SQL';
  }
  if (liveIndexDiff.onlyInB.length && !liveIndexDiff.onlyInA.length) {
    const nonImplicit = liveIndexDiff.onlyInB.filter((indexName) => !isImplicitIndexName(indexName));
    return nonImplicit.length === 0 ? 'IGNORE_IMPLICIT_INDEX' : 'ADD_DRIZZLE_MIRROR';
  }
  if (liveIndexDiff.onlyInA.length || liveIndexDiff.onlyInB.length) {
    return 'NEEDS_REVIEW';
  }

  return null;
}

function classifyTable({ schema, manual, live, tableName, staticIdentityFields }) {
  const staticColumns = mergeSources([schema, manual].filter(Boolean)).columns;
  const staticIndexes = mergeSources([schema, manual].filter(Boolean)).indexes;
  const schemaColumns = schema?.columns ?? [];
  const manualColumns = manual?.columns ?? [];
  const schemaIndexes = schema?.indexes ?? [];
  const manualIndexes = manual?.indexes ?? [];

  const schemaManualColumnDiff = diff(schemaColumns, manualColumns);
  const schemaManualIndexDiff = diff(schemaIndexes, manualIndexes);

  let staticClassification = 'NEEDS_REVIEW';
  if (!schema && !manual) {
    staticClassification = 'NEEDS_REVIEW';
  } else if (schema && !manual) {
    staticClassification = 'DRIZZLE_ONLY';
  } else if (manual && !schema) {
    staticClassification = 'SQL_ONLY';
  } else if (schemaManualColumnDiff.onlyInA.length || schemaManualColumnDiff.onlyInB.length) {
    staticClassification = 'COLUMN_MISMATCH';
  } else if (schemaManualIndexDiff.onlyInA.length || schemaManualIndexDiff.onlyInB.length) {
    staticClassification = 'INDEX_MISMATCH';
  } else {
    staticClassification = 'SQL_AND_DRIZZLE_ALIGNED';
  }

  const contractColumns = uniq(staticColumns);
  const contractIndexes = uniq(staticIndexes);

  let liveClassification = 'LIVE_DB_UNAVAILABLE';
  let liveColumns = [];
  let liveIndexes = [];
  let liveRowCount = null;
  let tableExists = false;
  let liveError = null;

  if (live?.reachable) {
    tableExists = Boolean(live.tableExists);
    liveColumns = live.columns ?? [];
    liveIndexes = live.indexes ?? [];
    liveRowCount = live.rowCount ?? null;
    const filteredLiveIndexDiff = filterImplicitLiveIndexes(diff(contractIndexes, liveIndexes));
    if (!tableExists) {
      liveClassification = 'COLUMN_MISMATCH';
    } else {
      const liveColumnDiff = diff(contractColumns, liveColumns);
      const liveIndexDiff = filteredLiveIndexDiff;
      if (!liveColumnDiff.onlyInA.length && !liveColumnDiff.onlyInB.length && !liveIndexDiff.onlyInA.length && !liveIndexDiff.onlyInB.length) {
        liveClassification = 'LIVE_DB_ALIGNED';
      } else if (liveColumnDiff.onlyInA.length || liveColumnDiff.onlyInB.length) {
        liveClassification = 'COLUMN_MISMATCH';
      } else {
        liveClassification = 'INDEX_MISMATCH';
      }
    }
  } else {
    liveError = live?.error ?? 'live db unavailable';
  }

  const liveColumnDiff = diff(contractColumns, liveColumns);
  const liveIndexDiff = filterImplicitLiveIndexes(diff(contractIndexes, liveIndexes));
  const overallClassification = live?.reachable
    ? liveClassification
    : (staticClassification === 'SQL_AND_DRIZZLE_ALIGNED' ? 'LIVE_DB_UNAVAILABLE' : staticClassification);

  const repairClass = !live?.reachable && staticClassification === 'SQL_AND_DRIZZLE_ALIGNED'
    ? 'NEEDS_REVIEW'
    : repairClassForTable({
      staticColumnDiff: schemaManualColumnDiff,
      staticIndexDiff: schemaManualIndexDiff,
      liveColumnDiff,
      liveIndexDiff,
    });

  return {
    tableName,
    schemaSource: schema?.sourceFiles ?? [],
    manualSource: manual?.sourceFiles ?? [],
    static: {
      classification: staticClassification,
      columns: contractColumns,
      indexes: contractIndexes,
      schemaColumns,
      manualColumns,
      schemaIndexes,
      manualIndexes,
      columnDiffs: schemaManualColumnDiff,
      indexDiffs: schemaManualIndexDiff,
    },
    live: {
      reachable: Boolean(live?.reachable),
      tableExists,
      classification: liveClassification,
      error: liveError,
      columns: liveColumns,
      indexes: liveIndexes,
      rowCount: liveRowCount,
      columnDiffs: liveColumnDiff,
      indexDiffs: liveIndexDiff,
    },
    classification: overallClassification,
    repairClass,
    identityFields: staticIdentityFields,
  };
}

async function loadLiveTables(tableNames) {
  const env = loadRepoEnv(process.env);
  let dbUrl;
  try {
    dbUrl = resolveDatabaseUrl(env);
  } catch (error) {
    return {
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
      tables: {},
    };
  }

  if (!dbUrl) {
    return {
      reachable: false,
      error: 'DATABASE_URL is not configured',
      tables: {},
    };
  }

  const pool = new Pool({
    connectionString: dbUrl,
    max: 1,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 1000,
  });

  const tables = {};
  try {
    for (const tableName of tableNames) {
      try {
        const existsRes = await pool.query(
          `SELECT to_regclass($1) IS NOT NULL AS exists`,
          [`public.${tableName}`],
        );
        const tableExists = Boolean(existsRes.rows[0]?.exists);
        const columnsRes = await pool.query(
          `SELECT column_name
             FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = $1
            ORDER BY ordinal_position`,
          [tableName],
        );
        const indexesRes = await pool.query(
          `SELECT indexname
             FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = $1
            ORDER BY indexname`,
          [tableName],
        );
        const rowCountRes = tableExists
          ? await pool.query(`SELECT COUNT(*)::int AS count FROM public.${tableName}`)
          : { rows: [{ count: null }] };

        tables[tableName] = {
          reachable: true,
          tableExists,
          columns: columnsRes.rows.map((row) => row.column_name),
          indexes: indexesRes.rows.map((row) => row.indexname),
          rowCount: rowCountRes.rows[0]?.count ?? null,
        };
      } catch (error) {
        tables[tableName] = {
          reachable: false,
          error: error instanceof Error ? error.message : String(error),
          tableExists: false,
          columns: [],
          indexes: [],
          rowCount: null,
        };
      }
    }
  } finally {
    await pool.end().catch(() => {});
  }

  return { reachable: true, error: null, tables };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Postgres Contract Mirrors Report');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- tables checked: ${report.summary.tablesChecked}`);
  lines.push(`- static aligned: ${report.summary.staticAligned}`);
  lines.push(`- live aligned: ${report.summary.liveAligned}`);
  lines.push(`- live unavailable: ${report.summary.liveUnavailable}`);
  lines.push(`- blockers: ${report.summary.blockers.length}`);
  lines.push('');
  lines.push('## Packet Spine');
  lines.push('');
  lines.push('- canonical spine: packet_key / source_ref / feature_id / community_id');
  lines.push('- packet contract lane is read-only');
  lines.push('- live DB unavailability is a warning, not a crash');
  lines.push('');

  for (const table of report.tables) {
    lines.push(`## ${table.tableName}`);
    lines.push('');
    lines.push(`- classification: ${table.classification}`);
    lines.push(`- repair_class: ${table.repairClass}`);
    lines.push(`- static: ${table.static.classification}`);
    lines.push(`- live: ${table.live.classification}${table.live.error ? ` (${table.live.error})` : ''}`);
    lines.push(`- schema sources: ${table.schemaSource.map(rel).join(', ') || 'none'}`);
    lines.push(`- manual sources: ${table.manualSource.map(rel).join(', ') || 'none'}`);
    lines.push(`- static columns: ${table.static.columns.join(', ') || 'none'}`);
    lines.push(`- static indexes: ${table.static.indexes.join(', ') || 'none'}`);
    if (table.live.reachable) {
      lines.push(`- live columns: ${table.live.columns.join(', ') || 'none'}`);
      lines.push(`- live indexes: ${table.live.indexes.join(', ') || 'none'}`);
      lines.push(`- live rows: ${table.live.rowCount ?? 'n/a'}`);
    }
    lines.push('');
  }

  if (report.summary.blockers.length > 0) {
    lines.push('## Blockers');
    lines.push('');
    for (const blocker of report.summary.blockers) {
      lines.push(`- ${blocker}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function main() {
  const generatedAt = new Date().toISOString();
  const schemaFiles = await listFiles(path.join(FRONTEND_ROOT, 'src', 'lib', 'server', 'db', 'schema'));
  const manualFiles = await listFiles(path.join(FRONTEND_ROOT, 'drizzle', 'manual'));
  const live = await loadLiveTables(TABLES.map((table) => table.tableName));

  const tables = [];
  for (const spec of TABLES) {
    const schemaSources = await collectSources(schemaFiles, spec.tableName, 'schema');
    const manualSources = await collectSources(manualFiles, spec.tableName, 'sql');
    const liveTable = live.tables[spec.tableName];
    const table = classifyTable({
      schema: schemaSources.length > 0 ? { ...mergeSources(schemaSources), tableName: spec.tableName, sourceFiles: schemaSources.map((source) => source.filePath) } : null,
      manual: manualSources.length > 0 ? { ...mergeSources(manualSources), tableName: spec.tableName, sourceFiles: manualSources.map((source) => source.filePath) } : null,
      live: liveTable ? { ...liveTable, tableName: spec.tableName } : { reachable: false, error: 'live unavailable' },
      tableName: spec.tableName,
      staticIdentityFields: spec.staticIdentityFields,
    });
    tables.push(table);
  }

  const blockers = [];
  for (const table of tables) {
    if (table.static.classification !== 'SQL_AND_DRIZZLE_ALIGNED') {
      blockers.push(`${table.tableName}: static ${table.static.classification}`);
    }
    if (table.classification === 'COLUMN_MISMATCH' || table.classification === 'INDEX_MISMATCH') {
      blockers.push(`${table.tableName}: live ${table.classification}`);
    }
  }

  const summary = {
    tablesChecked: tables.length,
    staticAligned: tables.filter((table) => table.static.classification === 'SQL_AND_DRIZZLE_ALIGNED').length,
    liveAligned: tables.filter((table) => table.classification === 'LIVE_DB_ALIGNED').length,
    liveUnavailable: tables.filter((table) => table.classification === 'LIVE_DB_UNAVAILABLE').length,
    blockers,
  };

  const report = {
    generatedAt,
    liveReachable: live.reachable,
    liveError: live.error,
    summary,
    tables,
  };

  await fs.mkdir(REPORTS_DIR, { recursive: true });
  await fs.writeFile(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(OUT_MD, buildMarkdown(report), 'utf8');

  if (JSON_MODE) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Wrote ${path.relative(REPO_ROOT, OUT_JSON)} and ${path.relative(REPO_ROOT, OUT_MD)}`);
    console.log(`Tables checked: ${summary.tablesChecked}; static aligned: ${summary.staticAligned}; live aligned: ${summary.liveAligned}; live unavailable: ${summary.liveUnavailable}`);
  }

  process.exit(blockers.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
