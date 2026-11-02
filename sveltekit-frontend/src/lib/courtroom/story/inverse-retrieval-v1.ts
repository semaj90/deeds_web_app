import type { Cue } from './engine.js';
import type { StoryChunk } from './store.js';

export interface RankedChunk {
	chunkId: string;
	score: number;
	chunk: StoryChunk;
}

export interface RecallEvaluation {
	recall: number;
	precision: number;
	matchCount: number;
	tiesEncountered: boolean;
	totalGroundTruth: number;
}

const FLOAT_TIE_EPSILON = 1e-7;

/**
 * Computes cosine similarity between two Float32Array vectors.
 * Returns a value in [-1.0, 1.0]. Returns 0.0 if either vector has zero norm.
 */
export function computeCosineSimilarity(a: Float32Array, b: Float32Array): number {
	if (a.length !== b.length || a.length === 0) {
		throw new Error(`Vector dimension mismatch: expected ${a.length}, got ${b.length}`);
	}

	let dot = 0.0;
	let normA = 0.0;
	let normB = 0.0;

	for (let i = 0; i < a.length; i++) {
		const ai = a[i];
		const bi = b[i];
		dot += ai * bi;
		normA += ai * ai;
		normB += bi * bi;
	}

	if (normA <= 0.0 || normB <= 0.0) {
		return 0.0;
	}

	const cos = dot / (Math.sqrt(normA) * Math.sqrt(normB));
	return Math.max(-1.0, Math.min(1.0, cos));
}

/**
 * Deterministic comparison for ranking chunks:
 * 1. Score descending
 * 2. If score within EPSILON, break ties by chunkId ascending (lexicographical)
 */
export function compareRankedChunks(a: RankedChunk, b: RankedChunk): number {
	const scoreDiff = b.score - a.score;
	if (Math.abs(scoreDiff) > FLOAT_TIE_EPSILON) {
		return scoreDiff;
	}
	return a.chunkId.localeCompare(b.chunkId);
}

/**
 * Performs an exact scan over cached chunks, ranking them by cosine similarity against queryVector.
 * Breaks ties deterministically by chunk ID.
 */
export function exactScanTopK(
	queryVector: Float32Array,
	chunks: readonly StoryChunk[],
	k = 5,
	minScore = -1.0
): RankedChunk[] {
	if (k <= 0) return [];

	const candidates: RankedChunk[] = [];

	for (const chunk of chunks) {
		if (!chunk.vector) continue;
		const score = computeCosineSimilarity(queryVector, chunk.vector);
		if (score >= minScore) {
			candidates.push({
				chunkId: chunk.id,
				score,
				chunk
			});
		}
	}

	candidates.sort(compareRankedChunks);
	return candidates.slice(0, k);
}

/**
 * Ranks cached chunks by cosine similarity with optional top-k truncation and minScore threshold.
 */
export function rankChunksByCosine(
	queryVector: Float32Array,
	chunks: readonly StoryChunk[],
	options: { k?: number; minScore?: number } = {}
): RankedChunk[] {
	const { k = 5, minScore = -1.0 } = options;
	return exactScanTopK(queryVector, chunks, k, minScore);
}

/**
 * Evaluates tie-aware recall of a candidate ranking against a ground-truth ranking.
 * Accounts for score ties within FLOAT_TIE_EPSILON where ordering variations among
 * equally-scored items should not penalize recall.
 */
export function evaluateTopKRecall(
	candidateHits: readonly RankedChunk[],
	groundTruthHits: readonly RankedChunk[],
	k: number
): RecallEvaluation {
	const effectiveK = Math.min(k, groundTruthHits.length);
	if (effectiveK === 0) {
		return {
			recall: 1.0,
			precision: 1.0,
			matchCount: 0,
			tiesEncountered: false,
			totalGroundTruth: 0
		};
	}

	const topGroundTruth = groundTruthHits.slice(0, effectiveK);
	const topCandidates = candidateHits.slice(0, effectiveK);

	const minGtScore = topGroundTruth[topGroundTruth.length - 1].score;
	const tiesEncountered = groundTruthHits.some(
		(gt, idx) => idx >= effectiveK && Math.abs(gt.score - minGtScore) <= FLOAT_TIE_EPSILON
	);

	const gtIdSet = new Set(topGroundTruth.map((h) => h.chunkId));
	let matchCount = 0;

	for (const cand of topCandidates) {
		if (gtIdSet.has(cand.chunkId)) {
			matchCount++;
		} else if (tiesEncountered && Math.abs(cand.score - minGtScore) <= FLOAT_TIE_EPSILON) {
			// Candidate tied with boundary score and exists in valid tie group
			const inTieGroup = groundTruthHits.some(
				(gt) => gt.chunkId === cand.chunkId && Math.abs(gt.score - minGtScore) <= FLOAT_TIE_EPSILON
			);
			if (inTieGroup) matchCount++;
		}
	}

	const recall = matchCount / effectiveK;
	const precision = topCandidates.length > 0 ? matchCount / topCandidates.length : 0;

	return {
		recall,
		precision,
		matchCount,
		tiesEncountered,
		totalGroundTruth: effectiveK
	};
}

export interface GroundingResult {
	groundedCues: Cue[];
	matchSummary: Array<{
		cueId: string;
		chunkId: string;
		score: number;
		actorId: string;
	}>;
	unmatchedDialogueCount: number;
}

/**
 * Grounds dialogue cues in a story by searching cached chunks for the highest cosine similarity.
 * Assigns requiredEvidence = bestChunk.id if the score meets minScore threshold.
 */
export function groundCuesWithInverseRetrieval(
	cues: readonly Cue[],
	chunks: readonly StoryChunk[],
	queryEmbeddings: Map<string, Float32Array>,
	options: { minScore?: number } = {}
): GroundingResult {
	const minScore = options.minScore ?? 0.65;
	const groundedCues: Cue[] = [];
	const matchSummary: GroundingResult['matchSummary'] = [];
	let unmatchedDialogueCount = 0;

	for (const cue of cues) {
		if (cue.kind !== 'dialogue') {
			groundedCues.push(cue);
			continue;
		}

		if (cue.requiredEvidence) {
			groundedCues.push(cue);
			continue;
		}

		const embedding = queryEmbeddings.get(cue.id);
		if (!embedding) {
			unmatchedDialogueCount++;
			groundedCues.push(cue);
			continue;
		}

		const hits = rankChunksByCosine(embedding, chunks, { k: 1, minScore });
		if (hits.length > 0 && hits[0].score >= minScore) {
			const best = hits[0];
			groundedCues.push({
				...cue,
				requiredEvidence: best.chunkId
			});
			matchSummary.push({
				cueId: cue.id,
				chunkId: best.chunkId,
				score: best.score,
				actorId: cue.actorId
			});
		} else {
			unmatchedDialogueCount++;
			groundedCues.push(cue);
		}
	}

	return {
		groundedCues,
		matchSummary,
		unmatchedDialogueCount
	};
}
