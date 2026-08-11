/**
 * cheirank-analysis-adapter.ts — Graph Analysis Run/Promotion Contract, Patch F.
 *
 * CheiRank(A, B) = PageRank(B, A) — PageRank run against the reversed graph
 * (README.md point 6). Reuses the exact same GDS mutate/read primitives as
 * pagerank-analysis-adapter.ts, against a separately-named REVERSE-oriented
 * projection, rather than a parallel CheiRank engine. Writes
 * metric_name='cheirank' rows into graph_node_metrics under a distinct
 * algorithmRevision, so pagerank and cheirank scores for the same packet_key
 * coexist without collision (graph_node_metrics' PK is
 * (run_id, packet_key, metric_name), and a single run_id belongs to one
 * algorithm — see graph_analysis_runs.algorithm — so a single run never
 * writes both metric names; separate PageRank and CheiRank runs both
 * targeting the same packet_key is the normal, expected case this supports).
 *
 * UNDIRECTED relationship types (BELONGS_TO_CLUSTER, SIMILAR_TOPOLOGY,
 * HAS_CENTROID, BELONGS_TO_FEATURE) are unaffected by the reversal — see
 * neo4j-gds-client.ts::ensureProjectionClient's orientationOverride docstring.
 * This means CheiRank vs PageRank only actually differs where the live
 * projection has directed edges (IMPORTS, CALLS) — verified live 2026-08-09
 * that both exist with real counts (3,452 / 59,699 respectively) in the
 * default 'codeTopology' projection, so reversal is not a no-op here.
 *
 * Deliberately reuses graph-packet-key-resolver.ts's identity join and the
 * transactional-write-with-batched-INSERT pattern from
 * pagerank-analysis-adapter.ts verbatim — see that file's docstring for the
 * duplicate-key and Postgres bound-parameter bugs already found and fixed
 * there, which this adapter inherits fixes for by construction, not by
 * re-deriving them.
 */

import type { Pool } from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import {
	ensureProjectionClient,
	runPageRankClient,
	getTopPageRankClient,
	PROJECTION_NAME,
} from './neo4j-gds-client.js';
import {
	GraphAnalysisRunSchema,
	GraphMetricResultSchema,
	type GraphAnalysisRun,
	type GraphMetricResult,
} from './graph-analysis-types.js';
import { classifyGraphPacketPath, resolveCodebaseFilePacketKeys, lookupPacketKey } from './graph-packet-key-resolver.js';

const ALGORITHM_REVISION = 'neo4j-gds-cheirank-reverse-pagerank-mutate-v1';
const PARAMETER_REVISION_PREFIX = 'maxIter-damping';
const DEFAULT_WORKSPACE_REVISION = 'workspace:parent-atlas';
/** Distinct GDS graph catalog name — REVERSE orientation cannot be applied in-place to PROJECTION_NAME. */
const REVERSE_PROJECTION_NAME = `${PROJECTION_NAME}_reverse`;

export interface CheiRankAnalysisOptions {
	maxIterations?: number;
	dampingFactor?: number;
	limit?: number;
}

export interface CheiRankAnalysisResult {
	run: GraphAnalysisRun;
	metricsWritten: number;
	unresolvedPacketKeys: number;
	excludedPacketKeys: number;
}

export async function runCheiRankAnalysis(
	db: Pool,
	options: CheiRankAnalysisOptions = {},
): Promise<CheiRankAnalysisResult> {
	const { maxIterations = 20, dampingFactor = 0.85, limit = 200_000 } = options;

	const projection = await ensureProjectionClient(REVERSE_PROJECTION_NAME, false, undefined, 'REVERSE');
	const startedAt = new Date().toISOString();
	const inputHash = createHash('sha256')
		.update(JSON.stringify({
			algorithm: 'cheirank',
			projectionName: REVERSE_PROJECTION_NAME,
			orientation: 'REVERSE',
			maxIterations,
			dampingFactor,
			limit,
		}))
		.digest('hex');

	// Reuses runPageRankClient/getTopPageRankClient verbatim — CheiRank IS
	// PageRank, just against a reversed projection. No separate GDS procedure
	// exists or is needed (README.md point 6: "reuses PageRank infrastructure").
	await runPageRankClient(REVERSE_PROJECTION_NAME, { maxIterations, dampingFactor });
	const topNodes = await getTopPageRankClient(limit, 'CodebaseFile', 'pageRankScore');

	const completedAt = new Date().toISOString();
	const runId = randomUUID();
	const graphRevision = createHash('sha256')
		.update(`${REVERSE_PROJECTION_NAME}:${projection.nodeCount}:${projection.relationshipCount}`)
		.digest('hex');
	const outputHash = createHash('sha256')
		.update(JSON.stringify(topNodes.map((n) => ({
			stableKey: n.stableKey,
			path: n.path ?? null,
			graphPageRank: n.graphPageRank,
		}))))
		.digest('hex');

	const run: GraphAnalysisRun = GraphAnalysisRunSchema.parse({
		runId,
		algorithm: 'cheirank',
		algorithmRevision: ALGORITHM_REVISION,
		parameterRevision: `${PARAMETER_REVISION_PREFIX}-${maxIterations}-${dampingFactor}`,
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
		projectionName: REVERSE_PROJECTION_NAME,
		nodeCount: projection.nodeCount,
		relationshipCount: projection.relationshipCount,
		startedAt,
		completedAt,
		status: 'succeeded',
		parameters: { maxIterations, dampingFactor, mutateProperty: 'pageRankScore', orientation: 'REVERSE' },
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
		if (!existing || node.graphPageRank > existing.score) {
			byPacketKey.set(packetKey, { score: node.graphPageRank });
		}
	}

	const metricRows: GraphMetricResult[] = [];
	for (const [packetKey, { score }] of byPacketKey) {
		metricRows.push(
			GraphMetricResultSchema.parse({
				runId,
				packetKey,
				symbolVersionId: null,
				metricName: 'cheirank',
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

		// Same 65,535-bound-parameter batching discipline as pagerank-analysis-adapter.ts.
		const BATCH_SIZE = 3000;
		for (let offset = 0; offset < metricRows.length; offset += BATCH_SIZE) {
			const batch = metricRows.slice(offset, offset + BATCH_SIZE);
			const values: string[] = [];
			const params: unknown[] = [];
			batch.forEach((m, i) => {
				const base = i * 7;
				values.push(
					`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7})`,
				);
				params.push(
					m.runId,
					m.packetKey,
					m.symbolVersionId,
					m.metricName,
					m.metricValue,
					m.graphRevision,
					m.algorithmRevision,
				);
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
