import { z } from 'zod';

export const laneNameSchema = z.enum([
  'dense',
  'sparse',
  'summary',
  'exact',
  'ast',
  'graph',
  'temporal',
]);

export const retrievalCandidateSchema = z.object({
  packet_key: z.string().min(1),
  source_ref: z.string().min(1),
  document_id: z.string().min(1),
  document_version: z.string().min(1),
  lod: z.string().min(1),
  lane: laneNameSchema,
  raw_score: z.number().finite(),
  normalized_score: z.number().finite(),
  rank: z.number().int().nonnegative(),
  lane_specific_evidence: z.array(z.string().min(1)).default([]),
  temporal_mode: z.string().min(1).nullable().optional(),
  temporal_compatibility: z.string().min(1).nullable().optional(),
  graph_snapshot_version: z.string().min(1).nullable().optional(),
});

export type RetrievalCandidate = z.infer<typeof retrievalCandidateSchema>;

export function normalizeRetrievalCandidate(input: unknown): RetrievalCandidate {
  return retrievalCandidateSchema.parse(input);
}
