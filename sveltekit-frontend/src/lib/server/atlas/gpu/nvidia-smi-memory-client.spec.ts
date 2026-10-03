import { describe, expect, it } from 'vitest';
import { createNvidiaSmiMemoryClient, parseNvidiaSmiMemoryCsvV1 } from './nvidia-smi-memory-client';

const MIB = 1024 * 1024;
const capturedAt = '2026-10-03T12:00:00.000Z';

describe('parseNvidiaSmiMemoryCsvV1', () => {
  it('parses a real-shaped row (MiB, nounits) into GpuMemoryTelemetryV1 with source nvidia-smi', () => {
    const telemetry = parseNvidiaSmiMemoryCsvV1('325, 8192, 7700, NVIDIA GeForce RTX 3060 Ti\n', capturedAt);
    expect(telemetry).toEqual({
      schema: 'atlas.gpu-memory-telemetry.v1',
      source: 'nvidia-smi',
      capturedAt,
      totalVramBytes: 8192 * MIB,
      freeVramBytes: 325 * MIB,
      usedVramBytes: 7700 * MIB,
      deviceName: 'NVIDIA GeForce RTX 3060 Ti',
    });
  });

  it('tolerates CRLF, blank leading lines and a device name containing a comma', () => {
    const telemetry = parseNvidiaSmiMemoryCsvV1('\r\n1024, 8192, 7000, GPU, Special Edition\r\n', capturedAt);
    expect(telemetry?.freeVramBytes).toBe(1024 * MIB);
    expect(telemetry?.deviceName).toBe('GPU, Special Edition');
  });

  it('rejects unparseable or inconsistent output (absent, never guessed)', () => {
    for (const bad of ['', '   \n', 'No devices were found', 'a, b, c, d', '1, 2', '-1, 8192, 100, X', '9000, 8192, 100, X', '100, 0, 0, X', '100, 8192, 9000, X']) {
      expect(parseNvidiaSmiMemoryCsvV1(bad, capturedAt), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('createNvidiaSmiMemoryClient', () => {
  it('queries the requested device with a timeout and stamps the time after the read', async () => {
    const calls: Array<{ args: readonly string[]; timeoutMs: number }> = [];
    let tick = 0;
    const client = createNvidiaSmiMemoryClient({
      deviceIndex: 1,
      exec: async (args, timeoutMs) => {
        calls.push({ args, timeoutMs });
        return '2048, 8192, 6000, Test GPU';
      },
      now: () => new Date(Date.parse(capturedAt) + 1000 * tick++),
    });
    const telemetry = await client.readTelemetry(1500);
    expect(telemetry?.source).toBe('nvidia-smi');
    expect(telemetry?.capturedAt).toBe(capturedAt);
    expect(calls).toHaveLength(1);
    expect(calls[0].timeoutMs).toBe(1500);
    expect(calls[0].args).toContain('--id=1');
    expect(calls[0].args.join(' ')).toContain('memory.free,memory.total,memory.used,name');
  });

  it('returns null when nvidia-smi throws (missing binary, non-zero exit, timeout)', async () => {
    const client = createNvidiaSmiMemoryClient({
      exec: async () => {
        throw Object.assign(new Error('spawn nvidia-smi ENOENT'), { code: 'ENOENT' });
      },
    });
    expect(await client.readTelemetry()).toBeNull();
  });

  it('returns null on garbage output', async () => {
    const client = createNvidiaSmiMemoryClient({ exec: async () => 'Failed to initialize NVML' });
    expect(await client.readTelemetry()).toBeNull();
  });
});
