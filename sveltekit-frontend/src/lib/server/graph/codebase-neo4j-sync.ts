/**
 * Codebase → Neo4j Sync
 *
 * Calls codebase-scanner.ts directly (no Worker thread — scan is ~800ms for 2000 files).
 * Batch-MERGEs the result into Neo4j as CodebaseFile nodes + IMPORTS edges.
 *
 * Usage:
 *   const result = await syncCodebaseToNeo4j();
 *   // result: { files, edges, skipped, errors[], durationMs }
 */
import path from 'path';
import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';
import { initializeNeo4jSchema } from './neo4j-schema.js';
import { buildCodebaseGraph } from './codebase-scanner.js';
import type { ScanNode as WorkerNode, ScanEdge as WorkerEdge } from './codebase-scanner.js';

export interface CodebaseSyncResult {
	files: number;
	edges: number;
	skipped: number;
	errors: string[];
	durationMs: number;
}

const BATCH_SIZE = 500;

// ── Batch MERGE nodes ─────────────────────────────────────────────────────────

async function mergeNodes(session: ReturnType<ReturnType<typeof getNeo4jDriver>['session']>, nodes: WorkerNode[]): Promise<number> {
	let synced = 0;

	console.log(`[Neo4j Sync] mergeNodes start: ${nodes.length} nodes, batchSize=${BATCH_SIZE}`);

	// Pass 1: MERGE all nodes as CodebaseFile with full property set
	for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
		const batchT = Date.now();
		const batch = nodes.slice(i, i + BATCH_SIZE).map(n => ({
			id: n.id, filePath: n.filePath, label: n.label,
			nodeLabel: n.nodeLabel ?? 'File', type: n.type, cluster: n.cluster,
			lineCount: n.lineCount, fileSize: n.fileSize, complexity: n.complexity,
			classCount: n.classCount, importCount: n.importCount, exportCount: n.exportCount,
			exports: n.exports, functions: n.functions,
			usedTables: n.usedTables ?? [], publishedQueues: n.publishedQueues ?? [],
			consumedQueues: n.consumedQueues ?? [], fetchedRoutes: n.fetchedRoutes ?? [],
			usesNative: n.usesNative ?? false, hasDynamicImports: n.hasDynamicImports ?? false,
		}));

		await session.run(
			`UNWIND $batch AS node
			 MERGE (f:CodebaseFile {id: node.id})
			 SET f.filePath         = node.filePath,
			     f.label            = node.label,
			     f.nodeLabel        = node.nodeLabel,
			     f.type             = node.type,
			     f.cluster          = node.cluster,
			     f.lineCount        = node.lineCount,
			     f.fileSize         = node.fileSize,
			     f.complexity       = node.complexity,
			     f.classCount       = node.classCount,
			     f.importCount      = node.importCount,
			     f.exportCount      = node.exportCount,
			     f.exports          = node.exports,
			     f.functions        = node.functions,
			     f.usedTables       = node.usedTables,
			     f.publishedQueues  = node.publishedQueues,
			     f.consumedQueues   = node.consumedQueues,
			     f.fetchedRoutes    = node.fetchedRoutes,
			     f.usesNative       = node.usesNative,
			     f.hasDynamicImports = node.hasDynamicImports,
			     f.updatedAt        = datetime()`,
			{ batch }
		);
		const batchMs = Date.now() - batchT;
		if (batchMs > 500) console.warn(`[Neo4j Sync] Slow node batch i=${i} batchSize=${BATCH_SIZE}: ${batchMs}ms`);
		synced += batch.length;
	}

	console.log(`[Neo4j Sync] Pass 1 done (${synced} nodes). Starting label pass...`);

	// Pass 2: Add secondary labels per nodeLabel type (Route, Component, Store, ServerModule)
	const labelGroups = new Map<string, string[]>();
	for (const n of nodes) {
		if (n.nodeLabel && n.nodeLabel !== 'File') {
			if (!labelGroups.has(n.nodeLabel)) labelGroups.set(n.nodeLabel, []);
			labelGroups.get(n.nodeLabel)!.push(n.id);
		}
	}
	for (const [label, ids] of labelGroups) {
		for (let i = 0; i < ids.length; i += BATCH_SIZE) {
			const batchIds = ids.slice(i, i + BATCH_SIZE);
			// Dynamic label setting: run separate query per label type
			switch (label) {
				case 'Route':
					await session.run('UNWIND $ids AS id MATCH (f:CodebaseFile {id: id}) SET f:Route', { ids: batchIds }); break;
				case 'Component':
					await session.run('UNWIND $ids AS id MATCH (f:CodebaseFile {id: id}) SET f:Component', { ids: batchIds }); break;
				case 'Store':
					await session.run('UNWIND $ids AS id MATCH (f:CodebaseFile {id: id}) SET f:Store', { ids: batchIds }); break;
				case 'ServerModule':
					await session.run('UNWIND $ids AS id MATCH (f:CodebaseFile {id: id}) SET f:ServerModule', { ids: batchIds }); break;
			}
		}
	}

	return synced;
}

// ── Batch MERGE edges ─────────────────────────────────────────────────────────

async function mergeEdges(session: ReturnType<ReturnType<typeof getNeo4jDriver>['session']>, edges: WorkerEdge[], nodes: WorkerNode[]): Promise<number> {
	let synced = 0;
	console.log(`[Neo4j Sync] mergeEdges start: ${edges.length} edges, batchSize=${BATCH_SIZE}`);

	// Group edges by type
	const byType = new Map<string, { source: string; target: string }[]>();
	for (const e of edges) {
		if (!byType.has(e.type)) byType.set(e.type, []);
		byType.get(e.type)!.push({ source: e.source, target: e.target });
	}

	// IMPORTS
	const imports = byType.get('IMPORTS') ?? [];
	for (let i = 0; i < imports.length; i += BATCH_SIZE) {
		await session.run(
			`UNWIND $batch AS edge
			 MATCH (a:CodebaseFile {id: edge.source})
			 MATCH (b:CodebaseFile {id: edge.target})
			 MERGE (a)-[:IMPORTS]->(b)`,
			{ batch: imports.slice(i, i + BATCH_SIZE) }
		);
		synced += Math.min(BATCH_SIZE, imports.length - i);
	}

	// DYNAMIC_IMPORTS
	const dynImports = byType.get('DYNAMIC_IMPORTS') ?? [];
	for (let i = 0; i < dynImports.length; i += BATCH_SIZE) {
		await session.run(
			`UNWIND $batch AS edge
			 MATCH (a:CodebaseFile {id: edge.source})
			 MATCH (b:CodebaseFile {id: edge.target})
			 MERGE (a)-[:DYNAMIC_IMPORTS]->(b)`,
			{ batch: dynImports.slice(i, i + BATCH_SIZE) }
		);
		synced += Math.min(BATCH_SIZE, dynImports.length - i);
	}

	// USES_COMPONENT: derive from IMPORTS where target is a Component
	const componentIds = new Set(nodes.filter(n => n.nodeLabel === 'Component').map(n => n.id));
	const usesComponent = imports.filter(e => componentIds.has(e.target));
	for (let i = 0; i < usesComponent.length; i += BATCH_SIZE) {
		await session.run(
			`UNWIND $batch AS edge
			 MATCH (a:CodebaseFile {id: edge.source})
			 MATCH (b:Component {id: edge.target})
			 MERGE (a)-[:USES_COMPONENT]->(b)`,
			{ batch: usesComponent.slice(i, i + BATCH_SIZE) }
		);
		synced += Math.min(BATCH_SIZE, usesComponent.length - i);
	}

	// USES_STORE: derive from IMPORTS where target is a Store
	const storeIds = new Set(nodes.filter(n => n.nodeLabel === 'Store').map(n => n.id));
	const usesStore = imports.filter(e => storeIds.has(e.target));
	for (let i = 0; i < usesStore.length; i += BATCH_SIZE) {
		await session.run(
			`UNWIND $batch AS edge
			 MATCH (a:CodebaseFile {id: edge.source})
			 MATCH (b:Store {id: edge.target})
			 MERGE (a)-[:USES_STORE]->(b)`,
			{ batch: usesStore.slice(i, i + BATCH_SIZE) }
		);
		synced += Math.min(BATCH_SIZE, usesStore.length - i);
	}

	return synced;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SyncOptions {
	maxFiles?: number;
	/** Absolute path to scan. Defaults to <cwd>/src */
	scanDir?: string;
	/** Optional progress callback for live heartbeating */
	onPhase?: (phase: string, extra?: { files?: number; edges?: number }) => void;
}

export async function syncCodebaseToNeo4j(options: SyncOptions = {}): Promise<CodebaseSyncResult> {
	const start = Date.now();
	const result: CodebaseSyncResult = { files: 0, edges: 0, skipped: 0, errors: [], durationMs: 0 };

	const srcRoot = path.join(process.cwd(), 'src');
	const scanDir = options.scanDir ?? srcRoot;
	const maxFiles = options.maxFiles ?? 2000;
	const emit = options.onPhase ?? (() => {});

	try {
		// 1. Ensure schema constraints exist
		emit('schema-init');
		await initializeNeo4jSchema();

		// 2. Extract graph directly (inline — no Worker thread needed, ~800ms for 2000 files)
		emit('worker-scan');
		const { nodes, edges } = buildCodebaseGraph({ scanDir, srcRoot, maxFiles });
		console.log(`[Neo4j Sync] Scan done: ${nodes.length} nodes, ${edges.length} edges`);
		emit('worker-done', { files: nodes.length, edges: edges.length });

		if (!nodes.length) {
			result.errors.push('Worker returned 0 nodes — check scanDir');
			result.durationMs = Date.now() - start;
			return result;
		}

		// 3. Write to Neo4j (constraint exists — created during schema init)
		const driver = getNeo4jDriver();
		const session = driver.session({ database: 'neo4j' });

		try {
			emit('merge-nodes', { files: 0 });
			const t0 = Date.now();
			result.files = await mergeNodes(session, nodes);
			console.log(`[Neo4j Sync] mergeNodes done: ${result.files} nodes in ${Date.now() - t0}ms`);
			emit('merge-nodes-done', { files: result.files });

			emit('merge-edges', { edges: 0 });
			const t1 = Date.now();
			result.edges = await mergeEdges(session, edges, nodes);
			console.log(`[Neo4j Sync] mergeEdges done: ${result.edges} edges in ${Date.now() - t1}ms`);
			emit('merge-edges-done', { edges: result.edges });

			result.skipped = nodes.length - result.files;
		} catch (err) {
			result.errors.push(`Neo4j write failed: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			await session.close();
		}
	} catch (err) {
		result.errors.push(err instanceof Error ? err.message : String(err));
	}

	result.durationMs = Date.now() - start;
	return result;
}
