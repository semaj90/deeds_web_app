export type KmeansEmbedding = { id: string; embedding: number[] };

function squaredDistance(left: number[], right: number[]): number {
	let distance = 0;
	for (let index = 0; index < left.length; index += 1) {
		const diff = left[index] - right[index];
		distance += diff * diff;
	}
	return distance;
}

/**
 * Deterministic K-means for the Phase 78 error-clustering boundary.
 *
 * The first centroid is the lexically-smallest stable event id. Subsequent
 * centroids use deterministic farthest-point selection, avoiding Math.random()
 * and making a replay independent of process state.
 */
export function kmeansCluster(
	embeddings: KmeansEmbedding[],
	k: number,
): Map<number, string[]> {
	if (embeddings.length === 0) return new Map();
	const dimension = embeddings[0].embedding.length;
	if (dimension === 0 || embeddings.some(({ embedding }) => embedding.length !== dimension)) return new Map();
	const clusterCount = Math.max(1, Math.min(Math.floor(k), embeddings.length));
	const ordered = [...embeddings].sort((left, right) => left.id.localeCompare(right.id));
	if (clusterCount === embeddings.length) {
		return new Map(ordered.map((embedding, index) => [index, [embedding.id]]));
	}

	const centroids: number[][] = [ordered[0].embedding.slice()];
	while (centroids.length < clusterCount) {
		let selected = ordered[0];
		let selectedDistance = -1;
		for (const candidate of ordered) {
			const nearest = Math.min(...centroids.map((centroid) => squaredDistance(candidate.embedding, centroid)));
			if (nearest > selectedDistance || (nearest === selectedDistance && candidate.id.localeCompare(selected.id) < 0)) {
				selected = candidate;
				selectedDistance = nearest;
			}
		}
		centroids.push(selected.embedding.slice());
	}

	for (let iteration = 0; iteration < 10; iteration += 1) {
		const assignments = ordered.map(({ embedding }) => {
			let bestCluster = 0;
			let bestDistance = squaredDistance(embedding, centroids[0]);
			for (let cluster = 1; cluster < clusterCount; cluster += 1) {
				const distance = squaredDistance(embedding, centroids[cluster]);
				if (distance < bestDistance) {
					bestDistance = distance;
					bestCluster = cluster;
				}
			}
			return bestCluster;
		});
		let changed = false;
		for (let cluster = 0; cluster < clusterCount; cluster += 1) {
			const members = ordered.filter((_, index) => assignments[index] === cluster);
			if (members.length === 0) continue;
			const next = new Array<number>(dimension).fill(0);
			for (const member of members) {
				for (let index = 0; index < dimension; index += 1) next[index] += member.embedding[index];
			}
			for (let index = 0; index < dimension; index += 1) next[index] /= members.length;
			if (squaredDistance(next, centroids[cluster]) > 0.00000001) changed = true;
			centroids[cluster] = next;
		}
		if (!changed && iteration > 0) break;
	}

	const clusters = new Map<number, string[]>();
	for (const { id, embedding } of ordered) {
		let bestCluster = 0;
		let bestDistance = squaredDistance(embedding, centroids[0]);
		for (let cluster = 1; cluster < clusterCount; cluster += 1) {
			const distance = squaredDistance(embedding, centroids[cluster]);
			if (distance < bestDistance) {
				bestDistance = distance;
				bestCluster = cluster;
			}
		}
		const members = clusters.get(bestCluster) ?? [];
		members.push(id);
		clusters.set(bestCluster, members);
	}
	return clusters;
}
