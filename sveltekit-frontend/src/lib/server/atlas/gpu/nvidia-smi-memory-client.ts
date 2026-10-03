import { execFile } from 'node:child_process';
import type { GpuMemoryTelemetryV1 } from './gpu-residency-budget.js';

/**
 * HEADROOM-V2-03: admission-grade GPU memory producer. Runs `nvidia-smi` as a separate OS process, so the
 * reading is independent of any CUDA context (unlike `cudaMemGetInfo` / CuPy `mem_info`, which follow the
 * Windows WDDM Budget and overstated free VRAM ~20x on this host). Read-only: no writes, no GPU workload,
 * no CUDA context. Emits the existing `GpuMemoryTelemetryV1` vocabulary with `source: 'nvidia-smi'`.
 *
 * Failure semantics: any failure (binary missing, non-zero exit, timeout, unparseable or inconsistent
 * output) returns `null` = absent. Callers must treat absent as "no GPU admission", never as zero VRAM
 * to plan with and never as a cached "last known good" reading.
 */

const MIB = 1024 * 1024;

export type NvidiaSmiExecV1 = (args: readonly string[], timeoutMs: number) => Promise<string>;

const defaultExec: NvidiaSmiExecV1 = (args, timeoutMs) =>
  new Promise((resolve, reject) => {
    execFile('nvidia-smi', [...args], { timeout: timeoutMs, windowsHide: true }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });

/** Parse one `memory.free,memory.total,memory.used,name` CSV row (nounits, MiB) into telemetry. */
export function parseNvidiaSmiMemoryCsvV1(stdout: string, capturedAt: string): GpuMemoryTelemetryV1 | null {
  const row = stdout.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0);
  if (!row) return null;
  const parts = row.split(',');
  if (parts.length < 4) return null;
  const [free, total, used] = parts.slice(0, 3).map((part) => Number(part.trim()));
  const name = parts.slice(3).join(',').trim();
  const numbers = [free, total, used];
  if (numbers.some((value) => !Number.isFinite(value) || value < 0)) return null;
  if (total <= 0 || free > total || used > total) return null;
  return {
    schema: 'atlas.gpu-memory-telemetry.v1',
    source: 'nvidia-smi',
    capturedAt,
    totalVramBytes: Math.trunc(total * MIB),
    freeVramBytes: Math.trunc(free * MIB),
    usedVramBytes: Math.trunc(used * MIB),
    deviceName: name.length > 0 ? name : null,
  };
}

export function createNvidiaSmiMemoryClient(
  options: { exec?: NvidiaSmiExecV1; now?: () => Date; deviceIndex?: number } = {},
) {
  const exec = options.exec ?? defaultExec;
  const now = options.now ?? (() => new Date());
  const deviceIndex = Number.isInteger(options.deviceIndex) && (options.deviceIndex as number) >= 0 ? (options.deviceIndex as number) : 0;

  async function readTelemetry(timeoutMs = 2_000): Promise<GpuMemoryTelemetryV1 | null> {
    try {
      const stdout = await exec(
        ['--query-gpu=memory.free,memory.total,memory.used,name', '--format=csv,noheader,nounits', `--id=${deviceIndex}`],
        timeoutMs,
      );
      // Stamp the time AFTER the read completes so age is measured from the measurement, not the request.
      return parseNvidiaSmiMemoryCsvV1(stdout, now().toISOString());
    } catch {
      return null;
    }
  }

  return { readTelemetry };
}
