/**
 * Client Inference Router — server-first reasoning with helper-only client tiers.
 *
 * Five routing tiers (local → server):
 *   LOCAL-HELPER  helper-only browser/local models (default)
 *   LOCAL-ONNX    Gemma 3 270M ONNX or other tiny helper models
 *   RETRIEVAL     Hybrid client+server — factual queries needing search
 *   SERVER        Gemma4 reasoning/synthesis with agentic tools
 *   VISION        multimodal server reasoning where needed
 *
 * Client Gemma4 lanes remain opt-in helpers only. The default local lane is
 * tiny ONNX/helper models; server-side Gemma4 handles reasoning and synthesis.
 *
 * Health-aware: polls /api/health/capabilities (30s cache) to know which
 * server services are actually available before escalating.
 *
 * Integration: ChatSession.svelte.ts calls shouldEscalateToServer() before fetch.
 */

import type { InferenceSource } from './model-ids.js';
import { LITERT_BASE_URL } from './model-ids.js';

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
	// Extended infrastructure (from /api/health/capabilities)
	tensorrt?: boolean;
	turboquant?: boolean;
	simd?: { healthy: boolean; minioConnected: boolean; latencyMs: number };
	grpc?: { available: boolean; enabled: boolean; url: string };
	gpu?: { leaseHolder: string | null; leaseFree: boolean };
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

// ── LiteRT-LM Availability Detection ────────────────────────────────────

let _litertReady: boolean | null = null;
let _litertCheckExpiry = 0;
const LITERT_CHECK_TTL = 60_000; // 60s — LiteRT server won't change often

/**
 * Check if LiteRT-LM sidecar is running and healthy.
 * LiteRT-LM runs as a local HTTP server (pip install litert-lm && litert-lm serve).
 * Returns cached result for 60s to avoid hammering the sidecar.
 */
export async function isLitertReady(): Promise<boolean> {
	if (typeof fetch === 'undefined') return false;
	if (_litertReady !== null && Date.now() < _litertCheckExpiry) return _litertReady;

	try {
		const res = await fetch(`${LITERT_BASE_URL}/health`, {
			signal: AbortSignal.timeout(1_000),
		});
		_litertReady = res.ok;
	} catch {
		_litertReady = false;
	}
	_litertCheckExpiry = Date.now() + LITERT_CHECK_TTL;
	return _litertReady;
}

/** Synchronous cached LiteRT-LM readiness (may be null if never checked). */
export function getCachedLitertReady(): boolean {
	return _litertReady === true;
}

// ── Keyword Categories (split by routing intent) ────────────────────────

/** Generation verbs → server (needs full LLM for long-form legal reasoning) */
const GENERATION_KEYWORDS = [
	'draft a', 'write a', 'compose a', 'prepare a',
	'analyze this', 'legal analysis', 'risk assessment',
	'compare', 'summarize the case', 'evaluate the',
	'review the contract', 'assess liability'
];

/** Search verbs → retrieval mode (needs vector search) */
const SEARCH_KEYWORDS = [
	'find cases', 'search for', 'similar to', 'related cases',
	'look up', 'what does the law say', 'according to',
	'cite', 'reference', 'source', 'show me'
];

/** Legal domain terms → mild escalation (context helps but not required) */
const LEGAL_TERMS = [
	'statute', 'citation', 'case law', 'precedent', 'jurisdiction',
	'ruling', 'verdict', 'defendant', 'plaintiff', 'motion',
	'brief', 'deposition', 'testimony', 'evidence', 'objection',
	'appeal', 'habeas corpus', 'due process', 'liability',
	'tort', 'contract', 'damages', 'negligence', 'fiduciary',
	'subpoena', 'indictment', 'arraignment', 'sentencing'
];

/** Local-only patterns → stay on client (greetings, UI help, simple lookups) */
const LOCAL_PATTERNS = [
	'hello', 'hi ', 'hey ', 'thanks', 'thank you', 'goodbye', 'bye',
	'help me with the', 'how do i use', 'what is a', 'what is the',
	'who are you', 'what can you do',
	'good morning', 'good afternoon', 'good evening', 'how are you'
];

// ── Thresholds ───────────────────────────────────────────────────────────

/** Score >= this → retrieval-hybrid mode */
const RETRIEVAL_THRESHOLD = 0.3;

/** Score >= this → full server-ollama mode */
const SERVER_THRESHOLD = 0.6;

/** Messages longer than this (chars) get mild escalation */
const LENGTH_THRESHOLD = 500;

/** Conversation depth that benefits from RAG context */
const CONVERSATION_DEPTH_THRESHOLD = 6;

/** Max contribution from legal terms alone (prevents single term → server) */
const LEGAL_TERM_CAP = 0.25;

// ── KAG Intent Classification ────────────────────────────────────────────

/** KAG-aware intent categories — each maps to a specific retrieval strategy */
export type IntentCategory =
	| 'greeting'        // "Hello" → local-onnx, no retrieval
	| 'factual'         // "What is habeas corpus?" → KAG glossary lookup
	| 'search'          // "Find cases about negligence" → RAG vector search
	| 'procedural'      // "How do I file a motion?" → KAG procedure templates
	| 'analysis'        // "Analyze this contract" → full server pipeline + RAG
	| 'comparative'     // "Compare X vs Y" → multi-search + synthesis
	| 'drafting'        // "Draft a brief" → server LLM generation
	| 'general';        // Uncategorized → score-based fallback

/** Procedural patterns → KAG procedure retrieval */
const PROCEDURAL_KEYWORDS = [
	'how do i file', 'steps to', 'procedure for', 'process of',
	'how to submit', 'filing requirements', 'what forms',
	'deadline for', 'time limit', 'statute of limitations',
	'how to appeal', 'how to respond', 'what is the process'
];

/** Comparative patterns → multi-source search + synthesis */
const COMPARATIVE_KEYWORDS = [
	'compare', 'difference between', 'versus', ' vs ', ' v. ',
	'distinguish', 'contrast', 'similarities between', 'pros and cons'
];

/** Factual lookup patterns → KAG glossary/statute retrieval */
const FACTUAL_KEYWORDS = [
	'what is a', 'what is the', 'define ', 'definition of',
	'meaning of', 'explain ', 'tell me about', 'describe '
];

/**
 * Classify user intent into KAG-aware categories.
 */
export function classifyIntent(message: string): { intent: IntentCategory; score: number } {
	const lower = message.toLowerCase();

	// Greeting check (highest priority — short-circuit)
	if (LOCAL_PATTERNS.some(p => lower.includes(p)) && message.length < 200) {
		return { intent: 'greeting', score: 0.95 };
	}

	const scores: Record<IntentCategory, number> = {
		greeting: 0, factual: 0, search: 0, procedural: 0,
		analysis: 0, comparative: 0, drafting: 0, general: 0.1
	};

	const genHits = GENERATION_KEYWORDS.filter(kw => lower.includes(kw));
	if (genHits.length > 0) scores.drafting = 0.3 + genHits.length * 0.2;

	const searchHits = SEARCH_KEYWORDS.filter(kw => lower.includes(kw));
	if (searchHits.length > 0) scores.search = 0.3 + searchHits.length * 0.15;

	const procHits = PROCEDURAL_KEYWORDS.filter(kw => lower.includes(kw));
	if (procHits.length > 0) scores.procedural = 0.4 + procHits.length * 0.15;

	const compHits = COMPARATIVE_KEYWORDS.filter(kw => lower.includes(kw));
	if (compHits.length > 0) scores.comparative = 0.4 + compHits.length * 0.15;

	const factHits = FACTUAL_KEYWORDS.filter(kw => lower.includes(kw));
	if (factHits.length > 0) scores.factual = 0.4 + factHits.length * 0.15;

	const legalHits = LEGAL_TERMS.filter(kw => lower.includes(kw));
	if (legalHits.length >= 3) scores.analysis += 0.3;

	if (message.length > LENGTH_THRESHOLD) {
		scores.analysis += 0.15;
		scores.drafting += 0.1;
	}

	let best: IntentCategory = 'general';
	let bestScore = 0;
	for (const [intent, score] of Object.entries(scores) as [IntentCategory, number][]) {
		if (score > bestScore) { best = intent; bestScore = score; }
	}

	return { intent: best, score: Math.min(bestScore, 1.0) };
}

// ── Agentic Detection ───────────────────────────────────────────────────

/** Multi-hop / compound patterns that benefit from multi-round tool calling */
const AGENTIC_PATTERNS = [
	// Compound requests (do X then Y)
	'and then ', 'after that ', 'first ', 'then ', 'also ',
	'additionally ', 'furthermore ', 'next ',
	// Explicit multi-source
	'compare .* with', 'cross-reference', 'correlate',
	'find .* and .* compare', 'search .* and .* analyze',
	// Deep analysis
	'investigate', 'deep dive', 'thorough analysis',
	'comprehensive review', 'full analysis', 'detailed breakdown',
	// Multi-hop reasoning
	'what evidence supports', 'trace the', 'follow the chain',
	'how does .* relate to', 'connection between',
	// Explicit agentic signals
	'use tools', 'search and analyze', 'look up and',
	'gather information', 'research and summarize',
];

/** Simple regex patterns compiled once */
const AGENTIC_REGEXES = AGENTIC_PATTERNS.map(p =>
	p.includes('.*') ? new RegExp(p, 'i') : null
);

/**
 * Detect whether a query benefits from multi-round agentic tool calling
 * rather than single-pass SSE chat. Returns a 0-1 score.
 */
export function agenticScore(message: string, conversationDepth: number): number {
	const lower = message.toLowerCase();
	let score = 0;

	// Pattern matching
	for (let i = 0; i < AGENTIC_PATTERNS.length; i++) {
		const regex = AGENTIC_REGEXES[i];
		if (regex) {
			if (regex.test(lower)) score += 0.25;
		} else if (lower.includes(AGENTIC_PATTERNS[i])) {
			score += 0.2;
		}
	}

	// Question complexity: multiple question marks suggest multi-part
	const questionMarks = (message.match(/\?/g) || []).length;
	if (questionMarks >= 2) score += 0.3;

	// Long + legal = likely needs tool orchestration
	if (message.length > 300 && LEGAL_TERMS.some(t => lower.includes(t))) {
		score += 0.15;
	}

	// Deep conversation benefits from memory recall tools
	if (conversationDepth > 8) score += 0.1;

	return Math.min(score, 1.0);
}

/** Threshold above which queries route to the agentic endpoint */
const AGENTIC_THRESHOLD = 0.45;

// ── Router Decision ──────────────────────────────────────────────────────

export interface RouterDecision {
	source: InferenceSource;
	reason: string;
	confidence: number;
	/** KAG-classified intent category */
	intent: IntentCategory;
}

/**
 * Pick the best available local inference source.
 * Default: ONNX helper lane. Opt-in Gemma4 client helpers remain available when enabled.
 */
function pickLocalSource(e2bReady?: boolean, litertReady?: boolean, allowClientGemma = false): InferenceSource {
	if (allowClientGemma && e2bReady) return 'local-e2b';
	if (allowClientGemma && litertReady) return 'local-litert';
	return 'local-onnx';
}

/**
 * Determine whether a user message should be handled:
 *   - locally via ONNX/helper lanes by default
 *   - optionally via client Gemma4 helpers when explicitly enabled
 *   - via retrieval-hybrid (client embed + server search + local answer)
 *   - via server Gemma4 reasoning/synthesis
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
		/** Whether E2B model is loaded and ready (avoids async check) */
		e2bReady?: boolean;
		/** Whether LiteRT-LM sidecar is running (avoids async check) */
		litertReady?: boolean;
		/** Allow client-side Gemma4 helper lanes when explicitly opted in */
		allowClientGemma?: boolean;
	}
): RouterDecision {
	// Classify intent via KAG system
	const { intent } = classifyIntent(message);

	const litertOk = options?.litertReady ?? getCachedLitertReady();
	const allowClientGemma = options?.allowClientGemma ?? false;

	// Explicit overrides
	if (options?.forceLocal) {
		return {
			source: pickLocalSource(options?.e2bReady, litertOk, allowClientGemma),
			reason: 'user-forced-local',
			confidence: 0.5,
			intent,
		};
	}

	const caps = options?.capabilities ?? _cachedCaps;

	// Force-server with health check
	if (options?.forceServer) {
		if (caps && !caps.serverReady) {
			return {
				source: pickLocalSource(options?.e2bReady, litertOk, allowClientGemma),
				reason: 'forced-server-but-unavailable',
				confidence: 0.3,
				intent,
			};
		}
		return { source: 'server-ollama', reason: 'user-forced-server', confidence: 1.0, intent };
	}

	const lower = message.toLowerCase();

	// Rule 0: Local patterns → immediately local (greetings, UI help)
	// Only if message is short (< 200 chars) — prevents "hello, analyze this case" → local
	const localHit = LOCAL_PATTERNS.some(p => lower.includes(p));
	if (localHit && message.length < 200) {
		return {
			source: pickLocalSource(options?.e2bReady, litertOk, allowClientGemma),
			reason: 'local-pattern',
			confidence: 0.9,
			intent: 'greeting',
		};
	}

	let serverScore = 0;
	const reasons: string[] = [];

	// Rule 1: Generation keywords → strong server push (+0.6)
	const genHits = GENERATION_KEYWORDS.filter(kw => lower.includes(kw));
	if (genHits.length > 0) {
		serverScore += 0.6;
		reasons.push(`generation(${genHits.length})`);
	}

	// Rule 2: Search keywords → retrieval push (+0.35)
	const searchHits = SEARCH_KEYWORDS.filter(kw => lower.includes(kw));
	if (searchHits.length > 0) {
		serverScore += 0.35;
		reasons.push(`search(${searchHits.length})`);
	}

	// Rule 3: Legal terms → mild escalation (+0.05 each, capped at 0.25)
	const legalHits = LEGAL_TERMS.filter(kw => lower.includes(kw));
	if (legalHits.length > 0) {
		serverScore += Math.min(legalHits.length * 0.05, LEGAL_TERM_CAP);
		reasons.push(`legal(${legalHits.length})`);
	}

	// Rule 4: Long message → mild escalation
	if (message.length > LENGTH_THRESHOLD) {
		serverScore += 0.1;
		reasons.push('long-message');
	}

	// Rule 5: Deep conversation → mild escalation
	if (conversationHistory.length > CONVERSATION_DEPTH_THRESHOLD) {
		serverScore += 0.1;
		reasons.push('deep-conversation');
	}

	// Rule 6: Case context available → mild escalation
	if (options?.hasCaseContext) {
		serverScore += 0.05;
		reasons.push('case-context');
	}

	// ── 3-tier decision ──────────────────────────────────────────────────
	const reasonStr = reasons.length > 0 ? reasons.join('+') : 'simple-query';

	if (serverScore >= SERVER_THRESHOLD) {
		// Health check: if server is down, fall to retrieval or local
		if (caps && !caps.ollama) {
			return {
				source: pickLocalSource(options?.e2bReady, litertOk, allowClientGemma),
				reason: reasonStr + '+server-unavailable',
				confidence: 0.3,
				intent,
			};
		}

		// Agentic detection: multi-hop / compound queries → multi-round tool agent
		const aScore = agenticScore(message, conversationHistory.length);
		if (aScore >= AGENTIC_THRESHOLD) {
			return {
				source: 'server-agentic',
				reason: reasonStr + `+agentic(${aScore.toFixed(2)})`,
				confidence: Math.min(serverScore, 1.0),
				intent,
			};
		}

		return {
			source: 'server-ollama',
			reason: reasonStr,
			confidence: Math.min(serverScore, 1.0),
			intent,
		};
	}

	if (serverScore >= RETRIEVAL_THRESHOLD) {
		// Health check: if RAG/server not available, fall to local
		if (caps && (!caps.ollama || !caps.rag)) {
			return {
				source: pickLocalSource(options?.e2bReady, litertOk, allowClientGemma),
				reason: reasonStr + '+rag-unavailable',
				confidence: 0.4,
				intent,
			};
		}
		return {
			source: 'retrieval-hybrid',
			reason: reasonStr,
			confidence: 0.7,
			intent,
		};
	}

	return {
		source: pickLocalSource(options?.e2bReady, litertOk, allowClientGemma),
		reason: reasonStr,
		confidence: 1.0 - serverScore,
		intent,
	};
}

// ── WASM Worker Factory (ARCHIVED) ──────────────────────────────────────
// llama.cpp WASM worker archived to deeds_labs/wasm-archive/
// ONNX Runtime WebGPU (client-embed.ts + onnx/session.ts) is the active client-side inference path

export function getWasmWorker(): Worker | null {
	return null; // Archived — use ONNX Runtime WebGPU path instead
}

export function terminateWasmWorker(): void {
	// No-op — WASM worker archived
}
