import { candidateFeatureGpuPackV1Schema, type CandidateFeatureGpuPackV1 } from '../features/candidate-feature-gpu-pack-v1.js';
import { descriptorCacheKey, UnifiedResidencyAdapter, validateUnifiedDescriptor, type FeatureTileProvider, type UnifiedResidencyDescriptor } from './unified-residency-adapter-v1.js';

export type UnifiedResidencyFeaturePackInputV1 = {
  pack: CandidateFeatureGpuPackV1;
  representationRevision: string;
  modelRevision: string;
  tokenizerRevision: string;
  ropeRevision: string;
};

export type UnifiedResidencyFeaturePackResultV1 = {
  descriptor: UnifiedResidencyDescriptor;
  featureBuffer: Float32Array;
  sourceRevision: string;
  featureValuesChecksum: string;
  canonicalAuthority: false;
  writesPerformed: false;
};

export function prepareUnifiedResidencyFeaturePackBatchV1(input: UnifiedResidencyFeaturePackInputV1): UnifiedResidencyFeaturePackResultV1[] {
  const pack = candidateFeatureGpuPackV1Schema.parse(input.pack);
  if (pack.logicalRows === 0) throw new Error('UNIFIED_RESIDENCY_FEATURE_PACK_EMPTY');
  return Array.from({ length: pack.logicalRows }, (_, ordinal) => {
    const sourceRevision = pack.sourceRevisions[ordinal];
    if (!sourceRevision) throw new Error(`UNIFIED_RESIDENCY_FEATURE_PACK_SOURCE_REVISION_MISSING:${ordinal}`);
    const start = ordinal * pack.featureCount;
    const featureBuffer = Float32Array.from(pack.featureValues.slice(start, start + pack.featureCount));
    const descriptor: UnifiedResidencyDescriptor = {
      schema: 'atlas.unified-residency.v1',
      residencyKey: '',
      kind: 'FEATURE_TILE',
      workspaceRevision: pack.workspaceRevision,
      sourceRevision,
      representationRevision: input.representationRevision,
      featureRevision: pack.featureRevision,
      modelRevision: input.modelRevision,
      tokenizerRevision: input.tokenizerRevision,
      ropeRevision: input.ropeRevision,
      candidateOrdinal: ordinal,
      artifactChecksum: pack.gpuPackChecksum,
      shape: [1, pack.featureCount],
      dtype: 'float32',
      byteLength: featureBuffer.byteLength,
      state: 'EMPTY',
    };
    descriptor.residencyKey = descriptorCacheKey(descriptor);
    validateUnifiedDescriptor(descriptor);
    return {
      descriptor,
      featureBuffer,
      sourceRevision,
      featureValuesChecksum: pack.featureValuesChecksum,
      canonicalAuthority: false,
      writesPerformed: false,
    };
  });
}

export function featurePackProviderV1(result: UnifiedResidencyFeaturePackResultV1): FeatureTileProvider {
  return {
    kind: 'FEATURE_TILE',
    async load(descriptor) {
      if (descriptor.residencyKey !== result.descriptor.residencyKey) throw new Error('UNIFIED_RESIDENCY_FEATURE_PACK_KEY_MISMATCH');
      if (descriptor.artifactChecksum !== result.descriptor.artifactChecksum) throw new Error('UNIFIED_RESIDENCY_FEATURE_PACK_ARTIFACT_MISMATCH');
      return { byteLength: result.featureBuffer.byteLength, buffer: result.featureBuffer };
    },
  };
}

export async function loadUnifiedResidencyFeaturePackV1(
  result: UnifiedResidencyFeaturePackResultV1,
  adapter = new UnifiedResidencyAdapter(),
): Promise<UnifiedResidencyDescriptor> {
  const provider = featurePackProviderV1(result);
  return adapter.load(result.descriptor, provider);
}

/** Lower the existing GPU feature pack without collapsing source revisions. */
export function prepareUnifiedResidencyFeaturePackV1(input: UnifiedResidencyFeaturePackInputV1): UnifiedResidencyFeaturePackResultV1 {
  const pack = candidateFeatureGpuPackV1Schema.parse(input.pack);
  if (pack.logicalRows === 0) throw new Error('UNIFIED_RESIDENCY_FEATURE_PACK_EMPTY');
  const sourceRevisions = [...new Set(pack.sourceRevisions)];
  if (sourceRevisions.length !== 1 || !sourceRevisions[0]) {
    throw new Error('UNIFIED_RESIDENCY_FEATURE_PACK_MIXED_SOURCE_REVISIONS');
  }
  const sourceRevision = sourceRevisions[0];
  const descriptor: UnifiedResidencyDescriptor = {
    schema: 'atlas.unified-residency.v1',
    residencyKey: '',
    kind: 'FEATURE_TILE',
    workspaceRevision: pack.workspaceRevision,
    sourceRevision,
    representationRevision: input.representationRevision,
    featureRevision: pack.featureRevision,
    modelRevision: input.modelRevision,
    tokenizerRevision: input.tokenizerRevision,
    ropeRevision: input.ropeRevision,
    // CandidateFeatureGpuPackV1 guarantees a dense logical ordinal prefix;
    // the tile anchor is therefore ordinal zero and the pack checksum binds
    // the complete ordered population.
    candidateOrdinal: 0,
    artifactChecksum: pack.gpuPackChecksum,
    shape: [pack.physicalRows, pack.featureCount],
    dtype: 'float32',
    byteLength: pack.featureValues.length * Float32Array.BYTES_PER_ELEMENT,
    state: 'EMPTY',
  };
  descriptor.residencyKey = descriptorCacheKey(descriptor);
  validateUnifiedDescriptor(descriptor);
  return {
    descriptor,
    featureBuffer: Float32Array.from(pack.featureValues),
    sourceRevision,
    featureValuesChecksum: pack.featureValuesChecksum,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}
