import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const parityPath = path.join(ROOT, 'docs', 'reports', 'openspec-evidence-projection-parity-plan-v1.json');
const outputPath = process.env.OPENSPEC_TURBOVEC_MEMORY_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_TURBOVEC_MEMORY_OUTPUT)
  : path.join(ROOT, 'docs', 'reports', 'openspec-evidence-turbovec-memory-plan-v1.json');

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
  const parity = JSON.parse(fs.readFileSync(parityPath, 'utf8'));
  const truthSetReady = parity.status === 'PROJECTION_PARITY_READY_NO_WRITES';
  const unsigned = {
    schema: 'atlas.openspec-evidence-turbovec-memory-plan.v1',
    milestone: 'EVF-18',
    mode: 'READ_ONLY_MEMORY_EXPERIMENT_PLAN',
    status: truthSetReady ? 'TURBOVEC_READY_FOR_BENCHMARK' : 'BLOCKED_FROZEN_TRUTH_SET_GATE',
    source: { projectionParityPlan: relative(parityPath) },
    prerequisites: {
      frozenSemantic768TruthSet: truthSetReady,
      canonicalIdentityParity: truthSetReady,
      revisionQualifiedCandidates: truthSetReady,
      productionProjectionWrites: false,
    },
    benchmark: {
      candidateScope: 'bounded candidates selected from canonical semantic_768 truth set',
      comparisons: ['PostgreSQL exact oracle', 'pgvector HNSW', 'Qdrant', 'cuVS/CAGRA when proven'],
      metrics: ['ram_bytes', 'ingest_rows_per_second', 'recall_at_k', 'mrr', 'p50_latency_ms', 'p95_latency_ms', 'filter_behavior'],
      filters: ['change_id', 'task_id', 'workspace_revision', 'proof_state', 'source_revision'],
      rerank: 'exact-promote selected candidates against canonical evidence',
      extraRrfVote: false,
    },
    contract: {
      role: 'bounded candidate retrieval/reranking only',
      authority: 'PostgreSQL canonical task/evidence ledger',
      identity: 'task/evidence identity plus workspace and representation revisions',
      writesPerformed: false,
      promotionAllowed: false,
    },
    likely_cause: 'TurboVec memory claims are not meaningful until retrieval quality and identity are compared against a frozen canonical truth set.',
    evidence: [relative(parityPath)],
    patch_targets: ['scripts/atlas/plan-openspec-evidence-turbovec-memory-v1.mjs'],
    safe_next_command: 'node scripts/atlas/plan-openspec-evidence-projection-parity-v1.mjs',
    smoke_command: 'node --check scripts/atlas/plan-openspec-evidence-turbovec-memory-v1.mjs',
    report_path: relative(outputPath),
  };
  const report = { ...unsigned, generatedAt: new Date().toISOString(), checksum: checksum(unsigned) };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, status: report.status, writesPerformed: false, output: outputPath }, null, 2));
}

main();
