import { createHash } from 'node:crypto';
import { z } from 'zod';

export const DenseRepresentationCapabilityV1Schema = z.object({
  schema: z.literal('atlas.dense-representation-capability.v1'),
  logicalRepresentation: z.string().min(1),
  dimensions: z.number().int().positive(),
  metric: z.enum(['cosine', 'dot', 'euclid']),
  qdrant: z.object({
    collection: z.string().min(1),
    vectorName: z.string().min(1).nullable(),
  }).nullable(),
  available: z.boolean(),
  reason: z.string().min(1).optional(),
  representationRevision: z.string().min(1),
  capabilityChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  writesPerformed: z.literal(false),
}).strict();

export type DenseRepresentationCapabilityV1 = z.infer<typeof DenseRepresentationCapabilityV1Schema>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`
  ).join(',')}}`;
}

export function denseRepresentationCapabilityChecksum(input: Omit<DenseRepresentationCapabilityV1, 'capabilityChecksum'>): string {
  return createHash('sha256').update(canonicalJson(input), 'utf8').digest('hex');
}

export function buildDenseRepresentationCapabilityV1(input: Omit<DenseRepresentationCapabilityV1, 'capabilityChecksum'>): DenseRepresentationCapabilityV1 {
  const parsed = DenseRepresentationCapabilityV1Schema.omit({ capabilityChecksum: true }).parse(input);
  return DenseRepresentationCapabilityV1Schema.parse({
    ...parsed,
    capabilityChecksum: denseRepresentationCapabilityChecksum(parsed),
  });
}

export function assertDenseRepresentationCapabilityV1(capability: DenseRepresentationCapabilityV1): DenseRepresentationCapabilityV1 {
  const parsed = DenseRepresentationCapabilityV1Schema.parse(capability);
  const { capabilityChecksum, ...body } = parsed;
  if (denseRepresentationCapabilityChecksum(body) !== capabilityChecksum) {
    throw new Error('DENSE_REPRESENTATION_CAPABILITY_CHECKSUM_MISMATCH');
  }
  return parsed;
}
