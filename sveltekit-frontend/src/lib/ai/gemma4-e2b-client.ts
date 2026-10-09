/**
 * Gemma 4 E2B Client — 2.3B text generation in-browser via Transformers.js v4.
 *
 * Primary client-side LLM. Falls back to 270M ONNX (client-router handles fallback).
 *
 * Pipeline:
 *   1. Require independently verified GPU budget and offline admission (currently blocked)
 *   2. Load Gemma4ForConditionalGeneration with q4f16 + WebGPU
 *   3. Apply chat template → generate → stream tokens
 *   4. Cache synthesis results in IndexedDB for RAG/KAG/DAG responses
 *
 * Source: https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX
 */

import {
	CLIENT_E2B_MODEL_ID,
	CLIENT_E2B_DTYPE,
	CLIENT_E2B_DEVICE,
	CLIENT_E2B_MIN_GPU_MB
} from './model-ids.js';

// ── Types ────────────────────────────────────────────────────────────────

export interface E2BGenerateOptions {
	/** Maximum tokens to generate (default: 256) */
	maxNewTokens?: number;
	/** Sampling temperature (default: 0.7) */
	temperature?: number;
	/** Top-k sampling (default: 40) */
	topK?: number;
	/** Top-p (nucleus) sampling (default: 0.9) */
	topP?: number;
	/** Enable token-by-token streaming callback */
	onToken?: (token: string) => void;
	/** System prompt prepended to conversation */
	systemPrompt?: string;
}

export interface E2BGenerateResult {
	text: string;
	source: 'local-e2b';
	durationMs: number;
	tokensGenerated: number;
	tokPerSec: number;
}

export interface E2BStatus {
	available: boolean;
	loaded: boolean;
	gpuMemoryMB: number | null;
	reason: string;
}

// ── State ────────────────────────────────────────────────────────────────

let _model: any = null;
let _processor: any = null;
let _tokenizer: any = null;
let _loadPromise: Promise<void> | null = null;
let _loadError: string | null = null;

// ── GPU Memory Admission ────────────────────────────────────────────────
// WebGPU maxBufferSize and maxStorageBufferBindingSize are per-resource limits,
// NOT total/free VRAM. Until a separately verified allocation budget and an
// explicit offline model policy are provided, this entrypoint fails closed.
// Do not probe/request a GPUDevice and do not import Transformers.js on denial.
export function evaluateE2BMemoryAdmission(input: {
  browser: boolean;
  webgpu: boolean;
  minimumMB: number;
  verifiedFreeMB?: number | null;
}): E2BStatus {
  const loaded = _model !== null;
  if (!input.browser) return { available: false, loaded, gpuMemoryMB: null, reason: 'ssr' };
  if (!input.webgpu) return { available: false, loaded, gpuMemoryMB: null, reason: 'no-webgpu' };
  // Intentionally never infer available memory from adapter.limits.
  if (input.verifiedFreeMB == null || !Number.isFinite(input.verifiedFreeMB)) {
    return { available: false, loaded, gpuMemoryMB: null, reason: 'gpu-memory-unverified' };
  }
  if (input.verifiedFreeMB < input.minimumMB) {
    return { available: false, loaded, gpuMemoryMB: input.verifiedFreeMB, reason: 'gpu-memory-low' };
  }
  // Memory alone does not authorize a remote-model download or GPU allocation.
  return { available: false, loaded, gpuMemoryMB: input.verifiedFreeMB, reason: 'model-admission-unverified' };
}

// ── Model Loading ────────────────────────────────────────────────────────

/**
 * Check if E2B can run on this device (WebGPU available + sufficient memory).
 */
export async function isE2BAvailable(): Promise<E2BStatus> {
  return evaluateE2BMemoryAdmission({
    browser: typeof window !== 'undefined',
    webgpu: typeof navigator !== 'undefined' && !!navigator.gpu,
    minimumMB: CLIENT_E2B_MIN_GPU_MB
  });
}

/**
 * Initialize the E2B model. Memoized — safe to call multiple times.
 * Throws if WebGPU unavailable or GPU memory too low.
 */
export async function initE2B(): Promise<void> {
	if (_model) return;
	if (_loadPromise) return _loadPromise;

	_loadPromise = _initE2BInternal();
	_loadPromise.catch((err) => {
		_loadError = err?.message ?? String(err);
		_loadPromise = null;
	});

	return _loadPromise;
}

async function _initE2BInternal(): Promise<void> {
	const status = await isE2BAvailable();
	if (!status.available) {
		throw new Error(`[E2B] Not available: ${status.reason}`);
	}

	console.info(`[E2B] Loading Gemma 4 E2B (${CLIENT_E2B_DTYPE}) on ${CLIENT_E2B_DEVICE}...`);
	console.info(`[E2B] Verified GPU memory budget: ${status.gpuMemoryMB}MB`);

	const startMs = performance.now();

	// Dynamic import — @huggingface/transformers v4
	const transformers = await import('@huggingface/transformers');

	// Load processor (handles tokenization + chat template)
	// Transformers.js 4.2 does not declare AutoProcessor in its public type
	// surface, although the model family may expose it at runtime. Keep this
	// optional and fail closed when the installed build cannot provide it.
	const AutoProcessor = (transformers as typeof transformers & {
		AutoProcessor?: { from_pretrained: (modelId: string) => Promise<unknown> };
	}).AutoProcessor;
	if (!AutoProcessor) throw new Error('E2B_AUTOPROCESSOR_UNAVAILABLE');
	_processor = await AutoProcessor.from_pretrained(CLIENT_E2B_MODEL_ID);

	// Load tokenizer separately for decode operations
	_tokenizer = await transformers.AutoTokenizer.from_pretrained(CLIENT_E2B_MODEL_ID);

	// Load model with Q4F16 quantization on WebGPU
	_model = await (transformers as any).Gemma4ForConditionalGeneration.from_pretrained(
		CLIENT_E2B_MODEL_ID,
		{
			dtype: CLIENT_E2B_DTYPE,
			device: CLIENT_E2B_DEVICE,
		}
	);

	const loadMs = Math.round(performance.now() - startMs);
	console.info(`[E2B] Model loaded in ${loadMs}ms with ${CLIENT_E2B_DEVICE}`);
}

/** Check if E2B model is loaded and ready for inference */
export function isE2BReady(): boolean {
	return _model !== null && _processor !== null;
}

/** Get last load error message (if any) */
export function getE2BLoadError(): string | null {
	return _loadError;
}

// ── Text Generation ──────────────────────────────────────────────────────

/**
 * Generate text using E2B in-browser.
 *
 * @param userMessage - User's input text
 * @param conversationHistory - Prior messages for multi-turn context
 * @param options - Generation parameters
 * @returns Generated text with timing metrics
 */
export async function generateE2B(
	userMessage: string,
	conversationHistory: Array<{ role: string; content: string }> = [],
	options: E2BGenerateOptions = {}
): Promise<E2BGenerateResult> {
	if (!_model || !_processor || !_tokenizer) {
		throw new Error('[E2B] Model not loaded — call initE2B() first');
	}

	const {
		maxNewTokens = 256,
		temperature = 0.7,
		topK = 40,
		topP = 0.9,
		onToken,
		systemPrompt = 'You are a helpful legal AI assistant running locally in the browser. Provide concise, accurate responses.'
	} = options;

	// Build messages array for chat template
	const messages: Array<{ role: string; content: string | Array<{ type: string; text?: string }> }> = [];

	// Add system prompt
	if (systemPrompt) {
		messages.push({ role: 'system', content: systemPrompt });
	}

	// Add conversation history
	for (const msg of conversationHistory) {
		messages.push({ role: msg.role, content: msg.content });
	}

	// Add current user message
	messages.push({ role: 'user', content: userMessage });

	// Apply chat template via processor
	const inputs = await _processor(messages);

	const startMs = performance.now();

	// Generate with streaming callback
	let tokensGenerated = 0;
	const streamer = onToken
		? new (await import('@huggingface/transformers')).TextStreamer(_tokenizer, {
				skip_prompt: true,
				skip_special_tokens: true,
				callback_function: (text: string) => {
					tokensGenerated++;
					onToken(text);
				}
			})
		: undefined;

	const output = await _model.generate({
		...inputs,
		max_new_tokens: maxNewTokens,
		temperature,
		top_k: topK,
		top_p: topP,
		do_sample: temperature > 0,
		...(streamer ? { streamer } : {})
	});

	const durationMs = Math.round(performance.now() - startMs);

	// Decode output tokens (skip the prompt tokens)
	const promptLength = inputs.input_ids.dims[1];
	const generatedIds = output.slice(null, [promptLength, null]);
	const text = _tokenizer.batch_decode(generatedIds, { skip_special_tokens: true })[0]?.trim() ?? '';

	if (!onToken) {
		tokensGenerated = generatedIds.dims?.[1] ?? text.split(/\s+/).length;
	}

	const tokPerSec = durationMs > 0 ? Math.round((tokensGenerated / durationMs) * 1000 * 10) / 10 : 0;

	console.info(`[E2B] Generated ${tokensGenerated} tokens in ${durationMs}ms (${tokPerSec} tok/s)`);

	return {
		text,
		source: 'local-e2b',
		durationMs,
		tokensGenerated,
		tokPerSec
	};
}

// ── Cleanup ──────────────────────────────────────────────────────────────

/**
 * Unload E2B model to free GPU memory.
 * Call this when falling back to 270M or when the user navigates away.
 */
export async function unloadE2B(): Promise<void> {
	if (_model) {
		console.info('[E2B] Unloading model to free GPU memory...');
		try {
			// Dispose model if it has a dispose method
			if (typeof _model.dispose === 'function') {
				await _model.dispose();
			}
		} catch {
			// Best-effort cleanup
		}
		_model = null;
		_processor = null;
		_tokenizer = null;
		_loadPromise = null;
		_loadError = null;

		// Trigger GC hint
		if (typeof window !== 'undefined' && typeof window.gc === 'function') {
			window.gc();
		}
		console.info('[E2B] Model unloaded');
	}
}

// ── Playwright Test Hook ─────────────────────────────────────────────────

if (typeof window !== 'undefined') {
	const hook = {
		get ready() {
			return isE2BReady();
		},
		async checkAvailability() {
			return isE2BAvailable();
		},
		async init() {
			await initE2B();
			return { ready: isE2BReady() };
		},
		async generate(text: string) {
			const start = performance.now();
			const result = await generateE2B(text);
			return { ...result, totalMs: Math.round(performance.now() - start) };
		},
		async unload() {
			await unloadE2B();
			return { ready: isE2BReady() };
		}
	};
	(window as any).__deedsE2BInference = hook;
}
