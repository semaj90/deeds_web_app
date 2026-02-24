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

// Lazy-loaded onnxruntime-web (only imported in browser)
let ort: typeof import('onnxruntime-web') | null = null;

/** Which execution provider was actually used for each session */
const providerMap = new Map<string, string>();

/** In-flight + resolved session promises (memoization) */
const sessionCache = new Map<string, Promise<any>>();

/**
 * Load onnxruntime-web lazily and configure WASM paths.
 * WASM binaries are served from /ort/ in static/ — copy them there
 * from node_modules/onnxruntime-web/dist/ if missing.
 */
async function ensureOrt(): Promise<typeof import('onnxruntime-web')> {
	if (ort) return ort;

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

	ort = await import('onnxruntime-web');
	// Point WASM loader at static/ort/ so it finds .wasm files
	ort.env.wasm.wasmPaths = '/ort/';
	// Force single-threaded WASM to avoid SharedArrayBuffer issues in headless browsers
	ort.env.wasm.numThreads = 1;
	return ort;
}

/**
 * Determine which execution providers are available in this browser.
 * Returns them in priority order: WebGPU (Dawn) → WASM → CPU.
 */
function getAvailableProviders(): string[] {
	const available: string[] = [];
	for (const ep of ONNX_EXECUTION_PROVIDERS) {
		if (ep === 'webgpu' && typeof navigator !== 'undefined' && 'gpu' in navigator) {
			available.push('webgpu');
		} else if (ep === 'wasm') {
			available.push('wasm');
		} else if (ep === 'cpu') {
			available.push('cpu');
		}
	}
	return available.length > 0 ? available : ['cpu'];
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

async function _createSession(modelUrl: string, preferredEps?: string[]): Promise<any> {
	const runtime = await ensureOrt();
	const eps = preferredEps ?? getAvailableProviders();

	console.info(`[ONNX] Loading model: ${modelUrl}`);
	console.info(`[ONNX] Trying providers: ${eps.join(' → ')}`);

	// Fetch model as ArrayBuffer (SvelteKit serves from static/)
	const response = await fetch(modelUrl);
	if (!response.ok) {
		throw new Error(`[ONNX] Failed to fetch model: ${response.status} ${response.statusText}`);
	}
	const modelBuffer = await response.arrayBuffer();

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
			console.info(`[ONNX] ✅ Model loaded with provider: ${label}`);
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