/**
 * Read-only census of task_semantic_packets writers versus the live Postgres
 * column set. This is an admission artifact, not a migration or repair tool.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const reportPath = path.join(repoRoot, 'docs', 'reports', 'task-semantic-packet-writer-column-matrix-v1.json');

const activeWriterColumns = [
  'point_kind', 'qdrant_point_id', 'workspace_id', 'workspace_task_id',
  'feature_id', 'alias_id', 'source_ref', 'file_path', 'semantic_path',
  'related_feature_ids', 'related_task_ids', 'related_file_paths', 'cluster_id',
  'centroid_id', 'parent_centroid_id', 'summary_llm', 'summary_model',
  'next_action', 'summary_hash', 'confidence', 'status', 'agent_pickup_ready',
  'observed_at', 'valid_from', 'valid_to', 'created_at', 'updated_at', 'deleted',
];

const writerSpecs = [
  {
    writerId: 'mcp-create-task-semantic-packet',
    path: 'sveltekit-frontend/src/lib/server/tasks/semantic-packets.ts',
    mode: 'drizzle',
    evidence: 'TASK_SEMANTIC_PACKET_INSERT_COLUMNS and createTaskSemanticPacket values object',
    requiredColumns: activeWriterColumns,
    status: 'active guarded writer',
  },
  {
    writerId: 'api-post-task-semantic-packet',
    path: 'sveltekit-frontend/src/routes/api/tasks/packets/+server.ts',
    mode: 'drizzle',
    evidence: 'POST handler insert(taskSemanticPackets).values()',
    requiredColumns: ['point_kind', 'workspace_task_id', 'feature_id', 'source_ref', 'file_path', 'summary_llm', 'next_action', 'confidence', 'status', 'cluster_id', 'semantic_path', 'related_feature_ids', 'related_file_paths', 'agent_pickup_ready'],
    status: 'active route writer; no schema guard observed',
  },
  {
    writerId: 'batch-offline-ingest-with-alias',
    path: 'scripts/atlas/batch-offline-ingest.mjs',
    mode: 'raw-sql',
    evidence: 'INSERT branch with alias_id',
    requiredColumns: ['id', 'qdrant_point_id', 'workspace_task_id', 'feature_id', 'alias_id', 'summary_model', 'summary_hash', 'confidence', 'status', 'agent_pickup_ready', 'deleted', 'created_at', 'updated_at'],
    status: 'explicit-apply batch writer',
  },
  {
    writerId: 'batch-offline-ingest-without-alias',
    path: 'scripts/atlas/batch-offline-ingest.mjs',
    mode: 'raw-sql',
    evidence: 'INSERT branch without alias_id',
    requiredColumns: ['id', 'qdrant_point_id', 'workspace_task_id', 'feature_id', 'summary_model', 'summary_hash', 'confidence', 'status', 'agent_pickup_ready', 'deleted', 'created_at', 'updated_at'],
    status: 'explicit-apply batch writer',
  },
  {
    writerId: 'agent-pickup-packet-writer',
    path: 'scripts/atlas/create-agent-pickup-packets.mjs',
    mode: 'raw-sql',
    evidence: 'INSERT ... RETURNING id',
    requiredColumns: ['workspace_task_id', 'workspace_id', 'feature_id', 'source_ref', 'summary_model', 'summary_hash', 'confidence', 'status', 'agent_pickup_ready', 'deleted', 'created_at', 'updated_at'],
    status: 'explicit-apply legacy writer; currently dry-run by default',
  },
  {
    writerId: 'legacy-ingest-packets',
    path: 'ingest-packets.mjs',
    mode: 'raw-sql',
    evidence: 'INSERT ... ON CONFLICT (id)',
    requiredColumns: ['id', 'source_ref', 'feature_id', 'packet_key', 'qdrant_point_id', 'som_cluster', 'som_row', 'som_col', 'community_id', 'status', 'metadata', 'created_at', 'updated_at'],
    status: 'legacy direct writer; schema-incompatible fields observed',
  },
  {
    writerId: 'feature-todo-generator',
    path: 'scripts/atlas/generate-feature-todos.mjs',
    mode: 'raw-sql',
    evidence: 'INSERT ... ON CONFLICT DO NOTHING',
    requiredColumns: ['packet_key', 'task_title', 'task_type', 'task_status', 'source_ref', 'metadata', 'created_at'],
    status: 'legacy explicit-apply writer; obsolete task columns',
  },
  {
    writerId: 'recovery-template-writer',
    path: 'scripts/atlas/generate-recovery-template-from-packet.mjs',
    mode: 'raw-sql',
    evidence: 'optional INSERT ... ON CONFLICT DO NOTHING',
    requiredColumns: ['packet_key', 'task_title', 'task_type', 'task_status', 'source_ref', 'metadata', 'created_at'],
    status: 'legacy optional writer; obsolete task columns',
  },
  {
    writerId: 'phase17-feature-extractor',
    path: 'sveltekit-frontend/src/lib/server/ml/phase17-feature-extractor.ts',
    mode: 'raw-sql-intent-only',
    evidence: 'INSERT SQL is logged; execution intentionally not implemented',
    requiredColumns: ['packet_key', 'source_ref', 'feature_id', 'feature_label', 'alias_id', 'qdrant_score', 'cluster_score', 'topological_score', 'fusion_score', 'metadata', 'semantic_vector', 'validation_status', 'error_message'],
    status: 'not an active writer; logged intent only',
  },
];

function unique(values) { return [...new Set(values)]; }

async function readLiveColumns() {
  const query = `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'task_semantic_packets' ORDER BY ordinal_position;`;
  if (!process.env.DATABASE_URL) {
    try {
      const output = execFileSync('docker', [
        'exec', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db',
        '-At', '-c', query,
      ], { cwd: repoRoot, encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] });
      const columns = output.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
      return { status: 'proven-via-docker', columns };
    } catch (error) {
      return { status: 'unavailable', columns: [], reason: `DATABASE_URL not set; Docker fallback failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000, max: 1 });
  try {
    const result = await pool.query(query);
    return { status: 'proven', columns: result.rows.map((row) => row.column_name) };
  } catch (error) {
    return { status: 'error', columns: [], reason: error instanceof Error ? error.message : String(error) };
  } finally {
    await pool.end().catch(() => {});
  }
}

function fileEvidence(spec) {
  const absolute = path.join(repoRoot, spec.path);
  return { exists: fs.existsSync(absolute), absolutePath: absolute };
}

const live = await readLiveColumns();
const liveSet = new Set(live.columns);
const writers = writerSpecs.map((spec) => {
  const required = unique(spec.requiredColumns);
  const missing = required.filter((column) => !liveSet.has(column));
  const evidence = fileEvidence(spec);
  return {
    ...spec,
    fileExists: evidence.exists,
    requiredColumns: required,
    liveColumns: live.columns,
    missingLiveColumns: missing,
    compatibleWithLiveSchema: live.status === 'proven' && missing.length === 0,
    classification: spec.mode === 'raw-sql-intent-only'
      ? 'intent-only'
      : missing.length === 0 ? 'compatible' : 'blocked-by-live-schema',
  };
});

const report = {
  schema: 'atlas.task-semantic-packet-writer-column-matrix.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  productionWritesPerformed: false,
  targetTable: 'public.task_semantic_packets',
  liveSchema: live,
  liveColumnCount: live.columns.length,
  writerCount: writers.length,
  activeGuardColumns: activeWriterColumns,
  writers,
  summary: {
    compatibleWriterCount: writers.filter((writer) => writer.classification === 'compatible').length,
    blockedWriterCount: writers.filter((writer) => writer.classification === 'blocked-by-live-schema').length,
    intentOnlyWriterCount: writers.filter((writer) => writer.classification === 'intent-only').length,
    filesMissing: writers.filter((writer) => !writer.fileExists).map((writer) => writer.path),
    distinctMissingColumns: unique(writers.flatMap((writer) => writer.missingLiveColumns)).sort(),
  },
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, liveSchemaStatus: live.status, liveColumnCount: live.columns.length, summary: report.summary }, null, 2));
