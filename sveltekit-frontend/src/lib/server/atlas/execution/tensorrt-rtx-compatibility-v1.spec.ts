import { describe, expect, it } from 'vitest';
import { assessTensorRtRtxCompatibilityV1 } from './tensorrt-rtx-compatibility-v1.js';

describe('TensorRtRtxCompatibilityV1', () => {
  it('rejects the current CUDA 13.0 environment as unsupported/unmatched', () => {
    const result = assessTensorRtRtxCompatibilityV1({
      tensorRtRtxRevision: 'tensorrt-rtx:1.6',
      packageCudaLine: '13.4',
      installedCudaLine: '13.0',
    });
    expect(result.status).toBe('CUDA_LINE_MISMATCH');
    expect(result.promotionAllowed).toBe(false);
  });

  it('accepts only an exact supported package/toolkit line match', () => {
    expect(assessTensorRtRtxCompatibilityV1({
      tensorRtRtxRevision: 'tensorrt-rtx:1.6',
      packageCudaLine: '13.4',
      installedCudaLine: '13.4',
    }).status).toBe('MATCH');
    expect(assessTensorRtRtxCompatibilityV1({
      tensorRtRtxRevision: 'tensorrt-rtx:1.6',
      packageCudaLine: '12.9-update-1',
      installedCudaLine: '13.4',
    }).status).toBe('CUDA_LINE_MISMATCH');
  });

  it('fails closed when TensorRT-RTX is unavailable', () => {
    const result = assessTensorRtRtxCompatibilityV1({
      tensorRtRtxRevision: null,
      packageCudaLine: null,
      installedCudaLine: '13.0',
    });
    expect(result.status).toBe('PACKAGE_UNAVAILABLE');
    expect(result.canonicalAuthority).toBe(false);
    expect(result.writesPerformed).toBe(false);
  });
});
