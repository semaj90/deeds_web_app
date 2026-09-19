import { describe, expect, it } from 'vitest';
import {
  assertResidencyDescriptorCompatibleV1,
  buildResidencyDescriptorV1,
} from './residency-descriptor-v1.js';

const descriptor = () => buildResidencyDescriptorV1({
  modelRevision: 'model:r1',
  representationRevision: 'semantic_768:r1',
  graphRevision: 'graph:r1',
  featureRevision: 'features:r1',
  promptRevision: 'prompt:r1',
  gpuRevision: 'rtx-3060-ti:driver:r1',
  runtimeRevision: 'runtime:r1',
});

describe('ResidencyDescriptorV1', () => {
  it('accepts an exact descriptor-only cache replay', () => {
    const expected = descriptor();
    expect(() => assertResidencyDescriptorCompatibleV1(expected, { ...expected })).not.toThrow();
  });

  it.each([
    ['modelRevision', 'model:r2'],
    ['representationRevision', 'semantic_768:r2'],
    ['graphRevision', 'graph:r2'],
    ['featureRevision', 'features:r2'],
    ['promptRevision', 'prompt:r2'],
    ['gpuRevision', 'rtx-4090:driver:r1'],
    ['runtimeRevision', 'runtime:r2'],
  ] as const)('rejects a cache swap with mismatched %s', (field, value) => {
    const expected = descriptor();
    const actual = { ...expected, [field]: value, descriptorChecksum: 'a'.repeat(64) };
    expect(() => assertResidencyDescriptorCompatibleV1(expected, actual)).toThrow(
      `RESIDENCY_DESCRIPTOR_MISMATCH_${field.toUpperCase()}`,
    );
  });
});
