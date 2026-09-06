import { createHash } from 'node:crypto';
import { z } from 'zod';

import { QueryClassificationV2Schema, type QueryClassificationV2 } from './query-classification-v2.js';

const id = z.string().min(1);

/**
 * Query scope references an existing taxonomy. It is not a taxonomy owner and
 * contains no model/provider configuration.
 */
export const QueryTaxonomyScopeV1Schema = z.object({
  schema: z.literal('atlas.query-taxonomy-scope.v1'),
  taxonomyRevision: id,
  domainIds: z.array(id).default([]),
  topicIds: z.array(id).default([]),
  featureIds: z.array(id).default([]),
  evidenceRefs: z.array(id).default([]),
}).strict();
export type QueryTaxonomyScopeV1 = z.infer<typeof QueryTaxonomyScopeV1Schema>;

export const REDUCTION_ROUTER_KINDS = [
  'EXACT_FILTER',
  'REVISION_FILTER',
  'DOMAIN_FILTER',
  'FEATURE_FILTER',
  'TAXONOMY_FILTER',
  'KNN',
  'GRAPH_EGO',
  'HYPEREDGE_EXPANSION',
  'FEATURE_CARD',
  'TOPIC_CARD',
  'SOURCE_SPAN',
] as const;
export type ReductionRouterKindV1 = typeof REDUCTION_ROUTER_KINDS[number];

const reductionStepSchema = z.object({
  kind: z.enum(REDUCTION_ROUTER_KINDS),
  inputPopulation: id,
  outputPopulation: id,
  maxItems: z.number().int().positive(),
  tokenBudget: z.number().int().nonnegative(),
  prerequisiteRefs: z.array(id),
  deterministic: z.literal(true),
  canonicalAuthority: z.literal(false),
  retrievalVoteAdded: z.literal(false),
}).strict();
export type ReductionRouterStepV1 = z.infer<typeof reductionStepSchema>;

export const ReductionRouterPlanV1Schema = z.object({
  schema: z.literal('atlas.reduction-router-plan.v1'),
  requestId: id,
  workspaceRevision: id,
  classificationRevision: id,
  taxonomyRevision: id,
  reductionPolicyRevision: id,
  semanticRepresentation: z.literal('semantic_768'),
  steps: z.array(reductionStepSchema).min(1),
  candidateBudget: z.number().int().positive(),
  graphHopBudget: z.number().int().min(0).max(8),
  tokenBudget: z.number().int().positive(),
  exactPromotionRequired: z.literal(true),
  canonicalWritesAllowed: z.literal(false),
  retrievalVoteAdded: z.literal(false),
  deferredKinds: z.array(z.literal('RANDOM_FOREST')),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type ReductionRouterPlanV1 = z.infer<typeof ReductionRouterPlanV1Schema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function checksum(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

function step(input: Omit<ReductionRouterStepV1, 'deterministic' | 'canonicalAuthority' | 'retrievalVoteAdded'>): ReductionRouterStepV1 {
  return reductionStepSchema.parse({
    ...input,
    deterministic: true,
    canonicalAuthority: false,
    retrievalVoteAdded: false,
  });
}

/**
 * Compile only bounded reduction choices. The function references existing
 * SearchRuntime/QAS/graph/ACE consumers; it never executes retrieval, calls a
 * model, writes a store, or turns an executor into a logical retrieval lane.
 */
export function compileReductionRouterPlanV1(input: {
  classification: QueryClassificationV2;
  taxonomyScope?: QueryTaxonomyScopeV1;
  reductionPolicyRevision?: string;
  tokenBudget?: number;
  graphSnapshotAvailable?: boolean;
}): ReductionRouterPlanV1 {
  const classification = QueryClassificationV2Schema.parse(input.classification);
  const scope = QueryTaxonomyScopeV1Schema.parse(input.taxonomyScope ?? {
    schema: 'atlas.query-taxonomy-scope.v1',
    taxonomyRevision: 'taxonomy-scope:none',
    domainIds: [],
    topicIds: [],
    featureIds: [],
    evidenceRefs: [],
  });
  const candidateBudget = classification.expectedDepth.candidateBudget;
  const graphHopBudget = classification.retrievalNeed.graph >= 0.5
    ? classification.expectedDepth.graphHops
    : 0;
  const tokenBudget = input.tokenBudget ?? Math.max(256, candidateBudget * 8);
  if (!Number.isInteger(tokenBudget) || tokenBudget <= 0) throw new Error('REDUCTION_TOKEN_BUDGET_INVALID');

  const steps: ReductionRouterStepV1[] = [
    step({
      kind: 'EXACT_FILTER',
      inputPopulation: 'AUTHORITATIVE_CANDIDATE_UNIVERSE',
      outputPopulation: 'REVISION_QUALIFIED_CANDIDATES',
      maxItems: candidateBudget,
      tokenBudget: 0,
      prerequisiteRefs: ['sourceRevision', 'canonicalCandidateId'],
    }),
  ];
  if (scope.domainIds.length > 0) {
    steps.push(step({
      kind: 'DOMAIN_FILTER',
      inputPopulation: 'REVISION_QUALIFIED_CANDIDATES',
      outputPopulation: 'DOMAIN_SCOPED_CANDIDATES',
      maxItems: candidateBudget,
      tokenBudget: 0,
      prerequisiteRefs: scope.domainIds,
    }));
  }
  if (scope.featureIds.length > 0) {
    steps.push(step({
      kind: 'FEATURE_FILTER',
      inputPopulation: steps.at(-1)!.outputPopulation,
      outputPopulation: 'FEATURE_SCOPED_CANDIDATES',
      maxItems: candidateBudget,
      tokenBudget: 0,
      prerequisiteRefs: scope.featureIds,
    }));
  }
  if (scope.topicIds.length > 0) {
    steps.push(step({
      kind: 'TAXONOMY_FILTER',
      inputPopulation: steps.at(-1)!.outputPopulation,
      outputPopulation: 'TOPIC_SCOPED_CANDIDATES',
      maxItems: candidateBudget,
      tokenBudget: 0,
      prerequisiteRefs: [...scope.topicIds, scope.taxonomyRevision],
    }));
  }
  if (classification.retrievalNeed.semantic >= 0.5 || classification.abstained) {
    steps.push(step({
      kind: 'KNN',
      inputPopulation: steps.at(-1)!.outputPopulation,
      outputPopulation: 'SEMANTIC_768_SHORTLIST',
      maxItems: candidateBudget,
      tokenBudget: Math.min(tokenBudget, candidateBudget * 2),
      prerequisiteRefs: ['semantic_768', 'SearchRuntime'],
    }));
  }
  if (graphHopBudget > 0 && input.graphSnapshotAvailable === true) {
    steps.push(step({
      kind: 'GRAPH_EGO',
      inputPopulation: steps.at(-1)!.outputPopulation,
      outputPopulation: 'GRAPH_SCOPED_CANDIDATES',
      maxItems: candidateBudget,
      tokenBudget: Math.min(tokenBudget, candidateBudget * 2),
      prerequisiteRefs: ['GraphSnapshotV1', 'GraphOrdinalMapV1'],
    }));
    if (scope.topicIds.length > 0 || scope.featureIds.length > 0) {
      steps.push(step({
        kind: 'HYPEREDGE_EXPANSION',
        inputPopulation: steps.at(-1)!.outputPopulation,
        outputPopulation: 'HYPEREDGE_SCOPED_CANDIDATES',
        maxItems: candidateBudget,
        tokenBudget: Math.min(tokenBudget, candidateBudget * 2),
        prerequisiteRefs: ['OntologyLinkedTupleV1', 'HyperedgeV1'],
      }));
    }
  }
  steps.push(step({
    kind: classification.retrievalNeed.exactSymbol >= 0.7 ? 'SOURCE_SPAN' : scope.topicIds.length > 0 ? 'TOPIC_CARD' : 'FEATURE_CARD',
    inputPopulation: steps.at(-1)!.outputPopulation,
    outputPopulation: 'ACE_CONTEXT_CANDIDATES',
    maxItems: candidateBudget,
    tokenBudget,
    prerequisiteRefs: ['exactPromotion', 'ContextManifestV2'],
  }));

  const body = {
    schema: 'atlas.reduction-router-plan.v1' as const,
    requestId: classification.requestId,
    workspaceRevision: classification.workspaceRevision,
    classificationRevision: classification.classificationRevision,
    taxonomyRevision: scope.taxonomyRevision,
    reductionPolicyRevision: input.reductionPolicyRevision ?? 'reduction-policy:v1',
    semanticRepresentation: 'semantic_768' as const,
    steps,
    candidateBudget,
    graphHopBudget,
    tokenBudget,
    exactPromotionRequired: true as const,
    canonicalWritesAllowed: false as const,
    retrievalVoteAdded: false as const,
    deferredKinds: ['RANDOM_FOREST'] as const,
  };
  return ReductionRouterPlanV1Schema.parse({ ...body, checksum: checksum(body) });
}
