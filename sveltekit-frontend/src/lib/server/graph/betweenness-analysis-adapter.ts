/**
 * betweenness-analysis-adapter.ts — Graph Analysis Run/Promotion Contract, Patch H.
 *
 * Betweenness centrality is now the live Patch H adapter. It reuses the
 * existing Neo4j GDS named-graph projection and the same Postgres run +
 * metric persistence shape as the earlier graph analyses. The only new
 * contract detail is explicit exact-vs-sampled revisioning:
 * - exact: no samplingSize supplied
 * - sampled: samplingSize + samplingSeed supplied
 *
 * This keeps approximate runs analytically distinct from exact runs rather
 * than silently collapsing them into the same revision.
 */

import type { Pool } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import neo4j from 'neo4j-driver';
import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';
import { ensureProjectionClient } from './neo4j-gds-client.js';
import { NAMED_PROJECTION_CANDIDATES } from './graph-projection-manifest.js';
import {
	GraphAnalysisRunSchema,
	GraphMetricResultSchema,
	type GraphAnalysisRun,
	type GraphMetricResult,
} from './graph-analysis-types.js';
import { classifyGraphPacketPath, resolveCodebaseFilePacketKeys, lookupPacketKey } from './graph-packet-key-resolver.js';

const DEFAULT_WORKSPACE_REVISION = 'workspace:parent-atlas';
const MUTATE_PROPERTY = 'betweennessScore';
// Betweenness, like k-core, needs an all-UNDIRECTED projection. The shared
// `codeTopology` projection mixes NATURAL + UNDIRECTED relationships and GDS
// rejects that shape for betweenness. Reuse the already-proven feature
// projection rather than inventing another near-duplicate graph.
const BETWEENNESS_PROJECTION_NAME = 'atlas_feature_v1';
const BETWEENNESS_RELATIONSHIP_TYPES = NAMED_PROJECTION_CANDIDATES.atlas_feature_v1;

export interface BetweennessAnalysisOptions {
	limit?: number;
	samplingSize?: number;
	samplingSeed?: number;
}

export interface BetweennessAnalysisResult {
	run: GraphAnalysisRun;
	metricsWritten: number;
	unresolvedPacketKeys: number;
	excludedPacketKeys: number;
}

function buildAlgorithmRevision(options: BetweennessAnalysisOptions): string {
	if (typeof options.samplingSize === 'number' && Number.isFinite(options.samplingSize) && options.samplingSize > 0) {
		const seed = typeof options.samplingSeed === 'number' && Number.isFinite(options.samplingSeed)
			? Math.trunc(options.samplingSeed)
			: 0;
		return `neo4j-gds-betweenness-approx-k${Math.trunc(options.samplingSize)}-seed${seed}-v1`;
	}
	return 'neo4j-gds-betweenness-exact-v1';
}

function buildParameterRevision(options: BetweennessAnalysisOptions): string {
	if (typeof options.samplingSize === 'number' && Number.isFinite(options.samplingSize) && options.samplingSize > 0) {
		const seed = typeof options.samplingSeed === 'number' && Number.isFinite(options.samplingSeed)
			? Math.trunc(options.samplingSeed)
			: 0;
		return `betweenness-approx-k${Math.trunc(options.samplingSize)}-seed${seed}-v1`;
	}
	return 'betweenness-exact-v1';
}

export async function runBetweennessAnalysis(
	db: Pool,
	options: BetweennessAnalysisOptions = {},
): Promise<BetweennessAnalysisResult> {
	const { limit = 200_000 } = options;
	const projection = await ensureProjectionClient(BETWEENNESS_PROJECTION_NAME, false, BETWEENNESS_RELATIONSHIP_TYPES);
	const startedAt = new Date().toISOString();
	const algorithmRevision = buildAlgorithmRevision(options);
	const parameterRevision = buildParameterRevision(options);
	const inputHash = createHash('sha256')
		.update(JSON.stringify({
			algorithm: 'betweenness',
			projectionName: BETWEENNESS_PROJECTION_NAME,
			limit,
			samplingSize: typeof options.samplingSize === 'number' ? Math.trunc(options.samplingSize) : null,
			samplingSeed: typeof options.samplingSeed === 'number' ? Math.trunc(options.samplingSeed) : null,
		}))
		.digest('hex');

	const neo4jSession = getNeo4jDriver().session();
	let topNodes: Array<{ path: string | undefined; betweennessScore: number }>;
	try {
		await neo4jSession
			.run(`CALL gds.graph.nodeProperties.drop($name, [$prop]) YIELD propertiesRemoved RETURN propertiesRemoved`, {
				name: BETWEENNESS_PROJECTION_NAME,
				prop: MUTATE_PROPERTY,
			})
			.catch(() => { /* property didn't exist yet — fine */ });

		const configuration: Record<string, unknown> = {
			mutateProperty: MUTATE_PROPERTY,
			// Neo4j GDS requires Long (not Double) for these integer config
			// fields — plain JS numbers serialize as Double over bolt and GDS
			// rejects them ("must be of type Long but was Double"). Found live
			// 2026-08-09: this adapter had never actually been run before this
			// fix — it looked complete but failed on its first real invocation.
			concurrency: neo4j.int(4),
		};
		if (typeof options.samplingSize === 'number' && Number.isFinite(options.samplingSize) && options.samplingSize > 0) {
			configuration.samplingSize = neo4j.int(Math.trunc(options.samplingSize));
			configuration.samplingSeed = neo4j.int(
				typeof options.samplingSeed === 'number' && Number.isFinite(options.samplingSeed)
					? Math.trunc(options.samplingSeed)
					: 0,
			);
		}

		await neo4jSession.run(
			`CALL gds.betweenness.mutate($name, $config)`,
			{ name: BETWEENNESS_PROJECTION_NAME, config: configuration },
		);

		await neo4jSession.run(
			`CALL gds.graph.nodeProperties.write($name, [$prop]) YIELD propertiesWritten RETURN propertiesWritten`,
			{ name: BETWEENNESS_PROJECTION_NAME, prop: MUTATE_PROPERTY },
		);

		const result = await neo4jSession.run(
			`
			MATCH (n:CodebaseFile)
			WHERE n[$prop] IS NOT NULL AND n.path IS NOT NULL
			RETURN n.path AS path, n[$prop] AS betweennessScore
			ORDER BY n[$prop] DESC
			LIMIT $limit
			`,
			{ prop: MUTATE_PROPERTY, limit: neo4j.int(Math.trunc(limit)) },
		);
		topNodes = result.records.map((record) => ({
			path: String(record.get('path') ?? ''),
			betweennessScore: Number(record.get('betweennessScore')),
		}));
	} finally {
		await neo4jSession.close().catch(() => {});
	}

	const completedAt = new Date().toISOString();
	const runId = randomUUID();
	const graphRevision = createHash('sha256')
		.update(`${BETWEENNESS_PROJECTION_NAME}:${projection.nodeCount}:${projection.relationshipCount}`)
		.digest('hex');
	const outputHash = createHash('sha256')
		.update(JSON.stringify(topNodes.map((n) => ({ path: n.path ?? null, betweennessScore: n.betweennessScore }))))
		.digest('hex');

	const run: GraphAnalysisRun = GraphAnalysisRunSchema.parse({
		runId,
		algorithm: 'betweenness',
		algorithmRevision,
		parameterRevision,
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
		projectionName: BETWEENNESS_PROJECTION_NAME,
		nodeCount: projection.nodeCount,
		relationshipCount: projection.relationshipCount,
		startedAt,
		completedAt,
		status: 'succeeded',
		parameters: {
			mutateProperty: MUTATE_PROPERTY,
			concurrency: 4,
			samplingSize: typeof options.samplingSize === 'number' && Number.isFinite(options.samplingSize) && options.samplingSize > 0
				? Math.trunc(options.samplingSize)
				: null,
			samplingSeed: typeof options.samplingSeed === 'number' && Number.isFinite(options.samplingSeed)
				? Math.trunc(options.samplingSeed)
				: null,
		},
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
		if (!existing || node.betweennessScore > existing.score) {
			byPacketKey.set(packetKey, { score: node.betweennessScore });
		}
	}

	const metricRows: GraphMetricResult[] = [];
	for (const [packetKey, { score }] of byPacketKey) {
		metricRows.push(
			GraphMetricResultSchema.parse({
				runId,
				packetKey,
				symbolVersionId: null,
				metricName: 'betweenness',
				metricValue: score,
				graphRevision,
				algorithmRevision,
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
				run.runId,
				run.algorithm,
				run.algorithmRevision,
				run.parameterRevision,
				run.workspaceRevision,
				run.sourceRevision,
				run.startedAt,
				run.completedAt,
				run.status,
				JSON.stringify(run.parameters),
				JSON.stringify(run.metrics),
				run.backendPreference,
				run.backendActual,
				run.gpuAccelerated,
				run.sidecarUrl,
				run.inputHash,
				run.outputHash,
				run.graphRevision,
				run.projectionRevision,
				run.projectionName,
				run.nodeCount,
				run.relationshipCount,
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
