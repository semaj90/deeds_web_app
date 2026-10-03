import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const parityPath = path.join(ROOT, 'docs', 'reports', 'openspec-evidence-projection-parity-plan-v1.json');
const outputPath = process.env.OPENSPEC_GPU_ACCELERATION_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_GPU_ACCELERATION_OUTPUT)
  : path.join(ROOT, 'docs', 'reports', 'openspec-evidence-gpu-acceleration-plan-v1.json');

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
  const canonicalTruthReady = parity.status === 'PROJECTION_PARITY_READY_NO_WRITES';
  const unsigned = {
    schema: 'atlas.openspec-evidence-gpu-acceleration-plan.v1',
    milestone: 'EVF-17',
    mode: 'READ_ONLY_ACCELERATION_PLAN',
    status: canonicalTruthReady ? 'GPU_ACCELERATION_READY_FOR_FIXTURE' : 'BLOCKED_PROJECTION_PARITY_GATE',
    source: { projectionParityPlan: relative(parityPath) },
    prerequisites: {
      postgresExactOracle: false,
      semantic768TruthSet: false,
      projectionParity: canonicalTruthReady,
      candidateOrdinalMap: false,
      liveCuvs: false,
      liveCugraph: false,
    },
    executionOrder: [
      { lane: 'cuVS_EXACT_ORACLE', role: 'truth-set challenger and identity parity baseline', promotion: 'fixture-only until readback' },
      { lane: 'CAGRA', role: 'approximate GPU challenger', promotion: 'compare against exact oracle; never canonical' },
      { lane: 'NETWORKX', role: 'canonical dependency/evidence graph semantics', promotion: 'derived DAG only' },
      { lane: 'cuGRAPH', role: 'optional accelerated graph execution', promotion: 'must match NetworkX semantics' },
    ],
    contract: {
      candidateIdentity: 'CandidateOrdinalMapV1 bound to canonical task/evidence identity',
      vectorRepresentation: 'semantic_768',
      updateModel: 'append/tombstone/periodic rebuild',
      exactPromotion: 'selected candidates rechecked against PostgreSQL exact oracle',
      writesPerformed: false,
      canonicalAuthority: 'PostgreSQL task/evidence ledger',
    },
    requiredReceipts: ['workspace_revision', 'source_revision', 'representation_revision', 'candidate_ordinal_map', 'gpu_execution', 'readback_identity_parity'],
    metrics: ['candidate_id_parity', 'recall_at_k', 'ordering_parity', 'revision_parity', 'tombstone_parity', 'latency_ms', 'vram_bytes'],
    likely_cause: 'GPU acceleration is unsafe to promote until exact semantic_768 identity and graph semantics are proven against canonical PostgreSQL data.',
    evidence: [relative(parityPath)],
    patch_targets: ['scripts/atlas/plan-openspec-evidence-gpu-acceleration-v1.mjs'],
    safe_next_command: 'node scripts/atlas/plan-openspec-evidence-projection-parity-v1.mjs',
    smoke_command: 'node --check scripts/atlas/plan-openspec-evidence-gpu-acceleration-v1.mjs',
    report_path: relative(outputPath),
  };
  const report = { ...unsigned, generatedAt: new Date().toISOString(), checksum: checksum(unsigned) };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, status: report.status, writesPerformed: false, output: outputPath }, null, 2));
}

main();
