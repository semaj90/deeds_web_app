import type { GpuMemoryTelemetryV1 } from './gpu-residency-budget.js';

export interface AtlasRapidsHealthV1 {
  status: string;
  gpu?: {
    available?: boolean;
    device_name?: string | null;
    memory?: {
      free_mb?: number;
      total_mb?: number;
      used_mb?: number;
      error?: string;
    } | null;
  };
}

const MIB = 1024 * 1024;

export function createAtlasRapidsMemoryClient(
  baseUrl = process.env.ATLAS_RAPIDS_SIDECAR_URL ?? 'http://127.0.0.1:8098',
) {
  async function readTelemetry(timeoutMs = 1_500): Promise<GpuMemoryTelemetryV1 | null> {
    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/health`, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: 'application/json' },
      });
      if (!response.ok) return null;
      const body = (await response.json()) as AtlasRapidsHealthV1;
      const memory = body.gpu?.memory;
      if (!body.gpu?.available || !memory) return null;
      if (
        !Number.isFinite(memory.free_mb) ||
        !Number.isFinite(memory.total_mb) ||
        !Number.isFinite(memory.used_mb)
      ) {
        return null;
      }

      return {
        schema: 'atlas.gpu-memory-telemetry.v1',
        source: 'rapids-sidecar-cupy',
        capturedAt: new Date().toISOString(),
        totalVramBytes: Math.max(0, Math.trunc((memory.total_mb as number) * MIB)),
        freeVramBytes: Math.max(0, Math.trunc((memory.free_mb as number) * MIB)),
        usedVramBytes: Math.max(0, Math.trunc((memory.used_mb as number) * MIB)),
        deviceName: body.gpu?.device_name ?? null,
      };
    } catch {
      return null;
    }
  }

  return { readTelemetry };
}
