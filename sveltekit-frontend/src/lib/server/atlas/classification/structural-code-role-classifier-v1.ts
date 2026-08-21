import { buildClassificationObservationV1, type ClassificationObservationV1 } from './classification-observation-v1.js';

export type StructuralCodeRoleV1 =
  | 'CANONICAL_WRITER'
  | 'PROJECTION_WRITER'
  | 'RETRIEVAL_EXECUTOR'
  | 'ROUTE_HANDLER'
  | 'VALIDATOR'
  | 'MATERIALIZER'
  | 'CLASSIFIER'
  | 'RERANKER'
  | 'GRAPH_ANALYZER'
  | 'UNKNOWN';

export interface StructuralCodeRoleSignalsV1 {
  sourceRef: string;
  workspaceRevision: string;
  sourceRevision: string;
  packetKey?: string | null;
  treeNodeId?: string | null;
  symbolVersionId?: string | null;
  imports?: readonly string[];
  calls?: readonly string[];
  exports?: readonly string[];
  resolvedSymbols?: readonly string[];
  evidenceRefs?: readonly string[];
}

function includesAny(values: readonly string[], patterns: readonly RegExp[]): boolean {
  return values.some((value) => patterns.some((pattern) => pattern.test(value)));
}

export function classifyStructuralCodeRoleV1(
  input: StructuralCodeRoleSignalsV1,
): ClassificationObservationV1 {
  const calls = [...(input.calls ?? []), ...(input.resolvedSymbols ?? [])];
  const imports = [...(input.imports ?? [])];
  const exports = [...(input.exports ?? [])];
  const all = [...calls, ...imports, ...exports, input.sourceRef];

  const scores = new Map<StructuralCodeRoleV1, number>();
  const bump = (role: StructuralCodeRoleV1, score: number) => scores.set(role, Math.max(scores.get(role) ?? 0, score));

  if (includesAny(all, [/qdrant/i, /upsert/i, /setPayload/i, /deletePayload/i])) bump('PROJECTION_WRITER', 0.96);
  if (includesAny(all, [/db\.insert/i, /db\.update/i, /persistCanonical/i, /canonical.*writer/i])) bump('CANONICAL_WRITER', 0.95);
  if (includesAny(all, [/rerank/i, /cross.?encoder/i, /mixedbread/i, /marco/i])) bump('RERANKER', 0.94);
  if (includesAny(all, [/classif/i, /intent/i, /domain.*head/i])) bump('CLASSIFIER', 0.90);
  if (includesAny(all, [/materializ/i, /graphify.*materializer/i])) bump('MATERIALIZER', 0.92);
  if (includesAny(all, [/validate/i, /zod/i, /assert[A-Z_]/])) bump('VALIDATOR', 0.85);
  if (includesAny(all, [/pagerank/i, /community/i, /cugraph/i, /graph.*analy/i])) bump('GRAPH_ANALYZER', 0.90);
  if (includesAny(all, [/search/i, /retrieve/i, /qdrant.*query/i, /pgvector/i, /cuvs/i])) bump('RETRIEVAL_EXECUTOR', 0.86);
  if (/\/routes\//.test(input.sourceRef) || includesAny(exports, [/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)$/])) bump('ROUTE_HANDLER', 0.95);

  if (scores.size === 0) bump('UNKNOWN', 1);
  const labels = [...scores.entries()].map(([label, probability]) => ({ label, probability }));

  return buildClassificationObservationV1({
    requestId: `code-role:${input.sourceRef}:${input.sourceRevision}`,
    workspaceRevision: input.workspaceRevision,
    task: 'code_role',
    labels,
    sourceRef: input.sourceRef,
    sourceRevision: input.sourceRevision,
    packetKey: input.packetKey,
    treeNodeId: input.treeNodeId,
    symbolVersionId: input.symbolVersionId,
    modelId: 'atlas-structural-rules',
    modelRevision: 'atlas.structural-code-role-rules.v1',
    classifierHeadRevision: 'atlas.structural-code-role-rules.v1',
    calibrationRevision: 'deterministic-rules.v1',
    evidenceRefs: input.evidenceRefs,
    abstainThreshold: 0.7,
  });
}
