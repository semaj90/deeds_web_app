import { z } from 'zod';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';

export const RESIDENCY_DESCRIPTOR_V1_SCHEMA = 'atlas.residency-descriptor.v1' as const;

export const ResidencyDescriptorV1Schema = z.object({
  schema: z.literal(RESIDENCY_DESCRIPTOR_V1_SCHEMA),
  modelRevision: z.string().min(1),
  representationRevision: z.string().min(1),
  graphRevision: z.string().min(1).nullable(),
  featureRevision: z.string().min(1),
  promptRevision: z.string().min(1),
  gpuRevision: z.string().min(1),
  runtimeRevision: z.string().min(1),
  descriptorChecksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type ResidencyDescriptorV1 = z.infer<typeof ResidencyDescriptorV1Schema>;

export function buildResidencyDescriptorV1(
  input: Omit<ResidencyDescriptorV1, 'schema' | 'descriptorChecksum'>,
): ResidencyDescriptorV1 {
  const body = { schema: RESIDENCY_DESCRIPTOR_V1_SCHEMA, ...input };
  return ResidencyDescriptorV1Schema.parse({ ...body, descriptorChecksum: canonicalSha256V1(body) });
}

export function assertResidencyDescriptorCompatibleV1(
  expectedInput: ResidencyDescriptorV1,
  actualInput: ResidencyDescriptorV1,
): void {
  const expected = ResidencyDescriptorV1Schema.parse(expectedInput);
  const actual = ResidencyDescriptorV1Schema.parse(actualInput);
  for (const field of [
    'modelRevision',
    'representationRevision',
    'graphRevision',
    'featureRevision',
    'promptRevision',
    'gpuRevision',
    'runtimeRevision',
  ] as const) {
    if (expected[field] !== actual[field]) throw new Error(`RESIDENCY_DESCRIPTOR_MISMATCH_${field.toUpperCase()}`);
  }
}
