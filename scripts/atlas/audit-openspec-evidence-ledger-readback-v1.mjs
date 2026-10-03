import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const ROOT = process.cwd();
const DRY_RUN_PATH = path.join(ROOT, 'docs', 'reports', 'openspec-evidence-migration-dry-run-v1.json');
const OUTPUT_PATH = process.env.OPENSPEC_LEDGER_READBACK_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_LEDGER_READBACK_OUTPUT)
  : path.join(ROOT, 'docs', 'reports', 'openspec-evidence-ledger-readback-v1.json');

const expectedTables = [
  'openspec_changes',
  'openspec_tasks',
  'openspec_dependencies',
  'evidence_receipts',
  'task_evidence',
  'openspec_evidence_chunks',
  'openspec_task_predicate',
  'evidence_assertion',
  'openspec_supersession',
];
const expectedViews = ['openspec_task_current', 'task_evidence_binding', 'openspec_task_current_v2'];
const expectedColumns = {
  openspec_changes: ['change_id', 'path', 'tasks_hash', 'workspace_revision', 'status'],
  openspec_tasks: ['change_id', 'task_id', 'task_ref', 'task_hash', 'declared_checked', 'workspace_revision'],
  openspec_dependencies: ['from_change_id', 'from_task_id', 'to_change_id', 'edge_type'],
  evidence_receipts: ['evidence_id', 'change_id', 'task_id', 'workspace_revision', 'checksum', 'verdict', 'readback'],
  task_evidence: ['change_id', 'task_id', 'evidence_id', 'predicate', 'relation'],
  openspec_evidence_chunks: ['chunk_id', 'canonical_id', 'evidence_id', 'embedding', 'workspace_revision', 'representation_revision'],
  openspec_task_predicate: ['predicate_id', 'change_id', 'task_id', 'predicate_text', 'workspace_revision', 'source_revision'],
  evidence_assertion: ['evidence_id', 'assertion_id', 'expected', 'actual', 'passed', 'checksum'],
  openspec_supersession: ['supersession_id', 'prior_change_id', 'successor_change_id', 'workspace_revision', 'checksum'],
};

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function checksum(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function connectionString() {
  return process.env.OPENSPEC_READBACK_DATABASE_URL
    ?? process.env.POSTGRES_URL
    ?? process.env.DATABASE_URL
    ?? null;
}

function loadDryRun() {
  if (!fs.existsSync(DRY_RUN_PATH)) return null;
  return JSON.parse(fs.readFileSync(DRY_RUN_PATH, 'utf8'));
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll('\\', '/');
}

async function inspectDatabase(databaseUrl) {
  const pool = new Pool({ connectionString: databaseUrl, max: 1, application_name: 'atlas-openspec-evidence-readback' });
  try {
    const relations = await pool.query(`
      SELECT table_name AS name, table_type AS kind
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      UNION ALL
      SELECT table_name AS name, 'VIEW' AS kind
      FROM information_schema.views
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY name
    `, [[...expectedTables, ...expectedViews]]);
    const columns = await pool.query(`
      SELECT table_name AS relation, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name, ordinal_position
    `, [expectedTables]);
    const indexes = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = ANY($1::text[])
    `, [['openspec_evidence_chunks_embedding_hnsw_idx']]);
    const extensions = await pool.query(`
      SELECT extname
      FROM pg_extension
      WHERE extname = ANY($1::text[])
    `, [['vector']]);
    const counts = await pool.query(`
      SELECT relname AS relation, n_live_tup::bigint AS estimated_rows
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
        AND relname = ANY($1::text[])
      ORDER BY relname
    `, [expectedTables]);
    return {
      connected: true,
      relations: relations.rows,
      columns: columns.rows,
      indexes: indexes.rows,
      extensions: extensions.rows,
      estimatedRows: counts.rows,
    };
  } finally {
    await pool.end();
  }
}

function evaluateReadback(observed) {
  if (!observed) {
    return {
      status: 'UNPROVEN_NO_LIVE_DATABASE',
      checks: { liveConnection: false, requiredRelations: false, requiredColumns: false, vectorExtension: false, hnswCosineIndex: false },
      missingRelations: [...expectedTables, ...expectedViews],
      missingColumns: [],
    };
  }
  const relationNames = new Set(observed.relations.map((row) => row.name));
  const missingRelations = [...expectedTables, ...expectedViews].filter((name) => !relationNames.has(name));
  const columnNames = new Map();
  for (const row of observed.columns) {
    if (!columnNames.has(row.relation)) columnNames.set(row.relation, new Set());
    columnNames.get(row.relation).add(row.column_name);
  }
  const missingColumns = Object.entries(expectedColumns).flatMap(([relation, columns]) => columns.filter((column) => !columnNames.get(relation)?.has(column)).map((column) => `${relation}.${column}`));
  const vectorExtension = observed.extensions.some((row) => row.extname === 'vector');
  const hnswCosineIndex = observed.indexes.some((row) => /using hnsw/i.test(row.indexdef) && /vector_cosine_ops/i.test(row.indexdef));
  const checks = {
    liveConnection: true,
    requiredRelations: missingRelations.length === 0,
    requiredColumns: missingColumns.length === 0,
    vectorExtension,
    hnswCosineIndex,
  };
  const status = Object.values(checks).every(Boolean) ? 'READBACK_SCHEMA_PROVEN' : 'BLOCKED_SCHEMA_MISMATCH';
  return { status, checks, missingRelations, missingColumns };
}

async function main() {
  const dryRun = loadDryRun();
  const databaseUrl = connectionString();
  let observed = null;
  let connectionError = null;
  if (databaseUrl) {
    try {
      observed = await inspectDatabase(databaseUrl);
    } catch (error) {
      connectionError = error instanceof Error ? error.message : String(error);
    }
  }
  const evaluated = connectionError
    ? { status: 'BLOCKED_LIVE_READBACK_ERROR', checks: { liveConnection: false, requiredRelations: false, requiredColumns: false, vectorExtension: false, hnswCosineIndex: false }, missingRelations: [], missingColumns: [] }
    : evaluateReadback(observed);
  const unsigned = {
    schema: 'atlas.openspec-evidence-ledger-readback.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY',
    status: evaluated.status,
    dryRun: dryRun ? { path: relative(DRY_RUN_PATH), status: dryRun.status, checks: dryRun.checks } : null,
    checks: evaluated.checks,
    missingRelations: evaluated.missingRelations,
    missingColumns: evaluated.missingColumns,
    connectionError,
    observed: observed ? { relations: observed.relations, columns: observed.columns, indexes: observed.indexes, extensions: observed.extensions, estimatedRows: observed.estimatedRows } : null,
    canonicalAuthority: evaluated.status === 'READBACK_SCHEMA_PROVEN',
    writesPerformed: false,
    evidence: [relative(DRY_RUN_PATH), 'information_schema.tables', 'information_schema.columns', 'pg_indexes', 'pg_extension', 'pg_stat_user_tables'],
    likely_cause: 'The EVF ledger must not be treated as canonical until the reviewed design and live PostgreSQL structure have an independent read-only readback.',
    patch_targets: ['scripts/atlas/audit-openspec-evidence-ledger-readback-v1.mjs', 'sveltekit-frontend/drizzle/manual/20261001_openspec_evidence_fabric_v1.sql', 'sveltekit-frontend/drizzle/manual/20261001_openspec_evidence_fabric_v2.sql'],
    safe_next_command: 'node scripts/atlas/audit-openspec-evidence-migration-v1.mjs',
    smoke_command: 'node scripts/atlas/audit-openspec-evidence-ledger-readback-v1.mjs',
    report_path: relative(OUTPUT_PATH),
  };
  const report = { ...unsigned, checksum: checksum(unsigned) };
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, status: report.status, checks: report.checks, writesPerformed: report.writesPerformed, output: OUTPUT_PATH }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
