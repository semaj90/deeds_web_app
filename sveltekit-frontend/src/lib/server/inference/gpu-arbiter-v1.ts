import { z } from 'zod';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { ENV } from '$lib/server/env.server.js';

const execAsync = promisify(exec);

export const GpuLeaseTargetSchemaV1 = z.enum([
  'ornith-8090-vlm',         // Default: Ornith 1.5 9B on :8090 (~6.9 GiB VRAM)
  'rotorquant-e2b-8090',     // Server swap: Gemma 4 E2B RotorQuant IQ4_XS.gguf on :8090 (~2.2 GiB VRAM)
  'browser-webgpu-exclusive' // Unloads :8090 so Chrome WebGPU gets ~6.7 GiB free VRAM for ONNX / LiteRT-LM
]);

export type GpuLeaseTargetV1 = z.infer<typeof GpuLeaseTargetSchemaV1>;

export const GpuArbiterStateSchemaV1 = z.object({
  activeTarget: GpuLeaseTargetSchemaV1,
  ornithPort8090Status: z.enum(['UP', 'UNLOADED_FOR_WEBGPU', 'SWAPPED_ROTORQUANT', 'DOWN']),
  vramTotalMiB: z.literal(8192),
  vramEstimatedUsedMiB: z.number().int().nonnegative().nullable(),
  filteredOptionalProbes: z.array(z.string()).default([
    'decoder_model_merged_q4.onnx_data',
    'model.litertlm'
  ])
});

export type GpuArbiterStateV1 = z.infer<typeof GpuArbiterStateSchemaV1>;

export type InferenceSlotStatusV1 = {
  idle: boolean;
  slotCount: number;
  activeSlots: number;
  reason: 'verified_idle' | 'active_slots' | 'unknown_slots' | 'service_unavailable';
};

let currentTarget: GpuLeaseTargetV1 = 'ornith-8090-vlm';

export async function getInferenceSlotStatusV1(): Promise<InferenceSlotStatusV1> {
  try {
    const response = await fetch(`${ENV.TURBOQUANT_URL}/slots`, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) {
      return { idle: false, slotCount: 0, activeSlots: 0, reason: 'service_unavailable' };
    }
    const payload: unknown = await response.json();
    const slots = Array.isArray(payload)
      ? payload
      : typeof payload === 'object' && payload !== null && Array.isArray((payload as { slots?: unknown }).slots)
        ? (payload as { slots: unknown[] }).slots
        : null;
    if (!slots?.length || slots.some((slot) => typeof slot !== 'object' || slot === null || typeof (slot as { is_processing?: unknown }).is_processing !== 'boolean')) {
      return { idle: false, slotCount: slots?.length ?? 0, activeSlots: 0, reason: 'unknown_slots' };
    }
    const activeSlots = slots.filter((slot) => (slot as { is_processing: boolean }).is_processing).length;
    return {
      idle: activeSlots === 0,
      slotCount: slots.length,
      activeSlots,
      reason: activeSlots === 0 ? 'verified_idle' : 'active_slots',
    };
  } catch {
    return { idle: false, slotCount: 0, activeSlots: 0, reason: 'service_unavailable' };
  }
}

/** Probe active status on :8090 */
export async function probeOrnithStatus(): Promise<{
  status: 'UP' | 'UNLOADED_FOR_WEBGPU' | 'SWAPPED_ROTORQUANT' | 'DOWN';
  modelAlias?: string;
}> {
  try {
    const res = await fetch(`${ENV.TURBOQUANT_URL}/props`, {
      signal: AbortSignal.timeout(2000)
    });
    if (res.ok) {
      const data = await res.json() as { model_alias?: string };
      const alias = data.model_alias ?? '';
      if (alias.toLowerCase().includes('rotorquant') || alias.toLowerCase().includes('iq4xs')) {
        return { status: 'SWAPPED_ROTORQUANT', modelAlias: alias };
      }
      return { status: 'UP', modelAlias: alias };
    }
  } catch {
    // Port 8090 not responding
  }
  return {
    status: currentTarget === 'browser-webgpu-exclusive' ? 'UNLOADED_FOR_WEBGPU' : 'DOWN'
  };
}

/** Get estimated VRAM usage in MiB */
export async function getEstimatedVramMiB(): Promise<number | null> {
  try {
    const { stdout } = await execAsync('nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits');
    const val = parseInt(stdout.trim(), 10);
    if (!isNaN(val)) return val;
  } catch {
    // Fallback estimate
  }
  return null;
}

/** Retrieve complete arbiter state */
export async function getGpuArbiterState(): Promise<GpuArbiterStateV1> {
  const probe = await probeOrnithStatus();
  const vramUsed = await getEstimatedVramMiB();

  return GpuArbiterStateSchemaV1.parse({
    activeTarget: currentTarget,
    ornithPort8090Status: probe.status,
    vramTotalMiB: 8192,
    vramEstimatedUsedMiB: vramUsed,
    filteredOptionalProbes: [
      'decoder_model_merged_q4.onnx_data',
      'model.litertlm'
    ]
  });
}

/** Switch active lease target */
export async function switchGpuLeaseTarget(target: GpuLeaseTargetV1): Promise<GpuArbiterStateV1> {
  const repoRoot = path.resolve(process.cwd(), '..');

  if (target === 'browser-webgpu-exclusive') {
    // Stop :8090 gracefully using unload script
    try {
      const unloadScript = path.join(repoRoot, 'scripts', 'unload-ornith-vlm.ps1');
      await execAsync(`pwsh -NoProfile -ExecutionPolicy Bypass -File "${unloadScript}"`);
    } catch (err) {
      console.warn('[gpu-arbiter] Warning during unload:', err);
    }
    currentTarget = 'browser-webgpu-exclusive';
  } else if (target === 'ornith-8090-vlm') {
    // Launch Ornith 1.5 VLM on :8090
    try {
      const launchScript = path.join(repoRoot, 'scripts', 'launch-ornith-vlm.ps1');
      await execAsync(`pwsh -NoProfile -ExecutionPolicy Bypass -File "${launchScript}"`);
    } catch (err) {
      console.warn('[gpu-arbiter] Warning during launch:', err);
    }
    currentTarget = 'ornith-8090-vlm';
  } else if (target === 'rotorquant-e2b-8090') {
    // Unload existing and set target
    try {
      const unloadScript = path.join(repoRoot, 'scripts', 'unload-ornith-vlm.ps1');
      await execAsync(`pwsh -NoProfile -ExecutionPolicy Bypass -File "${unloadScript}"`);
    } catch {
      // Ignored
    }
    currentTarget = 'rotorquant-e2b-8090';
  }

  return getGpuArbiterState();
}
