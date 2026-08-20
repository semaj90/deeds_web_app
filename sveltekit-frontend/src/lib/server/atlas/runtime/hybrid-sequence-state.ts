import { z } from 'zod';
import { OrnithRuntimeSchema } from './ornith-runtime-plan.js';

export const HybridSequenceLayerKindSchema = z.enum(['GATED_DELTANET', 'FULL_ATTENTION']);
export type HybridSequenceLayerKind = z.infer<typeof HybridSequenceLayerKindSchema>;

export const SequenceStateAccountingSourceSchema = z.enum([
  'MEASURED',
  'RUNTIME_REPORTED',
  'DERIVED_FROM_CONFIG',
  'ESTIMATED',
]);
export type SequenceStateAccountingSource = z.infer<typeof SequenceStateAccountingSourceSchema>;

export const DeltaNetLayerStateObservationV1Schema = z.object({
  layerIndex: z.number().int().min(0).max(31),
  recurrentStateBytes: z.number().int().nonnegative(),
  convolutionStateBytes: z.number().int().nonnegative(),
  accountingSource: SequenceStateAccountingSourceSchema.exclude(['DERIVED_FROM_CONFIG']),
}).strict();
export type DeltaNetLayerStateObservationV1 = z.infer<typeof DeltaNetLayerStateObservationV1Schema>;

export const HybridSequenceLayerStateV1Schema = z.object({
  layerIndex: z.number().int().min(0).max(31),
  layerKind: HybridSequenceLayerKindSchema,
  recurrentStateBytes: z.number().int().nonnegative(),
  convolutionStateBytes: z.number().int().nonnegative(),
  kvCacheBytes: z.number().int().nonnegative(),
  accountingSource: SequenceStateAccountingSourceSchema,
}).strict().superRefine((value, ctx) => {
  if (value.layerKind === 'GATED_DELTANET' && value.kvCacheBytes !== 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['kvCacheBytes'],
      message: 'Gated DeltaNet layers must not be accounted as full-attention KV cache',
    });
  }
  if (value.layerKind === 'FULL_ATTENTION' && (value.recurrentStateBytes !== 0 || value.convolutionStateBytes !== 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['recurrentStateBytes'],
      message: 'Full-attention layers must not be accounted as DeltaNet recurrent/convolution state',
    });
  }
});
export type HybridSequenceLayerStateV1 = z.infer<typeof HybridSequenceLayerStateV1Schema>;

export const HybridSequenceStateV1Schema = z.object({
  schema: z.literal('atlas.hybrid-sequence-state.v1'),
  modelId: z.literal('deepreinforce-ai/Ornith-1.0-9B'),
  modelRevision: z.string().min(1),
  runtime: OrnithRuntimeSchema,
  batchSize: z.number().int().positive(),
  sequenceLengthTokens: z.number().int().nonnegative(),
  kvCacheBytesPerElement: z.number().int().positive(),
  totalTextLayers: z.literal(32),
  gatedDeltaNetLayerCount: z.literal(24),
  fullAttentionLayerCount: z.literal(8),
  fullAttentionInterval: z.literal(4),
  fullAttentionKvHeads: z.literal(4),
  fullAttentionHeadDim: z.literal(256),
  layers: z.array(HybridSequenceLayerStateV1Schema).length(32),
  deltaNetRecurrentStateBytes: z.number().int().nonnegative(),
  deltaNetConvolutionStateBytes: z.number().int().nonnegative(),
  fullAttentionKvCacheBytes: z.number().int().nonnegative(),
  totalSequenceStateBytes: z.number().int().nonnegative(),
  producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  const sorted = [...value.layers].sort((a, b) => a.layerIndex - b.layerIndex);
  const uniqueIndexes = new Set(sorted.map((layer) => layer.layerIndex));
  if (uniqueIndexes.size !== value.totalTextLayers || sorted.some((layer, index) => layer.layerIndex !== index)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['layers'],
      message: 'layers must contain every text layer index exactly once from 0 through 31',
    });
  }

  const deltaLayers = sorted.filter((layer) => layer.layerKind === 'GATED_DELTANET');
  const attentionLayers = sorted.filter((layer) => layer.layerKind === 'FULL_ATTENTION');
  if (deltaLayers.length !== value.gatedDeltaNetLayerCount || attentionLayers.length !== value.fullAttentionLayerCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['layers'],
      message: 'layer-kind counts must match the frozen Ornith 24 Gated DeltaNet / 8 full-attention layout',
    });
  }

  const recurrent = deltaLayers.reduce((sum, layer) => sum + layer.recurrentStateBytes, 0);
  const convolution = deltaLayers.reduce((sum, layer) => sum + layer.convolutionStateBytes, 0);
  const kv = attentionLayers.reduce((sum, layer) => sum + layer.kvCacheBytes, 0);
  const total = recurrent + convolution + kv;

  if (recurrent !== value.deltaNetRecurrentStateBytes) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['deltaNetRecurrentStateBytes'], message: 'recurrent-state total does not match layer accounting' });
  }
  if (convolution !== value.deltaNetConvolutionStateBytes) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['deltaNetConvolutionStateBytes'], message: 'convolution-state total does not match layer accounting' });
  }
  if (kv !== value.fullAttentionKvCacheBytes) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fullAttentionKvCacheBytes'], message: 'KV-cache total does not match layer accounting' });
  }
  if (total !== value.totalSequenceStateBytes) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['totalSequenceStateBytes'], message: 'sequence-state total does not match component accounting' });
  }
});
export type HybridSequenceStateV1 = z.infer<typeof HybridSequenceStateV1Schema>;

const ORNITH_LAYER_KINDS: readonly HybridSequenceLayerKind[] = Array.from({ length: 32 }, (_, layerIndex) =>
  (layerIndex + 1) % 4 === 0 ? 'FULL_ATTENTION' : 'GATED_DELTANET',
);

function checkedByteCount(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer byte count`);
  }
  return value;
}

/**
 * Builds the frozen Ornith 24+8 hybrid sequence-state accounting artifact.
 *
 * Full-attention KV bytes are derived from the checkpoint config:
 *   batch * tokens * 4 KV heads * 256 head dim * 2 (K+V) * bytes/element.
 *
 * DeltaNet recurrent and causal-convolution cache shapes are runtime details, so
 * callers must supply measured/runtime-reported/explicitly-estimated byte counts
 * per linear-attention layer. We intentionally do not invent a recurrent-state
 * formula from the model config.
 */
export function buildOrnithHybridSequenceState(input: {
  modelRevision: string;
  runtime: z.infer<typeof OrnithRuntimeSchema>;
  batchSize: number;
  sequenceLengthTokens: number;
  kvCacheBytesPerElement: number;
  deltaNetLayers: readonly DeltaNetLayerStateObservationV1[];
  producerRevision: string;
}): HybridSequenceStateV1 {
  if (!Number.isSafeInteger(input.batchSize) || input.batchSize <= 0) throw new RangeError('batchSize must be a positive safe integer');
  if (!Number.isSafeInteger(input.sequenceLengthTokens) || input.sequenceLengthTokens < 0) throw new RangeError('sequenceLengthTokens must be a non-negative safe integer');
  if (!Number.isSafeInteger(input.kvCacheBytesPerElement) || input.kvCacheBytesPerElement <= 0) throw new RangeError('kvCacheBytesPerElement must be a positive safe integer');

  const observations = input.deltaNetLayers.map((observation) => DeltaNetLayerStateObservationV1Schema.parse(observation));
  const byLayer = new Map(observations.map((observation) => [observation.layerIndex, observation]));
  const expectedDeltaIndexes = ORNITH_LAYER_KINDS
    .map((kind, layerIndex) => ({ kind, layerIndex }))
    .filter(({ kind }) => kind === 'GATED_DELTANET')
    .map(({ layerIndex }) => layerIndex);

  if (observations.length !== expectedDeltaIndexes.length || byLayer.size !== expectedDeltaIndexes.length || expectedDeltaIndexes.some((layerIndex) => !byLayer.has(layerIndex))) {
    throw new Error('deltaNetLayers must provide exactly one observation for each Ornith Gated DeltaNet layer');
  }
  if (observations.some((observation) => ORNITH_LAYER_KINDS[observation.layerIndex] !== 'GATED_DELTANET')) {
    throw new Error('deltaNetLayers contains an observation for an Ornith full-attention layer');
  }

  const kvCacheBytesPerFullAttentionLayer = checkedByteCount(
    input.batchSize * input.sequenceLengthTokens * 4 * 256 * 2 * input.kvCacheBytesPerElement,
    'kvCacheBytesPerFullAttentionLayer',
  );

  const layers: HybridSequenceLayerStateV1[] = ORNITH_LAYER_KINDS.map((layerKind, layerIndex) => {
    if (layerKind === 'FULL_ATTENTION') {
      return HybridSequenceLayerStateV1Schema.parse({
        layerIndex,
        layerKind,
        recurrentStateBytes: 0,
        convolutionStateBytes: 0,
        kvCacheBytes: kvCacheBytesPerFullAttentionLayer,
        accountingSource: 'DERIVED_FROM_CONFIG',
      });
    }

    const observation = byLayer.get(layerIndex)!;
    return HybridSequenceLayerStateV1Schema.parse({
      layerIndex,
      layerKind,
      recurrentStateBytes: checkedByteCount(observation.recurrentStateBytes, `layer ${layerIndex} recurrentStateBytes`),
      convolutionStateBytes: checkedByteCount(observation.convolutionStateBytes, `layer ${layerIndex} convolutionStateBytes`),
      kvCacheBytes: 0,
      accountingSource: observation.accountingSource,
    });
  });

  const deltaNetRecurrentStateBytes = layers.reduce((sum, layer) => sum + layer.recurrentStateBytes, 0);
  const deltaNetConvolutionStateBytes = layers.reduce((sum, layer) => sum + layer.convolutionStateBytes, 0);
  const fullAttentionKvCacheBytes = layers.reduce((sum, layer) => sum + layer.kvCacheBytes, 0);
  const totalSequenceStateBytes = checkedByteCount(
    deltaNetRecurrentStateBytes + deltaNetConvolutionStateBytes + fullAttentionKvCacheBytes,
    'totalSequenceStateBytes',
  );

  return HybridSequenceStateV1Schema.parse({
    schema: 'atlas.hybrid-sequence-state.v1',
    modelId: 'deepreinforce-ai/Ornith-1.0-9B',
    modelRevision: input.modelRevision,
    runtime: input.runtime,
    batchSize: input.batchSize,
    sequenceLengthTokens: input.sequenceLengthTokens,
    kvCacheBytesPerElement: input.kvCacheBytesPerElement,
    totalTextLayers: 32,
    gatedDeltaNetLayerCount: 24,
    fullAttentionLayerCount: 8,
    fullAttentionInterval: 4,
    fullAttentionKvHeads: 4,
    fullAttentionHeadDim: 256,
    layers,
    deltaNetRecurrentStateBytes,
    deltaNetConvolutionStateBytes,
    fullAttentionKvCacheBytes,
    totalSequenceStateBytes,
    producerRevision: input.producerRevision,
  });
}
