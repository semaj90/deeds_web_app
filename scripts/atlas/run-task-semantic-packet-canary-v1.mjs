/** One-packet authorized Postgres -> Qdrant identity canary. */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const reportPath = path.join(repoRoot, 'docs/reports/task-semantic-packet-apply-canary-v1.json');
const authorized = process.env.ATLAS_AUTHORIZE_TASK_SEMANTIC_PACKET_CANARY === '1';
const qdrantUrl = process.env.QDRANT_URL || process.env.QDRANT_HOST;
const collection = 'codebase_chunks_768_v2';
const token = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const packetKey = `canary:task-semantic:${token}`;
const qdrantPointId = [createHash('sha256').update(packetKey).digest('hex').slice(0, 8), createHash('sha256').update(packetKey).digest('hex').slice(8, 12), '4' + createHash('sha256').update(packetKey).digest('hex').slice(13, 16), '8' + createHash('sha256').update(packetKey).digest('hex').slice(17, 20), createHash('sha256').update(packetKey).digest('hex').slice(20, 32)].join('-');
const vector = new Array(768).fill(0);
vector[0] = 1;
const summaryHash = createHash('sha256').update(packetKey).digest('hex');

function dockerPsql(query) {
  return execFileSync('docker', ['exec', 'legal-ai-postgres', 'psql', '-X', '-q', '-U', 'legal_admin', '-d', 'legal_ai_db', '-At', '-F', '|', '-v', 'ON_ERROR_STOP=1', '-c', query], { cwd: repoRoot, encoding: 'utf8', timeout: 30000 }).trim();
}

const report = {
  schema: 'atlas.task-semantic-packet-apply-canary.v1',
  generatedAt: new Date().toISOString(),
  authorized,
  productionWritesPerformed: false,
  collection,
  packetKey,
  qdrantPointId,
  vectorDimensions: vector.length,
  steps: [],
};

if (!authorized) {
  report.status = 'BLOCKED_AUTHORIZATION';
  report.reason = 'Set ATLAS_AUTHORIZE_TASK_SEMANTIC_PACKET_CANARY=1 before running this mutation.';
} else if (!qdrantUrl) {
  report.status = 'BLOCKED_QDRANT_URL';
  report.reason = 'QDRANT_URL or QDRANT_HOST is required.';
} else {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000, max: 1 });
  try {
    const insertSql = `INSERT INTO task_semantic_packets (packet_key, source_ref, feature_id, feature_label, alias_id, qdrant_score, cluster_score, topological_score, fusion_score, metadata, validation_status, point_kind, qdrant_point_id, workspace_id, file_path, semantic_path, related_feature_ids, related_task_ids, related_file_paths, summary_llm, summary_model, next_action, summary_hash, confidence, status, agent_pickup_ready, deleted) VALUES ('${packetKey}', 'canary://task-semantic', 'canary.task-semantic', 'Task-semantic canary', 'canary.alias', 0.0, 0.0, 0.0, 0.0, '{"canary":true}'::jsonb, 'validated', 'task_summary', '${qdrantPointId}', 'canary', 'canary://task-semantic', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'authorized one-packet canary', 'canary', 'readback', '${summaryHash}', '1.0000', 'todo', false, false) RETURNING id::text;`;
    const packetId = dockerPsql(insertSql).split(/\r?\n/)[0].trim();
    report.steps.push({ step: 'postgres_insert', status: 'proven', packetId });
    const response = await fetch(`${qdrantUrl.replace(/\/$/, '')}/collections/${collection}/points?wait=true`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ points: [{ id: qdrantPointId, vector: { content: vector }, payload: { packet_id: packetId, packet_key: packetKey, source_ref: 'canary://task-semantic', representation_id: 'semantic_768', canary: true } }] }),
    });
    const qdrantBody = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`QDRANT_UPSERT_FAILED:${response.status}`);
    report.steps.push({ step: 'qdrant_upsert', status: 'proven', response: qdrantBody?.result ?? null });
    const pgReadback = dockerPsql(`SELECT id::text, packet_key, qdrant_point_id, status, deleted FROM task_semantic_packets WHERE id='${packetId}';`);
    const pointResponse = await fetch(`${qdrantUrl.replace(/\/$/, '')}/collections/${collection}/points/${qdrantPointId}`);
    const pointBody = await pointResponse.json().catch(() => null);
    report.steps.push({ step: 'postgres_readback', status: pgReadback ? 'proven' : 'failed', row: pgReadback.split('|') });
    report.steps.push({ step: 'qdrant_readback', status: pointResponse.ok ? 'proven' : 'failed', pointId: pointBody?.result?.id ?? null, payload: pointBody?.result?.payload ?? null });
    const identityParity = pgReadback.includes(packetKey) && pgReadback.includes(qdrantPointId) && pointBody?.result?.payload?.packet_key === packetKey && pointBody?.result?.payload?.packet_id === packetId;
    report.status = identityParity ? 'PROVEN' : 'IDENTITY_MISMATCH';
    report.identityParity = identityParity;
    report.productionWritesPerformed = true;
  } catch (error) {
    report.status = 'PARTIAL_OR_FAILED';
    report.error = error instanceof Error ? error.message : String(error);
    report.productionWritesPerformed = report.steps.some((step) => step.status === 'proven' && ['postgres_insert', 'qdrant_upsert'].includes(step.step));
  } finally {
    await pool.end().catch(() => {});
  }
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, status: report.status, authorized, productionWritesPerformed: report.productionWritesPerformed, identityParity: report.identityParity ?? null }, null, 2));
if (report.status === 'IDENTITY_MISMATCH' || report.status === 'PARTIAL_OR_FAILED') process.exitCode = 1;
