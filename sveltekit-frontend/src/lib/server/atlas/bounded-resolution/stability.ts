import type { CandidateV1 } from '../contracts/bounded-resolution.js';

/**
 * Jaccard distance between two canonical candidate sets.
 *
 * delta = 1 - |A ∩ B| / |A ∪ B|
 *
 * A delta of zero means an observed expansion did not change canonical
 * membership. It does not prove that no unseen candidate exists.
 */
export function canonicalSetDelta(previous: Iterable<string>, current: Iterable<string>): number {
	const a = new Set(previous);
	const b = new Set(current);

	if (a.size === 0 && b.size === 0) return 0;

	let intersection = 0;
	for (const value of a) {
		if (b.has(value)) intersection += 1;
	}

	const union = a.size + b.size - intersection;
	return union === 0 ? 0 : 1 - intersection / union;
}

export function candidateDelta(
	previous: readonly CandidateV1[],
	current: readonly CandidateV1[],
): number {
	return canonicalSetDelta(
		previous.map((candidate) => candidate.canonicalId),
		current.map((candidate) => candidate.canonicalId),
	);
}

export function isStableDelta(delta: number, threshold: number): boolean {
	if (!Number.isFinite(delta) || delta < 0 || delta > 1) return false;
	return delta <= Math.max(0, Math.min(1, threshold));
}
