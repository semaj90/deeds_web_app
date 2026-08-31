import { z } from 'zod';

export const GdsActionSchema = z.enum([
  'project',
  'pagerank',
  'louvain',
  'knn',
  'authority',
  'ontology',
  'd27',
  'full',
]);

export const GdsRequestSchema = z.object({
  action: GdsActionSchema.default('d27'),
  apply: z.boolean().default(false),
}).strict();

export type GdsRequest = z.infer<typeof GdsRequestSchema>;

export function parseGdsRequest(raw: unknown) {
  // An omitted body is equivalent to the safe read-only default; an explicit
  // JSON null is malformed input and must not be silently accepted.
  return GdsRequestSchema.safeParse(raw === undefined ? {} : raw);
}

export function requiresGdsApply(action: GdsRequest['action']): boolean {
  return action !== 'd27';
}
