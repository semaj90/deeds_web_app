import type { HyperedgeV1 } from '../contracts/bounded-resolution.js';

export interface HypergraphProjectionEdgeV1 {
	sourceCanonicalId: string;
	targetCanonicalId: string;
	weight: number;
	evidenceHyperedgeIds: string[];
}

/**
 * Build a disposable directed entity projection from canonical n-ary hyperedges.
 * Hyperedges remain the source of truth; this projection can be rebuilt for
 * PageRank, cuGraph, or Neo4j execution.
 *
 * Each hyperedge contributes 1/(n-1) to every directed participant pair so a
 * larger relation does not gain outgoing mass merely by containing more members.
 */
export function projectHyperedgesToWeightedEdges(
	hyperedges: readonly HyperedgeV1[],
): HypergraphProjectionEdgeV1[] {
	const projected = new Map<string, HypergraphProjectionEdgeV1>();

	for (const hyperedge of hyperedges) {
		const participants = [...new Set(hyperedge.participants.map((participant) => participant.canonicalId))].sort();
		if (participants.length < 2) continue;

		const contribution = 1 / (participants.length - 1);

		for (const source of participants) {
			for (const target of participants) {
				if (source === target) continue;
				const key = `${source}\u0000${target}`;
				const existing = projected.get(key);

				if (existing) {
					existing.weight += contribution;
					existing.evidenceHyperedgeIds.push(hyperedge.hyperedgeId);
				} else {
					projected.set(key, {
						sourceCanonicalId: source,
						targetCanonicalId: target,
						weight: contribution,
						evidenceHyperedgeIds: [hyperedge.hyperedgeId],
					});
				}
			}
		}
	}

	return [...projected.values()]
		.map((edge) => ({
			...edge,
			evidenceHyperedgeIds: [...new Set(edge.evidenceHyperedgeIds)].sort(),
		}))
		.sort((a, b) => {
			const source = a.sourceCanonicalId.localeCompare(b.sourceCanonicalId);
			return source !== 0 ? source : a.targetCanonicalId.localeCompare(b.targetCanonicalId);
		});
}
