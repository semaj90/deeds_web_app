import { createHash } from 'node:crypto';
import { z } from 'zod';

export const SearchTierSchema = z.enum(['hot', 'warm', 'cold']);
export type SearchTier = z.infer<typeof SearchTierSchema>;

export const RETRIEVAL_LIMITS = {
  maxQueryLength: 16_000,
  maxTopKPerLane: 100,
  defaultTopKPerLane: 20,
  maxRerankCandidates: 100,
  defaultRerankCandidates: 30,
  maxFinalResults: 50,
  defaultFinalResults: 10,
  maxRelationDepth: 2,
  maxGraphNeighbors: 50,
  maxExpandedKeywords: 100,
  maxExactKeywords: 50,
  maxNormalizedKeywords: 100,
  exactLexicalTopK: 20,
  postgresFtsTopK: 50,
  denseTopK: 100,
  sparseTopK: 100,
  topologyTopK: 30,
  centroidTopK: 10
} as const;

export const SearchLaneSchema = z.enum([
  'lexical',
  'dense',
  'sparse',
  'topology',
  'authority',
  'routing',
  'documentation',
  'temporal',
  'memory'
]);

export const FileKindSchema = z.enum([
  'source',
  'documentation',
  'configuration',
  'data',
  'test',
  'migration',
  'generated',
  'unknown'
]);

export const SearchMetadataFilterSchema = z
  .object({
    workspaceIds: z.array(z.string().min(1)).max(20).optional(),
    sourceRefs: z.array(z.string().min(1)).max(100).optional(),
    pathPrefixes: z.array(z.string().min(1)).max(50).optional(),
    artifactTier: SearchTierSchema.optional(),
    artifactTiers: z.array(SearchTierSchema).max(3).optional(),
    extensions: z
      .array(
        z.enum([
          '.ts',
          '.tsx',
          '.js',
          '.jsx',
          '.mjs',
          '.cjs',
          '.svelte',
          '.go',
          '.rs',
          '.py',
          '.sql',
          '.md',
          '.txt',
          '.json',
          '.jsonl',
          '.yaml',
          '.yml',
          '.toml'
        ])
      )
      .max(30)
      .optional(),
    languages: z.array(z.string().min(1)).max(30).optional(),
    fileKinds: z.array(FileKindSchema).max(10).optional(),
    symbolKinds: z
      .array(
        z.enum([
          'file',
          'module',
          'function',
          'method',
          'class',
          'interface',
          'type',
          'variable',
          'route',
          'tool',
          'table',
          'test',
          'document',
          'requirement'
        ])
      )
      .max(20)
      .optional(),
    domainIds: z.array(z.string().min(1)).max(50).optional(),
    conceptIds: z.array(z.string().min(1)).max(100).optional(),
    communityIds: z.array(z.number().int()).max(50).optional(),
    kmeansClusters: z.array(z.number().int()).max(64).optional(),
    somCells: z.array(z.number().int().min(0).max(399)).max(100).optional(),
    authorityPercentileMin: z.number().min(0).max(1).optional(),
    embeddingLaneIds: z.array(z.string().min(1)).max(20).optional(),
    graphSnapshotId: z.string().min(1).optional(),
    /** taxonomy_nodes.node_key values; resolved to sourceRefs via
     * taxonomy-retrieval-filter-v1.ts and applied as a post-fetch gate
     * (SearchFilter.include_source_refs), not pushed into lane queries. */
    taxonomyNodeKeys: z.array(z.string().min(1)).max(50).optional(),
    includeGenerated: z.boolean().default(false),
    includeLegacy: z.boolean().default(false)
  })
  .strict();

export type SearchMetadataFilter = z.infer<typeof SearchMetadataFilterSchema>;

export const RetrievalSearchRequestSchema = z
  .object({
    query: z.string().min(1).max(RETRIEVAL_LIMITS.maxQueryLength),
    retrievalTier: SearchTierSchema.optional(),
    lanes: z
      .array(SearchLaneSchema)
      .min(1)
      .default([
        'lexical',
        'dense',
        'sparse',
        'topology',
        'documentation'
      ]),
    search_kinds: z.array(SearchLaneSchema).min(1).optional(),
    filters: SearchMetadataFilterSchema.default({} as SearchMetadataFilter),
    exactKeywords: z.array(z.string().min(1)).max(RETRIEVAL_LIMITS.maxExactKeywords).optional(),
    expandedKeywords: z.array(z.string().min(1)).max(RETRIEVAL_LIMITS.maxExpandedKeywords).optional(),
    topKPerLane: z.number().int().min(1).max(RETRIEVAL_LIMITS.maxTopKPerLane).default(RETRIEVAL_LIMITS.defaultTopKPerLane),
    finalTopK: z.number().int().min(1).max(RETRIEVAL_LIMITS.maxFinalResults).default(RETRIEVAL_LIMITS.defaultFinalResults),
    rerankTopK: z.number().int().min(1).max(RETRIEVAL_LIMITS.maxRerankCandidates).default(RETRIEVAL_LIMITS.defaultRerankCandidates),
    pageSize: z.number().int().min(1).max(RETRIEVAL_LIMITS.maxFinalResults).default(RETRIEVAL_LIMITS.defaultFinalResults),
    cursor: z.string().nullable().optional(),
    includeRelations: z.boolean().default(true),
    relationDepth: z.number().int().min(0).max(RETRIEVAL_LIMITS.maxRelationDepth).default(1),
    includeDebugScores: z.boolean().default(false)
  })
  .strict()
  .superRefine((request, ctx) => {
    if (request.finalTopK > request.rerankTopK) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['finalTopK'],
        message: 'finalTopK cannot exceed rerankTopK'
      });
    }
    if (request.pageSize > request.finalTopK) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pageSize'],
        message: 'pageSize cannot exceed finalTopK'
      });
    }
  });

export const SearchPageSchema = z.object({
  retrievalRunId: z.string().min(1),
  corpusSnapshotId: z.string().min(1),
  results: z.array(z.unknown()),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
  totalCandidateCount: z.number().int().nonnegative(),
  returnedCount: z.number().int().nonnegative()
});

export const RerankerResultSchema = z.object({
  packetKey: z.string().min(1),
  rerankerScore: z.number().finite(),
  rank: z.number().int().positive(),
  truncationApplied: z.boolean(),
  modelId: z.string().min(1),
  modelRevision: z.string().min(1)
});

export const SearchResultSchema = z
  .object({
    packetKey: z.string().min(1),
    sourceRef: z.string().min(1),
    chunkId: z.string().min(1),
    laneIds: z.array(z.string().min(1)).min(1),
    exactMatches: z.array(z.string()).default([]),
    matchedTerms: z.array(z.string()).default([]),
    scores: z
      .object({
        lexical: z.number().finite().nullable(),
        dense: z.number().finite().nullable(),
        sparse: z.number().finite().nullable(),
        topology: z.number().finite().nullable(),
        authorityPercentile: z.number().min(0).max(1).nullable(),
        rrf: z.number().finite(),
        reranker: z.number().finite().nullable(),
        final: z.number().finite()
      })
      .strict(),
    metadata: z
      .object({
        language: z.string().nullable(),
        extension: z.string(),
        fileKind: FileKindSchema,
        symbolKind: z.string().nullable(),
        domainIds: z.array(z.string()),
        conceptIds: z.array(z.string()),
        treeNodeId: z.string().nullable(),
        communityId: z.number().int().nullable(),
        kmeansCluster: z.number().int().nullable(),
        somCell: z.number().int().min(0).max(399).nullable(),
        vectorLaneId: z.string().nullable(),
        graphSnapshotId: z.string().nullable()
      })
      .strict(),
    citation: z
      .object({
        startLine: z.number().int().positive(),
        endLine: z.number().int().positive(),
        headingPath: z.array(z.string()).optional()
      })
      .nullable()
  })
  .strict();

export type RetrievalSearchLane = z.infer<typeof SearchLaneSchema>;
export type RetrievalSearchRequest = z.infer<typeof RetrievalSearchRequestSchema>;
export type SearchPage = z.infer<typeof SearchPageSchema>;
export type SearchResultContract = z.infer<typeof SearchResultSchema>;
export type RerankerResultContract = z.infer<typeof RerankerResultSchema>;

export const KeywordBundleV1Schema = z.object({
  schema: z.literal('atlas.keyword-bundle.v1'),
  exactKeywords: z.array(z.string().min(1)).max(RETRIEVAL_LIMITS.maxExactKeywords),
  normalizedKeywords: z.array(z.string().min(1)).max(RETRIEVAL_LIMITS.maxNormalizedKeywords),
  expandedKeywords: z.array(z.string().min(1)).max(RETRIEVAL_LIMITS.maxExpandedKeywords)
}).strict();

export type KeywordBundleV1 = z.infer<typeof KeywordBundleV1Schema>;
/** Compatibility alias for existing SearchRuntime callers. */
export type KeywordBundle = KeywordBundleV1;

export const QueryUnderstandingV1Schema = z.object({
  schema: z.literal('atlas.query-understanding.v1'),
  originalQuery: z.string().min(1).max(RETRIEVAL_LIMITS.maxQueryLength),
  exactTerms: z.array(z.string().min(1)).max(RETRIEVAL_LIMITS.maxExactKeywords),
  identifierTerms: z.array(z.string().min(1)).max(RETRIEVAL_LIMITS.maxExactKeywords),
  pathTerms: z.array(z.string().min(1)).max(RETRIEVAL_LIMITS.maxExactKeywords),
  symbolTerms: z.array(z.string().min(1)).max(RETRIEVAL_LIMITS.maxExactKeywords),
  ftsTerms: z.array(z.string().min(1)).max(RETRIEVAL_LIMITS.maxExactKeywords),
  trigramTerms: z.array(z.string().min(1)).max(RETRIEVAL_LIMITS.maxExactKeywords),
  semanticText: z.string().min(1).max(RETRIEVAL_LIMITS.maxQueryLength),
  negativeTerms: z.array(z.string().min(1)).max(RETRIEVAL_LIMITS.maxExactKeywords),
  filters: SearchMetadataFilterSchema,
  semanticRepresentation: z.literal('semantic_768'),
  producerRevision: z.literal('atlas.query-understanding.v1')
}).strict();

export type QueryUnderstandingV1 = z.infer<typeof QueryUnderstandingV1Schema>;

export const QueryPlanV1Schema = z.object({
  schema: z.literal('atlas.query-plan.v1'),
  query: z.string().min(1).max(RETRIEVAL_LIMITS.maxQueryLength),
  queryUnderstanding: QueryUnderstandingV1Schema,
  retrievalTier: SearchTierSchema,
  lanes: z.array(SearchLaneSchema).min(1),
  keywordBundle: KeywordBundleV1Schema,
  filters: SearchMetadataFilterSchema,
  topKPerLane: z.number().int().min(1).max(RETRIEVAL_LIMITS.maxTopKPerLane),
  finalTopK: z.number().int().min(1).max(RETRIEVAL_LIMITS.maxFinalResults),
  rerankTopK: z.number().int().min(1).max(RETRIEVAL_LIMITS.maxRerankCandidates),
  pageSize: z.number().int().min(1).max(RETRIEVAL_LIMITS.maxFinalResults),
  cursor: z.string().nullable(),
  includeRelations: z.boolean(),
  relationDepth: z.number().int().min(0).max(RETRIEVAL_LIMITS.maxRelationDepth),
  includeDebugScores: z.boolean(),
  workspaceRevision: z.string().min(1).nullable(),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  promotionAuthorized: z.literal(false),
  planChecksum: z.string().regex(/^[a-f0-9]{64}$/)
}).strict();

export type QueryPlanV1 = z.infer<typeof QueryPlanV1Schema>;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function queryPlanChecksum(value: Omit<QueryPlanV1, 'planChecksum'>): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function isIdentifierLike(value: string): boolean {
  return /[A-Z].*[A-Z]|[_./:-]/.test(value) || /^[a-z0-9]+(?:[A-Z][a-z0-9]+)+$/.test(value);
}

function isPathLike(value: string): boolean {
  return /[\\/]/.test(value) || /\.[a-z0-9]{1,5}$/i.test(value);
}

function isDocLike(value: string): boolean {
  return /\b(doc|docs|documentation|guide|readme|design|architecture|proposal|summary|rfc|spec|decision|roadmap|tutorial|how to|why)\b/i.test(value);
}

function uniqueBounded(values: readonly string[], max: number): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, max);
}

export function normalizeKeywordSurface(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.:/]+/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeKeywordSurface(value: string): string[] {
  return normalizeKeywordSurface(value)
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function identifierVariants(value: string): string[] {
  const words = tokenizeKeywordSurface(value);
  if (words.length === 0) return [value];

  const compact = words.join('');
  const snake = words.join('_');
  const kebab = words.join('-');
  const spaced = words.join(' ');
  const camel =
    words[0] +
    words
      .slice(1)
      .map((word) => word[0]?.toUpperCase() + word.slice(1))
      .join('');

  return [...new Set([value, compact, snake, kebab, spaced, camel])];
}

export function buildKeywordBundle(input: {
  query: string;
  exactKeywords?: string[];
  expandedKeywords?: string[];
}): KeywordBundleV1 {
  const queryTerms = tokenizeKeywordSurface(input.query).filter((term) => term.length > 2);
  const exactKeywords = [...new Set([
    ...(input.exactKeywords ?? []),
    ...queryTerms
  ].map((term) => term.trim()).filter(Boolean))].slice(0, RETRIEVAL_LIMITS.maxExactKeywords);

  const normalizedKeywords = [...new Set(
    exactKeywords.flatMap((term) => identifierVariants(term))
      .map((term) => normalizeKeywordSurface(term))
      .filter(Boolean)
  )].slice(0, RETRIEVAL_LIMITS.maxNormalizedKeywords);

  const expandedKeywords = [...new Set([
    ...(input.expandedKeywords ?? []),
    ...normalizedKeywords,
    ...queryTerms
  ].map((term) => normalizeKeywordSurface(term)).filter(Boolean))].slice(0, RETRIEVAL_LIMITS.maxExpandedKeywords);

  return KeywordBundleV1Schema.parse({
    schema: 'atlas.keyword-bundle.v1',
    exactKeywords,
    normalizedKeywords,
    expandedKeywords
  });
}

/**
 * Deterministic query decomposition for the hybrid fabric. It produces routing
 * hints only; it does not call a model, mint identity, or generate an embedding.
 */
export function buildQueryUnderstandingV1(input: {
  query: string;
  filters?: SearchMetadataFilter;
}): QueryUnderstandingV1 {
  const originalQuery = input.query.trim();
  if (!originalQuery) throw new Error('QUERY_UNDERSTANDING_QUERY_REQUIRED');
  const exactTerms = uniqueBounded(tokenizeKeywordSurface(originalQuery), RETRIEVAL_LIMITS.maxExactKeywords);
  const rawTerms = uniqueBounded(originalQuery.split(/\s+/), RETRIEVAL_LIMITS.maxExactKeywords);
  const identifierTerms = uniqueBounded(rawTerms.filter((term) => isIdentifierLike(term)), RETRIEVAL_LIMITS.maxExactKeywords);
  const pathTerms = uniqueBounded(rawTerms.filter((term) => isPathLike(term)), RETRIEVAL_LIMITS.maxExactKeywords);
  const symbolTerms = uniqueBounded(
    rawTerms.filter((term) => isIdentifierLike(term) || /^[A-Za-z][A-Za-z0-9]*$/.test(term)),
    RETRIEVAL_LIMITS.maxExactKeywords
  );
  const bundle = buildKeywordBundle({ query: originalQuery });
  const ftsTerms = uniqueBounded([...bundle.exactKeywords, ...bundle.normalizedKeywords], RETRIEVAL_LIMITS.maxExactKeywords);
  const trigramTerms = uniqueBounded([...identifierTerms, ...pathTerms, ...rawTerms], RETRIEVAL_LIMITS.maxExactKeywords);

  return QueryUnderstandingV1Schema.parse({
    schema: 'atlas.query-understanding.v1',
    originalQuery,
    exactTerms,
    identifierTerms,
    pathTerms,
    symbolTerms,
    ftsTerms,
    trigramTerms,
    semanticText: normalizeKeywordSurface(originalQuery),
    negativeTerms: [],
    filters: SearchMetadataFilterSchema.parse(input.filters ?? {}),
    semanticRepresentation: 'semantic_768',
    producerRevision: 'atlas.query-understanding.v1'
  });
}

export function inferRetrievalTier(input: {
  query: string;
  exactKeywords?: string[];
  expandedKeywords?: string[];
  normalizedKeywords?: string[];
}): SearchTier {
  const query = input.query.trim();
  const exactKeywords = input.exactKeywords ?? [];
  const normalizedKeywords = input.normalizedKeywords ?? [];
  const expandedKeywords = input.expandedKeywords ?? [];

  const hotSignals = [
    query,
    ...exactKeywords,
    ...normalizedKeywords
  ].filter((value) => isIdentifierLike(value) || isPathLike(value));

  if (hotSignals.length >= 2) {
    return 'hot';
  }

  if (exactKeywords.length >= 2) {
    return 'hot';
  }

  if (isDocLike(query) || expandedKeywords.length > normalizedKeywords.length + 2) {
    return 'cold';
  }

  return 'warm';
}

export function normalizeRetrievalSearchRequest(
  input: Partial<RetrievalSearchRequest> & Record<string, unknown>
): RetrievalSearchRequest {
  const parsed = RetrievalSearchRequestSchema.parse(input);
  const legacyLanes = Array.isArray(input.search_kinds) && input.search_kinds.length > 0
    ? input.search_kinds.filter((lane): lane is RetrievalSearchLane => SearchLaneSchema.safeParse(lane).success)
    : undefined;
  const canonicalLanes = Array.isArray(input.lanes) && input.lanes.length > 0
    ? input.lanes.filter((lane): lane is RetrievalSearchLane => SearchLaneSchema.safeParse(lane).success)
    : undefined;
  const lanes = canonicalLanes ?? legacyLanes ?? parsed.lanes;
  const bundle = buildKeywordBundle({
    query: parsed.query,
    exactKeywords: parsed.exactKeywords,
    expandedKeywords: parsed.expandedKeywords
  });
  const retrievalTier =
    parsed.retrievalTier ??
    inferRetrievalTier({
      query: parsed.query,
      exactKeywords: bundle.exactKeywords,
      normalizedKeywords: bundle.normalizedKeywords,
      expandedKeywords: bundle.expandedKeywords
    });

  // Destructure to drop search_kinds from the normalized output — it must not appear downstream.
  const { search_kinds: _dropped, ...rest } = parsed;
  void _dropped;
  return {
    ...rest,
    retrievalTier,
    lanes,
    exactKeywords: bundle.exactKeywords,
    expandedKeywords: bundle.expandedKeywords
  };
}

/**
 * Freeze the existing normalized request into a deterministic, non-authoritative
 * execution plan. This is a query contract only: it never admits source rows,
 * creates CandidateOrdinal values, writes a cache, or promotes a projection.
 */
export function buildQueryPlanV1(input: {
  request: RetrievalSearchRequest;
  workspaceRevision?: string | null;
}): QueryPlanV1 {
  const request = RetrievalSearchRequestSchema.parse(input.request);
  const bundle = buildKeywordBundle({
    query: request.query,
    exactKeywords: request.exactKeywords,
    expandedKeywords: request.expandedKeywords
  });
  const queryUnderstanding = buildQueryUnderstandingV1({
    query: request.query,
    filters: request.filters
  });
  const base = {
    schema: 'atlas.query-plan.v1' as const,
    query: request.query,
    queryUnderstanding,
    retrievalTier: request.retrievalTier ?? inferRetrievalTier({
      query: request.query,
      exactKeywords: bundle.exactKeywords,
      normalizedKeywords: bundle.normalizedKeywords,
      expandedKeywords: bundle.expandedKeywords
    }),
    lanes: request.lanes,
    keywordBundle: bundle,
    filters: request.filters,
    topKPerLane: request.topKPerLane,
    finalTopK: request.finalTopK,
    rerankTopK: request.rerankTopK,
    pageSize: request.pageSize,
    cursor: request.cursor ?? null,
    includeRelations: request.includeRelations,
    relationDepth: request.relationDepth,
    includeDebugScores: request.includeDebugScores,
    workspaceRevision: input.workspaceRevision ?? null,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
    promotionAuthorized: false as const
  } satisfies Omit<QueryPlanV1, 'planChecksum'>;
  return QueryPlanV1Schema.parse({ ...base, planChecksum: queryPlanChecksum(base) });
}
