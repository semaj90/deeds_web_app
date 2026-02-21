/**
 * Client Inference Router — decides local ONNX vs server escalation.
 *
 * Rules:
 *   LOCAL  → classification, intent, short answers, UI help, quick summarization
 *   SERVER → legal-critical, long context, citations needed, RAG, low local confidence
 *
 * Integration: ChatSession.svelte.ts calls shouldEscalateToServer() before fetch.
 */

import type { InferenceSource } from './model-ids.js';
import { WASM_WORKER_PATH } from './model-ids.js';

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
	}
): RouterDecision {
	// Explicit overrides
	if (options?.forceServer) {
		return { source: 'server-ollama', reason: 'user-forced-server', confidence: 1.0 };
	}
	if (options?.forceLocal) {
		return { source: 'local-onnx', reason: 'user-forced-local', confidence: 0.5 };
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

	// Decision threshold: 0.5+ → server
	if (serverScore >= 0.5) {
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

// ── WASM Worker Factory ──────────────────────────────────────────────────

let wasmWorker: Worker | null = null;

/**
 * Get or create the WASM llama.cpp web worker for client-side inference.
 * Returns null if Workers are unavailable (SSR / unsupported browser).
 */
export function getWasmWorker(): Worker | null {
	if (typeof Worker === 'undefined') return null;
	if (!wasmWorker) {
		wasmWorker = new Worker(WASM_WORKER_PATH);
	}
	return wasmWorker;
}

/**
 * Terminate the WASM worker and release resources.
 */
export function terminateWasmWorker(): void {
	wasmWorker?.terminate();
	wasmWorker = null;
}