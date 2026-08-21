import { z } from 'zod';
import type { QueryAdaptiveFeatureRowV1 } from '../retrieval/query-adaptive-feature-compiler.js';

const Unit = z.number().finite().min(0).max(1);
const Score100 = z.number().finite().min(0).max(100);
const S = z.string().min(1);

export const RankProfileKindSchema = z.enum([
  'SYMBOL_QUERY',
  'CONCEPT_QUERY',
  'FAILURE_QUERY',
  'GRAPH_QUERY',
  'DEFAULT',
]);
export type RankProfileKind = z.infer<typeof RankProfileKindSchema>;

export const RankProfileV1Schema = z.object({
  schema: z.literal('atlas.rank-profile.v1'),
  kind: RankProfileKindSchema,
  semanticWeight: Unit,
  lexicalWeight: Unit,
  astWeight: Unit,
  graphWeight: Unit,
  domainWeight: Unit,
  executionWeight: Unit,
  evidenceWeight: Unit,
  globalAuthorityWeight: Unit,
  queryAuthorityWeight: Unit,
}).strict();
export type RankProfileV1 = z.infer<typeof RankProfileV1Schema>;

export const GraphAuthoritySignalsV1Schema = z.object({
  globalPageRank: z.number().finite().nonnegative().nullable(),
  pageRankPercentile: Unit.nullable(),
  personalizedPageRank: z.number().finite().nonnegative().nullable(),
  pprPercentile: Unit.nullable(),
  communityAffinity: Unit.nullable(),
  pathAffinity: Unit.nullable(),
}).strict();
export type GraphAuthoritySignalsV1 = z.infer<typeof GraphAuthoritySignalsV1Schema>;

export const ImportanceRankInputV1Schema = z.object({
  schema: z.literal('atlas.importance-rank-input.v1'),
  requestId: S,
  canonicalId: S,
  ordinal: z.number().int().nonnegative(),
  workspaceRevision: S,
  graphRevision: S,
  featureRevision: S,
  features: z.object({
    semanticRelevance: Unit,
    lexicalRelevance: Unit,
    astAffinity: Unit,
    graphAuthority: Unit,
    domainAffinity: Unit,
    executionUtility: Unit,
    evidenceStrength: Unit,
  }).strict(),
  graphSignals: GraphAuthoritySignalsV1Schema,
  profile: RankProfileV1Schema,
}).strict();
export type ImportanceRankInputV1 = z.infer<typeof ImportanceRankInputV1Schema>;

export const ImportanceRankResultV1Schema = z.object({
  schema: z.literal('atlas.importance-rank-result.v1'),
  requestId: S,
  canonicalId: S,
  ordinal: z.number().int().nonnegative(),
  relevanceScore: Score100,
  importanceScore: Score100,
  supportScore: Score100,
  priorityScore: Score100,
  components: z.object({
    semanticContribution: z.number().finite().min(0).max(100),
    lexicalContribution: z.number().finite().min(0).max(100),
    astContribution: z.number().finite().min(0).max(100),
    graphContribution: z.number().finite().min(0).max(100),
    domainContribution: z.number().finite().min(0).max(100),
    executionContribution: z.number().finite().min(0).max(100),
    evidenceContribution: z.number().finite().min(0).max(100),
  }).strict(),
  rank: z.number().int().positive().nullable(),
  rankerRevision: S,
  featureRevision: S,
  graphRevision: S,
}).strict();
export type ImportanceRankResultV1 = z.infer<typeof ImportanceRankResultV1Schema>;

export const IMPORTANCE_RANKER_REVISION = 'importance-ranker-v1.0.0';

const PROFILES: Record<RankProfileKind, Omit<RankProfileV1, 'schema' | 'kind'>> = {
  SYMBOL_QUERY: {
    semanticWeight: 0.15,
    lexicalWeight: 0.30,
    astWeight: 0.30,
    graphWeight: 0.15,
    domainWeight: 0.05,
    executionWeight: 0.05,
    evidenceWeight: 0.15,
    globalAuthorityWeight: 0.35,
    queryAuthorityWeight: 0.65,
  },
  CONCEPT_QUERY: {
    semanticWeight: 0.45,
    lexicalWeight: 0.10,
    astWeight: 0.10,
    graphWeight: 0.15,
    domainWeight: 0.15,
    executionWeight: 0.05,
    evidenceWeight: 0.15,
    globalAuthorityWeight: 0.35,
    queryAuthorityWeight: 0.65,
  },
  FAILURE_QUERY: {
    semanticWeight: 0.20,
    lexicalWeight: 0.20,
    astWeight: 0.20,
    graphWeight: 0.10,
    domainWeight: 0.05,
    executionWeight: 0.25,
    evidenceWeight: 0.25,
    globalAuthorityWeight: 0.25,
    queryAuthorityWeight: 0.75,
  },
  GRAPH_QUERY: {
    semanticWeight: 0.20,
    lexicalWeight: 0.10,
    astWeight: 0.15,
    graphWeight: 0.40,
    domainWeight: 0.10,
    executionWeight: 0.05,
    evidenceWeight: 0.15,
    globalAuthorityWeight: 0.40,
    queryAuthorityWeight: 0.60,
  },
  DEFAULT: {
    semanticWeight: 0.30,
    lexicalWeight: 0.15,
    astWeight: 0.15,
    graphWeight: 0.15,
    domainWeight: 0.10,
    executionWeight: 0.15,
    evidenceWeight: 0.15,
    globalAuthorityWeight: 0.35,
    queryAuthorityWeight: 0.65,
  },
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function roundScore(value: number): number {
  return Number((Math.max(0, Math.min(1, value)) * 100).toFixed(4));
}

function normalizedWeightedAverage(values: Array<[number, number]>): number {
  const totalWeight = values.reduce((sum, [, weight]) => sum + weight, 0);
  if (totalWeight <= 0) return 0;
  return values.reduce((sum, [value, weight]) => sum + clamp01(value) * weight, 0) / totalWeight;
}

export function deriveRankProfile(taskKindOrQuery: string): RankProfileV1 {
  const text = taskKindOrQuery.toLowerCase();
  let kind: RankProfileKind = 'DEFAULT';
  if (/fail|error|repair|fix|compile|runtime|exception|test/.test(text)) kind = 'FAILURE_QUERY';
  else if (/symbol|function|method|class|identifier|definition|caller|callee/.test(text)) kind = 'SYMBOL_QUERY';
  else if (/pagerank|ppr|community|graph|dependency|centrality/.test(text)) kind = 'GRAPH_QUERY';
  else if (/concept|architecture|explain|compare|overview|domain/.test(text)) kind = 'CONCEPT_QUERY';
  return RankProfileV1Schema.parse({ schema: 'atlas.rank-profile.v1', kind, ...PROFILES[kind] });
}

export function deriveGraphAuthority(signals: GraphAuthoritySignalsV1, profile: RankProfileV1, fallback: number): number {
  const globalAuthority = signals.pageRankPercentile ?? fallback;
  const queryAuthority = signals.pprPercentile ?? signals.communityAffinity ?? fallback;
  const path = signals.pathAffinity ?? 0;
  const authority = normalizedWeightedAverage([
    [globalAuthority, profile.globalAuthorityWeight],
    [queryAuthority, profile.queryAuthorityWeight],
    [path, 0.15],
  ]);
  return clamp01(authority);
}

export function rankImportance(input: ImportanceRankInputV1): ImportanceRankResultV1 {
  const value = ImportanceRankInputV1Schema.parse(input);
  const { features, profile } = value;
  const graphAuthority = deriveGraphAuthority(value.graphSignals, profile, features.graphAuthority);

  const relevance = normalizedWeightedAverage([
    [features.semanticRelevance, profile.semanticWeight],
    [features.lexicalRelevance, profile.lexicalWeight],
    [features.astAffinity, profile.astWeight],
    [features.domainAffinity, profile.domainWeight],
  ]);

  const importance = graphAuthority;
  const support = normalizedWeightedAverage([
    [features.executionUtility, profile.executionWeight],
    [features.evidenceStrength, profile.evidenceWeight],
  ]);

  // Relevance is deliberately a multiplicative gate. A globally central but
  // query-irrelevant node cannot dominate merely because PageRank is large.
  const priority = clamp01(relevance * (0.65 + 0.25 * importance + 0.10 * support));

  const relevanceWeightTotal = profile.semanticWeight + profile.lexicalWeight + profile.astWeight + profile.domainWeight || 1;
  const supportWeightTotal = profile.executionWeight + profile.evidenceWeight || 1;

  return ImportanceRankResultV1Schema.parse({
    schema: 'atlas.importance-rank-result.v1',
    requestId: value.requestId,
    canonicalId: value.canonicalId,
    ordinal: value.ordinal,
    relevanceScore: roundScore(relevance),
    importanceScore: roundScore(importance),
    supportScore: roundScore(support),
    priorityScore: roundScore(priority),
    components: {
      semanticContribution: roundScore(features.semanticRelevance * profile.semanticWeight / relevanceWeightTotal),
      lexicalContribution: roundScore(features.lexicalRelevance * profile.lexicalWeight / relevanceWeightTotal),
      astContribution: roundScore(features.astAffinity * profile.astWeight / relevanceWeightTotal),
      graphContribution: roundScore(importance),
      domainContribution: roundScore(features.domainAffinity * profile.domainWeight / relevanceWeightTotal),
      executionContribution: roundScore(features.executionUtility * profile.executionWeight / supportWeightTotal),
      evidenceContribution: roundScore(features.evidenceStrength * profile.evidenceWeight / supportWeightTotal),
    },
    rank: null,
    rankerRevision: IMPORTANCE_RANKER_REVISION,
    featureRevision: value.featureRevision,
    graphRevision: value.graphRevision,
  });
}

export function rankImportanceBatch(inputs: ImportanceRankInputV1[]): ImportanceRankResultV1[] {
  const rows = inputs.map(rankImportance);
  rows.sort((a, b) => b.priorityScore - a.priorityScore || b.relevanceScore - a.relevanceScore || a.canonicalId.localeCompare(b.canonicalId));
  return rows.map((row, index) => ImportanceRankResultV1Schema.parse({ ...row, rank: index + 1 }));
}

export function adaptQasRowToImportanceRankInput(input: {
  row: QueryAdaptiveFeatureRowV1;
  ordinal: number;
  graphSignals?: Partial<GraphAuthoritySignalsV1>;
  evidenceStrength?: number;
  profile?: RankProfileV1;
}): ImportanceRankInputV1 {
  const profile = input.profile ?? deriveRankProfile(input.row.taskKind);
  return ImportanceRankInputV1Schema.parse({
    schema: 'atlas.importance-rank-input.v1',
    requestId: input.row.requestId,
    canonicalId: input.row.canonicalId,
    ordinal: input.ordinal,
    workspaceRevision: input.row.workspaceRevision,
    graphRevision: input.row.graphRevision,
    featureRevision: input.row.featureRevision,
    features: {
      semanticRelevance: input.row.features.semanticAffinity,
      lexicalRelevance: input.row.features.lexicalAffinity,
      astAffinity: input.row.features.astAffinity,
      graphAuthority: input.row.features.graphAuthority,
      domainAffinity: input.row.features.domainAffinity,
      executionUtility: input.row.features.priorExecutionSuccess,
      evidenceStrength: clamp01(input.evidenceStrength ?? Math.min(1, input.row.evidenceRefs.length / 4)),
    },
    graphSignals: {
      globalPageRank: input.graphSignals?.globalPageRank ?? null,
      pageRankPercentile: input.graphSignals?.pageRankPercentile ?? null,
      personalizedPageRank: input.graphSignals?.personalizedPageRank ?? null,
      pprPercentile: input.graphSignals?.pprPercentile ?? null,
      communityAffinity: input.graphSignals?.communityAffinity ?? null,
      pathAffinity: input.graphSignals?.pathAffinity ?? null,
    },
    profile,
  });
}
