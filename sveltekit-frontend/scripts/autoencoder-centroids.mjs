#!/usr/bin/env node
/**
 * scripts/autoencoder-centroids.mjs
 *
 * Computes mean centroids in 64d encoded space for each som_cluster.
 *
 * Usage:
 *   node scripts/autoencoder-centroids.mjs --collection codebase_chunks_768
 */
import process from 'node:process';
import { scrollPoints } from '../src/lib/server/qdrant-http.ts';
import { getCachedAutoencoderWeights } from '../src/lib/server/gpu/autoencoder-weights.ts';
import { autoencoderEncode } from '../src/lib/server/gpu/topology-projection.js';
import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const args = process.argv.slice(2);
const COLLECTION = args.find(a => a.startsWith('--collection='))?.split('=')[1] ?? 'codebase_chunks_768';
const MIN_CLUSTER_SIZE = 5;

async function main() {
	console.log(`[centroids] Computing centroids for ${COLLECTION}`);
	const weights = await getCachedAutoencoderWeights();
	const redis = new Redis(REDIS_URL);

	const clusters = new Map(); // clusterId -> { sum: Float32Array, count: number }

	let offset = undefined;
	let totalScanned = 0;

	while (true) {
		const { points, nextOffset } = await scrollPoints({
			collection: COLLECTION,
			limit: 500,
			offset,
			withVector: true, // Need encoded_64
			withPayload: true // Need som_cluster
		});

		if (!points.length) break;

		for (const pt of points) {
			totalScanned++;
			const clusterId = pt.payload?.som_cluster;
			if (clusterId === undefined || clusterId === null) continue;

			// Support both flat and named vector, or project from 768d on the fly
			let encodedVec = pt.vector?.encoded_64 ?? (Array.isArray(pt.vector) && pt.vector.length === 64 ? pt.vector : null);
			
			if (!encodedVec) {
				const contentVec = pt.vector?.content ?? (Array.isArray(pt.vector) && pt.vector.length === 768 ? pt.vector : null);
				if (contentVec) {
					// Project 768 -> 256 -> 64
					const res1 = await autoencoderEncode(new Float32Array(contentVec), weights.W1, weights.b1, { n: 1, dim: 768, outDim: 256 });
					if (res1.ok) {
						const res2 = await autoencoderEncode(res1.projected, weights.W2, weights.b2, { n: 1, dim: 256, outDim: 64 });
						if (res2.ok) encodedVec = Array.from(res2.projected);
					}
				}
			}

			if (!encodedVec) continue;

			if (!clusters.has(clusterId)) {
				clusters.set(clusterId, { sum: new Float32Array(64), count: 0 });
			}
			const entry = clusters.get(clusterId);
			for (let i = 0; i < 64; i++) entry.sum[i] += encodedVec[i];
			entry.count++;
		}

		console.log(`[centroids] Scanned ${totalScanned} points...`);
		if (!nextOffset) break;
		offset = nextOffset;
	}

	const hashFields = {};
	let clusterCount = 0;
	let totalPoints = 0;

	for (const [id, entry] of clusters.entries()) {
		if (entry.count < MIN_CLUSTER_SIZE) {
			console.log(`[centroids] Skipping cluster ${id} (size ${entry.count} < ${MIN_CLUSTER_SIZE})`);
			continue;
		}

		const centroid = new Float32Array(64);
		for (let i = 0; i < 64; i++) centroid[i] = entry.sum[i] / entry.count;
		
		hashFields[`cluster_${id}`] = Array.from(centroid).join(',');
		clusterCount++;
		totalPoints += entry.count;
	}

	if (clusterCount > 0) {
		await redis.hset('gpu:autoencoder:centroids_64', hashFields);
		await redis.hset('gpu:autoencoder:centroids_64_meta', {
			trainedAt: weights.trainedAt,
			clusterCount: clusterCount.toString(),
			totalPoints: totalPoints.toString(),
			computedAt: new Date().toISOString()
		});
		console.log(`[centroids] Wrote ${clusterCount} centroids to Redis.`);
	} else {
		console.warn(`[centroids] No valid clusters found.`);
	}

	await redis.quit();
	console.log(`[centroids] Finished.`);
}

main().catch(err => {
	console.error(`[centroids] Error:`, err);
	process.exit(1);
});
