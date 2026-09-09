#!/usr/bin/env node
/**
 * Parent Atlas adaptive execution fabric — read-only static smoke.
 *
 * Purpose:
 * - prove the current repo has one aligned surface for identity, retrieval,
 *   graph/vector/neural execution, browser WebGPU, Engram/BitFrost memory,
 *   QLoRA gates, simdjson evidence parsing, Go retrieval, TurboVec and cuTile;
 * - distinguish PRESENT/WIRED source surfaces from LIVE runtime admission;
 * - keep canonical identity and authority separate from executor/cache ordinals.
 *
 * This script performs no network calls, starts no services, warms no caches,
 * and writes no files. Runtime parity is a separate gate.
 */

import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const checks = [];
const blockers = [];
const warnings = [];

async function exists(relative) {
  try {
    await access(path.join(ROOT, relative));
    return true;
  } catch {
    return false;
  }
}

async function text(relative) {
  return readFile(path.join(ROOT, relative), 'utf8');
}

async function json(relative) {
  return JSON.parse(await text(relative));
}

function check(id, ok, detail) {
  checks.push({ id, ok: Boolean(ok), detail });
}

const surfaces = {
  canonical: [
    'codex.md',
    'sveltekit-frontend/src/lib/server/atlas/runtime-registry.ts',
    'sveltekit-frontend/src/lib/server/atlas/contracts/fabric-lanes.ts',
  ],
  retrieval: [
    'services/go-retrieval-service/Dockerfile',
    'scripts/atlas/go-retrieval-smoke.mjs',
    'sveltekit-frontend/src/lib/server/retrieval/go-retrieval-facade.ts',
    'proto/active/turbovec.proto',
    'python/atlas_cuvs_resident_sidecar.py',
  ],
  graph: [
    'python/atlas_rapids_sidecar.py',
    'scripts/atlas/gpu/networkx_cugraph_backend_probe_v1.py',
    'python/parent_atlas_networkx_pagerank.py',
  ],
  neural: [
    'sveltekit-frontend/src/lib/server/atlas/neural/neural-execution-policy.ts',
    'sveltekit-frontend/src/lib/server/atlas/neural/qlora-training-gate.ts',
    'packages/parent-atlas/src/core/qlora-dataset-export.ts',
  ],
  parsing: [
    'packages/parent-atlas-retrieval/src/gpu/simdjson-bridge.ts',
    'sveltekit-frontend/src/lib/server/atlas/indexing/simdjson-typed-evidence-bridge.ts',
  ],
  browserGpu: [
    'sveltekit-frontend/src/lib/gpu/webgpu-pagerank.ts',
    'sveltekit-frontend/src/lib/gpu/nes-glyph-webgpu.ts',
  ],
  memory: [
    'sveltekit-frontend/src/lib/server/ai/engram-registry.ts',
    'scripts/atlas/bitfrost-warm-startup.mjs',
    'scripts/atlas/prove-bitfrost-tracking.mts',
  ],
  cutile: [
    'python/atlas_cuda_cutile_simt_probe_v1.py',
    'python/atlas_cuda_cutile_simt_gemm_probe_v1.py',
    'docs/reports/atlas-cuda132-cutile-simt-probe-v1.json',
  ],
  orchestration: [
    'scripts/atlas/test-okf-agentic-fabric-e2e-v1.mjs',
    'openspec/changes/parent-atlas-adaptive-dag-fabric/tasks.md',
    'sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts',
  ],
};

for (const [group, files] of Object.entries(surfaces)) {
  const missing = [];
  for (const relative of files) {
    if (!(await exists(relative))) missing.push(relative);
  }
  check(`surface:${group}`, missing.length === 0, missing.length ? `missing=${missing.join(',')}` : `${files.length} required paths present`);
}

const codex = await text('codex.md');
const identityMarkers = [
  '`packet_id` stays the canonical UUID identity.',
  '`packet_ulid` is now the sortable workflow/order field for packet lineage.',
  '`packet_key` remains the deterministic duplicate/content guard.',
  '`title_id` is a derived semantic grouping key, not an identity key.',
];
check(
  'identity:canonical-separation',
  identityMarkers.every((marker) => codex.includes(marker)),
  'packet_id canonical; packet_ulid ordering; packet_key dedup; title_id semantic grouping',
);

const fabricLanes = await text('sveltekit-frontend/src/lib/server/atlas/contracts/fabric-lanes.ts');
for (const lane of ['gnn_graph_evidence', 'exact_knn_retrieval', 'kmeans_routing_hint', 'ewin_tang_low_rank', 'kanban_task_board', 'recommendation_policy']) {
  check(`lane:${lane}`, fabricLanes.includes(`'${lane}'`), 'fabric lane contract');
}

const neuralPolicy = await text('sveltekit-frontend/src/lib/server/atlas/neural/neural-execution-policy.ts');
for (const marker of ['GNN_MESSAGE_PASSING', 'PYTORCH_CUDA_GNN', 'CUGRAPH_GPU', 'BOOST_GRAPH_CPU', 'NETWORKX_REFERENCE', 'onlineTrainingAllowed: false']) {
  check(`neural:${marker}`, neuralPolicy.includes(marker), 'neural executor/fallback policy marker');
}

// The current policy has a GPU learned GNN and CPU structural/reference fallbacks,
// but no same-model CPU GNN executor. Keep this explicit rather than pretending
// NetworkX/Boost is equivalent to learned message passing.
if (!neuralPolicy.includes('PYTORCH_CPU_GNN')) {
  blockers.push({
    id: 'GNN_CPU_SAME_MODEL_FALLBACK_OPEN',
    detail: 'GNN_MESSAGE_PASSING has PYTORCH_CUDA_GNN but no same-model PYTORCH_CPU_GNN executor; cuGraph/Boost/NetworkX are structural/reference fallbacks only.',
  });
}

const webgpuPagerank = await text('sveltekit-frontend/src/lib/gpu/webgpu-pagerank.ts');
check(
  'webgpu:browser-fallback-boundary',
  webgpuPagerank.includes('falling back to CPU JS') || webgpuPagerank.includes('falling back to CPU'),
  'WebGPU remains browser-side compute with CPU JS fallback; it is not a server GNN owner',
);

const cutileReceipt = await json('docs/reports/atlas-cuda132-cutile-simt-probe-v1.json');
check('cutile:receipt-schema', cutileReceipt.schema === 'atlas.cuda-cutile-simt-probe.v1', cutileReceipt.schema);
check('cutile:sm86', cutileReceipt.hardware?.computeCapability === '8.6', String(cutileReceipt.hardware?.computeCapability));
check('cutile:runtime', cutileReceipt.interpretation?.cutilePath === true && cutileReceipt.interpretation?.simtPath === true, cutileReceipt.status);
check('cutile:not-authority', cutileReceipt.interpretation?.canonicalAuthority === false, 'cuTile/SIMT are executors/challengers only');
check('cutile:no-writes', cutileReceipt.interpretation?.writes === false, 'receipt is read-only');

const capabilityHealth = await text('docs/reports/atlas-capability-health-v1.md');
if (capabilityHealth.includes('| cuTile | NOT INSTALLED |')) {
  warnings.push({
    id: 'STALE_CUTILE_CAPABILITY_RECEIPT',
    detail: 'The 2026-08-24 capability receipt refers to the RAPIDS env; the newer 2026-09-06 atlas-cutile-cu132 receipt proves cuTile in a separate venv. Do not merge those environment identities.',
  });
}

const adaptiveDagTasks = await text('openspec/changes/parent-atlas-adaptive-dag-fabric/tasks.md');
if (adaptiveDagTasks.includes('do not exist as code anywhere in the repo') && adaptiveDagTasks.includes('AdaptiveDagPlanV1')) {
  blockers.push({
    id: 'ADAPTIVE_DAG_LOCAL_ACTION_CONTRACT_OPEN',
    detail: 'AdaptiveDagPlanV1/DagActionKind local action catalog remains an OpenSpec gap; do not build a second research loop instead.',
  });
}

const okfE2e = await text('scripts/atlas/test-okf-agentic-fabric-e2e-v1.mjs');
check(
  'orchestration:pre-admission-boundary',
  okfE2e.includes("execution: 'NOT_EXECUTED'") && okfE2e.includes('writesPerformed: false'),
  'existing OKF e2e keeps synthesis/cache execution outside the planning proof',
);

const result = {
  schema: 'atlas.adaptive-execution-fabric-smoke.v1',
  status: checks.some((entry) => !entry.ok)
    ? 'FAILED_STATIC_ALIGNMENT'
    : blockers.length
      ? 'PASSED_STATIC_ALIGNMENT_WITH_OPEN_GATES'
      : 'PASSED_STATIC_ALIGNMENT',
  proofClass: 'STATIC_READ_ONLY',
  canonicalAuthority: false,
  networkCallsPerformed: false,
  datastoreWritesPerformed: false,
  cacheWritesPerformed: false,
  servicesStarted: false,
  checks,
  blockers,
  warnings,
  fallbackBoundaries: {
    learnedGnn: ['PYTORCH_CUDA_GNN', 'PYTORCH_CPU_GNN (OPEN)'],
    graphAnalytics: ['CUGRAPH_GPU', 'BOOST_GRAPH_CPU', 'NETWORKX_REFERENCE'],
    browserGraph: ['WEBGPU', 'CPU_JS'],
    semanticRetrieval: ['logical exact_knn_retrieval lane', 'cuVS/Qdrant/TurboVec executors remain derived and capability-selected'],
    parsing: ['simdjson when admitted', 'JSON.parse/typed fallback per caller contract'],
  },
  nextGate: blockers.length
    ? 'CLOSE_OPEN_GATES_THEN_RUN_LIVE_PARITY'
    : 'RUN_LIVE_ADAPTIVE_EXECUTION_PARITY',
};

console.log(JSON.stringify(result, null, 2));
if (checks.some((entry) => !entry.ok)) process.exitCode = 1;
