/**
 * K-Means Clustering Service
 * Assigns statutes to clusters with confidence scoring
 */

export interface KMeansConfig {
	k: number;
	maxIterations: number;
	tolerance: number;
}

export interface KMeansCluster {
	id: number;
	centroid: number[];
	members: string[];
	label?: string;
	avgConfidence?: number;
}

export interface ClusterAssignment {
	statuteId: string;
	clusterId: number;
	label: string;
	confidence: number;
	flaggedForReview: boolean;
}

const DEFAULT_CONFIG: KMeansConfig = {
	k: 8,
	maxIterations: 100,
	tolerance: 0.001
};

/**
 * Calculate Euclidean distance
 */
function euclideanDistance(a: number[], b: number[]): number {
	let sum = 0;
	for (let i = 0; i < a.length; i++) {
		const diff = a[i] - b[i];
		sum += diff * diff;
	}
	return Math.sqrt(sum);
}

/**
 * Initialize centroids using k-means++
 */
function initializeCentroids(data: number[][], k: number): number[][] {
	const centroids: number[][] = [];

	// Choose first centroid randomly
	const firstIdx = Math.floor(Math.random() * data.length);
	centroids.push([...data[firstIdx]]);

	// Choose remaining centroids
	for (let i = 1; i < k; i++) {
		let maxDistance = -Infinity;
		let nextIdx = 0;

		for (let j = 0; j < data.length; j++) {
			let minDistance = Infinity;

			for (const centroid of centroids) {
				const distance = euclideanDistance(data[j], centroid);
				minDistance = Math.min(minDistance, distance);
			}

			if (minDistance > maxDistance) {
				maxDistance = minDistance;
				nextIdx = j;
			}
		}

		centroids.push([...data[nextIdx]]);
	}

	return centroids;
}

/**
 * Assign points to nearest centroid
 */
function assignToClusters(
	data: number[][],
	centroids: number[][]
): { assignments: number[]; distances: number[] } {
	const assignments: number[] = [];
	const distances: number[] = [];

	for (const point of data) {
		let minDistance = Infinity;
		let clusterId = 0;

		for (let i = 0; i < centroids.length; i++) {
			const distance = euclideanDistance(point, centroids[i]);
			if (distance < minDistance) {
				minDistance = distance;
				clusterId = i;
			}
		}

		assignments.push(clusterId);
		distances.push(minDistance);
	}

	return { assignments, distances };
}

/**
 * Update centroids
 */
function updateCentroids(data: number[][], assignments: number[], k: number): number[][] {
	const newCentroids: number[][] = Array.from({ length: k }, () => []);
	const counts: number[] = Array(k).fill(0);

	// Sum points in each cluster
	for (let i = 0; i < data.length; i++) {
		const clusterId = assignments[i];
		if (!newCentroids[clusterId].length) {
			newCentroids[clusterId] = Array(data[i].length).fill(0);
		}

		for (let j = 0; j < data[i].length; j++) {
			newCentroids[clusterId][j] += data[i][j];
		}
		counts[clusterId]++;
	}

	// Average to get new centroids
	for (let i = 0; i < k; i++) {
		if (counts[i] > 0) {
			for (let j = 0; j < newCentroids[i].length; j++) {
				newCentroids[i][j] /= counts[i];
			}
		}
	}

	return newCentroids;
}

/**
 * Calculate centroid change
 */
function calculateCentroidChange(oldCentroids: number[][], newCentroids: number[][]): number {
	let maxChange = 0;

	for (let i = 0; i < oldCentroids.length; i++) {
		const change = euclideanDistance(oldCentroids[i], newCentroids[i]);
		maxChange = Math.max(maxChange, change);
	}

	return maxChange;
}

/**
 * Run K-Means clustering
 */
export async function runKMeans(
	centroids: number[][],
	k: number = 8,
	maxIterations: number = 100
): Promise<KMeansCluster[]> {
	if (centroids.length === 0) {
		throw new Error('No centroids provided for K-Means');
	}

	if (k > centroids.length) {
		throw new Error(`K (${k}) cannot be greater than number of centroids (${centroids.length})`);
	}

	// Initialize with k-means++
	let currentCentroids = initializeCentroids(centroids, k);

	// Iterate
	for (let iteration = 0; iteration < maxIterations; iteration++) {
		// Assign to clusters
		const { assignments } = assignToClusters(centroids, currentCentroids);

		// Update centroids
		const newCentroids = updateCentroids(centroids, assignments, k);

		// Check convergence
		const change = calculateCentroidChange(currentCentroids, newCentroids);
		currentCentroids = newCentroids;

		if (change < 0.001) {
			console.log(`K-Means converged at iteration ${iteration + 1}`);
			break;
		}

		if ((iteration + 1) % 10 === 0) {
			console.log(
				`K-Means iteration ${iteration + 1}/${maxIterations}, change: ${change.toFixed(6)}`
			);
		}
	}

	// Create final clusters
	const { assignments } = assignToClusters(centroids, currentCentroids);
	const clusters: KMeansCluster[] = [];

	for (let i = 0; i < k; i++) {
		const members: string[] = [];
		for (let j = 0; j < assignments.length; j++) {
			if (assignments[j] === i) {
				members.push(j.toString());
			}
		}

		clusters.push({
			id: i,
			centroid: currentCentroids[i],
			members
		});
	}

	return clusters;
}

/**
 * Assign statutes to clusters with confidence
 */
export async function assignStatutesToClusters(
	statutes: Array<{ id: string; embedding?: number[] }>,
	clusters: KMeansCluster[],
	confidenceThreshold: number = 0.7
): Promise<ClusterAssignment[]> {
	const assignments: ClusterAssignment[] = [];

	for (const statute of statutes) {
		if (!statute.embedding) {
			continue;
		}

		let minDistance = Infinity;
		let clusterId = 0;

		for (const cluster of clusters) {
			const distance = euclideanDistance(statute.embedding, cluster.centroid);
			if (distance < minDistance) {
				minDistance = distance;
				clusterId = cluster.id;
			}
		}

		// Convert distance to confidence (inverse relationship)
		// Normalize to 0-1 range
		const confidence = Math.max(0, 1 - minDistance / 10);

		assignments.push({
			statuteId: statute.id,
			clusterId,
			label: `Cluster ${clusterId}`, // Will be replaced by LLM
			confidence,
			flaggedForReview: confidence < confidenceThreshold
		});
	}

	return assignments;
}

/**
 * Generate cluster labels using LLM
 */
export async function generateClusterLabels(
	clusters: KMeansCluster[],
	statutes: Array<{ id: string; heading?: string; text?: string }>
): Promise<Map<number, string>> {
	const labels = new Map<number, string>();

	// For now, use generic labels
	// In production, call LLM to generate meaningful labels
	const defaultLabels = [
		'Violent Crimes',
		'Property Crimes',
		'White Collar Crimes',
		'Drug Crimes',
		'Procedural Rules',
		'Evidence Rules',
		'Civil Matters',
		'Administrative Law'
	];

	for (let i = 0; i < clusters.length; i++) {
		labels.set(i, defaultLabels[i] || `Category ${i + 1}`);
	}

	return labels;
}

/**
 * Calculate cluster quality metrics
 */
export function calculateClusterQuality(
	statutes: Array<{ id: string; embedding?: number[] }>,
	assignments: ClusterAssignment[],
	clusters: KMeansCluster[]
): {
	silhouetteScore: number;
	daviesBouldinIndex: number;
	avgConfidence: number;
} {
	let silhouetteSum = 0;
	let daviesBouldinSum = 0;
	let confidenceSum = 0;

	// Calculate silhouette score
	for (let i = 0; i < statutes.length; i++) {
		const statute = statutes[i];
		if (!statute.embedding) continue;

		const assignment = assignments[i];
		const cluster = clusters[assignment.clusterId];

		// Intra-cluster distance
		let intraDistance = 0;
		let intraCount = 0;

		for (const memberId of cluster.members) {
			const memberIdx = parseInt(memberId);
			if (memberIdx < statutes.length && statutes[memberIdx].embedding) {
				intraDistance += euclideanDistance(statute.embedding, statutes[memberIdx].embedding!);
				intraCount++;
			}
		}

		const a = intraCount > 0 ? intraDistance / intraCount : 0;

		// Inter-cluster distance
		let interDistance = Infinity;
		for (const otherCluster of clusters) {
			if (otherCluster.id === cluster.id) continue;

			let distance = 0;
			for (const memberId of otherCluster.members) {
				const memberIdx = parseInt(memberId);
				if (memberIdx < statutes.length && statutes[memberIdx].embedding) {
					distance += euclideanDistance(statute.embedding, statutes[memberIdx].embedding!);
				}
			}

			const b = otherCluster.members.length > 0 ? distance / otherCluster.members.length : 0;
			interDistance = Math.min(interDistance, b);
		}

		const silhouette = (interDistance - a) / Math.max(a, interDistance);
		silhouetteSum += silhouette;

		confidenceSum += assignment.confidence;
	}

	return {
		silhouetteScore: silhouetteSum / statutes.length,
		daviesBouldinIndex: daviesBouldinSum / clusters.length,
		avgConfidence: confidenceSum / statutes.length
	};
}

/**
 * Get cluster statistics
 */
export function getClusterStats(clusters: KMeansCluster[]): {
	clusterSizes: number[];
	avgClusterSize: number;
	minClusterSize: number;
	maxClusterSize: number;
} {
	const clusterSizes = clusters.map((c) => c.members.length);
	const totalSize = clusterSizes.reduce((a, b) => a + b, 0);

	return {
		clusterSizes,
		avgClusterSize: totalSize / clusters.length,
		minClusterSize: Math.min(...clusterSizes),
		maxClusterSize: Math.max(...clusterSizes)
	};
}
