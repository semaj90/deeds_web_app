import { z } from 'zod';

export const EngramRepresentationUnavailableSchema = z.object({
  status: z.literal('REPRESENTATION_UNAVAILABLE'),
  representation: z.enum(['hnsw_embedding', 'hnsw_embedding_512']),
  reason: z.string().min(1),
  observations: z.array(z.unknown()).length(0),
  writesPerformed: z.literal(false),
});

export type EngramRepresentationUnavailable = z.infer<
  typeof EngramRepresentationUnavailableSchema
>;

export function buildEngramRepresentationUnavailable(
  representation: EngramRepresentationUnavailable['representation'],
  reason: string,
): EngramRepresentationUnavailable {
  return EngramRepresentationUnavailableSchema.parse({
    status: 'REPRESENTATION_UNAVAILABLE',
    representation,
    reason,
    observations: [],
    writesPerformed: false,
  });
}
