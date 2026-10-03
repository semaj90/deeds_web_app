#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileRetrievalExecutorPlanV2,
  DEFAULT_RETRIEVAL_EXECUTOR_CAPABILITIES_V2,
} from '../../src/lib/server/atlas/classification/retrieval-executor-policy-v2.js';
import { QueryClassificationV2Schema } from '../../src/lib/server/atlas/classification/query-classification-v2.js';

// Resolve from this script rather than cwd: the proof is invoked from both
// the repository root and sveltekit-frontend. Evidence must never be written
// to a sibling directory merely because the caller chose a different cwd.
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');
const output = resolve(repoRoot, 'docs/reports/deterministic-capability-policy-v1.json');
const classification = QueryClassificationV2Schema.parse({
  schema: 'atlas.query-classification.v2',
  requestId: 'fixture:deterministic-capability-policy-v1',
  workspaceRevision: 'UNBOUND_FIXTURE',
  classificationRevision: 'fixture-classification-revision-v1',
  routerFeatureRevision: 'atlas.query-router-tensor.v1',
  classifierModelRevision: 'UNEXECUTED_FIXTURE',
  calibrationRevision: 'UNBOUND',
  domain: [{ label: 'retrieval', probability: 1 }],
  operation: [{ operation: 'find', probability: 1 }],
  structuralIntent: { function: 0, call: 0, symbol: 0, type: 0, route: 0, databaseCall: 0, config: 0 },
  retrievalNeed: { lexical: 0.8, semantic: 0.95, ast: 0.4, graph: 0.5, exactSymbol: 0.1 },
  expectedDepth: { graphHops: 1, candidateBudget: 128, rerankBudget: 0 },
  confidence: 0.8,
  entropy: 0.2,
  abstained: false,
  evidenceRefs: [],
  canonicalWritesAllowed: false,
  retrievalVoteAdded: false,
});
const envelope = {
  gpuAvailable: true,
  allowGpuAnn: true,
  allowDiskAnn: false,
  allowSparseNeural: true,
  allowReranker: false,
  maxCandidates: 128,
  maxGraphHops: 1,
};
const plan = compileRetrievalExecutorPlanV2({
  classification,
  semanticRepresentation: 'semantic_768',
  envelope,
  capabilities: DEFAULT_RETRIEVAL_EXECUTOR_CAPABILITIES_V2,
});
const report = {
  schema: 'ParentAtlasDeterministicCapabilityPolicyProofV1',
  generatedAt: new Date().toISOString(),
  status: plan.canonicalWritesAllowed === false && plan.evidenceAuthority === false && plan.oneVotePerLogicalLane
    ? 'DETERMINISTIC_POLICY_PLUMBING_PROVEN'
    : 'DETERMINISTIC_POLICY_FAILED',
  evidenceClass: 'FIXTURE_ONLY',
  classifierExecuted: false,
  learnedModelPromoted: false,
  capabilityPolicyOwner: 'retrieval-executor-policy-v2.ts',
  logicalNeedsOnly: true,
  implementationNamesPredictedByClassifier: false,
  input: { classificationSchema: classification.schema, semanticRepresentation: 'semantic_768', envelope },
  plan,
  expectedFailClosedBehavior: {
    unprovenQdrantCuVSExecutorsExcluded: !plan.semantic.includes('qdrant_hnsw') && !plan.semantic.includes('cuvs_cagra'),
    lexicalBaselineAllowed: plan.lexical.includes('postgres_fts'),
    astAndGraphAreSeparateLanes: plan.ast.includes('ast_structural') && plan.graph.includes('graph_bounded'),
  },
  canonicalAuthority: false,
  writesPerformed: false,
  canonicalWritesAllowed: false,
  nextRequirement: 'REVISION_QUALIFIED_CLASSIFICATION_AND_LIVE_CAPABILITY_RECEIPTS',
};
mkdirSync(resolve(repoRoot, 'docs/reports'), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, lanes: { lexical: plan.lexical, sparse: plan.sparse, semantic: plan.semantic, ast: plan.ast, graph: plan.graph }, output }, null, 2));
