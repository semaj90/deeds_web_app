/**
 * Regex-based intent classifier — Phase A of the
 * 2026-05-10_service-worker-regex-tool-router design.
 *
 * Pure module, no I/O, no imports beyond stdlib. ~2ms per call.
 * Drives the intent-router (Phase B) which picks an MCP tool chain instead
 * of always defaulting to kag.multi_lane_search.
 *
 * Confidence rule (from design §2.2):
 *   regex hit AND ≥2 keyword hits → 0.9
 *   regex hit AND 1 keyword hit   → 0.7
 *   regex hit alone               → 0.55
 *   keywords only (≥3)            → 0.5
 *   keywords only (≤2)            → 0.3 → fallback=true
 *
 * The fallback floor is 0.5 — anything strictly below routes to the
 * canonical kag.multi_lane_search via routeIntent().
 */

export type IntentLabel =
	| 'evidence_upload'
	| 'schema_drift'
	| 'graph_search'
	| 'gpu_rerank'
	| 'ui_bug'
	| 'legal_research';

export interface IntentResult {
	/** Best-fit label, or 'unknown' when no label clears the keyword threshold. */
	label:      IntentLabel | 'unknown';
	confidence: number;
	/** Matched tokens (lowercased), capped at 8 — fed to UI badge + telemetry. */
	keywords:   string[];
	/** true when confidence < 0.5; caller should treat this as "use default chain". */
	fallback:   boolean;
	/** Alternates above 0.3 for offline tuning (label + confidence pairs). */
	alternates: Array<{ label: IntentLabel; confidence: number }>;
}

// ── Label table ───────────────────────────────────────────────────────────────
// Kept inline so it's grep-able. One high-precision regex + one keyword set per label.

interface LabelSpec {
	regex:    RegExp;
	keywords: readonly string[];
}

const LABELS: Record<IntentLabel, LabelSpec> = {
	evidence_upload: {
		regex:    /\b(upload|attach|drop|ingest)\b[^.!?]*\b(evidence|document|pdf|image)\b/i,
		keywords: ['upload', 'evidence', 'file', 'ocr', 'minio', 'hash', 'pdf', 'attach'],
	},
	schema_drift: {
		regex:    /\b(schema|column|table|migration)\b[^.!?]*\b(drift|mismatch|missing|does\s+not\s+exist)\b/i,
		keywords: ['drizzle', 'migration', 'column', 'enum', 'postgres', 'schema', 'table', 'drift'],
	},
	graph_search: {
		// `s?` on both groups so plurals/inflections (hops, nodes, edges) match too.
		regex:    /\b(neighbor|path|hop|expand|trace)s?\b[^.!?]*\b(graph|node|edge)s?\b/i,
		keywords: ['neo4j', 'cypher', 'neighborhood', 'hops', 'bfs', 'graph', 'pagerank'],
	},
	gpu_rerank: {
		regex:    /\b(rerank|attention|blend)\b/i,
		keywords: ['karpathy', 'gpu', 'attention', 'cosine', 'top-k', 'rerank', 'tensor', 'cuda'],
	},
	ui_bug: {
		regex:    /\b(button|click|render|hydrat|console|404|500)\b/i,
		keywords: ['broken', 'error', "doesn't work", 'undefined', 'nan', 'crash', 'modal', 'card'],
	},
	legal_research: {
		regex:    /\b(case\s+law|statute|citation|precedent|holding)\b/i,
		keywords: ['court', 'ruling', 'opinion', 'plaintiff', 'doctrine', 'jurisdiction', 'appeal'],
	},
};

// ── Scoring ──────────────────────────────────────────────────────────────────

interface RawScore {
	label:        IntentLabel;
	confidence:   number;
	hitKeywords:  string[];
	regexHit:     boolean;
}

function scoreLabel(text: string, lower: string, label: IntentLabel, spec: LabelSpec): RawScore {
	const regexHit = spec.regex.test(text);
	const hits = spec.keywords.filter((kw) => lower.includes(kw));
	const kwCount = hits.length;

	let confidence: number;
	if (regexHit && kwCount >= 2) confidence = 0.9;
	else if (regexHit && kwCount === 1) confidence = 0.7;
	else if (regexHit) confidence = 0.55;
	else if (kwCount >= 3) confidence = 0.5;
	else if (kwCount > 0) confidence = 0.3;
	else confidence = 0;

	return { label, confidence, hitKeywords: hits, regexHit };
}

/**
 * Classify a single user-typed text into one of 6 known intents (or 'unknown').
 * Pure, deterministic. Safe to call on every keystroke if you want — but the
 * design says only call on send.
 */
export function inferIntent(text: string): IntentResult {
	const trimmed = (text ?? '').trim();
	if (trimmed.length === 0) {
		return { label: 'unknown', confidence: 0, keywords: [], fallback: true, alternates: [] };
	}

	const lower = trimmed.toLowerCase();
	const scores: RawScore[] = (Object.keys(LABELS) as IntentLabel[]).map((label) =>
		scoreLabel(trimmed, lower, label, LABELS[label])
	);

	// Highest confidence wins; ties broken by label order (stable).
	scores.sort((a, b) => b.confidence - a.confidence);
	const best = scores[0];

	const fallback = best.confidence < 0.5;
	const label: IntentLabel | 'unknown' = best.confidence === 0 ? 'unknown' : best.label;

	const alternates = scores
		.slice(1)
		.filter((s) => s.confidence >= 0.3)
		.map((s) => ({ label: s.label, confidence: s.confidence }));

	return {
		label,
		confidence: best.confidence,
		keywords:   best.hitKeywords.slice(0, 8),
		fallback,
		alternates,
	};
}
