import type { ExecutionHeadroomV1 } from './execution-headroom-v1.js';
import type { QueryViewportV1 } from './query-viewport-v1.js';

export const RETRIEVAL_EXECUTION_REQUEST_V1_SCHEMA =
  'parent-atlas.retrieval-execution-request.v1' as const;

export type LogicalRetrievalLaneV1 =
  | 'EXACT'
  | 'LEXICAL'
  | 'STRUCTURAL'
  | 'SEMANTIC'
  | 'GRAPH';

export type SemanticExecutorHintV1 =
  | 'SEARCH_RUNTIME_DEFAULT'
  | 'QDRANT'
  | 'CUVS_EXACT'
  | 'CUVS_CAGRA'
  | 'PGVECTOR';

export interface RetrievalExecutionRequestV1 {
  schema: typeof RETRIEVAL_EXECUTION_REQUEST_V1_SCHEMA;
  requestId: string;
  retrievalPlanRef: string;
  viewport: QueryViewportV1;
  headroom: ExecutionHeadroomV1;

  allowedLogicalLanes: readonly LogicalRetrievalLaneV1[];

  semanticRepresentation: 'semantic_768';
  semanticExecutorHint: SemanticExecutorHintV1;

  exactPromotionRequired: boolean;
  requiresFreshWeb: boolean;

  fusionOwner: 'SEARCH_RUNTIME';
  semanticVoteCount: 1;
}

export function buildRetrievalExecutionRequestV1(
  input: Omit<
    RetrievalExecutionRequestV1,
    'schema' | 'semanticRepresentation' | 'fusionOwner' | 'semanticVoteCount'
  >
): RetrievalExecutionRequestV1 {
  if (input.requestId !== input.viewport.requestId || input.requestId !== input.headroom.requestId) {
    throw new Error('requestId mismatch across execution request, viewport, and headroom');
  }

  return {
    ...input,
    schema: RETRIEVAL_EXECUTION_REQUEST_V1_SCHEMA,
    semanticRepresentation: 'semantic_768',
    fusionOwner: 'SEARCH_RUNTIME',
    semanticVoteCount: 1
  };
}
