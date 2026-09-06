export const GPU_CAPABILITY_MATRIX_V1_SCHEMA = 'parent-atlas.gpu-capability-matrix.v1' as const;

export type GpuCapabilityV1 =
  | 'CUPY'
  | 'CUML_TRUNCATED_SVD'
  | 'CUVS_BRUTE_FORCE'
  | 'CUVS_CAGRA'
  | 'NX_CUGRAPH'
  | 'TENSORRT_RTX'
  | 'RTX_VIDEO_SR'
  | 'NIS'
  | 'DLSS_SUPER_RESOLUTION'
  | 'DLSS_RAY_RECONSTRUCTION';

export interface GpuCapabilityStateV1 {
  capability: GpuCapabilityV1;
  available: boolean;
  version?: string;
  executionClass: 'RETRIEVAL' | 'RECOMMENDATION' | 'GRAPH' | 'INFERENCE' | 'PRESENTATION';
  promotionAllowed: boolean;
  reason: string;
}

export interface GpuCapabilityMatrixV1 {
  schema: typeof GPU_CAPABILITY_MATRIX_V1_SCHEMA;
  gpuModel: string;
  computeCapability: string;
  checkedAt: string;
  capabilities: readonly GpuCapabilityStateV1[];
}

/**
 * Presentation capabilities must never be admitted as retrieval/reasoning executors.
 */
export function assertGpuCapabilityBoundaryV1(state: GpuCapabilityStateV1): void {
  if (
    state.executionClass === 'PRESENTATION' &&
    ['DLSS_SUPER_RESOLUTION', 'DLSS_RAY_RECONSTRUCTION', 'RTX_VIDEO_SR', 'NIS'].includes(
      state.capability
    ) &&
    state.promotionAllowed
  ) {
    throw new Error(`Presentation capability ${state.capability} cannot own retrieval truth`);
  }
}
