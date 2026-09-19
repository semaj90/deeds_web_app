import { z } from 'zod';

/**
 * AR-05: compact, transport-friendly capability representation.
 *
 * This is a derived CPU-side representation of the existing AgenticAction
 * vocabulary. It is not an authority decision and is never persisted as
 * canonical task state.
 */
export const AGENTIC_CAPABILITY_BITS_V1 = {
  READ: 0,
  SEARCH: 1,
  EXPAND: 2,
  CLASSIFY: 3,
  VALIDATE: 4,
  REPAIR: 5,
  MUTATE: 6,
  AWAIT: 7,
  RETRY: 8,
  STOP: 9,
} as const;

export type AgenticCapabilityV1 = keyof typeof AGENTIC_CAPABILITY_BITS_V1;
export const AgenticCapabilityV1Schema = z.enum([
  'READ', 'SEARCH', 'EXPAND', 'CLASSIFY', 'VALIDATE',
  'REPAIR', 'MUTATE', 'AWAIT', 'RETRY', 'STOP',
]);

export const AgenticCapabilityMaskV1Schema = z
  .object({
    schema: z.literal('atlas.agentic-capability-mask.v1'),
    mask: z.number().int().nonnegative().max(0xffff),
    capabilities: z.array(AgenticCapabilityV1Schema),
    canonicalAuthority: z.literal(false),
    writesPerformed: z.literal(false),
  })
  .strict();

export type AgenticCapabilityMaskV1 = z.infer<typeof AgenticCapabilityMaskV1Schema>;

export function encodeAgenticCapabilityMaskV1(
  capabilities: readonly AgenticCapabilityV1[],
): AgenticCapabilityMaskV1 {
  const unique = [...new Set(capabilities)];
  const parsed = unique.map((capability) => AgenticCapabilityV1Schema.parse(capability));
  const mask = parsed.reduce((value, capability) => value | (1 << AGENTIC_CAPABILITY_BITS_V1[capability]), 0);
  return AgenticCapabilityMaskV1Schema.parse({
    schema: 'atlas.agentic-capability-mask.v1',
    mask,
    capabilities: [...parsed].sort(),
    canonicalAuthority: false,
    writesPerformed: false,
  });
}

export function decodeAgenticCapabilityMaskV1(mask: number): AgenticCapabilityV1[] {
  if (!Number.isInteger(mask) || mask < 0 || mask > 0xffff) {
    throw new Error('AGENTIC_CAPABILITY_MASK_UNQUALIFIED');
  }
  return (Object.entries(AGENTIC_CAPABILITY_BITS_V1) as [AgenticCapabilityV1, number][]) 
    .filter(([, bit]) => (mask & (1 << bit)) !== 0)
    .map(([capability]) => capability)
    .sort();
}

export function hasAgenticCapabilityV1(mask: AgenticCapabilityMaskV1, capability: AgenticCapabilityV1): boolean {
  const parsed = AgenticCapabilityMaskV1Schema.parse(mask);
  const bit = AGENTIC_CAPABILITY_BITS_V1[AgenticCapabilityV1Schema.parse(capability)];
  return (parsed.mask & (1 << bit)) !== 0;
}

export function assertAgenticCapabilityCpuParityV1(
  capabilities: readonly AgenticCapabilityV1[],
  expectedMask: number,
): AgenticCapabilityMaskV1 {
  const encoded = encodeAgenticCapabilityMaskV1(capabilities);
  if (encoded.mask !== expectedMask || decodeAgenticCapabilityMaskV1(encoded.mask).join('|') !== encoded.capabilities.join('|')) {
    throw new Error('AGENTIC_CAPABILITY_CPU_PARITY_FAILED');
  }
  return encoded;
}
