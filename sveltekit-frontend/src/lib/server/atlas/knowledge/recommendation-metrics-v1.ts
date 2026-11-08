/**
 * Pure ranking metrics for comparing recommendation lanes on a frozen judged set.
 * Results from a fixture set are FIXTURE_PROVEN only. They are not live retrieval quality.
 */

export interface JudgedQueryV1 {
	queryId: string;
	/** Relevant item IDs (e.g. packet keys) for this query, from a reviewed judgment set. */
	relevant: string[];
	/** Ranked candidate IDs produced by one lane, best first. */
	ranked: string[];
}

export function recallAtK(q: JudgedQueryV1, k: number): number {
	if (!Number.isInteger(k) || k <= 0) throw new Error('METRIC_K_INVALID');
	if (q.relevant.length === 0) return 0;
	const relevant = new Set(q.relevant);
	const hits = q.ranked.slice(0, k).filter((id) => relevant.has(id)).length;
	return hits / relevant.size;
}

export function reciprocalRank(q: JudgedQueryV1): number {
	const relevant = new Set(q.relevant);
	const idx = q.ranked.findIndex((id) => relevant.has(id));
	return idx === -1 ? 0 : 1 / (idx + 1);
}

export interface LaneSummaryV1 {
	lane: string;
	queries: number;
	meanRecallAtK: number;
	k: number;
	mrr: number;
}

export function summarizeLane(lane: string, queries: JudgedQueryV1[], k: number): LaneSummaryV1 {
	if (queries.length === 0) throw new Error('METRIC_NO_QUERIES');
	const meanRecallAtK = queries.reduce((a, q) => a + recallAtK(q, k), 0) / queries.length;
	const mrr = queries.reduce((a, q) => a + reciprocalRank(q), 0) / queries.length;
	return { lane, queries: queries.length, meanRecallAtK, k, mrr };
}
