#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(process.cwd());
const frontendRoot = resolve(repoRoot, 'sveltekit-frontend/src/lib/server/atlas');
const paths = {
  controlPlane: resolve(frontendRoot, 'classification/query-router-control-plane-v2.ts'),
  classificationPlan: resolve(frontendRoot, 'classification/query-classification-v2.ts'),
  executorPolicy: resolve(frontendRoot, 'neural-routing/retrieval-executor-policy-v1.ts'),
  fileCompilerPlan: resolve(frontendRoot, 'agentic-file-compiler/retrieval-plan.ts'),
  neuralEncoderManifest: resolve(frontendRoot, 'neural-routing/encoder-manifest.ts'),
  tensorManifestV1: resolve(frontendRoot, 'classification/retrieval-router-tensor-manifest-v1.ts'),
  tensorManifestV2: resolve(frontendRoot, 'classification/retrieval-router-tensor-manifest-v2.ts'),
};

const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : null;
const controlPlane = read(paths.controlPlane);
const classificationPlan = read(paths.classificationPlan);
const executorPolicy = read(paths.executorPolicy);
const fileCompilerPlan = read(paths.fileCompilerPlan);
const neuralEncoderManifest = read(paths.neuralEncoderManifest);
const tensorManifestV1 = read(paths.tensorManifestV1);
const tensorManifestV2 = read(paths.tensorManifestV2);
const extractWidth = (source, pattern) => {
  const match = source?.match(pattern);
  return match ? Number(match[1]) : null;
};

const wiring = {
  controlPlaneExists: controlPlane !== null,
  controlPlaneImportsClassificationCompiler: Boolean(controlPlane?.includes("from './query-classification-v2.js'")),
  controlPlaneCallsClassificationCompiler: Boolean(controlPlane?.includes('compileRetrievalPlanV1(parsed)')),
  classificationPlanDefinesSchema: Boolean(classificationPlan?.includes('export const RetrievalPlanV1Schema')),
  classificationPlanDefinesCompiler: Boolean(classificationPlan?.includes('export function compileRetrievalPlanV1')),
  executorPolicyDefinesSameNamedSchema: Boolean(executorPolicy?.includes('export const RetrievalPlanV1Schema')),
  fileCompilerDefinesSameNamedInterface: Boolean(fileCompilerPlan?.includes('export interface RetrievalPlanV1')),
};

const tensorOwners = [
  {
    path: 'sveltekit-frontend/src/lib/server/atlas/neural-routing/encoder-manifest.ts',
    revision: 'atlas.query-router-tensor.v1',
    width: extractWidth(neuralEncoderManifest, /tensorDimension:\s*z\.literal\((\d+)\)/),
    role: 'legacy neural-routing MLP input contract',
    status: 'LEGACY_OR_UNRECONCILED',
  },
  {
    path: 'sveltekit-frontend/src/lib/server/atlas/classification/retrieval-router-tensor-manifest-v1.ts',
    revision: 'atlas.retrieval-router-tensor.v1',
    width: extractWidth(tensorManifestV1, /RETRIEVAL_ROUTER_TENSOR_WIDTH_V1\s*=\s*(\d+)/),
    role: 'classification v1 tensor contract',
    status: 'EXISTING_V1_CONTRACT',
  },
  {
    path: 'sveltekit-frontend/src/lib/server/atlas/classification/retrieval-router-tensor-manifest-v2.ts',
    revision: 'atlas.retrieval-router-tensor.v2',
    width: extractWidth(tensorManifestV2, /RETRIEVAL_ROUTER_TENSOR_WIDTH_V2\s*=\s*(\d+)/),
    role: 'classification v2 tensor contract',
    status: 'CURRENT_INTEGRATION_CANDIDATE',
  },
];

const tensorWidthConflict = [...new Set(tensorOwners.map((owner) => owner.width).filter((width) => width !== null))].length > 1;

const report = {
  schema: 'ParentAtlasPrefillRoutingPlanOwnerReconciliationV1',
  generatedAt: new Date().toISOString(),
  status: wiring.controlPlaneImportsClassificationCompiler && wiring.controlPlaneCallsClassificationCompiler
    ? (tensorWidthConflict ? 'CURRENT_CONTROL_PLANE_OWNER_IDENTIFIED_TENSOR_WIDTH_CONFLICT' : 'CURRENT_CONTROL_PLANE_OWNER_IDENTIFIED_RECONCILIATION_REQUIRED')
    : 'CURRENT_CONTROL_PLANE_OWNER_NOT_PROVEN',
  canonicalCandidate: {
    owner: 'sveltekit-frontend/src/lib/server/atlas/classification/query-classification-v2.ts',
    consumer: 'sveltekit-frontend/src/lib/server/atlas/classification/query-router-control-plane-v2.ts',
    role: 'current query-router control-plane RetrievalPlanV1',
    evidenceAuthority: false,
    canonicalWritesAllowed: false,
  },
  competingContracts: [
    {
      path: 'sveltekit-frontend/src/lib/server/atlas/neural-routing/retrieval-executor-policy-v1.ts',
      role: 'executor-capability policy and resource-envelope planner',
      disposition: 'distinct policy contract; same exported type name requires namespace-qualified reconciliation',
    },
    {
      path: 'sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/retrieval-plan.ts',
      role: 'legacy file-compiler retrieval plan',
      disposition: 'legacy/adjacent owner; not wired into query-router-control-plane-v2',
    },
    {
      path: 'sveltekit-frontend/src/lib/server/atlas/contracts/semantic-signal-v1.ts',
      role: 'serialized semantic-signal retrieval-plan schema',
      disposition: 'transport/history contract; not selected as the prefill decision owner',
    },
  ],
  wiring,
  tensorOwners,
  tensorWidthConflict,
  prefillRoutingDecision: {
    schema: 'PrefillRoutingDecisionV1',
    status: 'NOT_DEFINED',
    nextAction: 'reconcile current control-plane plan with executor policy without introducing a duplicate RetrievalPlanV1 owner',
  },
  canonicalAuthority: false,
  writesPerformed: false,
  nextGate: 'DAG-01_PREFILL_ROUTING_DECISION_OWNER_RECONCILIATION',
};

const output = resolve(repoRoot, 'docs/reports/prefill-routing-plan-owner-reconciliation-v1.json');
mkdirSync(resolve(repoRoot, 'docs/reports'), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, output, wiring }, null, 2));
