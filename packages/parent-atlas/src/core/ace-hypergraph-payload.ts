import { z } from 'zod';
import {
  reasoningChainSchema,
  sufficientContextDecisionSchema,
  type ReasoningChainV1,
  type SufficientContextDecisionV1,
} from './hypergraph-retrieval.js';
import { relationshipParticipantSchema } from './feature-intelligence.js';

const canonicalIdSchema = z.string().min(1);
const revisionSchema = z.string().min(1);
const normalizedScoreSchema = z.number().finite().min(0).max(1);

export const aceRelationshipEvidenceSchema = z.object({
  relationship_id: canonicalIdSchema,
  relationship_revision: revisionSchema,
  relationship_type: z.string().min(1),
  relationship_degree: z.number().int().positive(),
  participants: z.array(relationshipParticipantSchema).min(1),
  hop: z.number().int().min(0).max(2),
  evidence_refs: z.array(canonicalIdSchema).default([]),
  semantic_score: normalizedScoreSchema.optional(),
  ppr_score: normalizedScoreSchema.optional(),
  pagerank: z.number().finite().nonnegative().optional(),
  confidence: normalizedScoreSchema,
  persistence: z.enum(['canonical', 'dynamic']),
}).strict();

export const aceHypergraphLineageSchema = z.object({
  source_snapshot_revision: revisionSchema,
  relationship_projection_revision: revisionSchema.nullable().optional(),
  graph_snapshot_revision: revisionSchema.nullable().optional(),
  semantic_projection_revision: revisionSchema.nullable().optional(),
  semantic_model_revision: revisionSchema.nullable().optional(),
  feature_matrix_revision: revisionSchema.nullable().optional(),
  producer_revision: revisionSchema,
}).strict();

export const aceHypergraphPayloadSchema = z.object({
  schema: z.literal('atlas.ace-hypergraph-payload.v1').default('atlas.ace-hypergraph-payload.v1'),
  query_id: canonicalIdSchema,
  packet_key: canonicalIdSchema,
  source_ref: z.string().min(1),
  feature_id: canonicalIdSchema.nullable().optional(),
  relationship_evidence: z.array(aceRelationshipEvidenceSchema).default([]),
  reasoning_chain: reasoningChainSchema,
  sufficient_context: sufficientContextDecisionSchema,
  lineage: aceHypergraphLineageSchema,
  retrieval: z.object({
    semantic_lane_votes: z.literal(1).default(1),
    semantic_executors: z.array(z.string().min(1)).default([]),
    relationship_candidate_count: z.number().int().nonnegative(),
    evidence_candidate_count: z.number().int().nonnegative(),
    graph_hops_executed: z.number().int().min(0).max(2),
    fanout_limit: z.number().int().positive(),
  }).strict(),
  derived_ranking_signals: z.object({
    pagerank: z.number().finite().nonnegative().optional(),
    ppr: normalizedScoreSchema.optional(),
    turbovec: normalizedScoreSchema.optional(),
    low_rank: normalizedScoreSchema.optional(),
    manifold: normalizedScoreSchema.optional(),
    reranker: normalizedScoreSchema.optional(),
  }).default({}),
}).strict().superRefine((value, ctx) => {
  if (value.reasoning_chain.query_id !== value.query_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'reasoning_chain.query_id must match payload query_id',
      path: ['reasoning_chain', 'query_id'],
    });
  }
  if (value.sufficient_context.query_id !== value.query_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'sufficient_context.query_id must match payload query_id',
      path: ['sufficient_context', 'query_id'],
    });
  }
  if (value.retrieval.graph_hops_executed > value.reasoning_chain.maximum_hop_count) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'graph_hops_executed cannot exceed reasoning chain maximum_hop_count',
      path: ['retrieval', 'graph_hops_executed'],
    });
  }
  if (value.sufficient_context.sufficient && value.sufficient_context.next_action !== 'synthesize') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'sufficient context must route to synthesize',
      path: ['sufficient_context', 'next_action'],
    });
  }
}).strict();

export type AceRelationshipEvidenceV1 = z.infer<typeof aceRelationshipEvidenceSchema>;
export type AceHypergraphLineageV1 = z.infer<typeof aceHypergraphLineageSchema>;
export type AceHypergraphPayloadV1 = z.infer<typeof aceHypergraphPayloadSchema>;

export type BuildAceHypergraphPayloadInput = Omit<
  z.input<typeof aceHypergraphPayloadSchema>,
  'schema' | 'reasoning_chain' | 'sufficient_context'
> & {
  reasoning_chain: ReasoningChainV1;
  sufficient_context: SufficientContextDecisionV1;
};

export function buildAceHypergraphPayload(input: BuildAceHypergraphPayloadInput): AceHypergraphPayloadV1 {
  return aceHypergraphPayloadSchema.parse({
    schema: 'atlas.ace-hypergraph-payload.v1',
    ...input,
  });
}

export function describeAceHypergraphPayloadContract(): string {
  return [
    'ACE receives canonical relationship IDs, typed participant roles, evidence references, and a bounded reasoning chain.',
    'Neighbor IDs alone are not explanatory evidence.',
    'Semantic executors share one logical vote.',
    'Projection and model revisions are carried as lineage, not identity.',
    'Synthesis is allowed only after the sufficient-context decision says evidence is sufficient.',
  ].join(' ');
}
