import { QdrantManager } from '../vector/qdrant-manager.js';
import { getNeo4jDriver } from '../neo4j-driver.js';
import { couchPut } from './karpathy-wiki.js';
import type { KarpathyHookOutput } from './karpathy-hook.js';
import db from '$lib/server/db/client.js';
import { topologySnapshots, topologyPositions } from '$lib/server/db/schema.js';
import { sql } from 'drizzle-orm';
import { getGdsStatus } from '../graph/neo4j-gds.js';

/**
 * Karpathy Persistence: Commits the organized artifacts from Karpathy Hook
 * to the various durable backends (Qdrant, Neo4j, Postgres, CouchDB).
 */
export async function persistKarpathyHook(output: KarpathyHookOutput) {
	const neo4j = getNeo4jDriver();

	// ── 1. Qdrant: Vector Payloads ────────────────────────────────────────────
	// Embeddings are generated upstream by the caller before this function runs.
	void new QdrantManager(); // ensure client is initialised (noop if already cached)

	// ── 2. Neo4j: Graph Topology (APOC batch → serial fallback) ──────────────
	if (output.neo4jEdges.length > 0) {
		const t0 = Date.now();
		const written = await writeNeo4jEdgesBatched(neo4j, output.neo4jEdges);
		console.log(
			`[persistence] Neo4j ${written} edges in ${Date.now() - t0}ms` +
			` (${output.neo4jEdges.length} total)`
		);
	}

	// ── 3. CouchDB/Redis: Wiki Notes ──────────────────────────────────────────
	for (const note of output.wikiNotes) {
		try {
			await couchPut(note);
		} catch (error) {
			console.error(`[persistence] WikiNote sync failed for ${note.type}:`, error);
		}
	}

	// ── 4. Postgres: Topology Snapshots ──────────────────────────────────────
	if (output.libtorchRows.length > 0) {
		try {
			const [snap] = await db.insert(topologySnapshots).values({
				runId: output.runId,
				repoRoot: '',
				metadata: { filesSeen: output.stats.filesSeen, chunksCreated: output.stats.chunksCreated },
			}).returning({ id: topologySnapshots.id });

			if (snap) {
				// Batch upsert positions (Drizzle does not auto-batch, so chunk manually)
				for (let i = 0; i < output.libtorchRows.length; i += 500) {
					const slice = output.libtorchRows.slice(i, i + 500);
					await db.insert(topologyPositions).values(
						slice.map(row => ({
							snapshotId: snap.id,
							stableKey: row.stableKey,
							x: 0, y: 0, z: 0, t: 0,
							metadata: { filePath: row.filePath, tags: row.tags },
						}))
					).onConflictDoUpdate({
						target: [topologyPositions.snapshotId, topologyPositions.stableKey],
						set: { metadata: sql`excluded.metadata` },
					}).catch(() => {
						// Fallback: individual upserts if batch conflicts
						return Promise.all(slice.map(row =>
							db.insert(topologyPositions).values({
								snapshotId: snap.id,
								stableKey: row.stableKey,
								x: 0, y: 0, z: 0, t: 0,
								metadata: { filePath: row.filePath, tags: row.tags },
							}).onConflictDoUpdate({
								target: [topologyPositions.snapshotId, topologyPositions.stableKey],
								set: { metadata: { filePath: row.filePath, tags: row.tags } },
							}).catch(() => {})
						));
					});
				}
			}
		} catch (error) {
			console.error('[persistence] Postgres topology sync failed:', error);
		}
	}

	console.log(`[persistence] Run ${output.runId} persisted successfully.`);
	return { success: true, stats: output.stats };
}

// ── Neo4j batch write ─────────────────────────────────────────────────────────

const BATCH_SIZE = 500;

interface Neo4jEdge {
	type: string;
	source: string;
	target: string;
	props?: Record<string, unknown>;
}

/**
 * Write edges to Neo4j.
 *
 * Strategy (checked once per call):
 *   APOC available → UNWIND batch via apoc.merge.node + apoc.merge.relationship
 *   APOC offline   → serial MERGE loop (original behaviour)
 *
 * Returns the count of edges successfully written.
 */
async function writeNeo4jEdgesBatched(
	driver: ReturnType<typeof getNeo4jDriver>,
	edges: Neo4jEdge[],
): Promise<number> {
	const { apocAvailable } = await getGdsStatus().catch(() => ({ apocAvailable: false }));

	return apocAvailable
		? writeEdgesApoc(driver, edges)
		: writeEdgesSerial(driver, edges);
}

// APOC path: UNWIND + apoc.merge.node / apoc.merge.relationship
async function writeEdgesApoc(
	driver: ReturnType<typeof getNeo4jDriver>,
	edges: Neo4jEdge[],
): Promise<number> {
	// Group by relationship type so the UNWIND cypher can use a literal rel type.
	// APOC merge.relationship accepts a string type, so we can batch per-type.
	const byType = new Map<string, Neo4jEdge[]>();
	for (const e of edges) {
		const bucket = byType.get(e.type) ?? [];
		bucket.push(e);
		byType.set(e.type, bucket);
	}

	let written = 0;
	for (const [relType, group] of byType) {
		for (let i = 0; i < group.length; i += BATCH_SIZE) {
			const batch = group.slice(i, i + BATCH_SIZE);
			const session = driver.session({ database: 'neo4j' });
			try {
				await session.run(
					`
					UNWIND $rows AS row
					MERGE (s {id: row.source})
					MERGE (t {id: row.target})
					WITH s, t, row
					CALL apoc.merge.relationship(s, $relType, {}, row.props, t) YIELD rel
					RETURN count(rel) AS n
					`,
					{
						rows: batch.map(e => ({ source: e.source, target: e.target, props: e.props ?? {} })),
						relType,
					}
				);
				written += batch.length;
			} catch (err) {
				console.warn(`[persistence] APOC batch failed for ${relType}, falling back to serial:`, (err as Error)?.message);
				written += await writeEdgesSerial(driver, batch);
			} finally {
				await session.close();
			}
		}
	}
	return written;
}

// Serial path: original one-MERGE-per-edge behaviour
async function writeEdgesSerial(
	driver: ReturnType<typeof getNeo4jDriver>,
	edges: Neo4jEdge[],
): Promise<number> {
	const session = driver.session({ database: 'neo4j' });
	let written = 0;
	try {
		for (const edge of edges) {
			try {
				await session.run(
					`MERGE (s {id: $source}) MERGE (t {id: $target}) MERGE (s)-[:${edge.type}]->(t)`,
					{ source: edge.source, target: edge.target }
				);
				written++;
			} catch (err) {
				console.warn(`[persistence] serial MERGE failed (${edge.source}→${edge.target}):`, (err as Error)?.message);
			}
		}
	} finally {
		await session.close();
	}
	return written;
}
