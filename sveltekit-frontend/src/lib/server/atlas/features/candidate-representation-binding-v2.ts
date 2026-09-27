import { z } from 'zod';

export const CANDIDATE_REPRESENTATION_BINDING_V2 =
  'atlas.candidate-representation-binding.v2' as const;

export const candidateRepresentationIdV2Schema = z.enum([
  'semantic_768',
  'semantic_mrl_512',
  'semantic_mrl_256',
  'semantic_mrl_128',
  'latent_256',
  'latent_128',
  'latent_64',
]);

export type CandidateRepresentationIdV2 = z.infer<typeof candidateRepresentationIdV2Schema>;

const DIMENSIONS: Record<CandidateRepresentationIdV2, number> = {
  semantic_768: 768,
  semantic_mrl_512: 512,
  semantic_mrl_256: 256,
  semantic_mrl_128: 128,
  latent_256: 256,
  latent_128: 128,
  latent_64: 64,
};

const FAMILY: Record<CandidateRepresentationIdV2, 'EMBEDDINGGEMMA_MRL' | 'LEARNED_LATENT'> = {
  semantic_768: 'EMBEDDINGGEMMA_MRL',
  semantic_mrl_512: 'EMBEDDINGGEMMA_MRL',
  semantic_mrl_256: 'EMBEDDINGGEMMA_MRL',
  semantic_mrl_128: 'EMBEDDINGGEMMA_MRL',
  latent_256: 'LEARNED_LATENT',
  latent_128: 'LEARNED_LATENT',
  latent_64: 'LEARNED_LATENT',
};

const SOURCE: Record<CandidateRepresentationIdV2, CandidateRepresentationIdV2 | null> = {
  semantic_768: null,
  semantic_mrl_512: 'semantic_768',
  semantic_mrl_256: 'semantic_768',
  semantic_mrl_128: 'semantic_768',
  latent_256: 'semantic_768',
  latent_128: 'latent_256',
  latent_64: 'latent_128',
};

const PROJECTION: Record<
  CandidateRepresentationIdV2,
  'NONE' | 'MRL_PREFIX_L2_RENORMALIZE' | 'LEARNED_AUTOENCODER' | 'NESTED_PREFIX_L2_RENORMALIZE'
> = {
  semantic_768: 'NONE',
  semantic_mrl_512: 'MRL_PREFIX_L2_RENORMALIZE',
  semantic_mrl_256: 'MRL_PREFIX_L2_RENORMALIZE',
  semantic_mrl_128: 'MRL_PREFIX_L2_RENORMALIZE',
  latent_256: 'LEARNED_AUTOENCODER',
  latent_128: 'NESTED_PREFIX_L2_RENORMALIZE',
  latent_64: 'NESTED_PREFIX_L2_RENORMALIZE',
};

export const candidateRepresentationBindingV2Schema = z.object({
  schema: z.literal(CANDIDATE_REPRESENTATION_BINDING_V2),
  representationId: candidateRepresentationIdV2Schema,
  family: z.enum(['EMBEDDINGGEMMA_MRL', 'LEARNED_LATENT']),
  dimensions: z.number().int().positive(),
  modelRevision: z.string().min(1),
  representationRevision: z.string().min(1),
  projectionKind: z.enum([
    'NONE',
    'MRL_PREFIX_L2_RENORMALIZE',
    'LEARNED_AUTOENCODER',
    'NESTED_PREFIX_L2_RENORMALIZE',
  ]),
  sourceRepresentationId: candidateRepresentationIdV2Schema.nullable(),
  sourceRepresentationRevision: z.string().min(1).nullable(),
  projectionRevision: z.string().min(1).nullable(),
  normalized: z.literal(true),
  available: z.boolean(),
  availabilityReason: z.string().min(1).nullable(),
}).strict().superRefine((binding, ctx) => {
  const expectedDimensions = DIMENSIONS[binding.representationId];
  if (binding.dimensions !== expectedDimensions) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dimensions'],
      message: `REPRESENTATION_DIMENSION_MISMATCH:${binding.representationId}:${expectedDimensions}`,
    });
  }

  const expectedFamily = FAMILY[binding.representationId];
  if (binding.family !== expectedFamily) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['family'],
      message: `REPRESENTATION_FAMILY_MISMATCH:${binding.representationId}:${expectedFamily}`,
    });
  }

  const expectedSource = SOURCE[binding.representationId];
  if (binding.sourceRepresentationId !== expectedSource) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sourceRepresentationId'],
      message: `REPRESENTATION_SOURCE_MISMATCH:${binding.representationId}:${expectedSource ?? 'null'}`,
    });
  }

  const expectedProjection = PROJECTION[binding.representationId];
  if (binding.projectionKind !== expectedProjection) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['projectionKind'],
      message: `REPRESENTATION_PROJECTION_MISMATCH:${binding.representationId}:${expectedProjection}`,
    });
  }

  if (expectedSource === null) {
    if (binding.sourceRepresentationRevision !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceRepresentationRevision'],
        message: 'CANONICAL_REPRESENTATION_SOURCE_REVISION_MUST_BE_NULL',
      });
    }
    if (binding.projectionRevision !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['projectionRevision'],
        message: 'CANONICAL_REPRESENTATION_PROJECTION_REVISION_MUST_BE_NULL',
      });
    }
  } else {
    if (binding.sourceRepresentationRevision === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceRepresentationRevision'],
        message: `DERIVED_REPRESENTATION_SOURCE_REVISION_REQUIRED:${binding.representationId}`,
      });
    }
    if (binding.projectionRevision === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['projectionRevision'],
        message: `DERIVED_REPRESENTATION_PROJECTION_REVISION_REQUIRED:${binding.representationId}`,
      });
    }
  }

  if (!binding.available && binding.availabilityReason === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['availabilityReason'],
      message: 'UNAVAILABLE_REPRESENTATION_REASON_REQUIRED',
    });
  }
});

export type CandidateRepresentationBindingV2 = z.infer<typeof candidateRepresentationBindingV2Schema>;

export function assertCandidateRepresentationBindingSetV2(
  bindings: readonly CandidateRepresentationBindingV2[],
): void {
  const parsed = bindings.map((binding) => candidateRepresentationBindingV2Schema.parse(binding));
  const byId = new Map<CandidateRepresentationIdV2, CandidateRepresentationBindingV2>();

  for (const binding of parsed) {
    if (byId.has(binding.representationId)) {
      throw new Error(`REPRESENTATION_BINDING_DUPLICATE_ID:${binding.representationId}`);
    }
    byId.set(binding.representationId, binding);
  }

  for (const binding of parsed) {
    if (!binding.available || binding.sourceRepresentationId === null) continue;

    const source = byId.get(binding.sourceRepresentationId);
    if (!source?.available) {
      throw new Error(
        `REPRESENTATION_BINDING_SOURCE_UNAVAILABLE:${binding.representationId}:${binding.sourceRepresentationId}`,
      );
    }
    if (source.representationRevision !== binding.sourceRepresentationRevision) {
      throw new Error(
        `REPRESENTATION_BINDING_SOURCE_REVISION_MISMATCH:${binding.representationId}:${binding.sourceRepresentationId}`,
      );
    }

    if (binding.family === 'EMBEDDINGGEMMA_MRL' && source.modelRevision !== binding.modelRevision) {
      throw new Error(
        `MRL_MODEL_REVISION_MISMATCH:${binding.representationId}:${source.modelRevision}:${binding.modelRevision}`,
      );
    }

    if (
      binding.family === 'LEARNED_LATENT'
      && binding.representationId !== 'latent_256'
      && source.modelRevision !== binding.modelRevision
    ) {
      throw new Error(
        `LATENT_MODEL_REVISION_MISMATCH:${binding.representationId}:${source.modelRevision}:${binding.modelRevision}`,
      );
    }
  }
}

export function expectedSourceRepresentationV2(
  representationId: CandidateRepresentationIdV2,
): CandidateRepresentationIdV2 | null {
  return SOURCE[representationId];
}

export function expectedProjectionKindV2(
  representationId: CandidateRepresentationIdV2,
): CandidateRepresentationBindingV2['projectionKind'] {
  return PROJECTION[representationId];
}
