#!/usr/bin/env node
/**
 * scripts/autoencoder-backfill-qdrant.mjs
 *
 * Backfills the 'encoded_64' named vector into Qdrant using trained autoencoder weights.
 *
 * Usage:
 *   node scripts/autoencoder-backfill-qdrant.mjs --collection codebase_chunks_768 [--limit 1000] [--force]
 */
import process from 'node:process';
import { scrollPoints, upsertPoints } from '../src/lib/server/qdrant-http.ts';
import { encode768to64Batch } from '../src/lib/server/gpu/encode-768-to-64.ts';
import { getCachedAutoencoderWeights } from '../src/lib/server/gpu/autoencoder-weights.ts';
import dotenv from 'dotenv';
dotenv.config();

const args = process.argv.slice(2);
const COLLECTION = args.find(a => a.startsWith('--collection='))?.split('=')[1] ?? 'codebase_chunks_768';
const LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '0', 10);
const FORCE = args.includes('--force');
const BATCH_SIZE = 256;

async function main() {
	console.log(`[backfill] Starting autoencoder backfill for ${COLLECTION}`);
	const weights = await getCachedAutoencoderWeights();
	console.log(`[backfill] Loaded weights trained at: ${weights.trainedAt}`);

	let offset = undefined;
	let totalScanned = 0;
	let encodedCount = 0;
	let skippedCount = 0;

	const startTime = Date.now();

	while (true) {
		const { points, nextOffset } = await scrollPoints({
			collection: COLLECTION,
			limit: BATCH_SIZE,
			offset,
			withVector: true, // Need existing content vector to preserve it
			withPayload: true
		});

		if (!points.length) break;

		const toEncode = [];
		const upserts = [];

		for (const pt of points) {
			totalScanned++;
			
			const payload = pt.payload || {};
			const encodedAt = payload.encoded_at;
			
			if (!FORCE && encodedAt && encodedAt >= weights.trainedAt) {
				skippedCount++;
				continue;
			}

			// Support both flat and named vector response from scroll
			const contentVec = pt.vector?.content ?? pt.vector;
			if (!Array.isArray(contentVec) || contentVec.length !== 768) {
				console.warn(`[backfill] Point ${pt.id} has invalid content vector`);
				continue;
			}

			toEncode.push({ id: pt.id, vector: contentVec, payload });
		}

		if (toEncode.length > 0) {
			const matrix = new Float32Array(toEncode.length * 768);
			toEncode.forEach((item, i) => matrix.set(item.vector, i * 768));

			const { encoded } = await encode768to64Batch(matrix, toEncode.length);

			toEncode.forEach((item, i) => {
				const encodedVec = Array.from(encoded.subarray(i * 64, (i + 1) * 64));
				upserts.push({
					id: item.id,
					vector: {
						content: item.vector,
						encoded_64: encodedVec
					},
					payload: {
						...item.payload,
						encoded_at: weights.trainedAt
					}
				});
			});

			await upsertPoints({
				collection: COLLECTION,
				points: upserts,
				wait: true
			});

			encodedCount += toEncode.length;
			console.log(`[backfill] Encoded ${encodedCount} points (total scanned: ${totalScanned})`);
		}

		if (LIMIT > 0 && totalScanned >= LIMIT) break;
		if (!nextOffset) break;
		offset = nextOffset;
	}

	const duration = (Date.now() - startTime) / 1000;
	console.log(`[backfill] Finished.`);
	console.log(`  Scanned: ${totalScanned}`);
	console.log(`  Encoded: ${encodedCount}`);
	console.log(`  Skipped: ${skippedCount}`);
	console.log(`  Duration: ${duration.toFixed(2)}s`);
}

main().catch(err => {
	console.error(`[backfill] Error:`, err);
	process.exit(1);
});
