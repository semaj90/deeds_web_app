export const ATLAS_OPERATION_SCHEMA = 'atlas.operation.v1' as const;

export const ATLAS_OPERATIONS = [
  'AST_CHUNK',
  'LEXICAL_SEARCH',
  'SEMANTIC_SEARCH',
  'GRAPH_BFS',
  'GRAPH_SHORTEST_PATH',
  'GRAPH_SSSP',
  'GRAPH_PAGERANK',
  'GRAPH_PPR',
  'GRAPH_COMMUNITY',
  'SOM_ASSIGN',
  'SOM_NEIGHBORHOOD',
  'ONTOLOGY_EXPAND',
  'DOMAIN_CLASSIFY',
  'RANK_CANDIDATES',
  'SAMPLE_CANDIDATES',
  'ERROR_DIAGNOSE',
  'PATCH_PLAN',
  'PATCH_VALIDATE',
] as const;

export type AtlasOperationV1 = (typeof ATLAS_OPERATIONS)[number];
export type AtlasOperationStatusV1 = 'SUCCESS' | 'DEGRADED' | 'FAILED';

export interface AtlasExecutorV1 {
  implementation: string;
  language: string;
  backend: string;
}

export interface AtlasRevisionContextV1 {
  workspaceRevision?: string;
  sourceRevision?: string;
  graphRevision?: string;
  representationRevision?: string;
  featureRevision?: string;
}

export interface AtlasOperationRequestV1<TPayload = unknown> {
  schema: typeof ATLAS_OPERATION_SCHEMA;
  requestId: string;
  operation: AtlasOperationV1;
  revisions: AtlasRevisionContextV1;
  payload: TPayload;
}

export interface AtlasOperationReceiptV1 {
  elapsedMs: number;
  canonicalAuthority: boolean;
  requestedRevisions: AtlasRevisionContextV1;
  effectiveRevisions: AtlasRevisionContextV1;
  evidenceRefs: string[];
}

export interface AtlasOperationResponseV1<TPayload = unknown> {
  schema: typeof ATLAS_OPERATION_SCHEMA;
  status: AtlasOperationStatusV1;
  operation: AtlasOperationV1;
  executor: AtlasExecutorV1;
  receipt: AtlasOperationReceiptV1;
  payload?: TPayload;
  errorCode?: 'ATLAS_OPERATION_NOT_IMPLEMENTED' | 'ATLAS_OPERATION_FAILED';
  errorMessage?: string;
}

export function createAtlasOperationRequestV1<TPayload>(input: {
  requestId: string;
  operation: AtlasOperationV1;
  revisions?: AtlasRevisionContextV1;
  payload: TPayload;
}): AtlasOperationRequestV1<TPayload> {
  return {
    schema: ATLAS_OPERATION_SCHEMA,
    requestId: input.requestId,
    operation: input.operation,
    revisions: input.revisions ?? {},
    payload: input.payload,
  };
}
