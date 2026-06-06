#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const DOCS_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const DRIZZLE_DIR = path.join(REPO_ROOT, 'drizzle');
const SCHEMA_DIR = path.join(REPO_ROOT, 'src', 'lib', 'server', 'db');

const OUT_JSON = path.join(DOCS_DIR, 'postgres-contract-mirrors-report.json');
const OUT_MD = path.join(DOCS_DIR, 'postgres-contract-mirrors-report.md');

const CONTRACT_TABLES = [
  'task_semantic_packets',
  'parent_atlas_jobs',
  'atlas_feature_map',
  'parent_atlas_documents',
  'atlas_feature_map_synthesized',
  'route_runtime_packets',
  'nes_chrom_packets',
  'nes_chrom_kag_dag_hits',
];

function rel(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function sortStrings(values) {
  return uniq(values.map((value) => `${value}`)).sort((a, b) => a.localeCompare(b));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exactTablePattern(tableName) {
  return `(?<![A-Za-z0-9_])${escapeRegExp(tableName)}(?![A-Za-z0-9_])`;
}

function setDiff(a, b) {
  const bSet = new Set(b);
  return a.filter((value) => !bSet.has(value));
}

async function walkFiles(root, predicate) {
  const out = [];
  async function visit(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.svelte-kit' || entry.name === '.vite' || entry.name === 'dist' || entry.name === 'build') {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(full);
        continue;
      }
      if (predicate(full)) out.push(full);
    }
  }
  await visit(root);
  return out;
}

const fileTextCache = new Map();
async function readText(filePath) {
  if (!fileTextCache.has(filePath)) {
    fileTextCache.set(filePath, fs.readFile(filePath, 'utf8').catch(() => null));
  }
  return fileTextCache.get(filePath);
}

function extractTableBlock(text, tableName) {
  const marker = `pgTable('${tableName}'`;
  const markerDouble = `pgTable("${tableName}"`;
  const start = text.indexOf(marker) >= 0 ? text.indexOf(marker) : text.indexOf(markerDouble);
  if (start < 0) return null;
  const nextExport = text.indexOf('\nexport const ', start + marker.length);
  return text.slice(start, nextExport > -1 ? nextExport : text.length);
}

function parseDrizzleBlock(block, tableName) {
  if (!block || !block.includes(`pgTable('${tableName}'`) && !block.includes(`pgTable("${tableName}"`)) {
    return null;
  }

  const columns = new Set();
  const indexes = new Set();
  const columnsEnd = block.indexOf('},');
  const columnsBlock = columnsEnd >= 0 ? block.slice(0, columnsEnd) : block;
  const indexesBlock = columnsEnd >= 0 ? block.slice(columnsEnd) : block;

  for (const rawLine of columnsBlock.split(/\r?\n/)) {
    const line = rawLine.trim();
    const columnMatch = line.match(/^([A-Za-z0-9_]+)\s*:\s*[A-Za-z0-9_]+\('([^']+)'/);
    if (columnMatch) {
      const columnName = columnMatch[2].toLowerCase();
      columns.add(columnName);
      if (/\.unique\(\)\s*,?\s*$/.test(line)) {
        indexes.add(`${tableName}_${columnName}_key`.toLowerCase());
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
    columns: sortStrings([...columns]),
    indexes: sortStrings([...indexes]),
  };
}

function parseSqlText(text, tableName) {
  const columns = new Set();
  const indexes = new Set();
  let matched = false;

  const tableNameExpr = exactTablePattern(tableName);
  const createTableRe = new RegExp(`CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+(?:public\\.)?"?${tableNameExpr}"?\\s*\\(([^]*?)\\);`, 'ig');
  for (const match of text.matchAll(createTableRe)) {
    matched = true;
    const body = match[1];
    const lines = body.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim().replace(/,+$/, '');
    if (!line) continue;
    const uniqueConstraintMatch = line.match(/^constraint\s+"?([A-Za-z0-9_]+)"?\s+unique\b/i);
    if (uniqueConstraintMatch) {
      matched = true;
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

  const alterAddColumnRe = new RegExp(`ALTER\\s+TABLE(?:\\s+ONLY)?\\s+(?:public\\.)?"?${tableNameExpr}"?\\s+ADD\\s+COLUMN(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+"?([A-Za-z0-9_]+)"?`, 'ig');
  for (const match of text.matchAll(alterAddColumnRe)) {
    matched = true;
    columns.add(match[1].toLowerCase());
  }

  const indexRe = new RegExp(`CREATE(?:\\s+UNIQUE)?\\s+INDEX(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+"?([A-Za-z0-9_]+)"?\\s+ON\\s+(?:public\\.)?"?${tableNameExpr}"?`, 'ig');
  for (const match of text.matchAll(indexRe)) {
    matched = true;
    indexes.add(match[1].toLowerCase());
  }

  return matched ? { columns: sortStrings([...columns]), indexes: sortStrings([...indexes]) } : null;
}

function parseTableSources(files, tableName, parser) {
  return files.map((filePath) => ({ filePath, text: parser(filePath) }));
}

async function collectSources(files, tableName, kind) {
  const sources = [];
  const tablePattern = new RegExp(exactTablePattern(tableName));
  for (const filePath of files) {
    const text = await readText(filePath);
    if (!text || !tablePattern.test(text)) continue;
    const parsed = kind === 'sql'
      ? parseSqlText(text, tableName)
      : parseDrizzleBlock(extractTableBlock(text, tableName), tableName);
    if (!parsed) continue;
    sources.push({
      filePath,
      columns: parsed.columns,
      indexes: parsed.indexes,
    });
  }
  return sources;
}

function mergeFieldSets(sources) {
  return {
    columns: sortStrings(sources.flatMap((source) => source.columns)),
    indexes: sortStrings(sources.flatMap((source) => source.indexes)),
  };
}

function isEqualSet(a, b) {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every((value) => bSet.has(value));
}

function buildDiff(a, b) {
  return {
    onlyInA: sortStrings(setDiff(a, b)),
    onlyInB: sortStrings(setDiff(b, a)),
  };
}

function recommendRepairClass(entry) {
  const cols = entry.columnDiffs;
  const idx = entry.indexDiffs;

  if (entry.classification === 'LIVE_DB_ALIGNED') {
    return null;
  }
  if (entry.classification === 'SQL_ONLY') {
    return 'ADD_DRIZZLE_MIRROR';
  }
  if (entry.classification === 'DRIZZLE_ONLY') {
    return 'ADD_MANUAL_SQL';
  }
  if (entry.classification === 'COLUMN_MISMATCH') {
    if (cols.liveOnly.length && !cols.missingInLive.length) return 'ADD_DRIZZLE_MIRROR';
    if (cols.missingInLive.length && !cols.liveOnly.length) return 'APPLY_EXISTING_SQL';
    return 'NEEDS_REVIEW';
  }
  if (entry.classification === 'INDEX_MISMATCH') {
    if (idx.sqlOnly.length && !idx.liveOnly.length) return 'ADD_DRIZZLE_MIRROR';
    if (idx.schemaOnly.length && !idx.liveOnly.length) return 'ADD_MANUAL_SQL';
    if (idx.liveOnly.length && !idx.schemaOnly.length && !idx.sqlOnly.length) return 'ADD_DRIZZLE_MIRROR';
    if (idx.missingInLive.length && !idx.liveOnly.length) return 'APPLY_EXISTING_SQL';
    return 'NEEDS_REVIEW';
  }
  if (entry.classification === 'LIVE_DB_UNAVAILABLE') {
    return 'NEEDS_REVIEW';
  }
  return 'NEEDS_REVIEW';
}

async function loadLiveMirror(tableNames) {
  const env = loadRepoEnv();
  let dbUrl;
  try {
    dbUrl = resolveDatabaseUrl(env);
  } catch (error) {
    return { reachable: false, error: error instanceof Error ? error.message : String(error), tables: {} };
  }

  if (!dbUrl) {
    return { reachable: false, error: 'DATABASE_URL missing', tables: {} };
  }

  const pool = new Pool({ connectionString: dbUrl, max: 1 });
  try {
    const tableRows = await pool.query(
      `select table_name
         from information_schema.tables
        where table_schema = 'public'
          and table_name = any($1::text[])`,
      [tableNames],
    );
    const columnRows = await pool.query(
      `select table_name, column_name, ordinal_position
         from information_schema.columns
        where table_schema = 'public'
          and table_name = any($1::text[])
        order by table_name, ordinal_position`,
      [tableNames],
    );
    const indexRows = await pool.query(
      `select tablename, indexname, indexdef
         from pg_indexes
        where schemaname = 'public'
          and tablename = any($1::text[])`,
      [tableNames],
    );

    const presentTables = new Set(tableRows.rows.map((row) => row.table_name));
    const liveTables = Object.fromEntries(tableNames.map((tableName) => [tableName, {
      present: presentTables.has(tableName),
      columns: [],
      indexes: [],
      columnSet: [],
      indexSet: [],
    }]));

    for (const row of columnRows.rows) {
      liveTables[row.table_name].columns.push(row.column_name);
    }
    for (const row of indexRows.rows) {
      liveTables[row.tablename].indexes.push(row.indexname);
    }
    for (const tableName of tableNames) {
      liveTables[tableName].columnSet = sortStrings(liveTables[tableName].columns);
      liveTables[tableName].indexSet = sortStrings(liveTables[tableName].indexes.filter((indexName) => !indexName.endsWith('_pkey')));
    }

    return { reachable: true, error: null, tables: liveTables };
  } catch (error) {
    return { reachable: false, error: error instanceof Error ? error.message : String(error), tables: {} };
  } finally {
    await pool.end().catch(() => {});
  }
}

async function main() {
  const schemaFiles = await walkFiles(SCHEMA_DIR, (filePath) => filePath.endsWith('.ts'));
  const sqlFiles = await walkFiles(DRIZZLE_DIR, (filePath) => filePath.endsWith('.sql'));
  const live = await loadLiveMirror(CONTRACT_TABLES);

  const tableReports = [];
  for (const tableName of CONTRACT_TABLES) {
    const schemaSources = await collectSources(schemaFiles, tableName, 'schema');
    const sqlSources = await collectSources(sqlFiles, tableName, 'sql');

    const schemaMentions = [];
    for (const filePath of schemaFiles) {
      const text = await readText(filePath);
      if (text && new RegExp(exactTablePattern(tableName)).test(text)) {
        schemaMentions.push(filePath);
      }
    }
    const schemaPostgresMentioned = schemaMentions.some((filePath) => path.basename(filePath) === 'schema-postgres.ts');
    const sqlMentions = [];
    for (const filePath of sqlFiles) {
      const text = await readText(filePath);
      if (text && new RegExp(exactTablePattern(tableName)).test(text)) {
        sqlMentions.push(filePath);
      }
    }

    const schema = mergeFieldSets(schemaSources);
    const sql = mergeFieldSets(sqlSources);
    const liveTable = live.tables[tableName] ?? { present: false, columns: [], indexes: [], columnSet: [], indexSet: [] };

    const schemaExists = schema.columns.length > 0;
    const sqlExists = sql.columns.length > 0 || sql.indexes.length > 0;
    const liveExists = live.reachable && liveTable.present;

    const staticColumnsAligned = schemaExists && sqlExists ? isEqualSet(schema.columns, sql.columns) : false;
    const staticIndexesAligned = schemaExists && sqlExists ? isEqualSet(schema.indexes, sql.indexes) : false;
    const liveColumnsAligned = liveExists ? isEqualSet(liveTable.columnSet, schema.columns.length ? schema.columns : sql.columns) : false;
    const liveIndexesAligned = liveExists ? isEqualSet(liveTable.indexSet, schema.indexes.length ? schema.indexes : sql.indexes) : false;

    let classification = 'LIVE_DB_UNAVAILABLE';
    if (!schemaExists && sqlExists) {
      classification = 'SQL_ONLY';
    } else if (schemaExists && !sqlExists) {
      classification = 'DRIZZLE_ONLY';
    } else if (schemaExists && sqlExists) {
      if (!staticColumnsAligned) {
        classification = 'COLUMN_MISMATCH';
      } else if (!staticIndexesAligned) {
        classification = 'INDEX_MISMATCH';
      } else if (!live.reachable) {
        classification = 'SCHEMA_AND_SQL_ALIGNED';
      } else if (!liveExists) {
        classification = 'LIVE_DB_UNAVAILABLE';
      } else if (!liveColumnsAligned) {
        classification = 'COLUMN_MISMATCH';
      } else if (!liveIndexesAligned) {
        classification = 'INDEX_MISMATCH';
      } else {
        classification = 'LIVE_DB_ALIGNED';
      }
    } else if (live.reachable && liveExists) {
      classification = 'LIVE_DB_ALIGNED';
    }

    tableReports.push({
      tableName,
      classification,
      recommendedRepairClass: recommendRepairClass({
        classification,
        columnDiffs: {
          schemaOnly: sortStrings(setDiff(schema.columns, sql.columns)),
          sqlOnly: sortStrings(setDiff(sql.columns, schema.columns)),
          liveOnly: liveExists ? sortStrings(setDiff(liveTable.columnSet, schema.columns.length ? schema.columns : sql.columns)) : [],
          missingInLive: liveExists ? sortStrings(setDiff(schema.columns.length ? schema.columns : sql.columns, liveTable.columnSet)) : [],
        },
        indexDiffs: {
          schemaOnly: sortStrings(setDiff(schema.indexes, sql.indexes)),
          sqlOnly: sortStrings(setDiff(sql.indexes, schema.indexes)),
          liveOnly: liveExists ? sortStrings(setDiff(liveTable.indexSet, schema.indexes.length ? schema.indexes : sql.indexes)) : [],
          missingInLive: liveExists ? sortStrings(setDiff(schema.indexes.length ? schema.indexes : sql.indexes, liveTable.indexSet)) : [],
        },
      }),
      liveState: !live.reachable ? 'UNAVAILABLE' : (liveExists ? 'PRESENT' : 'TABLE_MISSING'),
      schemaPostgresMentioned,
      schemaSources: schemaSources.map((source) => rel(source.filePath)),
      sqlSources: sqlSources.map((source) => rel(source.filePath)),
      schemaColumns: schema.columns,
      sqlColumns: sql.columns,
      liveColumns: liveTable.columnSet,
      schemaIndexes: schema.indexes,
      sqlIndexes: sql.indexes,
      liveIndexes: liveTable.indexSet,
      columnDiffs: {
        schemaOnly: sortStrings(setDiff(schema.columns, sql.columns)),
        sqlOnly: sortStrings(setDiff(sql.columns, schema.columns)),
        liveOnly: liveExists ? sortStrings(setDiff(liveTable.columnSet, schema.columns.length ? schema.columns : sql.columns)) : [],
        missingInLive: liveExists ? sortStrings(setDiff(schema.columns.length ? schema.columns : sql.columns, liveTable.columnSet)) : [],
      },
      indexDiffs: {
        schemaOnly: sortStrings(setDiff(schema.indexes, sql.indexes)),
        sqlOnly: sortStrings(setDiff(sql.indexes, schema.indexes)),
        liveOnly: liveExists ? sortStrings(setDiff(liveTable.indexSet, schema.indexes.length ? schema.indexes : sql.indexes)) : [],
        missingInLive: liveExists ? sortStrings(setDiff(schema.indexes.length ? schema.indexes : sql.indexes, liveTable.indexSet)) : [],
      },
      notes: [
        !schemaSources.length ? 'No schema leaf table definition found.' : null,
        !sqlSources.length ? 'No SQL mirror definition found.' : null,
        schemaPostgresMentioned ? null : 'schema-postgres.ts does not directly mention this table.',
        !live.reachable ? 'Live Postgres unavailable; static mirror only.' : null,
        live.reachable && !liveExists ? 'Live Postgres reachable, but table is missing from information_schema.' : null,
        'Implicit primary-key indexes are ignored in live index comparison.',
      ].filter(Boolean),
    });
  }

  const classificationCounts = tableReports.reduce((acc, entry) => {
    acc[entry.classification] = (acc[entry.classification] ?? 0) + 1;
    return acc;
  }, {});

  const report = {
    generatedAt: new Date().toISOString(),
    inputs: {
      drizzleDir: rel(DRIZZLE_DIR),
      schemaDir: rel(SCHEMA_DIR),
      schemaPostgres: rel(path.join(SCHEMA_DIR, 'schema-postgres.ts')),
      liveDb: live.reachable ? 'reachable' : 'unavailable',
      liveDbError: live.error ?? null,
    },
    summary: {
      tables: CONTRACT_TABLES.length,
      classificationCounts,
      liveReachable: live.reachable,
      liveError: live.error ?? null,
    },
    tables: tableReports,
    notes: [
      'Read-only mirror audit.',
      'No migrations, DB writes, or schema changes were performed.',
      'schema-postgres.ts is consulted as an input, but the leaf schema files and drizzle SQL define the focus tables.',
    ],
  };

  const md = [
    '# Postgres Contract Mirrors',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Inputs',
    '',
    `- drizzle SQL: ${report.inputs.drizzleDir}`,
    `- Drizzle schema TS: ${report.inputs.schemaDir}`,
    `- schema-postgres.ts: ${report.inputs.schemaPostgres}`,
    `- live Postgres: ${report.inputs.liveDb}${report.inputs.liveDbError ? ` (${report.inputs.liveDbError})` : ''}`,
    '',
    '## Summary',
    '',
    `- tables audited: ${report.summary.tables}`,
    `- live reachable: ${report.summary.liveReachable ? 'yes' : 'no'}`,
    `- classification counts: ${JSON.stringify(report.summary.classificationCounts)}`,
    '',
    '## Table Mirror Status',
    '',
    '| Table | Classification | Live | Schema files | SQL files | Column diff | Index diff |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...tableReports.map((entry) => `| ${entry.tableName} | ${entry.classification} | ${entry.liveState} | ${entry.schemaSources.length || 0} | ${entry.sqlSources.length || 0} | ${entry.columnDiffs.schemaOnly.length || entry.columnDiffs.sqlOnly.length || entry.columnDiffs.liveOnly.length || entry.columnDiffs.missingInLive.length ? 'diff' : 'clean'} | ${entry.indexDiffs.schemaOnly.length || entry.indexDiffs.sqlOnly.length || entry.indexDiffs.liveOnly.length || entry.indexDiffs.missingInLive.length ? 'diff' : 'clean'} |`),
    '',
    '## Non-Green Details',
    '',
    ...tableReports
      .filter((entry) => entry.classification !== 'LIVE_DB_ALIGNED')
      .map((entry) => [
        `### ${entry.tableName}`,
        '',
        `- classification: ${entry.classification}`,
        `- recommended repair: ${entry.recommendedRepairClass ?? 'n/a'}`,
        `- SQL columns: ${entry.sqlColumns.length ? entry.sqlColumns.join(', ') : 'none'}`,
        `- Drizzle columns: ${entry.schemaColumns.length ? entry.schemaColumns.join(', ') : 'none'}`,
        `- live DB columns: ${entry.liveColumns.length ? entry.liveColumns.join(', ') : 'none'}`,
        `- missing columns by side: schemaOnly=[${entry.columnDiffs.schemaOnly.join(', ')}], sqlOnly=[${entry.columnDiffs.sqlOnly.join(', ')}], liveOnly=[${entry.columnDiffs.liveOnly.join(', ')}], missingInLive=[${entry.columnDiffs.missingInLive.join(', ')}]`,
        `- SQL indexes: ${entry.sqlIndexes.length ? entry.sqlIndexes.join(', ') : 'none'}`,
        `- Drizzle/index hints: ${entry.schemaIndexes.length ? entry.schemaIndexes.join(', ') : 'none'}`,
        `- live user-defined indexes: ${entry.liveIndexes.length ? entry.liveIndexes.join(', ') : 'none'}`,
        '',
      ].join('\n')),
    '',
    '## Notes',
    '',
    '- SQL_ONLY means the manual sidecar exists without a Drizzle schema mirror.',
    '- DRIZZLE_ONLY means the Drizzle schema exists without a manual SQL mirror.',
    '- LIVE_DB_ALIGNED means the live table matched the mirror definitions.',
    '- COLUMN_MISMATCH and INDEX_MISMATCH are hard contract drift signals.',
    '- SCHEMA_AND_SQL_ALIGNED is used when the static mirrors agree but the live DB is not available.',
    '- Primary-key indexes are ignored in live comparisons because they are implicit, not contract drift.',
  ].join('\n');

  await fs.mkdir(DOCS_DIR, { recursive: true });
  await fs.writeFile(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(OUT_MD, `${md}\n`, 'utf8');

  console.log(`Wrote ${rel(OUT_JSON)}`);
  console.log(`Wrote ${rel(OUT_MD)}`);
  console.log(JSON.stringify({
    liveReachable: report.summary.liveReachable,
    classificationCounts: report.summary.classificationCounts,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
