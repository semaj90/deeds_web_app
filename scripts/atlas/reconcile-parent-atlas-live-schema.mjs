#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'parent-atlas-live-schema-reconciliation.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'parent-atlas-live-schema-reconciliation.md');

const TABLE_SPECS = [
  {
    table: 'atlas_tree_nodes',
    title: 'Tree Nodes',
    canonicalGroups: [
      { name: 'node_id', families: ['uuid'] },
      { name: 'packet_key', families: ['text', 'uuid'] },
      { name: 'root_id', families: ['uuid'] },
      { name: 'parent_id', families: ['uuid'], aliases: ['parent_node_id'] },
      { name: 'source_ref', families: ['text'] },
      { name: 'file_path', families: ['text'] },
      { name: 'page_index_path', families: ['text'] },
      { name: 'node_type', families: ['text'] },
      { name: 'tree_depth', families: ['integer', 'smallint'] },
      { name: 'title', families: ['text'] },
      { name: 'summary', families: ['text'] },
      { name: 'metadata', families: ['json', 'jsonb'] },
      { name: 'ledger_type', families: ['text'] },
      { name: 'lineage_version', families: ['text'] },
    ],
    expectedIndexes: [
      { label: 'packet_key', columns: ['packet_key'] },
      { label: 'source_ref', columns: ['source_ref'] },
      { label: 'parent_id', columns: ['parent_id', 'parent_node_id'] },
    ],
  },
  {
    table: 'atlas_summary_layers',
    title: 'Summary Layers',
    canonicalGroups: [
      { name: 'packet_key', families: ['text', 'uuid'] },
      { name: 'summary_type', families: ['text', 'enum'], aliases: ['summary_level'] },
      { name: 'summary_text', families: ['text'] },
      { name: 'embedding', families: ['vector', 'json', 'jsonb', 'array'] },
      { name: 'keywords', families: ['json', 'jsonb', 'array'] },
      { name: 'metadata', families: ['json', 'jsonb'] },
      { name: 'generated_at', families: ['timestamp', 'timestamptz', 'date'] },
      { name: 'model_name', families: ['text'] },
    ],
    expectedIndexes: [
      { label: 'packet_key', columns: ['packet_key'] },
      { label: 'summary_type', columns: ['summary_type', 'summary_level'] },
    ],
  },
  {
    table: 'atlas_topology_index',
    title: 'Topology Index',
    canonicalGroups: [
      { name: 'packet_key', families: ['text', 'uuid'] },
      { name: 'x_cosine', families: ['real', 'double precision', 'numeric'] },
      { name: 'y_graph', families: ['integer', 'real', 'double precision', 'numeric'] },
      { name: 'z_som', families: ['integer', 'smallint', 'real', 'double precision', 'numeric'], aliases: ['som_cluster'] },
      { name: 'w_authority', families: ['real', 'double precision', 'numeric'], aliases: ['authority_score'] },
      { name: 'community_id', families: ['integer', 'bigint', 'smallint'] },
      { name: 'tree_node_id', families: ['uuid', 'text'] },
    ],
    expectedIndexes: [
      { label: 'packet_key', columns: ['packet_key'] },
      { label: 'tree_node_id', columns: ['tree_node_id'] },
      { label: 'community_id', columns: ['community_id'] },
      { label: 'z_som', columns: ['z_som', 'som_cluster'] },
    ],
  },
];

function loadEnvFiles(root = REPO_ROOT) {
  const candidates = [
    path.join(root, '.env'),
    path.join(root, '.env.local'),
    path.join(root, 'sveltekit-frontend', '.env'),
    path.join(root, 'sveltekit-frontend', '.env.local'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const parsed = dotenv.parse(fs.readFileSync(file));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined || process.env[key] === '') process.env[key] = value;
    }
  }
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map((item) => stableJson(item));
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        const normalized = stableJson(value[key]);
        if (normalized !== undefined) acc[key] = normalized;
        return acc;
      }, {});
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableJson(value ?? null));
}

function hashText(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

function pickColumn(rows, names) {
  for (const name of names) {
    const found = rows.find((row) => row.column_name === name);
    if (found) return found;
  }
  return null;
}

function familyForColumn(row) {
  const type = normalizeText(row?.data_type).toLowerCase();
  const udt = normalizeText(row?.udt_name).toLowerCase();
  if (udt === 'vector') return 'vector';
  if (type === 'user-defined') return `enum:${udt}`;
  if (type === 'character varying' || type === 'varchar' || type === 'text' || type === 'citext' || type === 'character') return 'text';
  if (type === 'smallint' || type === 'integer' || type === 'bigint') return 'integer';
  if (type === 'real' || type === 'double precision' || type === 'numeric') return 'numeric';
  if (type === 'timestamp without time zone' || type === 'timestamp with time zone' || type === 'date') return 'timestamp';
  if (type === 'json' || type === 'jsonb') return type;
  if (type === 'ARRAY') return 'array';
  return type || udt || 'unknown';
}

function inspectGroup(columnsByName, group) {
  const aliases = [group.name, ...(group.aliases || [])];
  const resolved = pickColumn(columnsByName, aliases);
  const canonical = columnsByName.find((row) => row.column_name === group.name);
  const status = canonical
    ? 'CANONICAL'
    : resolved
      ? 'ALIAS_ONLY'
      : 'MISSING';

  return {
    canonical: group.name,
    aliases: group.aliases || [],
    status,
    resolved_column: resolved?.column_name ?? null,
    actual_type: resolved ? familyForColumn(resolved) : null,
    actual_db_type: resolved ? normalizeText(resolved.data_type) : null,
    udt_name: resolved ? normalizeText(resolved.udt_name) : null,
    nullable: resolved ? resolved.is_nullable === 'YES' : null,
    default: resolved ? resolved.column_default ?? null : null,
    type_ok: resolved ? (group.families || []).includes(familyForColumn(resolved)) : false,
  };
}

function inspectIndex(definitions, columns) {
  const normalizedDefs = definitions.map((row) => ({
    name: row.indexname,
    def: normalizeText(row.indexdef).toLowerCase(),
  }));

  const aliases = columns.filter(Boolean);
  const hits = normalizedDefs.filter((indexDef) => aliases.some((column) => indexDef.def.includes(`(${column.toLowerCase()}`) || indexDef.def.includes(` ${column.toLowerCase()}`)));

  return {
    columns,
    status: hits.length > 0 ? (hits.some((hit) => columns.some((column) => hit.def.includes(`(${column.toLowerCase()}`))) ? 'CANONICAL' : 'ALIAS_ONLY') : 'MISSING',
    indexes: hits.map((hit) => hit.name),
  };
}

async function inspectLiveSchema(pool) {
  const client = await pool.connect();
  try {
    const tables = [];
    for (const spec of TABLE_SPECS) {
      const existsRes = await client.query(
        `SELECT EXISTS (
           SELECT 1
           FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = $1
         ) AS exists`,
        [spec.table],
      );

      const exists = Boolean(existsRes.rows[0]?.exists);
      if (!exists) {
        tables.push({
          table: spec.table,
          title: spec.title,
          exists: false,
          row_count: null,
          columns: [],
          indexes: [],
          groups: spec.canonicalGroups.map((group) => ({
            canonical: group.name,
            aliases: group.aliases || [],
            status: 'MISSING',
            resolved_column: null,
            actual_type: null,
            actual_db_type: null,
            udt_name: null,
            nullable: null,
            default: null,
            type_ok: false,
          })),
          expectedIndexes: spec.expectedIndexes.map((index) => ({
            label: index.label,
            columns: index.columns,
            status: 'MISSING',
            indexes: [],
          })),
        });
        continue;
      }

      const [columnsRes, indexesRes, countRes] = await Promise.all([
        client.query(
          `SELECT column_name, data_type, udt_name, is_nullable, column_default, ordinal_position
           FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = $1
           ORDER BY ordinal_position`,
          [spec.table],
        ),
        client.query(
          `SELECT indexname, indexdef
           FROM pg_indexes
           WHERE schemaname = 'public' AND tablename = $1
           ORDER BY indexname`,
          [spec.table],
        ),
        client.query(`SELECT COUNT(*)::bigint AS count FROM ${spec.table}`),
      ]);

      const columns = columnsRes.rows;
      const indexes = indexesRes.rows;
      const groups = spec.canonicalGroups.map((group) => inspectGroup(columns, group));
      const expectedIndexes = spec.expectedIndexes.map((index) => inspectIndex(indexes, index.columns));

      tables.push({
        table: spec.table,
        title: spec.title,
        exists: true,
        row_count: Number(countRes.rows[0]?.count ?? 0),
        columns,
        indexes,
        groups,
        expectedIndexes: expectedIndexes.map((entry, idx) => ({
          label: spec.expectedIndexes[idx].label,
          columns: spec.expectedIndexes[idx].columns,
          ...entry,
        })),
      });
    }
    return tables;
  } finally {
    client.release();
  }
}

function buildLiveSchemaReport(tables, { generatedAt = new Date().toISOString() } = {}) {
  const tableSummaries = tables.map((table) => {
    const groupCounts = table.groups.reduce((acc, group) => {
      acc.total += 1;
      if (group.status === 'CANONICAL') acc.canonical += 1;
      if (group.status === 'ALIAS_ONLY') acc.aliasOnly += 1;
      if (group.status === 'MISSING') acc.missing += 1;
      if (!group.type_ok && group.status !== 'MISSING') acc.typeMismatch += 1;
      return acc;
    }, { total: 0, canonical: 0, aliasOnly: 0, missing: 0, typeMismatch: 0 });

    const indexCounts = table.expectedIndexes.reduce((acc, index) => {
      acc.total += 1;
      if (index.status !== 'MISSING') acc.found += 1;
      if (index.status === 'ALIAS_ONLY') acc.aliasOnly += 1;
      if (index.status === 'MISSING') acc.missing += 1;
      return acc;
    }, { total: 0, found: 0, aliasOnly: 0, missing: 0 });

    return {
      table: table.table,
      title: table.title,
      exists: table.exists,
      row_count: table.row_count,
      columns: table.columns,
      groups: table.groups,
      expectedIndexes: table.expectedIndexes,
      counts: { ...groupCounts, indexes: indexCounts },
    };
  });

  const totals = tableSummaries.reduce((acc, table) => {
    acc.tables += 1;
    if (!table.exists) acc.missingTables += 1;
    acc.columns += table.counts.total;
    acc.canonical += table.counts.canonical;
    acc.aliasOnly += table.counts.aliasOnly;
    acc.missing += table.counts.missing;
    acc.typeMismatch += table.counts.typeMismatch;
    acc.indexes += table.counts.indexes.total;
    acc.indexesFound += table.counts.indexes.found;
    acc.indexesMissing += table.counts.indexes.missing;
    return acc;
  }, {
    tables: 0,
    missingTables: 0,
    columns: 0,
    canonical: 0,
    aliasOnly: 0,
    missing: 0,
    typeMismatch: 0,
    indexes: 0,
    indexesFound: 0,
    indexesMissing: 0,
  });

  const status = totals.missingTables > 0 || totals.missing > 0 || totals.indexesMissing > 0
    ? 'FAIL'
    : totals.aliasOnly > 0 || totals.typeMismatch > 0
      ? 'PASS_WITH_WARNINGS'
      : 'PASS';

  const recommendedActions = [];
  for (const table of tableSummaries) {
    for (const group of table.groups) {
      if (group.status === 'MISSING') {
        recommendedActions.push({
          kind: 'column',
          table: table.table,
          canonical: group.canonical,
          aliases: group.aliases,
          action: `ALTER TABLE ${table.table} ADD COLUMN IF NOT EXISTS ${group.canonical} ...;`,
        });
      } else if (group.status === 'ALIAS_ONLY') {
        recommendedActions.push({
          kind: 'alias',
          table: table.table,
          canonical: group.canonical,
          aliases: group.aliases,
          action: `Normalize callsites to ${group.canonical} and preserve ${group.aliases.join(', ')} only as compatibility aliases.`,
        });
      } else if (!group.type_ok) {
        recommendedActions.push({
          kind: 'type',
          table: table.table,
          canonical: group.canonical,
          actual_type: group.actual_db_type,
          action: `Review ${table.table}.${group.canonical} type family; live type is ${group.actual_db_type || 'unknown'}.`,
        });
      }
    }
    for (const index of table.expectedIndexes) {
      if (index.status === 'MISSING') {
        recommendedActions.push({
          kind: 'index',
          table: table.table,
          columns: index.columns,
          action: `CREATE INDEX IF NOT EXISTS on ${table.table} (${index.columns.join(', ')});`,
        });
      }
    }
  }

  return {
    generated_at: generatedAt,
    status,
    signature: hashText(stableStringify({ tableSummaries, totals })),
    totals,
    tables: tableSummaries,
    recommended_actions: recommendedActions,
  };
}

function renderMarkdown(report) {
  const lines = [
    '# Parent Atlas Live Schema Reconciliation',
    '',
    `- Generated: ${report.generated_at}`,
    `- Status: ${report.status}`,
    `- Signature: \`${report.signature}\``,
    '',
    '## Totals',
    `- Tables checked: ${report.totals.tables}`,
    `- Missing tables: ${report.totals.missingTables}`,
    `- Canonical groups present: ${report.totals.canonical}/${report.totals.columns}`,
    `- Alias-only groups: ${report.totals.aliasOnly}`,
    `- Missing groups: ${report.totals.missing}`,
    `- Type mismatches: ${report.totals.typeMismatch}`,
    `- Indexes found: ${report.totals.indexesFound}/${report.totals.indexes}`,
    `- Indexes missing: ${report.totals.indexesMissing}`,
    '',
  ];

  for (const table of report.tables) {
    lines.push(`## ${table.title} (${table.table})`);
    lines.push(`- Exists: ${table.exists ? 'yes' : 'no'}`);
    if (table.exists) lines.push(`- Rows: ${table.row_count}`);
    lines.push(`- Canonical groups: ${table.counts.canonical}/${table.counts.total}`);
    lines.push(`- Alias-only groups: ${table.counts.aliasOnly}`);
    lines.push(`- Missing groups: ${table.counts.missing}`);
    lines.push(`- Indexes found: ${table.counts.indexes.found}/${table.counts.indexes.total}`);
    for (const group of table.groups) {
      lines.push(`  - ${group.canonical}: ${group.status}${group.resolved_column && group.resolved_column !== group.canonical ? ` (${group.resolved_column})` : ''}${group.type_ok ? '' : group.status !== 'MISSING' ? ` [type=${group.actual_db_type ?? 'unknown'}]` : ''}`);
    }
    lines.push('');
  }

  if (report.recommended_actions.length > 0) {
    lines.push('## Recommended actions');
    for (const action of report.recommended_actions) {
      lines.push(`- [${action.kind}] ${action.action}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function main(argv = process.argv.slice(2)) {
  loadEnvFiles();
  const outputJson = argv.includes('--json');
  const applyRequested = argv.includes('--apply');
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    statement_timeout: 30000,
  });

  let status = 'FAIL';
  let report;

  try {
    const tables = await inspectLiveSchema(pool);
    report = buildLiveSchemaReport(tables);
    status = report.status;
  } catch (error) {
    report = {
      generated_at: new Date().toISOString(),
      status: 'SERVICE_UNAVAILABLE',
      error: error?.message || String(error),
      tables: [],
      totals: { tables: 0, missingTables: 0, columns: 0, canonical: 0, aliasOnly: 0, missing: 0, typeMismatch: 0, indexes: 0, indexesFound: 0, indexesMissing: 0 },
      recommended_actions: [],
      signature: hashText(error?.message || String(error)),
    };
    status = report.status;
  } finally {
    await pool.end().catch(() => {});
  }

  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(REPORT_MD, renderMarkdown(report), 'utf8');

  if (!outputJson) {
    console.log(`\n═══ Parent Atlas Live Schema Reconciliation ══════════════════`);
    console.log(`Status: ${status}`);
    console.log(`Report: ${path.relative(REPO_ROOT, REPORT_JSON)}`);
    if (report.error) console.log(`Error: ${report.error}`);
    for (const table of report.tables) {
      console.log(`- ${table.table}: ${table.exists ? 'present' : 'missing'} (${table.counts.canonical}/${table.counts.total} canonical groups)`);
    }
    if (applyRequested) {
      console.log('Note: --apply is accepted for parity with other audit scripts; this lane is read-only.');
    }
  } else {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  }

  process.exitCode = status === 'PASS' || status === 'PASS_WITH_WARNINGS' ? 0 : 1;
  return report;
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  main().catch((error) => {
    console.error(`❌ Fatal: ${error?.message || String(error)}`);
    process.exit(1);
  });
}

export {
  TABLE_SPECS,
  buildLiveSchemaReport,
  inspectLiveSchema,
  loadEnvFiles,
  main,
  renderMarkdown as renderLiveSchemaMarkdown,
};
