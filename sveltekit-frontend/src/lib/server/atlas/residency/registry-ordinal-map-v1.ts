import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * REGISTRY-ORDINAL-MAP-V1
 * 
 * Maps canonical identities to compact registry ordinals (0..N-1).
 * Strictly a PRESENTATION and CACHE projection layer.
 * Canonical authority is always false.
 */

export const RegistryOrdinalEntrySchema = z
  .object({
    ordinal: z.number().int().min(0),
    canonicalId: z.string().min(1),
  })
  .strict();

export const RegistryOrdinalMapV1Schema = z
  .object({
    schema: z.literal('atlas.registry-ordinal-map.v1'),
    registryRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    ordinalMapChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    capacity: z.number().int().min(1),
    entries: z.array(RegistryOrdinalEntrySchema),
    canonicalAuthority: z.literal(false),
  })
  .strict();

export type RegistryOrdinalEntry = z.infer<typeof RegistryOrdinalEntrySchema>;
export type RegistryOrdinalMapV1 = z.infer<typeof RegistryOrdinalMapV1Schema>;

export class DuplicateCanonicalIdError extends Error {}
export class RegistryOverflowError extends Error {}
export class EmptyCanonicalSetError extends Error {}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

/**
 * Builds a deterministic registry ordinal map from caller-supplied canonical IDs.
 * Input canonical IDs are sorted lexicographically before ordinal assignment.
 */
export function buildRegistryOrdinalMapV1(
  canonicalIds: readonly string[],
  capacity = 512,
): RegistryOrdinalMapV1 {
  if (canonicalIds.length === 0) {
    throw new EmptyCanonicalSetError('RegistryOrdinalMapV1 requires at least one canonicalId');
  }
  const unique = new Set(canonicalIds);
  if (unique.size !== canonicalIds.length) {
    throw new DuplicateCanonicalIdError(
      `Duplicate canonical IDs in input set: ${canonicalIds.length - unique.size} duplicate(s) found`,
    );
  }
  if (unique.size > capacity) {
    throw new RegistryOverflowError(
      `Set size ${unique.size} exceeds configured registry capacity of ${capacity}`,
    );
  }

  const sorted = [...unique].sort();
  const entries: RegistryOrdinalEntry[] = sorted.map((canonicalId, ordinal) => ({
    ordinal,
    canonicalId,
  }));

  const ordinalMapChecksum = sha256(JSON.stringify(entries));
  const registryRevision = sha256(
    JSON.stringify({
      schema: 'atlas.registry-ordinal-map.v1',
      capacity,
      ordinalMapChecksum,
      count: entries.length,
    }),
  );

  return {
    schema: 'atlas.registry-ordinal-map.v1',
    registryRevision,
    ordinalMapChecksum,
    capacity,
    entries,
    canonicalAuthority: false,
  };
}

export function ordinalLookup(map: RegistryOrdinalMapV1, canonicalId: string): number | null {
  const match = map.entries.find((e) => e.canonicalId === canonicalId);
  return match !== undefined ? match.ordinal : null;
}

export function canonicalLookup(map: RegistryOrdinalMapV1, ordinal: number): string | null {
  const match = map.entries.find((e) => e.ordinal === ordinal);
  return match !== undefined ? match.canonicalId : null;
}

export function isRegistryRevisionCurrent(
  map: RegistryOrdinalMapV1,
  canonicalIds: readonly string[],
): boolean {
  if (canonicalIds.length !== map.entries.length) return false;
  const sorted = [...canonicalIds].sort();
  const currentChecksum = sha256(
    JSON.stringify(sorted.map((canonicalId, ordinal) => ({ ordinal, canonicalId }))),
  );
  return currentChecksum === map.ordinalMapChecksum;
}
