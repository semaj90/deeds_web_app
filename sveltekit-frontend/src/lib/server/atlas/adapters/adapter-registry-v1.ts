import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * ADAPTER-REGISTRY-V1
 * 
 * Formal registry for QLoRA and behavioral memory modules.
 * Provides compact adapter slots (0..255) dynamically resolved to
 * revisioned model/adapter parameters.
 */

export const AdapterEntrySchema = z
  .object({
    slot: z.number().int().min(0).max(255),
    adapterId: z.string().min(1),
    adapterRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    baseModelRevision: z.string().min(1),
    trainingCorpusRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    cohortChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    rank: z.number().int().min(1),
    alpha: z.number().min(1),
    targetModules: z.array(z.string().min(1)),
    quantizationContract: z.string().min(1),
    evalReceipt: z.string().min(1),
    lifecycleStatus: z.enum(['PROPOSED', 'CANDIDATE', 'EVALUATED', 'ADMITTED', 'RETIRED']),
  })
  .strict();

export const AdapterRegistryV1Schema = z
  .object({
    schema: z.literal('atlas.adapter-registry.v1'),
    registryRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    adapters: z.array(AdapterEntrySchema),
    canonicalAuthority: z.literal(false),
  })
  .strict();

export type AdapterEntry = z.infer<typeof AdapterEntrySchema>;
export type AdapterRegistryV1 = z.infer<typeof AdapterRegistryV1Schema>;

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function buildAdapterRegistryV1(
  adapters: readonly Omit<AdapterEntry, 'slot'>[],
): AdapterRegistryV1 {
  // Slot 0 is reserved for base model (no adapter)
  const sorted = [...adapters].sort((a, b) => a.adapterId.localeCompare(b.adapterId));
  const assignedAdapters: AdapterEntry[] = sorted.map((adapter, idx) => ({
    ...adapter,
    slot: idx + 1, // 1..N
  }));

  const registryRevision = sha256(
    JSON.stringify({
      schema: 'atlas.adapter-registry.v1',
      adapters: assignedAdapters,
    }),
  );

  return {
    schema: 'atlas.adapter-registry.v1',
    registryRevision,
    adapters: assignedAdapters,
    canonicalAuthority: false,
  };
}

export function resolveAdapterSlot(
  registry: AdapterRegistryV1,
  slot: number,
): AdapterEntry | null {
  if (slot === 0) return null; // Slot 0 represents unadapted base model
  const match = registry.adapters.find((a) => a.slot === slot);
  return match ?? null;
}
