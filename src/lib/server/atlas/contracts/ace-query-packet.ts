import { z } from 'zod';
import { atlasIntentSchema, atlasSearchModeSchema, queryAnalysisSchema } from './query-analysis';
import { retrievalCandidateSchema } from './retrieval-candidate';

export const aceQueryPacketSchema = z.object({
  query: z.string().min(1),
  intent: atlasIntentSchema,
  mode: atlasSearchModeSchema,
  analysis: queryAnalysisSchema.optional(),
  packet_key: z.string().optional().nullable(),
  source_ref: z.string().optional().nullable(),
  feature_id: z.string().optional().nullable(),
  top_k: z.number().int().positive().default(20),
  candidates: z.array(retrievalCandidateSchema).default([]),
  trace_id: z.string().optional().nullable(),
  created_at: z.string().datetime().optional().nullable(),
});

export type AceQueryPacket = z.infer<typeof aceQueryPacketSchema>;

