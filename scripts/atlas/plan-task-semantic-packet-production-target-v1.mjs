/**
 * Read-only production-target and migration-minset planner.
 * Consumes the writer matrix; never applies SQL or invokes a writer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const matrixPath = path.join(repoRoot, 'docs', 'reports', 'task-semantic-packet-writer-column-matrix-v1.json');
const minsetPath = path.join(repoRoot, 'sveltekit-frontend', 'drizzle', 'manual', '20260908_task_semantic_packets_writer_columns_only.sql');
const reportPath = path.join(repoRoot, 'docs', 'reports', 'task-semantic-packet-production-target-v1.json');

const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
const writers = Array.isArray(matrix.writers) ? matrix.writers : [];
const productionIds = new Set(['mcp-create-task-semantic-packet', 'api-post-task-semantic-packet']);
const productionWriters = writers.filter((writer) => productionIds.has(writer.writerId));
const liveColumns = new Set(matrix.liveSchema?.columns ?? []);
const productionRequired = [...new Set(productionWriters.flatMap((writer) => writer.requiredColumns))].sort();
const migrationMinset = productionRequired.filter((column) => !liveColumns.has(column));
const sql = fs.existsSync(minsetPath) ? fs.readFileSync(minsetPath, 'utf8') : '';
const sqlColumns = [...sql.matchAll(/ADD COLUMN IF NOT EXISTS\s+([a-z_][a-z0-9_]*)/gi)].map((match) => match[1]).sort();
const sameSet = sqlColumns.length === migrationMinset.length && sqlColumns.every((column, index) => column === migrationMinset[index]);

const report = {
  schema: 'atlas.task-semantic-packet-production-target.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  productionWritesPerformed: false,
  targetTable: 'public.task_semantic_packets',
  sourceMatrix: path.relative(repoRoot, matrixPath),
  liveSchema: matrix.liveSchema,
  productionTarget: {
    writerIds: productionWriters.map((writer) => writer.writerId),
    excludedWriterIds: writers.filter((writer) => !productionIds.has(writer.writerId)).map((writer) => writer.writerId),
    rationale: 'Only the guarded MCP lifecycle and current API route are production targets; offline and legacy writers remain separately gated.',
  },
  requiredColumns: productionRequired,
  migrationMinset,
  candidateMigration: {
    path: path.relative(repoRoot, minsetPath),
    exists: fs.existsSync(minsetPath),
    addColumnColumns: sqlColumns,
    exactlyMatchesMigrationMinset: sameSet,
    unapplied: true,
  },
  gates: {
    liveSchemaProven: matrix.liveSchema?.status === 'proven' || matrix.liveSchema?.status === 'proven-via-docker',
    productionTargetResolved: productionWriters.length === 2,
    migrationMinsetResolved: migrationMinset.length > 0,
    candidateMatchesMinset: sameSet,
    applyAuthorized: false,
  },
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, productionWriterIds: report.productionTarget.writerIds, migrationMinsetCount: migrationMinset.length, candidateMatchesMinset: sameSet, applyAuthorized: false }, null, 2));
