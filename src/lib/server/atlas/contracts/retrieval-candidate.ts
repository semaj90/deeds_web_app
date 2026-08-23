import { z } from 'zod';

export const retrievalLaneSchema = z.enum([
  'exact',
  'postgres_fts',
  'qdrant_dense',
  'qdrant_sparse',
  'ast',
  'graph',
]);

export const retrievalCandidateSchema = z.object({
  packet_key: z.string().min(1),
  source_ref: z.string().min(1),
  lane: retrievalLaneSchema,
  rank: z.number().int().positive(),
  score: z.number().finite().nullable().optional(),
  packet_id: z.string().optional().nullable(),
  qdrant_point_id: z.string().optional().nullable(),
  metadata: z.record(z.any()).default({}),
});

export type RetrievalLane = z.infer<typeof retrievalLaneSchema>;
export type RetrievalCandidate = z.infer<typeof retrievalCandidateSchema>;

