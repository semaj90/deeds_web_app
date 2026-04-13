/**
 * GET /api/codebase-index/file-intel?path=src/lib/server/rag-pipeline.ts
 *
 * Unified file intelligence — aggregates from 3 stores:
 *   1. Neo4j  — CodebaseFile node (AST metadata + gpuCluster) + IMPORTS graph
 *   2. CouchDB graph_recommendations — missing-import recommendations
 *   3. CouchDB graph_clusters — GPU cluster summary for this file's cluster
 *
 * Returns a single JSON object with all intelligence for a file.
 * Degrades gracefully if any store is unavailable.
 *
 * Auth: requires locals.user
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';
import { couchdb } from '$lib/services/couchdb-client.js';

const pathSchema = z.string().min(1).max(600);

const COUCH_RECO_DB = 'graph_recommendations';
const COUCH_CLUSTER_DB = 'graph_clusters';

// ── Neo4j queries ─────────────────────────────────────────────────────────────

interface Neo4jNodeRecord {
	id: string;
	filePath: string;
	label: string;
	type: string;
	cluster: string;
	gpuCluster: number | null;
	lineCount: number;
	complexity: number;
	importCount: number;
	exportCount: number;
	classCount: number;
}

interface Neo4jEdgeRecord {
	id: string;
	filePath: string;
	label: string;
	type: string;
}

async function fetchNodeAndEdges(fileId: string): Promise<{
	node: Neo4jNodeRecord | null;
	imports: Neo4jEdgeRecord[];
	importedBy: Neo4jEdgeRecord[];
}> {
	const driver = getNeo4jDriver();
	const session = driver.session({ database: 'neo4j' });
	try {
		const [nodeRes, outRes, inRes] = await Promise.all([
			session.run(
				`MATCH (f:CodebaseFile {id: $id})
				 RETURN f.id AS id, f.filePath AS filePath, f.label AS label, f.type AS type,
				        f.cluster AS cluster, f.gpuCluster AS gpuCluster,
				        f.lineCount AS lineCount, f.complexity AS complexity,
				        f.importCount AS importCount, f.exportCount AS exportCount,
				        f.classCount AS classCount`,
				{ id: fileId }
			),
			session.run(
				`MATCH (a:CodebaseFile {id: $id})-[:IMPORTS]->(b:CodebaseFile)
				 RETURN b.id AS id, b.filePath AS filePath, b.label AS label, b.type AS type
				 LIMIT 50`,
				{ id: fileId }
			),
			session.run(
				`MATCH (a:CodebaseFile)-[:IMPORTS]->(b:CodebaseFile {id: $id})
				 RETURN a.id AS id, a.filePath AS filePath, a.label AS label, a.type AS type
				 LIMIT 50`,
				{ id: fileId }
			),
		]);

		const node = nodeRes.records[0]
			? {
					id: nodeRes.records[0].get('id') as string,
					filePath: nodeRes.records[0].get('filePath') as string,
					label: nodeRes.records[0].get('label') as string,
					type: nodeRes.records[0].get('type') as string,
					cluster: nodeRes.records[0].get('cluster') as string,
					gpuCluster: nodeRes.records[0].get('gpuCluster') as number | null,
					lineCount: nodeRes.records[0].get('lineCount') as number,
					complexity: nodeRes.records[0].get('complexity') as number,
					importCount: nodeRes.records[0].get('importCount') as number,
					exportCount: nodeRes.records[0].get('exportCount') as number,
					classCount: nodeRes.records[0].get('classCount') as number,
				}
			: null;

		const mapEdge = (rec: { get(key: string): unknown }): Neo4jEdgeRecord => ({
			id: rec.get('id') as string,
			filePath: rec.get('filePath') as string,
			label: rec.get('label') as string,
			type: rec.get('type') as string,
		});

		return {
			node,
			imports: outRes.records.map(mapEdge),
			importedBy: inRes.records.map(mapEdge),
		};
	} finally {
		await session.close();
	}
}

// ── CouchDB helpers ───────────────────────────────────────────────────────────

async function fetchRecoDoc(fileId: string): Promise<Record<string, unknown> | null> {
	const docId = `graph-reco:file:${fileId}`;
	return couchdb.get(COUCH_RECO_DB, docId).catch(() => null);
}

async function fetchClusterDoc(gpuCluster: number | null | undefined, _k?: number): Promise<Record<string, unknown> | null> {
	if (gpuCluster === null || gpuCluster === undefined) return null;
	// We don't always know k at read time — try k=10,20,auto by listing all docs that match cluster id
	try {
		const all = await couchdb.allDocs(COUCH_CLUSTER_DB, { include_docs: true, limit: 60 });
		const pattern = `:${gpuCluster}`;
		const match = all.rows.find(r => r.id.endsWith(pattern));
		return (match?.doc as Record<string, unknown>) ?? null;
	} catch {
		return null;
	}
}

// ── File ID normalisation ─────────────────────────────────────────────────────

function toFileId(path: string): string {
	const normalised = path.startsWith('src/') ? path : `src/${path}`;
	return normalised.replace(/[^a-zA-Z0-9/_.-]/g, '_');
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const rawPath = url.searchParams.get('path') ?? '';
	const pathParsed = pathSchema.safeParse(rawPath);
	if (!pathParsed.success) {
		return json({ error: 'Invalid path parameter' }, { status: 400 });
	}

	const fileId = toFileId(pathParsed.data);

	const [graphData, recoDoc] = await Promise.all([
		fetchNodeAndEdges(fileId).catch(() => ({
			node: null,
			imports: [] as Neo4jEdgeRecord[],
			importedBy: [] as Neo4jEdgeRecord[],
		})),
		fetchRecoDoc(fileId),
	]);

	const clusterDoc = graphData.node?.gpuCluster != null
		? await fetchClusterDoc(graphData.node.gpuCluster)
		: null;

	return json({
		fileId,
		filePath: pathParsed.data,
		node: graphData.node,
		graph: {
			imports: graphData.imports,
			importedBy: graphData.importedBy,
			importCount: graphData.imports.length,
			importedByCount: graphData.importedBy.length,
		},
		recommendations: recoDoc ?? null,
		gpuCluster: clusterDoc ?? null,
	});
};
