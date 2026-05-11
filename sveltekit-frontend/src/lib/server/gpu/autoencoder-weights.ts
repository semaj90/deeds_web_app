import { getRedis } from '$lib/server/redis.js';

export interface AutoencoderWeights {
	W1: Float32Array; // [256 × 768] row-major
	b1: Float32Array; // [256]
	W2: Float32Array; // [64 × 256] row-major
	b2: Float32Array; // [64]
	/** ISO timestamp of training run that produced these weights. */
	trainedAt: string;
	/** Loss at end of training; used by health checks to detect untrained-state. */
	bestLoss: number;
}

let cachedWeights: AutoencoderWeights | null = null;
let cachedTrainedAt: string | null = null;

/**
 * Loads weights from Redis hashes `ace:autoencoder:weights` and `ace:autoencoder:meta`.
 */
export async function loadAutoencoderWeights(): Promise<AutoencoderWeights> {
	const redis = getRedis();
	const [weightsData, metaData] = await Promise.all([
		redis.hgetall('ace:autoencoder:weights'),
		redis.hgetall('ace:autoencoder:meta')
	]);

	if (!weightsData.W1 || !metaData.trainedAt) {
		throw new Error('Autoencoder weights or metadata missing in Redis');
	}

	const parseWeights = (csv: string) => new Float32Array(csv.split(',').map(Number));

	const weights: AutoencoderWeights = {
		W1: parseWeights(weightsData.W1),
		b1: parseWeights(weightsData.b1),
		W2: parseWeights(weightsData.W2),
		b2: parseWeights(weightsData.b2),
		trainedAt: metaData.trainedAt,
		bestLoss: Number(metaData.bestLoss || 0)
	};

	cachedWeights = weights;
	cachedTrainedAt = weights.trainedAt;
	return weights;
}

/**
 * In-process cache with trainedAt ETag invalidation.
 * Re-fetches when Redis reports a newer training run.
 */
export async function getCachedAutoencoderWeights(): Promise<AutoencoderWeights> {
	if (cachedWeights) {
		try {
			const latestAt = await getRedis().hget('ace:autoencoder:meta', 'trainedAt');
			if (latestAt && latestAt !== cachedTrainedAt) {
				cachedWeights = null;
				cachedTrainedAt = null;
			}
		} catch { /* keep cached value on probe error */ }
	}
	if (cachedWeights) return cachedWeights;
	return loadAutoencoderWeights();
}

/**
 * Health probe — returns null if weights missing/corrupt.
 */
export async function probeAutoencoderWeights(): Promise<{
	ok: boolean;
	trainedAt: string | null;
	loss: number | null;
	shapeOk: boolean;
	reason?: string;
}> {
	try {
		const weights = await loadAutoencoderWeights();
		const shapeOk =
			weights.W1.length === 256 * 768 &&
			weights.b1.length === 256 &&
			weights.W2.length === 64 * 256 &&
			weights.b2.length === 64;

		return {
			ok: true,
			trainedAt: weights.trainedAt,
			loss: weights.bestLoss,
			shapeOk,
			reason: shapeOk ? undefined : 'Invalid weight dimensions'
		};
	} catch (err) {
		return {
			ok: false,
			trainedAt: null,
			loss: null,
			shapeOk: false,
			reason: err instanceof Error ? err.message : String(err)
		};
	}
}
