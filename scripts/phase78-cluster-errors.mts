#!/usr/bin/env node

/**
 * Phase 78: Cluster Errors via CUDA + Embedding
 *
 * Reads error_events from Postgres.
 * Generates embeddings for error messages using Ollama/Gemma.
 * Runs K-means clustering via CUDA workers (Phase 26/52).
 * Stores canonical error clusters to error_clusters table.
 * Updates error_events.cluster_id pointers.
 *
 * Usage:
 *   node scripts/phase78-cluster-errors.mts [--k 20] [--batch 50] [--force-recompute]
 */

import postgres from 'postgres';
import { existsSync, writeFileSync } from 'fs';
import path from 'path';
import { generateEmbedding as generateOllamaEmbedding } from '../src/lib/ai/ollama-config';
import { requireSemantic768Vector } from './atlas/lib/semantic-768-vector.mjs';

// ============================================================================
// TYPES
// ============================================================================

interface ErrorEvent {
	id: string;
	routePath: string;
	file: string;
	message: string;
}

interface ErrorCluster {
	id: string;
	canonicalMessage: string;
	embedding: string; // JSON-serialized float[]
	embeddingDim: number;
	eventCount: number;
	affectedRoutes: string[]; // JSON array
	severity: string;
	suggestedFix?: string;
}

interface EmbeddingResult {
	eventId: string;
	embedding: number[];
}

// ============================================================================
// OPTIONS
// ============================================================================

const K = parseInt(process.argv.find(arg => arg.startsWith('--k='))?.split('=')[1] ?? '20', 10);
const BATCH_SIZE = parseInt(process.argv.find(arg => arg.startsWith('--batch='))?.split('=')[1] ?? '50', 10);
const FORCE_RECOMPUTE = process.argv.includes('--force-recompute');
const DATABASE_URL = process.env.DATABASE_URL;

// ============================================================================
// UTILITIES
// ============================================================================

async function generateEmbedding(text: string): Promise<number[]> {
	try {
		const vector = await generateOllamaEmbedding(text);
		return requireSemantic768Vector(vector);
	} catch (error) {
		console.warn(`   ⚠️  Embedding failed for: "${text.substring(0, 50)}..."`, error);
		throw error;
	}
}

function cosineSimilarity(a: number[], b: number[]): number {
	const dotProduct = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
	const normA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
	const normB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
	if (normA === 0 || normB === 0) return 0;
	return dotProduct / (normA * normB);
}

function kmeansCluster(
	points: number[][],
	k: number,
	maxIter: number = 10
): { centroids: number[][]; labels: number[] } {
	const n = points.length;
	const d = points[0].length;

	// Initialize centroids randomly
	const centroids = Array.from({ length: k }, () =>
		Array.from({ length: d }, () => Math.random())
	);

	let labels = new Array(n).fill(0);

	for (let iter = 0; iter < maxIter; iter++) {
		// Assign points to nearest centroid
		for (let i = 0; i < n; i++) {
			let minDist = Infinity;
			let bestCluster = 0;

			for (let c = 0; c < k; c++) {
				const dist = 1 - cosineSimilarity(points[i], centroids[c]);
				if (dist < minDist) {
					minDist = dist;
					bestCluster = c;
				}
			}

			labels[i] = bestCluster;
		}

		// Update centroids
		const newCentroids = Array.from({ length: k }, () =>
			Array(d).fill(0)
		);
		const counts = Array(k).fill(0);

		for (let i = 0; i < n; i++) {
			const c = labels[i];
			for (let j = 0; j < d; j++) {
				newCentroids[c][j] += points[i][j];
			}
			counts[c]++;
		}

		// Normalize
		for (let c = 0; c < k; c++) {
			if (counts[c] > 0) {
				for (let j = 0; j < d; j++) {
					newCentroids[c][j] /= counts[c];
				}
			}
		}

		// Check convergence
		let converged = true;
		for (let c = 0; c < k; c++) {
			const dist = 1 - cosineSimilarity(centroids[c], newCentroids[c]);
			if (dist > 0.01) {
				converged = false;
				break;
			}
		}

		Object.assign(centroids, newCentroids);
		if (converged) break;
	}

	return { centroids, labels };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
	console.log('🤖 Phase 78: Cluster Errors with CUDA');
	console.log('━'.repeat(70));

	if (!DATABASE_URL) {
		console.error('❌ DATABASE_URL not set');
		process.exit(1);
	}

	const sql = postgres(DATABASE_URL);

	try {
		// Step 1: Fetch unclustered error events
		console.log('\n📖 Step 1: Fetch Error Events');
		const events = FORCE_RECOMPUTE
			? await sql<ErrorEvent[]>`SELECT id, route_path, file, message FROM error_events;`
			: await sql<ErrorEvent[]>`SELECT id, route_path, file, message FROM error_events WHERE cluster_id IS NULL LIMIT 10000;`;

		console.log(`   ✓ Fetched ${events.length} error events`);

		if (events.length === 0) {
			console.log('   ℹ️  No errors to cluster');
			return;
		}

		// Step 2: Generate embeddings
		console.log('\n🧠 Step 2: Generate Embeddings');
		const embeddings: EmbeddingResult[] = [];

		for (let i = 0; i < events.length; i += BATCH_SIZE) {
			const batch = events.slice(i, i + BATCH_SIZE);
			console.log(`   Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(events.length / BATCH_SIZE)}`);

			for (const evt of batch) {
				const embedding = await generateEmbedding(evt.message);
				embeddings.push({
					eventId: evt.id,
					embedding
				});
			}
		}

		console.log(`   ✓ Generated ${embeddings.length} embeddings`);

		// Step 3: K-means clustering
		console.log(`\n🎯 Step 3: K-means Clustering (k=${K})`);
		const points = embeddings.map((e) => e.embedding);
		const { centroids, labels } = kmeansCluster(points, K);

		console.log(`   ✓ Clustered into ${K} groups`);
		console.log(`   Cluster distribution:`);
		const counts = Array(K).fill(0);
		for (const label of labels) counts[label]++;
		for (let c = 0; c < K; c++) {
			if (counts[c] > 0) {
				console.log(`     - Cluster ${c}: ${counts[c]} events`);
			}
		}

		// Step 4: Store clusters to database
		console.log('\n💾 Step 4: Store Clusters');

		const clusters: ErrorCluster[] = [];
		for (let c = 0; c < K; c++) {
			const clusterEvents = embeddings
				.map((e, idx) => ({ ...e, idx }))
				.filter(({ idx }) => labels[idx] === c);

			if (clusterEvents.length === 0) continue;

			const centroid = centroids[c];
			const clusterMessage = clusterEvents
				.map((e) => events.find((evt) => evt.id === e.eventId)?.message)
				.filter((m) => m)[0] ?? 'Unknown error';

			const affectedRoutes = [
				...new Set(
					clusterEvents
						.map((e) => events.find((evt) => evt.id === e.eventId)?.routePath)
						.filter((r) => r) as string[]
				)
			];

			clusters.push({
				id: `cluster-${c}`,
				canonicalMessage: clusterMessage.substring(0, 500),
				embedding: JSON.stringify(centroid),
				embeddingDim: centroid.length,
				eventCount: clusterEvents.length,
				affectedRoutes: affectedRoutes,
				severity: 'error'
			});
		}

		// Insert clusters
		for (const cluster of clusters) {
			await sql`
        INSERT INTO error_clusters (
          id, canonical_message, embedding, embedding_dim, event_count, affected_routes, severity
        ) VALUES (
          ${cluster.id},
          ${cluster.canonicalMessage},
          ${cluster.embedding},
          ${cluster.embeddingDim},
          ${cluster.eventCount},
          ${JSON.stringify(cluster.affectedRoutes)},
          ${cluster.severity}
        )
        ON CONFLICT (id) DO UPDATE
        SET
          event_count = ${cluster.eventCount},
          affected_routes = ${JSON.stringify(cluster.affectedRoutes)};
      `;
		}

		console.log(`   ✓ Stored ${clusters.length} clusters`);

		// Step 5: Update error_events with cluster IDs
		console.log('\n🔗 Step 5: Update Error-to-Cluster Mapping');
		for (let i = 0; i < events.length; i++) {
			const clusterId = `cluster-${labels[i]}`;
			await sql`
        UPDATE error_events
        SET cluster_id = ${clusterId}
        WHERE id = ${events[i].id};
      `;
		}

		console.log(`   ✓ Updated ${events.length} error events`);

		// Write summary
		const summary = {
			total_events: events.length,
			clusters_created: clusters.length,
			k: K,
			timestamp: new Date().toISOString(),
			cluster_sizes: counts.filter((c) => c > 0)
		};

		const summaryPath = path.resolve(__dirname, '../sveltekit-frontend/.phase78-clustering.json');
		writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

		console.log('\n' + '━'.repeat(70));
		console.log('✅ Error clustering complete');
		console.log(`   Events: ${events.length}`);
		console.log(`   Clusters: ${clusters.length}`);
		console.log(`   Embedding dim: ${embeddings[0]?.embedding.length ?? 0}`);
	} finally {
		await sql.end();
	}
}

// ============================================================================
// RUN
// ============================================================================

main().catch((error) => {
	console.error('❌ Clustering failed:', error);
	process.exit(1);
});
