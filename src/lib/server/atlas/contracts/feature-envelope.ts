import { z } from 'zod';

export const featureEnvelopeSchema = z.object({
  packet_key: z.string().min(1),
  source_ref: z.string().min(1),
  source_ref_key: z.string().min(1).optional().nullable(),
  feature_id: z.string().min(1),
  title_id: z.string().min(1).optional().nullable(),
  tree_node_id: z.string().optional().nullable(),
  domain_class: z.string().optional().nullable(),
  ontology_label: z.string().optional().nullable(),
  topology_label: z.string().optional().nullable(),
  used_concepts: z.array(z.string()).default([]),
  qdrant_point_id: z.string().optional().nullable(),
  community_id: z.number().int().optional().nullable(),
  som_cluster: z.number().int().optional().nullable(),
  som_row: z.number().int().optional().nullable(),
  som_col: z.number().int().optional().nullable(),
  page_rank_score: z.number().finite().optional().nullable(),
  summary: z.string().optional().nullable(),
  embedding_model: z.string().optional().nullable(),
  embedding_dim: z.number().int().positive().optional().nullable(),
  metadata_version: z.number().int().nonnegative().default(1),
});

export type FeatureEnvelope = z.infer<typeof featureEnvelopeSchema>;

