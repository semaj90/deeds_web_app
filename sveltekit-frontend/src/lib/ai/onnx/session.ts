/**
 * ONNX Runtime Session Factory — deterministic WebGPU → WASM → CPU fallback.
 *
 * Usage:
 *   import { getOnnxSession, getActiveProvider } from '$lib/ai/onnx/session.js';
 *   const session = await getOnnxSession('/gemma3_270m_onnx/gemma3_270m_w8a16.onnx');
 *   const results = await session.run(feeds);
 *
 * Sessions are memoized by URL — calling getOnnxSession twice with the same
 * path returns the same InferenceSession without re-downloading the model.
 */

import { ONNX_EXECUTION_PROVIDERS } from '../model-ids.js';

// Lazy-loaded onnxruntime-web (only imported in browser). Keep separate module
// handles because the official WebGPU entrypoint selects the WebGPU bundle,
// while the base entrypoint is the portable WASM/CPU fallback.
type OrtRuntime = typeof import('onnxruntime-web');
let ort: OrtRuntime | null = null;
let ortWebGpu: OrtRuntime | null = null;

/** Which execution provider was actually used for each session */
const providerMap = new Map<string, string>();

/** In-flight + resolved session promises (memoization) */
const sessionCache = new Map<string, Promise<any>>();

/**
 * ArrayBuffer pool for model weights.
 * Re-uses the fetched model binary so the 418MB gemma3 ONNX isn't re-downloaded
 * if the session is evicted and re-created (e.g. after a GPU device lost event).
 * Key: modelUrl → ArrayBuffer. Shared across session re-creations.
 *
 * Memory: model is ~418MB but typed as ArrayBuffer (off-heap, not counted in
 * V8 heap stats). Two concurrent fetches of the same model will race — the
 * second one writes the same bytes to the same key (idempotent, safe).
 */
const modelBufferCache = new Map<string, ArrayBuffer>();

/**
 * WebGPU device singleton — created once, reused across sessions.
 * Device creation involves GPU pipeline compilation; reusing it cuts
 * ~200ms from every subsequent session creation.
 *
 * Set to null when the device is lost (handled by devicelost event in layout).
 */
let _gpuDevice: GPUDevice | null = null;

/** Get or create the shared WebGPU device (browser only). */
async function getWebGPUDevice(): Promise<GPUDevice | null> {
	if (typeof navigator === 'undefined' || !navigator.gpu) return null;
	if (_gpuDevice && !_gpuDevice.lost) return _gpuDevice;

	try {
		const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
		if (!adapter) return null;

		_gpuDevice = await adapter.requestDevice({
			requiredLimits: {
				// Request max buffer size for large embedding matrices
				maxBufferSize: Math.min(
					adapter.limits.maxBufferSize,
					512 * 1024 * 1024 // cap at 512 MB
				),
			},
		});

		// Auto-null on device loss so the next call re-creates
		_gpuDevice.lost.then(() => { _gpuDevice = null; });

		return _gpuDevice;
	} catch {
		return null;
	}
}

/**
 * Invalidate the cached GPU device (call when handling webgpudevicelost events).
 * The next call to getOnnxSession() or getWebGPUDevice() will request a new device.
 */
export function invalidateGPUDevice(): void {
	_gpuDevice = null;
}

/**
 * Load onnxruntime-web lazily and configure WASM paths.
 * WASM binaries are served from /ort/ in static/ — copy them there
 * from node_modules/onnxruntime-web/dist/ if missing.
 */
async function ensureOrt(useWebGpu = false): Promise<OrtRuntime> {
	if (useWebGpu && ortWebGpu) return ortWebGpu;
	if (!useWebGpu && ort) return ort;

	// Provide global require polyfill for onnxruntime-web's CJS compatibility code.
	// ORT's minified bundle checks `typeof require<"u"` — if require is undefined it
	// falls through to a Proxy that throws "Dynamic require not supported". By providing
	// a real require that returns shims for Node.js builtins, ORT initializes cleanly.
	if (typeof globalThis.require === 'undefined') {
		const shims: Record<string, unknown> = {
			worker_threads: { Worker: undefined, parentPort: null, isMainThread: true, workerData: undefined, threadId: 0 },
			module: { createRequire: () => () => ({}) },
			path: { join: (...a: string[]) => a.join('/'), resolve: (...a: string[]) => a.join('/'), dirname: () => '' },
			fs: { readFileSync: () => null, existsSync: () => false },
			os: { cpus: () => [{}] },
		};
		(globalThis as any).require = (id: string) => shims[id] || {};
	}

	const runtime = useWebGpu
		? await import('onnxruntime-web/webgpu')
		: await import('onnxruntime-web');
	// Point WASM loader at static/ort/ so it finds .wasm files
	runtime.env.wasm.wasmPaths = '/ort/';
	// Force single-threaded WASM to avoid SharedArrayBuffer issues in headless browsers
	runtime.env.wasm.numThreads = 1;
	if (useWebGpu) ortWebGpu = runtime;
	else ort = runtime;
	return runtime;
}

/**
 * Determine which execution providers are available in this browser.
 * Returns them in priority order: WebGPU (Dawn) → WASM.
 *
 * ONNX Runtime Web has no distinct 'cpu' execution provider -- CPU execution
 * IS the WASM backend (single-threaded, non-SIMD path within the same 'wasm'
 * EP). A prior version of this function pushed a literal 'cpu' string as a
 * fallback, which ORT Web does not recognize as a valid EP name (fixed
 * 2026-09-07, see ONNX_EXECUTION_PROVIDERS in model-ids.ts).
 */
export function getAvailableProviders(): string[] {
	const available: string[] = [];
	for (const ep of ONNX_EXECUTION_PROVIDERS) {
		if (ep === 'webgpu' && typeof navigator !== 'undefined' && navigator.gpu != null) {
			available.push('webgpu');
		} else if (ep === 'wasm') {
			available.push('wasm');
		}
	}
	return available.length > 0 ? available : ['wasm'];
}

/**
 * Create or retrieve a memoized InferenceSession for the given model URL.
 *
 * @param modelUrl - Path to .onnx file (e.g. '/gemma3_270m_onnx/gemma3_270m_w8a16.onnx')
 * @param preferredEps - Override execution provider priority (default: auto-detect)
 * @returns InferenceSession ready for .run()
 */
export async function getOnnxSession(
	modelUrl: string,
	preferredEps?: string[]
): Promise<any> {
	if (typeof window === 'undefined') {
		throw new Error('getOnnxSession() is browser-only — cannot run on server');
	}

	// Return memoized session if already loaded/loading
	const cached = sessionCache.get(modelUrl);
	if (cached) return cached;

	const promise = _createSession(modelUrl, preferredEps);
	sessionCache.set(modelUrl, promise);

	// If creation fails, remove from cache so next call retries
	promise.catch(() => sessionCache.delete(modelUrl));

	return promise;
}

/**
 * Run a dummy inference to warm up the session's GPU/WASM pipeline.
 * Ported from Python embedding_service_cuda.py — primes GPU caches and JIT
 * compilation so the first real inference doesn't pay the cold-start penalty.
 */
async function warmupSession(session: any, runtime: typeof import('onnxruntime-web')): Promise<void> {
	try {
		const inputNames = session.inputNames as string[];
		if (inputNames.length === 0) return;

		// Create minimal dummy tensors for each input
		const feeds: Record<string, any> = {};
		for (const name of inputNames) {
			// Use a small [1, 1] tensor of zeros — just enough to trigger pipeline init
			feeds[name] = new runtime.Tensor('float32', new Float32Array(1), [1, 1]);
		}

		const warmupStart = performance.now();
		await session.run(feeds);
		const warmupMs = Math.round(performance.now() - warmupStart);
		console.info(`[ONNX] Warmup complete in ${warmupMs}ms`);
	} catch {
		// Warmup is best-effort — model shape mismatch on dummy tensor is expected
		// for some architectures. The session is still valid.
		console.info('[ONNX] Warmup skipped (model requires specific input shape)');
	}
}

async function _createSession(modelUrl: string, preferredEps?: string[]): Promise<any> {
	const eps = preferredEps ?? getAvailableProviders();
	// The WebGPU entrypoint is required for ORT Web's browser GPU bundle. If
	// WebGPU fails, this same runtime can still try the portable fallbacks.
	const runtime = await ensureOrt(eps.includes('webgpu'));

	console.info(`[ONNX] Loading model: ${modelUrl}`);
	console.info(`[ONNX] Trying providers: ${eps.join(' → ')}`);

	// ── Model buffer cache ────────────────────────────────────────────────────
	// Reuse the fetched ArrayBuffer across session re-creations (device lost/recover).
	// Saves ~418 MB re-download + ~200ms parse on warm re-starts.
	let modelBuffer = modelBufferCache.get(modelUrl);
	if (!modelBuffer) {
		const response = await fetch(modelUrl);
		if (!response.ok) {
			throw new Error(`[ONNX] Failed to fetch model: ${response.status} ${response.statusText}`);
		}
		modelBuffer = await response.arrayBuffer();
		modelBufferCache.set(modelUrl, modelBuffer);
		console.info(`[ONNX] Model buffered (${(modelBuffer.byteLength / 1_048_576).toFixed(0)} MB)`);
	} else {
		console.info(`[ONNX] Model buffer cache hit — skipping fetch`);
	}

	// ── WebGPU device pre-warm ────────────────────────────────────────────────
	// Pre-request the GPU device before InferenceSession.create() so ORT reuses
	// the existing device rather than allocating a second pipeline compilation.
	//
	// UNVERIFIED (2026-09-07): assigning `runtime.env.webgpu.device` is ORT's
	// documented mechanism for this (see onnxruntime.ai/docs/api/js/interfaces/
	// Env.WebGpuFlags.html — "only has effect before the first WebGPU inference
	// session is created"), but a live, still-open upstream report says it may
	// not actually be honored: microsoft/onnxruntime#26107, "The `device`
	// specified in `ort.env.webgpu` will not be used at runtime" -- reports
	// that ORT's WebGPU backend creates its own internal device regardless of
	// this assignment. This assignment is therefore done per the documented
	// API, but its real effect on THIS installed onnxruntime-web version
	// (1.29.0) has not been proven in an actual browser here -- no browser
	// testing tool was available this session. Do not cite this as a verified
	// fix for the "ORT ignores the pre-warmed device" gap until it's actually
	// observed to matter (e.g. session-creation latency measurably drops, or a
	// WebGPU buffer-device-mismatch validation error like the one in #26107
	// does NOT occur) in a real browser.
	if (eps.includes('webgpu')) {
		const device = await getWebGPUDevice(); // populates _gpuDevice singleton
		if (device) {
			runtime.env.webgpu.device = device;
		}
	}

	// Try each provider in order
	let lastError: Error | null = null;
	for (const ep of eps) {
		try {
			const session = await runtime.InferenceSession.create(
				modelBuffer,
				{ executionProviders: [ep] }
			);
			providerMap.set(modelUrl, ep);
			const label = ep === 'webgpu' ? 'WebGPU (Dawn)' : ep.toUpperCase();
			console.info(`[ONNX] Model loaded with provider: ${label}`);

			// Warmup: run dummy inference to prime GPU/WASM pipeline
			await warmupSession(session, runtime);

			return session;
		} catch (err) {
			console.warn(`[ONNX] Provider "${ep}" failed, trying next...`, err);
			lastError = err as Error;
		}
	}

	throw new Error(
		`[ONNX] All execution providers failed for ${modelUrl}: ${lastError?.message}`
	);
}

/** Get the execution provider that was selected for a loaded model */
export function getActiveProvider(modelUrl: string): string | null {
	return providerMap.get(modelUrl) ?? null;
}

/** Human-readable provider label */
export function getProviderLabel(modelUrl: string): string {
	const ep = providerMap.get(modelUrl);
	if (!ep) return 'not loaded';
	if (ep === 'webgpu') return 'WebGPU (Dawn)';
	return ep.toUpperCase();
}

/** Check if a session is already cached (loaded or loading) */
export function isSessionCached(modelUrl: string): boolean {
	return sessionCache.has(modelUrl);
}

/** Clear all cached sessions (for cleanup or testing) */
export function clearSessionCache(): void {
	sessionCache.clear();
	providerMap.clear();
}
