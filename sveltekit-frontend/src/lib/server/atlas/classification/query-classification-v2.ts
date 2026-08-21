import { z } from 'zod';

const ProbabilitySchema = z.number().finite().min(0).max(1);

export const QueryOperationV2Schema = z.enum([
  'find',
  'explain',
  'debug',
  'modify',
  'compare',
  'trace',
  'test',
  'synthesize',
  'unknown',
]);
export type QueryOperationV2 = z.infer<typeof QueryOperationV2Schema>;

export const SparseStrategyV1Schema = z.enum([
  'none',
  'postgres_fts',
  'qdrant_bm25',
  'minicoil_challenger',
  'splade_challenger',
]);
export type SparseStrategyV1 = z.infer<typeof SparseStrategyV1Schema>;

const LabelProbabilitySchema = z.object({
  label: z.string().min(1),
  probability: ProbabilitySchema,
}).strict();

export const QueryClassificationV2Schema = z.object({
  schema: z.literal('atlas.query-classification.v2'),
  requestId: z.string().min(1),
  workspaceRevision: z.string().min(1),
  classificationRevision: z.string().min(1),
  routerFeatureRevision: z.string().min(1),
  classifierModelRevision: z.string().min(1),
  calibrationRevision: z.string().min(1),
  domain: z.array(LabelProbabilitySchema).min(1),
  operation: z.array(z.object({
    operation: QueryOperationV2Schema,
    probability: ProbabilitySchema,
  }).strict()).min(1),
  structuralIntent: z.object({
    function: ProbabilitySchema,
    call: ProbabilitySchema,
    symbol: ProbabilitySchema,
    type: ProbabilitySchema,
    route: ProbabilitySchema,
    databaseCall: ProbabilitySchema,
    config: ProbabilitySchema,
  }).strict(),
  retrievalNeed: z.object({
    lexical: ProbabilitySchema,
    semantic: ProbabilitySchema,
    ast: ProbabilitySchema,
    graph: ProbabilitySchema,
    exactSymbol: ProbabilitySchema,
  }).strict(),
  expectedDepth: z.object({
    graphHops: z.number().int().min(0).max(8),
    candidateBudget: z.number().int().positive().max(4096),
    rerankBudget: z.number().int().nonnegative().max(512),
  }).strict(),
  confidence: ProbabilitySchema,
  entropy: z.number().finite().min(0),
  abstained: z.boolean(),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  canonicalWritesAllowed: z.literal(false),
  retrievalVoteAdded: z.literal(false),
}).strict();
export type QueryClassificationV2 = z.infer<typeof QueryClassificationV2Schema>;

export const RetrievalPlanV1Schema = z.object({
  schema: z.literal('atlas.retrieval-plan.v1'),
  requestId: z.string().min(1),
  classificationRevision: z.string().min(1),
  lexicalEnabled: z.boolean(),
  semanticEnabled: z.boolean(),
  astEnabled: z.boolean(),
  graphEnabled: z.boolean(),
  exactSymbolPreferred: z.boolean(),
  sparseStrategy: SparseStrategyV1Schema,
  semanticTopK: z.number().int().positive().max(4096),
  graphHops: z.number().int().min(0).max(8),
  rerankTopK: z.number().int().nonnegative().max(512),
  exactPromotionRequired: z.literal(true),
  contextManifestRequired: z.literal(true),
  canonicalWritesAllowed: z.literal(false),
  retrievalVoteAdded: z.literal(false),
  reasons: z.array(z.string().min(1)).default([]),
}).strict();
export type RetrievalPlanV1 = z.infer<typeof RetrievalPlanV1Schema>;

function topProbability(rows: readonly { probability: number }[]): number {
  return rows.reduce((best, row) => Math.max(best, row.probability), 0);
}

export function compileRetrievalPlanV1(classification: QueryClassificationV2): RetrievalPlanV1 {
  const c = QueryClassificationV2Schema.parse(classification);
  const threshold = c.abstained ? 0.35 : 0.5;
  const exactSymbolPreferred = c.retrievalNeed.exactSymbol >= 0.7;
  const lexicalEnabled = c.retrievalNeed.lexical >= threshold || exactSymbolPreferred;
  const semanticEnabled = c.retrievalNeed.semantic >= threshold || c.abstained;
  const astEnabled = c.retrievalNeed.ast >= threshold || c.structuralIntent.symbol >= 0.7 || c.structuralIntent.call >= 0.7;
  const graphEnabled = c.retrievalNeed.graph >= threshold && c.expectedDepth.graphHops > 0;

  let sparseStrategy: SparseStrategyV1 = 'none';
  if (lexicalEnabled) {
    if (exactSymbolPreferred) sparseStrategy = 'postgres_fts';
    else if (c.retrievalNeed.lexical >= 0.8 && c.retrievalNeed.semantic >= 0.55) sparseStrategy = 'minicoil_challenger';
    else sparseStrategy = 'postgres_fts';
  }

  const semanticTopK = semanticEnabled
    ? Math.max(16, Math.min(4096, c.expectedDepth.candidateBudget))
    : 16;
  const rerankTopK = Math.min(c.expectedDepth.rerankBudget, semanticTopK);
  const reasons = [
    `confidence=${c.confidence.toFixed(3)}`,
    `lexical=${c.retrievalNeed.lexical.toFixed(3)}`,
    `semantic=${c.retrievalNeed.semantic.toFixed(3)}`,
    `ast=${c.retrievalNeed.ast.toFixed(3)}`,
    `graph=${c.retrievalNeed.graph.toFixed(3)}`,
    `operationTop=${topProbability(c.operation).toFixed(3)}`,
  ];
  if (c.abstained) reasons.push('classifier_abstained_broaden_recall');

  return RetrievalPlanV1Schema.parse({
    schema: 'atlas.retrieval-plan.v1',
    requestId: c.requestId,
    classificationRevision: c.classificationRevision,
    lexicalEnabled,
    semanticEnabled,
    astEnabled,
    graphEnabled,
    exactSymbolPreferred,
    sparseStrategy,
    semanticTopK,
    graphHops: graphEnabled ? c.expectedDepth.graphHops : 0,
    rerankTopK,
    exactPromotionRequired: true,
    contextManifestRequired: true,
    canonicalWritesAllowed: false,
    retrievalVoteAdded: false,
    reasons,
  });
}
