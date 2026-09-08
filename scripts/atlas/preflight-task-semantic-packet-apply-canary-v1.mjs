/** Read-only preflight for the task-semantic packet apply canary. */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const targetReport = path.join(repoRoot, 'docs/reports/task-semantic-packet-production-target-v1.json');
const reportPath = path.join(repoRoot, 'docs/reports/task-semantic-packet-apply-canary-preflight-v1.json');

function dockerPsql(query) {
  try {
    return execFileSync('docker', ['exec', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-At', '-c', query], {
      cwd: repoRoot, encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

const target = JSON.parse(fs.readFileSync(targetReport, 'utf8'));
const liveColumnsRaw = dockerPsql("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='task_semantic_packets' ORDER BY ordinal_position;");
const liveColumns = typeof liveColumnsRaw === 'string' ? liveColumnsRaw.split(/\r?\n/).filter(Boolean) : [];
const requiredColumns = target.migrationMinset ?? [];
const missingColumns = requiredColumns.filter((column) => !liveColumns.includes(column));
const qdrantUrl = process.env.QDRANT_URL || process.env.QDRANT_HOST;
const collection = 'codebase_chunks_768_v2';
let qdrant = { status: 'unavailable', reason: 'QDRANT_URL/QDRANT_HOST not set' };
if (qdrantUrl) {
  try {
    const response = await fetch(`${qdrantUrl.replace(/\/$/, '')}/collections/${collection}`);
    const body = response.ok ? await response.json() : null;
    const vectors = body?.result?.config?.params?.vectors;
    const content = vectors?.content ?? vectors;
    qdrant = {
      status: response.ok ? 'proven' : 'error',
      httpStatus: response.status,
      collection,
      vectorName: vectors?.content ? 'content' : null,
      dimensions: content?.size ?? null,
      distance: content?.distance ?? null,
      semantic768ShapeProven: content?.size === 768 && String(content?.distance).toLowerCase() === 'cosine',
    };
  } catch (error) {
    qdrant = { status: 'error', collection, reason: error instanceof Error ? error.message : String(error) };
  }
}

const report = {
  schema: 'atlas.task-semantic-packet-apply-canary-preflight.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  productionWritesPerformed: false,
  applyAuthorized: false,
  targetTable: 'public.task_semantic_packets',
  requiredColumns,
  liveColumns,
  missingColumns,
  qdrant,
  gates: {
    productionTargetReportLoaded: true,
    postgresMetadataReadable: typeof liveColumnsRaw === 'string',
    migrationMinsetPresent: missingColumns.length === 0,
    canonicalQdrantInspectable: qdrant.status === 'proven',
    canonicalQdrantShapeProven: qdrant.semantic768ShapeProven === true,
    applyCanaryEligible: missingColumns.length === 0 && qdrant.semantic768ShapeProven === true,
  },
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, missingColumnCount: missingColumns.length, qdrantStatus: qdrant.status, applyCanaryEligible: report.gates.applyCanaryEligible, applyAuthorized: false }, null, 2));
