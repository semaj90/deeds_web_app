// @vitest-environment node
/**
 * GET /api/topology/centroids
 *
 * Returns the 87 SOM cluster centroids as 2D scatter positions (PCA projection
 * of the 64-dim autoencoder space) fused with LLM-generated labels + summaries
 * from Redis cluster:summary:*.
 *
 * Used by the topology viewer cluster overlay.
 *
 * Response:
 *   { clusters: ClusterCentroid[], projection: 'pca-2d', count: number }
 *
 * Cached in Redis at topology:centroids:pca2d (TTL 10 min).
 * Invalidated automatically when gpu:autoencoder:centroids_64 trainedAt changes.
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { getCentroids64 } from '$lib/server/retrieval/encoded-cluster-prefilter.js';
import { getRedis } from '$lib/server/redis.js';

const CACHE_KEY = 'topology:centroids:pca2d';
const CACHE_TTL = 600; // 10 min

export interface ClusterCentroid {
	clusterId:      number;
	label:          string;
	summary:        string;
	size:           number;
	trainedAt:      string;
	encoderVersion: string;
	filePaths:      string[];
	/** PCA-projected x position, normalised 0–1 */
	x: number;
	/** PCA-projected y position, normalised 0–1 */
	y: number;
}

// ── 2-component PCA via power iteration (no external deps) ────────────────────

function pca2d(rows: Float32Array[], dim: number): [number, number][] {
	const n = rows.length;
	if (n === 0) return [];

	// Centre
	const mean = new Float32Array(dim);
	for (const row of rows) for (let j = 0; j < dim; j++) mean[j] += row[j] / n;
	const centered = rows.map(row => {
		const c = new Float32Array(dim);
		for (let j = 0; j < dim; j++) c[j] = row[j] - mean[j];
		return c;
	});

	// Power iteration for one principal component
	function powerIter(vecs: Float32Array[], seed: Float32Array, iters = 25): Float32Array {
		let v = seed.slice();
		for (let iter = 0; iter < iters; iter++) {
			const Av = new Float32Array(dim);
			for (const x of vecs) {
				let dot = 0;
				for (let i = 0; i < dim; i++) dot += x[i] * v[i];
				for (let i = 0; i < dim; i++) Av[i] += dot * x[i];
			}
			let norm = 0;
			for (let i = 0; i < dim; i++) norm += Av[i] * Av[i];
			norm = Math.sqrt(norm) || 1;
			for (let i = 0; i < dim; i++) v[i] = Av[i] / norm;
		}
		return v;
	}

	// Deterministic seed (avoids random jitter between requests)
	const seed1 = new Float32Array(dim).map((_, i) => Math.cos(i * 0.7));

	const pc1 = powerIter(centered, seed1);

	// Deflate: remove PC1 projection
	const deflated = centered.map(row => {
		let dot = 0;
		for (let i = 0; i < dim; i++) dot += row[i] * pc1[i];
		const d = new Float32Array(dim);
		for (let i = 0; i < dim; i++) d[i] = row[i] - dot * pc1[i];
		return d;
	});

	const seed2 = new Float32Array(dim).map((_, i) => Math.sin(i * 0.5));
	const pc2 = powerIter(deflated, seed2);

	// Project all rows onto PC1, PC2
	const scores: [number, number][] = centered.map(row => {
		let x = 0, y = 0;
		for (let i = 0; i < dim; i++) { x += row[i] * pc1[i]; y += row[i] * pc2[i]; }
		return [x, y];
	});

	// Normalise to [0.05, 0.95] (5% padding so labels don't clip)
	let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
	for (const [x, y] of scores) {
		if (x < minX) minX = x; if (x > maxX) maxX = x;
		if (y < minY) minY = y; if (y > maxY) maxY = y;
	}
	const rangeX = maxX - minX || 1;
	const rangeY = maxY - minY || 1;
	return scores.map(([x, y]) => [
		0.05 + 0.9 * (x - minX) / rangeX,
		0.05 + 0.9 * (y - minY) / rangeY,
	]);
}

// ── Short label from first sentence of LLM summary ───────────────────────────

function deriveLabel(summary: string, clusterId: number): string {
	if (!summary?.trim()) return `Cluster ${clusterId}`;
	const sentence = summary.match(/^[^.!?\n]+[.!?]?/)?.[0]?.trim() ?? summary;
	return sentence.length > 72 ? sentence.slice(0, 69) + '…' : sentence;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const redis = getRedis();

	// Redis cache check
	try {
		const cached = await redis.get(CACHE_KEY);
		if (cached) {
			const parsed = JSON.parse(cached) as { clusters: ClusterCentroid[]; trainedAt: string };
			// Invalidate if training run changed
			const meta = await redis.hgetall('gpu:autoencoder:centroids_64_meta');
			if (meta?.trainedAt === parsed.trainedAt) {
				return json({ clusters: parsed.clusters, projection: 'pca-2d', count: parsed.clusters.length, cached: true });
			}
		}
	} catch { /* Redis miss — continue */ }

	// Load 64-dim centroids
	const centroids = await getCentroids64();
	if (!centroids || centroids.count === 0) {
		return json({ error: 'Centroids not available — run npm run graphify:full first' }, { status: 503 });
	}

	// Load cluster summaries from Redis
	const summaryMap = new Map<number, { label: string; summary: string; size: number; filePaths: string[]; trainedAt: string }>();
	try {
		const keys = await redis.keys('cluster:summary:*');
		if (keys.length > 0) {
			const vals = await redis.mget(...keys);
			for (let i = 0; i < keys.length; i++) {
				const raw = vals[i];
				if (!raw) continue;
				try {
					const rec = JSON.parse(raw);
					if (typeof rec.clusterId === 'number') {
						summaryMap.set(rec.clusterId, {
							label:     deriveLabel(rec.summary ?? '', rec.clusterId),
							summary:   rec.summary ?? '',
							size:      rec.size ?? 0,
							filePaths: rec.filePaths ?? [],
							trainedAt: rec.trainedAt ?? centroids.trainedAt,
						});
					}
				} catch { /* skip malformed */ }
			}
		}
	} catch { /* summaries unavailable — use defaults */ }

	// Extract per-cluster centroid vectors
	const DIM = 64;
	const clusterRows: Float32Array[] = centroids.ids.map((_, i) =>
		centroids.data.subarray(i * DIM, (i + 1) * DIM)
	);

	// Project to 2D
	const positions = pca2d(clusterRows, DIM);

	// Build response
	const clusters: ClusterCentroid[] = centroids.ids.map((id, i) => {
		const s = summaryMap.get(id);
		return {
			clusterId:      id,
			label:          s?.label          ?? `Cluster ${id}`,
			summary:        s?.summary        ?? '',
			size:           s?.size           ?? 0,
			trainedAt:      s?.trainedAt      ?? centroids.trainedAt,
			encoderVersion: 'ae-768-256-64-tanh-v1',
			filePaths:      s?.filePaths      ?? [],
			x:              positions[i]?.[0] ?? 0.5,
			y:              positions[i]?.[1] ?? 0.5,
		};
	});

	// Sort by clusterId for stable ordering
	clusters.sort((a, b) => a.clusterId - b.clusterId);

	// Cache result
	try {
		await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify({ clusters, trainedAt: centroids.trainedAt }));
	} catch { /* non-fatal */ }

	return json({ clusters, projection: 'pca-2d', count: clusters.length, cached: false });
};
