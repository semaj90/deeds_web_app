import { buildGpuAdmissionReceipt, buildRuntimeIdentity, type GpuTelemetrySample } from './gpu-admission.js';
import type { GpuAdmissionReceiptV1, RuntimeIdentityV1 } from './contracts.js';

interface RapidsHealthResponse {
  status?: string;
  gpu?: {
    available?: boolean;
    device_name?: string | null;
    memory?: { free_mb?: number; total_mb?: number; used_mb?: number; error?: string } | null;
  };
  packages?: Record<string, { available?: boolean; version?: string; cuda_available?: boolean }>;
}

const MIB = 1024 * 1024;

export interface RapidsRuntimeProbeConfig {
  baseUrl: string;
  hostOs: string;
  executionOs: string;
  wslDistro?: string | null;
  gpuUuid?: string | null;
  driverVersion?: string | null;
  cudaRuntime?: string | null;
  pythonEnv?: string | null;
  backendRevision: string;
  fetchImpl?: typeof fetch;
}

/**
 * Read-only adapter over the existing RAPIDS /health endpoint. WSL does not
 * guarantee all NVML utilization/process queries, so unsupported telemetry is
 * intentionally returned as null instead of zero.
 */
export async function probeRapidsRuntime(config: RapidsRuntimeProbeConfig): Promise<{
  runtime: RuntimeIdentityV1;
  telemetry: GpuTelemetrySample;
}> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const response = await fetchImpl(`${config.baseUrl.replace(/\/$/, '')}/health`, {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`RAPIDS_RUNTIME_HEALTH_FAILED:${response.status}`);
  const health = await response.json() as RapidsHealthResponse;
  const memory = health.gpu?.memory;
  const gpuAvailable = health.gpu?.available === true;

  const runtime = buildRuntimeIdentity({
    hostOs: config.hostOs,
    executionOs: config.executionOs,
    wslDistro: config.wslDistro ?? null,
    gpuUuid: gpuAvailable ? (config.gpuUuid ?? null) : null,
    deviceName: gpuAvailable ? (health.gpu?.device_name ?? null) : null,
    driverVersion: config.driverVersion ?? null,
    cudaRuntime: config.cudaRuntime ?? null,
    pythonEnv: config.pythonEnv ?? null,
    backendRevision: config.backendRevision,
    telemetrySource: memory && !memory.error ? 'cuda_runtime' : 'none',
  });

  const toBytes = (value: number | undefined): number | null => Number.isFinite(value) ? Math.floor(value! * MIB) : null;
  return {
    runtime,
    telemetry: {
      totalVramBytes: toBytes(memory?.total_mb),
      usedVramBytes: toBytes(memory?.used_mb),
      freeVramBytes: toBytes(memory?.free_mb),
      gpuUtilization: null,
      memoryUtilization: null,
      activeComputeProcesses: null,
    },
  };
}

export async function probeRapidsAdmission(input: {
  requestId: string;
  config: RapidsRuntimeProbeConfig;
  requestedVramBytes: number;
  reservedHeadroomBytes: number;
}): Promise<GpuAdmissionReceiptV1> {
  const { runtime, telemetry } = await probeRapidsRuntime(input.config);
  return buildGpuAdmissionReceipt({
    requestId: input.requestId,
    runtime,
    telemetry,
    requestedVramBytes: input.requestedVramBytes,
    reservedHeadroomBytes: input.reservedHeadroomBytes,
  });
}
