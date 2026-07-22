import { z } from 'zod';

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
    includeGenerated: z.boolean().default(false),
    includeLegacy: z.boolean().default(false)
  })
  .strict();

export type SearchMetadataFilter = z.infer<typeof SearchMetadataFilterSchema>;

export const RetrievalSearchRequestSchema = z
  .object({
    query: z.string().min(1).max(RETRIEVAL_LIMITS.maxQueryLength),
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
    filters: SearchMetadataFilterSchema.default({
      includeGenerated: false,
      includeLegacy: false
    }),
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

export interface KeywordBundle {
  exactKeywords: string[];
  normalizedKeywords: string[];
  expandedKeywords: string[];
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
}): KeywordBundle {
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

  return { exactKeywords, normalizedKeywords, expandedKeywords };
}

export function normalizeRetrievalSearchRequest(
  input: Partial<RetrievalSearchRequest> & Record<string, unknown>
): RetrievalSearchRequest {
  const parsed = RetrievalSearchRequestSchema.parse(input);
  const bundle = buildKeywordBundle({
    query: parsed.query,
    exactKeywords: parsed.exactKeywords,
    expandedKeywords: parsed.expandedKeywords
  });

  return {
    ...parsed,
    exactKeywords: bundle.exactKeywords,
    expandedKeywords: bundle.expandedKeywords
  };
}
