import { z } from 'zod';
import { TTL, bifrostKey, hashStr } from '$lib/server/cache-keys.js';

/**
 * Read-only readiness ranker for the Parent Atlas agentic repair gate.
 *
 * The ranker does not execute retrieval, graph expansion, cache writes, or
 * centroid materialization itself. Callers inject a lookup function; the
 * observations are Zod-validated, converted to explicit percentages, ranked
 * deterministically, and compiled into bounded follow-up actions.
 *
 * This keeps the policy boundary clear:
 *   observation -> percentage evidence -> gate -> proposed sub-actions
 *
 * Any eventual mutation still belongs to the DAG/validator/materializer path.
 */

export const AgenticRepairLibrarySchema = z.enum([
  'TREE_SITTER',
  'AST_GREP',
  'TS_MORPH',
  'LSP',
  'ARROW_IPC',
  'PACKET_FABRIC',
  'GRAPH_EXPANDER',
  'ACE',
  'BITFROST',
  'REDIS_VALKEY',
  'CENTROID_CACHE',
  'QDRANT',
]);
export type AgenticRepairLibrary = z.infer<typeof AgenticRepairLibrarySchema>;

export const AlignmentCountV1Schema = z.object({
  numerator: z.number().int().nonnegative(),
  denominator: z.number().int().positive(),
}).strict().superRefine((value, ctx) => {
  if (value.numerator > value.denominator) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['numerator'],
      message: 'numerator must be <= denominator',
    });
  }
});
export type AlignmentCountV1 = z.infer<typeof AlignmentCountV1Schema>;

export const AgenticRepairLibraryFetchParametersV1Schema = z.object({
  schema: z.literal('atlas.agentic-repair-library-fetch-parameters.v1'),
  library: AgenticRepairLibrarySchema,
  topK: z.number().int().positive().max(10_000),
  latencyBudgetMs: z.number().int().positive().max(120_000),
  graphHopBudget: z.number().int().nonnegative().max(8),
  graphFanoutBudget: z.number().int().nonnegative().max(10_000),
  maxWarmBuckets: z.number().int().nonnegative().max(128),
  centroidCandidateLimit: z.number().int().positive().max(10_000),
  cacheTtlSeconds: z.number().int().positive().max(30 * 24 * 60 * 60),
  exactPromotionRequired: z.literal(true),
}).strict();
export type AgenticRepairLibraryFetchParametersV1 = z.infer<typeof AgenticRepairLibraryFetchParametersV1Schema>;

export const AgenticRepairLibraryLookupRequestV1Schema = z.object({
  schema: z.literal('atlas.agentic-repair-library-lookup-request.v1'),
  requestId: z.string().min(1),
  queryText: z.string().min(1),
  targetFiles: z.array(z.string().min(1)).max(256),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  parameters: AgenticRepairLibraryFetchParametersV1Schema,
  producerRevision: z.string().min(1),
}).strict();
export type AgenticRepairLibraryLookupRequestV1 = z.infer<typeof AgenticRepairLibraryLookupRequestV1Schema>;

export const AgenticRepairLibraryLookupObservationV1Schema = z.object({
  schema: z.literal('atlas.agentic-repair-library-lookup-observation.v1'),
  library: AgenticRepairLibrarySchema,
  reachable: z.boolean(),
  latencyMs: z.number().finite().nonnegative(),
  coverage: AlignmentCountV1Schema.nullable(),
  exactEvidence: AlignmentCountV1Schema.nullable(),
  revisionAlignment: AlignmentCountV1Schema.nullable(),
  canonicalIdentity: AlignmentCountV1Schema.nullable(),
  cacheHits: AlignmentCountV1Schema.nullable(),
  sourceRefs: z.array(z.string().min(1)).max(10_000),
  observedRevision: z.string().min(1).nullable(),
  producerRevision: z.string().min(1),
}).strict();
export type AgenticRepairLibraryLookupObservationV1 = z.infer<typeof AgenticRepairLibraryLookupObservationV1Schema>;

export type AgenticRepairLibraryLookup = (
  request: AgenticRepairLibraryLookupRequestV1,
) => Promise<unknown>;

export const AgenticRepairGatePolicyV1Schema = z.object({
  schema: z.literal('atlas.agentic-repair-gate-policy.v1'),
  requiredLibraries: z.array(AgenticRepairLibrarySchema).min(1),
  minRequiredLibraryMeanPercent: z.number().finite().min(0).max(100),
  minOverallMeanPercent: z.number().finite().min(0).max(100),
  minDegradedOverallMeanPercent: z.number().finite().min(0).max(100),
  minSourceRefsPerRequiredLibrary: z.number().int().nonnegative().max(10_000),
}).strict().superRefine((value, ctx) => {
  if (value.minDegradedOverallMeanPercent > value.minOverallMeanPercent) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['minDegradedOverallMeanPercent'],
      message: 'degraded threshold must be <= ready threshold',
    });
  }
  if (new Set(value.requiredLibraries).size !== value.requiredLibraries.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['requiredLibraries'],
      message: 'requiredLibraries must be unique',
    });
  }
});
export type AgenticRepairGatePolicyV1 = z.infer<typeof AgenticRepairGatePolicyV1Schema>;

export const AgenticRepairReadinessInputV1Schema = z.object({
  schema: z.literal('atlas.agentic-repair-readiness-input.v1'),
  requestId: z.string().min(1),
  queryText: z.string().min(1),
  targetFiles: z.array(z.string().min(1)).max(256),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  fetchPlans: z.array(AgenticRepairLibraryFetchParametersV1Schema).min(1),
  gatePolicy: AgenticRepairGatePolicyV1Schema,
  producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  const libraries = value.fetchPlans.map((row) => row.library);
  if (new Set(libraries).size !== libraries.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fetchPlans'],
      message: 'each library may appear at most once',
    });
  }
  for (const required of value.gatePolicy.requiredLibraries) {
    if (!libraries.includes(required)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fetchPlans'],
        message: `missing fetch plan for required library ${required}`,
      });
    }
  }
});
export type AgenticRepairReadinessInputV1 = z.infer<typeof AgenticRepairReadinessInputV1Schema>;

export const ReadinessMetricNameSchema = z.enum([
  'reachability',
  'latencyBudgetFit',
  'coverage',
  'exactEvidence',
  'revisionAlignment',
  'canonicalIdentity',
  'cacheHits',
]);
export type ReadinessMetricName = z.infer<typeof ReadinessMetricNameSchema>;

export const ReadinessMetricV1Schema = z.object({
  name: ReadinessMetricNameSchema,
  percent: z.number().finite().min(0).max(100),
}).strict();
export type ReadinessMetricV1 = z.infer<typeof ReadinessMetricV1Schema>;

export const RankedAgenticRepairLibraryV1Schema = z.object({
  library: AgenticRepairLibrarySchema,
  meanPercent: z.number().finite().min(0).max(100),
  metrics: z.array(ReadinessMetricV1Schema).min(2),
  sourceRefCount: z.number().int().nonnegative(),
  reachable: z.boolean(),
  rank: z.number().int().positive(),
  observedRevision: z.string().min(1).nullable(),
}).strict();
export type RankedAgenticRepairLibraryV1 = z.infer<typeof RankedAgenticRepairLibraryV1Schema>;

export const AgenticRepairGroupMeanV1Schema = z.object({
  group: z.enum(['STRUCTURAL', 'SEMANTIC', 'FABRIC', 'GRAPH', 'CONTEXT', 'CACHE', 'CENTROID']),
  meanPercent: z.number().finite().min(0).max(100),
  libraries: z.array(AgenticRepairLibrarySchema).min(1),
}).strict();
export type AgenticRepairGroupMeanV1 = z.infer<typeof AgenticRepairGroupMeanV1Schema>;

export const AgenticRepairActionKindSchema = z.enum([
  'GRAPH_EXPANSION',
  'ACE_CONTEXT_PREFETCH',
  'BITFROST_BUCKET_WARM',
  'CENTROID_LOOKUP',
  'CENTROID_SYNTHESIS',
]);
export type AgenticRepairActionKind = z.infer<typeof AgenticRepairActionKindSchema>;

export const AgenticRepairProposedActionV1Schema = z.object({
  kind: AgenticRepairActionKindSchema,
  trigger: z.boolean(),
  owner: z.string().min(1),
  reasonCodes: z.array(z.string().min(1)).min(1),
  parameters: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])),
  sideEffectsAuthorized: z.literal(false),
}).strict();
export type AgenticRepairProposedActionV1 = z.infer<typeof AgenticRepairProposedActionV1Schema>;

export const AgenticRepairReadinessResultV1Schema = z.object({
  schema: z.literal('atlas.agentic-repair-readiness-result.v1'),
  requestId: z.string().min(1),
  queryHash: z.string().regex(/^[a-f0-9]{16}$/),
  rankedLibraries: z.array(RankedAgenticRepairLibraryV1Schema).min(1),
  groupMeans: z.array(AgenticRepairGroupMeanV1Schema).min(1),
  overallMeanPercent: z.number().finite().min(0).max(100),
  gate: z.enum(['READY', 'DEGRADED', 'BLOCKED']),
  nextGate: z.enum(['AGENTIC_ERROR_FIXING_EVIDENCE', 'LIBRARY_ALIGNMENT_REPAIR']),
  blockers: z.array(z.string()),
  actions: z.array(AgenticRepairProposedActionV1Schema),
  percentagesAreArithmeticMeans: z.literal(true),
  rankingDeterministic: z.literal(true),
  exactPromotionRequired: z.literal(true),
  canonicalWritesAllowed: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type AgenticRepairReadinessResultV1 = z.infer<typeof AgenticRepairReadinessResultV1Schema>;

const GROUP_BY_LIBRARY: Record<AgenticRepairLibrary, AgenticRepairGroupMeanV1['group']> = {
  TREE_SITTER: 'STRUCTURAL',
  AST_GREP: 'STRUCTURAL',
  TS_MORPH: 'SEMANTIC',
  LSP: 'SEMANTIC',
  ARROW_IPC: 'FABRIC',
  PACKET_FABRIC: 'FABRIC',
  GRAPH_EXPANDER: 'GRAPH',
  ACE: 'CONTEXT',
  BITFROST: 'CACHE',
  REDIS_VALKEY: 'CACHE',
  CENTROID_CACHE: 'CENTROID',
  QDRANT: 'CENTROID',
};

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'in', 'into',
  'is', 'it', 'of', 'on', 'or', 'our', 'the', 'this', 'to', 'with', 'user', 'query',
  'error', 'errors', 'fix', 'fixing', 'agentic', 'repair', 'rank', 'ranker', 'library', 'libraries',
  'function', 'functions', 'variable', 'variables', 'method', 'methods', 'class', 'classes',
]);

function roundPercent(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)) * 100) / 100;
}

function countPercent(value: AlignmentCountV1): number {
  return roundPercent((value.numerator / value.denominator) * 100);
}

function arithmeticMean(values: readonly number[]): number {
  if (!values.length) return 0;
  return roundPercent(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function latencyFitPercent(latencyMs: number, budgetMs: number): number {
  if (latencyMs <= budgetMs) return 100;
  if (latencyMs <= 0) return 100;
  return roundPercent((budgetMs / latencyMs) * 100);
}

function tokenize(text: string): string[] {
  return [...new Set(
    text
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 2),
  )];
}

function significantTokens(queryText: string, max = 8): string[] {
  return tokenize(queryText)
    .filter((token) => !STOP_WORDS.has(token))
    .sort()
    .slice(0, max);
}

function inferLanguageBuckets(targetFiles: readonly string[]): string[] {
  const out = new Set<string>();
  for (const file of targetFiles) {
    const lower = file.toLowerCase();
    if (/\.(ts|tsx|mts|cts)$/.test(lower)) out.add('typescript');
    else if (/\.(js|jsx|mjs|cjs)$/.test(lower)) out.add('javascript');
    else if (lower.endsWith('.py')) out.add('python');
    else if (lower.endsWith('.rs')) out.add('rust');
    else if (lower.endsWith('.go')) out.add('go');
  }
  return [...out].sort();
}

function inferKindBuckets(queryText: string): string[] {
  const tokens = new Set(tokenize(queryText));
  const out: string[] = [];
  if (tokens.has('function') || tokens.has('functions')) out.push('function');
  if (tokens.has('method') || tokens.has('methods')) out.push('method');
  if (tokens.has('variable') || tokens.has('variables')) out.push('variable');
  if (tokens.has('class') || tokens.has('classes')) out.push('class');
  if (tokens.has('interface') || tokens.has('interfaces')) out.push('interface');
  if (tokens.has('type') || tokens.has('types')) out.push('type');
  return out;
}

function libraryRow(
  observation: AgenticRepairLibraryLookupObservationV1,
  parameters: AgenticRepairLibraryFetchParametersV1,
): Omit<RankedAgenticRepairLibraryV1, 'rank'> {
  const metrics: ReadinessMetricV1[] = [
    { name: 'reachability', percent: observation.reachable ? 100 : 0 },
    { name: 'latencyBudgetFit', percent: latencyFitPercent(observation.latencyMs, parameters.latencyBudgetMs) },
  ];

  const optional: Array<[ReadinessMetricName, AlignmentCountV1 | null]> = [
    ['coverage', observation.coverage],
    ['exactEvidence', observation.exactEvidence],
    ['revisionAlignment', observation.revisionAlignment],
    ['canonicalIdentity', observation.canonicalIdentity],
    ['cacheHits', observation.cacheHits],
  ];
  for (const [name, count] of optional) {
    if (count) metrics.push({ name, percent: countPercent(count) });
  }

  const parsedMetrics = metrics.map((metric) => ReadinessMetricV1Schema.parse(metric));
  return {
    library: observation.library,
    meanPercent: arithmeticMean(parsedMetrics.map((metric) => metric.percent)),
    metrics: parsedMetrics,
    sourceRefCount: observation.sourceRefs.length,
    reachable: observation.reachable,
    observedRevision: observation.observedRevision,
  };
}

function rankRows(rows: Array<Omit<RankedAgenticRepairLibraryV1, 'rank'>>): RankedAgenticRepairLibraryV1[] {
  return rows
    .slice()
    .sort((a, b) => b.meanPercent - a.meanPercent || a.library.localeCompare(b.library))
    .map((row, index) => RankedAgenticRepairLibraryV1Schema.parse({ ...row, rank: index + 1 }));
}

function inferGraphExpansionAction(
  input: AgenticRepairReadinessInputV1,
  rows: readonly RankedAgenticRepairLibraryV1[],
): AgenticRepairProposedActionV1 {
  const tokens = new Set(tokenize(input.queryText));
  const graphTerms = ['import', 'imports', 'caller', 'callers', 'callee', 'callees', 'dependency', 'dependencies', 'reference', 'references', 'graph', 'fanout', 'blast'];
  const structuralIntent = graphTerms.some((term) => tokens.has(term));
  const graph = rows.find((row) => row.library === 'GRAPH_EXPANDER');
  const params = input.fetchPlans.find((row) => row.library === 'GRAPH_EXPANDER');
  const trigger = Boolean(params && graph?.reachable && (structuralIntent || input.targetFiles.length > 0));

  return AgenticRepairProposedActionV1Schema.parse({
    kind: 'GRAPH_EXPANSION',
    trigger,
    owner: 'sveltekit-frontend/src/lib/server/ace/graph-expander.ts',
    reasonCodes: [
      structuralIntent ? 'QUERY_REQUESTS_DEPENDENCY_OR_REFERENCE_CONTEXT' : 'TARGET_FILES_CAN_USE_BOUNDED_IMPORT_GRAPH_CONTEXT',
      graph?.reachable ? 'GRAPH_EXPANDER_REACHABLE' : 'GRAPH_EXPANDER_NOT_PROVEN_REACHABLE',
    ],
    parameters: {
      targetFiles: input.targetFiles,
      hopBudget: params?.graphHopBudget ?? 0,
      fanoutBudget: params?.graphFanoutBudget ?? 0,
    },
    sideEffectsAuthorized: false,
  });
}

function inferAceContextAction(
  input: AgenticRepairReadinessInputV1,
  rows: readonly RankedAgenticRepairLibraryV1[],
): AgenticRepairProposedActionV1 {
  const ace = rows.find((row) => row.library === 'ACE');
  const params = input.fetchPlans.find((row) => row.library === 'ACE');
  return AgenticRepairProposedActionV1Schema.parse({
    kind: 'ACE_CONTEXT_PREFETCH',
    trigger: Boolean(ace?.reachable && params),
    owner: 'ACE_CONTEXT_ASSEMBLY',
    reasonCodes: [
      'AGENTIC_REPAIR_REQUIRES_EVIDENCE_CONTEXT',
      ace?.reachable ? 'ACE_REACHABLE' : 'ACE_NOT_PROVEN_REACHABLE',
    ],
    parameters: {
      topK: params?.topK ?? 0,
      queryHash: hashStr(input.queryText).slice(0, 16),
      exactPromotionRequired: true,
    },
    sideEffectsAuthorized: false,
  });
}

function inferBitfrostWarmAction(
  input: AgenticRepairReadinessInputV1,
  rows: readonly RankedAgenticRepairLibraryV1[],
): AgenticRepairProposedActionV1 {
  const bifrost = rows.find((row) => row.library === 'BITFROST');
  const valkey = rows.find((row) => row.library === 'REDIS_VALKEY');
  const params = input.fetchPlans.find((row) => row.library === 'BITFROST')
    ?? input.fetchPlans.find((row) => row.library === 'REDIS_VALKEY');

  const language = inferLanguageBuckets(input.targetFiles);
  const kinds = inferKindBuckets(input.queryText);
  const features = significantTokens(input.queryText, params?.maxWarmBuckets ?? 0);
  const canonicalKeys = [
    bifrostKey.query(input.queryText),
    ...input.targetFiles.map((file) => bifrostKey.source(file)),
    ...features.map((feature) => bifrostKey.feature(feature)),
  ].slice(0, params?.maxWarmBuckets ?? 0);

  return AgenticRepairProposedActionV1Schema.parse({
    kind: 'BITFROST_BUCKET_WARM',
    trigger: Boolean(params && bifrost?.reachable && valkey?.reachable && canonicalKeys.length > 0),
    owner: 'bifrostKey + Redis/Valkey cache owner',
    reasonCodes: [
      'USES_CANONICAL_BIFROST_NAMESPACE_NOT_LEGACY_BITFROST_HOT_PREFIX',
      valkey?.reachable ? 'REDIS_VALKEY_REACHABLE' : 'REDIS_VALKEY_NOT_PROVEN_REACHABLE',
      bifrost?.reachable ? 'BITFROST_REACHABLE' : 'BITFROST_NOT_PROVEN_REACHABLE',
    ],
    parameters: {
      canonicalKeys,
      languageBuckets: language,
      kindBuckets: kinds,
      featureBuckets: features,
      cacheTtlSeconds: params?.cacheTtlSeconds ?? TTL.BIFROST_QUERY,
      storageBackend: 'REDIS_VALKEY',
    },
    sideEffectsAuthorized: false,
  });
}

function inferCentroidAction(
  input: AgenticRepairReadinessInputV1,
  rows: readonly RankedAgenticRepairLibraryV1[],
): AgenticRepairProposedActionV1 {
  const centroid = rows.find((row) => row.library === 'CENTROID_CACHE');
  const qdrant = rows.find((row) => row.library === 'QDRANT');
  const params = input.fetchPlans.find((row) => row.library === 'CENTROID_CACHE');
  const cacheMetric = centroid?.metrics.find((metric) => metric.name === 'cacheHits')?.percent ?? 0;
  const shouldSynthesize = Boolean(params && centroid?.reachable && qdrant?.reachable && cacheMetric < 100);
  const trigger = Boolean(params && centroid?.reachable);

  return AgenticRepairProposedActionV1Schema.parse({
    kind: shouldSynthesize ? 'CENTROID_SYNTHESIS' : 'CENTROID_LOOKUP',
    trigger,
    owner: 'sveltekit-frontend/src/lib/server/retrieval/centroid-cache.ts',
    reasonCodes: [
      shouldSynthesize ? 'CENTROID_CACHE_NOT_FULLY_WARM_AND_QDRANT_AVAILABLE' : 'USE_EXISTING_CENTROID_CACHE_FIRST',
      centroid?.reachable ? 'CENTROID_CACHE_REACHABLE' : 'CENTROID_CACHE_NOT_PROVEN_REACHABLE',
    ],
    parameters: {
      candidateLimit: params?.centroidCandidateLimit ?? 0,
      topK: params?.topK ?? 0,
      cacheTtlSeconds: params?.cacheTtlSeconds ?? TTL.CENTROID,
      queryHash: hashStr(input.queryText).slice(0, 16),
    },
    sideEffectsAuthorized: false,
  });
}

function buildGroupMeans(rows: readonly RankedAgenticRepairLibraryV1[]): AgenticRepairGroupMeanV1[] {
  const grouped = new Map<AgenticRepairGroupMeanV1['group'], RankedAgenticRepairLibraryV1[]>();
  for (const row of rows) {
    const group = GROUP_BY_LIBRARY[row.library];
    const list = grouped.get(group) ?? [];
    list.push(row);
    grouped.set(group, list);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, members]) => AgenticRepairGroupMeanV1Schema.parse({
      group,
      meanPercent: arithmeticMean(members.map((member) => member.meanPercent)),
      libraries: members.map((member) => member.library).sort(),
    }));
}

function decideGate(
  rows: readonly RankedAgenticRepairLibraryV1[],
  policy: AgenticRepairGatePolicyV1,
  overallMeanPercent: number,
): { gate: AgenticRepairReadinessResultV1['gate']; blockers: string[] } {
  const byLibrary = new Map(rows.map((row) => [row.library, row]));
  const blockers: string[] = [];

  for (const required of policy.requiredLibraries) {
    const row = byLibrary.get(required);
    if (!row) {
      blockers.push(`MISSING_REQUIRED_LIBRARY:${required}`);
      continue;
    }
    if (!row.reachable) blockers.push(`REQUIRED_LIBRARY_UNREACHABLE:${required}`);
    if (row.meanPercent < policy.minRequiredLibraryMeanPercent) {
      blockers.push(`REQUIRED_LIBRARY_MEAN_BELOW_THRESHOLD:${required}:${row.meanPercent}`);
    }
    if (row.sourceRefCount < policy.minSourceRefsPerRequiredLibrary) {
      blockers.push(`REQUIRED_LIBRARY_SOURCE_REFS_BELOW_THRESHOLD:${required}:${row.sourceRefCount}`);
    }
  }

  if (blockers.length === 0 && overallMeanPercent >= policy.minOverallMeanPercent) {
    return { gate: 'READY', blockers };
  }
  if (overallMeanPercent >= policy.minDegradedOverallMeanPercent) {
    return { gate: 'DEGRADED', blockers };
  }
  if (overallMeanPercent < policy.minDegradedOverallMeanPercent) {
    blockers.push(`OVERALL_MEAN_BELOW_DEGRADED_THRESHOLD:${overallMeanPercent}`);
  }
  return { gate: 'BLOCKED', blockers };
}

export async function rankAgenticRepairReadiness(
  value: AgenticRepairReadinessInputV1,
  lookup: AgenticRepairLibraryLookup,
): Promise<AgenticRepairReadinessResultV1> {
  const input = AgenticRepairReadinessInputV1Schema.parse(value);

  const observations = await Promise.all(input.fetchPlans.map(async (parameters) => {
    const request = AgenticRepairLibraryLookupRequestV1Schema.parse({
      schema: 'atlas.agentic-repair-library-lookup-request.v1',
      requestId: input.requestId,
      queryText: input.queryText,
      targetFiles: input.targetFiles,
      workspaceRevision: input.workspaceRevision,
      sourceRevision: input.sourceRevision,
      parameters,
      producerRevision: input.producerRevision,
    });
    const observation = AgenticRepairLibraryLookupObservationV1Schema.parse(await lookup(request));
    if (observation.library !== parameters.library) {
      throw new Error(`LIBRARY_LOOKUP_MISMATCH:${parameters.library}:${observation.library}`);
    }
    return { observation, parameters };
  }));

  const rankedLibraries = rankRows(observations.map(({ observation, parameters }) => libraryRow(observation, parameters)));
  const groupMeans = buildGroupMeans(rankedLibraries);
  const overallMeanPercent = arithmeticMean(rankedLibraries.map((row) => row.meanPercent));
  const { gate, blockers } = decideGate(rankedLibraries, input.gatePolicy, overallMeanPercent);

  const actions = [
    inferGraphExpansionAction(input, rankedLibraries),
    inferAceContextAction(input, rankedLibraries),
    inferBitfrostWarmAction(input, rankedLibraries),
    inferCentroidAction(input, rankedLibraries),
  ];

  return AgenticRepairReadinessResultV1Schema.parse({
    schema: 'atlas.agentic-repair-readiness-result.v1',
    requestId: input.requestId,
    queryHash: hashStr(input.queryText).slice(0, 16),
    rankedLibraries,
    groupMeans,
    overallMeanPercent,
    gate,
    nextGate: gate === 'BLOCKED' ? 'LIBRARY_ALIGNMENT_REPAIR' : 'AGENTIC_ERROR_FIXING_EVIDENCE',
    blockers,
    actions,
    percentagesAreArithmeticMeans: true,
    rankingDeterministic: true,
    exactPromotionRequired: true,
    canonicalWritesAllowed: false,
    producerRevision: input.producerRevision,
  });
}

export const agenticRepairInference = {
  graphExpansion: inferGraphExpansionAction,
  aceContext: inferAceContextAction,
  bitfrostWarm: inferBitfrostWarmAction,
  centroid: inferCentroidAction,
} as const;
