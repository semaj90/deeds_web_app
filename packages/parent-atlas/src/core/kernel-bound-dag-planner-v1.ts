import { createHash } from 'node:crypto';
import { z } from 'zod';
import { type AtlasOntologyKernelManifestV1 } from './ontology-kernel-manifest-v1.js';
import { type AtlasKernelFunctionCatalogV1 } from './kernel-function-catalog-v1.js';
import { findAtlasKernelFunctionV1 } from './kernel-function-catalog-v1.js';
import { findKernelOperator, type KernelOperatorKind, type KernelOperatorLibraryV1 } from './kernel-operator-library-v1.js';
import { buildAdaptiveDagPlanV1, type AdaptiveDagPlanV1, type DagActionKind } from './adaptive-dag-plan-v1.js';

const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

export const kernelBoundDagPlannerInputSchema = z.object({
  planId: z.string().min(1),
  queryId: z.string().min(1),
  plannerRevision: z.string().min(1),
  classificationRevision: z.string().min(1),
  boundArguments: z.record(z.string(), z.unknown()),
  evidenceRefs: z.array(z.string().min(1)),
  inputChecksum: sha256Hex,
}).strict();

export type KernelBoundDagPlannerInputV1 = z.infer<typeof kernelBoundDagPlannerInputSchema>;

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.keys(item as Record<string, unknown>).sort().reduce<Record<string, unknown>>((out, key) => { out[key] = item[key]; return out; }, {})
    : item);
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

const actionKindForOperator: Partial<Record<KernelOperatorKind, DagActionKind>> = {
  FILTER: 'FETCH_POSTGRES', PROJECT: 'FETCH_POSTGRES', JOIN: 'FETCH_POSTGRES', GROUP: 'FETCH_POSTGRES', AGGREGATE: 'FETCH_POSTGRES',
  LOOKUP_SYMBOL: 'FETCH_POSTGRES', LOOKUP_PACKET: 'FETCH_POSTGRES',
  SEARCH_LEXICAL: 'FETCH_POSTGRES', SEARCH_SEMANTIC: 'FETCH_QDRANT',
  EXPAND_GRAPH: 'GRAPH_EXPAND', SHORTEST_PATH: 'GRAPH_EXPAND', BOUNDED_BFS: 'GRAPH_EXPAND',
  GET_CALLERS: 'GRAPH_EXPAND', GET_CALLEES: 'GRAPH_EXPAND', GET_REFERENCES: 'GRAPH_EXPAND',
  GET_SOURCE_SPAN: 'FETCH_FILE', GET_AST_EVIDENCE: 'AST_SCAN',
  INTERSECT_ELIGIBILITY: 'FETCH_POSTGRES', RERANK: 'RERANK', VALIDATE_SCHEMA: 'SIMDJSON_SCAN',
  RUN_TEST: 'FETCH_FILE', RUN_TYPECHECK: 'FETCH_FILE', COMPARE_REVISION: 'FETCH_POSTGRES', BUILD_CONTEXT: 'BUILD_CONTEXT',
};

/** Lower one catalog function into the bounded adaptive-DAG action contract. */
export function planKernelBoundDagV1(input: {
  manifest: AtlasOntologyKernelManifestV1;
  catalog: AtlasKernelFunctionCatalogV1;
  operatorLibrary: KernelOperatorLibraryV1;
  functionId: string;
  request: KernelBoundDagPlannerInputV1;
}): AdaptiveDagPlanV1 {
  kernelBoundDagPlannerInputSchema.parse(input.request);
  if (input.manifest.state !== 'DRAFT' && input.manifest.state !== 'FROZEN') {
    throw new Error(`KERNEL_BOUND_PLAN_MANIFEST_STATE:${input.manifest.state}`);
  }
  if (input.manifest.kernelRevision !== input.catalog.catalogRevision) {
    throw new Error('KERNEL_BOUND_PLAN_CATALOG_REVISION_MISMATCH');
  }
  if (input.manifest.operatorLibraryRevision !== input.operatorLibrary.libraryRevision) {
    throw new Error('KERNEL_BOUND_PLAN_OPERATOR_LIBRARY_REVISION_MISMATCH');
  }
  if (!input.manifest.functionIds.includes(input.functionId)) {
    throw new Error(`KERNEL_BOUND_PLAN_UNDECLARED_FUNCTION:${input.functionId}`);
  }
  const fn = findAtlasKernelFunctionV1(input.catalog, input.functionId);
  if (!fn) throw new Error(`KERNEL_BOUND_PLAN_FUNCTION_NOT_IN_CATALOG:${input.functionId}`);
  if (fn.kernelRevision !== input.manifest.kernelRevision) throw new Error('KERNEL_BOUND_PLAN_FUNCTION_KERNEL_MISMATCH');
  if (fn.operatorCatalogRevision !== input.operatorLibrary.libraryRevision) throw new Error('KERNEL_BOUND_PLAN_OPERATOR_CATALOG_MISMATCH');
  if (fn.mutationPolicy === 'MUTATES_WITH_RECEIPT') throw new Error('KERNEL_BOUND_PLAN_MUTATION_POLICY_REQUIRES_EXPLICIT_APPLY');

  const actions = fn.operatorGraph.map((step) => {
    const operator = findKernelOperator(input.operatorLibrary, step.operatorId);
    if (!operator) throw new Error(`KERNEL_BOUND_PLAN_UNDECLARED_OPERATOR:${step.operatorId}`);
    const actionKind = actionKindForOperator[operator.kind];
    if (!actionKind) throw new Error(`KERNEL_BOUND_PLAN_UNMAPPED_OPERATOR:${operator.kind}`);
    const actionBody = { functionId: fn.functionId, stepId: step.stepId, boundArguments: input.request.boundArguments, evidenceRefs: input.request.evidenceRefs };
    return {
      actionId: `${input.request.planId}:${step.stepId}`,
      actionKind,
      parentActionIds: step.dependsOnStepIds.map((id) => `${input.request.planId}:${id}`),
      inputArtifactRefs: input.request.evidenceRefs,
      inputChecksum: sha256({ requestInputChecksum: input.request.inputChecksum, ...actionBody }),
      parameterArtifactRef: null,
      parameterChecksum: sha256(input.request.boundArguments),
      outputContract: operator.outputSchemaId,
      mutationPolicy: fn.mutationPolicy === 'PROPOSE_ONLY' ? 'PROPOSE_ONLY' as const : 'READ_ONLY' as const,
      timeoutMs: 30_000,
      failurePolicy: 'FAIL_CLOSED' as const,
    };
  });
  return buildAdaptiveDagPlanV1({
    planId: input.request.planId,
    queryId: input.request.queryId,
    dagRevision: input.manifest.kernelRevision,
    plannerRevision: input.request.plannerRevision,
    classificationRevision: input.request.classificationRevision,
    actions,
  });
}
