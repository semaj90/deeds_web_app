import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { clusterSummaries } from '$lib/server/db/schema-postgres.js';
import { getRedis } from '$lib/server/redis.js';
import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';
import { getCachedAutoencoderWeights, probeAutoencoderWeights } from '$lib/server/gpu/autoencoder-weights.js';
import { autoencoderEncode2Layer } from '$lib/server/gpu/topology-projection.js';
import {
	readLatestQdrantClusterTags,
	scoreClusterRelevance,
	type ClusterTagsEntry,
} from '$lib/server/ace/cluster-tags-cache.js';

const querySchema = z.object({
	q: z.string().trim().min(2).max(4000),
	repoId: z.string().trim().min(1).max(200).default('default'),
	topK: z.coerce.number().int().min(1).max(10).default(5),
});

interface EncyclopediaCluster {
	clusterId: number;
	score: number;
	label: string;
	summary: string;
	purpose: string | null;
	tags: string[];
	topoClasses: string[];
	topFiles: string[];
	representativeChunkIds: string[];
	memberCount: number;
	centroidDistanceMean: number | null;
	hasSummaryEmbedding: boolean;
	rankingSource: 'autoencoder-centroids' | 'summary-embedding-cosine';
}

interface EncyclopediaResponse {
	query: string;
	repoId: string;
	fallback: boolean;
	weightsReady: boolean;
	rankingSource: 'autoencoder-centroids' | 'summary-embedding-cosine' | 'none';
	centroidCount: number;
	clusterId: number | null;
	label: string;
	summary: string;
	chunkIds: string[];
	topFiles: string[];
	didYouMean: string[];
	encoded64: number[];
	clusterIds: number[];
	clusters: EncyclopediaCluster[];
	error: string | null;
}

const EMPTY_RESPONSE = (query = '', repoId = 'default'): EncyclopediaResponse => ({
	query,
	repoId,
	fallback: true,
	weightsReady: false,
	rankingSource: 'none',
	centroidCount: 0,
	clusterId: null,
	label: '',
	summary: '',
	chunkIds: [],
	topFiles: [],
	didYouMean: [],
	encoded64: [],
	clusterIds: [],
	clusters: [],
	error: null,
});

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ ...EMPTY_RESPONSE(), error: 'Unauthorized' }, { status: 401 });
	}

	const parsed = querySchema.safeParse({
		q: url.searchParams.get('q') ?? '',
		repoId: url.searchParams.get('repoId') ?? 'default',
		topK: url.searchParams.get('topK') ?? url.searchParams.get('limit') ?? undefined,
	});

	if (!parsed.success) {
		const query = url.searchParams.get('q') ?? '';
		const repoId = url.searchParams.get('repoId') ?? 'default';
		return json({
			...EMPTY_RESPONSE(query, repoId),
			error: parsed.error.issues[0]?.message ?? 'Invalid request',
		}, { status: 400 });
	}

	const { q, repoId, topK } = parsed.data;
	const query = q.trim();
	const qLower = query.toLowerCase();
	const qTerms = new Set(
		qLower
			.split(/[^a-z0-9]+/)
			.map((part) => part.trim())
			.filter(Boolean)
	);

	try {
		const [queryEmbedding, probe, rows] = await Promise.all([
			generateSingleEmbedding(query),
			probeAutoencoderWeights(),
			db.select({
				gpuCluster: clusterSummaries.gpuCluster,
				summary: clusterSummaries.summary,
				purpose: clusterSummaries.purpose,
				tags: clusterSummaries.tags,
				representativeChunkIds: clusterSummaries.representativeChunkIds,
				memberCount: clusterSummaries.memberCount,
				centroidDistanceMean: clusterSummaries.centroidDistanceMean,
				summaryEmbedding: clusterSummaries.summaryEmbedding,
				hasSummaryEmbedding: sql<boolean>`(summary_embedding IS NOT NULL)`,
			})
				.from(clusterSummaries)
				.where(eq(clusterSummaries.repoId, repoId))
				.orderBy(clusterSummaries.gpuCluster),
		]);

		if (!Array.isArray(queryEmbedding) || queryEmbedding.length !== 768) {
			return json({
				...EMPTY_RESPONSE(query, repoId),
				error: 'Embedding service returned an unexpected vector shape',
			}, { status: 502 });
		}

		const queryVector = Float32Array.from(queryEmbedding);
		const rowMap = new Map(rows.map((row) => [row.gpuCluster, row]));
		const tagEntries = readLatestQdrantClusterTags();
		const tagMap = new Map<number, ClusterTagsEntry>();
		for (const entry of tagEntries) {
			const id = clusterKeyToId(entry.clusterKey);
			if (id !== null) tagMap.set(id, entry);
		}

		let fallback = true;
		let rankingSource: EncyclopediaResponse['rankingSource'] = 'summary-embedding-cosine';
		let centroidCount = 0;
		let encoded64: number[] = [];
		let ranked: Array<{ clusterId: number; score: number; source: 'autoencoder-centroids' | 'summary-embedding-cosine' }> = rankBySummaryEmbedding(rows, queryVector, qLower, qTerms, tagMap);

		if (probe.ok) {
			try {
				const weights = await getCachedAutoencoderWeights();
				const weights2Layer = { ...weights, hidden: 256, outDim: 64 };
				const encoded = await autoencoderEncode2Layer(queryVector, weights2Layer, {
					n: 1,
					dim: queryVector.length,
				});

				if (encoded.ok && encoded.projected.length >= 64) {
					encoded64 = Array.from(encoded.projected.slice(0, 64));
					const redis = getRedis();
					const [centroidsRaw, meta] = await Promise.all([
						redis.hget('gpu:autoencoder:centroids_64', 'centroids'),
						redis.hgetall('gpu:autoencoder:centroids_64_meta'),
					]);
					const centroids = decodeCentroids(centroidsRaw);
					centroidCount = Number(meta.count ?? '') || (centroids ? Math.floor(centroids.length / 64) : 0);

					if (centroids && centroidCount > 0) {
						ranked = rankByCentroids(
							rows,
							centroids,
							encoded64,
							qLower,
							qTerms,
							tagMap,
							topK,
						);
						fallback = false;
						rankingSource = 'autoencoder-centroids';
					}
				}
			} catch {
				// Keep the summary-embedding fallback path.
			}
		}

		const clusters = ranked.slice(0, topK).map(({ clusterId, score, source }) => {
			const row = rowMap.get(clusterId);
			const tagEntry = tagMap.get(clusterId);
			const summary = row?.summary ?? tagEntry?.summary ?? '';
			const purpose = row?.purpose ?? tagEntry?.purpose ?? null;
			const label = purpose ?? tagEntry?.clusterSrc ?? `cluster:${clusterId}`;
			const topFiles = tagEntry?.topFiles
				?.filter((value): value is string => Boolean(value))
				.slice(0, 6) ?? [];
			return {
				clusterId,
				score,
				label,
				summary,
				purpose,
				tags: row?.tags ?? tagEntry?.topTags.map((tag) => tag.tag) ?? [],
				topoClasses: tagEntry?.topoClasses ?? [],
				topFiles,
				representativeChunkIds: normalizeStringArray(row?.representativeChunkIds),
				memberCount: row?.memberCount ?? tagEntry?.fileCount ?? 0,
				centroidDistanceMean: row?.centroidDistanceMean ?? null,
				hasSummaryEmbedding: row?.hasSummaryEmbedding ?? Boolean(row?.summaryEmbedding),
				rankingSource: source,
			} satisfies EncyclopediaCluster;
		});

		const primary = clusters[0] ?? null;
		const topFiles = Array.from(new Set(clusters.flatMap((cluster) => cluster.topFiles))).slice(0, 20);
		const chunkIds = Array.from(new Set(clusters.flatMap((cluster) => cluster.representativeChunkIds))).slice(0, 20);
		const didYouMean = Array.from(new Set(clusters.map((cluster) => cluster.label).filter(Boolean))).slice(0, 10);

		return json({
			query,
			repoId,
			fallback,
			weightsReady: probe.ok,
			rankingSource,
			centroidCount,
			clusterId: primary?.clusterId ?? null,
			label: primary?.label ?? '',
			summary: primary?.summary ?? '',
			chunkIds: primary?.representativeChunkIds ?? [],
			topFiles: primary?.topFiles ?? topFiles,
			didYouMean,
			encoded64,
			clusterIds: clusters.map((cluster) => cluster.clusterId),
			clusters,
			error: null,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return json({
			...EMPTY_RESPONSE(query, repoId),
			error: message,
		}, { status: 500 });
	}
};

function clusterKeyToId(clusterKey: string): number | null {
	const match = /:gpu:(\d+)$/.exec(clusterKey);
	if (!match) return null;
	const value = Number(match[1]);
	return Number.isFinite(value) ? value : null;
}

function decodeCentroids(raw: string | null): Float32Array | null {
	if (!raw) return null;
	try {
		const buffer = Buffer.from(raw, 'base64');
		return new Float32Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.byteLength / 4));
	} catch {
		return null;
	}
}

function normalizeStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.map((entry) => String(entry)).filter(Boolean);
}

function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
	const len = Math.min(a.length, b.length);
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < len; i++) {
		const av = Number(a[i] ?? 0);
		const bv = Number(b[i] ?? 0);
		dot += av * bv;
		normA += av * av;
		normB += bv * bv;
	}
	if (!normA || !normB) return 0;
	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function rankBySummaryEmbedding(
	rows: Array<{
		gpuCluster: number;
		summaryEmbedding: number[] | null;
		summary: string;
		purpose: string | null;
		tags: string[] | null;
		representativeChunkIds: string[] | null;
		memberCount: number;
		centroidDistanceMean: number | null;
		hasSummaryEmbedding: boolean;
	}>,
	queryVector: Float32Array,
	queryLower: string,
	queryTerms: Set<string>,
	tagMap: Map<number, ClusterTagsEntry>,
): Array<{ clusterId: number; score: number; source: 'summary-embedding-cosine' }> {
	return rows
		.map((row) => {
			const tagEntry = tagMap.get(row.gpuCluster);
			const summaryEmbedding = normalizeVector(row.summaryEmbedding);
			const baseScore = summaryEmbedding ? cosineSimilarity(queryVector, summaryEmbedding) : 0;
			const tagScore = tagEntry ? scoreClusterRelevance(tagEntry, queryLower, queryTerms) : 0;
			return {
				clusterId: row.gpuCluster,
				score: baseScore + (summaryEmbedding ? 0.02 * tagScore : tagScore),
				source: 'summary-embedding-cosine' as const,
			};
		})
		.sort((a, b) => b.score - a.score);
}

function rankByCentroids(
	rows: Array<{
		gpuCluster: number;
		summaryEmbedding: number[] | null;
		summary: string;
		purpose: string | null;
		tags: string[] | null;
		representativeChunkIds: string[] | null;
		memberCount: number;
		centroidDistanceMean: number | null;
		hasSummaryEmbedding: boolean;
	}>,
	centroids: Float32Array,
	encoded64: number[],
	queryLower: string,
	queryTerms: Set<string>,
	tagMap: Map<number, ClusterTagsEntry>,
	topK: number,
): Array<{ clusterId: number; score: number; source: 'autoencoder-centroids' }> {
	const latent = Float32Array.from(encoded64);
	const dim = 64;
	const centroidCount = Math.floor(centroids.length / dim);
	const scores: Array<{ clusterId: number; score: number; source: 'autoencoder-centroids' }> = [];

	for (let i = 0; i < centroidCount; i++) {
		const offset = i * dim;
		const centroid = centroids.subarray(offset, offset + dim);
		const row = rows.find((entry) => entry.gpuCluster === i);
		const tagEntry = tagMap.get(i);
		const tagBoost = tagEntry ? scoreClusterRelevance(tagEntry, queryLower, queryTerms) : 0;
		const centroidScore = cosineSimilarity(latent, centroid);
		const score = centroidScore + 0.02 * tagBoost + (row?.hasSummaryEmbedding ? 0.01 : 0);
		scores.push({ clusterId: i, score, source: 'autoencoder-centroids' });
	}

	return scores.sort((a, b) => b.score - a.score).slice(0, Math.max(topK, 1) * 3);
}

function normalizeVector(value: number[] | null | undefined): number[] | null {
	if (!Array.isArray(value)) return null;
	const vector = value.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry));
	return vector.length > 0 ? vector : null;
}
