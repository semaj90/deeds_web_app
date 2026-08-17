import type { AtlasRevisionSet, CandidateV1 } from '../contracts/bounded-resolution.js';

export interface LineageFrameV1 {
	revisions: AtlasRevisionSet;
	candidates: CandidateV1[];
}

export interface LineageTransitionV1 {
	from: CandidateV1;
	to: CandidateV1;
	fromFrameIndex: number;
	toFrameIndex: number;
}

export type LineageTransitionScorer = (transition: LineageTransitionV1) => number;

export interface LineagePathV1 {
	candidateIds: string[];
	score: number;
}

interface InternalLineagePath extends LineagePathV1 {
	tail: CandidateV1;
}

function comparePaths(a: LineagePathV1, b: LineagePathV1): number {
	if (a.score !== b.score) return b.score - a.score;
	return a.candidateIds.join('\u0000').localeCompare(b.candidateIds.join('\u0000'));
}

function topK<T extends LineagePathV1>(paths: T[], k: number): T[] {
	return paths.sort(comparePaths).slice(0, k);
}

/**
 * Deterministic k-best Viterbi-style decoder over revision-qualified candidate
 * fibers. Candidate.score is local emission evidence. The caller owns transition
 * evidence such as rename/move proof, CHANGED_BY, AST continuity, neighborhood
 * overlap, and revision ancestry.
 */
export function decodeKBestLineages(
	frames: readonly LineageFrameV1[],
	transitionScore: LineageTransitionScorer,
	k = 3,
): LineagePathV1[] {
	const width = Math.max(1, Math.floor(k));
	if (frames.length === 0 || frames[0].candidates.length === 0) return [];

	let frontier = new Map<string, InternalLineagePath[]>();

	for (const candidate of frames[0].candidates) {
		frontier.set(candidate.canonicalId, [
			{
				candidateIds: [candidate.canonicalId],
				score: candidate.score,
				tail: candidate,
			},
		]);
	}

	for (let frameIndex = 1; frameIndex < frames.length; frameIndex += 1) {
		const frame = frames[frameIndex];
		if (frame.candidates.length === 0) return [];

		const nextFrontier = new Map<string, InternalLineagePath[]>();

		for (const candidate of frame.candidates) {
			const expansions: InternalLineagePath[] = [];

			for (const paths of frontier.values()) {
				for (const path of paths) {
					const transition = transitionScore({
						from: path.tail,
						to: candidate,
						fromFrameIndex: frameIndex - 1,
						toFrameIndex: frameIndex,
					});

					if (!Number.isFinite(transition)) continue;

					expansions.push({
						candidateIds: [...path.candidateIds, candidate.canonicalId],
						score: path.score + transition + candidate.score,
						tail: candidate,
					});
				}
			}

			if (expansions.length > 0) {
				nextFrontier.set(candidate.canonicalId, topK(expansions, width));
			}
		}

		if (nextFrontier.size === 0) return [];
		frontier = nextFrontier;
	}

	const allPaths = [...frontier.values()].flat();
	return topK(allPaths, width).map(({ candidateIds, score }) => ({ candidateIds, score }));
}
