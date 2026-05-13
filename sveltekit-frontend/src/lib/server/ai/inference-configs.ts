import type { QuantRuntimeConfig, RuntimeBackend } from '$lib/ai/quant-config.js';
import { VERIFIED_QUANT_CONFIGS } from '$lib/ai/quant-config.js';

export type { QuantRuntimeConfig, RuntimeBackend } from '$lib/ai/quant-config.js';

export type InferenceRuntimeConfig = QuantRuntimeConfig & {
	profile: string;
	turboQuant: boolean;
	rotorQuantKv: boolean;
};

/** 
 * Stock GGUF on stock llama-server.exe. 
 */
export const STOCK_CUDA_IQ4_XS: InferenceRuntimeConfig = {
	...VERIFIED_QUANT_CONFIGS['production-stable'],
	profile: 'stock-cuda-iq4_xs',
	weightQuant: 'IQ4_XS',
	modelPath: process.env.ROTORQUANT_MODEL_PATH ?? process.env.TURBO_MODEL_PATH ?? process.env.TURBOQUANT_MODEL_PATH,
	llamaServerPath: process.env.LLAMA_SERVER_PATH ?? process.env.TURBOQUANT_EXE_PATH,
	turboQuant: false,
	rotorQuantKv: false,
	notes: 'Stock llama.cpp CUDA + IQ4_XS weight-quantized GGUF. No TurboQuant KV, RotorQuant KV, AtomicBot, or MTP enabled.',
};

/** 
 * AtomicBot fork with turbo3/turbo4 KV cache and --mtp-head support.
 */
export const ATOMICBOT_TURBO3_MTP: InferenceRuntimeConfig = {
	...VERIFIED_QUANT_CONFIGS['atomicbot-high-throughput'],
	profile: 'atomicbot-turboquant',
	modelPath: process.env.ROTORQUANT_MODEL_PATH ?? process.env.TURBO_MODEL_PATH ?? process.env.TURBOQUANT_MODEL_PATH,
	llamaServerPath: process.env.LLAMA_SERVER_PATH ?? process.env.TURBOQUANT_EXE_PATH,
	mtpHeadPath: process.env.MTP_HEAD_PATH,
	turboQuant: true,
	rotorQuantKv: false,
};

/** 
 * RotorQuant fork with Clifford rotors for extreme KV cache compression.
 */
export const ROTORQUANT_ISO3: InferenceRuntimeConfig = {
	...VERIFIED_QUANT_CONFIGS['rotorquant-experimental'],
	profile: 'rotorquant-fork',
	modelPath: process.env.ROTORQUANT_MODEL_PATH ?? process.env.TURBO_MODEL_PATH ?? process.env.TURBOQUANT_MODEL_PATH,
	llamaServerPath: process.env.LLAMA_SERVER_PATH ?? process.env.TURBOQUANT_EXE_PATH,
	turboQuant: true,
	rotorQuantKv: true,
};

export const RUNTIME_CONFIGS: Record<string, InferenceRuntimeConfig> = {
	'stock-cuda': STOCK_CUDA_IQ4_XS,
	'atomicbot': ATOMICBOT_TURBO3_MTP,
	'rotorquant': ROTORQUANT_ISO3
};

export function resolveRuntimeConfig(): InferenceRuntimeConfig {
	const profile = (process.env.TURBO_PROFILE ?? 'stock').toLowerCase();
	if (profile === 'atomicbot') return ATOMICBOT_TURBO3_MTP;
	if (profile === 'rotorquant') return ROTORQUANT_ISO3;
	return STOCK_CUDA_IQ4_XS;
}
