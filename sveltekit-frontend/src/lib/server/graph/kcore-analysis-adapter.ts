/**
 * kcore-analysis-adapter.ts — Graph Analysis Run/Promotion Contract, Patch G.
 *
 * k-core decomposition (`gds.kcore.mutate`, confirmed live 2026-08-09 via
 * `SHOW PROCEDURES`). **Real algorithmic constraint found live**: GDS
 * rejects `codeTopology` (mixed NATURAL/UNDIRECTED orientations) with
 * "K-Core-Decomposition requires relationship projections to be
 * UNDIRECTED" — same class of constraint as Leiden (Patch E). Reuses
 * `atlas_feature_v1` (`BELONGS_TO_FEATURE` + `SIMILAR_TOPOLOGY`, both
 * already `UNDIRECTED` per `neo4j-gds-client.ts`'s `isUndirected` check —
 * proven all-undirected live when Leiden ran on it in Patch E) rather than
 * building a new dedicated projection.
 *
 * Per README.md point 7: k-core is topology, not authority — "does k-core
 * improve Domain 10 retrieval ranking?" is a separate question (GA8/GA9)
 * from "did GDS compute k-core successfully?" (this patch, GA6). Writes
 * metric_name='kcore' rows; not promoted, not wired into any ranking path
 * here.
 *
 * Reuses the exact same identity-join and transactional-write discipline as
 * pagerank-analysis-adapter.ts and cheirank-analysis-adapter.ts — see those
 * files' docstrings for the bugs already found and fixed there, inherited
 * here by construction.
 */

import type { Pool } from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import neo4j from 'neo4j-driver';
import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';
import { ensureProjectionClient } from './neo4j-gds-client.js';
import {
	GraphAnalysisRunSchema,
	GraphMetricResultSchema,
	type GraphAnalysisRun,
	type GraphMetricResult,
} from './graph-analysis-types.js';
import { classifyGraphPacketPath, resolveCodebaseFilePacketKeys, lookupPacketKey } from './graph-packet-key-resolver.js';
import { graphAlgorithmRevision } from './graph-algorithm-revision.js';
import { NAMED_PROJECTION_CANDIDATES } from './graph-projection-manifest.js';

const ALGORITHM_REVISION = graphAlgorithmRevision('kcore');
const DEFAULT_WORKSPACE_REVISION = 'workspace:parent-atlas';
const MUTATE_PROPERTY = 'kcoreValue';
// k-core requires an all-UNDIRECTED projection (confirmed live 2026-08-09 —
// gds.kcore.mutate rejects codeTopology's mixed orientations). Reuse
// atlas_feature_v1, already proven all-undirected when Leiden ran on it in
// Patch E, rather than building a new dedicated projection.
const KCORE_PROJECTION_NAME = 'atlas_feature_v1';
const KCORE_RELATIONSHIP_TYPES = NAMED_PROJECTION_CANDIDATES.atlas_feature_v1;

export interface KCoreAnalysisOptions {
	limit?: number;
}

export interface KCoreAnalysisResult {
	run: GraphAnalysisRun;
	metricsWritten: number;
	unresolvedPacketKeys: number;
	excludedPacketKeys: number;
}

export async function runKCoreAnalysis(
	db: Pool,
	options: KCoreAnalysisOptions = {},
): Promise<KCoreAnalysisResult> {
	const { limit = 200_000 } = options;

	const projection = await ensureProjectionClient(KCORE_PROJECTION_NAME, false, KCORE_RELATIONSHIP_TYPES);
	const startedAt = new Date().toISOString();
	const inputHash = createHash('sha256')
		.update(JSON.stringify({ algorithm: 'kcore', projectionName: KCORE_PROJECTION_NAME, limit }))
		.digest('hex');

	const neo4jSession = getNeo4jDriver().session();
	let topNodes: Array<{ path: string | undefined; kcoreValue: number }>;
	try {
		// Self-heal, matching runPageRankClient/runCommunityAnalysis's proven pattern.
		await neo4jSession
			.run(`CALL gds.graph.nodeProperties.drop($name, [$prop]) YIELD propertiesRemoved RETURN propertiesRemoved`, {
				name: KCORE_PROJECTION_NAME,
				prop: MUTATE_PROPERTY,
			})
			.catch(() => { /* property didn't exist yet — fine */ });

		await neo4jSession.run(`CALL gds.kcore.mutate($name, { mutateProperty: $prop })`, {
			name: KCORE_PROJECTION_NAME,
			prop: MUTATE_PROPERTY,
		});
		await neo4jSession.run(
			`CALL gds.graph.nodeProperties.write($name, [$prop]) YIELD propertiesWritten RETURN propertiesWritten`,
			{ name: KCORE_PROJECTION_NAME, prop: MUTATE_PROPERTY },
		);

		// Same CodebaseFile filter discipline as PageRank/Louvain/Leiden/CheiRank —
		// avoids non-file nodes sharing a containing file's path colliding on
		// graph_node_metrics' (runId, packetKey, metricName) primary key.
		const result = await neo4jSession.run(
			`
			MATCH (n:CodebaseFile)
			WHERE n[$prop] IS NOT NULL AND n.path IS NOT NULL
			RETURN n.path AS path, n[$prop] AS kcoreValue
			ORDER BY n[$prop] DESC
			LIMIT $limit
			`,
			{ prop: MUTATE_PROPERTY, limit: neo4j.int(Math.trunc(limit)) },
		);
		topNodes = result.records.map((r) => ({
			path: r.get('path') as string | undefined,
			kcoreValue: Number(r.get('kcoreValue')),
		}));
	} finally {
		await neo4jSession.close().catch(() => {});
	}

	const completedAt = new Date().toISOString();
	const runId = randomUUID();
	const graphRevision = createHash('sha256')
		.update(`${KCORE_PROJECTION_NAME}:${projection.nodeCount}:${projection.relationshipCount}`)
		.digest('hex');
	const outputHash = createHash('sha256')
		.update(JSON.stringify(topNodes.map((n) => ({ path: n.path ?? null, kcoreValue: n.kcoreValue }))))
		.digest('hex');

	const run: GraphAnalysisRun = GraphAnalysisRunSchema.parse({
		runId,
		algorithm: 'kcore',
		algorithmRevision: ALGORITHM_REVISION,
		parameterRevision: 'kcore-mutate-v1',
		workspaceRevision: DEFAULT_WORKSPACE_REVISION,
		sourceRevision: graphRevision,
		backendPreference: 'native-ts',
		backendActual: 'native-ts',
		gpuAccelerated: false,
		sidecarUrl: null,
		inputHash,
		outputHash,
		graphRevision,
		projectionRevision: graphRevision,
		projectionName: KCORE_PROJECTION_NAME,
		nodeCount: projection.nodeCount,
		relationshipCount: projection.relationshipCount,
		startedAt,
		completedAt,
		status: 'succeeded',
		parameters: { mutateProperty: MUTATE_PROPERTY },
		metrics: { topNodesReturned: topNodes.length },
	});

	const paths = topNodes.map((n) => n.path).filter((p): p is string => !!p);
	const resolved = await resolveCodebaseFilePacketKeys(db, paths);

	const createdAt = new Date().toISOString();
	const byPacketKey = new Map<string, { score: number }>();
	let unresolved = 0;
	let excluded = 0;
	for (const node of topNodes) {
		const classification = classifyGraphPacketPath(node.path ?? '');
		if (classification.kind === 'excluded') {
			excluded++;
			continue;
		}
		const packetKey = lookupPacketKey(resolved, node.path);
		if (!packetKey) {
			unresolved++;
			continue;
		}
		const existing = byPacketKey.get(packetKey);
		if (!existing || node.kcoreValue > existing.score) {
			byPacketKey.set(packetKey, { score: node.kcoreValue });
		}
	}

	const metricRows: GraphMetricResult[] = [];
	for (const [packetKey, { score }] of byPacketKey) {
		metricRows.push(
			GraphMetricResultSchema.parse({
				runId,
				packetKey,
				symbolVersionId: null,
				metricName: 'kcore',
				metricValue: score,
				graphRevision,
				algorithmRevision: ALGORITHM_REVISION,
				createdAt,
			}),
		);
	}

	const client = await db.connect();
	try {
		await client.query('BEGIN');

		await client.query(
			`INSERT INTO graph_analysis_runs (
				run_id, algorithm, algorithm_revision, parameter_revision, workspace_revision,
				source_revision, started_at, completed_at, status, parameters, metrics,
				backend_preference, backend_actual, gpu_accelerated, sidecar_url,
				input_hash, output_hash, graph_revision, projection_revision, projection_name,
				node_count, relationship_count
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
			[
				run.runId, run.algorithm, run.algorithmRevision, run.parameterRevision, run.workspaceRevision,
				run.sourceRevision, run.startedAt, run.completedAt, run.status,
				JSON.stringify(run.parameters), JSON.stringify(run.metrics),
				run.backendPreference, run.backendActual, run.gpuAccelerated, run.sidecarUrl,
				run.inputHash, run.outputHash, run.graphRevision, run.projectionRevision, run.projectionName,
				run.nodeCount, run.relationshipCount,
			],
		);

		const BATCH_SIZE = 3000;
		for (let offset = 0; offset < metricRows.length; offset += BATCH_SIZE) {
			const batch = metricRows.slice(offset, offset + BATCH_SIZE);
			const values: string[] = [];
			const params: unknown[] = [];
			batch.forEach((m, i) => {
				const base = i * 7;
				values.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7})`);
				params.push(m.runId, m.packetKey, m.symbolVersionId, m.metricName, m.metricValue, m.graphRevision, m.algorithmRevision);
			});
			await client.query(
				`INSERT INTO graph_node_metrics
					(run_id, packet_key, symbol_version_id, metric_name, metric_value, graph_revision, algorithm_revision)
				 VALUES ${values.join(',')}`,
				params,
			);
		}

		await client.query('COMMIT');
	} catch (err) {
		await client.query('ROLLBACK');
		throw err;
	} finally {
		client.release();
	}

	return { run, metricsWritten: metricRows.length, unresolvedPacketKeys: unresolved, excludedPacketKeys: excluded };
}
