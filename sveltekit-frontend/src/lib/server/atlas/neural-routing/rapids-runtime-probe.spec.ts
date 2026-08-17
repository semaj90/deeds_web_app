import { describe, expect, it } from 'vitest';
import { probeRapidsAdmission, probeRapidsRuntime } from './rapids-runtime-probe.js';

function fakeFetch(payload: unknown, ok = true): typeof fetch {
  return (async () => new Response(JSON.stringify(payload), {
    status: ok ? 200 : 503,
    headers: { 'content-type': 'application/json' },
  })) as typeof fetch;
}

describe('RAPIDS runtime probe', () => {
  const config = {
    baseUrl: 'http://rapids.test:8098',
    hostOs: 'windows',
    executionOs: 'linux-wsl2',
    wslDistro: 'Ubuntu',
    gpuUuid: 'GPU-fixture',
    driverVersion: 'fixture-driver',
    cudaRuntime: '13.3',
    pythonEnv: 'atlas-rapids-cu13',
    backendRevision: 'fixture-revision',
  };

  it('maps sidecar memory telemetry without inventing unavailable utilization fields', async () => {
    const result = await probeRapidsRuntime({
      ...config,
      fetchImpl: fakeFetch({
        status: 'ok',
        gpu: {
          available: true,
          device_name: 'NVIDIA RTX fixture',
          memory: { free_mb: 4096, total_mb: 8192, used_mb: 4096 },
        },
      }),
    });
    expect(result.runtime.hostOs).toBe('windows');
    expect(result.runtime.executionOs).toBe('linux-wsl2');
    expect(result.runtime.telemetrySource).toBe('cuda_runtime');
    expect(result.telemetry.totalVramBytes).toBe(8192 * 1024 * 1024);
    expect(result.telemetry.gpuUtilization).toBeNull();
    expect(result.telemetry.activeComputeProcesses).toBeNull();
  });

  it('feeds measured free VRAM into the admission gate', async () => {
    const receipt = await probeRapidsAdmission({
      requestId: 'req-1',
      config: {
        ...config,
        fetchImpl: fakeFetch({
          status: 'ok',
          gpu: {
            available: true,
            device_name: 'NVIDIA RTX fixture',
            memory: { free_mb: 2048, total_mb: 8192, used_mb: 6144 },
          },
        }),
      },
      requestedVramBytes: 1024 * 1024 * 1024,
      reservedHeadroomBytes: 512 * 1024 * 1024,
    });
    expect(receipt.status).toBe('ADMIT');
  });

  it('fails the health probe when the RAPIDS sidecar is unavailable', async () => {
    await expect(probeRapidsRuntime({ ...config, fetchImpl: fakeFetch({}, false) }))
      .rejects.toThrow('RAPIDS_RUNTIME_HEALTH_FAILED:503');
  });
});
