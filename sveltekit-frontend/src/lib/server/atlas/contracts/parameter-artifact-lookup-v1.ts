import { z } from 'zod';

export const ParameterArtifactKindV1Schema = z.enum([
  'REPRESENTATION',
  'RETRIEVAL_EXECUTOR',
  'RANKER',
  'MODEL_ADAPTER',
  'PROMPT_TEMPLATE',
]);

export const ParameterArtifactLookupV1Schema = z.object({
  schema: z.literal('atlas.parameter-artifact-lookup.v1'),
  lookupKey: z.string().min(1),
  kind: ParameterArtifactKindV1Schema,
  modelRevision: z.string().min(1).nullable(),
  adapterRevision: z.string().min(1).nullable(),
  tokenizerRevision: z.string().min(1).nullable(),
  representationRevision: z.string().min(1).nullable(),
  producerRevision: z.string().min(1),
  artifactRef: z.string().min(1).nullable(),
  artifactChecksum: z.string().regex(/^[a-f0-9]{64}$/i).nullable(),
  dimensions: z.number().int().positive().nullable(),
  metric: z.enum(['COSINE', 'INNER_PRODUCT', 'L2']).nullable(),
  normalization: z.enum(['L2_VECTOR', 'NONE']).nullable(),
  parameters: z.record(z.string(), z.unknown()).default({}),
  dependencyRevisions: z.array(z.string().min(1)).max(64).default([]),
  canonicalAuthority: z.boolean(),
  status: z.enum(['CANDIDATE', 'PROVEN', 'SUPERSEDED', 'BLOCKED']),
}).strict();

export type ParameterArtifactLookupV1 = z.infer<typeof ParameterArtifactLookupV1Schema>;

export interface ParameterArtifactCompatibilityQueryV1 {
  kind: ParameterArtifactLookupV1['kind'];
  modelRevision?: string | null;
  adapterRevision?: string | null;
  tokenizerRevision?: string | null;
  representationRevision?: string | null;
  dimensions?: number | null;
  metric?: ParameterArtifactLookupV1['metric'];
  normalization?: ParameterArtifactLookupV1['normalization'];
}

export function buildParameterArtifactLookupKey(input: Pick<ParameterArtifactLookupV1, 'kind' | 'producerRevision' | 'modelRevision' | 'adapterRevision' | 'representationRevision'>): string {
  return [
    'atlas:param:v1',
    input.kind,
    input.producerRevision,
    input.modelRevision ?? 'none',
    input.adapterRevision ?? 'none',
    input.representationRevision ?? 'none',
  ].join(':');
}

export function parseParameterArtifactLookupV1(input: unknown): ParameterArtifactLookupV1 {
  return ParameterArtifactLookupV1Schema.parse(input);
}

/** Exact compatibility gate for context/model artifact selection. */
export function matchesParameterArtifactLookupV1(
  artifact: ParameterArtifactLookupV1,
  query: ParameterArtifactCompatibilityQueryV1,
): boolean {
  if (artifact.status !== 'PROVEN') return false;
  if (artifact.kind !== query.kind) return false;
  const fields: Array<keyof ParameterArtifactCompatibilityQueryV1> = [
    'modelRevision', 'adapterRevision', 'tokenizerRevision', 'representationRevision',
    'dimensions', 'metric', 'normalization',
  ];
  return fields.every((field) => query[field] === undefined || query[field] === artifact[field]);
}
