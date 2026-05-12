/**
 * inference-configs.ts — Quantization & Runtime Truth Layer
 * 
 * Centralized registry for verified inference backends. 
 * Distinguishes between stock binaries and specialized forks.
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
 * Stock GGUF on stock llama-server.exe. 
 * Note: IQ4_XS GGUF works, but specialized KV cache types (iso3) will not.
 */
export const STOCK_CUDA_IQ4_XS: QuantRuntimeConfig = {
  backend: 'stock-llama-cpp-cuda',
  weightQuant: 'IQ4_XS',
  kvCacheTypeK: 'q8_0',
  kvCacheTypeV: 'q8_0',
  runtimeAvailable: true,
  requiresFork: false,
  notes: 'Runs standard GGUF on stock llama.cpp CUDA. Does not enable RotorQuant KV cache.'
};

/** 
 * AtomicBot fork with turbo3/turbo4 KV cache and --mtp-head support.
 */
export const ATOMICBOT_TURBO3_MTP: QuantRuntimeConfig = {
  backend: 'atomicbot-turboquant',
  weightQuant: 'Q4_K_M',
  kvCacheTypeK: 'turbo3',
  kvCacheTypeV: 'turbo3',
  runtimeAvailable: false,
  requiresFork: true,
  notes: 'Requires AtomicBot llama.cpp fork with turbo3/turbo3 and optional --mtp-head.'
};

/** 
 * RotorQuant fork with Clifford rotors for extreme KV cache compression.
 */
export const ROTORQUANT_ISO3: QuantRuntimeConfig = {
  backend: 'rotorquant-fork',
  weightQuant: 'IQ4_XS',
  kvCacheTypeK: 'iso3',
  kvCacheTypeV: 'iso3',
  runtimeAvailable: false,
  requiresFork: true,
  notes: 'Requires RotorQuant-capable fork. Stock llama.cpp cannot use iso3/planar3 KV cache.'
};

export const RUNTIME_CONFIGS: Record<string, QuantRuntimeConfig> = {
  'stock-cuda': STOCK_CUDA_IQ4_XS,
  'atomicbot': ATOMICBOT_TURBO3_MTP,
  'rotorquant': ROTORQUANT_ISO3
};
