/**
 * Ingestion Buffer Builder — generates pre-compiled JSONB codebase context
 * for AI agent consumption (Claude Code, Copilot, etc.).
 *
 * Triggered post graph-sync after cluster narrative synthesis.
 * Stores in PostgreSQL ingestion_buffers + Redis read-through cache.
 */
import { db } from '$lib/server/db/client';
import { ingestionBuffers } from '$lib/server/db/schema-postgres.js';
import { sql, eq, and } from 'drizzle-orm';
import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';
import type {
	IngestionBuffer,
	IngestionBufferFile,
	IngestionBufferEdge,
} from '$lib/server/types/ingestion-buffer.js';
import type { ClusterNarrative, ClusterMember } from '$lib/server/graph/codebase-cluster-detection.js';

/**
 * Build an IngestionBuffer JSONB document for a single cluster.
 */
export function buildClusterBuffer(
	clusterId: number,
	k: number,
	narrative: ClusterNarrative,
	members: ClusterMember[],
): IngestionBuffer {
	const files: IngestionBufferFile[] = members.map((m, i) => ({
		path: m.filePath,
		summary: '', // populated by caller if LLM summaries available
		pageRank: 1.0 / (i + 1), // approximate rank by position
		cluster: clusterId,
		somCluster: null,
		importCount: 0,
		importedBy: 0,
		tags: m.astCluster ? [m.astCluster] : [],
	}));

	// Rough token estimate: ~4 chars per token for code
	const rawChars = files.reduce((sum, f) => sum + f.path.length * 50, 0); // estimate ~50 chars per file ref
	const narrativeChars = narrative.purpose.length + narrative.patterns.join(' ').length;
	const totalChars = rawChars + narrativeChars;
	const tokenEstimate = Math.ceil(totalChars / 4);

	return {
		version: 2,
		generatedAt: new Date().toISOString(),
		scope: 'cluster',
		clusterId,
		k,
		narrative: narrative.purpose,
		files,
		edges: [],
		tokenEstimate,
		compressionRatio: members.length > 0 ? Math.max(0.1, 1 - tokenEstimate / (members.length * 500)) : 1,
	};
}

/**
 * Build and persist ingestion buffers for all clusters after narrative synthesis.
 * Non-fatal — errors are collected, not thrown.
 */
export async function buildAndStoreBuffers(
	k: number,
	narratives: Map<number, ClusterNarrative>,
	clusterMembers: Map<number, ClusterMember[]>,
): Promise<{ stored: number; errors: string[] }> {
	const errors: string[] = [];
	let stored = 0;

	for (const [clusterId, narrative] of narratives) {
		try {
			const members = clusterMembers.get(clusterId) ?? [];
			const buffer = buildClusterBuffer(clusterId, k, narrative, members);

			await db.insert(ingestionBuffers).values({
				scope: 'cluster',
				clusterId,
				k,
				bufferJsonb: buffer as unknown as Record<string, unknown>,
				tokenEstimate: buffer.tokenEstimate,
				compressionRatio: buffer.compressionRatio,
			}).onConflictDoUpdate({
				target: [ingestionBuffers.scope, ingestionBuffers.clusterId, ingestionBuffers.k],
				set: {
					bufferJsonb: buffer as unknown as Record<string, unknown>,
					tokenEstimate: buffer.tokenEstimate,
					compressionRatio: buffer.compressionRatio,
					generatedAt: new Date(),
					updatedAt: new Date(),
				},
			});

			stored++;
		} catch (err) {
			errors.push(`Cluster ${clusterId}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	return { stored, errors };
}

/**
 * Retrieve a stored ingestion buffer by scope and cluster ID.
 */
export async function getIngestionBuffer(
	scope: string,
	clusterId: number | null,
	k = 20,
): Promise<IngestionBuffer | null> {
	try {
		const conditions = [eq(ingestionBuffers.scope, scope), eq(ingestionBuffers.k, k)];
		if (clusterId !== null) {
			conditions.push(eq(ingestionBuffers.clusterId, clusterId));
		}
		const [row] = await db
			.select()
			.from(ingestionBuffers)
			.where(and(...conditions))
			.limit(1);
		return (row?.bufferJsonb as unknown as IngestionBuffer) ?? null;
	} catch {
		return null;
	}
}

/**
 * Retrieve all ingestion buffers for a given k value.
 */
export async function getAllIngestionBuffers(k = 20): Promise<IngestionBuffer[]> {
	try {
		const rows = await db
			.select()
			.from(ingestionBuffers)
			.where(and(eq(ingestionBuffers.scope, 'cluster'), eq(ingestionBuffers.k, k)));
		return rows.map(r => r.bufferJsonb as unknown as IngestionBuffer);
	} catch {
		return [];
	}
}
