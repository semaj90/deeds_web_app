/**
 * Client Inference Router — decides local ONNX vs server escalation.
 *
 * Rules:
 *   LOCAL  → classification, intent, short answers, UI help, quick summarization
 *   SERVER → legal-critical, long context, citations needed, RAG, low local confidence
 *
 * Health-aware: polls /api/health/capabilities (30s cache) to know which
 * server services are actually available before escalating.
 *
 * Integration: ChatSession.svelte.ts calls shouldEscalateToServer() before fetch.
 *
 * TODO [Session 93r18]: TRT-LLM/Triton integration
 *   - Add 'tensorrt' to InferenceSource type
 *   - Check gpu-arbiter.ts lease status before routing
 *   - TRT-LLM primary (port 8099, /v2/health/ready) → Ollama fallback
 *   - GPU Arbiter manages VRAM mutex (RTX 3060 Ti 8GB, can't coexist)
 *   - ServerCapabilities should include tensorrt: boolean field
 *   - See: src/lib/server/inference/gpu-arbiter.ts for lease logic
 */

import type { InferenceSource } from './model-ids.js';
// WASM llama.cpp worker archived — ONNX Runtime WebGPU is the active inference path

// ── Server Capabilities (from /api/health/capabilities) ─────────────────

export interface ServerCapabilities {
	ollama: boolean;
	embedding: boolean;
	rag: boolean;
	postgres: boolean;
	redis: boolean;
	ragEnabled: boolean;
	serverReady: boolean;
	models: string[];
	latencyMs: number;
	ts: string;
}

let _cachedCaps: ServerCapabilities | null = null;
let _capsExpiry = 0;
const CAPS_TTL = 30_000; // 30s — matches server Cache-Control
const CAPS_FETCH_TIMEOUT = 3_000;

/**
 * Fetch server capabilities with 30s client cache.
 * Safe to call from browser only — returns null during SSR.
 */
export async function fetchCapabilities(): Promise<ServerCapabilities | null> {
	if (typeof fetch === 'undefined') return null;
	if (_cachedCaps && Date.now() < _capsExpiry) return _cachedCaps;

	try {
		const res = await fetch('/api/health/capabilities', {
			signal: AbortSignal.timeout(CAPS_FETCH_TIMEOUT),
		});
		if (!res.ok) return _cachedCaps;
		const data: ServerCapabilities = await res.json();
		_cachedCaps = data;
		_capsExpiry = Date.now() + CAPS_TTL;
		return data;
	} catch {
		return _cachedCaps; // stale is better than nothing
	}
}

/** Synchronous access to last-fetched capabilities (may be null or stale). */
export function getCachedCapabilities(): ServerCapabilities | null {
	return _cachedCaps;
}

// ── Escalation keywords (trigger server-side legal reasoning) ────────────

const LEGAL_KEYWORDS = [
	'statute', 'citation', 'case law', 'precedent', 'jurisdiction',
	'ruling', 'verdict', 'defendant', 'plaintiff', 'motion',
	'brief', 'deposition', 'testimony', 'evidence', 'objection',
	'appeal', 'habeas corpus', 'due process', 'liability',
	'tort', 'contract', 'damages', 'negligence', 'fiduciary',
	'subpoena', 'indictment', 'arraignment', 'sentencing',
	'draft a', 'write a', 'compose a', 'prepare a',
	'analyze this case', 'legal analysis', 'risk assessment'
];

const RAG_TRIGGER_KEYWORDS = [
	'find cases', 'search for', 'similar to', 'related cases',
	'look up', 'what does the law say', 'according to',
	'cite', 'reference', 'source'
];

// ── Thresholds ───────────────────────────────────────────────────────────

/** Messages longer than this (chars) escalate to server for context window */
const LENGTH_THRESHOLD = 500;

/** Conversation depth that benefits from RAG context */
const CONVERSATION_DEPTH_THRESHOLD = 6;

// ── Router Decision ──────────────────────────────────────────────────────

export interface RouterDecision {
	source: InferenceSource;
	reason: string;
	confidence: number;
}

/**
 * Determine whether a user message should be handled locally (ONNX)
 * or escalated to the server (Ollama gemma3-legal:latest with RAG).
 */
export function shouldEscalateToServer(
	message: string,
	conversationHistory: Array<{ role: string; content: string }>,
	options?: {
		/** Force server mode (e.g., user toggled "deep analysis") */
		forceServer?: boolean;
		/** Force local mode (e.g., offline) */
		forceLocal?: boolean;
		/** Case context is loaded (RAG available) */
		hasCaseContext?: boolean;
		/** Pre-fetched capabilities (avoids async in sync decision path) */
		capabilities?: ServerCapabilities | null;
	}
): RouterDecision {
	// Explicit overrides
	if (options?.forceLocal) {
		return { source: 'local-onnx', reason: 'user-forced-local', confidence: 0.5 };
	}

	const caps = options?.capabilities ?? _cachedCaps;

	// Health gate: if we know the server is down, don't escalate
	// (unless user explicitly forced server — honor that even if risky)
	if (options?.forceServer) {
		if (caps && !caps.serverReady) {
			return { source: 'local-onnx', reason: 'forced-server-but-unavailable', confidence: 0.3 };
		}
		return { source: 'server-ollama', reason: 'user-forced-server', confidence: 1.0 };
	}

	const lower = message.toLowerCase();
	let serverScore = 0;
	const reasons: string[] = [];

	// Rule 1: Legal keywords → server (needs domain expertise + RAG)
	const legalHits = LEGAL_KEYWORDS.filter(kw => lower.includes(kw));
	if (legalHits.length > 0) {
		serverScore += 0.4 + (legalHits.length * 0.1);
		reasons.push(`legal-keywords(${legalHits.length})`);
	}

	// Rule 2: RAG trigger keywords → server (needs vector search)
	const ragHits = RAG_TRIGGER_KEYWORDS.filter(kw => lower.includes(kw));
	if (ragHits.length > 0) {
		serverScore += 0.3;
		reasons.push('rag-trigger');
	}

	// Rule 3: Long message → server (benefits from large context window)
	if (message.length > LENGTH_THRESHOLD) {
		serverScore += 0.2;
		reasons.push('long-message');
	}

	// Rule 4: Deep conversation → server (needs conversation context + RAG)
	if (conversationHistory.length > CONVERSATION_DEPTH_THRESHOLD) {
		serverScore += 0.15;
		reasons.push('deep-conversation');
	}

	// Rule 5: Case context available → server gets RAG boost
	if (options?.hasCaseContext) {
		serverScore += 0.1;
		reasons.push('case-context-available');
	}

	// Decision threshold: 0.5+ → server (but only if server is available)
	if (serverScore >= 0.5) {
		// Health check: if capabilities show server is down, fall back to local
		if (caps && !caps.ollama) {
			return {
				source: 'local-onnx',
				reason: reasons.join('+') + '+server-unavailable',
				confidence: 0.3
			};
		}
		return {
			source: 'server-ollama',
			reason: reasons.join('+'),
			confidence: Math.min(serverScore, 1.0)
		};
	}

	return {
		source: 'local-onnx',
		reason: reasons.length > 0 ? `below-threshold(${serverScore.toFixed(2)})` : 'simple-query',
		confidence: 1.0 - serverScore
	};
}

// ── WASM Worker Factory (ARCHIVED) ──────────────────────────────────────
// llama.cpp WASM worker archived to deeds_labs/wasm-archive/
// ONNX Runtime WebGPU (client-embed.ts + onnx/session.ts) is the active client-side inference path
// Stubs kept for API compatibility — no-op

export function getWasmWorker(): Worker | null {
	return null; // Archived — use ONNX Runtime WebGPU path instead
}

export function terminateWasmWorker(): void {
	// No-op — WASM worker archived
}