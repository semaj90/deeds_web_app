export const QUERY_VIEWPORT_V1_SCHEMA = 'parent-atlas.query-viewport.v1' as const;

export interface QueryViewportStructuralAnchorV1 {
  canonicalId?: string;
  symbolVersionId?: string;
  astKinds?: readonly string[];
}

export interface QueryViewportLodBudgetV1 {
  maxCards: number;
  maxSourceBytes: number;
  maxContextTokens: number;
  maxGpuBytes: number;
}

export interface QueryViewportPrefetchHorizonV1 {
  maxPredictedActions: number;
  maxNeighborDepth: number;
}

export interface QueryViewportV1 {
  schema: typeof QUERY_VIEWPORT_V1_SCHEMA;
  requestId: string;
  workspaceRevision: string;
  graphRevision: string;
  taxonomyRevision?: string;

  queryTextHash: string;
  queryFingerprintRef: string;

  literalTerms: readonly string[];
  identifiers: readonly string[];
  pathTerms: readonly string[];

  semanticRepresentation: 'semantic_768';
  semantic768Ref?: string;

  structuralAnchors: readonly QueryViewportStructuralAnchorV1[];
  graphSeeds: readonly string[];

  candidateSnapshotRevision: string;
  candidateOrdinalMapChecksum: string;

  lodBudget: QueryViewportLodBudgetV1;
  prefetchHorizon: QueryViewportPrefetchHorizonV1;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values.map((x) => x.trim()).filter(Boolean))].sort();
}

export function buildQueryViewportV1(input: Omit<
  QueryViewportV1,
  'schema' | 'semanticRepresentation' | 'literalTerms' | 'identifiers' | 'pathTerms' | 'graphSeeds'
> & {
  literalTerms?: readonly string[];
  identifiers?: readonly string[];
  pathTerms?: readonly string[];
  graphSeeds?: readonly string[];
}): QueryViewportV1 {
  if (!input.workspaceRevision) throw new Error('workspaceRevision is required');
  if (!input.candidateSnapshotRevision) throw new Error('candidateSnapshotRevision is required');
  if (!input.candidateOrdinalMapChecksum) throw new Error('candidateOrdinalMapChecksum is required');

  return {
    ...input,
    schema: QUERY_VIEWPORT_V1_SCHEMA,
    semanticRepresentation: 'semantic_768',
    literalTerms: sortedUnique(input.literalTerms ?? []),
    identifiers: sortedUnique(input.identifiers ?? []),
    pathTerms: sortedUnique(input.pathTerms ?? []),
    graphSeeds: sortedUnique(input.graphSeeds ?? [])
  };
}
