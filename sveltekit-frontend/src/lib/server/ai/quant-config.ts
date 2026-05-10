/**
 * QuantConfig — Parameters for TurboQuant and RotorQuant inference backends.
 * Based on Google ICLR 2026 (TurboQuant) and Scrya Mar 2026 (RotorQuant) specs.
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
