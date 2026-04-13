/**
 * Gemma 4 E2B WebGPU Session Management
 *
 * Handles loading and caching of the Gemma 4 E2B 2.3B model via Transformers.js + WebGPU.
 * Model: onnx-community/gemma-4-E2B-it-ONNX (Q4F16, ~1.5GB)
 *
 * Architecture:
 *   - Transformers.js v4 (HuggingFace, browser-native inference)
 *   - WebGPU backend (GPU acceleration, ~1-2s for 200 tokens)
 *   - Auto-fallback to WASM if WebGPU unavailable
 *   - Lazy loading on first inference call
 *   - Singleton session (shared across app)
 */

import { CLIENT_E2B_MODEL_ID, CLIENT_E2B_DTYPE, CLIENT_E2B_DEVICE, CLIENT_E2B_MIN_GPU_MB } from '../model-ids.js';

// ══════════════════════════════════════════════════════════════
// Types (mirrors Transformers.js v4 API)
// ══════════════════════════════════════════════════════════════

interface TransformersModule {
	pipeline: (task: string, model: string, options?: any) => Promise<TextGenerationPipeline>;
	env: {
		allowLocalModels: boolean;
		backends: {
			onnx: {
				wasm: {
					numThreads?: number;
				};
			};
		};
	};
}

interface TextGenerationPipeline {
	(input: string, options?: GenerationOptions): Promise<Array<{ generated_text: string }>>;
	model: any;
	tokenizer: any;
	dispose?: () => Promise<void>;
}

interface GenerationOptions {
	max_new_tokens?: number;
	temperature?: number;
	top_p?: number;
	top_k?: number;
	do_sample?: boolean;
	repetition_penalty?: number;
	return_full_text?: boolean;
}

// ══════════════════════════════════════════════════════════════
// Session State
// ══════════════════════════════════════════════════════════════

let _transformers: TransformersModule | null = null;
let _pipeline: TextGenerationPipeline | null = null;
let _loadingPromise: Promise<TextGenerationPipeline | null> | null = null;
let _loadError: string | null = null;

/** Last load attempt timestamp (for rate limiting retries) */
let _lastLoadAttempt = 0;
const LOAD_RETRY_DELAY_MS = 30_000; // 30s between retry attempts

// ══════════════════════════════════════════════════════════════
// WebGPU Detection
// ══════════════════════════════════════════════════════════════

interface WebGPUInfo {
	available: boolean;
	adapterInfo?: {
		vendor: string;
		architecture: string;
		device: string;
		description: string;
	};
	limits?: {
		maxBufferSize: number;
		maxStorageBufferBindingSize: number;
	};
	estimatedVRAM?: number; // MB
}

/**
 * Check if WebGPU is available and get adapter info.
 * Returns null if WebGPU is not supported (Safari < 18, Firefox < 133, old Chrome).
 */
async function detectWebGPU(): Promise<WebGPUInfo | null> {
	if (typeof window === 'undefined' || !navigator.gpu) {
		return null;
	}

	try {
		const adapter = await (navigator.gpu as GPU).requestAdapter();
		if (!adapter) {
			return { available: false };
		}

		const adapterInfo = await adapter.requestAdapterInfo();
		const limits = adapter.limits;

		// Estimate VRAM from maxBufferSize (rough heuristic)
		const estimatedVRAM = Math.floor(limits.maxBufferSize / (1024 * 1024));

		return {
			available: true,
			adapterInfo: {
				vendor: adapterInfo.vendor || 'unknown',
				architecture: adapterInfo.architecture || 'unknown',
				device: adapterInfo.device || 'unknown',
				description: adapterInfo.description || 'unknown',
			},
			limits: {
				maxBufferSize: limits.maxBufferSize,
				maxStorageBufferBindingSize: limits.maxStorageBufferBindingSize,
			},
			estimatedVRAM,
		};
	} catch (err) {
		console.warn('[e2b-session] WebGPU detection failed:', err);
		return { available: false };
	}
}

/**
 * Check if WebGPU adapter has enough memory for E2B (2.3B params, Q4F16 ~1.5GB).
 * Minimum: 2GB adapter memory recommended.
 */
async function hasEnoughVRAM(): Promise<boolean> {
	const info = await detectWebGPU();
	if (!info || !info.available || !info.estimatedVRAM) {
		return false;
	}

	return info.estimatedVRAM >= CLIENT_E2B_MIN_GPU_MB;
}

// ══════════════════════════════════════════════════════════════
// Session Loading
// ══════════════════════════════════════════════════════════════

/**
 * Load Transformers.js library dynamically (lazy import).
 * This avoids loading the 2.5MB library until E2B is actually needed.
 */
async function loadTransformersLibrary(): Promise<TransformersModule | null> {
	if (_transformers) return _transformers;

	try {
		// Dynamic import — bundles Transformers.js as async chunk
		const module = await import('@huggingface/transformers');

		// Configure Transformers.js environment
		module.env.allowLocalModels = true; // Allow loading from static/ directory

		// WASM backend config (fallback if WebGPU fails)
		module.env.backends.onnx.wasm.numThreads = navigator.hardwareConcurrency || 4;

		_transformers = module as unknown as TransformersModule;
		return _transformers;
	} catch (err) {
		console.error('[e2b-session] Failed to load Transformers.js:', err);
		_loadError = err instanceof Error ? err.message : 'Transformers.js load failed';
		return null;
	}
}

/**
 * Load Gemma 4 E2B model and create text generation pipeline.
 * First call takes ~5-10s (model download + compilation).
 * Subsequent calls return cached pipeline instantly.
 */
async function loadE2bPipeline(): Promise<TextGenerationPipeline | null> {
	// Rate limiting — prevent rapid retry spam
	const now = Date.now();
	if (_loadError && now - _lastLoadAttempt < LOAD_RETRY_DELAY_MS) {
		console.warn(
			`[e2b-session] Load failed recently (${Math.round((now - _lastLoadAttempt) / 1000)}s ago), skipping retry`
		);
		return null;
	}

	_lastLoadAttempt = now;

	try {
		// Step 1: Load Transformers.js library
		const transformers = await loadTransformersLibrary();
		if (!transformers) return null;

		// Step 2: Check WebGPU availability
		const webgpuInfo = await detectWebGPU();
		if (!webgpuInfo || !webgpuInfo.available) {
			console.warn('[e2b-session] WebGPU not available — E2B requires GPU acceleration');
			_loadError = 'WebGPU not available (browser too old or no GPU)';
			return null;
		}

		// Step 3: Check VRAM
		const vramOk = await hasEnoughVRAM();
		if (!vramOk) {
			console.warn(
				`[e2b-session] Insufficient VRAM — need ${CLIENT_E2B_MIN_GPU_MB}MB, have ${webgpuInfo.estimatedVRAM ?? 0}MB`
			);
			_loadError = `Insufficient VRAM (need ${CLIENT_E2B_MIN_GPU_MB}MB)`;
			return null;
		}

		console.info('[e2b-session] Loading Gemma 4 E2B model...', {
			model: CLIENT_E2B_MODEL_ID,
			dtype: CLIENT_E2B_DTYPE,
			device: CLIENT_E2B_DEVICE,
			gpu: webgpuInfo.adapterInfo?.description,
		});

		// Step 4: Create text-generation pipeline
		const pipeline = await transformers.pipeline('text-generation', CLIENT_E2B_MODEL_ID, {
			dtype: CLIENT_E2B_DTYPE, // Q4F16 quantization
			device: CLIENT_E2B_DEVICE, // 'webgpu' (preferred) or 'wasm' (fallback)
		});

		console.info('[e2b-session] ✅ Gemma 4 E2B loaded successfully');
		_loadError = null;
		return pipeline;
	} catch (err) {
		console.error('[e2b-session] Failed to load E2B pipeline:', err);
		_loadError = err instanceof Error ? err.message : 'Pipeline load failed';
		return null;
	}
}

// ══════════════════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════════════════

/**
 * Get or create E2B session (singleton).
 * First call triggers model download + compilation (~5-10s).
 * Subsequent calls return cached session instantly.
 *
 * Returns null if:
 *   - SSR context (window undefined)
 *   - WebGPU not available
 *   - Insufficient VRAM
 *   - Model load failed
 */
export async function getE2bSession(): Promise<TextGenerationPipeline | null> {
	// SSR guard
	if (typeof window === 'undefined') {
		return null;
	}

	// Already loaded
	if (_pipeline) {
		return _pipeline;
	}

	// Already loading (dedupe concurrent calls)
	if (_loadingPromise) {
		return _loadingPromise;
	}

	// Start loading
	_loadingPromise = loadE2bPipeline();
	_pipeline = await _loadingPromise;
	_loadingPromise = null;

	return _pipeline;
}

/**
 * Check if E2B session is ready (loaded and available).
 * Non-blocking — returns cached status instantly.
 */
export function isE2bSessionReady(): boolean {
	return _pipeline !== null;
}

/**
 * Get WebGPU info (for diagnostics).
 * Returns null if WebGPU is not available.
 */
export async function getWebGPUInfo(): Promise<WebGPUInfo | null> {
	return detectWebGPU();
}

/**
 * Get last load error (if any).
 * Returns null if no error or session loaded successfully.
 */
export function getE2bLoadError(): string | null {
	return _loadError;
}

/**
 * Unload E2B session and free memory.
 * Call this when navigating away or when model is no longer needed.
 */
export async function disposeE2bSession(): Promise<void> {
	if (_pipeline?.dispose) {
		try {
			await _pipeline.dispose();
			console.info('[e2b-session] Session disposed');
		} catch (err) {
			console.warn('[e2b-session] Dispose failed:', err);
		}
	}

	_pipeline = null;
	_loadingPromise = null;
	// Don't clear _transformers — library can be reused
}