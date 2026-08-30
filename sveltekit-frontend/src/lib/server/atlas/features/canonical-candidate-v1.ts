import { createHash } from 'node:crypto';
import { z } from 'zod';

export const CANONICAL_CANDIDATE_SCHEMA = 'atlas.canonical-candidate.v1' as const;
export const CANDIDATE_ORDINAL_MAP_SCHEMA = 'atlas.candidate-ordinal-map.v1' as const;

const candidateRepresentationId = z.enum([
  'semantic_768',
  'semantic_mrl_512',
  'semantic_mrl_256',
  'semantic_mrl_128',
  'latent_256',
  'latent_128',
  'latent_64',
]);

const mrlDimensions: Record<string, number> = {
  semantic_768: 768,
  semantic_mrl_512: 512,
  semantic_mrl_256: 256,
  semantic_mrl_128: 128,
};
const latentDimensions: Record<string, number> = {
  latent_256: 256,
  latent_128: 128,
  latent_64: 64,
};

export const candidateRepresentationBindingV1Schema = z.object({
  representationId: candidateRepresentationId,
  family: z.enum(['EMBEDDINGGEMMA_MRL', 'LEARNED_LATENT']),
  dimensions: z.number().int().positive(),
  modelRevision: z.string().min(1),
  projectionKind: z.enum(['NONE', 'MRL_PREFIX_TRUNCATION', 'LEARNED_AUTOENCODER', 'NESTED_PREFIX_L2_RENORMALIZE']),
  sourceRepresentationId: candidateRepresentationId.nullable(),
  projectionRevision: z.string().min(1).nullable(),
  normalized: z.literal(true),
  available: z.boolean(),
  availabilityReason: z.string().min(1).nullable(),
}).strict().superRefine((binding, ctx) => {
  const expected = mrlDimensions[binding.representationId] ?? latentDimensions[binding.representationId];
  if (binding.dimensions !== expected) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dimensions'], message: 'REPRESENTATION_DIMENSION_MISMATCH' });
  }

  if (binding.representationId in mrlDimensions) {
    if (binding.family !== 'EMBEDDINGGEMMA_MRL') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['family'], message: 'MRL_FAMILY_MISMATCH' });
    }
    const isCanonical = binding.representationId === 'semantic_768';
    if (binding.projectionKind !== (isCanonical ? 'NONE' : 'MRL_PREFIX_TRUNCATION')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['projectionKind'], message: 'MRL_PROJECTION_KIND_MISMATCH' });
    }
    if (binding.sourceRepresentationId !== (isCanonical ? null : 'semantic_768')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceRepresentationId'], message: 'MRL_SOURCE_MISMATCH' });
    }
    if (!isCanonical && binding.projectionRevision === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['projectionRevision'], message: 'MRL_PROJECTION_REVISION_REQUIRED' });
    }
  }

  if (binding.representationId in latentDimensions) {
    if (binding.family !== 'LEARNED_LATENT') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['family'], message: 'LEARNED_LATENT_FAMILY_MISMATCH' });
    }
    const isPhysicalLatent = binding.representationId === 'latent_256';
    const expectedProjection = isPhysicalLatent ? 'LEARNED_AUTOENCODER' : 'NESTED_PREFIX_L2_RENORMALIZE';
    const expectedSource = isPhysicalLatent ? 'semantic_768' : 'latent_256';
    if (binding.projectionKind !== expectedProjection) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['projectionKind'], message: 'LEARNED_LATENT_PROJECTION_KIND_MISMATCH' });
    }
    if (binding.sourceRepresentationId !== expectedSource) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceRepresentationId'], message: 'LEARNED_LATENT_SOURCE_MISMATCH' });
    }
    if (binding.projectionRevision === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['projectionRevision'], message: 'LEARNED_LATENT_PROJECTION_REVISION_REQUIRED' });
    }
  }

  if (!binding.available && binding.availabilityReason === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['availabilityReason'], message: 'UNAVAILABLE_REPRESENTATION_REASON_REQUIRED' });
  }
});
export type CandidateRepresentationBindingV1 = z.infer<typeof candidateRepresentationBindingV1Schema>;

const revision = z.string().min(1);
const nullableId = z.string().min(1).nullable();

const canonicalCandidateV1BaseSchema = z.object({
  schema: z.literal(CANONICAL_CANDIDATE_SCHEMA),
  candidateOrdinal: z.number().int().nonnegative(),
  canonicalId: z.string().min(1),
  packetKey: nullableId,
  sourceRef: nullableId.default(null),
  treeNodeId: nullableId,
  symbolVersionId: nullableId,
  workspaceRevision: revision,
  sourceRevision: revision,
  graphRevision: revision.nullable(),
  semanticRevision: revision.nullable(),
  candidateSnapshotRevision: revision,
  degradedIdentity: z.boolean().default(false),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  representationBindings: z.array(candidateRepresentationBindingV1Schema).default([]),
}).strict();

export const canonicalCandidateV1Schema = canonicalCandidateV1BaseSchema.superRefine((candidate, ctx) => {
  if (!candidate.degradedIdentity && candidate.packetKey === null && candidate.treeNodeId === null && candidate.symbolVersionId === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['degradedIdentity'],
      message: 'CANONICAL_CANDIDATE_STRONG_IDENTITY_REQUIRED',
    });
  }

  const bindings = new Map<string, (typeof candidate.representationBindings)[number]>();
  candidate.representationBindings.forEach((binding, index) => {
    if (bindings.has(binding.representationId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['representationBindings', index, 'representationId'],
        message: `CANDIDATE_REPRESENTATION_BINDING_DUPLICATE:${binding.representationId}`,
      });
      return;
    }
    bindings.set(binding.representationId, binding);
  });

  const requireAvailableSource = (representationId: string, sourceRepresentationId: string) => {
    const binding = bindings.get(representationId);
    if (!binding?.available) return;
    const source = bindings.get(sourceRepresentationId);
    if (!source?.available) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['representationBindings'],
        message: `AVAILABLE_REPRESENTATION_SOURCE_UNAVAILABLE:${representationId}:${sourceRepresentationId}`,
      });
    }
  };

  requireAvailableSource('semantic_mrl_512', 'semantic_768');
  requireAvailableSource('semantic_mrl_256', 'semantic_768');
  requireAvailableSource('semantic_mrl_128', 'semantic_768');
  requireAvailableSource('latent_256', 'semantic_768');
  requireAvailableSource('latent_128', 'latent_256');
  requireAvailableSource('latent_64', 'latent_256');
});
export type CanonicalCandidateV1 = z.infer<typeof canonicalCandidateV1Schema>;

export const candidateOrdinalMapV1Schema = z.object({
  schema: z.literal(CANDIDATE_ORDINAL_MAP_SCHEMA),
  candidateSnapshotRevision: revision,
  workspaceRevision: revision,
  rowCount: z.number().int().nonnegative(),
  candidates: z.array(canonicalCandidateV1Schema),
  ordinalMapChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  identityAuthority: z.literal(false),
  producerRevision: revision,
}).strict();
export type CandidateOrdinalMapV1 = z.infer<typeof candidateOrdinalMapV1Schema>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export function candidateOrdinalMapChecksum(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export type CanonicalCandidateIdentityInput = Omit<
  z.input<typeof canonicalCandidateV1Schema>,
  'schema' | 'candidateOrdinal' | 'candidateSnapshotRevision'
>;

/**
 * Dense ordinals are assigned only after deterministic canonical ordering.
 * They are execution coordinates scoped to candidateSnapshotRevision and never
 * substitute for canonicalId/packetKey/treeNodeId/symbolVersionId.
 */
export function materializeCandidateOrdinalMap(input: {
  candidates: readonly CanonicalCandidateIdentityInput[];
  candidateSnapshotRevision: string;
  workspaceRevision: string;
  producerRevision: string;
}): CandidateOrdinalMapV1 {
  const seenCanonical = new Set<string>();
  const parsed = input.candidates.map((candidate) => canonicalCandidateV1BaseSchema.omit({
    schema: true,
    candidateOrdinal: true,
    candidateSnapshotRevision: true,
  }).parse(candidate));

  for (const candidate of parsed) {
    if (candidate.workspaceRevision !== input.workspaceRevision) {
      throw new Error(`CANDIDATE_WORKSPACE_REVISION_MISMATCH:${candidate.canonicalId}`);
    }
    if (seenCanonical.has(candidate.canonicalId)) {
      throw new Error(`CANDIDATE_CANONICAL_ID_DUPLICATE:${candidate.canonicalId}`);
    }
    seenCanonical.add(candidate.canonicalId);
  }

  const ordered = [...parsed].sort((a, b) => {
    const canonical = a.canonicalId.localeCompare(b.canonicalId);
    if (canonical !== 0) return canonical;
    const source = a.sourceRevision.localeCompare(b.sourceRevision);
    if (source !== 0) return source;
    return (a.packetKey ?? '').localeCompare(b.packetKey ?? '');
  });

  const candidates = ordered.map((candidate, candidateOrdinal) => canonicalCandidateV1Schema.parse({
    ...candidate,
    schema: CANONICAL_CANDIDATE_SCHEMA,
    candidateOrdinal,
    candidateSnapshotRevision: input.candidateSnapshotRevision,
  }));

  const checksumPayload = {
    candidateSnapshotRevision: input.candidateSnapshotRevision,
    workspaceRevision: input.workspaceRevision,
    candidates,
  };

  return candidateOrdinalMapV1Schema.parse({
    schema: CANDIDATE_ORDINAL_MAP_SCHEMA,
    candidateSnapshotRevision: input.candidateSnapshotRevision,
    workspaceRevision: input.workspaceRevision,
    rowCount: candidates.length,
    candidates,
    ordinalMapChecksum: candidateOrdinalMapChecksum(checksumPayload),
    identityAuthority: false,
    producerRevision: input.producerRevision,
  });
}

export function resolveCanonicalCandidateByOrdinal(
  mapInput: z.input<typeof candidateOrdinalMapV1Schema>,
  candidateOrdinal: number,
): CanonicalCandidateV1 {
  const map = candidateOrdinalMapV1Schema.parse(mapInput);
  if (!Number.isInteger(candidateOrdinal) || candidateOrdinal < 0 || candidateOrdinal >= map.rowCount) {
    throw new Error(`CANDIDATE_ORDINAL_OUT_OF_RANGE:${candidateOrdinal}`);
  }
  const candidate = map.candidates[candidateOrdinal];
  if (!candidate || candidate.candidateOrdinal !== candidateOrdinal) {
    throw new Error(`CANDIDATE_ORDINAL_MAP_CORRUPT:${candidateOrdinal}`);
  }
  return candidate;
}

export function assertExecutorIdIsNotCanonicalIdentity(input: {
  canonicalId: string;
  candidateOrdinal?: number | null;
  qdrantPointId?: string | number | null;
  gpuNodeId?: string | number | null;
}): void {
  const canonical = String(input.canonicalId);
  for (const [kind, value] of [
    ['candidateOrdinal', input.candidateOrdinal],
    ['qdrantPointId', input.qdrantPointId],
    ['gpuNodeId', input.gpuNodeId],
  ] as const) {
    if (value !== null && value !== undefined && String(value) === canonical) {
      throw new Error(`EXECUTOR_IDENTITY_SUBSTITUTION_REJECTED:${kind}`);
    }
  }
}
