/**
 * LangGraph Synthesis Service Client
 *
 * Thin TypeScript client for the Docker LangGraph synthesis service (port 8091).
 * Endpoints: POST /synthesize, POST /synthesize/stream, GET /health, GET /hmm/stats
 *
 * The service runs a full LangGraph DAG:
 *   web_search + rg_search → retrieve_rag → retrieve_kag → tag_chunks (HMM Viterbi)
 *   → assemble_ace → merge → synthesize → self_eval
 *
 * Unique features not in the in-process TS pipeline:
 *   - HMM Baum-Welch adaptation (learns emission/transition probabilities from corpus)
 *   - Redis KAG neighbor cache (langgraph:kag:neighbors:* prefix)
 *   - torch.compile() persistent kernel cache for GPU embedding
 *
 * When LANGGRAPH_ENABLED=false (default), all functions return null and the caller
 * falls back to the in-process TypeScript synthesis pipeline.
 */

import { ENV } from '$lib/server/env.server.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LangGraphSynthesizeRequest {
	query: string;
	case_id?: string | null;
	temperature?: number;
	max_tokens?: number;
	skip_cache?: boolean;
}

export interface LangGraphSynthesizeResponse {
	answer: string;
	confidence: number;
	grpo_reward_score: number | null;
	cache: 'L1-redis' | 'L2-bifrost' | 'L3-langgraph';
	rag_hits: number;
	kag_neighbors: number;
	kag_source: string;
	web_results: number;
	rg_results: number;
	retried: boolean;
	entities: Record<string, string[]>;
	citations: Array<{ index: number; title: string; score: number; text: string }>;
	latency_ms: number;
	trace_id: string;
	gpu: boolean;
}

export interface LangGraphStreamEvent {
	stage: string;
	status?: string;
	token?: string;
	hits?: number;
	neighbors?: number;
	kag_source?: string;
	web?: number;
	rg?: number;
	confidence?: number;
	trace_id?: string;
	cache?: string;
	source?: string;
	citations?: Array<{ index: number; title: string; score: number; text: string }>;
	grpo_reward_score?: number | null;
}

export interface LangGraphHealthResponse {
	service: string;
	version: string;
	gpu: boolean;
	gpu_name: string | null;
	vram_free_mb: number | null;
	ollama: string;
	qdrant: string;
	redis: string;
	neo4j: string;
	bifrost: string;
	hmm_adapted: boolean;
	graph_compiled: boolean;
	status: 'healthy' | 'degraded' | 'unhealthy';
}

export interface LangGraphHMMStats {
	states: string[];
	top_emission_words: Record<string, string[]>;
	redis_persisted: boolean;
	redis_key: string;
}

// ── Health & Availability ────────────────────────────────────────────────────

let _cachedHealthy: boolean | null = null;
let _healthCacheTs = 0;
const HEALTH_CACHE_TTL = 30_000; // 30s

/**
 * Check if the LangGraph service is enabled AND reachable.
 * Caches result for 30s to avoid hammering the health endpoint.
 */
export async function isLangGraphAvailable(): Promise<boolean> {
	if (!ENV.LANGGRAPH_ENABLED) return false;

	const now = Date.now();
	if (_cachedHealthy !== null && now - _healthCacheTs < HEALTH_CACHE_TTL) {
		return _cachedHealthy;
	}

	try {
		const res = await fetch(`${ENV.LANGGRAPH_URL}/health`, {
			signal: AbortSignal.timeout(3000),
		});
		if (!res.ok) {
			_cachedHealthy = false;
			_healthCacheTs = now;
			return false;
		}
		const data = (await res.json()) as LangGraphHealthResponse;
		_cachedHealthy = data.status === 'healthy' || data.status === 'degraded';
		_healthCacheTs = now;
		return _cachedHealthy;
	} catch {
		_cachedHealthy = false;
		_healthCacheTs = now;
		return false;
	}
}

/** Force-clear the health cache (e.g., after docker compose up). */
export function resetHealthCache(): void {
	_cachedHealthy = null;
	_healthCacheTs = 0;
}

// ── Synthesize (JSON) ────────────────────────────────────────────────────────

/**
 * Call the LangGraph synthesis service (JSON mode).
 * Returns null if the service is disabled or unreachable — caller falls back to in-process.
 */
export async function langGraphSynthesize(
	req: LangGraphSynthesizeRequest,
	timeoutMs = 120_000
): Promise<LangGraphSynthesizeResponse | null> {
	if (!(await isLangGraphAvailable())) return null;

	try {
		const res = await fetch(`${ENV.LANGGRAPH_URL}/synthesize`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(req),
			signal: AbortSignal.timeout(timeoutMs),
		});

		if (!res.ok) {
			console.warn(`[langgraph-client] synthesize failed: ${res.status} ${res.statusText}`);
			return null;
		}

		return (await res.json()) as LangGraphSynthesizeResponse;
	} catch (err) {
		console.warn(`[langgraph-client] synthesize error:`, err instanceof Error ? err.message : err);
		// Mark unhealthy so subsequent requests don't wait for timeout
		_cachedHealthy = false;
		_healthCacheTs = Date.now();
		return null;
	}
}

// ── Synthesize (SSE Stream) ──────────────────────────────────────────────────

/**
 * Call the LangGraph synthesis service in streaming mode.
 * Returns a ReadableStream of SSE events, or null if service is unavailable.
 *
 * The caller can pipe this directly into a Response for SSE passthrough,
 * or consume events to transform them into the SvelteKit synthesis format.
 */
export async function langGraphSynthesizeStream(
	req: LangGraphSynthesizeRequest,
	timeoutMs = 180_000
): Promise<ReadableStream<Uint8Array> | null> {
	if (!(await isLangGraphAvailable())) return null;

	try {
		const res = await fetch(`${ENV.LANGGRAPH_URL}/synthesize/stream`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(req),
			signal: AbortSignal.timeout(timeoutMs),
		});

		if (!res.ok || !res.body) {
			console.warn(`[langgraph-client] stream failed: ${res.status}`);
			return null;
		}

		return res.body;
	} catch (err) {
		console.warn(`[langgraph-client] stream error:`, err instanceof Error ? err.message : err);
		_cachedHealthy = false;
		_healthCacheTs = Date.now();
		return null;
	}
}

/**
 * Parse a LangGraph SSE data line into a typed event object.
 * Lines come as "data: {...json...}\n\n" — strip the prefix and parse.
 */
export function parseLangGraphSSE(line: string): LangGraphStreamEvent | null {
	const trimmed = line.trim();
	if (!trimmed.startsWith('data: ')) return null;
	try {
		return JSON.parse(trimmed.slice(6)) as LangGraphStreamEvent;
	} catch {
		return null;
	}
}

// ── Health & HMM Stats ───────────────────────────────────────────────────────

/** Fetch full health status from the LangGraph service. */
export async function langGraphHealth(): Promise<LangGraphHealthResponse | null> {
	if (!ENV.LANGGRAPH_ENABLED) return null;
	try {
		const res = await fetch(`${ENV.LANGGRAPH_URL}/health`, {
			signal: AbortSignal.timeout(5000),
		});
		if (!res.ok) return null;
		return (await res.json()) as LangGraphHealthResponse;
	} catch {
		return null;
	}
}

/** Fetch HMM tagger statistics (emission weights, adaptation status). */
export async function langGraphHMMStats(): Promise<LangGraphHMMStats | null> {
	if (!ENV.LANGGRAPH_ENABLED) return null;
	try {
		const res = await fetch(`${ENV.LANGGRAPH_URL}/hmm/stats`, {
			signal: AbortSignal.timeout(5000),
		});
		if (!res.ok) return null;
		return (await res.json()) as LangGraphHMMStats;
	} catch {
		return null;
	}
}

/** Trigger HMM Baum-Welch re-adaptation from corpus. */
export async function langGraphHMMAdapt(): Promise<boolean> {
	if (!ENV.LANGGRAPH_ENABLED) return false;
	try {
		const res = await fetch(`${ENV.LANGGRAPH_URL}/hmm/adapt`, {
			method: 'POST',
			signal: AbortSignal.timeout(5000),
		});
		return res.ok;
	} catch {
		return false;
	}
}

/** Fetch L1 cache statistics from the LangGraph service. */
export async function langGraphCacheStats(): Promise<Record<string, unknown> | null> {
	if (!ENV.LANGGRAPH_ENABLED) return null;
	try {
		const res = await fetch(`${ENV.LANGGRAPH_URL}/cache/stats`, {
			signal: AbortSignal.timeout(5000),
		});
		if (!res.ok) return null;
		return (await res.json()) as Record<string, unknown>;
	} catch {
		return null;
	}
}
