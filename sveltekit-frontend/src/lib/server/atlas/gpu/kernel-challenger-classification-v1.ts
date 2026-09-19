import { z } from 'zod';

export const KernelChallengerClassificationV1Schema = z.object({
  schema: z.literal('atlas.kernel-challenger-classification.v1'),
  kernelFamily: z.enum(['cutile', 'simt']),
  benchmarkStatus: z.enum(['NOT_RUN', 'EXECUTED_UNPROVEN', 'PARITY_PROVEN']),
  logicalLane: z.enum(['semantic', 'graph', 'feature', 'prefill']),
  role: z.literal('CHALLENGER'),
  canonicalIdentityOwner: z.literal(false),
  canonicalRankingOwner: z.literal(false),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();

export type KernelChallengerClassificationV1 = z.infer<typeof KernelChallengerClassificationV1Schema>;

export function classifyKernelChallengerV1(input: Omit<KernelChallengerClassificationV1, 'schema'>): KernelChallengerClassificationV1 {
  return KernelChallengerClassificationV1Schema.parse({
    schema: 'atlas.kernel-challenger-classification.v1',
    ...input,
  });
}
