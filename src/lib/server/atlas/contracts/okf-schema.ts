import { z } from 'zod';

export const okfSchema = z.object({
  version: z.string().min(1),
  language: z.literal('typescript'),
  name: z.string().min(1),
  source_ref: z.string().min(1),
  packet_key: z.string().min(1),
  feature_id: z.string().min(1),
  title_id: z.string().min(1).optional().nullable(),
  tree_node_id: z.string().optional().nullable(),
  domain_class: z.string().optional().nullable(),
  used_concepts: z.array(z.string()).default([]),
  metadata: z.record(z.any()).default({}),
});

export type OkfRecord = z.infer<typeof okfSchema>;

