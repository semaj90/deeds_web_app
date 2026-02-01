/// <reference types="vite/client" />
import { default as clampMemoryMB, default as normalizePerformanceProfile } from '$lib/gpu/types';

// Raw environment (unvalidated)
const RAW_ENV = {
	OLLAMA_URL: import.meta.env.OLLAMA_URL,
	OLLAMA_MODEL: import.meta.env.OLLAMA_MODEL,
	OPENAI_API_KEY: import.meta.env.OPENAI_API_KEY,
	DATABASE_URL: import.meta.env.DATABASE_URL,
	PUBLIC_APP_URL: import.meta.env.PUBLIC_APP_URL,
	VITE_GPU_ACCELERATION: import.meta.env.VITE_GPU_ACCELERATION,
	VITE_WEBGPU_ENABLED: import.meta.env.VITE_WEBGPU_ENABLED,
	VITE_NES_QUANTIZATION: import.meta.env.VITE_NES_QUANTIZATION,
	VITE_GPU_MEMORY_LIMIT: import.meta.env.VITE_GPU_MEMORY_LIMIT,
	VITE_PERFORMANCE_PROFILE: import.meta.env.VITE_PERFORMANCE_PROFILE,
	VITE_GPU_DEBUG: import.meta.env.VITE_GPU_DEBUG,
	VITE_SHADER_DEBUG: import.meta.env.VITE_SHADER_DEBUG,
	VITE_REDUCTION_MODE: import.meta.env.VITE_REDUCTION_MODE
};

export interface EnvConfig {
	OLLAMA_URL: string;, OLLAMA_MODEL: string;
	OPENAI_API_KEY: string;, DATABASE_URL: string;
	PUBLIC_APP_URL: string;, GPU_ACCELERATION: boolean;
	WEBGPU_ENABLED: boolean;, NES_QUANTIZATION: boolean;
	GPU_MEMORY_LIMIT: number; // MB
	PERFORMANCE_PROFILE: 'auto' | 'mobile' | 'desktop' | 'high-end';
	GPU_DEBUG: boolean;, SHADER_DEBUG: boolean;
	REDUCTION_MODE: 'auto' | 'gpu' | 'cpu';
}

function coerceBoolean(_value: string | undefined, defaultValue: boolean): boolean {
	if (_value === undefined) return defaultValue;
	return !(_value.toLowerCase() === 'false' || _value === '0' || _value.toLowerCase() === 'off');
}

function validateAndBuildEnv(): EnvConfig {
	const memoryMB = clampMemoryMB(parseInt(RAW_ENV?.VITE_GPU_MEMORY_LIMIT ?? '512', 10));
	const profile = normalizePerformanceProfile(RAW_ENV.VITE_PERFORMANCE_PROFILE);

	const cfg: EnvConfig = {
		OLLAMA_URL: RAW_ENV?.OLLAMA_URL ?? 'http://localhost:8086',
		OLLAMA_MODEL: RAW_ENV?.OLLAMA_MODEL ?? 'gemma3:legal-latest',
		OPENAI_API_KEY: RAW_ENV?.OPENAI_API_KEY ?? '',
		DATABASE_URL: RAW_ENV?.DATABASE_URL ?? '',
		PUBLIC_APP_URL: RAW_ENV?.PUBLIC_APP_URL ?? 'http://localhost:5173',
		GPU_ACCELERATION: coerceBoolean(RAW_ENV.VITE_GPU_ACCELERATION, true),
		WEBGPU_ENABLED: coerceBoolean(RAW_ENV.VITE_WEBGPU_ENABLED, true),
		NES_QUANTIZATION: coerceBoolean(RAW_ENV.VITE_NES_QUANTIZATION, true),
		GPU_MEMORY_LIMIT: memoryMB,
		PERFORMANCE_PROFILE: profile,
		GPU_DEBUG: RAW_ENV.VITE_GPU_DEBUG === 'true',
		SHADER_DEBUG: RAW_ENV.VITE_SHADER_DEBUG === 'true',
		REDUCTION_MODE: (RAW_ENV.VITE_REDUCTION_MODE === 'gpu' || RAW_ENV.VITE_REDUCTION_MODE === 'cpu') ? RAW_ENV.VITE_REDUCTION_MODE : 'auto'
	};

	if (cfg.GPU_DEBUG) {
		console.log('[ENV] Loaded configuration', cfg);
	}

	return cfg;
}

export const ENV_CONFIG: EnvConfig = validateAndBuildEnv();

// Client-safe environment access with GPU configuration
export const CLIENT_ENV = Object.freeze({
	OLLAMA_URL: typeof window !== 'undefined' ? 'http://localhost:8086' : ENV_CONFIG.OLLAMA_URL,
	APP_URL: ENV_CONFIG.PUBLIC_APP_URL,
	GPU_ACCELERATION: ENV_CONFIG.GPU_ACCELERATION,
	WEBGPU_ENABLED: ENV_CONFIG.WEBGPU_ENABLED,
	NES_QUANTIZATION: ENV_CONFIG.NES_QUANTIZATION,
	GPU_MEMORY_LIMIT: ENV_CONFIG.GPU_MEMORY_LIMIT,
	PERFORMANCE_PROFILE: ENV_CONFIG.PERFORMANCE_PROFILE,
	GPU_DEBUG: ENV_CONFIG.GPU_DEBUG,
	SHADER_DEBUG: ENV_CONFIG.SHADER_DEBUG,
	REDUCTION_MODE: ENV_CONFIG.REDUCTION_MODE
});

export const GPU_CONFIG = Object.freeze({
	// Context preferences
	preferWebGPU: CLIENT_ENV.WEBGPU_ENABLED,
	allowWebGL2: true,
	allowWebGL1: true,
	requireCompute: false,

	// NES memory optimization
	nesMemoryOptimization: CLIENT_ENV.NES_QUANTIZATION,
	lodSystemIntegration: true,

	// Performance settings
	memoryLimit: CLIENT_ENV.GPU_MEMORY_LIMIT * 1024 * 1024, // Convert MB to bytes
	performanceProfile: CLIENT_ENV.PERFORMANCE_PROFILE as 'auto' | 'mobile' | 'desktop' | 'high-end',

	// Debug configuration
	enableDebug: CLIENT_ENV.GPU_DEBUG,
	enableShaderDebug: CLIENT_ENV.SHADER_DEBUG,

	// Fallback behavior
	gracefulFallback: true,
	fallbackToSoftware: true,

	// NES-specific settings
	nesColorPaletteSize: 52,
	nesDithering: true,
	nesPixelPerfect: true,
	reductionMode: CLIENT_ENV.REDUCTION_MODE
});

export default ENV_CONFIG;
