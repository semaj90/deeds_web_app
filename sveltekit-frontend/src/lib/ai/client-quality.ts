/**
 * Client-Side Quality Schema — Determines when local synthesis is sufficient
 * vs. when to escalate to server inference.
 *
 * Two-phase evaluation:
 *   Phase 1 (Pre-retrieval): Score retrieval confidence from RAG/KAG/DAG signals
 *     → If confidence < RETRIEVAL_THRESHOLD, skip local synthesis entirely → server
 *   Phase 2 (Post-synthesis): Evaluate generated text quality
 *     → If quality < SYNTHESIS_THRESHOLD, discard local result → escalate to server
 *
 * User feedback loop:
 *   Thumbs up/down on responses adjusts local escalation thresholds over time
 *   via IndexedDB-persisted quality history.
 *
 * Consumed by ChatSession.svelte.ts and client-llm-synthesis.ts.
 */

// ── Types ────────────────────────────────────────────────────────────────

/** Pre-retrieval confidence signals from RAG/KAG/DAG pipeline. */
export interface RetrievalSignals {
	/** Best cosine similarity score from RAG vector search (0–1) */
	ragTopScore: number;
	/** Number of RAG hits above 0.5 similarity threshold */
	ragHitCount: number;
	/** Number of KAG graph neighbors found for the case */
	kagNeighborCount: number;
	/** Whether DAG cache had a topological ordering for this case */
	dagCacheHit: boolean;
	/** Number of glossary/statute matches from KAG lookup */
	kagGlossaryHits: number;
}

/** Post-synthesis quality assessment of a generated response. */
export interface SynthesisQuality {
	/** Overall quality score (0–1) — weighted combination of sub-scores */
	score: number;
	/** Response length adequacy (0–1): too short or too long penalized */
	lengthScore: number;
	/** Sentence coherence heuristic (0–1): complete sentences, not fragments */
	coherenceScore: number;
	/** Legal term coverage (0–1): does response address legal concepts from query? */
	termCoverageScore: number;
	/** Whether the response should be escalated to server */
	shouldEscalate: boolean;
	/** Human-readable reason for the decision */
	reason: string;
}

/** User feedback on a response — used to adjust thresholds over time. */
export interface QualityFeedback {
	/** Query that produced the response */
	queryHash: string;
	/** Was the response helpful? */
	helpful: boolean;
	/** Source of the response (local-e2b, local-onnx, server-ollama, etc.) */
	source: string;
	/** Timestamp */
	ts: number;
}

/** Combined pre+post quality decision. */
export interface QualityDecision {
	/** Pre-retrieval confidence (0–1) */
	retrievalConfidence: number;
	/** Post-synthesis quality (0–1), null if synthesis was skipped */
	synthesisQuality: number | null;
	/** Final action */
	action: 'use-local' | 'escalate-to-server' | 'skip-synthesis';
	/** Human-readable explanation */
	reason: string;
}

// ── Thresholds ───────────────────────────────────────────────────────────

/** Default thresholds — adjusted by user feedback over time */
const DEFAULT_THRESHOLDS = {
	/** Minimum retrieval confidence to attempt local synthesis */
	retrieval: 0.35,
	/** Minimum synthesis quality to serve locally (otherwise escalate) */
	synthesis: 0.45,
	/** Minimum response length (chars) to consider adequate */
	minResponseLength: 40,
	/** Maximum response length before suspecting hallucination/loops */
	maxResponseLength: 4000,
	/** Minimum RAG top score to contribute positively */
	ragMinScore: 0.4,
} as const;

type Thresholds = { -readonly [K in keyof typeof DEFAULT_THRESHOLDS]: number };
let _thresholds: Thresholds = { ...DEFAULT_THRESHOLDS };

// ── Pre-Retrieval Confidence ─────────────────────────────────────────────

/**
 * Score retrieval confidence from RAG/KAG/DAG signals.
 * Returns 0–1 where higher = more confident that local context is sufficient.
 */
export function scoreRetrievalConfidence(signals: RetrievalSignals): number {
	let score = 0;

	// RAG vector similarity (0–0.4 weight)
	if (signals.ragTopScore >= _thresholds.ragMinScore) {
		score += Math.min(signals.ragTopScore, 1.0) * 0.4;
	}

	// RAG hit count (0–0.2 weight): more hits = more context
	const hitBonus = Math.min(signals.ragHitCount / 5, 1.0) * 0.2;
	score += hitBonus;

	// KAG graph neighbors (0–0.2 weight): case has graph context
	if (signals.kagNeighborCount > 0) {
		score += Math.min(signals.kagNeighborCount / 8, 1.0) * 0.2;
	}

	// KAG glossary/statute hits (0–0.1 weight)
	if (signals.kagGlossaryHits > 0) {
		score += Math.min(signals.kagGlossaryHits / 3, 1.0) * 0.1;
	}

	// DAG cache hit (0.1 bonus): topological ordering available
	if (signals.dagCacheHit) {
		score += 0.1;
	}

	return Math.min(score, 1.0);
}

// ── Post-Synthesis Quality ───────────────────────────────────────────────

/** Common legal terms to check for coverage in responses */
const LEGAL_QUALITY_TERMS = [
	'statute', 'case', 'court', 'law', 'legal', 'right', 'claim',
	'evidence', 'ruling', 'judgment', 'liability', 'contract',
	'plaintiff', 'defendant', 'motion', 'brief', 'appeal',
	'precedent', 'jurisdiction', 'testimony', 'violation',
];

/**
 * Evaluate the quality of a locally-generated synthesis response.
 *
 * @param response — Generated text from E2B or ONNX
 * @param query — Original user query (for term coverage check)
 * @returns Quality assessment with sub-scores and escalation decision
 */
export function evaluateSynthesisQuality(
	response: string,
	query: string,
): SynthesisQuality {
	const trimmed = response.trim();

	// Length score (0–1)
	let lengthScore: number;
	if (trimmed.length < _thresholds.minResponseLength) {
		lengthScore = trimmed.length / _thresholds.minResponseLength;
	} else if (trimmed.length > _thresholds.maxResponseLength) {
		// Penalize overly long responses (possible hallucination loop)
		lengthScore = Math.max(0.3, 1.0 - (trimmed.length - _thresholds.maxResponseLength) / 2000);
	} else {
		lengthScore = 1.0;
	}

	// Coherence score (0–1): sentence structure heuristics
	const sentences = trimmed.split(/[.!?]+/).filter(s => s.trim().length > 10);
	const hasCompleteSentences = sentences.length >= 1;
	const avgSentenceLength = sentences.length > 0
		? sentences.reduce((sum, s) => sum + s.trim().length, 0) / sentences.length
		: 0;
	// Good sentences are 30-200 chars; very short or very long = lower coherence
	const sentenceLengthScore = avgSentenceLength >= 30 && avgSentenceLength <= 200 ? 1.0
		: avgSentenceLength < 30 ? avgSentenceLength / 30
		: Math.max(0.5, 1.0 - (avgSentenceLength - 200) / 300);
	const coherenceScore = hasCompleteSentences ? sentenceLengthScore * 0.8 + 0.2 : 0.1;

	// Term coverage (0–1): does response address legal terms from the query?
	const queryLower = query.toLowerCase();
	const responseLower = trimmed.toLowerCase();
	const queryTerms = LEGAL_QUALITY_TERMS.filter(t => queryLower.includes(t));
	let termCoverageScore: number;
	if (queryTerms.length === 0) {
		// Non-legal query — term coverage is not relevant
		termCoverageScore = 0.8;
	} else {
		const covered = queryTerms.filter(t => responseLower.includes(t));
		termCoverageScore = covered.length / queryTerms.length;
	}

	// Weighted combination
	const score = lengthScore * 0.35 + coherenceScore * 0.40 + termCoverageScore * 0.25;

	const shouldEscalate = score < _thresholds.synthesis;
	const reasons: string[] = [];
	if (lengthScore < 0.5) reasons.push(`short-response(${trimmed.length}ch)`);
	if (coherenceScore < 0.5) reasons.push('low-coherence');
	if (termCoverageScore < 0.5 && queryTerms.length > 0) reasons.push('missing-legal-terms');
	if (!shouldEscalate) reasons.push('quality-sufficient');

	return {
		score,
		lengthScore,
		coherenceScore,
		termCoverageScore,
		shouldEscalate,
		reason: reasons.join('+') || 'ok',
	};
}

// ── Combined Decision ────────────────────────────────────────────────────

/**
 * Full two-phase quality decision: retrieval confidence → synthesis quality.
 *
 * @param signals — Pre-retrieval signals from RAG/KAG/DAG
 * @param response — Generated text (null if synthesis hasn't run yet)
 * @param query — Original user query
 * @returns Decision: use-local, escalate-to-server, or skip-synthesis
 */
export function makeQualityDecision(
	signals: RetrievalSignals,
	response: string | null,
	query: string,
): QualityDecision {
	const retrievalConfidence = scoreRetrievalConfidence(signals);

	// Phase 1: Check if retrieval context is sufficient
	if (retrievalConfidence < _thresholds.retrieval) {
		return {
			retrievalConfidence,
			synthesisQuality: null,
			action: 'skip-synthesis',
			reason: `retrieval-confidence-low(${retrievalConfidence.toFixed(2)} < ${_thresholds.retrieval})`,
		};
	}

	// Phase 2: If we have a response, evaluate its quality
	if (response !== null && response.trim().length > 0) {
		const quality = evaluateSynthesisQuality(response, query);
		if (quality.shouldEscalate) {
			return {
				retrievalConfidence,
				synthesisQuality: quality.score,
				action: 'escalate-to-server',
				reason: `synthesis-quality-low(${quality.score.toFixed(2)}): ${quality.reason}`,
			};
		}
		return {
			retrievalConfidence,
			synthesisQuality: quality.score,
			action: 'use-local',
			reason: `quality-ok(retrieval=${retrievalConfidence.toFixed(2)}, synthesis=${quality.score.toFixed(2)})`,
		};
	}

	// No response yet — retrieval confidence is sufficient, proceed with synthesis
	return {
		retrievalConfidence,
		synthesisQuality: null,
		action: 'use-local',
		reason: `retrieval-sufficient(${retrievalConfidence.toFixed(2)})`,
	};
}

// ── User Feedback Loop ───────────────────────────────────────────────────

const FEEDBACK_STORE_KEY = 'deeds-quality-feedback';
const THRESHOLD_ADJUST_STEP = 0.02;
const FEEDBACK_WINDOW = 20; // Last N feedbacks for threshold adjustment

/**
 * Record user feedback (thumbs up/down) on a response.
 * Adjusts local escalation thresholds based on accumulated feedback.
 */
export async function recordFeedback(feedback: QualityFeedback): Promise<void> {
	try {
		const history = await _loadFeedbackHistory();
		history.push(feedback);

		// Keep only recent feedback
		const recent = history.slice(-FEEDBACK_WINDOW);
		await _saveFeedbackHistory(recent);

		// Adjust thresholds based on feedback patterns
		_adjustThresholds(recent);
	} catch {
		// Best-effort — feedback is non-critical
	}
}

/**
 * Adjust escalation thresholds based on user feedback.
 *
 * If users consistently mark local responses as unhelpful → raise thresholds
 * (escalate to server more often). If local responses are consistently helpful
 * → lower thresholds (keep more responses local).
 */
function _adjustThresholds(feedbackHistory: QualityFeedback[]): void {
	const localFeedback = feedbackHistory.filter(
		f => f.source === 'local-e2b' || f.source === 'local-onnx'
	);
	if (localFeedback.length < 5) return; // Need minimum sample

	const helpfulRate = localFeedback.filter(f => f.helpful).length / localFeedback.length;

	if (helpfulRate < 0.4) {
		// Local responses often unhelpful → raise threshold (escalate more)
		_thresholds.synthesis = Math.min(0.7, _thresholds.synthesis + THRESHOLD_ADJUST_STEP);
		_thresholds.retrieval = Math.min(0.6, _thresholds.retrieval + THRESHOLD_ADJUST_STEP);
	} else if (helpfulRate > 0.8) {
		// Local responses usually helpful → lower threshold (keep local)
		_thresholds.synthesis = Math.max(0.25, _thresholds.synthesis - THRESHOLD_ADJUST_STEP);
		_thresholds.retrieval = Math.max(0.2, _thresholds.retrieval - THRESHOLD_ADJUST_STEP);
	}
	// else: in the middle range, keep current thresholds
}

async function _loadFeedbackHistory(): Promise<QualityFeedback[]> {
	if (typeof localStorage === 'undefined') return []; // SSR guard
	try {
		const raw = localStorage.getItem(FEEDBACK_STORE_KEY);
		return raw ? JSON.parse(raw) : [];
	} catch {
		return [];
	}
}

async function _saveFeedbackHistory(history: QualityFeedback[]): Promise<void> {
	if (typeof localStorage === 'undefined') return; // SSR guard
	try {
		localStorage.setItem(FEEDBACK_STORE_KEY, JSON.stringify(history));
	} catch {
		// Storage full or unavailable
	}
}

/** Get current threshold values (useful for debug UI). */
export function getThresholds(): Thresholds {
	return { ..._thresholds };
}

/** Reset thresholds to defaults (e.g., after model change). */
export function resetThresholds(): void {
	_thresholds = { ...DEFAULT_THRESHOLDS };
}
