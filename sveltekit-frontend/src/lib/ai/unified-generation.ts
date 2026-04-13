/**
 * Unified Client-Side Generation — E2B → LiteRT → ONNX → Server Fallback
 *
 * 5-tier cascade with Bifrost L2 cache integration:
 *   1. Check Bifrost L2 cache (2-5s semantic match) — if available
 *   2. Local E2B (Gemma 4 E2B 2.3B via Transformers.js + WebGPU)
 *   3. Local LiteRT-LM (Gemma 4 E2B 2.3B via CPU XNNPACK + MTP heads)
 *   4. Local ONNX (Gemma 3 270M via ONNX Runtime, legacy fallback)
 *   5. Server (via client-router decision: retrieval-hybrid or server-ollama)
 *
 * Bifrost integration: Checks semantic cache BEFORE running local inference.
 * Cache hit (score > threshold) → instant return. Cache miss → run local, store result.
 */

import { shouldEscalateToServer, fetchCapabilities, isLitertReady, type RouterDecision, type IntentCategory } from './client-router.js';
import { BIFROST_BASE_URL_CLIENT, TURBOQUANT_BASE_URL_CLIENT, LITERT_BASE_URL } from './model-ids.js';
import type { InferenceSource } from './model-ids.js';

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export interface GenerationRequest {
	prompt: string;
	conversationHistory?: Array<{ role: string; content: string }>;
	systemPrompt?: string;
	maxTokens?: number;
	temperature?: number;
	/** Force local (offline mode) */
	forceLocal?: boolean;
	/** Force server (deep analysis) */
	forceServer?: boolean;
	/** Check Bifrost L2 cache before local inference */
	useBifrostCache?: boolean;
	/** Bifrost similarity threshold (default: 0.8) */
	bifrostThreshold?: number;
}

export interface GenerationResponse {
	text: string;
	source: InferenceSource;
	intent: IntentCategory;
	latencyMs: number;
	cacheHit?: boolean;
	cacheLayer?: 'bifrost_l2' | 'none';
	error?: string;
}

// ══════════════════════════════════════════════════════════════
// Bifrost L2 Cache Integration
// ══════════════════════════════════════════════════════════════

interface BifrostCacheResult {
	hit: boolean;
	response?: string;
	score?: number;
	latencyMs: number;
}

/**
 * Check Bifrost L2 semantic cache before local inference.
 * 500ms timeout — cache hits return in <100ms, misses abort quickly.
 */
async function checkBifrostCache(
	prompt: string,
	threshold: number = 0.8
): Promise<BifrostCacheResult> {
	const start = performance.now();
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 500);

	try {
		const res = await fetch('/api/cache/bifrost/check', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ prompt, threshold }),
			signal: controller.signal,
		});

		clearTimeout(timer);

		if (!res.ok) {
			return { hit: false, latencyMs: Math.round(performance.now() - start) };
		}

		const data = await res.json();
		const latencyMs = Math.round(performance.now() - start);

		if (data.hit && data.score >= threshold) {
			return {
				hit: true,
				response: data.response,
				score: data.score,
				latencyMs,
			};
		}

		return { hit: false, latencyMs };
	} catch (err) {
		clearTimeout(timer);
		// Timeout or error → cache miss
		return { hit: false, latencyMs: Math.round(performance.now() - start) };
	}
}

/**
 * Store response in Bifrost L2 cache for future semantic matches.
 */
async function storeBifrostCache(prompt: string, response: string): Promise<void> {
	try {
		await fetch('/api/cache/bifrost/store', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ prompt, response }),
			signal: AbortSignal.timeout(1_000),
		});
	} catch {
		// Fire-and-forget — don't block on cache store failure
	}
}

// ══════════════════════════════════════════════════════════════
// E2B WebGPU Inference
// ══════════════════════════════════════════════════════════════

let _e2bReady: boolean | null = null;
let _e2bCheckExpiry = 0;
const E2B_CHECK_TTL = 60_000; // 60s

/**
 * Check if Gemma 4 E2B (Transformers.js + WebGPU) is loaded and ready.
 * Cached for 60s to avoid repeated checks.
 */
export async function isE2bReady(): Promise<boolean> {
	if (typeof window === 'undefined') return false;
	if (_e2bReady !== null && Date.now() < _e2bCheckExpiry) return _e2bReady;

	try {
		// Check if WebGPU adapter is available
		if (!navigator.gpu) {
			_e2bReady = false;
			_e2bCheckExpiry = Date.now() + E2B_CHECK_TTL;
			return false;
		}

		const adapter = await navigator.gpu.requestAdapter();
		if (!adapter) {
			_e2bReady = false;
			_e2bCheckExpiry = Date.now() + E2B_CHECK_TTL;
			return false;
		}

		// Check if E2B session exists (via dynamic import to avoid SSR issues)
		const { getE2bSession } = await import('./e2b/session.js');
		const session = await getE2bSession();
		_e2bReady = session !== null;
	} catch {
		_e2bReady = false;
	}

	_e2bCheckExpiry = Date.now() + E2B_CHECK_TTL;
	return _e2bReady;
}

/**
 * Run inference via Gemma 4 E2B (Transformers.js + WebGPU).
 * Returns null if E2B is not available.
 */
async function tryE2bInference(prompt: string, maxTokens: number = 200): Promise<string | null> {
	try {
		const { runE2bInference } = await import('./e2b/inference.js');
		const result = await runE2bInference(prompt, { maxTokens });
		return result;
	} catch {
		return null;
	}
}

// ══════════════════════════════════════════════════════════════
// LiteRT-LM Inference
// ══════════════════════════════════════════════════════════════

/**
 * Run inference via LiteRT-LM sidecar (CPU, Gemma 4 E2B 2.3B + MTP heads).
 * Returns null if LiteRT server is not running.
 */
async function tryLitertInference(prompt: string, maxTokens: number = 200): Promise<string | null> {
	try {
		const res = await fetch(`${LITERT_BASE_URL}/v1/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				prompt,
				max_tokens: maxTokens,
				temperature: 0.3,
			}),
			signal: AbortSignal.timeout(30_000),
		});

		if (!res.ok) return null;

		const data = await res.json();
		return data.choices?.[0]?.text ?? null;
	} catch {
		return null;
	}
}

// ══════════════════════════════════════════════════════════════
// ONNX Inference
// ══════════════════════════════════════════════════════════════

/**
 * Run inference via ONNX Runtime (Gemma 3 270M, legacy fallback).
 * Returns null if ONNX session is not available.
 */
async function tryOnnxInference(prompt: string, maxTokens: number = 200): Promise<string | null> {
	try {
		const { runOnnxInference } = await import('./onnx/inference.js');
		const result = await runOnnxInference(prompt, { maxTokens });
		return result;
	} catch {
		return null;
	}
}

// ══════════════════════════════════════════════════════════════
// Server Inference
// ══════════════════════════════════════════════════════════════

/**
 * Run inference via server (SSE chat endpoint).
 * Handles both retrieval-hybrid and server-ollama modes.
 */
async function runServerInference(
	prompt: string,
	conversationHistory: Array<{ role: string; content: string }>,
	maxTokens: number = 500
): Promise<string> {
	const messages = [
		...conversationHistory,
		{ role: 'user' as const, content: prompt },
	];

	// Use SSE chat endpoint for server inference
	const res = await fetch('/api/sse/chat', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			messages,
			maxTokens,
			stream: false, // Non-streaming for unified API
		}),
		signal: AbortSignal.timeout(120_000),
	});

	if (!res.ok) {
		throw new Error(`Server inference failed: ${res.status}`);
	}

	const data = await res.json();
	return data.response ?? '';
}

// ══════════════════════════════════════════════════════════════
// Unified Generation API
// ══════════════════════════════════════════════════════════════

/**
 * Generate text via 5-tier cascade with Bifrost L2 cache integration.
 *
 * Flow:
 *   1. Bifrost L2 cache check (if enabled) → 2-5s semantic match
 *   2. Local E2B (WebGPU) → ~1-2s for 200 tokens
 *   3. Local LiteRT-LM (CPU) → ~3-5s for 200 tokens
 *   4. Local ONNX (270M) → ~5-8s for 200 tokens
 *   5. Server (retrieval-hybrid or server-ollama) → 25-30s for 500 tokens
 */
export async function generateText(request: GenerationRequest): Promise<GenerationResponse> {
	const start = performance.now();
	const conversationHistory = request.conversationHistory ?? [];
	const maxTokens = request.maxTokens ?? 200;

	// Step 0: Check client router decision
	const capabilities = await fetchCapabilities();
	const e2bReady = await isE2bReady();
	const litertReady = await isLitertReady();

	const routerDecision = shouldEscalateToServer(
		request.prompt,
		conversationHistory,
		{
			forceServer: request.forceServer,
			forceLocal: request.forceLocal,
			capabilities,
			e2bReady,
			litertReady,
		}
	);

	// Step 1: Bifrost L2 cache (optional, before local inference)
	if (request.useBifrostCache !== false && !request.forceLocal) {
		const cacheResult = await checkBifrostCache(
			request.prompt,
			request.bifrostThreshold ?? 0.8
		);

		if (cacheResult.hit && cacheResult.response) {
			return {
				text: cacheResult.response,
				source: routerDecision.source, // Preserve router's intended source
				intent: routerDecision.intent,
				latencyMs: cacheResult.latencyMs,
				cacheHit: true,
				cacheLayer: 'bifrost_l2',
			};
		}
	}

	// Step 2: Local E2B (if router says local-e2b)
	if (routerDecision.source === 'local-e2b') {
		const e2bResult = await tryE2bInference(request.prompt, maxTokens);
		if (e2bResult) {
			const latencyMs = Math.round(performance.now() - start);
			// Store in Bifrost for future hits
			if (request.useBifrostCache !== false) {
				storeBifrostCache(request.prompt, e2bResult).catch(() => {});
			}
			return {
				text: e2bResult,
				source: 'local-e2b',
				intent: routerDecision.intent,
				latencyMs,
				cacheHit: false,
				cacheLayer: 'none',
			};
		}
		// E2B failed → fall through to LiteRT
	}

	// Step 3: Local LiteRT-LM (if router says local-litert OR E2B failed)
	if (routerDecision.source === 'local-litert' || routerDecision.source === 'local-e2b') {
		const litertResult = await tryLitertInference(request.prompt, maxTokens);
		if (litertResult) {
			const latencyMs = Math.round(performance.now() - start);
			if (request.useBifrostCache !== false) {
				storeBifrostCache(request.prompt, litertResult).catch(() => {});
			}
			return {
				text: litertResult,
				source: 'local-litert',
				intent: routerDecision.intent,
				latencyMs,
				cacheHit: false,
				cacheLayer: 'none',
			};
		}
		// LiteRT failed → fall through to ONNX
	}

	// Step 4: Local ONNX (if router says local-onnx OR E2B+LiteRT failed)
	if (
		routerDecision.source === 'local-onnx' ||
		routerDecision.source === 'local-e2b' ||
		routerDecision.source === 'local-litert'
	) {
		const onnxResult = await tryOnnxInference(request.prompt, maxTokens);
		if (onnxResult) {
			const latencyMs = Math.round(performance.now() - start);
			if (request.useBifrostCache !== false) {
				storeBifrostCache(request.prompt, onnxResult).catch(() => {});
			}
			return {
				text: onnxResult,
				source: 'local-onnx',
				intent: routerDecision.intent,
				latencyMs,
				cacheHit: false,
				cacheLayer: 'none',
			};
		}
		// ONNX failed → fall through to server
	}

	// Step 5: Server fallback (retrieval-hybrid or server-ollama)
	try {
		const serverResult = await runServerInference(
			request.prompt,
			conversationHistory,
			request.maxTokens ?? 500
		);
		const latencyMs = Math.round(performance.now() - start);
		// Server responses already cached by L1 (Redis) + L2 (Bifrost) on server-side
		return {
			text: serverResult,
			source: routerDecision.source, // 'retrieval-hybrid' or 'server-ollama'
			intent: routerDecision.intent,
			latencyMs,
			cacheHit: false,
			cacheLayer: 'none', // Server-side caching is separate
		};
	} catch (err) {
		const latencyMs = Math.round(performance.now() - start);
		return {
			text: '',
			source: 'server-ollama',
			intent: routerDecision.intent,
			latencyMs,
			error: err instanceof Error ? err.message : 'Server inference failed',
		};
	}
}

/**
 * Simplified convenience API for common use cases.
 */
export async function chat(prompt: string, options?: {
	maxTokens?: number;
	temperature?: number;
	history?: Array<{ role: string; content: string }>;
}): Promise<string> {
	const result = await generateText({
		prompt,
		conversationHistory: options?.history,
		maxTokens: options?.maxTokens,
		temperature: options?.temperature,
	});

	if (result.error) {
		throw new Error(result.error);
	}

	return result.text;
}
