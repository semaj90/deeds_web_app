import {
  GpuAdmissionReceiptV1Schema,
  RuntimeIdentityV1Schema,
  stableRoutingChecksum,
  type GpuAdmissionReceiptV1,
  type RuntimeIdentityV1,
} from './contracts.js';

export interface GpuTelemetrySample {
  totalVramBytes?: number | null;
  usedVramBytes?: number | null;
  freeVramBytes?: number | null;
  gpuUtilization?: number | null;
  memoryUtilization?: number | null;
  activeComputeProcesses?: number | null;
}

export function buildRuntimeIdentity(input: Omit<RuntimeIdentityV1, 'schemaVersion'>): RuntimeIdentityV1 {
  return RuntimeIdentityV1Schema.parse({ schemaVersion: 'atlas.runtime-identity.v1', ...input });
}

export function buildGpuAdmissionReceipt(input: {
  requestId: string;
  runtime: RuntimeIdentityV1;
  telemetry: GpuTelemetrySample;
  requestedVramBytes: number;
  reservedHeadroomBytes: number;
}): GpuAdmissionReceiptV1 {
  const free = input.telemetry.freeVramBytes ?? null;
  const telemetryMissing = free == null || input.runtime.telemetrySource === 'none';
  const required = Math.max(0, input.requestedVramBytes) + Math.max(0, input.reservedHeadroomBytes);

  let status: GpuAdmissionReceiptV1['status'];
  const reasonCodes: string[] = [];

  if (!input.runtime.gpuUuid || !input.runtime.deviceName) {
    status = 'CPU_FALLBACK';
    reasonCodes.push('GPU_IDENTITY_UNAVAILABLE');
  } else if (telemetryMissing) {
    status = 'DEGRADED_TELEMETRY';
    reasonCodes.push('FREE_VRAM_UNPROVEN');
  } else if (free! < required) {
    status = 'REJECT';
    reasonCodes.push('INSUFFICIENT_VRAM_HEADROOM');
  } else {
    status = 'ADMIT';
    reasonCodes.push('VRAM_HEADROOM_PROVEN');
  }

  if (input.runtime.wslDistro) reasonCodes.push('WSL_EXECUTION_IDENTITY_RECORDED');
  if (input.runtime.telemetrySource === 'nvml' || input.runtime.telemetrySource === 'mixed') {
    reasonCodes.push('NVML_TELEMETRY');
  }

  const payload = {
    schemaVersion: 'atlas.gpu-admission.v1' as const,
    requestId: input.requestId,
    runtime: input.runtime,
    totalVramBytes: input.telemetry.totalVramBytes ?? null,
    usedVramBytes: input.telemetry.usedVramBytes ?? null,
    freeVramBytes: free,
    gpuUtilization: input.telemetry.gpuUtilization ?? null,
    memoryUtilization: input.telemetry.memoryUtilization ?? null,
    activeComputeProcesses: input.telemetry.activeComputeProcesses ?? null,
    requestedVramBytes: Math.max(0, Math.floor(input.requestedVramBytes)),
    reservedHeadroomBytes: Math.max(0, Math.floor(input.reservedHeadroomBytes)),
    status,
    reasonCodes,
  };

  return GpuAdmissionReceiptV1Schema.parse({ ...payload, checksum: stableRoutingChecksum(payload) });
}
