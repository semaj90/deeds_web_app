/**
 * QuantConfig — Parameters for TurboQuant and RotorQuant inference backends.
 * Based on Google ICLR 2026 (TurboQuant) and Scrya Mar 2026 (RotorQuant) specs.
 *
 * UNWIRED / NOT WIRED, DO NOT TRUST WITHOUT RECHECKING (found 2026-09-07):
 * Every export in this file has zero live callers (confirmed via repo-wide
 * grep). A DIFFERENT file with the identical basename,
 * `sveltekit-frontend/src/lib/ai/quant-config.ts` (note: `lib/ai/`, not
 * `lib/server/ai/`), is the real, live, actually-imported quantization config
 * (2 real importers: `lib/ai/model-ids.ts`, `lib/server/ai/inference-configs.ts`).
 * That file correctly marks its RotorQuant entry `runtimeAvailable: false,
 * requiresFork: true` -- this file's `getQuantStrategy()` unconditionally
 * recommends `ROTORQUANT_CONFIG` for any `gemma4`-named model with no such
 * availability check, which would be actively misleading if anything ever
 * imported it. Matches this repo's own `parent-atlas-kv-cache-adaptation-
 * research` audit finding that RotorQuant has no real runtime support without
 * an unbuilt fork. Flagged here (and in that OpenSpec change's tasks.md) per
 * this repo's Duplication Prevention rule -- not archived/deleted, since that
 * requires an explicit operator decision per this repo's archive-not-delete
 * convention. Do not wire this file up without first reconciling it against
 * `lib/ai/quant-config.ts`.
 */

export interface QuantParams {
  method: 'TurboQuant' | 'RotorQuant' | 'PlanarQuant';
  bitWidth: number;
  rotationType: 'Hadamard' | 'IsoQuant' | 'PolarQuant';
  residueQuant: boolean; // For 1-bit QJL residue
}

export const TURBOQUANT_CONFIG: QuantParams = {
  method: 'TurboQuant',
  bitWidth: 3.5, // 100% recall at 3.5-4 bits
  rotationType: 'PolarQuant',
  residueQuant: true
};

export const ROTORQUANT_CONFIG: QuantParams = {
  method: 'RotorQuant',
  bitWidth: 3, // Q4_K_M symmetric 3-bit
  rotationType: 'IsoQuant', // 4D quaternion rotation
  residueQuant: false
};

/**
 * Get the recommended quantization strategy for a given model size/task.
 */
export function getQuantStrategy(modelName: string): QuantParams {
  if (modelName.includes('gemma4')) return ROTORQUANT_CONFIG;
  return TURBOQUANT_CONFIG;
}
