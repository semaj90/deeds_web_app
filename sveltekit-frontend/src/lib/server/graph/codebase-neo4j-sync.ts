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
import { buildCodebaseGraphV2 } from './codebase-scanner-v2.js';
import { buildCodebaseGraph } from './codebase-scanner.js';
import { syncNodesToCouchDb, ensureCouchDbDesignDoc } from './couchdb-pagerank.js';
import { extractAllSemanticRelations, type SemanticEdge } from './relationship-extractor.js';
import type { ScanNodeV2 as WorkerNodeV2 } from './codebase-scanner-v2.js';
import type { ScanNode as WorkerNode, ScanEdge as WorkerEdge } from './codebase-scanner.js';

export interface CodebaseSyncResult {
	files: number;
	edges: number;
	skipped: number;
	errors: string[];
	durationMs: number;
	couchdbWritten?: number;
	couchdbFailed?: number;
}

const BATCH_SIZE = 500;

// ── Batch MERGE nodes ─────────────────────────────────────────────────────────

async function mergeNodes(session: ReturnType<ReturnType<typeof getNeo4jDriver>['session']>, nodes: (WorkerNode | WorkerNodeV2)[]): Promise<number> {
	let synced = 0;

	console.log(`[Neo4j Sync] mergeNodes start: ${nodes.length} nodes, batchSize=${BATCH_SIZE}`);

	// Pass 1: MERGE all nodes as CodebaseFile with full property set
	for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
		const batchT = Date.now();
		const batch = nodes.slice(i, i + BATCH_SIZE).map(n => {
			const isV2 = 'dynamicImportTargets' in n;
			return {
				id: n.id, filePath: n.filePath, label: n.label,
				nodeLabel: n.nodeLabel ?? 'File', type: n.type, cluster: n.cluster,
				lineCount: n.lineCount, fileSize: n.fileSize, complexity: n.complexity,
				classCount: n.classCount, importCount: n.importCount, exportCount: n.exportCount,
				exports: n.exports, functions: n.functions,
				usedTables: n.usedTables ?? [], publishedQueues: n.publishedQueues ?? [],
				consumedQueues: n.consumedQueues ?? [], fetchedRoutes: n.fetchedRoutes ?? [],
				usesNative: n.usesNative ?? false, hasDynamicImports: n.hasDynamicImports ?? false,
				// V2-only properties
				dynamicImportTargets: isV2 ? (n as WorkerNodeV2).dynamicImportTargets : [],
				callees: isV2 ? (n as WorkerNodeV2).callees : [],
				hasErrorHandling: isV2 ? (n as WorkerNodeV2).hasErrorHandling : false,
				hasAuthGuard: isV2 ? (n as WorkerNodeV2).hasAuthGuard : false,
				hasZodValidation: isV2 ? (n as WorkerNodeV2).hasZodValidation : false,
				hasCachePattern: isV2 ? (n as WorkerNodeV2).hasCachePattern : false,
				isSseEndpoint: isV2 ? (n as WorkerNodeV2).isSseEndpoint : false,
				isWorkerBoundary: isV2 ? (n as WorkerNodeV2).isWorkerBoundary : false,
				isRouteFile: isV2 ? (n as WorkerNodeV2).isRouteFile : false,
				routeType: isV2 ? (n as WorkerNodeV2).routeType : 'util',
				symbolCount: isV2 ? (n as WorkerNodeV2).symbolCount : 0,
				maxCallDepth: isV2 ? (n as WorkerNodeV2).maxCallDepth : 0,
				// G21-G25: Svelte 5 rune compliance
				isSvelteComponent: isV2 ? (n as WorkerNodeV2).isSvelteComponent : false,
				hasSvelte4Props:    isV2 ? (n as WorkerNodeV2).hasSvelte4Props : false,
				hasSvelte4Reactive: isV2 ? (n as WorkerNodeV2).hasSvelte4Reactive : false,
				hasSvelte4Events:   isV2 ? (n as WorkerNodeV2).hasSvelte4Events : false,
				hasRunesInPlainTs:  isV2 ? (n as WorkerNodeV2).hasRunesInPlainTs : false,
			};
		});

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
			     f.dynamicImportTargets = node.dynamicImportTargets,
			     f.callees          = node.callees,
			     f.hasErrorHandling = node.hasErrorHandling,
			     f.hasAuthGuard     = node.hasAuthGuard,
			     f.hasZodValidation = node.hasZodValidation,
			     f.hasCachePattern  = node.hasCachePattern,
			     f.isSseEndpoint    = node.isSseEndpoint,
			     f.isWorkerBoundary = node.isWorkerBoundary,
			     f.isRouteFile      = node.isRouteFile,
			     f.routeType        = node.routeType,
			     f.symbolCount        = node.symbolCount,
			     f.maxCallDepth      = node.maxCallDepth,
			     f.isSvelteComponent = node.isSvelteComponent,
			     f.hasSvelte4Props   = node.hasSvelte4Props,
			     f.hasSvelte4Reactive = node.hasSvelte4Reactive,
			     f.hasSvelte4Events  = node.hasSvelte4Events,
			     f.hasRunesInPlainTs = node.hasRunesInPlainTs,
			     f.updatedAt         = datetime()`,
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

async function mergeEdges(session: ReturnType<ReturnType<typeof getNeo4jDriver>['session']>, edges: WorkerEdge[], nodes: (WorkerNode | WorkerNodeV2)[]): Promise<number> {
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

		// 2. Extract graph — try ts-morph v2 (20 metrics), fall back to regex v1
		emit('worker-scan');
		let nodes: (WorkerNode | WorkerNodeV2)[];
		let edges: WorkerEdge[];
		try {
			const scanResultV2 = buildCodebaseGraphV2({ scanDir, srcRoot, maxFiles });
			console.log(`[Neo4j Sync] Scan done (ts-morph v2, method=${scanResultV2.metadata.scanMethod}): ${scanResultV2.nodes.length} nodes, ${scanResultV2.edges.length} edges`);
			nodes = scanResultV2.nodes;
			edges = scanResultV2.edges;
		} catch (v2Err) {
			console.warn('[Neo4j Sync] ts-morph v2 scan failed, falling back to regex v1:', (v2Err as Error)?.message);
			const scanResultV1 = buildCodebaseGraph({ scanDir, srcRoot, maxFiles });
			console.log(`[Neo4j Sync] Scan done (regex v1 fallback): ${scanResultV1.nodes.length} nodes, ${scanResultV1.edges.length} edges`);
			nodes = scanResultV1.nodes;
			edges = scanResultV1.edges;
		}
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

		// 4. CouchDB mirror — write link graph for MapReduce PageRank (Step 21)
		//    Fire-and-forget: non-fatal, doesn't block Neo4j path
		emit('couchdb-mirror');
		try {
			await ensureCouchDbDesignDoc();
			const couchNodes = nodes.map((n) => {
				const isV2    = 'dynamicImportTargets' in n;
				const fp      = n.filePath ?? n.id ?? '';
				const norm    = fp.replace(/\\/g, '/');
				const srcIdx  = norm.indexOf('sveltekit-frontend/src/');
				const relPath = srcIdx >= 0
					? norm.slice(srcIdx + 'sveltekit-frontend/src/'.length)
					: norm.includes('src/')
						? norm.slice(norm.indexOf('src/') + 'src/'.length)
						: norm;

				return {
					id:          relPath || n.id,
					filePath:    fp,
					imports:     edges
						.filter((e) => e.source === n.id && e.type === 'IMPORTS')
						.map((e) => {
							const tfp  = (nodes.find((nn) => nn.id === e.target)?.filePath ?? e.target).replace(/\\/g, '/');
							const tidx = tfp.indexOf('sveltekit-frontend/src/');
							return tidx >= 0
								? tfp.slice(tidx + 'sveltekit-frontend/src/'.length)
								: tfp.includes('src/')
									? tfp.slice(tfp.indexOf('src/') + 'src/'.length)
									: tfp;
						}),
					lineCount:   n.lineCount,
					complexity:  n.complexity,
					routeType:   isV2 ? (n as WorkerNodeV2).routeType : null,
					hasAuthGuard: isV2 ? (n as WorkerNodeV2).hasAuthGuard : false,
					isRouteFile: isV2 ? (n as WorkerNodeV2).isRouteFile : false,
				};
			});

			const couchResult = await syncNodesToCouchDb(couchNodes);
			result.couchdbWritten = couchResult.written;
			result.couchdbFailed  = couchResult.failed;
			console.log(`[Neo4j Sync] CouchDB mirror: ${couchResult.written} written, ${couchResult.failed} failed`);
		} catch (couchErr) {
			console.warn('[Neo4j Sync] CouchDB mirror failed (non-fatal):', (couchErr as Error)?.message);
		}

		// 5. Semantic relation extraction — P5 edge types (fire-and-forget, non-fatal)
		emit('semantic-relations');
		try {
			await syncSemanticRelations({ srcRoot, session: getNeo4jDriver().session({ database: 'neo4j' }) });
		} catch (semErr) {
			console.warn('[Neo4j Sync] Semantic relation sync failed (non-fatal):', (semErr as Error)?.message);
		}
	} catch (err) {
		result.errors.push(err instanceof Error ? err.message : String(err));
	}

	result.durationMs = Date.now() - start;
	return result;
}

// ── Standalone semantic relation syncer ──────────────────────────────────────

export interface SemanticSyncResult {
	totalFiles: number;
	totalEdges: number;
	neo4jSynced: number;
	durationMs: number;
	errors: string[];
}

const SEMANTIC_NEO4J_TYPES = new Set([
	'READS_REDIS_KEY', 'WRITES_REDIS_KEY',
	'QUERIES_TABLE', 'QUERIES_QDRANT_COLLECTION', 'QUERIES_NEO4J_LABEL',
]);

/**
 * Extract semantic edges and mirror the high-value subset to Neo4j.
 * Designed to be called standalone or from syncCodebaseToNeo4j.
 */
export async function syncSemanticRelations(opts: {
	srcRoot?: string;
	maxFiles?: number;
	session?: ReturnType<ReturnType<typeof getNeo4jDriver>['session']>;
}): Promise<SemanticSyncResult> {
	const t0 = Date.now();
	const srcRoot = opts.srcRoot ?? path.join(process.cwd(), 'src');
	const result = extractAllSemanticRelations(srcRoot, opts.maxFiles ?? 3000);

	const neo4jEdges = result.edges.filter(e => SEMANTIC_NEO4J_TYPES.has(e.relationType));

	let neo4jSynced = 0;
	const ownSession = !opts.session;
	const session = opts.session ?? getNeo4jDriver().session({ database: 'neo4j' });

	try {
		const BATCH = 200;
		for (let i = 0; i < neo4jEdges.length; i += BATCH) {
			const batch = neo4jEdges.slice(i, i + BATCH);
			await session.run(
				`UNWIND $batch AS e
				 MERGE (src:CodebaseFile {filePath: e.source})
				 MERGE (tgt:SemanticTarget {key: e.target, kind: e.kind})
				 MERGE (src)-[r:SEMANTIC_REL {type: e.type}]->(tgt)
				 SET r.confidence = e.conf, r.updatedAt = datetime()`,
				{
					batch: batch.map((e) => ({
						source: e.sourceFile,
						target: e.targetKey,
						kind:   e.relationType.replace('QUERIES_', '').replace('READS_', '').replace('WRITES_', '').toLowerCase(),
						type:   e.relationType,
						conf:   e.confidence,
					})),
				}
			);
			neo4jSynced += batch.length;
		}
		console.log(`[Neo4j Sync] Semantic relations: ${result.totalEdges} extracted, ${neo4jSynced} synced to Neo4j in ${Date.now() - t0}ms`);
	} finally {
		if (ownSession) await session.close();
	}

	return {
		totalFiles: result.totalFiles,
		totalEdges: result.totalEdges,
		neo4jSynced,
		durationMs: Date.now() - t0,
		errors: result.errors,
	};
}
