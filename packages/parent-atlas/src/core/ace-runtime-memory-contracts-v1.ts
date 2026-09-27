import { z } from 'zod';

/**
 * CEI-21A classification vocabulary only.
 *
 * A role describes what kind of state/artifact is being observed. It does not
 * grant identity authority, persistence authority, cache ownership, or model
 * tensor ownership.
 */
export const ATLAS_MEMORY_ROLES_V1 = [
  'CANONICAL_PERSISTENCE',
  'RETRIEVAL_ARTIFACT',
  'CONTEXT_ARTIFACT',
  'CONTROL_RESIDENCY',
  'MODEL_KV',
  'MODEL_RECURRENT_STATE',
  'MODEL_ADAPTIVE_MEMORY',
  'RUNTIME_COMPILE_CACHE',
] as const;

export const atlasMemoryRoleV1Schema = z.enum(ATLAS_MEMORY_ROLES_V1);
export type AtlasMemoryRoleV1 = z.infer<typeof atlasMemoryRoleV1Schema>;

/**
 * Descriptive reference assignments. These are not registry entries and do
 * not create a persistence/cache/model-state owner.
 */
export const ATLAS_MEMORY_ROLE_REFERENCE_V1 = Object.freeze({
  postgres: 'CANONICAL_PERSISTENCE',
  semantic_768: 'RETRIEVAL_ARTIFACT',
  context_manifest: 'CONTEXT_ARTIFACT',
  atlas_ace_residency: 'CONTROL_RESIDENCY',
  bitfrost: 'CONTROL_RESIDENCY',
  llama_mha_cache: 'MODEL_KV',
  llama_recurrent_state: 'MODEL_RECURRENT_STATE',
  model_adaptive_memory: 'MODEL_ADAPTIVE_MEMORY',
  tensorrt_rtx_runtime_cache: 'RUNTIME_COMPILE_CACHE',
} satisfies Record<string, AtlasMemoryRoleV1>);

const revision = z.string().trim().min(1);
const sha256Prefixed = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const finiteNumber = z.number().finite();

/**
 * CEI-21B: observation-only llama runtime memory description.
 *
 * It intentionally contains no tensor bytes, serialization payload, cache
 * mutation instruction, or BitFrost representation. llama-server remains the
 * owner of concrete KV/recurrent tensor layouts.
 */
export const llamaRuntimeMemoryLayerV1Schema = z.object({
  ordinal: z.number().int().nonnegative(),
  layerKind: z.enum(['MHA', 'RECURRENT', 'MLP', 'OTHER']),
  memoryRole: z.enum(['MODEL_KV', 'MODEL_RECURRENT_STATE', 'NONE']),
  bytes: z.number().int().nonnegative().optional(),
  dtype: z.string().trim().min(1),
  quantizationPolicy: z.string().trim().min(1),
}).strict().superRefine((value, ctx) => {
  if (value.memoryRole === 'MODEL_KV' && value.layerKind !== 'MHA') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['memoryRole'],
      message: 'MODEL_KV is valid only for an observed MHA layer.',
    });
  }
  if (value.memoryRole === 'MODEL_RECURRENT_STATE' && value.layerKind !== 'RECURRENT') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['memoryRole'],
      message: 'MODEL_RECURRENT_STATE is valid only for an observed RECURRENT layer.',
    });
  }
  if ((value.layerKind === 'MLP' || value.layerKind === 'OTHER') && value.memoryRole !== 'NONE') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['memoryRole'],
      message: 'MLP/OTHER layers cannot claim KV or recurrent-state ownership.',
    });
  }
});

export const llamaRuntimeMemoryManifestV1Schema = z.object({
  schema: z.literal('atlas.llama-runtime-memory-manifest.v1'),
  modelRevision: revision,
  tokenizerRevision: revision,
  adapterRevision: revision.optional(),
  contextManifestChecksum: sha256Prefixed,
  promptPlanChecksum: sha256Prefixed.optional(),
  layers: z.array(llamaRuntimeMemoryLayerV1Schema).min(1),
  kvBytes: z.number().int().nonnegative().optional(),
  recurrentStateBytes: z.number().int().nonnegative().optional(),
  observedAt: z.string().datetime({ offset: true }),
  observationOnly: z.literal(true),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  modelExecutionPerformed: z.literal(false),
}).strict().superRefine((value, ctx) => {
  const ordinals = new Set<number>();
  for (const [index, layer] of value.layers.entries()) {
    if (ordinals.has(layer.ordinal)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['layers', index, 'ordinal'],
        message: 'layer ordinals must be unique',
      });
    }
    ordinals.add(layer.ordinal);
  }

  const kvLayers = value.layers.filter((layer) => layer.memoryRole === 'MODEL_KV');
  if (value.kvBytes !== undefined && kvLayers.every((layer) => layer.bytes !== undefined)) {
    const observed = kvLayers.reduce((sum, layer) => sum + (layer.bytes ?? 0), 0);
    if (value.kvBytes !== observed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['kvBytes'],
        message: 'kvBytes must equal the sum of fully observed MODEL_KV layer bytes',
      });
    }
  }

  const recurrentLayers = value.layers.filter((layer) => layer.memoryRole === 'MODEL_RECURRENT_STATE');
  if (value.recurrentStateBytes !== undefined && recurrentLayers.every((layer) => layer.bytes !== undefined)) {
    const observed = recurrentLayers.reduce((sum, layer) => sum + (layer.bytes ?? 0), 0);
    if (value.recurrentStateBytes !== observed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recurrentStateBytes'],
        message: 'recurrentStateBytes must equal the sum of fully observed MODEL_RECURRENT_STATE layer bytes',
      });
    }
  }
});

export type LlamaRuntimeMemoryManifestV1 = z.infer<typeof llamaRuntimeMemoryManifestV1Schema>;

export function buildLlamaRuntimeMemoryManifestV1(
  input: unknown,
): LlamaRuntimeMemoryManifestV1 {
  return llamaRuntimeMemoryManifestV1Schema.parse(input);
}

/**
 * CEI-21C: novelty/surprise is observation-only in V1.
 *
 * It is a feature for later frozen-trace tournament work. V1 cannot mutate or
 * influence AtlasAceResidencyV1 scoring.
 */
export const atlasAceNoveltySignalV1Schema = z.object({
  schema: z.literal('atlas.ace-novelty-signal.v1'),
  candidateId: z.string().trim().min(1),
  candidateOrdinal: z.number().int().nonnegative(),
  semanticNovelty: finiteNumber.optional(),
  structuralNovelty: finiteNumber.optional(),
  domainTransition: finiteNumber.optional(),
  retrievalUtilityDelta: finiteNumber.optional(),
  evidenceRefs: z.array(z.string().trim().min(1)).min(1),
  featureRevision: revision,
  affectsResidency: z.literal(false),
  observationOnly: z.literal(true),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();

export type AtlasAceNoveltySignalV1 = z.infer<typeof atlasAceNoveltySignalV1Schema>;

export function buildAtlasAceNoveltySignalV1(
  input: unknown,
): AtlasAceNoveltySignalV1 {
  return atlasAceNoveltySignalV1Schema.parse(input);
}
