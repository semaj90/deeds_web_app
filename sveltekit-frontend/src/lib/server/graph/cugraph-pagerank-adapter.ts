/**
 * cugraph-pagerank-adapter.ts — bounded cuGraph/RAPIDS PageRank challenger.
 *
 * This adapter is a second BACKEND under one PageRank capability, not a
 * competing identity owner. The current /v1/graph/pagerank endpoint returns a
 * bounded result set (<=512 rows), so those rows MUST NOT be persisted under
 * the promoted `pagerank` metric name. Full-vector promotion is a separate
 * artifact/parity gate.
 */

import type { Pool } from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import { createAtlasRapidsPageRankClient, type AtlasPageRankResultV1, type AtlasGraphResidentStatusV1 } from '$lib/server/atlas/graph/atlas-rapids-pagerank-client.js';
import {
	GraphAnalysisRunSchema,
	GraphMetricResultSchema,
	type GraphAnalysisRun,
	type GraphMetricResult,
} from './graph-analysis-types.js';
import { graphAlgorithmRevision } from './graph-algorithm-revision.js';

const ALGORITHM_REVISION = graphAlgorithmRevision('pagerank');
const PARAMETER_REVISION_PREFIX = 'cugraph-maxIter-alpha';
const DEFAULT_WORKSPACE_REVISION = 'workspace:parent-atlas';
const BOUNDED_SHADOW_METRIC_NAME = 'pagerank_cugraph_shadow';
const BOUNDED_SELECTION_MODE = 'TOP_K_SHADOW';

export interface CuGraphPageRankAnalysisOptions {
	maxIterations?: number;
	dampingFactor?: number;
	limit?: number;
	sidecarUrl?: string | null;
}

export interface CuGraphPageRankAnalysisResult {
	run: GraphAnalysisRun;
	metricsWritten: number;
	unresolvedPacketKeys: number;
	excludedPacketKeys: number;
	skippedReason?: string;
}

async function buildSkippedResult(
	reason: string,
	graphRevision: string,
	nodeCount: number,
	edgeCount: number,
	sidecarUrl: string | null,
): Promise<CuGraphPageRankAnalysisResult> {
	const startedAt = new Date().toISOString();
	const run: GraphAnalysisRun = GraphAnalysisRunSchema.parse({
		runId: randomUUID(),
		algorithm: 'pagerank',
		algorithmRevision: ALGORITHM_REVISION,
		parameterRevision: `${PARAMETER_REVISION_PREFIX}-skipped`,
		workspaceRevision: DEFAULT_WORKSPACE_REVISION,
		sourceRevision: graphRevision,
		backendPreference: 'gpu-sidecar',
		backendActual: 'gpu-sidecar',
		gpuAccelerated: false,
		sidecarUrl,
		inputHash: null,
		outputHash: null,
		graphRevision,
		projectionRevision: graphRevision,
		projectionName: 'cugraph-resident',
		nodeCount,
		relationshipCount: edgeCount,
		startedAt,
		completedAt: new Date().toISOString(),
		status: 'succeeded',
		parameters: { reason, selectionMode: BOUNDED_SELECTION_MODE, canonicalMetricEligible: false },
		metrics: { skipped: true, reason, metricName: BOUNDED_SHADOW_METRIC_NAME },
	});
	return { run, metricsWritten: 0, unresolvedPacketKeys: 0, excludedPacketKeys: 0, skippedReason: reason };
}

export async function runCuGraphPageRankAnalysis(
	db: Pool,
	options: CuGraphPageRankAnalysisOptions = {},
): Promise<CuGraphPageRankAnalysisResult> {
	const { maxIterations = 100, dampingFactor = 0.85, limit = 128, sidecarUrl = null } = options;
	const client = createAtlasRapidsPageRankClient(sidecarUrl ?? undefined);

	let residentStatus: AtlasGraphResidentStatusV1;
	try {
		residentStatus = await client.resident();
	} catch (err) {
		return buildSkippedResult(
			`ATLAS_RAPIDS_GRAPH_SIDECAR_UNREACHABLE:${err instanceof Error ? err.message : String(err)}`,
			'unknown',
			0,
			0,
			sidecarUrl,
		);
	}

	if (!residentStatus.resident) {
		return buildSkippedResult(
			'ATLAS_RAPIDS_GRAPH_NOT_RESIDENT: no graph projection loaded in the atlas-gpu-8098 sidecar — call POST /v1/graph/load with a reviewed GRAPH_SNAPSHOT_PARITY artifact first; this adapter does not auto-load one',
			'unknown',
			0,
			0,
			sidecarUrl,
		);
	}

	const { graphRevision, nodeCount, edgeCount } = residentStatus.resident;
	const startedAt = new Date().toISOString();
	const inputHash = createHash('sha256')
		.update(JSON.stringify({ algorithm: 'pagerank', backend: 'cugraph-rapids', graphRevision, maxIterations, dampingFactor, limit, selectionMode: BOUNDED_SELECTION_MODE }))
		.digest('hex');

	const receipt = await client.pagerank({
		graphRevision,
		topK: limit,
		alpha: dampingFactor,
		maxIter: maxIterations,
	});

	const completedAt = new Date().toISOString();
	const runId = randomUUID();
	const outputHash = createHash('sha256')
		.update(JSON.stringify(receipt.results.map((r) => ({ nodeKey: r.nodeKey, packetKey: r.packetKey, score: r.score }))))
		.digest('hex');

	const run: GraphAnalysisRun = GraphAnalysisRunSchema.parse({
		runId,
		algorithm: 'pagerank',
		algorithmRevision: ALGORITHM_REVISION,
		parameterRevision: `${PARAMETER_REVISION_PREFIX}-${maxIterations}-${dampingFactor}`,
		workspaceRevision: DEFAULT_WORKSPACE_REVISION,
		sourceRevision: graphRevision,
		backendPreference: 'gpu-sidecar',
		backendActual: 'gpu-sidecar',
		gpuAccelerated: true,
		sidecarUrl: sidecarUrl ?? (process.env.ATLAS_RAPIDS_SIDECAR_URL ?? 'http://127.0.0.1:8098'),
		inputHash,
		outputHash,
		graphRevision,
		projectionRevision: receipt.projectionRevision,
		projectionName: 'cugraph-resident',
		nodeCount,
		relationshipCount: edgeCount,
		startedAt,
		completedAt,
		status: 'succeeded',
		parameters: {
			maxIterations,
			dampingFactor,
			topK: limit,
			selectionMode: BOUNDED_SELECTION_MODE,
			canonicalMetricEligible: false,
			metricName: BOUNDED_SHADOW_METRIC_NAME,
		},
		metrics: {
			topNodesReturned: receipt.results.length,
			didConverge: receipt.didConverge,
			cacheHit: receipt.cacheHit,
			promotionState: 'CHALLENGER_SHADOW',
		},
	});

	// packetKey collapse is intentionally downstream of the graph executor. This
	// bounded path is useful for shadow analysis only and cannot establish full
	// node coverage or canonical PageRank authority.
	const byPacketKey = new Map<string, { score: number }>();
	let unresolved = 0;
	for (const node of receipt.results as AtlasPageRankResultV1[]) {
		if (!node.packetKey) {
			unresolved++;
			continue;
		}
		const existing = byPacketKey.get(node.packetKey);
		if (!existing || node.score > existing.score) {
			byPacketKey.set(node.packetKey, { score: node.score });
		}
	}

	const metricRows: GraphMetricResult[] = [];
	const createdAt = new Date().toISOString();
	for (const [packetKey, { score }] of byPacketKey) {
		metricRows.push(
			GraphMetricResultSchema.parse({
				runId,
				packetKey,
				symbolVersionId: null,
				metricName: BOUNDED_SHADOW_METRIC_NAME,
				metricValue: score,
				graphRevision,
				algorithmRevision: ALGORITHM_REVISION,
				createdAt,
			}),
		);
	}

	const pgClient = await db.connect();
	try {
		await pgClient.query('BEGIN');

		await pgClient.query(
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
			if (batch.length === 0) continue;
			const values: string[] = [];
			const params: unknown[] = [];
			batch.forEach((m, i) => {
				const base = i * 7;
				values.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7})`);
				params.push(m.runId, m.packetKey, m.symbolVersionId, m.metricName, m.metricValue, m.graphRevision, m.algorithmRevision);
			});
			await pgClient.query(
				`INSERT INTO graph_node_metrics
					(run_id, packet_key, symbol_version_id, metric_name, metric_value, graph_revision, algorithm_revision)
				 VALUES ${values.join(',')}`,
				params,
			);
		}

		await pgClient.query('COMMIT');
	} catch (err) {
		await pgClient.query('ROLLBACK');
		throw err;
	} finally {
		pgClient.release();
	}

	return { run, metricsWritten: metricRows.length, unresolvedPacketKeys: unresolved, excludedPacketKeys: 0 };
}
