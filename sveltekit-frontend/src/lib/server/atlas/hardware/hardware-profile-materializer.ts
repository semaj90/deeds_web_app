import {
  getCudaMemoryInfo,
  isCudaAvailable,
} from '$lib/server/gpu/libtorch-bridge.js';
import {
  HardwareArchitectureSchema,
  HardwareProfileV1Schema,
  type HardwareProfileV1,
} from '../contracts/hardware-specialization-v1.js';

export interface AuthoritativeGpuObservationV1 {
  deviceName: string;
  deviceUuid?: string | null;
  pciBusId?: string | null;
  computeCapabilityMajor: number;
  computeCapabilityMinor: number;
  totalVramBytes: number;
  source: 'cuda_runtime' | 'nvml' | 'nvidia_smi';
  driverVersion?: string | null;
  cudaRuntimeVersion?: string | null;
  libtorchVersion?: string | null;
}

export interface HardwareCapabilityObservationV1 {
  fp16: boolean;
  bf16: boolean;
  tf32: boolean;
  int8: boolean;
  fp8: boolean;
  fp4: boolean;
}

export interface MaterializeHardwareProfileInputV1 {
  profileId: string;
  producerRevision: string;
  observedAt?: string;
  authoritative: AuthoritativeGpuObservationV1;
  capabilities: HardwareCapabilityObservationV1;
}

/**
 * Materialize the target-device profile while keeping the native bridge's VRAM
 * telemetry advisory. A CUDA-positive bridge that reports 0 total bytes is not
 * allowed to overwrite an authoritative NVML / nvidia-smi / CUDA-runtime value.
 */
export function materializeHardwareProfileV1(
  input: MaterializeHardwareProfileInputV1,
): HardwareProfileV1 {
  const cudaAvailable = isCudaAvailable();
  const bridgeMemory = getCudaMemoryInfo();
  const bridgeMemoryTrustworthy = cudaAvailable && bridgeMemory.available && bridgeMemory.totalBytes > 0;

  const major = input.authoritative.computeCapabilityMajor;
  const minor = input.authoritative.computeCapabilityMinor;
  const architecture = HardwareArchitectureSchema.parse(`sm_${major}${minor}`);

  const vramSource = bridgeMemoryTrustworthy ? 'bridge' as const : input.authoritative.source;
  const vramTotalBytes = bridgeMemoryTrustworthy ? bridgeMemory.totalBytes : input.authoritative.totalVramBytes;

  return HardwareProfileV1Schema.parse({
    schema_version: 'atlas.hardware-profile.v1',
    profile_id: input.profileId,
    device_name: input.authoritative.deviceName,
    device_uuid: input.authoritative.deviceUuid ?? null,
    pci_bus_id: input.authoritative.pciBusId ?? null,
    architecture,
    compute_capability_major: major,
    compute_capability_minor: minor,
    vram_total_bytes: vramTotalBytes,
    vram_source: vramSource,
    driver_version: input.authoritative.driverVersion ?? null,
    cuda_runtime_version: input.authoritative.cudaRuntimeVersion ?? null,
    libtorch_version: input.authoritative.libtorchVersion ?? null,
    capabilities: input.capabilities,
    observed_at: input.observedAt ?? new Date().toISOString(),
    producer_revision: input.producerRevision,
  });
}
