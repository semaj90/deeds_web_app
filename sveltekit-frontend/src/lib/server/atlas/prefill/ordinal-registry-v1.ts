import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalEncodeV1, sha256HexSchema } from './canonical-hash-v1.js';

const revision = z.string().min(1);
const ordinal = z.number().int().nonnegative();

export const OrdinalRegistryEntryV1Schema = z.object({
  canonicalId: z.string().min(1),
  packetKey: z.string().min(1),
  symbolVersionId: z.string().min(1).nullable(),
  treeNodeId: z.string().min(1).nullable(),
  semanticOrdinal: ordinal.nullable(),
  graphOrdinal: ordinal.nullable(),
  tensorRow: ordinal.nullable(),
}).strict();

export type OrdinalRegistryEntryV1 = z.infer<typeof OrdinalRegistryEntryV1Schema>;

export const OrdinalRegistryV1Schema = z.object({
  schema: z.literal('atlas.ordinal-registry.v1'),
  registryRevision: revision,
  workspaceRevision: revision,
  sourceRevisionSetHash: sha256HexSchema,
  graphRevision: revision,
  representationRevision: revision,
  entries: z.array(OrdinalRegistryEntryV1Schema),
  checksumSha256: sha256HexSchema,
}).strict();

export type OrdinalRegistryV1 = z.infer<typeof OrdinalRegistryV1Schema>;

function assertUnique(entries: readonly OrdinalRegistryEntryV1[], field: keyof OrdinalRegistryEntryV1): void {
  const seen = new Map<string | number, string>();
  for (const entry of entries) {
    const value = entry[field];
    if (value === null) continue;
    const key = value as string | number;
    const previous = seen.get(key);
    if (previous) throw new Error(`duplicate ${String(field)} ${String(value)} for ${previous} and ${entry.canonicalId}`);
    seen.set(key, entry.canonicalId);
  }
}

/**
 * Ordinals are snapshot-local coordinates only. They are never canonical
 * identity and may change when the registry revision changes.
 */
export function buildOrdinalRegistryV1(input: {
  registryRevision: string;
  workspaceRevision: string;
  sourceRevisionSetHash: string;
  graphRevision: string;
  representationRevision: string;
  entries: readonly OrdinalRegistryEntryV1[];
}): OrdinalRegistryV1 {
  const entries = input.entries
    .map((entry) => OrdinalRegistryEntryV1Schema.parse(entry))
    .sort((a, b) => a.canonicalId.localeCompare(b.canonicalId, 'en'));

  assertUnique(entries, 'canonicalId');
  assertUnique(entries, 'packetKey');
  assertUnique(entries, 'semanticOrdinal');
  assertUnique(entries, 'graphOrdinal');
  assertUnique(entries, 'tensorRow');

  const payload = {
    schema: 'atlas.ordinal-registry.v1',
    registryRevision: input.registryRevision,
    workspaceRevision: input.workspaceRevision,
    sourceRevisionSetHash: input.sourceRevisionSetHash,
    graphRevision: input.graphRevision,
    representationRevision: input.representationRevision,
    entries,
  };

  const checksumSha256 = createHash('sha256')
    .update(canonicalEncodeV1(payload), 'utf8')
    .digest('hex');

  return OrdinalRegistryV1Schema.parse({ ...payload, checksumSha256 });
}

export function findOrdinalEntryV1(
  registry: OrdinalRegistryV1,
  canonicalId: string,
): OrdinalRegistryEntryV1 | null {
  return registry.entries.find((entry) => entry.canonicalId === canonicalId) ?? null;
}

export function assertOrdinalRegistryCompatibleV1(input: {
  registry: OrdinalRegistryV1;
  workspaceRevision: string;
  graphRevision: string;
  representationRevision: string;
}): void {
  if (input.registry.workspaceRevision !== input.workspaceRevision) throw new Error('ordinal registry workspace revision mismatch');
  if (input.registry.graphRevision !== input.graphRevision) throw new Error('ordinal registry graph revision mismatch');
  if (input.registry.representationRevision !== input.representationRevision) throw new Error('ordinal registry representation revision mismatch');
}
