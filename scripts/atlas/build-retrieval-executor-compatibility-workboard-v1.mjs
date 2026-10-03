#!/usr/bin/env node

/**
 * Read-only cross-OpenSpec compatibility workboard.
 *
 * This joins existing OpenSpec progress and evidence receipts. It does not
 * close tasks, mutate runtime state, or authorize any promotion.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = path.join(root, 'docs/reports/retrieval-executor-compatibility-workboard-v1.json');

function readJson(relativePath) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function openspecList() {
  try {
    const output = execSync('openspec list --json', { cwd: root, encoding: 'utf8', shell: true });
    return JSON.parse(output).changes ?? [];
  } catch {
    return [];
  }
}

const changes = new Map(openspecList().map((item) => [item.name, item]));
const lineage = readJson('docs/reports/current-lineage-closure-v1.json');
const execution = readJson('docs/reports/current-graphify-execution-owner-resolution-v1.json');
const packetBridge = readJson('docs/reports/current-packet-digest-bridge-v1.json');
const lifecycle = readJson('docs/reports/graphify-lifecycle-owner-v1.json');

const ownerRows = [
  {
    owner: 'parent-atlas-retrieval-lineage-dag-convergence',
    role: 'canonical workspace/source/execution/packet lineage',
    state: 'WIRED',
    promotion: 'BLOCKED',
    evidence: ['docs/reports/current-lineage-closure-v1.json', 'docs/reports/current-graphify-execution-owner-resolution-v1.json'],
    blocker: lineage?.firstFailureBoundary ?? 'EXECUTION_SOURCE_AUTHORITY',
  },
  {
    owner: 'parent-atlas-code-ingestion-pipeline',
    role: 'Tree-sitter and ast-grep structural evidence',
    state: 'PROVEN_FIXTURE_ONLY',
    promotion: 'BLOCKED_BY_LINEAGE',
    evidence: ['docs/reports/structural-observations-v1.json'],
    blocker: 'CURRENT_SOURCE_REVISION_ADMISSION',
  },
  {
    owner: 'atlas-retrieval-reconciliation',
    role: 'logical lane normalization and retrieval reconciliation',
    state: 'PROVEN_CONTRACT',
    promotion: 'BLOCKED_BY_LINEAGE',
    evidence: ['openspec/specs/atlas-retrieval-reconciliation/spec.md'],
    blocker: 'CURRENT_PACKET_COHORT',
  },
  {
    owner: 'parent-atlas-semantic-768-canonical-contract',
    role: 'canonical dense representation contract',
    state: 'WIRED',
    promotion: 'BLOCKED_BY_LINEAGE',
    evidence: ['docs/reports/semantic-768-canonical-readiness-v1.json'],
    blocker: 'REVISION_QUALIFIED_VECTOR_COHORT',
  },
  {
    owner: 'parent-atlas-candidate-feature-execution-fabric',
    role: 'candidate ordinal and feature matrix execution',
    state: 'PROVEN_FIXTURE_ONLY',
    promotion: 'BLOCKED_BY_LINEAGE',
    evidence: ['docs/reports/candidate-feature-matrix-v1.json'],
    blocker: 'CANDIDATE_ORDINAL_ELIGIBILITY',
  },
  {
    owner: 'parent-atlas-gpu-runtime-abi-alignment',
    role: 'GPU executor capability and ABI proofs',
    state: 'WIRED',
    promotion: 'CHALLENGER_ONLY',
    evidence: ['docs/reports/gpu-runtime-abi-alignment-v1.json'],
    blocker: 'REFERENCE_PARITY_AND_RESIDENCY',
  },
  {
    owner: 'parent-atlas-tensor-residency-integration',
    role: 'GPU residency and cache ownership',
    state: 'PROVEN_FIXTURE_ONLY',
    promotion: 'CHALLENGER_ONLY',
    evidence: ['docs/reports/gpu-residency-fixture-v1.json'],
    blocker: 'LIVE_EXECUTOR_CAPABILITY',
  },
  {
    owner: 'parent-atlas-prefill-routing-residency-convergence',
    role: 'routing, prefill DAG, and prompt/residency contracts',
    state: 'PROVEN_FIXTURE_ONLY',
    promotion: 'BLOCKED_BY_LINEAGE',
    evidence: ['docs/reports/prefill-dag-replay-v1.json'],
    blocker: 'LIVE_PACKET_LINEAGE',
  },
  {
    owner: 'parent-atlas-memory-architecture-freeze',
    role: 'model KV/recurrent state and memory boundary',
    state: 'WIRED',
    promotion: 'BLOCKED_BY_RESIDENCY_PROOF',
    evidence: ['openspec/changes/parent-atlas-memory-architecture-freeze/tasks.md'],
    blocker: 'MODEL_STATE_OWNERSHIP',
  },
  {
    owner: 'local-llm-offload-ownership',
    role: 'llama-server and local model offload ownership',
    state: 'WIRED',
    promotion: 'PINNED_RUNTIME_REQUIRES_COMPATIBILITY_RECEIPT',
    evidence: ['sveltekit-frontend/.env.example', 'opencode.json'],
    blocker: '8090_HEALTH_MODEL_PROPS_REPLAY',
  },
  {
    owner: 'parent-atlas-retrieval-executor-compatibility-convergence',
    role: 'analyze-this coordinator and cross-lane compatibility receipts',
    state: 'WIRED',
    promotion: 'BLOCKED_BY_LINEAGE',
    evidence: [
      'docs/reports/analyze-this-adapters-v1.json',
      'sveltekit-frontend/src/lib/server/retrieval/analyze-this-coordinator.ts',
    ],
    blocker: 'CURRENT_SOURCE_AUTHORITY',
  },
  {
    owner: 'parent-atlas-ace-bitfrost-cache-correctness',
    role: 'revisioned ACE/BitFrost metadata cache boundary',
    state: 'PROVEN_CONTRACT',
    promotion: 'CHALLENGER_ONLY',
    evidence: [
      'docs/reports/centroid-cache-families-v1.json',
      'sveltekit-frontend/src/lib/server/ace/feature-context-cache.ts',
    ],
    blocker: 'LIVE_CANONICAL_LINEAGE',
  },
  {
    owner: 'parent-atlas-graph-runtime-python-consolidation',
    role: 'Python runtime, TurboVec, NetworkX/cuGraph challenger evidence',
    state: 'PROVEN_RUNTIME_RECEIPT',
    promotion: 'CHALLENGER_ONLY',
    evidence: [
      'docs/reports/python-runtime-capability-v1.json',
      'docs/reports/turbovec-runtime-v1.json',
    ],
    blocker: 'NO_CANONICAL_EXECUTOR_PROMOTION',
  },
].map((row) => ({
  ...row,
  openspec: changes.get(row.owner) ?? null,
}));

const report = {
  schema: 'atlas.retrieval-executor-compatibility-workboard.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_CROSS_OPENSPEC_CENSUS',
  canonicalAuthority: false,
  promotionAllowed: false,
  writesPerformed: false,
  ownerRows,
  firstFailureBoundary: {
    status: lineage?.status ?? 'EXECUTION_SOURCE_AUTHORITY',
    executionOwner: execution?.status ?? 'DUPLICATE_EQUIVALENT_EXECUTIONS',
    lifecycleOwner: lifecycle?.lifecycleOwnerStatus ?? 'LIFECYCLE_OWNER_UNPROVEN',
    packetBridge: packetBridge?.status ?? 'PACKET_DIGEST_BRIDGE_BLOCKED',
    nextDecision: execution?.nextGate ?? 'EXPLICIT_GRAPHIFY_EXECUTION_OWNER_DECISION',
  },
  completionModel: {
    WRITTEN: 'artifact or type exists',
    WIRED: 'connected to an owner or caller',
    PROVEN: 'focused replay/receipt passes',
    PROMOTED: 'canonical authority and independent readback admitted',
  },
  policy: {
    noTaskAutoClose: true,
    noDdl: true,
    noPacketBackfill: true,
    noProjectionWrites: true,
    noCacheMutation: true,
    noModelUpgrade: true,
  },
  validationCommands: {
    strictOpenSpec: 'npx openspec validate parent-atlas-retrieval-executor-compatibility-convergence --strict',
    focusedTests: [
      'cd sveltekit-frontend; npx vitest run src/lib/server/ml/phase17-provider-admission.spec.ts',
      'cd sveltekit-frontend; npx vitest run src/lib/server/atlas/classification/xgboost-ranking-lineage-v1.spec.ts',
      'cd sveltekit-frontend; npx vitest run src/lib/server/atlas/execution/executor-capability-receipt-v1.spec.ts',
      'cd sveltekit-frontend; npx vitest run src/lib/server/atlas/gpu/gpu-residency-budget.test.ts',
      'cd sveltekit-frontend; npx vitest run src/lib/server/atlas/gpu/residency-descriptor-v1.spec.ts',
      'cd sveltekit-frontend; npx vitest run src/lib/server/atlas/gpu/kernel-challenger-classification-v1.spec.ts',
      'cd sveltekit-frontend; npx vitest run src/lib/server/atlas/execution/tensorrt-rtx-compatibility-v1.spec.ts',
      'cd sveltekit-frontend; npx vitest run src/lib/server/bifrost/client.compatibility.spec.ts',
      'cd sveltekit-frontend; npx vitest run src/lib/server/atlas/execution/llama-server-upgrade-receipt-v1.spec.ts',
      'cd sveltekit-frontend; npx vitest run src/lib/server/retrieval/analyze-this-coordinator.spec.ts',
      'cd sveltekit-frontend; npx vitest run src/lib/server/ace/feature-context-cache.spec.ts',
      'cd sveltekit-frontend; npx vitest run src/lib/server/atlas/cache/ace-bitfrost-cache-identity-v1.test.ts',
      'node scripts/atlas/audit-python-runtime-v1.mjs',
      'node scripts/atlas/audit-turbovec-runtime-v1.mjs',
    ],
  },
  nextGate: 'EXPLICIT_GRAPHIFY_EXECUTION_OWNER_DECISION',
  safeNextCommand: 'node scripts/atlas/plan-current-graphify-execution-owner-resolution-v1.mjs',
  smokeCommand: 'npx openspec validate parent-atlas-retrieval-executor-compatibility-convergence --strict',
  reportPath: 'docs/reports/retrieval-executor-compatibility-workboard-v1.json',
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const temporaryPath = `${reportPath}.${process.pid}.tmp`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.renameSync(temporaryPath, reportPath);
console.log(JSON.stringify({
  reportPath: 'docs/reports/retrieval-executor-compatibility-workboard-v1.json',
  ownerCount: ownerRows.length,
  firstFailureBoundary: report.firstFailureBoundary,
  promotionAllowed: false,
  writesPerformed: false,
}, null, 2));
