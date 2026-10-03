import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const readbackPath = path.join(ROOT, 'docs', 'reports', 'openspec-evidence-ledger-readback-v1.json');
const embeddingPath = path.join(ROOT, 'docs', 'reports', 'openspec-evidence-embedding-plan-v1.json');
const retrievalPath = path.join(ROOT, 'docs', 'reports', 'openspec-evidence-retrieval-plan-v1.json');
const outputPath = process.env.OPENSPEC_PROJECTION_PARITY_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_PROJECTION_PARITY_OUTPUT)
  : path.join(ROOT, 'docs', 'reports', 'openspec-evidence-projection-parity-plan-v1.json');

const projections = [
  { name: 'qdrant', role: 'rebuildable semantic projection', writePolicy: 'admitted evidence rows only' },
  { name: 'cuvs', role: 'GPU ANN challenger projection', writePolicy: 'append/tombstone/rebuild only' },
  { name: 'turbovec', role: 'bounded candidate retrieval/reranking', writePolicy: 'candidate projection only' },
];
const metrics = ['candidate_id_parity', 'recall_at_k', 'ordering_parity', 'workspace_revision_parity', 'source_revision_parity', 'tombstone_parity', 'latency_ms', 'ram_bytes', 'vram_bytes'];

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function checksum(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll('\\', '/');
}

function main() {
  const readback = JSON.parse(fs.readFileSync(readbackPath, 'utf8'));
  const embedding = JSON.parse(fs.readFileSync(embeddingPath, 'utf8'));
  const retrieval = JSON.parse(fs.readFileSync(retrievalPath, 'utf8'));
  const checks = {
    postgresReadbackProven: readback.status === 'READBACK_SCHEMA_PROVEN',
    embeddingArtifactProven: embedding.status === 'INPUTS_READY_NO_EMBEDDINGS',
    exactOracleLive: retrieval.checks?.liveQueryExecuted === true,
    canonical768: retrieval.checks?.canonical768 === true,
  };
  const unsigned = {
    schema: 'atlas.openspec-evidence-projection-parity-plan.v1',
    mode: 'READ_ONLY_PARITY_PLAN',
    status: Object.values(checks).every(Boolean) ? 'PROJECTION_PARITY_READY_NO_WRITES' : 'BLOCKED_CANONICAL_TRUTH_GATE',
    source: { readback: relative(readbackPath), embeddingPlan: relative(embeddingPath), retrievalPlan: relative(retrievalPath) },
    projections,
    metrics,
    checks,
    protocol: { sourceOfTruth: 'PostgreSQL semantic_768 exact oracle', candidateIdentity: 'canonical task/evidence identity', revisionIdentity: 'workspace + source + representation', tombstones: 'append/tombstone/periodic rebuild', projectionWrites: false, parityPromotion: false },
    writesPerformed: false,
    likely_cause: 'Projection parity is meaningful only against a live canonical PostgreSQL truth set and exact semantic_768 oracle.',
    evidence: [relative(readbackPath), relative(embeddingPath), relative(retrievalPath)],
    patch_targets: ['scripts/atlas/plan-openspec-evidence-projection-parity-v1.mjs'],
    safe_next_command: 'node scripts/atlas/audit-openspec-evidence-ledger-readback-v1.mjs',
    smoke_command: 'node --check scripts/atlas/plan-openspec-evidence-projection-parity-v1.mjs',
    report_path: relative(outputPath),
  };
  const report = { ...unsigned, generatedAt: new Date().toISOString(), checksum: checksum(unsigned) };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, status: report.status, checks: report.checks, projectionWrites: false, output: outputPath }, null, 2));
}

main();
