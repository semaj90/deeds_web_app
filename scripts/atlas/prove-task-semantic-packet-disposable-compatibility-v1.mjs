/**
 * Prove task_semantic_packets writer compatibility in an ephemeral PostgreSQL
 * 18 container. This never reads DATABASE_URL and never connects to legal_ai_db.
 *
 * The proof deliberately starts from the currently observed 16-column live
 * shape, applies the proposed manual alignment SQL, then checks the active
 * writer insert contract. It is a compatibility proof, not a migration.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const sourcePath = resolve(repoRoot, 'sveltekit-frontend', 'src/lib/server/tasks/semantic-packets.ts');
const alignmentPath = resolve(repoRoot, 'sveltekit-frontend', 'drizzle/manual/20260908_task_semantic_packets_writer_columns_only.sql');
const indexPath = resolve(repoRoot, 'sveltekit-frontend', 'drizzle/manual/20260908_task_semantic_packets_production_indexes.sql');
const reportPath = resolve(repoRoot, 'docs/reports/task-semantic-packet-disposable-compatibility-v1.json');
const suffix = `${process.pid}-${Date.now().toString(36)}`;
const containerName = `atlas-task-semantic-packet-proof-${suffix}`;
const database = 'atlas_task_semantic_packet_proof';
const user = 'atlas_proof';
const password = `atlas-proof-${suffix}`;
const image = process.argv.includes('--image')
  ? process.argv[process.argv.indexOf('--image') + 1] || 'postgres:18'
  : 'postgres:18';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.capture ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'inherit', 'inherit'],
    input: options.input,
    env: options.env ?? process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status}): ${(result.stderr || '').trim()}`);
  }
  return result.stdout || '';
}

function docker(args, options = {}) { return run('docker', args, options); }

function psql(statement) {
  return docker([
    'exec', '-i', containerName, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1',
    '-U', user, '-d', database, '-A', '-t',
  ], { input: statement, capture: true }).trim();
}

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

function parseWriterColumns() {
  const source = readFileSync(sourcePath, 'utf8');
  const match = source.match(/const TASK_SEMANTIC_PACKET_INSERT_COLUMNS = \[([\s\S]*?)\] as const/);
  if (!match) throw new Error('WRITER_INSERT_CONTRACT_NOT_FOUND');
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((entry) => entry[1]);
}

function parseAlignmentColumns() {
  const sql = readFileSync(alignmentPath, 'utf8');
  return [...sql.matchAll(/ADD COLUMN IF NOT EXISTS\s+([a-z_]+)/gi)].map((entry) => entry[1]);
}

function parseIndexNames() {
  const sql = readFileSync(indexPath, 'utf8');
  return [...sql.matchAll(/CREATE INDEX IF NOT EXISTS\s+([a-z_]+)/gi)].map((entry) => entry[1]);
}

const baselineSql = `
CREATE TABLE public.task_semantic_packets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key text,
  source_ref text,
  feature_id text,
  feature_label text,
  alias_id text,
  qdrant_score real,
  cluster_score real,
  topological_score real,
  fusion_score real,
  metadata jsonb,
  semantic_vector jsonb,
  validation_status text,
  error_message text,
  created_at timestamptz,
  updated_at timestamptz
);
`;

const writerColumns = parseWriterColumns();
const alignmentColumns = parseAlignmentColumns();
const expectedIndexNames = parseIndexNames();
let containerStarted = false;
let report;

try {
  docker(['run', '-d', '--rm', '--name', containerName, '--label', 'parent-atlas-purpose=task-semantic-packet-disposable-proof', '-e', `POSTGRES_USER=${user}`, '-e', `POSTGRES_PASSWORD=${password}`, '-e', `POSTGRES_DB=${database}`, image, 'postgres'], { capture: true });
  containerStarted = true;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { psql('SELECT 1;'); break; } catch (error) {
      if (attempt === 29) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    }
  }

  psql(baselineSql);
  psql(readFileSync(alignmentPath, 'utf8'));
  psql(readFileSync(indexPath, 'utf8'));
  const columns = psql(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='task_semantic_packets' ORDER BY ordinal_position;`)
    .split('\n').map((value) => value.trim()).filter(Boolean);
  const present = new Set(columns);
  const missingAfterAlignment = writerColumns.filter((column) => !present.has(column));
  const migrationCoverageGap = writerColumns.filter((column) => !alignmentColumns.includes(column) && ![
    'id', 'packet_key', 'source_ref', 'feature_id', 'feature_label', 'alias_id', 'created_at', 'updated_at',
  ].includes(column));
  const indexNames = psql(`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='task_semantic_packets' ORDER BY indexname;`)
    .split('\n').map((value) => value.trim()).filter(Boolean);
  const missingExpectedIndexes = expectedIndexNames.filter((name) => !indexNames.includes(name));

  const probeId = psql(`
    INSERT INTO public.task_semantic_packets (
      packet_key, source_ref, feature_id, feature_label, alias_id,
      point_kind, qdrant_point_id, workspace_id, workspace_task_id,
      file_path, semantic_path, related_feature_ids, related_task_ids,
      related_file_paths, cluster_id, centroid_id, parent_centroid_id,
      summary_llm, summary_model, next_action, summary_hash, confidence,
      status, agent_pickup_ready, deleted
    ) VALUES (
      'proof:packet:1', 'proof:source:1', 'proof-feature', 'Proof feature', 'proof-alias',
      'task_summary', 'proof-qdrant-point', 'proof-workspace', NULL,
      'proof.ts', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
      NULL, NULL, NULL, 'proof summary', 'proof-model', 'verify',
      '${sha256('proof summary')}', '0.9000', 'todo', false, false
    ) RETURNING id;
  `);
  const readback = psql(`
    SELECT id::text, packet_key, point_kind, status, agent_pickup_ready, deleted
    FROM public.task_semantic_packets
    WHERE id = '${probeId}';
  `);

  report = {
    schema: 'atlas.task-semantic-packet-disposable-compatibility.v1',
    status: missingAfterAlignment.length === 0 && missingExpectedIndexes.length === 0 ? 'PROVEN' : 'BLOCKED_MIGRATION_INCOMPLETE',
    writesPerformed: false,
    disposableContainer: true,
    baselineColumnCount: 16,
    alignmentColumnCount: alignmentColumns.length,
    writerColumns,
    alignmentColumns,
    columnsAfterAlignment: columns,
    missingAfterAlignment,
    migrationCoverageGap,
    expectedIndexNames,
    indexesAfterAlignment: indexNames,
    missingExpectedIndexes,
    disposableInsertReadback: {
      performed: true,
      rowCount: readback ? 1 : 0,
      returnedId: probeId,
      row: readback ? readback.split('|') : [],
      productionWritesPerformed: false,
    },
    sourceChecksums: {
      writerSource: sha256(readFileSync(sourcePath, 'utf8')),
      alignmentSql: sha256(readFileSync(alignmentPath, 'utf8')),
      indexSql: sha256(readFileSync(indexPath, 'utf8')),
    },
    reportPath,
  };
} catch (error) {
  report = {
    schema: 'atlas.task-semantic-packet-disposable-compatibility.v1',
    status: 'PROOF_ERROR',
    writesPerformed: false,
    disposableContainer: true,
    error: error instanceof Error ? error.message : String(error),
    reportPath,
  };
} finally {
  if (containerStarted) spawnSync('docker', ['rm', '-f', containerName], { cwd: repoRoot, stdio: 'ignore' });
}

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (report.status === 'PROOF_ERROR') process.exitCode = 1;
