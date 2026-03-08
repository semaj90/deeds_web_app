/**
 * Legal PageRank — Hybrid Ranking Algorithm
 *
 * Reranks search results using a weighted combination of:
 *   40% vector similarity (cosine score from Qdrant/pgvector)
 *   30% citation authority (inbound citation count, normalized)
 *   20% court hierarchy (federal > state appellate > state trial > admin)
 *   10% recency (newer documents score higher, 5-year decay)
 *
 * Designed as a drop-in reranker for evidence search results.
 */

export interface RankableItem {
	id: string;
	score: number;
	metadata: Record<string, unknown>;
	content: string;
}

export interface RankedItem extends RankableItem {
	legalRank: {
		vectorScore: number;
		citationScore: number;
		courtScore: number;
		recencyScore: number;
		finalScore: number;
		networkPosition?: 'CORE' | 'BRIDGE' | 'PERIPHERAL';
	};
}

/** Weights for the hybrid ranking formula. */
const WEIGHTS = {
	vector: 0.40,
	citation: 0.30,
	court: 0.20,
	recency: 0.10
} as const;

/** Court hierarchy scores (higher = more authoritative). */
const COURT_HIERARCHY: Record<string, number> = {
	// Federal
	'supreme court': 1.0,
	'scotus': 1.0,
	'circuit court': 0.85,
	'court of appeals': 0.85,
	'appeals court': 0.85,
	'district court': 0.70,
	'federal': 0.70,
	'bankruptcy court': 0.55,
	// State
	'state supreme': 0.75,
	'supreme court of': 0.75,
	'appellate': 0.60,
	'appellate court': 0.60,
	'superior court': 0.50,
	'circuit': 0.50,
	'trial court': 0.40,
	'county court': 0.35,
	'municipal': 0.30,
	// Administrative
	'administrative': 0.25,
	'tribunal': 0.25,
	'board': 0.20,
	'commission': 0.20,
	// Legislation (not a court, but authoritative source)
	'statute': 0.90,
	'regulation': 0.65,
	'code': 0.80,
	'act': 0.85
};

/**
 * Apply Legal PageRank to a list of search results.
 *
 * @param items - Raw search results with score + metadata
 * @param citationCounts - Optional map of document ID → inbound citation count
 * @param citationGraph - Optional CitationGraph for iterative PageRank authority scores
 * @returns Reranked items sorted by finalScore descending
 */
export function legalPageRank(
	items: RankableItem[],
	citationCounts?: Map<string, number>,
	citationGraph?: { getAuthorityScore(id: string): number; getNetworkPosition(id: string): 'CORE' | 'BRIDGE' | 'PERIPHERAL' }
): RankedItem[] {
	if (items.length === 0) return [];

	// Normalize vector scores to 0-1 range
	const maxVector = Math.max(...items.map((i) => i.score), 0.001);

	// Find max citation count for normalization
	const maxCitations = citationCounts
		? Math.max(...[...citationCounts.values()], 1)
		: 1;

	const now = Date.now();

	return items
		.map((item): RankedItem => {
			// 1. Vector similarity (already 0-1 from cosine, but normalize across batch)
			const vectorScore = item.score / maxVector;

			// 2. Citation authority — prefer graph PageRank when available
			let citationScore: number;
			let networkPosition: 'CORE' | 'BRIDGE' | 'PERIPHERAL' | undefined;
			if (citationGraph) {
				citationScore = citationGraph.getAuthorityScore(item.id);
				networkPosition = citationGraph.getNetworkPosition(item.id);
			} else {
				const rawCitations = citationCounts?.get(item.id) ?? countInlineCitations(item);
				citationScore = Math.min(rawCitations / maxCitations, 1);
			}

			// 3. Court hierarchy
			const courtScore = scoreCourtAuthority(item);

			// 4. Recency (5-year exponential decay)
			const recencyScore = scoreRecency(item, now);

			const finalScore =
				WEIGHTS.vector * vectorScore +
				WEIGHTS.citation * citationScore +
				WEIGHTS.court * courtScore +
				WEIGHTS.recency * recencyScore;

			return {
				...item,
				score: finalScore,
				legalRank: {
					vectorScore,
					citationScore,
					courtScore,
					recencyScore,
					finalScore,
					networkPosition
				}
			};
		})
		.sort((a, b) => b.score - a.score);
}

/** Count citation-like references in document content as a fallback. */
function countInlineCitations(item: RankableItem): number {
	const citations = (item.metadata?.citations as string[]) ?? [];
	if (citations.length > 0) return citations.length;

	// Count citation patterns in content
	let count = 0;
	const text = item.content;
	// Section references: § 1234
	count += (text.match(/§\s*\d+/g) ?? []).length;
	// USC references: 42 U.S.C. § 1983
	count += (text.match(/\d+\s+U\.?S\.?C\.?\s*§?\s*\d+/gi) ?? []).length;
	// Case citations: Name v. Name
	count += (text.match(/\b\w+\s+v\.?\s+\w+/g) ?? []).length;
	// Reporter citations: 123 F.3d 456
	count += (text.match(/\d+\s+(?:F\.\d+d|S\.Ct\.|L\.Ed|U\.S\.|A\.\d+d|N\.(?:E|W|Y|J)\.?\d*d?)\s+\d+/g) ?? []).length;

	return count;
}

/** Score court authority from metadata or content signals. */
function scoreCourtAuthority(item: RankableItem): number {
	// Check metadata fields
	const court = String(item.metadata?.court ?? '').toLowerCase();
	const jurisdiction = String(item.metadata?.jurisdiction ?? '').toLowerCase();
	const docType = String(item.metadata?.documentType ?? item.metadata?.evidenceType ?? '').toLowerCase();

	// Try direct court match
	for (const [key, score] of Object.entries(COURT_HIERARCHY)) {
		if (court.includes(key) || jurisdiction.includes(key)) return score;
	}

	// Try document type (statutes/codes rank high)
	for (const [key, score] of Object.entries(COURT_HIERARCHY)) {
		if (docType.includes(key)) return score;
	}

	// Content-based heuristic: scan first 500 chars for court indicators
	const preview = item.content.slice(0, 500).toLowerCase();
	for (const [key, score] of Object.entries(COURT_HIERARCHY)) {
		if (preview.includes(key)) return score * 0.8; // slight discount for content-based detection
	}

	return 0.3; // default: unknown authority
}

/** Score recency with 5-year exponential decay. */
function scoreRecency(item: RankableItem, now: number): number {
	const dateStr = String(
		item.metadata?.date ?? item.metadata?.createdAt ?? item.metadata?.filingDate ?? ''
	);

	if (!dateStr) return 0.5; // unknown date = middle score

	const date = new Date(dateStr);
	if (isNaN(date.getTime())) return 0.5;

	const ageMs = now - date.getTime();
	const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);

	// Exponential decay: half-life of 5 years
	// score = e^(-0.693 * age / halfLife)
	return Math.exp(-0.693 * ageYears / 5);
}
