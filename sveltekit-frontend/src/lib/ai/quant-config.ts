/**
 * Quantization Reference: Gemma 4 E4B (May 12, 2026)
 * Verified mapping of quantization formats to runtime backends for the YorHA legal-AI stack.
 */

export type RuntimeBackend =
  | 'stock-llama-cpp-cuda'
  | 'ollama'
  | 'atomicbot-turboquant'
  | 'rotorquant-fork'
  | 'tensorrt-llm';

export interface QuantRuntimeConfig {
  backend: RuntimeBackend;
  modelPath?: string;
  llamaServerPath?: string;
  weightQuant?: 'IQ4_XS' | 'Q4_K_M' | 'Q8_0' | 'F16' | 'TQ4_1S' | 'TQ3_1S';
  kvCacheTypeK?: 'f16' | 'q8_0' | 'q4_0' | 'turbo3' | 'turbo4' | 'iso3' | 'planar3';
  kvCacheTypeV?: 'f16' | 'q8_0' | 'q4_0' | 'turbo3' | 'turbo4' | 'iso3' | 'planar3';
  mtpHeadPath?: string;
  runtimeAvailable: boolean;
  requiresFork: boolean;
  notes: string;
}

/**
 * Verified Runtime Configurations for Gemma 4 E4B
 */
export const VERIFIED_QUANT_CONFIGS: Record<string, QuantRuntimeConfig> = {
  'production-stable': {
    backend: 'stock-llama-cpp-cuda',
    weightQuant: 'Q4_K_M',
    kvCacheTypeK: 'q8_0',
    kvCacheTypeV: 'q8_0',
    runtimeAvailable: true,
    requiresFork: false,
    notes: 'Merged legal fine-tune. No LoRA needed. Blob: sha256-a79de882'
  },
  'atomicbot-high-throughput': {
    backend: 'atomicbot-turboquant',
    weightQuant: 'IQ4_XS',
    kvCacheTypeK: 'q8_0',
    kvCacheTypeV: 'turbo3',
    runtimeAvailable: true,
    requiresFork: true,
    notes: 'Requires AtomicBot binary + MTP sidecar for +30-50% throughput.'
  },
  'rotorquant-experimental': {
    backend: 'rotorquant-fork',
    weightQuant: 'IQ4_XS',
    kvCacheTypeK: 'iso3',
    kvCacheTypeV: 'planar3',
    runtimeAvailable: false,
    requiresFork: true,
    notes: 'Extreme KV compression via Clifford rotors. Experimental.'
  }
};
